// functions/api/admin/booking-settings.js

export async function onRequest(context) {
  const { request, env } = context;
  const db = env.DB;

  try {
    // GET 請求：獲取所有 "已開啟" 的預約日
    if (request.method === 'GET') {
      const { results } = await db.prepare("SELECT disabled_date FROM BookingSettings").all();
      // 雖然欄位名稱是 disabled_date，但我們的邏輯上視為 "enabled_date"
      const enabledDates = results.map(row => row.disabled_date);
      return new Response(JSON.stringify(enabledDates || []), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // POST 請求：處理日期操作
    if (request.method === 'POST') {
      const { action, date, year, month } = await request.json();
      
      if (!action) {
        return new Response(JSON.stringify({ error: '缺少操作類型。' }), { status: 400 });
      }

      // 新增或移除單一日期
      if (action === 'add' || action === 'remove') {
        if (!date) {
          return new Response(JSON.stringify({ error: '缺少日期參數。' }), { status: 400 });
        }
        if (action === 'add') {
          await db.prepare("INSERT OR IGNORE INTO BookingSettings (disabled_date) VALUES (?)").bind(date).run();
        } else { // action === 'remove'
          await db.prepare("DELETE FROM BookingSettings WHERE disabled_date = ?").bind(date).run();
        }
      } 
      // 【** 新增功能：開啟一整個月 **】
      else if (action === 'open_month') {
        if (year === undefined || month === undefined) {
          return new Response(JSON.stringify({ error: '缺少年份或月份參數。' }), { status: 400 });
        }
        
        const startDate = new Date(year, month, 1);
        const endDate = new Date(year, month + 1, 0); // 獲取該月最後一天
        const datesToOpen = [];

        // 產生該月份的所有日期字串
        for (let d = startDate; d <= endDate; d.setDate(d.getDate() + 1)) {
            datesToOpen.push(d.toISOString().split('T')[0]);
        }

        if (datesToOpen.length > 0) {
            // 準備批次插入
            const stmt = db.prepare("INSERT OR IGNORE INTO BookingSettings (disabled_date) VALUES (?)");
            const operations = datesToOpen.map(d => stmt.bind(d));
            await db.batch(operations);
        }
      } 
      else {
        return new Response(JSON.stringify({ error: '無效的操作類型。' }), { status: 400 });
      }
      
      return new Response(JSON.stringify({ success: true }), { status: 200 });
    }

    return new Response('Invalid request method.', { status: 405 });

  } catch (error) {
    console.error('Error in booking-settings API:', error);
    return new Response(JSON.stringify({ error: '更新預約設定失敗。' }), { status: 500 });
  }
}