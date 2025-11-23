// functions/api/rally/progress.js

export async function onRequest(context) {
    const { request, env } = context;
    const db = env.DB;

    if (request.method !== 'GET') {
        return new Response(JSON.stringify({ error: 'Method Not Allowed' }), { status: 405 });
    }

    const url = new URL(request.url);
    const userId = url.searchParams.get('userId');
    const campaignId = url.searchParams.get('campaignId');

    if (!userId || !campaignId) {
        return new Response(JSON.stringify({ error: 'Missing userId or campaignId' }), { status: 400 });
    }

    try {
        // 查詢該用戶在特定活動中的所有集點紀錄
        // JOIN RallyStations 是為了確保即使站點後來被改名，也能拿到當下的名稱 (選填)
        const { results } = await db.prepare(`
            SELECT 
                p.station_id, 
                p.stamped_at,
                s.name AS station_name
            FROM UserRallyProgress p
            JOIN RallyStations s ON p.station_id = s.station_id
            WHERE p.user_id = ? AND p.campaign_id = ?
        `).bind(userId, campaignId).all();

        return new Response(JSON.stringify(results || []), {
            status: 200,
            headers: { 'Content-Type': 'application/json' }
        });
    } catch (error) {
        console.error('Error in public rally progress API:', error);
        return new Response(JSON.stringify({ error: '無法讀取集點進度', details: error.message }), { status: 500 });
    }
}