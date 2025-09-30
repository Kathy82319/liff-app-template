// functions/api/admin/batch-update-products.js

export async function onRequest(context) {
  try {
    if (context.request.method !== 'POST') {
      return new Response(JSON.stringify({ error: '無效的請求方法' }), { status: 405 });
    }

    const { productIds, isVisible } = await context.request.json();

    // --- 後端安全驗證 ---
    if (!Array.isArray(productIds) || productIds.length === 0 || typeof isVisible !== 'boolean') {
      return new Response(JSON.stringify({ error: '缺少必要的參數或格式不正確' }), { status: 400 });
    }

    const db = context.env.DB;
    
    // 準備一個 SQL 指令
    const stmt = db.prepare('UPDATE Products SET is_visible = ? WHERE product_id = ?');

    // 將所有需要執行的操作打包成一個陣列
    const operations = productIds.map(productId => {
      return stmt.bind(isVisible ? 1 : 0, productId);
    });

    // 使用 batch() 一次性執行所有資料庫更新，效率極高
    await db.batch(operations);

    return new Response(JSON.stringify({ success: true, message: `成功更新 ${productIds.length} 個項目` }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error in batch-update-products API:', error);
    return new Response(JSON.stringify({ error: '批次更新產品狀態失敗', details: error.message }), {
      status: 500,
    });
  }
}