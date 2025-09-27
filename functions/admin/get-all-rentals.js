// functions/api/admin/get-all-rentals.js
export async function onRequest(context) {
  try {
    if (context.request.method !== 'GET') {
      return new Response('Invalid request method.', { status: 405 });
    }

    const { request, env } = context;
    const db = env.DB;
    const url = new URL(request.url);
    const statusFilter = url.searchParams.get('status');
    const today = new Date().toISOString().split('T')[0];

    // 【** 步驟 1: 修改 SQL 查詢 **】
    // 我們需要明確地從租借紀錄(r)中選取客製化的逾期費用 r.late_fee_per_day
    let query = `
      SELECT
        r.rental_id, r.user_id, r.rental_date, r.due_date, r.return_date, r.status,
        r.late_fee_override,
        r.late_fee_per_day,
        u.line_display_name, u.nickname,
        b.name as game_name
      FROM Rentals AS r
      LEFT JOIN Users AS u ON r.user_id = u.user_id
      LEFT JOIN Products AS b ON r.game_id = b.game_id
    `; // 【核心修正】將 BoardGames 改為 Products

    const queryParams = [];
    if (statusFilter && statusFilter !== 'overdue' && statusFilter !== 'due_today') {
        query += " WHERE r.status = ?";
        queryParams.push(statusFilter);
    } else if (statusFilter === 'due_today') {
        query += " WHERE r.status = 'rented' AND r.due_date = ?";
        queryParams.push(today);
    }
    
    query += ` ORDER BY r.due_date ASC`;

    const stmt = db.prepare(query).bind(...queryParams);
    let { results } = await stmt.all();

    const todayDate = new Date();
    todayDate.setHours(0, 0, 0, 0);

    results = results.map(rental => {
        const dueDate = new Date(rental.due_date);
        let derived_status = rental.status;
        let overdue_days = 0;
        let calculated_late_fee = 0;

        if (rental.status === 'rented' && dueDate < todayDate) {
            derived_status = 'overdue';
            const diffTime = Math.abs(todayDate - dueDate);
            overdue_days = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        }
        
        // 【** 步驟 2: 修改計算邏輯 **】
        if (rental.late_fee_override !== null && rental.late_fee_override !== undefined) {
            // 優先使用手動覆寫的金額
            calculated_late_fee = rental.late_fee_override;
        } else if (overdue_days > 0) {
            // 如果沒有手動覆寫，就使用這筆租借紀錄上儲存的客製化逾期費來計算
            calculated_late_fee = overdue_days * (rental.late_fee_per_day || 50); // 使用 r.late_fee_per_day
        }

        return { ...rental, derived_status, overdue_days, calculated_late_fee };
    });

    if (statusFilter === 'overdue') {
        results = results.filter(r => r.derived_status === 'overdue');
    }

    return new Response(JSON.stringify(results || []), {
      status: 200, headers: { 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error in get-all-rentals API:', error);
    return new Response(JSON.stringify({ error: '獲取所有租借紀錄失敗。', details: error.message }), { status: 500 });
  }
}