// functions/api/rally/progress.js

export async function onRequest(context) {
    const { request, env } = context;
    const db = env.DB;

    // 允許 GET 請求
    if (request.method !== 'GET') {
        return new Response(JSON.stringify({ error: 'Method Not Allowed' }), { status: 405, headers: { 'Content-Type': 'application/json' } });
    }

    const url = new URL(request.url);
    const userId = url.searchParams.get('userId');
    const campaignId = url.searchParams.get('campaignId');

    if (!userId || !campaignId) {
        return new Response(JSON.stringify({ error: 'Missing userId or campaignId' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
    }

    try {
        // 查詢該用戶在特定活動中的所有集點紀錄
        // 【修正重點】加入 p.is_archived 欄位，這樣前端才能過濾掉舊紀錄
        const { results } = await db.prepare(`
            SELECT 
                p.station_id, 
                p.stamped_at,
                p.is_archived, 
                s.name AS station_name
            FROM UserRallyProgress p
            JOIN RallyStations s ON p.station_id = s.station_id
            WHERE p.user_id = ? AND p.campaign_id = ?
        `).bind(userId, campaignId).all();

        return new Response(JSON.stringify(results || []), {
            status: 200,
            headers: { 
                'Content-Type': 'application/json',
                // 這是個人資料，不建議設太久的快取，甚至可以設 no-store
                'Cache-Control': 'no-store' 
            }
        });
    } catch (error) {
        console.error('Error in public rally progress API:', error);
        return new Response(JSON.stringify({ error: 'Fetch progress failed', details: error.message }), { status: 500, headers: { 'Content-Type': 'application/json' } });
    }
}