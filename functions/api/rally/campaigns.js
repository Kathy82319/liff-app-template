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

    const url = new URL(request.url);
    const userId = url.searchParams.get('userId'); // 接收 userId

    try {
        // [修改] GET 請求：獲取所有活動
        // 1. 關聯查詢優惠券的庫存狀況 (LEFT JOIN VoucherTemplates)
        // 2. 使用子查詢獲取 UserVouchers 目前已發出的數量
        // 3. [新增] 使用 EXISTS 檢查當前用戶是否已擁有此獎勵券
        
        let query = `
            SELECT 
                c.*,
                vt.total_supply AS voucher_total_supply,
                (SELECT COUNT(*) FROM UserVouchers WHERE template_id = c.reward_voucher_id) AS voucher_issued_count,
                EXISTS (
                    SELECT 1 FROM UserVouchers 
                    WHERE template_id = c.reward_voucher_id AND user_id = ?1
                ) as user_has_redeemed
            FROM RallyCampaigns c
            LEFT JOIN VoucherTemplates vt ON c.reward_voucher_id = vt.template_id
            WHERE c.is_active = 1 
            ORDER BY c.campaign_id DESC
        `;

        // 綁定 userId (如果沒有 userId，就綁定 null，user_has_redeemed 會是 0)
        const { results } = await db.prepare(query).bind(userId || null).all();

        return new Response(JSON.stringify(results || []), {
            status: 200,
            headers: { 
                'Content-Type': 'application/json',
                'Cache-Control': 'no-store' // 建議改為不快取，以確保庫存狀態即時
            }
        });

    } catch (error) {
        console.error('Error in public rally campaigns API:', error);
        return new Response(JSON.stringify({ error: '無法讀取活動列表', details: error.message }), { status: 500 });
    }
}