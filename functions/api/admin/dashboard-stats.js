// functions/api/admin/dashboard-stats.js (最終修正版)
export async function onRequest(context) {
  try {
    if (context.request.method !== 'GET') {
      return new Response('Invalid request method.', { status: 405 });
    }
    const db = context.env.DB;
    const today = new Date().toISOString().split('T')[0];
    const bookingsStmt = db.prepare(
      "SELECT SUM(num_of_people) as total_people FROM Bookings WHERE booking_date = ? AND status IN ('confirmed', 'checked-in')"
    );
    const todayBookings = await bookingsStmt.bind(today).first();
    const stats = {
      today_total_guests: todayBookings.total_people || 0,
    };
    return new Response(JSON.stringify(stats), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Error in dashboard-stats API:', error);
    return new Response(JSON.stringify({ error: '獲取儀表板數據失敗。' }), { status: 500 });
  }
}