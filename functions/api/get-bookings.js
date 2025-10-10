// functions/api/get-bookings.js (v2 - 多項目支援版)

export async function onRequest(context) {
  try {
    if (context.request.method !== 'GET') {
      return new Response('Invalid request method.', { status: 405 });
    }

    const { request, env } = context;
    const db = env.DB;
    const url = new URL(request.url);
    const statusFilter = url.searchParams.get('status');

    // 1. 先查詢主要的 Bookings 列表
    let query = "SELECT * FROM Bookings";
    const queryParams = [];
    const conditions = [];

    if (statusFilter === 'today') {
        conditions.push("booking_date = date('now', 'localtime')");
        conditions.push("status IN ('confirmed', 'checked-in')");
    } else if (statusFilter === 'all_upcoming') {
        conditions.push("booking_date >= date('now', 'localtime')");
        conditions.push("status IN ('confirmed', 'checked-in')"); // 只顯示未取消的
    } else if (statusFilter === 'confirmed') { // 未來的預約
        conditions.push("booking_date > date('now', 'localtime')");
        conditions.push("status = 'confirmed'");
    } else if (statusFilter) {
        conditions.push("status = ?");
        queryParams.push(statusFilter);
    } else {
        conditions.push("booking_date >= date('now', 'localtime')");
    }

    if (conditions.length > 0) {
        query += " WHERE " + conditions.join(" AND ");
    }
    query += " ORDER BY booking_date ASC, time_slot ASC";

    const bookingsStmt = db.prepare(query).bind(...queryParams);
    const { results: bookings } = await bookingsStmt.all();

    if (!bookings || bookings.length === 0) {
        return new Response(JSON.stringify([]), {
            status: 200, headers: { 'Content-Type': 'application/json' },
        });
    }

    // 2. 一次性獲取所有相關的 BookingItems
    const bookingIds = bookings.map(b => b.booking_id);
    const placeholders = bookingIds.map(() => '?').join(','); // ?,?,?
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
    console.error('Error in get-bookings API:', error);
    return new Response(JSON.stringify({ error: '獲取預約列表失敗。', details: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}