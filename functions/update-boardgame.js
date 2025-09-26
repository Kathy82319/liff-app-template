// functions/api/update-boardgame.js
import { GoogleSpreadsheet } from 'google-spreadsheet';
import * as jose from 'jose';

// --- 內建 Google Sheets 工具 ---
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
        for (const key in updateData) {
            rowToUpdate.set(key, updateData[key]);
        }
        await rowToUpdate.save();
    } else {
        console.warn(`在工作表 "${sheetName}" 中找不到 ${matchColumn} 為 "${matchValue}" 的資料列，無法更新。`);
    }
}
// --- 內建 Google Sheets 工具結束 ---

export async function onRequest(context) {
  try {
    if (context.request.method !== 'POST') {
      return new Response('Invalid request method.', { status: 405 });
    }

    const { gameId, total_stock, is_visible, rental_type } = await context.request.json();

    if (!gameId) {
      return new Response(JSON.stringify({ error: '缺少遊戲 ID。' }), { status: 400 });
    }

    const db = context.env.DB;
    
    // 1. 更新 D1 資料庫
    const stmt = db.prepare(
      'UPDATE BoardGames SET total_stock = ?, is_visible = ?, rental_type = ? WHERE game_id = ?'
    );
    const result = await stmt.bind(total_stock, is_visible, rental_type, gameId).run();

    if (result.meta.changes === 0) {
      return new Response(JSON.stringify({ error: `找不到遊戲 ID: ${gameId}，無法更新。` }), {
        status: 404
      });
    }

    // 2. 觸發背景任務，將變動同步到 Google Sheet
    const dataToSync = {
        total_stock: total_stock,
        is_visible: is_visible,
        rental_type: rental_type
    };
    context.waitUntil(
        updateRowInSheet(
            context.env, 
            'BoardGames',       // 您的工作表名稱
            'game_id',          // 用來匹配的欄位
            gameId,             // 要匹配的值
            dataToSync          // 要更新的資料
        ).catch(err => console.error("背景同步桌遊資訊失敗:", err))
    );

    return new Response(JSON.stringify({ success: true, message: '成功更新桌遊資訊！' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error in update-boardgame API:', error);
    return new Response(JSON.stringify({ error: '更新桌遊資訊失敗。' }), {
      status: 500,
    });
  }
}