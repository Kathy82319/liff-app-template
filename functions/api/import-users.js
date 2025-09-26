// functions/api/import-users.js
import { GoogleSpreadsheet } from 'google-spreadsheet';
import * as jose from 'jose';

async function runUserImport(env) {
    const {
      GOOGLE_SERVICE_ACCOUNT_EMAIL,
      GOOGLE_PRIVATE_KEY,
      GOOGLE_SHEET_ID,
      USERS_SHEET_NAME, // 我們之前建立的環境變數
      DB
    } = env;

    if (!USERS_SHEET_NAME) throw new Error('Missing USERS_SHEET_NAME environment variable.');

    // 1. 驗證並連接到 Google Sheets
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
      body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: jwt }),
    });
    if (!tokenResponse.ok) throw new Error('Failed to fetch access token from Google.');
    const tokenData = await tokenResponse.json();
    const accessToken = tokenData.access_token;
    
    const simpleAuth = { getRequestHeaders: () => ({ 'Authorization': `Bearer ${accessToken}` }) };
    const doc = new GoogleSpreadsheet(GOOGLE_SHEET_ID, simpleAuth);
    await doc.loadInfo();
    const sheet = doc.sheetsByTitle[USERS_SHEET_NAME];
    if (!sheet) throw new Error(`在 Google Sheets 中找不到名為 "${USERS_SHEET_NAME}" 的工作表。`);

    // 2. 讀取 Google Sheet 上的所有使用者資料
    const rows = await sheet.getRows();
    if (rows.length === 0) {
        return { success: true, message: 'Google Sheet 中沒有使用者資料可匯入。' };
    }

    // 3. 準備 D1 資料庫的 "UPSERT" (更新或插入) 指令
    const stmt = DB.prepare(
        `INSERT INTO Users (user_id, line_display_name, line_picture_url, class, level, current_exp) 
         VALUES (?, ?, ?, ?, ?, ?) 
         ON CONFLICT(user_id) DO UPDATE SET
           line_display_name = excluded.line_display_name,
           line_picture_url = excluded.line_picture_url,
           class = excluded.class,
           level = excluded.level,
           current_exp = excluded.current_exp`
    );

    // 4. 將從 Sheet 讀取到的每一行資料，都綁定到準備好的指令中
    const operations = rows.map(row => {
        const rowData = row.toObject();
        return stmt.bind(
            rowData.user_id,
            rowData.line_display_name,
            rowData.line_picture_url || '',
            rowData.class,
            Number(rowData.level) || 1,
            Number(rowData.current_exp) || 0
        );
    });

    // 5. 執行批次操作，一次性更新所有資料
    await DB.batch(operations);

    return { success: true, message: `成功從 Google Sheet 處理了 ${rows.length} 筆使用者資料。` };
}

export async function onRequest(context) {
    try {
        if (context.request.method !== 'POST') {
            return new Response(JSON.stringify({ error: '僅允許 POST 請求' }), { status: 405 });
        }
        const result = await runUserImport(context.env);
        return new Response(JSON.stringify(result), { status: 200 });
    } catch (error) {
        console.error('Error in import-users API:', error);
        return new Response(JSON.stringify({ error: '匯入失敗。', details: error.message }), { status: 500 });
    }
}