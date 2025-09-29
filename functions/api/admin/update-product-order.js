// functions/admin/update-boardgame-order.js

export async function onRequest(context) {
  try {
    if (context.request.method !== 'POST') {
      return new Response('Invalid request method.', { status: 405 });
    }

    const { orderedGameIds } = await context.request.json();

    if (!Array.isArray(orderedGameIds)) {
      return new Response(JSON.stringify({ error: '無效的資料格式，需要一個 ID 陣列。' }), { status: 400 });
    }

    const db = context.env.DB;

    const operations = orderedGameIds.map((gameId, index) => {
      const newOrder = index + 1;
      return db.prepare('UPDATE Products SET display_order = ? WHERE product_id = ?')
         .bind(newOrder, gameId);
    });

    await db.batch(operations);

    return new Response(JSON.stringify({ success: true, message: '成功更新產品順序！' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error in update-boardgame-order API:', error);
    return new Response(JSON.stringify({ error: '更新順序失敗。', details: error.message }), {
      status: 500,
    });
  }
}  