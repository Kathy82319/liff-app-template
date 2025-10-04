// functions/api/admin/dashboard-stats.js

export async function onRequest(context) {
  try {
    if (context.request.method !== 'GET') {
      return new Response(JSON.stringify({ error: '無效的請求方法' }), { status: 405 });
    }

    const db = context.env.DB;
    const today = new Date().toISOString().split('T')[0];

    // 準備批次查詢
    const statements = [
      // 1. 今日預約總人數 (原有功能)
      db.prepare("SELECT SUM(num_of_people) as total_people FROM Bookings WHERE booking_date = ? AND status IN ('confirmed', 'checked-in')").bind(today),
      // 2. 今日新增的預約筆數
      db.prepare("SELECT COUNT(booking_id) as count FROM Bookings WHERE DATE(created_at, 'localtime') = ?").bind(today),
      // 3. 本週預約總筆數 (從今天起算未來7天)
      db.prepare("SELECT COUNT(booking_id) as count FROM Bookings WHERE booking_date BETWEEN ?1 AND date(?1, '+6 days') AND status IN ('confirmed', 'checked-in')").bind(today),
      // 4. 今日新註冊會員數
      db.prepare("SELECT COUNT(user_id) as count FROM Users WHERE DATE(created_at, 'localtime') = ?").bind(today)
    ];

    // 一次性執行所有查詢
    const results = await db.batch(statements);

    // 整理回傳的數據
    const stats = {
      today_total_guests: results[0].results[0]?.total_people || 0,
      today_new_bookings: results[1].results[0]?.count || 0,
      this_week_bookings: results[2].results[0]?.count || 0,
      today_new_users: results[3].results[0]?.count || 0,
    };

    return new Response(JSON.stringify(stats), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error in dashboard-stats API:', error);
    return new Response(JSON.stringify({ error: '獲取儀表板數據失敗。', details: error.message }), { status: 500 });
  }
}