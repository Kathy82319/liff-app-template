// functions/cancel-booking.js (新檔案)

export async function onRequest(context) {
    try {
        if (context.request.method !== 'POST') {
            return new Response(JSON.stringify({ error: '無效的請求方法' }), { status: 405 });
        }

        const { bookingId, userId } = await context.request.json();
        if (!bookingId || !userId) {
            return new Response(JSON.stringify({ error: '缺少必要的參數' }), { status: 400 });
        }

        const db = context.env.DB;

        // 安全性檢查：確保使用者只能取消自己的、且狀態為 'confirmed' 的預約
        const stmt = db.prepare(
            "UPDATE Bookings SET status = 'cancelled' WHERE booking_id = ? AND user_id = ? AND status = 'confirmed'"
        );
        const result = await stmt.bind(bookingId, userId).run();

        if (result.meta.changes > 0) {
            // 更新成功
            return new Response(JSON.stringify({ success: true, message: '預約已取消' }), {
                status: 200,
                headers: { 'Content-Type': 'application/json' },
            });
        } else {
            // 沒有任何資料被更新，可能原因：
            // 1. 預約 ID 不存在
            // 2. 該預約不屬於此使用者
            // 3. 預約的狀態不是 'confirmed' (例如已報到或已取消)
            return new Response(JSON.stringify({ error: '無法取消此預約，可能已被處理或不存在' }), {
                status: 403, // Forbidden
                headers: { 'Content-Type': 'application/json' },
            });
        }

    } catch (error) {
        console.error('Error in cancel-booking API:', error);
        return new Response(JSON.stringify({ error: '取消預約時發生伺服器錯誤' }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' },
        });
    }
}