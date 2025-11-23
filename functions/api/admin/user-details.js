// functions/api/admin/user-details.js (v2 - Add Rally Progress)

export async function onRequest(context) {
    try {
        if (context.request.method !== 'GET') {
            return new Response(JSON.stringify({ error: '無效的請求方法' }), { status: 405 });
        }
        const { request, env } = context;
        const db = env.DB;
        const url = new URL(request.url);
        const userId = url.searchParams.get('userId');

        if (!userId) {
            return new Response(JSON.stringify({ error: '缺少 userId 參數' }), { status: 400 });
        }

        // ... (1. 獲取使用者基本資料 - 保持不變) ...
        const profileStmt = db.prepare(
          `SELECT user_id, line_display_name, line_picture_url, 
                  real_name, phone, email, 
                  class, level, current_exp, tag, perk, notes, 
                  stored_value_balance 
           FROM Users WHERE user_id = ?`
        );
        const profile = await profileStmt.bind(userId).first();

        if (!profile) {
             return new Response(JSON.stringify({ error: '找不到該使用者' }), { status: 404 });
        }
        
        // --- 2. 獲取預約紀錄 (主檔) - 保持不變 ---
        const bookingsStmt = db.prepare("SELECT * FROM Bookings WHERE user_id = ? ORDER BY booking_date DESC");
        const bookingsResult = await bookingsStmt.bind(userId).all();
        const bookings = bookingsResult.results || [];

        // ... (3. 獲取預約項目 (明細) 並組裝 - 保持不變) ...
        if (bookings.length > 0) {
            const bookingIds = bookings.map(b => b.booking_id);
            const placeholders = bookingIds.map(() => '?').join(',');
            
            const itemsStmt = db.prepare(`SELECT * FROM BookingItems WHERE booking_id IN (${placeholders})`);
            const itemsResult = await itemsStmt.bind(...bookingIds).all();
            const allItems = itemsResult.results || [];

            bookings.forEach(booking => {
                booking.items = allItems.filter(item => item.booking_id === booking.booking_id);
            });
        }
        
        // --- 4. 獲取消費紀錄 - 保持不變 ---
        const expHistoryStmt = db.prepare("SELECT * FROM Purchasehistory WHERE user_id = ? ORDER BY created_at DESC");
        const expHistoryResult = await expHistoryStmt.bind(userId).all();
        
        // --- 5. 獲取儲值金紀錄 - 保持不變 ---
        const storedValueStmt = db.prepare("SELECT * FROM StoredValueHistory WHERE user_id = ? ORDER BY created_at DESC");
        const storedValueResult = await storedValueStmt.bind(userId).all();

        // --- 6. 獲取優惠券持有紀錄 - 保持不變 ---
        const vouchersStmt = db.prepare(`
            SELECT uv.*, vt.title, vt.type, vt.value, vt.valid_to
            FROM UserVouchers uv
            LEFT JOIN VoucherTemplates vt ON uv.template_id = vt.template_id
            WHERE uv.user_id = ?
            ORDER BY uv.issued_at DESC
        `);
        const vouchersResult = await vouchersStmt.bind(userId).all();

        // --- 7. 【新增】獲取集點活動進度 ---
        const rallyProgressStmt = db.prepare(`
            SELECT 
                p.stamped_at, 
                s.name AS station_name, 
                c.title AS campaign_title, 
                c.required_stamps, 
                c.campaign_id
            FROM UserRallyProgress p
            JOIN RallyStations s ON p.station_id = s.station_id
            JOIN RallyCampaigns c ON p.campaign_id = c.campaign_id
            WHERE p.user_id = ?
            ORDER BY p.stamped_at DESC
        `);
        const rallyProgressResult = await rallyProgressStmt.bind(userId).all();
        // --- 8. 【新增】獲取所有活動，以便計算進度 ---
        const allCampaignsResult = await db.prepare("SELECT * FROM RallyCampaigns WHERE is_active = 1").all();
        
        // --- 9. 計算活動進度摘要 ---
        const campaignSummaries = (allCampaignsResult.results || []).map(campaign => {
             const userStamps = (rallyProgressResult.results || []).filter(p => p.campaign_id === campaign.campaign_id);
             return {
                 campaign_id: campaign.campaign_id,
                 title: campaign.title,
                 required: campaign.required_stamps,
                 collected: userStamps.length,
                 progress_details: userStamps
             };
        });


        // --- 10. 打包回傳 ---
        const responseData = {
            profile: profile,
            bookings: bookings,
            exp_history: expHistoryResult.results || [],
            stored_value_history: storedValueResult.results || [],
            vouchers: vouchersResult.results || [],
            rally_progress_summary: campaignSummaries // <<< 新增集點活動摘要
        };

        return new Response(JSON.stringify(responseData), {
            status: 200,
            headers: { 
                'Content-Type': 'application/json',
                'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
                'Pragma': 'no-cache',
                'Expires': '0'
            },
        });

    } catch (error) {
        console.error('Error in user-details API:', error);
        return new Response(JSON.stringify({ error: '獲取使用者詳細資料失敗', details: error.message }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' },
        });
    }
}