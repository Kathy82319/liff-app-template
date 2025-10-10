// functions/api/my-bookings.js (v2 - 多項目支援版)

export async function onRequest(context) {
  try {
    const url = new URL(context.request.url);
    const userId = url.searchParams.get('userId');
    const filter = url.searchParams.get('filter') || 'current';

    if (!userId) {
      return new Response(JSON.stringify({ error: '缺少使用者 ID 參數。' }), {
        status: 400, headers: { 'Content-Type': 'application/json' },
      });
    }

    const db = context.env.DB;
    
    // 1. 先查詢該使用者的 Bookings 列表
    const condition = filter === 'current' 
      ? "booking_date >= date('now', 'localtime') AND status = 'confirmed'" 
      : "booking_date < date('now', 'localtime') OR status IN ('checked-in', 'cancelled')";
    
    const bookingsStmt = db.prepare(
      `SELECT *,
        CASE 
          WHEN status = 'confirmed' THEN '預約成功'
          WHEN status = 'checked-in' THEN '已報到'
          WHEN status = 'cancelled' THEN '已取消'
          ELSE '處理中'
        END as status_text
       FROM Bookings 
       WHERE user_id = ? AND (${condition})
       ORDER BY booking_date DESC, time_slot DESC`
    );
    const { results: bookings } = await bookingsStmt.bind(userId).all();
    
    if (!bookings || bookings.length === 0) {
        return new Response(JSON.stringify([]), {
            status: 200, headers: { 'Content-Type': 'application/json' },
        });
    }

    // 2. 一次性獲取所有相關的 BookingItems
    const bookingIds = bookings.map(b => b.booking_id);
    const placeholders = bookingIds.map(() => '?').join(',');
    const itemsStmt = db.prepare(`SELECT * FROM BookingItems WHERE booking_id IN (${placeholders})`);
    const { results: allItems } = await itemsStmt.bind(...bookingIds).all();

    // 3. 將 items 組合回對應的 booking 中
    const bookingsWithItems = bookings.map(booking => {
        const itemsForBooking = allItems.filter(item => item.booking_id === booking.booking_id);
        return { ...booking, items: itemsForBooking };
    });

    return new Response(JSON.stringify(bookingsWithItems), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error in my-bookings API:', error);
    return new Response(JSON.stringify({ error: '查詢個人預約紀錄失敗。' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}