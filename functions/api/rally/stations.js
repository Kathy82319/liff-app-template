// functions/api/rally/stations.js

export async function onRequest(context) {
    const { request, env } = context;
    const db = env.DB;

    if (request.method !== 'GET') {
        return new Response(JSON.stringify({ error: 'Method Not Allowed' }), { status: 405 });
    }

    const url = new URL(request.url);
    const campaignId = url.searchParams.get('campaignId');

    if (!campaignId) {
        return new Response(JSON.stringify({ error: 'Missing campaignId' }), { status: 400 });
    }

    try {
        // 查詢該活動底下所有 "已啟用" 的站點
        // 注意：我們不選取 unique_partner_code，避免洩漏給前端
        const { results } = await db.prepare(`
            SELECT station_id, campaign_id, name, description, partner_name, expiry_date 
            FROM RallyStations 
            WHERE campaign_id = ? AND is_active = 1 
            ORDER BY station_id ASC
        `).bind(campaignId).all();

        return new Response(JSON.stringify(results || []), {
            status: 200,
            headers: { 
                'Content-Type': 'application/json',
                'Cache-Control': 'public, max-age=60'
            }
        });
    } catch (error) {
        console.error('Error in public rally stations API:', error);
        return new Response(JSON.stringify({ error: '無法讀取站點列表', details: error.message }), { status: 500 });
    }
}