// functions/api/my-bookings.js

export async function onRequest(context) {
  try {
    const url = new URL(context.request.url);
    const userId = url.searchParams.get('userId');
    const filter = url.searchParams.get('filter') || 'current'; // 預設為 'current'

    if (!userId) {
      return new Response(JSON.stringify({ error: '缺少使用者 ID 參數。' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const db = context.env.DB;
    
    // ** 核心修正：調整篩選邏輯 **
    // 'current'：僅顯示未來或今天，且狀態為 'confirmed' 的預約
    // 'past'：顯示過去日期的所有預約，以及未來或今天但狀態已是 'checked-in' 或 'cancelled' 的預約
    const condition = filter === 'current' 
      ? "booking_date >= date('now', 'localtime') AND status = 'confirmed'" 
      : "booking_date < date('now', 'localtime') OR status IN ('checked-in', 'cancelled')";
    
    const stmt = db.prepare(
      `SELECT *, 
        CASE 
          WHEN status = 'confirmed' THEN '預約成功'
          WHEN status = 'checked-in' THEN '已報到'
          WHEN status = 'cancelled' THEN '已取消'
          ELSE '處理中'
        END as status_text
       FROM Bookings 
       WHERE user_id = ? 
       AND (${condition})
       ORDER BY booking_date DESC, time_slot DESC`
    );
    const { results } = await stmt.bind(userId).all();

    return new Response(JSON.stringify(results || []), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error in my-bookings API:', error);
    return new Response(JSON.stringify({ error: '查詢個人預約紀錄失敗。' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}