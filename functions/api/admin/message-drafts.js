// functions/api/admin/message-drafts.js
import { GoogleSpreadsheet } from 'google-spreadsheet';
import * as jose from 'jose';

// --- Google Sheets 通用工具函式 ---
async function getAccessToken(env) {
    const { GOOGLE_SERVICE_ACCOUNT_EMAIL, GOOGLE_PRIVATE_KEY } = env;
    if (!GOOGLE_SERVICE_ACCOUNT_EMAIL || !GOOGLE_PRIVATE_KEY) throw new Error('缺少 Google 服務帳號的環境變數。');
    const privateKey = await jose.importPKCS8(GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n'), 'RS256');
    const jwt = await new jose.SignJWT({ scope: 'https://www.googleapis.com/auth/spreadsheets' })
      .setProtectedHeader({ alg: 'RS256', typ: 'JWT' }).setIssuer(GOOGLE_SERVICE_ACCOUNT_EMAIL)
      .setAudience('https://oauth2.googleapis.com/token').setSubject(GOOGLE_SERVICE_ACCOUNT_EMAIL)
      .setIssuedAt().setExpirationTime('1h').sign(privateKey);
    const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST', headers: { 'Content-Type': 'application/x-form-urlencoded' },
      body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: jwt }),
    });
    const tokenData = await tokenResponse.json();
    if (!tokenResponse.ok) throw new Error(`從 Google 取得 access token 失敗: ${tokenData.error_description || tokenData.error}`);
    return tokenData.access_token;
}

async function getSheet(env, sheetName) {
    const accessToken = await getAccessToken(env);
    const simpleAuth = { getRequestHeaders: () => ({ 'Authorization': `Bearer ${accessToken}` }) };
    const doc = new GoogleSpreadsheet(env.GOOGLE_SHEET_ID, simpleAuth);
    await doc.loadInfo();
    const sheet = doc.sheetsByTitle[sheetName];
    if (!sheet) throw new Error(`在 Google Sheets 中找不到名為 "${sheetName}" 的工作表。`);
    return sheet;
}
// --- Google Sheets 通用工具函式結束 ---

export async function onRequest(context) {
    const { request, env } = context;
    const db = env.DB;
    const DRAFTS_SHEET_NAME = 'MessageDrafts';

    try {
        if (request.method === 'GET') {
            const { results } = await db.prepare("SELECT * FROM MessageDrafts ORDER BY created_at DESC").all();
            return new Response(JSON.stringify(results || []), {
                status: 200, headers: { 'Content-Type': 'application/json' }
            });
        }

        if (request.method === 'POST') {
            const { title, content } = await request.json();
            // --- 【驗證】 ---
            if (!title || typeof title !== 'string' || title.trim().length === 0 || title.length > 100) {
                return new Response(JSON.stringify({ error: '標題為必填，且長度不可超過 100 字。' }), { status: 400 });
            }
            if (!content || typeof content !== 'string' || content.trim().length === 0 || content.length > 1000) {
                return new Response(JSON.stringify({ error: '內容為必填，且長度不可超過 1000 字。' }), { status: 400 });
            }
            // --- 【驗證結束】 ---

            const result = await db.prepare("INSERT INTO MessageDrafts (title, content) VALUES (?, ?) RETURNING *")
                                   .bind(title, content).first();

            context.waitUntil(
                getSheet(env, DRAFTS_SHEET_NAME)
                    .then(sheet => sheet.addRow(result))
                    .catch(err => console.error(`背景同步新增草稿失敗 (ID: ${result.draft_id}):`, err))
            );

            return new Response(JSON.stringify(result), { status: 201 });
        }

        if (request.method === 'PUT') {
            const { draft_id, title, content } = await request.json();
            // --- 【驗證】 ---
            if (!draft_id || !Number.isInteger(draft_id)) {
                 return new Response(JSON.stringify({ error: '無效的草稿 ID。' }), { status: 400 });
            }
            if (!title || typeof title !== 'string' || title.trim().length === 0 || title.length > 100) {
                return new Response(JSON.stringify({ error: '標題為必填，且長度不可超過 100 字。' }), { status: 400 });
            }
            if (!content || typeof content !== 'string' || content.trim().length === 0 || content.length > 1000) {
                return new Response(JSON.stringify({ error: '內容為必填，且長度不可超過 1000 字。' }), { status: 400 });
            }
            // --- 【驗證結束】 ---

            await db.prepare("UPDATE MessageDrafts SET title = ?, content = ? WHERE draft_id = ?")
                    .bind(title, content, draft_id).run();

            context.waitUntil(
                getSheet(env, DRAFTS_SHEET_NAME).then(async sheet => {
                    const rows = await sheet.getRows();
                    const rowToUpdate = rows.find(row => row.get('draft_id') == draft_id);
                    if (rowToUpdate) {
                        rowToUpdate.assign({ title, content });
                        await rowToUpdate.save();
                    }
                }).catch(err => console.error(`背景同步更新草稿失敗 (ID: ${draft_id}):`, err))
            );

            return new Response(JSON.stringify({ success: true }), { status: 200 });
        }

        if (request.method === 'DELETE') {
            const { draft_id } = await request.json();
            // --- 【驗證】 ---
            if (!draft_id || !Number.isInteger(draft_id)) {
                return new Response(JSON.stringify({ error: '缺少有效的草稿 ID。' }), { status: 400 });
            }
            // --- 【驗證結束】 ---

            await db.prepare("DELETE FROM MessageDrafts WHERE draft_id = ?").bind(draft_id).run();

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