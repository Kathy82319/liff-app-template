// functions/api/admin/redeem-voucher.js
export async function onRequest(context) {
    const { request, env } = context;
    const db = env.DB;

    try {
        if (request.method !== 'POST') {
            return new Response(JSON.stringify({ error: '無效的請求方法' }), { status: 405 });
        }

        const { voucherId } = await request.json();

        if (!voucherId) {
            return new Response(JSON.stringify({ error: '缺少優惠券 ID (voucherId)' }), { status: 400 });
        }

        // 1. 檢查這張券的狀態
        const voucher = await db.prepare("SELECT * FROM UserVouchers WHERE voucher_id = ?").bind(voucherId).first();

        if (!voucher) {
            return new Response(JSON.stringify({ error: '找不到這張優惠券' }), { status: 404 });
        }

        if (voucher.is_used) {
            return new Response(JSON.stringify({ error: `核銷失敗：此券已於 ${voucher.used_at} 使用` }), { status: 409 });
        }

        // 2. 執行核銷：更新 is_used 和 used_at
        const stmt = db.prepare(
            "UPDATE UserVouchers SET is_used = 1, used_at = datetime('now', 'localtime') WHERE voucher_id = ? AND is_used = 0"
        );
        
        const result = await stmt.bind(voucherId).run();

        if (result.meta.changes === 0) {
            // 這可能在極端的併發情況下發生 (兩人同時核銷)
            return new Response(JSON.stringify({ error: '核銷失敗，可能剛才已被使用' }), { status: 409 });
        }

        return new Response(JSON.stringify({ success: true, message: '優惠券核銷成功' }), { 
            status: 200,
            headers: { 'Content-Type': 'application/json' }
        });

    } catch (error) {
        console.error('Redeem Voucher API Error:', error);
        return new Response(JSON.stringify({ error: '核銷優惠券時發生錯誤', details: error.message }), { 
            status: 500,
            headers: { 'Content-Type': 'application/json' }
        });
    }
}