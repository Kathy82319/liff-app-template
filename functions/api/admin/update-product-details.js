// functions/api/admin/update-product-details.js (清理後)
import { GoogleSpreadsheet } from 'google-spreadsheet';
import * as jose from 'jose';

// --- Google Sheets 工具函式 (保持不變) ---
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

// functions/api/admin/update-product-details.js

export async function onRequest(context) {
  try {
    if (context.request.method !== 'POST') {
      return new Response('Invalid request method.', { status: 405 });
    }

    const body = await context.request.json();
    const { 
        product_id, name, description, category, images, is_visible, 
        inventory_management_type, stock_quantity, stock_status, 
        price_type, price, price_options, 
        spec_1_name, spec_1_value, spec_2_name, spec_2_value, 
        spec_3_name, spec_3_value, spec_4_name, spec_4_value, 
        spec_5_name, spec_5_value,
        filter_1, filter_2, filter_3 // 【新增】
    } = body;

    if (!product_id || !name) {
        return new Response(JSON.stringify({ error: '產品 ID 和名稱為必填項。' }), { status: 400 });
    }

    const db = context.env.DB;

    const stmt = db.prepare(
      `UPDATE Products SET
         name = ?, description = ?, category = ?, images = ?, is_visible = ?,
         inventory_management_type = ?, stock_quantity = ?, stock_status = ?,
         price_type = ?, price = ?, price_options = ?,
         spec_1_name = ?, spec_1_value = ?, spec_2_name = ?, spec_2_value = ?,
         spec_3_name = ?, spec_3_value = ?, spec_4_name = ?, spec_4_value = ?,
         spec_5_name = ?, spec_5_value = ?,
         filter_1 = ?, filter_2 = ?, filter_3 = ?,
         updated_at = CURRENT_TIMESTAMP
       WHERE product_id = ?`
    );

    const result = await stmt.bind(
        name, description, category, images, is_visible ? 1 : 0,
        inventory_management_type, stock_quantity, stock_status,
        price_type, price, price_options,
        spec_1_name, spec_1_value, spec_2_name, spec_2_value,
        spec_3_name, spec_3_value, spec_4_name, spec_4_value,
        spec_5_name, spec_5_value,
        filter_1, filter_2, filter_3, // 【新增】
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
    console.error('Error in update-product-details API:', error);
    return new Response(JSON.stringify({ error: '更新產品資訊失敗。', details: error.message }), { status: 500 });
  }
}