// functions/api/sync-history.js
import { GoogleSpreadsheet } from 'google-spreadsheet';
import * as jose from 'jose';

async function runSync(env) {
    const {
      GOOGLE_SERVICE_ACCOUNT_EMAIL,
      GOOGLE_PRIVATE_KEY,
      GOOGLE_SHEET_ID,
      EXP_HISTORY_SHEET_NAME,
      DB
    } = env;

    if (!EXP_HISTORY_SHEET_NAME) {
        throw new Error('缺少 EXP_HISTORY_SHEET_NAME 環境變數。');
    }
    
    const { results } = await DB.prepare('SELECT * FROM ExpHistory ORDER BY created_at DESC').all();

    if (!results || results.length === 0) {
        return { success: true, message: '資料庫中沒有歷史紀錄可同步。' };
    }

    // ** 關鍵修正：將加密演算法 RS266 改回正確的 RS256 **
    const privateKey = await jose.importPKCS8(GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n'), 'RS256');
    const jwt = await new jose.SignJWT({ scope: 'https://www.googleapis.com/auth/spreadsheets' })
      .setProtectedHeader({ alg: 'RS256', typ: 'JWT' }) // ** 這裡也必須是 RS256 **
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
    const accessToken = tokenData.access_token;

    const simpleAuth = { getRequestHeaders: () => ({ 'Authorization': `Bearer ${accessToken}` }) };
    const doc = new GoogleSpreadsheet(GOOGLE_SHEET_ID, simpleAuth);

    await doc.loadInfo();
    const sheet = doc.sheetsByTitle[EXP_HISTORY_SHEET_NAME];
    if (!sheet) {
        throw new Error(`在 Google Sheets 中找不到名為 "${EXP_HISTORY_SHEET_NAME}" 的工作表。`);
    }

    await sheet.clear();
    await sheet.setHeaderRow(['history_id', 'user_id', 'exp_added', 'reason', 'staff_id', 'created_at']);
    await sheet.addRows(results);

    return { success: true, message: `成功同步了 ${results.length} 筆紀錄。` };
}

export async function onRequest(context) {
    try {
        if (context.request.method !== 'POST') {
            return new Response(JSON.stringify({ error: '僅允許 POST 請求' }), { status: 405 });
        }
        const result = await runSync(context.env);
        return new Response(JSON.stringify(result), { status: 200, headers: { 'Content-Type': 'application/json' } });
    } catch (error) {
        console.error('Error in sync-history API:', error);
        const errorResponse = { error: '同步失敗。', details: error.message };
        return new Response(JSON.stringify(errorResponse), { status: 500, headers: { 'Content-Type': 'application/json' } });
    }
}