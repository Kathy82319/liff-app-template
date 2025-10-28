// functions/api/admin/get-all-news.js
export async function onRequest(context) {
  try {
    if (context.request.method !== 'GET') {
      return new Response('Invalid request method.', { status: 405 });
    }

    const db = context.env.DB;
    
    const stmt = db.prepare('SELECT * FROM News ORDER BY published_date DESC');
    const { results } = await stmt.all();

    return new Response(JSON.stringify(results || []), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error in get-all-news API:', error);
    return new Response(JSON.stringify({ error: '獲取情報列表失敗。' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}