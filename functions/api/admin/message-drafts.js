// functions/api/admin/message-drafts.js

// --- 固定草稿的 ID ---
const FIXED_DRAFT_IDS = {
    POLICY: 1, // 入住須知 (將在列表隱藏，改由店家資訊管理)
    AUTO_CONFIRMATION: 2 
};
// --- 固定草稿的標題 ---
const FIXED_DRAFT_TITLES = {
    [FIXED_DRAFT_IDS.AUTO_CONFIRMATION]: "預訂完成自動發送通知"
};

// --- 預設內容 (自動通知) ---
const DEFAULT_AUTO_CONFIRMATION_CONTENT = "感謝您的預訂！\n\n您的訂房資訊如下：\n入住日期：{{startDate}}\n退房日期：{{endDate}}\n房型：{{roomSummary}}\n總金額：{{totalAmount}}\n\n期待您的光臨！";

export async function onRequest(context) {
    const { request, env } = context;
    const db = env.DB;

    try {
        // --- GET 請求 (讀取草稿) ---
        if (request.method === 'GET') {
            // 1. 查詢一般草稿 (排除 ID 1 和 2)
            const { results: regularDrafts } = await db.prepare(
                "SELECT * FROM MessageDrafts WHERE draft_id NOT IN (?, ?) ORDER BY draft_id ASC"
            ).bind(FIXED_DRAFT_IDS.POLICY, FIXED_DRAFT_IDS.AUTO_CONFIRMATION).all();

            // 2. 只查詢固定草稿 ID 2 (自動通知)，ID 1 已移至店家資訊
            const { results: fixedDraftsDb } = await db.prepare(
                "SELECT * FROM MessageDrafts WHERE draft_id = ?"
            ).bind(FIXED_DRAFT_IDS.AUTO_CONFIRMATION).all();

            const finalDrafts = [];

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
            autoConfirmDraft.title = FIXED_DRAFT_TITLES[FIXED_DRAFT_IDS.AUTO_CONFIRMATION];
            finalDrafts.push(autoConfirmDraft);

            // 附加一般草稿
            if (regularDrafts) {
                finalDrafts.push(...regularDrafts.map(d => ({ ...d, is_fixed: false })));
            }

            return new Response(JSON.stringify(finalDrafts), {
                status: 200, headers: { 'Content-Type': 'application/json' }
            });
        }

        // ... (POST, PUT, DELETE 保持不變，但 PUT/DELETE 中關於 POLICY 的檢查其實已無用武之地，保留也無妨) ...
        // 為節省篇幅，若您需要 PUT/DELETE 的完整代碼請告知，否則請保留原檔其餘部分，
        // 僅需注意 GET 邏輯已變更如上。
        
        // 為了確保完整性，這裡是 PUT 和 DELETE 的部分 (您可以直接覆蓋整個檔案)
        if (request.method === 'POST') {
            const { title, content } = await request.json();
            if (!title || !content) return new Response(JSON.stringify({ error: '標題與內容為必填' }), { status: 400 });
            const result = await db.prepare("INSERT INTO MessageDrafts (title, content) VALUES (?, ?) RETURNING *").bind(title, content).first();
            return new Response(JSON.stringify(result), { status: 201 });
        }

        if (request.method === 'PUT') {
            const body = await request.json();
            const draft_id = Number(body.draft_id);
            if (!draft_id) return new Response(JSON.stringify({ error: '無效 ID' }), { status: 400 });

            // 只保留自動通知的特殊標題檢查
            if (draft_id === FIXED_DRAFT_IDS.AUTO_CONFIRMATION && body.title !== FIXED_DRAFT_TITLES[FIXED_DRAFT_IDS.AUTO_CONFIRMATION]) {
                 return new Response(JSON.stringify({ error: '無法修改此固定草稿的標題。' }), { status: 400 });
            }

            await db.prepare("INSERT INTO MessageDrafts (draft_id, title, content) VALUES (?, ?, ?) ON CONFLICT(draft_id) DO UPDATE SET title=excluded.title, content=excluded.content")
                  .bind(draft_id, body.title, body.content).run();
            return new Response(JSON.stringify({ success: true }), { status: 200, headers: { 'Content-Type': 'application/json' } });
        }

        if (request.method === 'DELETE') {
            const { draft_id } = await request.json();
            // 禁止刪除 ID 1 和 2
            if (draft_id === FIXED_DRAFT_IDS.POLICY || draft_id === FIXED_DRAFT_IDS.AUTO_CONFIRMATION) {
                 return new Response(JSON.stringify({ error: '無法刪除系統保留的草稿。' }), { status: 403 });
            }
            await db.prepare("DELETE FROM MessageDrafts WHERE draft_id = ?").bind(draft_id).run();
            return new Response(JSON.stringify({ success: true }), { status: 200 });
        }

        return new Response('Method not allowed', { status: 405 });

    } catch (error) {
        console.error('API Error:', error);
        return new Response(JSON.stringify({ error: error.message }), { status: 500 });
    }
}