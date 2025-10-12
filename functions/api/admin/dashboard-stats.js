// functions/api/admin/dashboard-stats.js

export async function onRequest(context) {
  try {
    if (context.request.method !== 'GET') {
      return new Response(JSON.stringify({ error: '無效的請求方法' }), { status: 405 });
    }

    const db = context.env.DB;
    const today = new Date().toISOString().split('T')[0];

    // --- 步驟 1：分開執行所有查詢，不再使用 batch ---

    // 查詢 1: 今日預約總人數 (簡單查詢)
    const todayGuestsResult = await db.prepare("SELECT SUM(num_of_people) as total_people FROM Bookings WHERE booking_date = ? AND status IN ('confirmed', 'checked-in')").bind(today).first();
    const today_total_guests = todayGuestsResult?.total_people || 0;

    // 查詢 2: 待處理預約數 (簡單查詢)
    const pendingBookingsResult = await db.prepare("SELECT COUNT(booking_id) as count FROM Bookings WHERE status = 'confirmed' AND booking_date >= ?").bind(today).first();
    const pending_bookings = pendingBookingsResult?.count || 0;
    
    // 查詢 3: 本月所有有效的預約 (這是最關鍵的查詢)
    const monthlyBookingsResult = await db.prepare("SELECT booking_id, total_amount FROM Bookings WHERE strftime('%Y-%m', booking_date) = strftime('%Y-%m', 'now', 'localtime') AND status != 'cancelled'").all();
    const monthlyBookings = monthlyBookingsResult.results || [];

    // --- 步驟 2：在 JavaScript 中處理數據 ---

    // 計算本月營業額
    const monthly_revenue = monthlyBookings.reduce((sum, booking) => sum + (booking.total_amount || 0), 0);
    
    let top_services = [];
    // 只有在本月有預約時，才進行下一步的項目查詢
    if (monthlyBookings.length > 0) {
        const monthlyBookingIds = monthlyBookings.map(b => b.booking_id);
        const placeholders = monthlyBookingIds.map(() => '?').join(','); // ?,?,?

        // 查詢 4: 根據有效的 booking_id 撈出所有相關的項目
        const itemsResult = await db.prepare(`SELECT item_name, quantity FROM BookingItems WHERE booking_id IN (${placeholders})`).bind(...monthlyBookingIds).all();
        const allItems = itemsResult.results || [];
        
        if (allItems.length > 0) {
            const serviceCounts = allItems.reduce((acc, item) => {
                acc[item.item_name] = (acc[item.item_name] || 0) + item.quantity;
                return acc;
            }, {});

            top_services = Object.entries(serviceCounts)
                .map(([name, count]) => ({ item_name: name, total_quantity: count }))
                .sort((a, b) => b.total_quantity - a.total_quantity)
                .slice(0, 3);
        }
    }

    // --- 步驟 3：組合最終回傳的數據 ---
    
    // (民宿相關的數據查詢邏輯保持不變，因為它們相對簡單)
    const totalRoomNightsResult = await db.prepare("SELECT SUM(num_of_people) as total_room_nights FROM Bookings WHERE strftime('%Y-%m', booking_date) = strftime('%Y-%m', 'now', 'localtime') AND status != 'cancelled'").first();
    const totalRoomsSettingResult = await db.prepare("SELECT value FROM AppSettings WHERE key = 'LOGIC_TOTAL_ROOMS'").first();
    
    let monthly_occupancy_rate = 0;
    let average_daily_rate = 0;
    const totalRoomNights = totalRoomNightsResult?.total_room_nights || 0;
    const totalRooms = totalRoomsSettingResult ? Number(totalRoomsSettingResult.value) : 0;
    
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
    // 如果任何一步出錯，這次我們一定能抓到錯誤並回傳
    console.error('Error in dashboard-stats API:', error);
    return new Response(JSON.stringify({ error: '獲取儀表板數據時發生嚴重錯誤。', details: error.message }), { 
        status: 500,
        headers: { 'Content-Type': 'application/json' }
    });
  }
}