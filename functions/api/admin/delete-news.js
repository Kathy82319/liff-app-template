// functions/api/admin/delete-news.js

export async function onRequest(context) {
  try {
    if (context.request.method !== 'POST') {
      return new Response('Invalid request method.', { status: 405 });
    }

    const { id } = await context.request.json();
    
    // --- 【新增的驗證區塊】 ---
    if (!id || typeof id !== 'number') {
      return new Response(JSON.stringify({ error: '缺少有效的情報 ID。' }), { status: 400 });
    }
    // --- 【驗證區塊結束】 ---

    const db = context.env.DB;
    
    const stmt = db.prepare('DELETE FROM News WHERE id = ?');
    const result = await stmt.bind(id).run();

    if (result.meta.changes === 0) {
        return new Response(JSON.stringify({ error: `找不到 ID 為 ${id} 的情報。` }), { status: 404 });
    }

    context.waitUntil(
        deleteRowFromSheet(context.env, context.env.NEWS_SHEET_NAME, 'id', id)
        .catch(err => console.error("背景同步刪除情報失敗:", err))
    );

    return new Response(JSON.stringify({ success: true, message: '情報刪除成功！' }), {
      status: 200, headers: { 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error in delete-news API:', error);
    return new Response(JSON.stringify({ error: '刪除情報失敗。' }), { status: 500 });
  }
}