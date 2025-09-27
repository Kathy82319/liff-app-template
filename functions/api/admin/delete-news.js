// functions/api/admin/delete-news.js

// ** Google Sheets 工具函式 **
async function getAccessToken(env) {
    const { GOOGLE_SERVICE_ACCOUNT_EMAIL, GOOGLE_PRIVATE_KEY } = env;
    if (!GOOGLE_SERVICE_ACCOUNT_EMAIL || !GOOGLE_PRIVATE_KEY) throw new Error('缺少 Google 服務帳號的環境變數。');
    const privateKey = await jose.importPKCS8(GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n'), 'RS256');
    const jwt = await new jose.SignJWT({ scope: 'https://www.googleapis.com/auth/spreadsheets' })
      .setProtectedHeader({ alg: 'RS256', typ: 'JWT' }).setIssuer(GOOGLE_SERVICE_ACCOUNT_EMAIL)
      .setAudience('https://oauth2.googleapis.com/token').setSubject(GOOGLE_SERVICE_ACCOUNT_EMAIL)
      .setIssuedAt().setExpirationTime('1h').sign(privateKey);
    const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: jwt }),
    });
    const tokenData = await tokenResponse.json();
    if (!tokenResponse.ok) throw new Error(`從 Google 取得 access token 失敗: ${tokenData.error_description || tokenData.error}`);
    return tokenData.access_token;
}
async function deleteRowFromSheet(env, sheetName, matchColumn, matchValue) {
    if (!sheetName) {
        console.error('背景同步失敗：缺少工作表名稱的環境變數。');
        return;
    }
    const accessToken = await getAccessToken(env);
    const simpleAuth = { getRequestHeaders: () => ({ 'Authorization': `Bearer ${accessToken}` }) };
    const doc = new GoogleSpreadsheet(env.GOOGLE_SHEET_ID, simpleAuth);
    await doc.loadInfo();
    const sheet = doc.sheetsByTitle[sheetName];
    if (!sheet) throw new Error(`在 Google Sheets 中找不到名為 "${sheetName}" 的工作表。`);
    const rows = await sheet.getRows();
    const rowToDelete = rows.find(row => row.get(matchColumn) == matchValue);
    if (rowToDelete) {
        await rowToDelete.delete();
    } else {
        console.warn(`在工作表 "${sheetName}" 中找不到 ${matchColumn} 為 "${matchValue}" 的資料列。`);
    }
}

export async function onRequest(context) {
  try {
    if (context.request.method !== 'POST') {
      return new Response('Invalid request method.', { status: 405 });
    }

    const { id } = await context.request.json();
    
    // --- 【新增的驗證區塊】 ---
    if (!id || typeof id !== 'number') {
      return new Response(JSON.stringify({ error: '缺少有效的情報 ID。' }), { status: 400 });
    }
    // --- 【驗證區塊結束】 ---

    const db = context.env.DB;
    
    const stmt = db.prepare('DELETE FROM News WHERE id = ?');
    const result = await stmt.bind(id).run();

    if (result.meta.changes === 0) {
        return new Response(JSON.stringify({ error: `找不到 ID 為 ${id} 的情報。` }), { status: 404 });
    }

    context.waitUntil(
        deleteRowFromSheet(context.env, context.env.NEWS_SHEET_NAME, 'id', id)
        .catch(err => console.error("背景同步刪除情報失敗:", err))
    );

    return new Response(JSON.stringify({ success: true, message: '情報刪除成功！' }), {
      status: 200, headers: { 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error in delete-news API:', error);
    return new Response(JSON.stringify({ error: '刪除情報失敗。' }), { status: 500 });
  }
}