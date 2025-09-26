// functions/api/admin/update-news.js
import { GoogleSpreadsheet } from 'google-spreadsheet';
import * as jose from 'jose';

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
async function updateRowInSheet(env, sheetName, matchColumn, matchValue, updateData) {
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
    const rowToUpdate = rows.find(row => row.get(matchColumn) == matchValue);
    if (rowToUpdate) {
        rowToUpdate.assign(updateData);
        await rowToUpdate.save();
    } else {
        console.warn(`在工作表 "${sheetName}" 中找不到 ${matchColumn} 為 "${matchValue}" 的資料列。`);
    }
}

export async function onRequest(context) {
  try {
    if (context.request.method !== 'POST') {
      return new Response('Invalid request method.', { status: 405 });
    }

    const body = await context.request.json();
    const { id, title, category, published_date, image_url, content, is_published } = body;

    // --- 【新增的驗證區塊】 ---
    const errors = [];
    if (!id || typeof id !== 'number') {
        errors.push('無效的情報 ID。');
    }
    if (!title || typeof title !== 'string' || title.trim().length === 0 || title.length > 100) {
        errors.push('標題為必填，且長度不可超過 100 字。');
    }
    if (!category || typeof category !== 'string' || category.trim().length === 0 || category.length > 50) {
        errors.push('分類為必填，且長度不可超過 50 字。');
    }
    if (!published_date || !/^\d{4}-\d{2}-\d{2}$/.test(published_date)) {
        errors.push('請提供有效的發布日期 (YYYY-MM-DD)。');
    }
    if (image_url && (typeof image_url !== 'string' || image_url.length > 2048)) {
        errors.push('圖片網址過長。');
    }
    if (content && (typeof content !== 'string' || content.length > 10000)) {
        errors.push('內文長度不可超過 10000 字。');
    }

    if (errors.length > 0) {
        return new Response(JSON.stringify({ error: errors.join(' ') }), { status: 400 });
    }
    // --- 【驗證區塊結束】 ---

    const db = context.env.DB;
    
    const stmt = db.prepare(
      'UPDATE News SET title = ?, category = ?, published_date = ?, image_url = ?, content = ?, is_published = ? WHERE id = ?'
    );
    const result = await stmt.bind(title, category, published_date, image_url || '', content || '', is_published ? 1 : 0, id).run();

    if (result.meta.changes === 0) {
        return new Response(JSON.stringify({ error: `找不到 ID 為 ${id} 的情報。` }), { status: 404 });
    }

    const newsDataToSync = {
        title, category, published_date, image_url, content,
        is_published: is_published ? 'TRUE' : 'FALSE'
    };
    context.waitUntil(
        updateRowInSheet(context.env, context.env.NEWS_SHEET_NAME, 'id', id, newsDataToSync)
        .catch(err => console.error("背景同步更新情報失敗:", err))
    );

    return new Response(JSON.stringify({ success: true, message: '情報更新成功！' }), {
      status: 200, headers: { 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error in update-news API:', error);
    return new Response(JSON.stringify({ error: '更新情報失敗。' }), { status: 500 });
  }
}