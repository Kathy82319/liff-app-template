// functions/admin/update-boardproduct-order.js

export async function onRequest(context) {
  try {
    if (context.request.method !== 'POST') {
      return new Response('Invalid request method.', { status: 405 });
    }

    const { orderedproductIds } = await context.request.json();

    if (!Array.isArray(orderedproductIds)) {
      return new Response(JSON.stringify({ error: '無效的資料格式，需要一個 ID 陣列。' }), { status: 400 });
    }

    const db = context.env.DB;

    const operations = orderedproductIds.map((productId, index) => {
      const newOrder = index + 1;
      return db.prepare('UPDATE Products SET display_order = ? WHERE product_id = ?')
         .bind(newOrder, productId);
    });

    await db.batch(operations);

    return new Response(JSON.stringify({ success: true, message: '成功更新產品順序！' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error in update-boardproduct-order API:', error);
    return new Response(JSON.stringify({ error: '更新順序失敗。', details: error.message }), {
      status: 500,
    });
  }
}  