// functions/api/get-bookings.js (v10 - 支援真實姓名與完整搜尋)

export async function onRequest(context) {
  try {
    if (context.request.method !== 'GET') {
      return new Response(JSON.stringify({ error: '無效的請求方法' }), { status: 405 });
    }

    const { request, env } = context;
    const db = env.DB;
    const url = new URL(request.url);
    const statusFilter = url.searchParams.get('status');
    const searchTerm = url.searchParams.get('search');
    const startDate = url.searchParams.get('startDate');
    const endDate = url.searchParams.get('endDate');
    const specificDate = url.searchParams.get('date');

    // 【修改 1】加入 LEFT JOIN Users 以獲取 real_name
    let query = `
        SELECT b.*, u.real_name 
        FROM Bookings b
        LEFT JOIN Users u ON b.user_id = u.user_id
    `;
    
    const conditions = [];
    const queryParams = [];

    // --- 1. Status Filter ---
    const trimmedStatusFilter = statusFilter ? statusFilter.trim() : null;

    if (specificDate && /^\d{4}-\d{2}-\d{2}$/.test(specificDate)) {
        conditions.push("b.booking_date = ?");
        queryParams.push(specificDate);
        conditions.push("b.status IN ('confirmed', 'checked-in', 'no-show')");
    }
    else if (trimmedStatusFilter && trimmedStatusFilter !== 'all') {
        if (trimmedStatusFilter === 'today') {
            conditions.push("b.booking_date = date('now', 'localtime')");
            conditions.push("b.status IN ('confirmed', 'checked-in', 'no-show')");
        } else if (trimmedStatusFilter === 'all_upcoming') {
            conditions.push("b.booking_date >= date('now', 'localtime')");
            conditions.push("b.status IN ('confirmed', 'checked-in', 'no-show')");
        } else if (trimmedStatusFilter === 'confirmed') {
             conditions.push("b.booking_date >= date('now', 'localtime')");
             conditions.push(`b.status = ?`);
             queryParams.push('confirmed');
        } else if (['checked-in', 'no-show', 'cancelled'].includes(trimmedStatusFilter)) {
             conditions.push(`b.status = ?`);
             queryParams.push(trimmedStatusFilter);
        }
    }

    // --- 2. Date Range Filter ---
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (startDate && dateRegex.test(startDate) && endDate && dateRegex.test(endDate)) {
         conditions.push(`b.booking_date BETWEEN ? AND ?`);
         queryParams.push(startDate, endDate);
    }

    // --- 3. Search Term Filter (增強版) ---
    // 【修改 2】支援搜尋 real_name, booking_id (轉文字), contact_name, contact_phone
    if (searchTerm) {
        const searchQuery = `%${searchTerm}%`;
        conditions.push(
            `(b.contact_name LIKE ? OR b.contact_phone LIKE ? OR CAST(b.booking_id AS TEXT) LIKE ? OR u.real_name LIKE ?)`
        );
        queryParams.push(searchQuery, searchQuery, searchQuery, searchQuery);
    }

    // --- Combine WHERE clause ---
    if (conditions.length > 0) {
        query += " WHERE " + conditions.join(" AND ");
    }

    // --- Sorting ---
    query += " ORDER BY b.booking_date DESC, b.time_slot DESC";

    const bookingsStmt = db.prepare(query);
    const { results: bookings } = await bookingsStmt.bind(...queryParams).all();

    // --- Fetch Items and Combine (保持不變) ---
    if (!bookings || bookings.length === 0) {
        return new Response(JSON.stringify([]), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }

    const bookingIds = bookings.map(b => b.booking_id);
    const placeholders = bookingIds.map(() => '?').join(',');

    if (bookingIds.length > 0) {
        const itemsStmt = db.prepare(`SELECT * FROM BookingItems WHERE booking_id IN (${placeholders})`);
        const { results: allItems } = await itemsStmt.bind(...bookingIds).all();
        const bookingsWithItems = bookings.map(booking => {
            const itemsForBooking = allItems.filter(item => item.booking_id === booking.booking_id);
            return { ...booking, items: itemsForBooking };
        });

        return new Response(JSON.stringify(bookingsWithItems), {
          status: 200, headers: { 'Content-Type': 'application/json' },
        });
     } else {
         return new Response(JSON.stringify([]), { status: 200, headers: { 'Content-Type': 'application/json' } });
     }

  } catch (error) {
    console.error('[API get-bookings] Error:', error);
    return new Response(JSON.stringify({ error: '獲取預約列表失敗。', details: error.message }), {
      status: 500, headers: { 'Content-Type': 'application/json' },
    });
  }
}