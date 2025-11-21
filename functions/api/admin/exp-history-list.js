// functions/api/admin/exp-history-list.js

export const onRequest = async (context) => {
    try {
        if (context.request.method !== 'GET') {
            return new Response('Invalid request method.', { status: 405 });
        }

        const db = context.env.DB;

    // 【修正】使用 COALESCE 確保 real_name 和 phone 即使為 NULL 也能被正確解析為空字串，
    // 以繞過 D1 上潛在的查詢執行錯誤，同時保留欄位名稱供前端使用。
    const stmt = db.prepare(`
      SELECT
        ph.history_id,
        ph.user_id,
        u.line_display_name,
        COALESCE(u.real_name, '') AS real_name, 
        COALESCE(u.phone, '') AS phone, 
        ph.exp_added,
        ph.reason,
        ph.created_at
      FROM Purchasehistory AS ph
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
};