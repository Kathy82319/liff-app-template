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

    console.log(`[API get-bookings] Params - Status: ${statusFilter}, Search: ${searchTerm}, Start: ${startDate}, End: ${endDate}`); // Log incoming params

    let query = "SELECT * FROM Bookings";
    const conditions = [];
    const queryParams = [];
    let paramIndex = 1; // Parameter index starts at 1

    // 1. Status Filter (Using parameters)
    if (statusFilter && statusFilter !== 'all') {
        // Define allowed statuses to prevent SQL injection if statusFilter somehow contains malicious code
        const allowedStatuses = ['today', 'all_upcoming', 'confirmed', 'checked-in', 'no-show', 'cancelled'];
        if (allowedStatuses.includes(statusFilter)) {
            if (statusFilter === 'today') {
                conditions.push("booking_date = date('now', 'localtime')");
                conditions.push("status IN ('confirmed', 'checked-in', 'no-show')");
            } else if (statusFilter === 'all_upcoming') {
                conditions.push("booking_date >= date('now', 'localtime')");
                conditions.push("status IN ('confirmed', 'checked-in', 'no-show')");
            } else if (statusFilter === 'confirmed') {
                conditions.push("booking_date >= date('now', 'localtime')");
                conditions.push(`status = ?${paramIndex}`);
                queryParams.push('confirmed'); // Bind 'confirmed'
                paramIndex++;
            } else { // checked-in, no-show, cancelled
                conditions.push(`status = ?${paramIndex}`);
                queryParams.push(statusFilter); // Bind the specific status
                paramIndex++;
            }
        } else {
             console.warn(`[API get-bookings] Ignored invalid status filter: ${statusFilter}`);
             // Optionally return an error or just ignore the invalid filter
        }
    }
    // else: statusFilter is 'all' or not provided -> No status condition

    // 2. Date Range Filter (Using parameters)
    // Validate date format before using
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    const isValidStartDate = startDate && dateRegex.test(startDate);
    const isValidEndDate = endDate && dateRegex.test(endDate);

    if (isValidStartDate && isValidEndDate) {
         conditions.push(`booking_date BETWEEN ?${paramIndex} AND ?${paramIndex + 1}`);
         queryParams.push(startDate, endDate);
         paramIndex += 2;
    } else if (isValidStartDate) {
         conditions.push(`booking_date >= ?${paramIndex}`);
         queryParams.push(startDate);
         paramIndex += 1;
    } else if (isValidEndDate) {
        conditions.push(`booking_date <= ?${paramIndex}`);
        queryParams.push(endDate);
        paramIndex += 1;
    }
    // else: No valid date range provided

    // 3. Search Term Filter (Corrected Parameter Binding)
    if (searchTerm) {
        const searchQuery = `%${searchTerm}%`;
        // Use separate parameter indices for each LIKE clause
        conditions.push(
            `(contact_name LIKE ?${paramIndex} OR contact_phone LIKE ?${paramIndex + 1} OR booking_id LIKE ?${paramIndex + 2})`
        );
        // Bind the search query three times
        queryParams.push(searchQuery, searchQuery, searchQuery);
        paramIndex += 3; // Increment index by 3
    }

    // Combine WHERE clause
    if (conditions.length > 0) {
        query += " WHERE " + conditions.join(" AND ");
    }

    // Sorting (Unchanged)
    query += " ORDER BY booking_date DESC, time_slot DESC";

    console.log(`[API get-bookings] Executing SQL: ${query}`); // Log the final SQL
    console.log(`[API get-bookings] With Params: ${JSON.stringify(queryParams)}`); // Log the parameters

    // Execute query
    const bookingsStmt = db.prepare(query).bind(...queryParams);
    const { results: bookings } = await bookingsStmt.all();

    // Fetch items and combine (Unchanged)
    if (!bookings || bookings.length === 0) {
        return new Response(JSON.stringify([]), { status: 200, headers: { 'Content-Type': 'application/json' } });
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
    console.error('[API get-bookings] Error:', error);
    // Include stack trace in log for better debugging
    console.error(error.stack);
    return new Response(JSON.stringify({ error: '獲取預約列表失敗。', details: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}