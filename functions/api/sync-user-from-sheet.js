// functions/api/sync-user-from-sheet.js
import { GoogleSpreadsheet } from 'google-spreadsheet';
import * as jose from 'jose';

// --- Google Sheets 工具函式 (保持不變) ---
async function getAccessToken(env) {
    const { GOOGLE_SERVICE_ACCOUNT_EMAIL, GOOGLE_PRIVATE_KEY } = env;
    if (!GOOGLE_SERVICE_ACCOUNT_EMAIL || !GOOGLE_PRIVATE_KEY) throw new Error('缺少 Google 服務帳號的環境變數。');
    
    const formattedPrivateKey = GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n');
    const privateKey = await jose.importPKCS8(formattedPrivateKey, 'RS256');

    const jwt = await new jose.SignJWT({ scope: 'https://www.googleapis.com/auth/spreadsheets.readonly' })
      .setProtectedHeader({ alg: 'RS256', typ: 'JWT' }).setIssuer(GOOGLE_SERVICE_ACCOUNT_EMAIL)
      .setAudience('https://oauth2.googleapis.com/token').setSubject(GOOGLE_SERVICE_ACCOUNT_EMAIL)
      .setIssuedAt().setExpirationTime('1h').sign(privateKey);
    
    // ** START: 關鍵修正 - 手動建立請求 Body **
    const grantType = 'urn:ietf:params:oauth:grant-type:jwt-bearer';
    const body = `grant_type=${encodeURIComponent(grantType)}&assertion=${encodeURIComponent(jwt)}`;

    const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body,
    });
    // ** END: 關鍵修正 **

    const tokenData = await tokenResponse.json();
    if (!tokenResponse.ok) throw new Error(`從 Google 取得 access token 失敗: ${tokenData.error_description || tokenData.error}`);
    return tokenData.access_token;
}

// ** START: 關鍵修正 - getSheet 也需要 getAccessToken **
async function getSheet(env, sheetName) {
    const { GOOGLE_SHEET_ID } = env;
    if (!GOOGLE_SHEET_ID) throw new Error('缺少 GOOGLE_SHEET_ID 環境變數。');

    const accessToken = await getAccessToken(env); // 呼叫修正後的函式
    const simpleAuth = { getRequestHeaders: () => ({ 'Authorization': `Bearer ${accessToken}` }) };
    
    const doc = new GoogleSpreadsheet(GOOGLE_SHEET_ID, simpleAuth);
    await doc.loadInfo();
    
    const sheet = doc.sheetsByTitle[sheetName];
    if (!sheet) throw new Error(`在 Google Sheets 中找不到名為 "${sheetName}" 的工作表。`);

    return sheet;
}
// ** END: 關鍵修正 **
async function runBookingSync(env) {
    const { GOOGLE_SHEET_ID, DB } = env;
    const BOOKINGS_SHEET_NAME = '預約紀錄';

    // 從 D1 讀取所有預約資料
    const { results } = await DB.prepare('SELECT * FROM Bookings ORDER BY created_at DESC').all();

    if (!results || results.length === 0) {
        return { success: true, message: '資料庫中沒有預約紀錄可同步。' };
    }

    const accessToken = await getAccessToken(env);
    const simpleAuth = { getRequestHeaders: () => ({ 'Authorization': `Bearer ${accessToken}` }) };
    const doc = new GoogleSpreadsheet(GOOGLE_SHEET_ID, simpleAuth);

    await doc.loadInfo();
    const sheet = doc.sheetsByTitle[BOOKINGS_SHEET_NAME];
    if (!sheet) {
        throw new Error(`在 Google Sheets 中找不到名為 "${BOOKINGS_SHEET_NAME}" 的工作表。`);
    }

    await sheet.clear();
    // 確保 D1 有資料時才設定標頭，避免 D1 為空時出錯
    if (results.length > 0) {
        // **關鍵**：這裡的欄位名稱必須和您 D1 Bookings 資料表的欄位完全一致
        await sheet.setHeaderRow(Object.keys(results[0]));
        await sheet.addRows(results);
    }

    return { success: true, message: `成功將 ${results.length} 筆預約紀錄從 D1 同步至 Google Sheet。` };
}
export async function onRequest(context) {
    try {
        if (context.request.method !== 'POST') {
            return new Response('Invalid request method.', { status: 405 });
        }

        const { userId } = await context.request.json();
        if (!userId) {
            return new Response(JSON.stringify({ error: '缺少使用者 ID。' }), { status: 400 });
        }

        const db = context.env.DB;
        
        const sheet = await getSheet(context.env, '使用者列表');
        const rows = await sheet.getRows();
        
        const userRowFromSheet = rows.find(row => row.get('user_id') === userId);

        if (!userRowFromSheet) {
            return new Response(JSON.stringify({ error: `在 Google Sheet 中找不到使用者 ID: ${userId}` }), { status: 404 });
        }
        
        const userData = {
            line_display_name: userRowFromSheet.get('line_display_name') || '未提供名稱',
            nickname: userRowFromSheet.get('nickname') || '',
            phone: userRowFromSheet.get('phone') || '',
            class: userRowFromSheet.get('class') || '無',
            level: Number(userRowFromSheet.get('level')) || 1,
            current_exp: Number(userRowFromSheet.get('current_exp')) || 0,
            tag: userRowFromSheet.get('tag') || '',
            // ** START: 關鍵修正 - 新增 perk 欄位 **
            perk: userRowFromSheet.get('perk') || '無特殊優惠'
            // ** END: 關鍵修正 **
        };

        // 使用 UPSERT (Update or Insert) 邏輯，如果 D1 中沒有此使用者，會自動新增
        const stmt = db.prepare(
            `INSERT INTO Users (user_id, line_display_name, nickname, phone, class, level, current_exp, tag, perk) 
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) 
             ON CONFLICT(user_id) DO UPDATE SET
               line_display_name = excluded.line_display_name,
               nickname = excluded.nickname,
               phone = excluded.phone,
               class = excluded.class,
               level = excluded.level,
               current_exp = excluded.current_exp,
               tag = excluded.tag,
               perk = excluded.perk`
        );
        await stmt.bind(
            userId, userData.line_display_name, userData.nickname, userData.phone, userData.class,
            userData.level, userData.current_exp, userData.tag, userData.perk
        ).run();

        return new Response(JSON.stringify({ success: true, message: '成功從 Google Sheet 還原單筆使用者資料至資料庫！' }), {
            status: 200, headers: { 'Content-Type': 'application/json' },
        });

    } catch (error) {
        console.error('Error in sync-user-from-sheet API:', error);
        return new Response(JSON.stringify({ error: '還原失敗。', details: error.message }), {
            status: 500
        });
    }
}