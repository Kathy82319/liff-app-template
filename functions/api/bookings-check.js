// functions/api/bookings-check.js


// 【** 關鍵修正：函式改名並調整回傳內容 **】
async function getEnabledDates(db) {
    try {
        const { results } = await db.prepare("SELECT disabled_date FROM BookingSettings").all();
        // 邏輯上回傳的是 "enabled dates"
        return results.map(row => row.disabled_date);
    } catch (error) {
        console.error("讀取可預約日期失敗:", error);
        return [];
    }
}

export async function onRequest(context) {
  try {
    const url = new URL(context.request.url);
    const date = url.searchParams.get('date');
    const db = context.env.DB;

    // 如果請求是為了獲取整個月份的設定
    if (url.searchParams.has('month-init')) {
        const enabledDates = await getEnabledDates(db);
        // 回傳的 JSON key 改為 enabledDates
        return new Response(JSON.stringify({ enabledDates }), {
            status: 200, headers: { 'Content-Type': 'application/json' }
        });
    }
    
    // 既有的單日查詢邏輯 (這部分不用變)
    if (!date) {
      return new Response(JSON.stringify({ error: '缺少日期參數。' }), { status: 400 });
    }
    const dailyLimit = await getDailyBookingLimit(context.env, date);
    
    const stmt = db.prepare(
      "SELECT SUM(tables_occupied) as total_tables_booked FROM Bookings WHERE booking_date = ? AND (status = 'confirmed' OR status = 'checked-in')"
    );
    const result = await stmt.bind(date).first();
    const tablesBooked = result ? (result.total_tables_booked || 0) : 0;
    const tablesAvailable = dailyLimit - tablesBooked;
    
    return new Response(JSON.stringify({
        date: date,
        limit: dailyLimit,
        booked: tablesBooked,
        available: tablesAvailable > 0 ? tablesAvailable : 0
    }), {
      status: 200, headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    console.error('Error in bookings-check API:', error);
    return new Response(JSON.stringify({ error: '查詢預約狀況失敗。' }), { status: 500 });
  }
}