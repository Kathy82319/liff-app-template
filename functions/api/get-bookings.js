// functions/api/get-bookings.js

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

    console.log(`[API get-bookings v7] Params - Status: ${statusFilter}, Search: ${searchTerm}, Start: ${startDate}, End: ${endDate}`); // v7 Log

    let query = "SELECT b.* FROM Bookings b"; // 使用別名
    const conditions = [];
    const queryParams = [];

    // --- 1. Status Filter (Revised Logic v7) ---
    // 明確處理每種 statusFilter 的情況
    if (statusFilter && statusFilter !== 'all') {
        if (statusFilter === 'today') {
            conditions.push("b.booking_date = date('now', 'localtime')");
            conditions.push("b.status IN ('confirmed', 'checked-in', 'no-show')");
            // 不需要加入 queryParams
        } else if (statusFilter === 'all_upcoming') {
            conditions.push("b.booking_date >= date('now', 'localtime')");
            conditions.push("b.status IN ('confirmed', 'checked-in', 'no-show')");
            // 不需要加入 queryParams
        } else if (statusFilter === 'confirmed') {
             conditions.push("b.booking_date >= date('now', 'localtime')");
             conditions.push(`b.status = ?${queryParams.length + 1}`);
             queryParams.push('confirmed');
        } else if (statusFilter === 'checked-in') { // 明確判斷
             conditions.push(`b.status = ?${queryParams.length + 1}`);
             queryParams.push('checked-in');
        } else if (statusFilter === 'no-show') { // 明確判斷
             conditions.push(`b.status = ?${queryParams.length + 1}`);
             queryParams.push('no-show');
        } else if (statusFilter === 'cancelled') { // 明確判斷
             conditions.push(`b.status = ?${queryParams.length + 1}`);
             queryParams.push('cancelled');
        } else {
             // 處理未知的 statusFilter 值
             console.warn(`[API get-bookings v7] Ignored invalid status filter: ${statusFilter}`);
             // 可以選擇忽略或回傳錯誤
             // return new Response(JSON.stringify({ error: `無效的狀態篩選器: ${statusFilter}` }), { status: 400 });
        }
    }
    // else: statusFilter is 'all' or not provided -> 不加入 status 條件

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

    // --- 組合 WHERE 子句 ---
    if (conditions.length > 0) {
        query += " WHERE " + conditions.join(" AND ");
    }

    // --- 排序 ---
    query += " ORDER BY b.booking_date DESC, b.time_slot DESC";

    console.log(`[API get-bookings v7] Final SQL: ${query}`);
    console.log(`[API get-bookings v7] Final Params: ${JSON.stringify(queryParams)}`);

    // --- 執行查詢 ---
    let bookingsStmt;
    try {
        bookingsStmt = db.prepare(query);
        if (queryParams.length > 0) {
             bookingsStmt = bookingsStmt.bind(...queryParams);
        }
    } catch (prepareError) {
         console.error("[API get-bookings v7] Error preparing SQL statement:", prepareError);
         console.error("SQL attempted:", query);
         console.error("Params attempted:", JSON.stringify(queryParams));
         throw new Error(`Failed to prepare SQL query: ${prepareError.message}`);
    }

    const { results: bookings } = await bookingsStmt.all();

    // --- 獲取 Items 並組合 (保持不變) ---
    if (!bookings || bookings.length === 0) {
        console.log("[API get-bookings v7] No bookings found matching criteria.");
        return new Response(JSON.stringify([]), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    console.log(`[API get-bookings v7] Found ${bookings.length} bookings. Fetching items...`);
    const bookingIds = bookings.map(b => b.booking_id);
    const placeholders = bookingIds.map(() => '?').join(',');
    if (bookingIds.length > 0) {
        const itemsStmt = db.prepare(`SELECT * FROM BookingItems WHERE booking_id IN (${placeholders})`);
        const { results: allItems } = await itemsStmt.bind(...bookingIds).all();
        const bookingsWithItems = bookings.map(booking => {
            const itemsForBooking = allItems.filter(item => item.booking_id === booking.booking_id);
            return { ...booking, items: itemsForBooking };
        });

        console.log(`[API get-bookings v7] Returning ${bookingsWithItems.length} bookings with items.`);
        return new Response(JSON.stringify(bookingsWithItems), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
     } else {
         console.log("[API get-bookings v7] No booking IDs found after filtering.");
         return new Response(JSON.stringify([]), { status: 200, headers: { 'Content-Type': 'application/json' } });
     }

  } catch (error) {
    console.error('[API get-bookings v7] Error:', error);
    console.error(error.stack); // Log stack trace
    return new Response(JSON.stringify({ error: '獲取預約列表失敗。', details: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}