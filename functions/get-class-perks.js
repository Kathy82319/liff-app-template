// functions/api/get-class-perks.js
import { GoogleSpreadsheet } from 'google-spreadsheet';
import * as jose from 'jose';

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


export async function onRequest(context) {
    const { env } = context;
    // ** START: 關鍵修正 - 讀取 USERS_SHEET_NAME 而不是 CLASS_PERKS_SHEET_NAME **
    const { GOOGLE_SHEET_ID, USERS_SHEET_NAME } = env;

    if (!USERS_SHEET_NAME) {
        return new Response(JSON.stringify({ error: '缺少 USERS_SHEET_NAME 環境變數。' }), { status: 500 });
    }
    // ** END: 關鍵修正 **

    try {
        const accessToken = await getAccessToken(env);
        const simpleAuth = { getRequestHeaders: () => ({ 'Authorization': `Bearer ${accessToken}` }) };
        const doc = new GoogleSpreadsheet(GOOGLE_SHEET_ID, simpleAuth);
        
        await doc.loadInfo();
        // ** START: 關鍵修正 - 從使用者列表讀取 **
        const sheet = doc.sheetsByTitle[USERS_SHEET_NAME];
        if (!sheet) {
            throw new Error(`在 Google Sheets 中找不到名為 "${USERS_SHEET_NAME}" 的工作表。`);
        }
        
        const rows = await sheet.getRows();
        
        // 從所有使用者資料中，提取出不重複的 class 和 perk 對應關係
        const perks = rows.reduce((acc, row) => {
            const className = row.get('class');
            const perkDescription = row.get('perk');
            // 只有當 class 存在且尚未被記錄時，才加入
            if (className && !acc[className]) {
                acc[className] = perkDescription || '';
            }
            return acc;
        }, {});
        // ** END: 關鍵修正 **

        return new Response(JSON.stringify(perks), {
            status: 200,
            headers: { 
                'Content-Type': 'application/json',
                'Cache-Control': 'public, max-age=3600' // 快取一小時
            },
        });

    } catch (error) {
        console.error('Error in get-class-perks API:', error);
        return new Response(JSON.stringify({ error: '獲取職業設定失敗。', details: error.message }), {
            status: 500, headers: { 'Content-Type': 'application/json' },
        });
    }
}