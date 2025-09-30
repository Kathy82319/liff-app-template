// functions/api/admin/delete-products.js

export async function onRequest(context) {
  try {
    // 限制只接受 POST 請求
    if (context.request.method !== 'POST') {
      return new Response(JSON.stringify({ error: '無效的請求方法' }), { status: 405 });
    }

    const { productIds } = await context.request.json();

    // 後端安全驗證：確保傳來的是一個非空的 ID 陣列
    if (!Array.isArray(productIds) || productIds.length === 0) {
      return new Response(JSON.stringify({ error: '缺少有效的產品 ID 列表。' }), { status: 400 });
    }

    const db = context.env.DB;
    
    // 準備一個 SQL DELETE 指令
    const stmt = db.prepare('DELETE FROM Products WHERE product_id = ?');

    // 將所有要刪除的操作打包成一個陣列
    const operations = productIds.map(productId => {
      return stmt.bind(productId);
    });

    // 使用 batch() 一次性執行所有資料庫刪除操作，效率最高
    await db.batch(operations);

    return new Response(JSON.stringify({ 
      success: true, 
      message: `成功刪除 ${productIds.length} 個項目。` 
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error in delete-products API:', error);
    return new Response(JSON.stringify({ error: '刪除產品時發生錯誤', details: error.message }), {
      status: 500,
    });
  }
}