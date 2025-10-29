// functions/api/admin/auth/login.js

export async function onRequest(context) {
    if (context.request.method !== 'POST') {
        return new Response('Invalid method', { status: 405 });
    }
    try {
        const { username, password } = await context.request.json();
        if (!username || !password) {
            return new Response(JSON.stringify({ error: '缺少帳號或密碼。' }), { status: 400 });
        }

        const db = context.env.DB;
        const user = await db.prepare("SELECT * FROM Users WHERE username = ? AND role = 'admin'").bind(username).first();

        if (!user) {
             return new Response(JSON.stringify({ error: '帳號不存在或非管理員。' }), { status: 401 });
        }

        // --- 【重要】請確認您的環境變數 ADMIN_PASSWORD 已正確設定 ---
        if (!context.env.ADMIN_PASSWORD) {
             console.error("Login Error: ADMIN_PASSWORD environment variable is not set!");
             return new Response(JSON.stringify({ error: '伺服器設定錯誤，無法驗證密碼。' }), { status: 500 });
        }
        if (password !== context.env.ADMIN_PASSWORD) {
            return new Response(JSON.stringify({ error: '密碼錯誤。' }), { status: 401 });
        }

        // --- 產生 JWT Token ---
        // --- 【重要】請確認您的環境變數 JWT_SECRET 已正確設定 ---
        if (!context.env.JWT_SECRET) {
            console.error("Login Error: JWT_SECRET environment variable is not set!");
            return new Response(JSON.stringify({ error: '伺服器設定錯誤，無法產生 Token。' }), { status: 500 });
        }
        const secret = new TextEncoder().encode(context.env.JWT_SECRET);
        const alg = 'HS256';
        const jwt = await new jose.SignJWT({ userId: user.user_id, role: user.role })
            .setProtectedHeader({ alg })
            .setExpirationTime('8h')
            .setIssuer('urn:tabletop-product:issuer') // 這裡和 middleware 的驗證需要一致
            .setAudience('urn:tabletop-product:audience') // 這裡和 middleware 的驗證需要一致
            .sign(secret);

        // --- 設定 Cookie Header ---
        const headers = new Headers();
        headers.set('Content-Type', 'application/json');
        // ---【關鍵】檢查 Set-Cookie 指令 ---
        // HttpOnly: 防止 JS 讀取 Cookie，增加安全性
        // Secure: 只在 HTTPS 連線下傳送 Cookie (Cloudflare Pages 預設是 HTTPS，所以需要)
        // Path=/: Cookie 適用於整個網站
        // Max-Age=28800: Cookie 有效期 8 小時 (單位秒)
        // SameSite=Lax: 大多數情況下會傳送 Cookie，是一種安全平衡
        const cookieString = `AuthToken=${jwt}; HttpOnly; Secure; Path=/; Max-Age=28800; SameSite=Lax`;
        headers.set('Set-Cookie', cookieString);
        console.log("Login API: 準備設定 Cookie:", cookieString); // <--- 加入日誌

        return new Response(JSON.stringify({ success: true, user: { userId: user.user_id, displayName: user.line_display_name } }), {
            status: 200,
            headers: headers // 使用包含 Set-Cookie 的 headers
        });
    } catch (error) {
        console.error('Login error:', error);
        return new Response(JSON.stringify({ error: '登入時發生內部錯誤。' }), { status: 500 });
    }
}