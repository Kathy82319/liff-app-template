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

    let query = "SELECT * FROM Bookings";
    const queryParams = [];
    const conditions = [];

    // 根據收到的 statusFilter 動態建立 SQL 查詢條件
    if (statusFilter === 'today') {
        conditions.push("booking_date = date('now', 'localtime')");
        conditions.push("status IN ('confirmed', 'checked-in')");
    } else if (statusFilter === 'all_upcoming') {
        // 【新增】處理行事曆需要的「所有未來預約」
        conditions.push("booking_date >= date('now', 'localtime')");
    } else if (statusFilter) {
        // 處理 'confirmed', 'checked-in', 'cancelled' 等列表篩選
        conditions.push("status = ?");
        queryParams.push(statusFilter);
    } else {
        // 預設情況（如果沒有給任何 filter），等同於 all_upcoming
        conditions.push("booking_date >= date('now', 'localtime')");
    }

    if (conditions.length > 0) {
        query += " WHERE " + conditions.join(" AND ");
    }

    query += " ORDER BY booking_date ASC, time_slot ASC"; // 改為升序，更符合日曆習慣

    const stmt = db.prepare(query).bind(...queryParams);
    const { results } = await stmt.all();

    return new Response(JSON.stringify(results || []), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error in get-bookings API:', error);
    return new Response(JSON.stringify({ error: '獲取預約列表失敗。', details: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
