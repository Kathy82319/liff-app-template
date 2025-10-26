// functions/api/admin/update-product-details.js (清理後)
import { GoogleSpreadsheet } from 'google-spreadsheet';
import * as jose from 'jose';

// functions/api/admin/update-product-details.js (v3 - 動態更新版)
export async function onRequest(context) {
  try {
    if (context.request.method !== 'POST') {
      return new Response('Invalid request method.', { status: 405 });
    }

    const body = await context.request.json();
    const { product_id } = body;

    if (!product_id) {
        return new Response(JSON.stringify({ error: '缺少 product_id' }), { status: 400 });
    }
    
    // --- 【核心修改】動態建立 UPDATE 指令 ---

    // 1. 定義一個允許被更新的欄位白名單 (基於資料庫結構，安全性考量)
    const allowedFields = [
      'name', 'description', 'category', 'images', 'is_visible',
      'inventory_management_type', 'stock_quantity', 'stock_status',
      'price_type', /* 'price', 移除舊 price */
      'price_weekday', 'price_friday', 'price_saturday', // <--- 新增
      'price_options',
      'spec_1_name', 'spec_1_value', 'spec_2_name', 'spec_2_value',
      'spec_3_name', 'spec_3_value', 'spec_4_name', 'spec_4_value',
      'spec_5_name', 'spec_5_value',
      'filter_1', 'filter_2', 'filter_3'
    ];

    const updates = [];
    const values = [];

    // 2. 遍歷前端送來的所有資料
for (const key in body) {
      if (allowedFields.includes(key) && key !== 'product_id') {
        updates.push(`${key} = ?`);
        if (typeof body[key] === 'boolean') {
            values.push(body[key] ? 1 : 0);
        } else {
            // --- 新增：確保數字欄位傳入的是數字或 null ---
             if (key.startsWith('price_') || key === 'stock_quantity') {
                 values.push(body[key] === '' ? null : parseFloat(body[key]));
             } else {
                 values.push(body[key]);
             }
        }
      }
    }

    if (updates.length === 0) {
      return new Response(JSON.stringify({ error: '沒有提供任何可更新的資料' }), { status: 400 });
    }

const sql = `UPDATE Products SET ${updates.join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE product_id = ?`;
    values.push(product_id);

    // --- 動態建立結束 ---

    const db = context.env.DB;
    const stmt = db.prepare(sql);
    const result = await stmt.bind(...values).run();

    if (result.meta.changes === 0) {
      return new Response(JSON.stringify({ error: `找不到產品 ID: ${product_id}，無法更新。` }), { status: 404 });
    }

    return new Response(JSON.stringify({ success: true, message: '成功更新產品資訊！' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error in update-product-details API:', error);
    // 在回傳的錯誤中包含更詳細的訊息，方便偵錯
    return new Response(JSON.stringify({ error: '更新產品資訊失敗。', details: error.message }), { status: 500 });
  }
}