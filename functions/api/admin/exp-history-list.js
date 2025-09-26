// functions/api/admin/exp-history-list.js
export async function onRequest(context) {
  try {
    if (context.request.method !== 'GET') {
      return new Response('Invalid request method.', { status: 405 });
    }

    const db = context.env.DB;

    // 【修正】將 ExpHistory 改為 Purchase_history
    const stmt = db.prepare(`
      SELECT
        ph.history_id,
        ph.user_id,
        u.line_display_name,
        u.nickname,
        ph.exp_added,
        ph.reason,
        ph.created_at
      FROM Purchase_history AS ph
      LEFT JOIN Users AS u ON ph.user_id = u.user_id
      ORDER BY ph.created_at DESC
    `);

    const { results } = await stmt.all();

    return new Response(JSON.stringify(results || []), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error in exp-history-list API:', error);
    return new Response(JSON.stringify({ error: '獲取經驗紀錄失敗。', details: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}