export async function onRequest(context) {
    const { request, env } = context;
    const db = env.DB;

    try {
        if (request.method !== 'GET') {
            return new Response(JSON.stringify({ error: '無效的請求方法' }), { status: 405 });
        }

        const url = new URL(request.url);
        const userId = url.searchParams.get('userId');
        const campaignId = url.searchParams.get('campaignId');

        if (!userId || !campaignId) {
            return new Response(JSON.stringify({ error: '缺少使用者 ID 或活動 ID 參數。' }), { status: 400 });
        }

        // 連表查詢用戶在特定活動中收集的所有站點，並帶回站點名稱和效期
        const stmt = db.prepare(`
            SELECT 
                p.station_id, 
                p.stamped_at,
                s.name AS station_name,
                s.partner_name,
                s.expiry_date
            FROM UserRallyProgress p
            JOIN RallyStations s ON p.station_id = s.station_id
            WHERE p.user_id = ?1 AND p.campaign_id = ?2
            ORDER BY p.stamped_at DESC
        `);
        
        const { results } = await stmt.bind(userId, campaignId).all();

        return new Response(JSON.stringify(results || []), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
        });

    } catch (error) {
        console.error('Error in rally/progress API:', error);
        return new Response(JSON.stringify({ error: '查詢集點進度失敗', details: error.message }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' },
        });
    }
}