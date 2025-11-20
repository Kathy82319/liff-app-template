// functions/api/admin/user-details.js
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

        // 1. 獲取使用者基本資料
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

        // 2. 獲取預約紀錄
        const bookingsStmt = db.prepare("SELECT * FROM Bookings WHERE user_id = ? ORDER BY booking_date DESC");
        const bookingsResult = await bookingsStmt.bind(userId).all();

        // 3. 獲取消費紀錄
        const expHistoryStmt = db.prepare("SELECT * FROM Purchasehistory WHERE user_id = ? ORDER BY created_at DESC");
        const expHistoryResult = await expHistoryStmt.bind(userId).all();
        
        // 4. 獲取儲值金紀錄
        const storedValueStmt = db.prepare("SELECT * FROM StoredValueHistory WHERE user_id = ? ORDER BY created_at DESC");
        const storedValueResult = await storedValueStmt.bind(userId).all();

        // --- 【新增】5. 獲取優惠券持有紀錄 ---
        const vouchersStmt = db.prepare(`
            SELECT uv.*, vt.title, vt.type, vt.value 
            FROM UserVouchers uv
            LEFT JOIN VoucherTemplates vt ON uv.template_id = vt.template_id
            WHERE uv.user_id = ?
            ORDER BY uv.issued_at DESC
        `);
        const vouchersResult = await vouchersStmt.bind(userId).all();

        // 6. 打包回傳
        const responseData = {
            profile: profile,
            bookings: bookingsResult.results || [],
            exp_history: expHistoryResult.results || [],
            stored_value_history: storedValueResult.results || [],
            vouchers: vouchersResult.results || [] // 【新增】
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