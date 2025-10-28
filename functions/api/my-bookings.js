// functions/api/my-bookings.js (v3 - Add single booking fetch)

export async function onRequest(context) {
  try {
    const url = new URL(context.request.url);
    const userId = url.searchParams.get('userId');
    const filter = url.searchParams.get('filter') || 'current';
    const bookingIdParam = url.searchParams.get('bookingId'); // Get potential bookingId

    if (!userId) {
      return new Response(JSON.stringify({ error: '缺少使用者 ID 參數。' }), {
        status: 400, headers: { 'Content-Type': 'application/json' },
      });
    }

    const db = context.env.DB;
    let bookingsStmt;
    const bindings = [userId];

    // --- 【修改】如果提供了 bookingId，則查詢單筆 ---
    if (bookingIdParam) {
        const bookingId = Number(bookingIdParam);
        if (isNaN(bookingId)) {
            return new Response(JSON.stringify({ error: '無效的 bookingId。' }), {
                status: 400, headers: { 'Content-Type': 'application/json' },
            });
        }
        console.log(`[my-bookings] Fetching single booking: userId=${userId}, bookingId=${bookingId}`);
        bookingsStmt = db.prepare(
          `SELECT *,
            CASE
              WHEN status = 'confirmed' THEN '預約成功'
              WHEN status = 'checked-in' THEN '已報到'
              WHEN status = 'cancelled' THEN '已取消'
              ELSE '處理中'
            END as status_text
           FROM Bookings
           WHERE user_id = ?1 AND booking_id = ?2` // Query by user_id AND booking_id
        );
        bindings.push(bookingId); // Add bookingId to bindings
    }
    // --- 【修改結束】---
    // --- 既有的列表查詢邏輯 ---
    else {
        console.log(`[my-bookings] Fetching booking list: userId=${userId}, filter=${filter}`);
        const condition = filter === 'current'
          ? "booking_date >= date('now', 'localtime') AND status = 'confirmed'"
          : "(booking_date < date('now', 'localtime') OR status IN ('checked-in', 'cancelled'))"; // Parentheses for clarity

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
           ORDER BY booking_date DESC, time_slot DESC`
        );
        // Only userId binding is needed for list view
    }
    // --- 既有邏輯結束 ---

    const { results: bookings } = await bookingsStmt.bind(...bindings).all();

    if (!bookings || bookings.length === 0) {
        return new Response(JSON.stringify([]), { // Return empty array for both single and list if not found
            status: 200, headers: { 'Content-Type': 'application/json' },
        });
    }

    // --- 獲取 BookingItems 的邏輯保持不變 ---
    const bookingIds = bookings.map(b => b.booking_id);
    const placeholders = bookingIds.map(() => '?').join(',');
    const itemsStmt = db.prepare(`SELECT * FROM BookingItems WHERE booking_id IN (${placeholders})`);
    const { results: allItems } = await itemsStmt.bind(...bookingIds).all();

    // --- 組合回 booking 的邏輯保持不變 ---
    const bookingsWithItems = bookings.map(booking => {
        const itemsForBooking = allItems.filter(item => item.booking_id === booking.booking_id);
        return { ...booking, items: itemsForBooking };
    });

    // --- 回傳結果 (可能是單筆陣列或多筆陣列) ---
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