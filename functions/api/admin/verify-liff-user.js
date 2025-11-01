// functions/api/admin/verify-liff-user.js
// 【修正】在最上方加入 jose 的 import
import * as jose from 'jose';

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

        // 1. 驗證使用者角色 (不變)
        const userStmt = db.prepare("SELECT role FROM Users WHERE user_id = ?");
        const user = await userStmt.bind(userId).first();

        const isAdmin = user && user.role === 'admin';

        let activeTemplate = null;
        let jwt = null; // <--- 【新增】宣告 jwt 變數

        // 2. 如果是管理員，查詢樣板並產生 JWT Token
        if (isAdmin) {
            // 查詢樣板 (不變)
            const settingStmt = db.prepare("SELECT value FROM AppSettings WHERE key = 'LOGIC_ACTIVE_INDUSTRY_TEMPLATE'");
            const activeTemplateSetting = await settingStmt.first();
            if (activeTemplateSetting) {
                activeTemplate = activeTemplateSetting.value;
            }

            // --- 【新增】產生 JWT Token ---
            const secret = new TextEncoder().encode(context.env.JWT_SECRET);
            const alg = 'HS256';
            jwt = await new jose.SignJWT({ userId: userId, role: 'admin' }) // 使用 LIFF 提供的 userId
                .setProtectedHeader({ alg })
                .setExpirationTime('8h') // Token 有效期 8 小時
                .setIssuer('urn:tabletop-product:issuer')
                .setAudience('urn:tabletop-product:audience')
                .sign(secret);
            // --- 【新增】JWT 產生結束 ---
        }

        // 3. 準備回傳的 Headers，並設定 Cookie (如果驗證成功)
        const headers = new Headers();
        headers.set('Content-Type', 'application/json');

        if (isAdmin && jwt) { // <--- 【修改】只有管理員且成功產生 jwt 才設定 Cookie
            headers.set('Set-Cookie', `AuthToken=${jwt}; HttpOnly; Secure; Path=/; Max-Age=28800; SameSite=Lax`);
             console.log(`[verify-liff-user] Admin verified. Setting AuthToken cookie for user ${userId}`);
        } else if (isAdmin && !jwt) {
             console.error(`[verify-liff-user] Admin verified but JWT generation failed for user ${userId}`);
             // 如果 JWT 產生失敗，雖然驗證成功，但不設定 Cookie，後續請求仍會失敗
             // 這樣可以避免安全問題，同時在後端日誌中留下紀錄
        } else {
             console.log(`[verify-liff-user] User ${userId} is not an admin.`);
        }


        // 4. 回傳驗證結果與樣板資訊
        return new Response(JSON.stringify({
            success: true, // API 本身執行成功
            isAdmin: isAdmin, // 使用者是否為管理員
            activeTemplate: activeTemplate
        }), {
            status: 200,
            headers: headers // <--- 【修改】使用包含 Cookie 的 Headers
        });

    } catch (error) {
        console.error('Error in verify-liff-user API:', error);
        // 保持原有的錯誤處理
        return new Response(JSON.stringify({
            success: false,
            error: '驗證使用者身份時發生內部錯誤',
            details: error.message
        }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' }, // 確保錯誤回應也是 JSON
        });
    }
}