// functions/api/admin/batch-update-stock-status.js

export async function onRequest(context) {
  try {
    if (context.request.method !== 'POST') {
      return new Response(JSON.stringify({ error: '無效的請求方法' }), { status: 405 });
    }

    const { productIds, stockStatus } = await context.request.json();

    // --- 後端安全驗證 ---
    if (!Array.isArray(productIds) || productIds.length === 0) {
      return new Response(JSON.stringify({ error: '缺少有效的產品 ID 列表。' }), { status: 400 });
    }
    if (typeof stockStatus !== 'string' || stockStatus.trim().length === 0 || stockStatus.length > 50) {
      return new Response(JSON.stringify({ error: '無效的庫存狀態文字，或長度超過 50 字元。' }), { status: 400 });
    }

    const db = context.env.DB;
    
    // 準備 SQL 指令：同時更新庫存狀態、庫存管理模式，並將數量設為 null
    const stmt = db.prepare(
      `UPDATE Products 
       SET 
         stock_status = ?1, 
         inventory_management_type = 'status', 
         stock_quantity = NULL 
       WHERE product_id = ?2`
    );

    // 將所有需要執行的操作打包成一個陣列
    const operations = productIds.map(productId => {
      return stmt.bind(stockStatus.trim(), productId);
    });

    // 使用 batch() 一次性執行所有資料庫更新
    await db.batch(operations);

    return new Response(JSON.stringify({ success: true, message: `成功更新 ${productIds.length} 個項目` }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error in batch-update-stock-status API:', error);
    return new Response(JSON.stringify({ error: '批次更新庫存狀態失敗', details: error.message }), {
      status: 500,
    });
  }
}