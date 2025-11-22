// functions/api/admin/financial-report.js

export async function onRequest(context) {
    try {
        if (context.request.method !== 'GET') {
            return new Response(JSON.stringify({ error: '無效的請求方法' }), { status: 405 });
        }

        const { request, env } = context;
        const db = env.DB;
        const url = new URL(request.url);
        
        // 預設為當月
        const now = new Date();
        const defaultStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
        const defaultEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split('T')[0];

        const startDate = url.searchParams.get('startDate') || defaultStart;
        const endDate = url.searchParams.get('endDate') || defaultEnd;

        // --- 1. 關鍵指標 (KPIs) ---
        // 營收 (已確認 + 已入住)
        const revenueStmt = db.prepare(`
            SELECT 
                COUNT(booking_id) as total_orders, 
                SUM(total_amount) as total_revenue 
            FROM Bookings 
            WHERE booking_date BETWEEN ?1 AND ?2 
            AND status IN ('confirmed', 'checked-in')
        `);
        const revenueResult = await revenueStmt.bind(startDate, endDate).first();

        // 負債水位 (所有用戶儲值金總和) - 這不隨日期變動
        const liabilityResult = await db.prepare("SELECT SUM(stored_value_balance) as total_liability FROM Users").first();

        // 入住率 (需要總房數設定)
        const totalRoomsResult = await db.prepare("SELECT value FROM AppSettings WHERE key = 'LOGIC_TOTAL_ROOMS'").first();
        const totalRooms = totalRoomsResult ? Number(totalRoomsResult.value) : 0;
        
        let occupancyRate = 0;
        if (totalRooms > 0) {
            const nightsStmt = db.prepare(`
                SELECT SUM(num_of_people) as total_nights 
                FROM Bookings 
                WHERE booking_date BETWEEN ?1 AND ?2 
                AND status IN ('confirmed', 'checked-in')
            `);
            // 注意：此處簡化以 num_of_people 或單筆訂單視為一間房，視業務邏輯調整
            // 嚴謹的入住率需計算 (入住日~退房日) 覆蓋的天數，此處為簡化版指標
            const nightsResult = await nightsStmt.bind(startDate, endDate).first();
            const daysDiff = (new Date(endDate) - new Date(startDate)) / (1000 * 60 * 60 * 24) + 1;
            occupancyRate = ((nightsResult?.total_nights || 0) / (totalRooms * daysDiff)) * 100;
        }

        // --- 2. 圖表數據：年度營收堆疊圖 (Monthly Revenue Stack) ---
        // 抓取過去 12 個月
        const monthlyStatsStmt = db.prepare(`
            SELECT 
                strftime('%Y-%m', booking_date) as month,
                SUM(CASE WHEN status IN ('confirmed', 'checked-in') THEN total_amount ELSE 0 END) as actual_revenue,
                SUM(CASE WHEN status IN ('cancelled', 'no-show') THEN total_amount ELSE 0 END) as lost_revenue
            FROM Bookings
            WHERE booking_date >= date('now', 'localtime', '-11 months', 'start of month')
            GROUP BY month
            ORDER BY month ASC
        `);
        const { results: monthlyStats } = await monthlyStatsStmt.all();

        // --- 3. 圖表數據：顧客價值分析 (Customer Segmentation) ---
        // 簡單區分：消費過 > 1 次為熟客
        const customerSegStmt = db.prepare(`
            SELECT 
                CASE WHEN order_count > 1 THEN 'Returning' ELSE 'New' END as type,
                COUNT(user_id) as count
            FROM (
                SELECT user_id, COUNT(booking_id) as order_count 
                FROM Bookings 
                WHERE status IN ('confirmed', 'checked-in')
                GROUP BY user_id
            )
            GROUP BY type
        `);
        const { results: customerSeg } = await customerSegStmt.all();

        // --- 4. 交易明細與對帳 (Transaction List) ---
        // 混合 Bookings (應收) 與 StoredValueHistory (儲值入帳)
        // 這裡我們只抓取 Bookings，並 Join 使用者名稱
        const transactionsStmt = db.prepare(`
            SELECT 
                b.booking_date, 
                b.booking_id, 
                b.contact_name, 
                b.total_amount, 
                b.status,
                b.payment_status,
                'booking' as type
            FROM Bookings b
            WHERE b.booking_date BETWEEN ?1 AND ?2
            UNION ALL
            SELECT 
                date(created_at) as booking_date, 
                history_id as booking_id, 
                (SELECT line_display_name FROM Users WHERE user_id = s.user_id) as contact_name,
                amount_changed as total_amount, 
                'completed' as status,
                'paid' as payment_status,
                'topup' as type
            FROM StoredValueHistory s
            WHERE type = 'admin_topup' AND date(created_at) BETWEEN ?1 AND ?2
            ORDER BY booking_date DESC
        `);
        const { results: transactions } = await transactionsStmt.bind(startDate, endDate).all();

        return new Response(JSON.stringify({
            kpi: {
                revenue: revenueResult?.total_revenue || 0,
                orders: revenueResult?.total_orders || 0,
                aov: revenueResult?.total_orders > 0 ? Math.round(revenueResult.total_revenue / revenueResult.total_orders) : 0,
                occupancy: occupancyRate.toFixed(1),
                liability: liabilityResult?.total_liability || 0
            },
            charts: {
                monthly: monthlyStats || [],
                customers: customerSeg || []
            },
            transactions: transactions || []
        }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' }
        });

    } catch (error) {
        console.error('Financial Report API Error:', error);
        return new Response(JSON.stringify({ error: '獲取報表失敗', details: error.message }), { status: 500 });
    }
}