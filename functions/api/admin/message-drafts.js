// functions/api/admin/message-drafts.js (v4 - Fix Sorting, No Google Sheets)

// --- 固定草稿的 ID 和標題 ---
const FIXED_DRAFT_IDS = {
    POLICY: 1, // 入住須知編輯欄
    AUTO_CONFIRMATION: 2 // 入住自動發送的通知
};
const FIXED_DRAFT_TITLES = {
    [FIXED_DRAFT_IDS.POLICY]: "入住須知編輯欄",
    [FIXED_DRAFT_IDS.AUTO_CONFIRMATION]: "入住自動發送的通知"
};

// --- 預設內容 ---
const DEFAULT_POLICY_CONTENT = JSON.stringify({
    cancellationPolicy: "請在此編輯取消政策...\n例如：\n- 入住日 7 天前取消，全額退款。\n- 入住日 7 天內取消，收取第一晚費用。\n- 未入住，收取全額費用。",
    checkInInstructions: "請在此編輯入住須知...\n例如：\n- 入住時間：15:00 ~ 20:00\n- 退房時間：07:00 ~ 10:00\n- 請出示身份證件登記。\n- 室內禁止吸菸。"
});
const DEFAULT_AUTO_CONFIRMATION_CONTENT = "感謝您的預訂！\n\n您的訂房資訊如下：\n入住日期：{{startDate}}\n退房日期：{{endDate}}\n房型：{{roomSummary}}\n總金額：{{totalAmount}}\n\n期待您的光臨！";

