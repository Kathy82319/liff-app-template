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

    console.log(`[API get-bookings v3] Params - Status: ${statusFilter}, Search: ${searchTerm}, Start: ${startDate}, End: ${endDate}`); // v3 Log

    let query = "SELECT b.* FROM Bookings b"; // Alias the table for clarity
    const conditions = [];
    const queryParams = [];
    let paramIndex = 1;

    // --- 1. Status Filter ---
    if (statusFilter && statusFilter !== 'all') {
        if (statusFilter === 'today') {
            // Use specific date function and IN clause without parameters for today
            conditions.push("b.booking_date = date('now', 'localtime')");
            conditions.push("b.status IN ('confirmed', 'checked-in', 'no-show')");
        } else if (statusFilter === 'all_upcoming') {
            // Use date function without parameters
            conditions.push("b.booking_date >= date('now', 'localtime')");
            conditions.push("b.status IN ('confirmed', 'checked-in', 'no-show')");
        } else if (statusFilter === 'confirmed') {
             // Future confirmed needs date check and status parameter
             conditions.push("b.booking_date >= date('now', 'localtime')");
             conditions.push(`b.status = ?${paramIndex}`);
             queryParams.push('confirmed');
             paramIndex++;
        } else if (['checked-in', 'no-show', 'cancelled'].includes(statusFilter)) {
             // Other specific statuses use a parameter
             conditions.push(`b.status = ?${paramIndex}`);
             queryParams.push(statusFilter);
             paramIndex++;
        } else {
              console.warn(`[API get-bookings v3] Ignored invalid status filter: ${statusFilter}`);
        }
    }
    // else: statusFilter is 'all' or not provided -> No status condition

    // --- 2. Date Range Filter ---
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    const isValidStartDate = startDate && dateRegex.test(startDate);
    const isValidEndDate = endDate && dateRegex.test(endDate);

    if (isValidStartDate && isValidEndDate) {
         // Use BETWEEN with parameters
         conditions.push(`b.booking_date BETWEEN ?${paramIndex} AND ?${paramIndex + 1}`);
         queryParams.push(startDate, endDate);
         paramIndex += 2;
    } else if (isValidStartDate) {
         // Use >= with parameter
         conditions.push(`b.booking_date >= ?${paramIndex}`);
         queryParams.push(startDate);
         paramIndex += 1;
    } else if (isValidEndDate) {
        // Use <= with parameter
        conditions.push(`b.booking_date <= ?${paramIndex}`);
        queryParams.push(endDate);
        paramIndex += 1;
    }
    // else: No valid date range provided

    // --- 3. Search Term Filter ---
    if (searchTerm) {
        const searchQuery = `%${searchTerm}%`;
        // Use parameters for each LIKE clause
        conditions.push(
            // 【修正】確保欄位名稱前有別名 b.
            `(b.contact_name LIKE ?${paramIndex} OR b.contact_phone LIKE ?${paramIndex + 1} OR CAST(b.booking_id AS TEXT) LIKE ?${paramIndex + 2})` // Cast booking_id to TEXT for LIKE
        );
        queryParams.push(searchQuery, searchQuery, searchQuery);
        paramIndex += 3;
    }

    // --- Combine WHERE clause ---
    if (conditions.length > 0) {
        query += " WHERE " + conditions.join(" AND "); // Use AND to combine all conditions
    }

    // --- Sorting ---
    query += " ORDER BY b.booking_date DESC, b.time_slot DESC"; // Add alias b.

    console.log(`[API get-bookings v3] Final SQL: ${query}`);
    console.log(`[API get-bookings v3] Final Params: ${JSON.stringify(queryParams)}`);

    // --- Execute query ---
    const bookingsStmt = db.prepare(query).bind(...queryParams);
    const { results: bookings } = await bookingsStmt.all();

    // --- Fetch Items and Combine (No changes needed here) ---
    if (!bookings || bookings.length === 0) {
        console.log("[API get-bookings v3] No bookings found matching criteria."); // Add log
        return new Response(JSON.stringify([]), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    // ... (fetch items logic remains the same) ...
     console.log(`[API get-bookings v3] Found ${bookings.length} bookings. Fetching items...`);
     const bookingIds = bookings.map(b => b.booking_id);
     const placeholders = bookingIds.map(() => '?').join(',');
     const itemsStmt = db.prepare(`SELECT * FROM BookingItems WHERE booking_id IN (${placeholders})`);
     const { results: allItems } = await itemsStmt.bind(...bookingIds).all();
     const bookingsWithItems = bookings.map(booking => {
         const itemsForBooking = allItems.filter(item => item.booking_id === booking.booking_id);
         return { ...booking, items: itemsForBooking };
     });


    console.log(`[API get-bookings v3] Returning ${bookingsWithItems.length} bookings with items.`); // Add log
    return new Response(JSON.stringify(bookingsWithItems), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('[API get-bookings v3] Error:', error);
    console.error(error.stack);
    return new Response(JSON.stringify({ error: '獲取預約列表失敗。', details: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}