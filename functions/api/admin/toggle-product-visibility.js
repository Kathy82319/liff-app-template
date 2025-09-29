// functions/api/admin/toggle-product-visibility.js

export async function onRequest(context) {
  try {
    if (context.request.method !== 'POST') {
      return new Response(JSON.stringify({ error: '無效的請求方法' }), { status: 405 });
    }

    const { productId, isVisible } = await context.request.json();

    // --- 安全驗證 ---
    if (!productId || typeof isVisible !== 'boolean') {
      return new Response(JSON.stringify({ error: '缺少必要的參數' }), { status: 400 });
    }

    const db = context.env.DB;
    const stmt = db.prepare('UPDATE Products SET is_visible = ? WHERE product_id = ?');
    const result = await stmt.bind(isVisible ? 1 : 0, productId).run();

    if (result.meta.changes === 0) {
        return new Response(JSON.stringify({ error: `找不到產品 ID: ${productId}` }), { status: 404 });
    }

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error in toggle-product-visibility API:', error);
    return new Response(JSON.stringify({ error: '更新產品狀態失敗', details: error.message }), {
      status: 500,
    });
  }
}