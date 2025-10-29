// functions/api/get-bookings.js (Cleaned version based on v8 logic)

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

    // Basic operational log
    console.log(`[API get-bookings] Request Params - Status: ${statusFilter}, Search: ${searchTerm}, Start: ${startDate}, End: ${endDate}`);

    let query = "SELECT b.* FROM Bookings b"; // Alias table
    const conditions = [];
    const queryParams = [];

    // --- 1. Status Filter (Using trim() for safety) ---
    const trimmedStatusFilter = statusFilter ? statusFilter.trim() : null;

    if (trimmedStatusFilter && trimmedStatusFilter !== 'all') {
        if (trimmedStatusFilter === 'today') {
            conditions.push("b.booking_date = date('now', 'localtime')");
            conditions.push("b.status IN ('confirmed', 'checked-in', 'no-show')");
        } else if (trimmedStatusFilter === 'all_upcoming') {
            conditions.push("b.booking_date >= date('now', 'localtime')");
            conditions.push("b.status IN ('confirmed', 'checked-in', 'no-show')");
        } else if (trimmedStatusFilter === 'confirmed') {
             conditions.push("b.booking_date >= date('now', 'localtime')");
             conditions.push(`b.status = ?${queryParams.length + 1}`);
             queryParams.push('confirmed');
        } else if (['checked-in', 'no-show', 'cancelled'].includes(trimmedStatusFilter)) {
             conditions.push(`b.status = ?${queryParams.length + 1}`);
             queryParams.push(trimmedStatusFilter); // Use the trimmed value
        } else {
             // Silently ignore invalid status filters in production, or log a warning
             console.warn(`[API get-bookings] Ignored potentially invalid status filter: "${trimmedStatusFilter}" (Raw: "${statusFilter}")`);
        }
    }

    // --- 2. Date Range Filter ---
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    const isValidStartDate = startDate && dateRegex.test(startDate);
    const isValidEndDate = endDate && dateRegex.test(endDate);

    if (isValidStartDate && isValidEndDate) {
         conditions.push(`b.booking_date BETWEEN ?${queryParams.length + 1} AND ?${queryParams.length + 2}`);
         queryParams.push(startDate, endDate);
    } else if (isValidStartDate) {
         conditions.push(`b.booking_date >= ?${queryParams.length + 1}`);
         queryParams.push(startDate);
    } else if (isValidEndDate) {
        conditions.push(`b.booking_date <= ?${queryParams.length + 1}`);
        queryParams.push(endDate);
    }

    // --- 3. Search Term Filter ---
    if (searchTerm) {
        const searchQuery = `%${searchTerm}%`;
        conditions.push(
            `(b.contact_name LIKE ?${queryParams.length + 1} OR b.contact_phone LIKE ?${queryParams.length + 2} OR CAST(b.booking_id AS TEXT) LIKE ?${queryParams.length + 3})`
        );
        queryParams.push(searchQuery, searchQuery, searchQuery);
    }

    // --- Combine WHERE clause ---
    if (conditions.length > 0) {
        query += " WHERE " + conditions.join(" AND ");
    }

    // --- Sorting ---
    query += " ORDER BY b.booking_date DESC, b.time_slot DESC";

    // Log the final query and params before execution (useful for debugging)
    console.log(`[API get-bookings] Final SQL: ${query}`);
    console.log(`[API get-bookings] Final Params: ${JSON.stringify(queryParams)}`);

    // --- Execute query ---
    let bookingsStmt;
    try {
        bookingsStmt = db.prepare(query);
        if (queryParams.length > 0) {
             bookingsStmt = bookingsStmt.bind(...queryParams);
        }
    } catch (prepareError) {
         console.error("[API get-bookings] Error preparing SQL statement:", prepareError);
         console.error("SQL attempted:", query);
         console.error("Params attempted:", JSON.stringify(queryParams));
         throw new Error(`Failed to prepare SQL query: ${prepareError.message}`);
    }

    const { results: bookings } = await bookingsStmt.all();

    // --- Fetch Items and Combine ---
    if (!bookings || bookings.length === 0) {
        // No need to log here usually, unless debugging empty results
        return new Response(JSON.stringify([]), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }

    const bookingIds = bookings.map(b => b.booking_id);
    const placeholders = bookingIds.map(() => '?').join(',');

    // Ensure placeholders exist before querying items
    if (bookingIds.length > 0) {
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
     } else {
         // Should technically not be reached if bookings array was checked
         return new Response(JSON.stringify([]), { status: 200, headers: { 'Content-Type': 'application/json' } });
     }

  } catch (error) {
    // Log errors in production
    console.error('[API get-bookings] Error:', error);
    console.error(error.stack); // Log stack trace for detailed debugging if needed
    return new Response(JSON.stringify({ error: '獲取預約列表失敗。', details: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}