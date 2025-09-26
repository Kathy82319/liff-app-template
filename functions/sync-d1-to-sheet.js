// functions/api/sync-d1-to-sheet.js
import { GoogleSpreadsheet } from 'google-spreadsheet';
import * as jose from 'jose';

async function getAccessToken(env) {
    const { GOOGLE_SERVICE_ACCOUNT_EMAIL, GOOGLE_PRIVATE_KEY } = env;
    if (!GOOGLE_SERVICE_ACCOUNT_EMAIL || !GOOGLE_PRIVATE_KEY) throw new Error('缺少 Google 服務帳號的環境變數。');
    
    const formattedPrivateKey = GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n');
    const privateKey = await jose.importPKCS8(formattedPrivateKey, 'RS256');

    // ** START: 關鍵修正 - 移除 .readonly，申請完整的讀寫權限 **
    const jwt = await new jose.SignJWT({ scope: 'https://www.googleapis.com/auth/spreadsheets' })
      .setProtectedHeader({ alg: 'RS256', typ: 'JWT' }).setIssuer(GOOGLE_SERVICE_ACCOUNT_EMAIL)
      .setAudience('https://oauth2.googleapis.com/token').setSubject(GOOGLE_SERVICE_ACCOUNT_EMAIL)
      .setIssuedAt().setExpirationTime('1h').sign(privateKey);
    // ** END: 關鍵修正 **
    
    const grantType = 'urn:ietf:params:oauth:grant-type:jwt-bearer';
    const body = `grant_type=${encodeURIComponent(grantType)}&assertion=${encodeURIComponent(jwt)}`;

    const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body,
    });

    const tokenData = await tokenResponse.json();
    if (!tokenResponse.ok) throw new Error(`從 Google 取得 access token 失敗: ${tokenData.error_description || tokenData.error}`);
    return tokenData.access_token;
}

async function runSync(env) {
    const { DB, GOOGLE_SHEET_ID, USERS_SHEET_NAME } = env;
    if (!USERS_SHEET_NAME) throw new Error('缺少 USERS_SHEET_NAME 環境變數。');

    const { results } = await DB.prepare('SELECT * FROM Users ORDER BY created_at DESC').all();
    if (!results || results.length === 0) {
        return { success: true, message: '資料庫中沒有使用者資料可同步。' };
    }

    const accessToken = await getAccessToken(env);
    const simpleAuth = { getRequestHeaders: () => ({ 'Authorization': `Bearer ${accessToken}` }) };
    const doc = new GoogleSpreadsheet(GOOGLE_SHEET_ID, simpleAuth);
    await doc.loadInfo();
    const sheet = doc.sheetsByTitle[USERS_SHEET_NAME];
    if (!sheet) throw new Error(`在 Google Sheets 中找不到名為 "${USERS_SHEET_NAME}" 的工作表。`);

    await sheet.clear();
    // 確保 D1 有資料時才設定標頭，避免 D1 為空時出錯
    if (results.length > 0) {
        await sheet.setHeaderRow(Object.keys(results[0]));
        await sheet.addRows(results);
    }

    return { success: true, message: `成功將 ${results.length} 筆使用者資料從 D1 同步至 Google Sheet。` };
}

export async function onRequest(context) {
    try {
        if (context.request.method !== 'GET' && context.request.method !== 'POST') {
            return new Response(JSON.stringify({ error: '僅允許 GET 或 POST 請求' }), { status: 405 });
        }
        const result = await runSync(context.env);
        return new Response(JSON.stringify(result), { status: 200, headers: { 'Content-Type': 'application/json' } });
    } catch (error) {
        console.error('Error in sync-d1-to-sheet API:', error);
        return new Response(JSON.stringify({ error: '同步失敗。', details: error.message }), { status: 500 });
    }
}