export async function onRequest(context) {
    const { request, env } = context;
    const db = env.DB;

    try {
        // --- GET 請求 (讀取草稿 - 修正排序) ---
        if (request.method === 'GET') {
            // 先查詢所有非固定草稿，按 ID 排序
            const { results: regularDrafts } = await db.prepare(
                "SELECT * FROM MessageDrafts WHERE draft_id NOT IN (?, ?) ORDER BY draft_id ASC"
            ).bind(FIXED_DRAFT_IDS.POLICY, FIXED_DRAFT_IDS.AUTO_CONFIRMATION).all();

            // 再單獨查詢固定草稿
            const { results: fixedDraftsDb } = await db.prepare(
                "SELECT * FROM MessageDrafts WHERE draft_id IN (?, ?)"
            ).bind(FIXED_DRAFT_IDS.POLICY, FIXED_DRAFT_IDS.AUTO_CONFIRMATION).all();

            const finalDrafts = []; // 最終要回傳的陣列

            // 處理固定草稿 1 (政策)
            let policyDraft = fixedDraftsDb?.find(d => d.draft_id === FIXED_DRAFT_IDS.POLICY);
            if (!policyDraft) {
                policyDraft = {
                    draft_id: FIXED_DRAFT_IDS.POLICY,
                    title: FIXED_DRAFT_TITLES[FIXED_DRAFT_IDS.POLICY],
                    content: DEFAULT_POLICY_CONTENT,
                    is_dynamic_default: true // 標記這是動態生成的預設值
                };
            }
            policyDraft.is_fixed = true;
            policyDraft.title = FIXED_DRAFT_TITLES[FIXED_DRAFT_IDS.POLICY]; // 確保標題正確
            finalDrafts.push(policyDraft);

            // 處理固定草稿 2 (自動通知)
            let autoConfirmDraft = fixedDraftsDb?.find(d => d.draft_id === FIXED_DRAFT_IDS.AUTO_CONFIRMATION);
            if (!autoConfirmDraft) {
                autoConfirmDraft = {
                    draft_id: FIXED_DRAFT_IDS.AUTO_CONFIRMATION,
                    title: FIXED_DRAFT_TITLES[FIXED_DRAFT_IDS.AUTO_CONFIRMATION],
                    content: DEFAULT_AUTO_CONFIRMATION_CONTENT,
                    is_dynamic_default: true
                };
            }
            autoConfirmDraft.is_fixed = true;
            autoConfirmDraft.title = FIXED_DRAFT_TITLES[FIXED_DRAFT_IDS.AUTO_CONFIRMATION]; // 確保標題正確
            finalDrafts.push(autoConfirmDraft);

            // 將一般草稿附加到後面
            if (regularDrafts) {
                finalDrafts.push(...regularDrafts.map(d => ({ ...d, is_fixed: false }))); // 確保一般草稿 is_fixed 為 false
            }

            return new Response(JSON.stringify(finalDrafts), {
                status: 200, headers: { 'Content-Type': 'application/json' }
            });
        }

        // --- POST, PUT, DELETE 請求 (保持不變) ---
        // (省略 POST, PUT, DELETE 的程式碼，與上一版相同)
        // --- POST 請求 (新增一般草稿) ---
        if (request.method === 'POST') {
            const { title, content } = await request.json();
            // --- 驗證 ---
            if (!title || typeof title !== 'string' || title.trim().length === 0 || title.length > 100) {
                 return new Response(JSON.stringify({ error: '標題為必填，且長度不可超過 100 字。' }), { status: 400 });
            }
            if (FIXED_DRAFT_TITLES[FIXED_DRAFT_IDS.POLICY] === title || FIXED_DRAFT_TITLES[FIXED_DRAFT_IDS.AUTO_CONFIRMATION] === title) {
                 return new Response(JSON.stringify({ error: '不能使用保留的草稿標題。' }), { status: 400 });
            }
            if (!content || typeof content !== 'string' || content.trim().length === 0 || content.length > 5000) { // 增加內容長度限制
                return new Response(JSON.stringify({ error: '內容為必填，且長度不可超過 5000 字。' }), { status: 400 });
            }

            const result = await db.prepare("INSERT INTO MessageDrafts (title, content) VALUES (?, ?) RETURNING *")
                                   .bind(title, content).first();

            return new Response(JSON.stringify(result), { status: 201 });
        }

        // --- PUT 請求 (更新草稿，包含特殊處理) ---
        if (request.method === 'PUT') {
            const body = await request.json();
            const draft_id = Number(body.draft_id);

            // --- 驗證 ID ---
            if (!draft_id || !Number.isInteger(draft_id)) {
                 return new Response(JSON.stringify({ error: '無效的草稿 ID。' }), { status: 400 });
            }

            let title, content;

            // --- 特殊處理：政策草稿 (ID 1) ---
            if (draft_id === FIXED_DRAFT_IDS.POLICY) {
                 title = FIXED_DRAFT_TITLES[FIXED_DRAFT_IDS.POLICY]; // 標題固定
                 const { cancellationPolicy, checkInInstructions } = body;
                 if (cancellationPolicy === undefined || checkInInstructions === undefined) {
                      return new Response(JSON.stringify({ error: '缺少取消政策或入住須知內容。' }), { status: 400 });
                 }
                 // 合併為 JSON 存入 content
                 content = JSON.stringify({ cancellationPolicy, checkInInstructions });
                 if (content.length > 10000) { // 給政策更長的空間
                      return new Response(JSON.stringify({ error: '政策或須知內容過長 (合計上限 10000 字元)。' }), { status: 400 });
                 }
            }
            // --- 一般草稿 (含自動通知草稿 ID 2) 的處理 ---
            else {
                 title = body.title;
                 content = body.content;
                 // --- 驗證 (同 POST, 含固定標題檢查) ---
                 if (!title || typeof title !== 'string' || title.trim().length === 0 || title.length > 100) {
                     return new Response(JSON.stringify({ error: '標題為必填，且長度不可超過 100 字。' }), { status: 400 });
                 }
                 if (draft_id !== FIXED_DRAFT_IDS.AUTO_CONFIRMATION && (FIXED_DRAFT_TITLES[FIXED_DRAFT_IDS.POLICY] === title || FIXED_DRAFT_TITLES[FIXED_DRAFT_IDS.AUTO_CONFIRMATION] === title)) {
                     return new Response(JSON.stringify({ error: '不能使用保留的草稿標題。' }), { status: 400 });
                 }
                 if (draft_id === FIXED_DRAFT_IDS.AUTO_CONFIRMATION && title !== FIXED_DRAFT_TITLES[FIXED_DRAFT_IDS.AUTO_CONFIRMATION]) {
                      return new Response(JSON.stringify({ error: '無法修改此固定草稿的標題。' }), { status: 400 });
                 }

                 if (!content || typeof content !== 'string' || content.trim().length === 0 || content.length > 5000) {
                     return new Response(JSON.stringify({ error: '內容為必填，且長度不可超過 5000 字。' }), { status: 400 });
                 }
            }

            // --- 執行更新 (使用 Upsert) ---
            await db.prepare(
                `INSERT INTO MessageDrafts (draft_id, title, content) VALUES (?, ?, ?)
                 ON CONFLICT(draft_id) DO UPDATE SET title=excluded.title, content=excluded.content`
            ).bind(draft_id, title, content).run();

            return new Response(JSON.stringify({ success: true }), { status: 200 });
        }

        // --- DELETE 請求 (阻止刪除固定草稿) ---
        if (request.method === 'DELETE') {
            const { draft_id } = await request.json();
            // --- 驗證 ID ---
            if (!draft_id || !Number.isInteger(draft_id)) {
                 return new Response(JSON.stringify({ error: '缺少有效的草稿 ID。' }), { status: 400 });
             }
            // --- **阻止刪除固定草稿** ---
            if (draft_id === FIXED_DRAFT_IDS.POLICY || draft_id === FIXED_DRAFT_IDS.AUTO_CONFIRMATION) {
                 return new Response(JSON.stringify({ error: '無法刪除系統保留的草稿。' }), { status: 403 }); // 403 Forbidden
            }

            // --- 執行刪除 ---
            await db.prepare("DELETE FROM MessageDrafts WHERE draft_id = ?").bind(draft_id).run();

            return new Response(JSON.stringify({ success: true }), { status: 200 });
        }


        return new Response('無效的請求方法。', { status: 405 });

    } catch (error) {
        console.error('訊息草稿 API 錯誤:', error);
        return new Response(JSON.stringify({ error: '處理草稿時發生錯誤。', details: error.message }), {
             status: 500,
             headers: { 'Content-Type': 'application/json'}
        });
    }
}