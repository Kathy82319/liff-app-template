// functions/api/my-vouchers.js
export async function onRequest(context) {
    const { request, env } = context;
    const db = env.DB;

    try {
        if (request.method !== 'GET') {
            return new Response(JSON.stringify({ error: '無效的請求方法' }), { status: 405 });
        }

        const url = new URL(request.url);
        const userId = url.searchParams.get('userId');

        if (!userId) {
            return new Response(JSON.stringify({ error: '缺少使用者 ID' }), { status: 400 });
        }

        // 聯集查詢：從 UserVouchers 找到使用者的券，並 JOIN VoucherTemplates 獲取券的詳細內容
        const stmt = db.prepare(
            `SELECT 
                uv.voucher_id, 
                uv.is_used, 
                uv.issued_at, 
                uv.used_at,
                vt.title, 
                vt.type, 
                vt.value, 
                vt.redeem_item_name, 
                vt.min_spend, 
                vt.valid_from, 
                vt.valid_to,
                vt.applicable_product_ids,
                vt.applicable_days_of_week
            FROM UserVouchers AS uv
            JOIN VoucherTemplates AS vt ON uv.template_id = vt.template_id
            WHERE uv.user_id = ? 
            ORDER BY uv.is_used ASC, vt.valid_to ASC, uv.issued_at DESC` // 優先顯示未使用、快到期的
        );

        const { results } = await stmt.bind(userId).all();

        const vouchers = results.map(v => ({
            ...v,
            applicable_product_ids: JSON.parse(v.applicable_product_ids || '[]'),
            applicable_days_of_week: JSON.parse(v.applicable_days_of_week || '[]')
        }));

        return new Response(JSON.stringify(vouchers), {
            status: 200, 
            headers: { 'Content-Type': 'application/json' }
        });

    } catch (error) {
        console.error('My Vouchers API Error:', error);
        return new Response(JSON.stringify({ error: '查詢優惠券時發生錯誤', details: error.message }), { 
            status: 500,
            headers: { 'Content-Type': 'application/json' }
        });
    }
}