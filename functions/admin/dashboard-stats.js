// functions/api/admin/dashboard-stats.js

export async function onRequest(context) {
  try {
    if (context.request.method !== 'GET') {
      return new Response('Invalid request method.', { status: 405 });
    }

    const db = context.env.DB;
    const today = new Date().toISOString().split('T')[0];

    // 1. 查詢今日預約總人數
    const bookingsStmt = db.prepare(
      "SELECT SUM(num_of_people) as total_people FROM Bookings WHERE booking_date = ? AND status IN ('confirmed', 'checked-in')"
    );
    const todayBookings = await bookingsStmt.bind(today).first();

    // 2. 查詢目前未歸還的桌遊總數
    const rentalsStmt = db.prepare(
      "SELECT COUNT(*) as outstanding_rentals FROM Rentals WHERE status = 'rented'"
    );
    const outstandingRentals = await rentalsStmt.first();
    
    // 3. 查詢今日到期的租借數量
    const dueTodayStmt = db.prepare(
        "SELECT COUNT(*) as due_today_count FROM Rentals WHERE due_date = ? AND status = 'rented'"
    );
    const dueTodayRentals = await dueTodayStmt.bind(today).first();


    const stats = {
      today_total_guests: todayBookings.total_people || 0,
      outstanding_rentals_count: outstandingRentals.outstanding_rentals || 0,
      due_today_rentals_count: dueTodayRentals.due_today_count || 0,
    };

    return new Response(JSON.stringify(stats), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error in dashboard-stats API:', error);
    return new Response(JSON.stringify({ error: '獲取儀表板數據失敗。', details: error.message }), {
      status: 500,
    });
  }
}