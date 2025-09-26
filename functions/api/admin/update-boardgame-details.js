// functions/api/admin/update-boardgame-details.js
import { GoogleSpreadsheet } from 'google-spreadsheet';
import * as jose from 'jose';

// --- Google Sheets 工具函式 ---
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
    const { GOOGLE_SHEET_ID } = env;
    if (!GOOGLE_SHEET_ID) throw new Error('缺少 GOOGLE_SHEET_ID 環境變數。');
    const accessToken = await getAccessToken(env);
    const simpleAuth = { getRequestHeaders: () => ({ 'Authorization': `Bearer ${accessToken}` }) };
    const doc = new GoogleSpreadsheet(GOOGLE_SHEET_ID, simpleAuth);
    await doc.loadInfo();
    const sheet = doc.sheetsByTitle[sheetName];
    if (!sheet) throw new Error(`在 Google Sheets 中找不到名為 "${sheetName}" 的工作表。`);
    const rows = await sheet.getRows();
    const rowToUpdate = rows.find(row => row.get(matchColumn) == matchValue);
    if (rowToUpdate) {
        rowToUpdate.assign(updateData);
        await rowToUpdate.save();
    } else {
        console.warn(`在工作表 "${sheetName}" 中找不到 ${matchColumn} 為 "${matchValue}" 的資料列，無法更新。`);
    }
}
// --- Google Sheets 工具函式結束 ---

export async function onRequest(context) {
  try {
    if (context.request.method !== 'POST') {
      return new Response('Invalid request method.', { status: 405 });
    }
    
    const body = await context.request.json();
    
    // --- 【新增的驗證區塊】 ---
    const errors = [];
    if (!body.gameId) errors.push('缺少遊戲 ID。');
    if (!body.name || typeof body.name !== 'string' || body.name.trim().length === 0 || body.name.length > 100) {
        errors.push('遊戲名稱為必填，且長度不可超過 100 字。');
    }

    const numberFields = {
        min_players: { min: 1, max: 100 }, max_players: { min: 1, max: 100 },
        total_stock: { min: 0, max: 999 }, for_rent_stock: { min: 0, max: 999 },
        sale_price: { min: 0, max: 99999 }, rent_price: { min: 0, max: 99999 },
        deposit: { min: 0, max: 99999 }, late_fee_per_day: { min: 0, max: 9999 }
    };

    for (const field in numberFields) {
        const value = Number(body[field]);
        const limits = numberFields[field];
        if (isNaN(value) || !Number.isInteger(value) || value < limits.min || value > limits.max) {
            errors.push(`欄位 ${field} 必須是 ${limits.min} 到 ${limits.max} 之間的整數。`);
        }
    }
    
    if (Number(body.for_rent_stock) > Number(body.total_stock)) {
        errors.push('可租借庫存不能大於總庫存。');
    }
    
    const allowedDifficulties = ['簡單', '普通', '困難', '專家'];
    if (!allowedDifficulties.includes(body.difficulty)) {
        errors.push('無效的難度設定。');
    }

    if (errors.length > 0) {
        return new Response(JSON.stringify({ error: errors.join(' ') }), { status: 400 });
    }
    // --- 【驗證區塊結束】 ---
  
    const db = context.env.DB;
    
        const stmt = db.prepare(
          `UPDATE Products SET
             name = ?, description = ?, image_url = ?, image_url_2 = ?, image_url_3 = ?, tags = ?,
             min_players = ?, max_players = ?, difficulty = ?,
             total_stock = ?, for_rent_stock = ?, for_sale_stock = ?,
             sale_price = ?, rent_price = ?, deposit = ?, late_fee_per_day = ?,
             is_visible = ?, supplementary_info = ?
           WHERE game_id = ?`
        );
        const for_sale_stock = (Number(body.total_stock) || 0) - (Number(body.for_rent_stock) || 0);

        const result = await stmt.bind(
            body.name, body.description || '', body.image_url || '', body.image_url_2 || '', body.image_url_3 || '', body.tags || '',
            Number(body.min_players), Number(body.max_players), body.difficulty,
            Number(body.total_stock), Number(body.for_rent_stock), for_sale_stock,
            Number(body.sale_price), Number(body.rent_price),
            Number(body.deposit), Number(body.late_fee_per_day),
            body.is_visible ? 1 : 0, body.supplementary_info || '',
            body.gameId
        ).run();

    if (result.meta.changes === 0) {
      return new Response(JSON.stringify({ error: `找不到遊戲 ID: ${body.gameId}，無法更新。` }), { status: 404 });
    }

    const { gameId: id, ...dataToSync } = body; 
    dataToSync.is_visible = dataToSync.is_visible ? 'TRUE' : 'FALSE';
    dataToSync.for_sale_stock = for_sale_stock;

    const sheetName = context.env.BOARDGAMES_SHEET_NAME;
    if (sheetName) {
        context.waitUntil(
            updateRowInSheet(context.env, sheetName, 'game_id', body.gameId, dataToSync)
            .catch(err => console.error(`[背景同步失敗] 更新 game_id ${body.gameId} 時發生錯誤:`, err))
        );
    }
    
    return new Response(JSON.stringify({ success: true, message: '成功更新桌遊詳細資訊！' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error in update-boardgame-details API:', error);
    return new Response(JSON.stringify({ error: '更新桌遊資訊失敗。', details: error.message }), { status: 500 });
  }
}