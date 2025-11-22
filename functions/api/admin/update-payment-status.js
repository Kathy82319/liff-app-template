// functions/api/admin/update-payment-status.js

export async function onRequest(context) {
    try {
        if (context.request.method !== 'POST') {
            return new Response(JSON.stringify({ error: '無效的請求方法' }), { status: 405 });
        }

        const { bookingId, paymentStatus } = await context.request.json();

        if (!bookingId || !['paid', 'unpaid'].includes(paymentStatus)) {
            return new Response(JSON.stringify({ error: '參數錯誤' }), { status: 400 });
        }

        const db = context.env.DB;
        
        // 檢查欄位是否存在 (若是舊 DB 結構可能無此欄位，這裡做個簡單的防呆或直接更新)
        // 為了效能直接執行 UPDATE，若欄位不存在 D1 會報錯，前端會收到 error
        const stmt = db.prepare("UPDATE Bookings SET payment_status = ? WHERE booking_id = ?");
        await stmt.bind(paymentStatus, bookingId).run();

        return new Response(JSON.stringify({ success: true }), { 
            status: 200,
            headers: { 'Content-Type': 'application/json' }
        });

    } catch (error) {
        console.error('Update Payment Status Error:', error);
        return new Response(JSON.stringify({ error: '更新付款狀態失敗', details: error.message }), { status: 500 });
    }
}