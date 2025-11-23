// functions/api/rally/campaigns.js

export async function onRequest(context) {
    const { request, env } = context;
    const db = env.DB;

    // 限制只允許 GET 請求
    if (request.method !== 'GET') {
        return new Response(JSON.stringify({ error: 'Method Not Allowed' }), { 
            status: 405,
            headers: { 'Content-Type': 'application/json' }
        });
    }

    try {
        // 查詢資料庫：只選取 "已啟用 (is_active = 1)" 的活動
        // 為了讓最新活動排在前面，使用 ORDER BY campaign_id DESC
        const { results } = await db.prepare(
            "SELECT * FROM RallyCampaigns WHERE is_active = 1 ORDER BY campaign_id DESC"
        ).all();

        return new Response(JSON.stringify(results || []), {
            status: 200,
            headers: { 
                'Content-Type': 'application/json',
                // 加入快取控制 (60秒)，減少資料庫負擔，但確保活動更新能在一分鐘內同步
                'Cache-Control': 'public, max-age=60'
            }
        });

    } catch (error) {
        console.error('Error in public rally campaigns API:', error);
        return new Response(JSON.stringify({ error: '無法讀取活動列表', details: error.message }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' }
        });
    }
}