// functions/api/admin/get-settings.js
export async function onRequest(context) {
  try {
    // 雖然有 middleware 保護，多一層方法檢查更安全
    if (context.request.method !== 'GET') {
      return new Response('Invalid request method.', { status: 405 });
    }

    const db = context.env.DB;
    const stmt = db.prepare('SELECT * FROM AppSettings ORDER BY key ASC');
    const { results } = await stmt.all();

    return new Response(JSON.stringify(results || []), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error in get-settings API:', error);
    return new Response(JSON.stringify({ error: '獲取系統設定失敗。' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}