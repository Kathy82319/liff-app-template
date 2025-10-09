// functions/api/admin/update-product-details.js (最終修正版)
import { GoogleSpreadsheet } from 'google-spreadsheet';
import * as jose from 'jose';

// --- Google Sheets 工具函式 (這部分是正確的，無需修改) ---
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


export async function onRequest(context) {
  try {
    if (context.request.method !== 'POST') {
      return new Response('Invalid request method.', { status: 405 });
    }
    
    const body = await context.request.json();
    
    // 【** 關鍵修正 **】將所有 productId 的引用全部改為 product_id
    const { product_id, name, description, category, tags, images, is_visible, inventory_management_type, stock_quantity, stock_status, price_type, price, price_options, spec_1_name, spec_1_value, spec_2_name, spec_2_value, spec_3_name, spec_3_value, spec_4_name, spec_4_value, spec_5_name, spec_5_value } = body;
  
    // 驗證也使用 product_id
    if (!product_id || !name) {
            return new Response(JSON.stringify({
      debug_mode: true,
      message: "成功攔截到前端傳來的資料！請在瀏覽器開發者工具的 'Response' 標籤中查看收到的資料。",
      received_data: body 
    }), {
      status: 200, // 回傳 200 OK 狀態，表示成功攔截
      headers: { 'Content-Type': 'application/json' },
    });
    }

    const db = context.env.DB;
    
    const stmt = db.prepare(
      `UPDATE Products SET
         name = ?, description = ?, category = ?, tags = ?, images = ?, is_visible = ?,
         inventory_management_type = ?, stock_quantity = ?, stock_status = ?,
         price_type = ?, price = ?, price_options = ?,
         spec_1_name = ?, spec_1_value = ?, spec_2_name = ?, spec_2_value = ?,
         spec_3_name = ?, spec_3_value = ?, spec_4_name = ?, spec_4_value = ?,
         spec_5_name = ?, spec_5_value = ?, updated_at = CURRENT_TIMESTAMP
       WHERE product_id = ?`
    );

    // bind 的最後一個參數也使用 product_id
    const result = await stmt.bind(
        name, description, category, tags, images, is_visible ? 1 : 0,
        inventory_management_type, stock_quantity, stock_status,
        price_type, price, price_options,
        spec_1_name, spec_1_value, spec_2_name, spec_2_value,
        spec_3_name, spec_3_value, spec_4_name, spec_4_value,
        spec_5_name, spec_5_value,
        product_id
    ).run();

    if (result.meta.changes === 0) {
      return new Response(JSON.stringify({ error: `找不到產品 ID: ${product_id}，無法更新。` }), { status: 404 });
    }
    
    return new Response(JSON.stringify({ success: true, message: '成功更新產品資訊！' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });

  } catch (error) {
    // 如果連讀取 JSON 都失敗，也一併回報
    console.error('偵錯模式下發生錯誤:', error);
    return new Response(JSON.stringify({
      debug_mode: true,
      error: "在後端解析前端傳來的 JSON 時發生錯誤。",
      details: error.message
    }), { status: 400 });
  }
}