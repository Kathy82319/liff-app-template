// functions/api/get-bookings.js

export async function onRequest(context) {
  try {
    if (context.request.method !== 'GET') {
      return new Response('Invalid request method.', { status: 405 });
    }

    const { request, env } = context;
    const db = env.DB;
    const url = new URL(request.url);
    const statusFilter = url.searchParams.get('status');
    const searchTerm = url.searchParams.get('search');
    const startDate = url.searchParams.get('startDate');
    const endDate = url.searchParams.get('endDate');

    console.log(`[API get-bookings v4] Params - Status: ${statusFilter}, Search: ${searchTerm}, Start: ${startDate}, End: ${endDate}`); // v4 Log

    let query = "SELECT b.* FROM Bookings b"; // Alias table
    const conditions = [];
    const queryParams = [];
    let paramIndex = 1;

    // --- 1. Status Filter ---
    // 將所有需要參數綁定的 status 條件放在這裡
    if (statusFilter && statusFilter !== 'all' && statusFilter !== 'today' && statusFilter !== 'all_upcoming') {
        if (statusFilter === 'confirmed') {
             // 未來的 confirmed (包含今天)
             conditions.push("b.booking_date >= date('now', 'localtime')");
             conditions.push(`b.status = ?${paramIndex}`);
             queryParams.push('confirmed');
             paramIndex++;
        } else if (['checked-in', 'no-show', 'cancelled'].includes(statusFilter)) {
             // 其他特定狀態
             conditions.push(`b.status = ?${paramIndex}`);
             queryParams.push(statusFilter);
             paramIndex++;
        } else {
             console.warn(`[API get-bookings v4] Ignored invalid status filter: ${statusFilter}`);
        }
    }
    // 特殊的 status 條件，不需參數綁定
    else if (statusFilter === 'today') {
        conditions.push("b.booking_date = date('now', 'localtime')");
        conditions.push("b.status IN ('confirmed', 'checked-in', 'no-show')");
    } else if (statusFilter === 'all_upcoming') {
        conditions.push("b.booking_date >= date('now', 'localtime')");
        conditions.push("b.status IN ('confirmed', 'checked-in', 'no-show')");
    }
    // else: statusFilter is 'all' or not provided -> No status condition added here

    // --- 2. Date Range Filter ---
    // (這部分上次修改後應是正確的，保持不變)
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    const isValidStartDate = startDate && dateRegex.test(startDate);
    const isValidEndDate = endDate && dateRegex.test(endDate);

    if (isValidStartDate && isValidEndDate) {
         conditions.push(`b.booking_date BETWEEN ?${paramIndex} AND ?${paramIndex + 1}`);
         queryParams.push(startDate, endDate);
         paramIndex += 2;
    } else if (isValidStartDate) {
         conditions.push(`b.booking_date >= ?${paramIndex}`);
         queryParams.push(startDate);
         paramIndex += 1;
    } else if (isValidEndDate) {
        conditions.push(`b.booking_date <= ?${paramIndex}`);
        queryParams.push(endDate);
        paramIndex += 1;
    }

    // --- 3. Search Term Filter ---
    // (這部分上次修改後應是正確的，保持不變)
    if (searchTerm) {
        const searchQuery = `%${searchTerm}%`;
        conditions.push(
            `(b.contact_name LIKE ?${paramIndex} OR b.contact_phone LIKE ?${paramIndex + 1} OR CAST(b.booking_id AS TEXT) LIKE ?${paramIndex + 2})`
        );
        queryParams.push(searchQuery, searchQuery, searchQuery);
        paramIndex += 3;
    }

    // --- Combine WHERE clause ---
    if (conditions.length > 0) {
        query += " WHERE " + conditions.join(" AND ");
    }

    // --- Sorting ---
    query += " ORDER BY b.booking_date DESC, b.time_slot DESC";

    console.log(`[API get-bookings v4] Final SQL: ${query}`);
    console.log(`[API get-bookings v4] Final Params: ${JSON.stringify(queryParams)}`);

    // --- Execute query ---
    const bookingsStmt = db.prepare(query).bind(...queryParams);
    const { results: bookings } = await bookingsStmt.all();

    // --- Fetch Items and Combine (保持不變) ---
    if (!bookings || bookings.length === 0) {
        console.log("[API get-bookings v4] No bookings found matching criteria.");
        return new Response(JSON.stringify([]), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    console.log(`[API get-bookings v4] Found ${bookings.length} bookings. Fetching items...`);
    const bookingIds = bookings.map(b => b.booking_id);
    const placeholders = bookingIds.map(() => '?').join(',');
    const itemsStmt = db.prepare(`SELECT * FROM BookingItems WHERE booking_id IN (${placeholders})`);
    const { results: allItems } = await itemsStmt.bind(...bookingIds).all();
    const bookingsWithItems = bookings.map(booking => {
        const itemsForBooking = allItems.filter(item => item.booking_id === booking.booking_id);
        return { ...booking, items: itemsForBooking };
    });

    console.log(`[API get-bookings v4] Returning ${bookingsWithItems.length} bookings with items.`);
    return new Response(JSON.stringify(bookingsWithItems), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('[API get-bookings v4] Error:', error);
    console.error(error.stack); // Log stack trace
    return new Response(JSON.stringify({ error: '獲取預約列表失敗。', details: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}