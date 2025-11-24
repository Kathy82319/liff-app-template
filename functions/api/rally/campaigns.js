// functions/api/rally/campaigns.js

export async function onRequest(context) {
    const { request, env } = context;
    const db = env.DB;

    if (request.method !== 'GET') {
        return new Response(JSON.stringify({ error: 'Method Not Allowed' }), { 
            status: 405,
            headers: { 'Content-Type': 'application/json' }
        });
    }

    try {
        // [修改] GET 請求：獲取所有活動，並關聯查詢優惠券的庫存狀況
        // 使用 LEFT JOIN 獲取 VoucherTemplates 的總量
        // 使用子查詢獲取 UserVouchers 目前已發出的數量
        const { results } = await db.prepare(`
            SELECT 
                c.*,
                vt.total_supply AS voucher_total_supply,
                (SELECT COUNT(*) FROM UserVouchers WHERE template_id = c.reward_voucher_id) AS voucher_issued_count
            FROM RallyCampaigns c
            LEFT JOIN VoucherTemplates vt ON c.reward_voucher_id = vt.template_id
            WHERE c.is_active = 1 
            ORDER BY c.campaign_id DESC
        `).all();

        return new Response(JSON.stringify(results || []), {
            status: 200,
            headers: { 
                'Content-Type': 'application/json',
                'Cache-Control': 'public, max-age=60' // 注意：如果有庫存變動，這個快取可能會導致 60 秒延遲，可視需求設為 no-store
            }
        });

    } catch (error) {
        console.error('Error in public rally campaigns API:', error);
        return new Response(JSON.stringify({ error: '無法讀取活動列表', details: error.message }), { status: 500 });
    }
}