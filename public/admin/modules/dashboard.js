// functions/api/admin/dashboard-stats.js

export async function onRequest(context) {
  try {
    if (context.request.method !== 'GET') {
      return new Response(JSON.stringify({ error: '無效的請求方法' }), { status: 405 });
    }

    const db = context.env.DB;
    const today = new Date().toISOString().split('T')[0];

    const statements = [
      // 1. 今日預約總人數 (已驗證正常)
      db.prepare("SELECT SUM(num_of_people) as total_people FROM Bookings WHERE booking_date = ? AND status IN ('confirmed', 'checked-in')").bind(today),
      
      // 2. 待處理的預約數 (已驗證正常)
      db.prepare("SELECT COUNT(booking_id) as count FROM Bookings WHERE status = 'confirmed' AND booking_date >= ?").bind(today),

      // 3. 本月營業額 (已驗證正常)
      db.prepare("SELECT SUM(total_amount) as total_revenue FROM Bookings WHERE strftime('%Y-%m', booking_date) = strftime('%Y-%m', 'now', 'localtime') AND status != 'cancelled'"),

      // 4. 【關鍵修正】熱門服務排行 - 改用 JOIN 寫法
      db.prepare(`
        SELECT
            bi.item_name,
            SUM(bi.quantity) as total_quantity
        FROM
            BookingItems AS bi
        JOIN
            Bookings AS b ON bi.booking_id = b.booking_id
        WHERE
            strftime('%Y-%m', b.booking_date) = strftime('%Y-%m', 'now', 'localtime')
            AND b.status != 'cancelled'
        GROUP BY
            bi.item_name
        ORDER BY
            total_quantity DESC
        LIMIT 3
      `),
      
      // 後續的查詢保持不變
      db.prepare("SELECT SUM(num_of_people) as total_room_nights FROM Bookings WHERE strftime('%Y-%m', booking_date) = strftime('%Y-%m', 'now', 'localtime') AND status != 'cancelled'"),
      db.prepare("SELECT value FROM AppSettings WHERE key = 'LOGIC_TOTAL_ROOMS'")
    ];

    const results = await db.batch(statements);

    // --- 數據整理與計算 (此部分完全不變) ---
    const today_total_guests = results[0].results[0]?.total_people || 0;
    const pending_bookings = results[1].results[0]?.count || 0;
    const monthly_revenue = results[2].results[0]?.total_revenue || 0;
    const top_services = results[3].results || [];

    let monthly_occupancy_rate = 0;
    let average_daily_rate = 0;
    const totalRoomNights = results[4].results[0]?.total_room_nights || 0;
    const totalRoomsSetting = results[5].results[0]?.value;
    const totalRooms = totalRoomsSetting ? Number(totalRoomsSetting) : 0;
    
    if (totalRooms > 0) {
        const daysInMonth = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).getDate();
        monthly_occupancy_rate = (totalRoomNights / (totalRooms * daysInMonth)) * 100;
        average_daily_rate = monthly_revenue > 0 && totalRoomNights > 0 ? monthly_revenue / totalRoomNights : 0;
    }

    const stats = {
      today_total_guests,
      pending_bookings,
      monthly_revenue,
      top_services,
      monthly_occupancy_rate: monthly_occupancy_rate.toFixed(1),
      average_daily_rate: average_daily_rate.toFixed(0)
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