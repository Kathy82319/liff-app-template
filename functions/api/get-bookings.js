// functions/api/get-bookings.js

export async function onRequest(context) {
  try {
    if (context.request.method !== 'GET') {
      return new Response('Invalid request method.', { status: 405 });
    }

    const { request, env } = context;
    const db = env.DB;
    const url = new URL(request.url);
    const statusFilter = url.searchParams.get('status'); // 獲取 URL 中的 status 參數

    let query = "SELECT * FROM Bookings";
    const queryParams = [];
    const conditions = [];

    // 根據收到的 statusFilter 動態建立 SQL 查詢條件
    if (statusFilter) {
        // 特別處理 "today" 篩選條件
        if (statusFilter === 'today') {
            conditions.push("booking_date = date('now', 'localtime')");
            conditions.push("status IN ('confirmed', 'checked-in')");
        } else {
            conditions.push("status = ?");
            queryParams.push(statusFilter);
        }
    } else {
        // 如果沒有任何篩選條件，預設只顯示今天及未來的已確認預約
        conditions.push("booking_date >= date('now', 'localtime')");
        conditions.push("status = 'confirmed'");
    }

    if (conditions.length > 0) {
        query += " WHERE " + conditions.join(" AND ");
    }
    
    // 預設排序方式
    query += " ORDER BY booking_date DESC, time_slot ASC";

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