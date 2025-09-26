// functions/api/get-news.js
export const onRequest = async (context) => {
    const { env } = context;
    const db = env.DB;

    try {
        if (context.request.method !== 'GET') {
            return new Response('Invalid request method.', { status: 405 });
        }
        
        // 只選取 is_published 為 1 (true) 的消息，並按發布日期降序排列
        const stmt = db.prepare(
          `SELECT * FROM News 
           WHERE is_published = 1 
           ORDER BY published_date DESC`
        );
        const { results } = await stmt.all();

        return new Response(JSON.stringify(results || []), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
        });

    } catch (error) {
        console.error('Error in get-news API:', error);
        return new Response(JSON.stringify({ error: '獲取最新情報失敗。' }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' },
        });
    }
};