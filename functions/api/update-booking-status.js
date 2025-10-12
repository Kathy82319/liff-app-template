// functions/api/update-booking-status.js

export async function onRequest(context) {
  try {
    if (context.request.method !== 'POST') {
      return new Response(JSON.stringify({ error: '無效的請求方法' }), { status: 405 });
    }

    const { bookingId, status } = await context.request.json();
    const ALLOWED_STATUSES = ['confirmed', 'checked-in', 'cancelled'];

    // --- 後端安全驗證 ---
    if (!bookingId || typeof bookingId !== 'number') {
      return new Response(JSON.stringify({ error: '缺少有效的預約 ID。' }), { status: 400 });
    }
    if (!status || !ALLOWED_STATUSES.includes(status)) {
      return new Response(JSON.stringify({ error: '無效的狀態。' }), { status: 400 });
    }

    const db = context.env.DB;
    const stmt = db.prepare('UPDATE Bookings SET status = ? WHERE booking_id = ?');
    const result = await stmt.bind(status, bookingId).run();

    if (result.meta.changes === 0) {
      // 找不到 booking_id 或狀態本來就一樣，都視為成功，只是沒有變動。
      // 為了前端操作順暢，我們不回傳錯誤。
      return new Response(JSON.stringify({ success: true, message: '沒有任何變動。' }), { status: 200 });
    }

    return new Response(JSON.stringify({ success: true, message: '狀態更新成功！' }), {
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