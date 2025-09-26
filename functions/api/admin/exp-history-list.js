// functions/api/admin/exp-history-list.js
export async function onRequest(context) {
  try {
    // 確保請求方法是 GET
    if (context.request.method !== 'GET') {
      return new Response('Invalid request method.', { status: 405 });
    }

    const db = context.env.DB;

    // 使用 LEFT JOIN 將 ExpHistory 和 Users 兩個表格關聯起來
    // 這樣就可以同時獲取到經驗紀錄和對應的使用者名稱
    const stmt = db.prepare(`
      SELECT
        eh.history_id,
        eh.user_id,
        u.line_display_name,
        u.nickname,
        eh.exp_added,
        eh.reason,
        eh.created_at
      FROM ExpHistory AS eh
      LEFT JOIN Users AS u ON eh.user_id = u.user_id
      ORDER BY eh.created_at DESC
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