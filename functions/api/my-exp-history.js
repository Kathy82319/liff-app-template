// functions/api/my-exp-history.js

export async function onRequest(context) {
  try {
    const url = new URL(context.request.url);
    const userId = url.searchParams.get('userId');

    if (!userId) {
      return new Response(JSON.stringify({ error: '缺少使用者 ID 參數。' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const db = context.env.DB;
    
    // 從 ExpHistory 表格中，只選取屬於該 user_id 的紀錄，並按日期降序排列
    const stmt = db.prepare(
      `SELECT * FROM ExpHistory 
       WHERE user_id = ? 
       ORDER BY created_at DESC`
    );
    const { results } = await stmt.bind(userId).all();

    return new Response(JSON.stringify(results || []), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error in my-exp-history API:', error);
    return new Response(JSON.stringify({ error: '查詢個人經驗紀錄失敗。' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}