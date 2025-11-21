// functions/api/admin/user-search.js

export async function onRequest(context) {
  try {
    if (context.request.method !== 'GET') {
      return new Response(JSON.stringify({ error: '無效的請求方法' }), { status: 405 });
    }

    const { request, env } = context;
    const db = env.DB;
    const url = new URL(request.url);
    const searchTerm = url.searchParams.get('q');

    if (!searchTerm || searchTerm.length < 1) {
      return new Response(JSON.stringify({ error: '請提供搜尋關鍵字。' }), { status: 400 });
    }

    // 使用 LIKE 進行模糊查詢，現在包含 real_name 和 phone
    const query = `%${searchTerm}%`;
    
    const stmt = db.prepare(
      `SELECT user_id, line_display_name, real_name, phone
       FROM Users 
       WHERE line_display_name LIKE ?1 
          OR user_id LIKE ?1
          OR real_name LIKE ?1
          OR phone LIKE ?1
       LIMIT 10` 
    );
    
    const { results } = await stmt.bind(query).all();

    return new Response(JSON.stringify(results || []), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error in user-search API:', error);
    return new Response(JSON.stringify({ error: '搜尋使用者失敗', details: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}