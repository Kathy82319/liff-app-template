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
    // 【新增】讀取新參數
    const searchTerm = url.searchParams.get('search');
    const startDate = url.searchParams.get('startDate');
    const endDate = url.searchParams.get('endDate');

    console.log(`[API get-bookings] Status: ${statusFilter}, Search: ${searchTerm}, Start: ${startDate}, End: ${endDate}`); // Debug Log

    // --- 【修改】構建 SQL 查詢 ---
    let query = "SELECT * FROM Bookings";
    const conditions = [];
    const queryParams = [];
    let paramIndex = 1; // D1 參數索引從 1 開始

    // 1. 處理狀態篩選 (優先)
    if (statusFilter && statusFilter !== 'all') { // 'all' 表示不過濾狀態
        if (statusFilter === 'today') {
            conditions.push("booking_date = date('now', 'localtime')");
            // 今日預約包含 confirmed, checked-in, no-show
            conditions.push("status IN ('confirmed', 'checked-in', 'no-show')");
        } else if (statusFilter === 'all_upcoming') {
            conditions.push("booking_date >= date('now', 'localtime')");
            // 未來所有非取消的
            conditions.push("status IN ('confirmed', 'checked-in', 'no-show')");
        } else if (statusFilter === 'confirmed') { // 未來的預約 (只顯示 confirmed)
            conditions.push("booking_date >= date('now', 'localtime')"); // 改為 >= 包含今天
            conditions.push("status = 'confirmed'"); // 只看 confirmed
        } else if (statusFilter === 'checked-in') {
            conditions.push("status = 'checked-in'");
        } else if (statusFilter === 'no-show') { // 新增 no-show 篩選
            conditions.push("status = 'no-show'");
        } else if (statusFilter === 'cancelled') {
            conditions.push("status = 'cancelled'");
        }
        // 注意：這裡移除了舊的 'confirmed' 邏輯 (booking_date > today)
        // 也移除了 else (預設 >= today)，因為 'all' 會處理
    }
    // else: statusFilter is 'all' or not provided -> 不加 status 條件

    // 2. 處理日期範圍篩選 (booking_date)
    if (startDate && endDate && /^\d{4}-\d{2}-\d{2}$/.test(startDate) && /^\d{4}-\d{2}-\d{2}$/.test(endDate)) {
         conditions.push(`booking_date BETWEEN ?${paramIndex} AND ?${paramIndex + 1}`);
         queryParams.push(startDate, endDate);
         paramIndex += 2;
    } else if (startDate && /^\d{4}-\d{2}-\d{2}$/.test(startDate)) {
         // 如果只有開始日期
         conditions.push(`booking_date >= ?${paramIndex}`);
         queryParams.push(startDate);
         paramIndex += 1;
    } else if (endDate && /^\d{4}-\d{2}-\d{2}$/.test(endDate)) {
        // 如果只有結束日期
        conditions.push(`booking_date <= ?${paramIndex}`);
        queryParams.push(endDate);
        paramIndex += 1;
    }


    // 3. 處理關鍵字搜尋
    if (searchTerm) {
        const searchQuery = `%${searchTerm}%`;
        conditions.push(
            `(contact_name LIKE ?${paramIndex} OR contact_phone LIKE ?${paramIndex} OR booking_id LIKE ?${paramIndex})`
        );
        queryParams.push(searchQuery); // 綁定一次即可
        paramIndex += 1;
    }

    // 組合 WHERE 子句
    if (conditions.length > 0) {
        query += " WHERE " + conditions.join(" AND ");
    }

    // 排序 (保持不變)
    query += " ORDER BY booking_date DESC, time_slot DESC"; // 按日期降序，然後時間降序

    console.log(`[API get-bookings] SQL: ${query}`); // Debug Log
    console.log(`[API get-bookings] Params: ${JSON.stringify(queryParams)}`); // Debug Log


    // 執行主要查詢
    const bookingsStmt = db.prepare(query).bind(...queryParams);
    const { results: bookings } = await bookingsStmt.all();

    // 後續獲取 items 並組合的邏輯保持不變
    if (!bookings || bookings.length === 0) {
        return new Response(JSON.stringify([]), {
            status: 200, headers: { 'Content-Type': 'application/json' },
        });
    }
    const bookingIds = bookings.map(b => b.booking_id);
    const placeholders = bookingIds.map(() => '?').join(',');
    const itemsStmt = db.prepare(`SELECT * FROM BookingItems WHERE booking_id IN (${placeholders})`);
    const { results: allItems } = await itemsStmt.bind(...bookingIds).all();
    const bookingsWithItems = bookings.map(booking => {
        const itemsForBooking = allItems.filter(item => item.booking_id === booking.booking_id);
        return { ...booking, items: itemsForBooking };
    });
    // --- 【修改結束】 ---

    return new Response(JSON.stringify(bookingsWithItems), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('[API get-bookings] Error:', error); // Debug Log Error
    return new Response(JSON.stringify({ error: '獲取預約列表失敗。', details: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}