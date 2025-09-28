// functions/api/admin/user-details.js (新檔案)

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
        const profileStmt = db.prepare("SELECT * FROM Users WHERE user_id = ?");
        const profile = await profileStmt.bind(userId).first();

        if (!profile) {
             return new Response(JSON.stringify({ error: '找不到該使用者' }), { status: 404 });
        }

        // 2. 獲取預約紀錄
        const bookingsStmt = db.prepare("SELECT * FROM Bookings WHERE user_id = ? ORDER BY booking_date DESC");
        const bookingsResult = await bookingsStmt.bind(userId).all();

        // 3. 獲取租借紀錄 (包含產品名稱)
        const rentalsStmt = db.prepare(`
            SELECT r.*, p.name as game_name
            FROM Rentals AS r
            LEFT JOIN Products AS p ON r.game_id = p.game_id
            WHERE r.user_id = ?
            ORDER BY r.rental_date DESC
        `);
        const rentalsResult = await rentalsStmt.bind(userId).all();

        // 4. 獲取經驗值 (消費) 紀錄
        const expHistoryStmt = db.prepare("SELECT * FROM Purchasehistory WHERE user_id = ? ORDER BY created_at DESC");
        const expHistoryResult = await expHistoryStmt.bind(userId).all();

        // 5. 將所有結果打包回傳
        const responseData = {
            profile: profile,
            bookings: bookingsResult.results || [],
            rentals: rentalsResult.results || [],
            exp_history: expHistoryResult.results || []
        };

        return new Response(JSON.stringify(responseData), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
        });

    } catch (error) {
        console.error('Error in user-details API:', error);
        return new Response(JSON.stringify({ error: '獲取使用者詳細資料失敗', details: error.message }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' },
        });
    }
}