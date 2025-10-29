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
// --- ▼▼▼ 新增詳細 Debug Log ▼▼▼ ---
    if (statusFilter) {
        console.log(`[API get-bookings v8 DEBUG] Raw statusFilter: "${statusFilter}"`);
        console.log(`[API get-bookings v8 DEBUG] typeof statusFilter: ${typeof statusFilter}`);
        console.log(`[API get-bookings v8 DEBUG] statusFilter length: ${statusFilter.length}`);
        // 比較字串本身的 Character Code
        const filterCodes = Array.from(statusFilter).map(char => char.charCodeAt(0)).join(',');
        const literalCodes = Array.from('checked-in').map(char => char.charCodeAt(0)).join(',');
        console.log(`[API get-bookings v8 DEBUG] statusFilter char codes: [${filterCodes}]`);
        console.log(`[API get-bookings v8 DEBUG] "checked-in" char codes: [${literalCodes}]`);
        console.log(`[API get-bookings v8 DEBUG] Strict comparison (=== 'checked-in'): ${statusFilter === 'checked-in'}`);
        // 嘗試 trim 後比較
        const trimmedStatusFilter = statusFilter.trim();
        console.log(`[API get-bookings v8 DEBUG] Trimmed statusFilter: "${trimmedStatusFilter}"`);
        console.log(`[API get-bookings v8 DEBUG] Trimmed comparison (=== 'checked-in'): ${trimmedStatusFilter === 'checked-in'}`);
    } else {
        console.log(`[API get-bookings v8 DEBUG] statusFilter is null or empty.`);
    }
    // --- ▲▲▲ Debug Log 結束 ▲▲▲ ---

    const searchTerm = url.searchParams.get('search');
    const startDate = url.searchParams.get('startDate');
    const endDate = url.searchParams.get('endDate');

    console.log(`[API get-bookings v7] Params - Status: ${statusFilter}, Search: ${searchTerm}, Start: ${startDate}, End: ${endDate}`); // v7 Log

    let query = "SELECT b.* FROM Bookings b"; // Alias table
    const conditions = [];
    const queryParams = [];

    // --- 1. Status Filter (使用 trim() 增強判斷 v8) ---
    const trimmedStatusFilter = statusFilter ? statusFilter.trim() : null; // <<<< 使用 Trimmed 版本比較

if (trimmedStatusFilter && trimmedStatusFilter !== 'all') {
        // Log 進入哪個分支
        if (trimmedStatusFilter === 'today') {
            console.log("[API get-bookings v8 DEBUG] Matched: today");
            conditions.push("b.booking_date = date('now', 'localtime')");
            conditions.push("b.status IN ('confirmed', 'checked-in', 'no-show')");
        } else if (trimmedStatusFilter === 'all_upcoming') {
            console.log("[API get-bookings v8 DEBUG] Matched: all_upcoming");
            conditions.push("b.booking_date >= date('now', 'localtime')");
            conditions.push("b.status IN ('confirmed', 'checked-in', 'no-show')");
        } else if (trimmedStatusFilter === 'confirmed') {
             console.log("[API get-bookings v8 DEBUG] Matched: confirmed");
             conditions.push("b.booking_date >= date('now', 'localtime')");
             conditions.push(`b.status = ?${queryParams.length + 1}`);
             queryParams.push('confirmed');
        } else if (trimmedStatusFilter === 'checked-in') {
             console.log("[API get-bookings v8 DEBUG] Matched: checked-in"); // <<<< 預期這裡會 Log
             conditions.push(`b.status = ?${queryParams.length + 1}`);
             queryParams.push('checked-in');
        } else if (trimmedStatusFilter === 'no-show') {
             console.log("[API get-bookings v8 DEBUG] Matched: no-show");
             conditions.push(`b.status = ?${queryParams.length + 1}`);
             queryParams.push('no-show');
        } else if (trimmedStatusFilter === 'cancelled') {
             console.log("[API get-bookings v8 DEBUG] Matched: cancelled");
             conditions.push(`b.status = ?${queryParams.length + 1}`);
             queryParams.push('cancelled');
        } else {
             // 只有在真的無法匹配時才 Log 警告
             console.warn(`[API get-bookings v8] Could not match trimmed status filter: "${trimmedStatusFilter}"`);
        }
    } else if (!trimmedStatusFilter) {
        console.log("[API get-bookings v8 DEBUG] Status filter is null, empty, or 'all'. No status condition added.");
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