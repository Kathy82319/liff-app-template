// functions/api/sync-bookings.js
import { GoogleSpreadsheet } from 'google-spreadsheet';
import * as jose from 'jose';

// --- 內建 Google Sheets 工具 ---
async function getAccessToken(env) {
    const { GOOGLE_SERVICE_ACCOUNT_EMAIL, GOOGLE_PRIVATE_KEY } = env;
    if (!GOOGLE_SERVICE_ACCOUNT_EMAIL || !GOOGLE_PRIVATE_KEY) {
        throw new Error('缺少 Google 服務帳號的環境變數。');
    }
    const privateKey = await jose.importPKCS8(GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n'), 'RS256');
    const jwt = await new jose.SignJWT({ scope: 'https://www.googleapis.com/auth/spreadsheets' })
      .setProtectedHeader({ alg: 'RS256', typ: 'JWT' })
      .setIssuer(GOOGLE_SERVICE_ACCOUNT_EMAIL)
      .setAudience('https://oauth2.googleapis.com/token')
      .setSubject(GOOGLE_SERVICE_ACCOUNT_EMAIL)
      .setIssuedAt()
      .setExpirationTime('1h')
      .sign(privateKey);

    const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
        assertion: jwt
      }),
    });

    const tokenData = await tokenResponse.json();
    if (!tokenResponse.ok) {
        throw new Error(`從 Google 取得 access token 失敗: ${tokenData.error_description || tokenData.error}`);
    }
    return tokenData.access_token;
}
// --- 內建 Google Sheets 工具結束 ---

async function runBookingSync(env) {
    const {
      GOOGLE_SHEET_ID,
      BOOKINGS_SHEET_NAME, // 確保此環境變數已設定
      DB
    } = env;

    if (!BOOKINGS_SHEET_NAME) {
        throw new Error('Missing BOOKINGS_SHEET_NAME environment variable.');
    }
    
    // 從 D1 讀取所有預約資料
    const { results } = await DB.prepare('SELECT * FROM Bookings ORDER BY created_at DESC').all();

    if (!results || results.length === 0) {
        return { success: true, message: '資料庫中沒有預約紀錄可同步。' };
    }

    // 使用新的驗證方式取得 token
    const accessToken = await getAccessToken(env);
    const simpleAuth = { getRequestHeaders: () => ({ 'Authorization': `Bearer ${accessToken}` }) };
    const doc = new GoogleSpreadsheet(GOOGLE_SHEET_ID, simpleAuth);

    // 寫入資料到 Google Sheets
    await doc.loadInfo();
    const sheet = doc.sheetsByTitle[BOOKINGS_SHEET_NAME];
    if (!sheet) {
        throw new Error(`在 Google Sheets 中找不到名為 "${BOOKINGS_SHEET_NAME}" 的工作表。`);
    }

    await sheet.clear();
    // ** 欄位已根據您的 D1 結構進行簡化 **
    await sheet.setHeaderRow(['booking_id', 'user_id', 'contact_name', 'contact_phone', 'booking_date', 'time_slot', 'tables_occupied', 'num_of_people', 'status', 'created_at']);
    await sheet.addRows(results);

    return { success: true, message: `成功同步了 ${results.length} 筆預約紀錄。` };
}

export async function onRequest(context) {
    try {
        if (context.request.method !== 'POST') {
            return new Response(JSON.stringify({ error: '僅允許 POST 請求' }), { status: 405, headers: { 'Content-Type': 'application/json' } });
        }
        const result = await runBookingSync(context.env);
        return new Response(JSON.stringify(result), { status: 200, headers: { 'Content-Type': 'application/json' } });
    } catch (error) {
        console.error('Error in sync-bookings API:', error);
        return new Response(JSON.stringify({ error: '同步失敗。', details: error.message }), { status: 500, headers: { 'Content-Type': 'application/json' } });
    }
}