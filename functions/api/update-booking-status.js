// functions/api/update-booking-status.js

export async function onRequest(context) {
  try {
    if (context.request.method !== 'POST') {
      return new Response(JSON.stringify({ error: '無效的請求方法' }), { status: 405 });
    }

    const { bookingId, status } = await context.request.json();
    const ALLOWED_STATUSES = ['confirmed', 'checked-in', 'cancelled', 'no-show'];

    if (!bookingId || typeof bookingId !== 'number') {
      return new Response(JSON.stringify({ error: '缺少有效的預約 ID。' }), { status: 400 });
    }
    if (!status || !ALLOWED_STATUSES.includes(status)) {
      return new Response(JSON.stringify({ error: '無效的狀態。' }), { status: 400 });
    }

    const db = context.env.DB;
    
    // --- 【核心修正：狀態連動邏輯】 ---
    // 1. 更新預約狀態 (原本的邏輯)
    const updateBookingStmt = db.prepare('UPDATE Bookings SET status = ? WHERE booking_id = ?');
    const batchOps = [updateBookingStmt.bind(status, bookingId)];

    // 2. 連動更新對帳狀態 (payment_status)
    // 如果狀態變更為 "取消" 或 "未到"，強制將對帳設為 'unpaid' (未付款)
    if (['cancelled', 'no-show'].includes(status)) {
        const updatePaymentStmt = db.prepare("UPDATE Bookings SET payment_status = 'unpaid' WHERE booking_id = ?");
        batchOps.push(updatePaymentStmt.bind(bookingId));
        console.log(`[Auto-Sync] Booking #${bookingId} cancelled/no-show -> Set payment to 'unpaid'.`);
    } 
    // 如果狀態變更為 "已確認" 或 "已報到"，將對帳設為 NULL (恢復預設邏輯：顯示為開啟，但允許手動關閉)
    else if (['confirmed', 'checked-in'].includes(status)) {
        // 這裡我們設為 NULL，讓 financial-report 的預設邏輯接手 (confirmed = 預設已付)
        // 這樣如果使用者之前手動把它關掉了，這裡會重置為預設 (開啟)。這通常符合邏輯 (恢復訂單=恢復收款預期)。
        const updatePaymentStmt = db.prepare("UPDATE Bookings SET payment_status = NULL WHERE booking_id = ?");
        batchOps.push(updatePaymentStmt.bind(bookingId));
    }

    // 3. 執行批次更新
    await db.batch(batchOps);

    return new Response(JSON.stringify({ success: true, message: '狀態更新成功 (對帳狀態已同步)！' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error in update-booking-status API:', error);
    return new Response(JSON.stringify({ error: '更新預約狀態時發生錯誤', details: error.message }), {
      status: 500,
    });
  }
}