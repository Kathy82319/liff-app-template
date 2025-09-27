// REPLACE THIS FUNCTION
export async function onRequest(context) {
  try {
    if (context.request.method !== 'GET') {
      return new Response('Invalid request method.', { status: 405 });
    }

    const db = context.env.DB;
    
    // ** 需求 1 修正：在查詢中加入 real_name 欄位 **
    const stmt = db.prepare(
      'SELECT user_id, line_display_name, nickname, real_name, level, current_exp, tag, class FROM Users ORDER BY created_at DESC'
    );
    const { results } = await stmt.all();

    return new Response(JSON.stringify(results || []), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error in get-users API:', error);
    return new Response(JSON.stringify({ error: '獲取使用者列表失敗。' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}