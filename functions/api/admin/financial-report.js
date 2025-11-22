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
        // 營收 (僅計算 confirmed，因為 checked-in 已移除)
        const revenueStmt = db.prepare(`
            SELECT 
                COUNT(booking_id) as total_orders, 
                SUM(total_amount) as total_revenue 
            FROM Bookings 
            WHERE booking_date BETWEEN ?1 AND ?2 
            AND status = 'confirmed'
        `);
        const revenueResult = await revenueStmt.bind(startDate, endDate).first();

        // 負債水位 (所有用戶儲值金總和)
        const liabilityResult = await db.prepare("SELECT SUM(stored_value_balance) as total_liability FROM Users").first();

        // 入住/預約率
        const totalRoomsResult = await db.prepare("SELECT value FROM AppSettings WHERE key = 'LOGIC_TOTAL_ROOMS'").first();
        const totalRooms = totalRoomsResult ? Number(totalRoomsResult.value) : 0;
        
        let occupancyRate = 0;
        if (totalRooms > 0) {
            const nightsStmt = db.prepare(`
                SELECT SUM(num_of_people) as total_nights 
                FROM Bookings 
                WHERE booking_date BETWEEN ?1 AND ?2 
                AND status = 'confirmed'
            `);
            const nightsResult = await nightsStmt.bind(startDate, endDate).first();
            const daysDiff = (new Date(endDate) - new Date(startDate)) / (1000 * 60 * 60 * 24) + 1;
            occupancyRate = ((nightsResult?.total_nights || 0) / (totalRooms * daysDiff)) * 100;
        }

        // --- 2. 圖表數據：年度營收 (直條圖) ---
        // 這裡我們分開計算 actual 和 lost，前端會將其並排顯示
        const monthlyStatsStmt = db.prepare(`
            SELECT 
                strftime('%Y-%m', booking_date) as month,
                SUM(CASE WHEN status = 'confirmed' THEN total_amount ELSE 0 END) as actual_revenue,
                SUM(CASE WHEN status IN ('cancelled', 'no-show') THEN total_amount ELSE 0 END) as lost_revenue
            FROM Bookings
            WHERE booking_date >= date('now', 'localtime', '-11 months', 'start of month')
            GROUP BY month
            ORDER BY month ASC
        `);
        const { results: monthlyStats } = await monthlyStatsStmt.all();

        // --- 3. 圓餅圖數據分析 ---
        
        // A. 新舊客佔比 (修正定義：1次=新客, 2-3次=回訪, 4+=熟客)
        // 注意：這裡分析的是「在這段期間有消費」的人的屬性
        const customerSegStmt = db.prepare(`
            SELECT 
                CASE 
                    WHEN order_count = 1 THEN '新客 (1次)'
                    WHEN order_count BETWEEN 2 AND 3 THEN '回訪客 (2-3次)'
                    ELSE '熟客 (4次以上)'
                END as label,
                COUNT(user_id) as value
            FROM (
                SELECT user_id, COUNT(booking_id) as order_count 
                FROM Bookings 
                WHERE status = 'confirmed'
                GROUP BY user_id
            )
            GROUP BY label
        `);
        const { results: customerSeg } = await customerSegStmt.all();

        // B. 會員方案佔比
        const membershipSegStmt = db.prepare(`
            SELECT u.class as label, COUNT(b.booking_id) as value
            FROM Bookings b
            JOIN Users u ON b.user_id = u.user_id
            WHERE b.booking_date BETWEEN ?1 AND ?2 AND b.status = 'confirmed'
            GROUP BY u.class
        `);
        const { results: membershipSeg } = await membershipSegStmt.bind(startDate, endDate).all();

        // C. 訂單狀態佔比 (預約 vs 取消 vs 未到)
        const statusSegStmt = db.prepare(`
            SELECT 
                CASE 
                    WHEN status = 'confirmed' THEN '已確認'
                    WHEN status = 'cancelled' THEN '已取消'
                    WHEN status = 'no-show' THEN '未到'
                    ELSE status 
                END as label, 
                COUNT(booking_id) as value
            FROM Bookings
            WHERE booking_date BETWEEN ?1 AND ?2
            GROUP BY status
        `);
        const { results: statusSeg } = await statusSegStmt.bind(startDate, endDate).all();

        // D. 預約項目佔比
        const itemSegStmt = db.prepare(`
            SELECT bi.item_name as label, SUM(bi.quantity) as value
            FROM BookingItems bi
            JOIN Bookings b ON bi.booking_id = b.booking_id
            WHERE b.booking_date BETWEEN ?1 AND ?2 AND b.status = 'confirmed'
            GROUP BY bi.item_name
        `);
        const { results: itemSeg } = await itemSegStmt.bind(startDate, endDate).all();


        // --- 4. 交易明細 ---
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
                pieData: {
                    customer: customerSeg || [],
                    membership: membershipSeg || [],
                    status: statusSeg || [],
                    items: itemSeg || []
                }
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