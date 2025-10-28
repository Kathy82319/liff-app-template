// functions/api/admin/message-drafts.js
import { GoogleSpreadsheet } from 'google-spreadsheet';
import * as jose from 'jose';
// --- 新增：固定草稿的 ID ---
const FIXED_DRAFT_IDS = {
    POLICY: 1,
    AUTO_CONFIRMATION: 2
};
const FIXED_DRAFT_TITLES = {
    [FIXED_DRAFT_IDS.POLICY]: "入住須知編輯欄",
    [FIXED_DRAFT_IDS.AUTO_CONFIRMATION]: "入住自動發送的通知"
};

export async function onRequest(context) {
    const { request, env } = context;
    const db = env.DB;
    const DRAFTS_SHEET_NAME = 'MessageDrafts'; // 確保您的 Sheet 名稱正確

    try {
        // --- GET 請求 ---
        if (request.method === 'GET') {
            const { results } = await db.prepare("SELECT * FROM MessageDrafts ORDER BY created_at DESC").all();
            const drafts = results || [];

            // 確保固定草稿存在於回傳結果中
            for (const id in FIXED_DRAFT_IDS) {
                const draftId = FIXED_DRAFT_IDS[id];
                if (!drafts.some(d => d.draft_id === draftId)) {
                    // 如果資料庫中缺少，動態加入預設值 (但不真的寫入 DB，避免重複)
                     let defaultContent = '';
                     if (draftId === FIXED_DRAFT_IDS.POLICY) {
                         defaultContent = JSON.stringify({ cancellationPolicy: "請在此編輯取消政策...", checkInInstructions: "請在此編輯入住須知..." });
                     } else {
                         defaultContent = "感謝您的預訂！...";
                     }
                    drafts.unshift({ // 加到最前面
                         draft_id: draftId,
                         title: FIXED_DRAFT_TITLES[draftId],
                         content: defaultContent,
                         created_at: new Date(0).toISOString(), // 給一個最早的時間戳
                         is_fixed: true // 標記為固定的
                    });
                } else {
                    // 標記已存在的固定草稿
                     const existingDraft = drafts.find(d => d.draft_id === draftId);
                     if(existingDraft) existingDraft.is_fixed = true;
                }
            }

            return new Response(JSON.stringify(drafts), {
                status: 200, headers: { 'Content-Type': 'application/json' }
            });
        }

        // --- POST 請求 (新增一般草稿) ---
        if (request.method === 'POST') {
            const { title, content } = await request.json();
            // --- 驗證 (同前) ---
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

            // 背景同步 Google Sheet (保持不變)
            context.waitUntil(
                getSheet(env, DRAFTS_SHEET_NAME)
                    .then(sheet => sheet.addRow({ ...result, is_fixed: false })) // 同步時加入 is_fixed 標記
                    .catch(err => console.error(`背景同步新增草稿失敗 (ID: ${result.draft_id}):`, err))
            );

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

            // --- 特殊處理：政策草稿 ---
            if (draft_id === FIXED_DRAFT_IDS.POLICY) {
                 title = FIXED_DRAFT_TITLES[FIXED_DRAFT_IDS.POLICY]; // 標題固定
                 const { cancellationPolicy, checkInInstructions } = body;
                 if (cancellationPolicy === undefined || checkInInstructions === undefined) {
                      return new Response(JSON.stringify({ error: '缺少取消政策或入住須知內容。' }), { status: 400 });
                 }
                 // **將兩個欄位合併為 JSON 存入 content**
                 content = JSON.stringify({ cancellationPolicy, checkInInstructions });
                 // 驗證合併後的 JSON 長度
                 if (content.length > 10000) { // 給政策更長的空間
                      return new Response(JSON.stringify({ error: '政策或須知內容過長 (合計上限 10000 字元)。' }), { status: 400 });
                 }
            }
            // --- 一般草稿 (含自動通知草稿) 的處理 ---
            else {
                 title = body.title;
                 content = body.content;
                 // --- 驗證 (同 POST) ---
                 if (!title || typeof title !== 'string' || title.trim().length === 0 || title.length > 100) {
                     return new Response(JSON.stringify({ error: '標題為必填，且長度不可超過 100 字。' }), { status: 400 });
                 }
                 // 防止將一般草稿標題改成固定標題
                 if (draft_id !== FIXED_DRAFT_IDS.AUTO_CONFIRMATION && (FIXED_DRAFT_TITLES[FIXED_DRAFT_IDS.POLICY] === title || FIXED_DRAFT_TITLES[FIXED_DRAFT_IDS.AUTO_CONFIRMATION] === title)) {
                     return new Response(JSON.stringify({ error: '不能使用保留的草稿標題。' }), { status: 400 });
                 }
                 // 固定草稿標題不可改
                 if (draft_id === FIXED_DRAFT_IDS.AUTO_CONFIRMATION && title !== FIXED_DRAFT_TITLES[FIXED_DRAFT_IDS.AUTO_CONFIRMATION]) {
                      return new Response(JSON.stringify({ error: '無法修改此固定草稿的標題。' }), { status: 400 });
                 }

                 if (!content || typeof content !== 'string' || content.trim().length === 0 || content.length > 5000) {
                     return new Response(JSON.stringify({ error: '內容為必填，且長度不可超過 5000 字。' }), { status: 400 });
                 }
            }


            // --- 執行更新 ---
            await db.prepare("INSERT INTO MessageDrafts (draft_id, title, content) VALUES (?, ?, ?) ON CONFLICT(draft_id) DO UPDATE SET title=excluded.title, content=excluded.content")
                    .bind(draft_id, title, content) // 使用 Upsert 確保固定草稿首次也能寫入
                    .run();

            // 背景同步 Google Sheet (保持不變)
            context.waitUntil(
                getSheet(env, DRAFTS_SHEET_NAME).then(async sheet => {
                    const rows = await sheet.getRows();
                    const rowToUpdate = rows.find(row => row.get('draft_id') == draft_id);
                     const syncData = { title, content, is_fixed: (draft_id === FIXED_DRAFT_IDS.POLICY || draft_id === FIXED_DRAFT_IDS.AUTO_CONFIRMATION) };
                    if (rowToUpdate) {
                        rowToUpdate.assign(syncData);
                        await rowToUpdate.save();
                    } else {
                         // 如果 Sheet 上沒有，也嘗試新增 (確保同步)
                         await sheet.addRow({ draft_id, ...syncData });
                    }
                }).catch(err => console.error(`背景同步更新草稿失敗 (ID: ${draft_id}):`, err))
            );

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

            // 背景同步 Google Sheet (保持不變)
            context.waitUntil(
                getSheet(env, DRAFTS_SHEET_NAME).then(async sheet => {
                    const rows = await sheet.getRows();
                    const rowToDelete = rows.find(row => row.get('draft_id') == draft_id);
                    if (rowToDelete) {
                        await rowToDelete.delete();
                    }
                }).catch(err => console.error(`背景同步刪除草稿失敗 (ID: ${draft_id}):`, err))
            );

            return new Response(JSON.stringify({ success: true }), { status: 200 });
        }

        return new Response('無效的請求方法。', { status: 405 });

    } catch (error) {
        console.error('訊息草稿 API 錯誤:', error);
        return new Response(JSON.stringify({ error: '處理草稿時發生錯誤。', details: error.message }), { status: 500 });
    }
}