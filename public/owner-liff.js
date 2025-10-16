// functions/api/admin/verify-liff-user.js (偵錯版)

export async function onRequest(context) {
    try {
        if (context.request.method !== 'POST') {
            return new Response(JSON.stringify({ error: '無效的請求方法' }), { status: 405 });
        }

        const { userId } = await context.request.json();
        console.log(`[verify-liff-user] 1. 接收到來自前端的 userId: ${userId}`);

        if (!userId) {
            console.error('[verify-liff-user] 錯誤：請求中缺少 userId');
            return new Response(JSON.stringify({ error: '缺少使用者 ID' }), { status: 400 });
        }

        const db = context.env.DB;

        // 1. 驗證使用者角色
        const userStmt = db.prepare("SELECT role, user_id FROM Users WHERE user_id = ?");
        const user = await userStmt.bind(userId).first();

        console.log('[verify-liff-user] 2. 資料庫查詢結果:', JSON.stringify(user));

        // 加上更詳細的檢查
        let isAdmin = false;
        if (user) {
            console.log(`[verify-liff-user] 3. 找到使用者，資料庫中的 role 為: "${user.role}"`);
            // 【關鍵】加上 .trim() 來移除前後可能存在的空格
            isAdmin = user.role && user.role.trim() === 'admin';
        } else {
            console.log('[verify-liff-user] 3. 在資料庫中找不到此 userId');
        }

        console.log(`[verify-liff-user] 4. 最終判斷 isAdmin 的結果為: ${isAdmin}`);


        let activeTemplate = null;

        // 2. 如果是管理員，才去查詢當前啟用的樣板
        if (isAdmin) {
            console.log('[verify-liff-user] 5. 身份為管理員，開始查詢樣板設定...');
            const settingStmt = db.prepare("SELECT value FROM AppSettings WHERE key = 'LOGIC_ACTIVE_INDUSTRY_TEMPLATE'");
            const activeTemplateSetting = await settingStmt.first();
            if (activeTemplateSetting) {
                activeTemplate = activeTemplateSetting.value;
                console.log(`[verify-liff-user] 6. 找到啟用樣板: ${activeTemplate}`);
            } else {
                console.log('[verify-liff-user] 6. 警告：找不到 LOGIC_ACTIVE_INDUSTRY_TEMPLATE 設定');
            }
        }

        // 3. 回傳驗證結果與樣板資訊
        return new Response(JSON.stringify({
            success: true,
            isAdmin: isAdmin,
            activeTemplate: activeTemplate
        }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
        });

    } catch (error) {
        console.error('Error in verify-liff-user API:', error);
        return new Response(JSON.stringify({
            success: false,
            error: '驗證使用者身份時發生內部錯誤',
            details: error.message
        }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' },
        });
    }
}