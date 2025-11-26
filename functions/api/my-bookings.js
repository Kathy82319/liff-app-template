

export async function onRequest(context) {
  try {
    const url = new URL(context.request.url);
    const userId = url.searchParams.get('userId');
    const filter = url.searchParams.get('filter') || 'current';
    const bookingIdParam = url.searchParams.get('bookingId');

    if (!userId) {
      return new Response(JSON.stringify({ error: '缺少使用者 ID 參數。' }), {
        status: 400, headers: { 'Content-Type': 'application/json' },
      });
    }

    const db = context.env.DB;
    let bookingsStmt;
    const bindings = [userId];

    if (bookingIdParam) {
        const bookingId = Number(bookingIdParam);
        if (isNaN(bookingId)) {
            return new Response(JSON.stringify({ error: '無效的 bookingId。' }), {
                status: 400, headers: { 'Content-Type': 'application/json' },
            });
        }
        bookingsStmt = db.prepare(
          `SELECT *,
            CASE
              WHEN status = 'confirmed' THEN '預約成功'
              WHEN status = 'checked-in' THEN '已報到'
              WHEN status = 'cancelled' THEN '已取消'
              ELSE '處理中'
            END as status_text
           FROM Bookings
           WHERE user_id = ?1 AND booking_id = ?2`
        );
        bindings.push(bookingId);
    }
    else {
        const condition = filter === 'current'
          ? "booking_date >= date('now', 'localtime') AND status = 'confirmed'"
          : "(booking_date < date('now', 'localtime') OR status IN ('checked-in', 'cancelled'))";

        // 【修正重點】將排序改為 booking_id DESC，確保最新建立的訂單排在最上面
        // 如果您希望依照「入住日期」排序，可以維持 booking_date DESC
        // 但依照使用者需求 "最新的預約應該排在最上面"，通常指 "我剛剛建立的那筆"，所以 ID DESC 是最準確的。
        bookingsStmt = db.prepare(
          `SELECT *,
            CASE
              WHEN status = 'confirmed' THEN '預約成功'
              WHEN status = 'checked-in' THEN '已報到'
              WHEN status = 'cancelled' THEN '已取消'
              ELSE '處理中'
            END as status_text
           FROM Bookings
           WHERE user_id = ?1 AND (${condition})
           ORDER BY booking_id DESC` 
        );
    }

    const { results: bookings } = await bookingsStmt.bind(...bindings).all();

    if (!bookings || bookings.length === 0) {
        return new Response(JSON.stringify([]), {
            status: 200, headers: { 'Content-Type': 'application/json' },
        });
    }

    const bookingIds = bookings.map(b => b.booking_id);
    const placeholders = bookingIds.map(() => '?').join(',');
    const itemsStmt = db.prepare(`SELECT * FROM BookingItems WHERE booking_id IN (${placeholders})`);
    const { results: allItems } = await itemsStmt.bind(...bookingIds).all();

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
