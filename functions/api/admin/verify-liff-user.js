// functions/api/admin/verify-liff-user.js

export async function onRequest(context) {
    try {
        if (context.request.method !== 'POST') {
            return new Response(JSON.stringify({ error: '無效的請求方法' }), { status: 405 });
        }

        const { userId } = await context.request.json();
        if (!userId) {
            return new Response(JSON.stringify({ error: '缺少使用者 ID' }), { status: 400 });
        }

        const db = context.env.DB;

        // 1. 驗證使用者角色
        const userStmt = db.prepare("SELECT role FROM Users WHERE user_id = ?");
        const user = await userStmt.bind(userId).first();

        const isAdmin = user && user.role === 'admin';

        let activeTemplate = null;

        // 2. 如果是管理員，才去查詢當前啟用的樣板
        if (isAdmin) {
            const settingStmt = db.prepare("SELECT value FROM AppSettings WHERE key = 'LOGIC_ACTIVE_INDUSTRY_TEMPLATE'");
            const activeTemplateSetting = await settingStmt.first();
            if (activeTemplateSetting) {
                activeTemplate = activeTemplateSetting.value;
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