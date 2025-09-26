// functions/api/my-rental-history.js
export async function onRequest(context) {
  try {
    const url = new URL(context.request.url);
    const userId = url.searchParams.get('userId');
    const filter = url.searchParams.get('filter') || 'current';

    if (!userId) {
      return new Response(JSON.stringify({ error: '缺少使用者 ID。' }), {
        status: 400, headers: { 'Content-Type': 'application/json' },
      });
    }

    const db = context.env.DB;

    // 【** 步驟 1: 修改 SQL 查詢，加入 late_fee_override **】
    const stmt = db.prepare(`
      SELECT
        r.rental_id, r.user_id, r.game_id, r.rental_date, r.due_date,
        r.return_date, r.deposit, r.status,
        r.late_fee_per_day,
        r.late_fee_override, -- <--- 新增這一行
        b.name as game_name,
        b.image_url as game_image_url
      FROM Rentals AS r
      LEFT JOIN BoardGames AS b ON r.game_id = b.game_id
      WHERE r.user_id = ?
      ORDER BY r.rental_date DESC
    `);

    let { results } = await stmt.bind(userId).all();

    if (!results) {
        return new Response(JSON.stringify([]), {
             status: 200, headers: { 'Content-Type': 'application/json' },
        });
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const allProcessedRentals = results.map(rental => {
        const dueDate = new Date(rental.due_date);
        let overdue_days = 0;
        let calculated_late_fee = 0;

        if (rental.status === 'rented' && dueDate < today) {
            const diffTime = Math.abs(today - dueDate);
            overdue_days = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
            
            // 【** 步驟 2: 修改費用計算邏輯 **】
            // 優先使用手動覆寫的總金額
            if (rental.late_fee_override !== null && rental.late_fee_override !== undefined) {
                calculated_late_fee = rental.late_fee_override;
            } else {
            // 否則，用每日費用計算
                calculated_late_fee = overdue_days * (rental.late_fee_per_day || 50);
            }
        }
        return { ...rental, overdue_days, calculated_late_fee };
    });

    // 【** 步驟 3: 修改篩選邏輯 **】
    let finalResults;
    if (filter === 'current') {
        // "目前的" 租借 = 所有尚未歸還的 (包含租借中和已逾期)
        finalResults = allProcessedRentals.filter(r => r.status === 'rented');
    } else { // filter === 'past'
        // "過往的" 租借 = 只有已歸還的
        finalResults = allProcessedRentals.filter(r => r.status === 'returned');
    }

    return new Response(JSON.stringify(finalResults), {
      status: 200, headers: { 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error in my-rental-history API:', error);
    return new Response(JSON.stringify({ error: '查詢個人租借紀錄失敗。' }), {
      status: 500, headers: { 'Content-Type': 'application/json' },
    });
  }
}