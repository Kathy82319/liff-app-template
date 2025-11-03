// functions/api/my-stored-value-history.js

export const onRequest = async (context) => {
    try {
        if (context.request.method !== 'GET') {
            return new Response(JSON.stringify({ error: '無效的請求方法' }), { status: 405 });
        }

        const url = new URL(context.request.url);
        const userId = url.searchParams.get('userId');
        const db = context.env.DB;

        if (!userId) {
            return new Response(JSON.stringify({ error: '缺少使用者 ID 參數。' }), {
                status: 400,
                headers: { 'Content-Type': 'application/json' },
            });
        }
        
        // 查詢 StoredValueHistory 表
        const stmt = db.prepare(
          `SELECT * FROM StoredValueHistory 
           WHERE user_id = ? 
           ORDER BY created_at DESC`
        );
        const { results } = await stmt.bind(userId).all();

        return new Response(JSON.stringify(results || []), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
        });

    } catch (error) {
        console.error('Error in my-stored-value-history API:', error);
        return new Response(JSON.stringify({ error: '查詢儲值紀錄失敗。' }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' },
        });
    }
};