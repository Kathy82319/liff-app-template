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

    console.log(`[API get-bookings] Params - Status: ${statusFilter}, Search: ${searchTerm}, Start: ${startDate}, End: ${endDate}`);

    let query = "SELECT * FROM Bookings";
    const conditions = [];
    const queryParams = [];
    let paramIndex = 1;

    // --- 狀態篩選 ---
    // 移除了 allowedStatuses 檢查，因為 D1 prepare 會處理參數綁定安全性
    if (statusFilter && statusFilter !== 'all') {
        if (statusFilter === 'today') {
            conditions.push("booking_date = date('now', 'localtime')");
            conditions.push("status IN ('confirmed', 'checked-in', 'no-show')");
        } else if (statusFilter === 'all_upcoming') {
            conditions.push("booking_date >= date('now', 'localtime')");
            conditions.push("status IN ('confirmed', 'checked-in', 'no-show')");
        } else if (statusFilter === 'confirmed') { // 未來的 confirmed
            conditions.push("booking_date >= date('now', 'localtime')");
            conditions.push(`status = ?${paramIndex}`);
            queryParams.push('confirmed');
            paramIndex++;
        } else { // checked-in, no-show, cancelled (直接使用傳入的值)
            conditions.push(`status = ?${paramIndex}`);
            queryParams.push(statusFilter);
            paramIndex++;
        }
    }

    // --- 日期範圍篩選 ---
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    const isValidStartDate = startDate && dateRegex.test(startDate);
    const isValidEndDate = endDate && dateRegex.test(endDate);

    if (isValidStartDate && isValidEndDate) {
         // 【關鍵修正】確保 booking_date BETWEEN ... 被正確加入 conditions
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

    // --- 搜尋條件 ---
    if (searchTerm) {
        const searchQuery = `%${searchTerm}%`;
        // 分開綁定參數
        conditions.push(
            `(contact_name LIKE ?${paramIndex} OR contact_phone LIKE ?${paramIndex + 1} OR booking_id LIKE ?${paramIndex + 2})`
        );
        queryParams.push(searchQuery, searchQuery, searchQuery);
        paramIndex += 3;
    }

    // --- 組合 WHERE 子句 ---
    if (conditions.length > 0) {
        query += " WHERE " + conditions.join(" AND "); // 確保使用 AND 連接
    }

    // --- 排序 ---
    query += " ORDER BY booking_date DESC, time_slot DESC";

    console.log(`[API get-bookings] Final SQL: ${query}`);
    console.log(`[API get-bookings] Final Params: ${JSON.stringify(queryParams)}`);

    // --- 執行查詢 ---
    const bookingsStmt = db.prepare(query).bind(...queryParams);
    const { results: bookings } = await bookingsStmt.all();

    // --- 獲取 Items 並組合 (保持不變) ---
    if (!bookings || bookings.length === 0) {
        return new Response(JSON.stringify([]), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    // ... (獲取 items 並組合的程式碼) ...
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
    console.error(error.stack); // Log stack trace
    return new Response(JSON.stringify({ error: '獲取預約列表失敗。', details: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}