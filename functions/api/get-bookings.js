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

    // More detailed logging for debugging
    console.log(`[API get-bookings v5] Received Params - Status: ${statusFilter}, Search: ${searchTerm}, Start: ${startDate}, End: ${endDate}`);

    let query = "SELECT b.* FROM Bookings b";
    const conditions = [];
    const queryParams = [];

    // --- 1. Status Filter ---
    // Handle status filters that might require parameter binding first
    if (statusFilter && statusFilter !== 'all' && statusFilter !== 'today' && statusFilter !== 'all_upcoming') {
        if (statusFilter === 'confirmed') {
             // Future confirmed (includes today)
             conditions.push("b.booking_date >= date('now', 'localtime')");
             conditions.push(`b.status = ?${queryParams.length + 1}`); // Use current length + 1 for index
             queryParams.push('confirmed');
        } else if (['checked-in', 'no-show', 'cancelled'].includes(statusFilter)) {
             // Other specific statuses
             conditions.push(`b.status = ?${queryParams.length + 1}`); // Use current length + 1 for index
             queryParams.push(statusFilter);
        } else {
             console.warn(`[API get-bookings v5] Ignored invalid status filter: ${statusFilter}`);
        }
    }
    // Handle special status filters without parameters
    else if (statusFilter === 'today') {
        conditions.push("b.booking_date = date('now', 'localtime')");
        conditions.push("b.status IN ('confirmed', 'checked-in', 'no-show')");
    } else if (statusFilter === 'all_upcoming') {
        conditions.push("b.booking_date >= date('now', 'localtime')");
        conditions.push("b.status IN ('confirmed', 'checked-in', 'no-show')");
    }
    // else: statusFilter is 'all' or not provided

    // --- 2. Date Range Filter ---
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    const isValidStartDate = startDate && dateRegex.test(startDate);
    const isValidEndDate = endDate && dateRegex.test(endDate);

    if (isValidStartDate && isValidEndDate) {
         conditions.push(`b.booking_date BETWEEN ?${queryParams.length + 1} AND ?${queryParams.length + 2}`); // Use current length + 1/2
         queryParams.push(startDate, endDate);
    } else if (isValidStartDate) {
         conditions.push(`b.booking_date >= ?${queryParams.length + 1}`); // Use current length + 1
         queryParams.push(startDate);
    } else if (isValidEndDate) {
        conditions.push(`b.booking_date <= ?${queryParams.length + 1}`); // Use current length + 1
        queryParams.push(endDate);
    }

    // --- 3. Search Term Filter ---
    if (searchTerm) {
        const searchQuery = `%${searchTerm}%`;
        conditions.push(
            `(b.contact_name LIKE ?${queryParams.length + 1} OR b.contact_phone LIKE ?${queryParams.length + 2} OR CAST(b.booking_id AS TEXT) LIKE ?${queryParams.length + 3})` // Use current length + 1/2/3
        );
        queryParams.push(searchQuery, searchQuery, searchQuery);
    }

    // --- Combine WHERE clause ---
    if (conditions.length > 0) {
        query += " WHERE " + conditions.join(" AND ");
    }

    // --- Sorting ---
    query += " ORDER BY b.booking_date DESC, b.time_slot DESC";

    console.log(`[API get-bookings v5] Final SQL: ${query}`);
    console.log(`[API get-bookings v5] Final Params: ${JSON.stringify(queryParams)}`);

    // --- Execute query ---
    // Ensure statement preparation and binding are correct
    let bookingsStmt;
    try {
        bookingsStmt = db.prepare(query);
        if (queryParams.length > 0) {
             bookingsStmt = bookingsStmt.bind(...queryParams);
        }
    } catch (prepareError) {
         console.error("[API get-bookings v5] Error preparing SQL statement:", prepareError);
         console.error("SQL attempted:", query);
         console.error("Params attempted:", JSON.stringify(queryParams));
         throw new Error(`Failed to prepare SQL query: ${prepareError.message}`); // Re-throw a more specific error
    }

    const { results: bookings } = await bookingsStmt.all();


    // --- Fetch Items and Combine (No changes needed here) ---
    if (!bookings || bookings.length === 0) {
        console.log("[API get-bookings v5] No bookings found matching criteria.");
        return new Response(JSON.stringify([]), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    // ... (fetch items logic remains the same) ...
     console.log(`[API get-bookings v5] Found ${bookings.length} bookings. Fetching items...`);
     const bookingIds = bookings.map(b => b.booking_id);
     const placeholders = bookingIds.map(() => '?').join(',');
     // Ensure placeholders are generated correctly even for a single ID
     if (bookingIds.length > 0) {
        const itemsStmt = db.prepare(`SELECT * FROM BookingItems WHERE booking_id IN (${placeholders})`);
        const { results: allItems } = await itemsStmt.bind(...bookingIds).all();
        const bookingsWithItems = bookings.map(booking => {
            const itemsForBooking = allItems.filter(item => item.booking_id === booking.booking_id);
            return { ...booking, items: itemsForBooking };
        });

        console.log(`[API get-bookings v5] Returning ${bookingsWithItems.length} bookings with items.`);
        return new Response(JSON.stringify(bookingsWithItems), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
     } else {
        // Should not happen if bookings.length > 0, but as a safeguard
         console.log("[API get-bookings v5] No booking IDs found, returning empty items (this shouldn't happen).");
         return new Response(JSON.stringify([]), { status: 200, headers: { 'Content-Type': 'application/json' } });
     }


  } catch (error) {
    console.error('[API get-bookings v5] Error:', error);
    console.error(error.stack);
    return new Response(JSON.stringify({ error: '獲取預約列表失敗。', details: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}