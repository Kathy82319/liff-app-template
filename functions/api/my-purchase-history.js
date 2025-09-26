// functions/api/my-purchase-history.js
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
    
    // 【修正】將 ExpHistory 改為 Purchase_history
    const stmt = db.prepare(
      `SELECT * FROM Purchase_history 
       WHERE user_id = ? 
       ORDER BY created_at DESC`
    );
    const { results } = await stmt.bind(userId).all();

    return new Response(JSON.stringify(results || []), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error in my-purchase-history API:', error);
    return new Response(JSON.stringify({ error: '查詢個人購買紀錄失敗。' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}