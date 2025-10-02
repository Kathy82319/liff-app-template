// functions/api/admin/auth/login.js (新版，加入偵錯日誌)
import * as jose from 'jose';

export async function onRequest(context) {
    if (context.request.method !== 'POST') {
        return new Response('Invalid method', { status: 405 });
    }
    try {
        const { username, password } = await context.request.json();

        // --- 【新增的偵錯日誌】 ---
        console.log(`[Login Attempt] Received username: "${username}"`);
        const adminPasswordExists = !!context.env.ADMIN_PASSWORD;
        console.log(`[Login Attempt] ADMIN_PASSWORD environment variable exists: ${adminPasswordExists}`);
        // --- 【偵錯日誌結束】 ---
        
        if (!username || !password) {
            return new Response(JSON.stringify({ error: '缺少帳號或密碼。' }), { status: 400 });
        }

        const db = context.env.DB;
        const user = await db.prepare("SELECT * FROM Users WHERE username = ? AND role = 'admin'").bind(username).first();

        if (!user) {
             console.log(`[Login Failed] Reason: User not found in DB or not an admin. Searched for username: "${username}"`);
             return new Response(JSON.stringify({ error: '帳號不存在或非管理員。' }), { status: 401 });
        }

        if (password !== context.env.ADMIN_PASSWORD) {
            console.log(`[Login Failed] Reason: Password mismatch.`);
            return new Response(JSON.stringify({ error: '密碼錯誤。' }), { status: 401 });
        }

        // --- 產生 JWT Token (此部分不變) ---
        const secret = new TextEncoder().encode(context.env.JWT_SECRET);
        const alg = 'HS256';
        const jwt = await new jose.SignJWT({ userId: user.user_id, role: user.role })
            .setProtectedHeader({ alg })
            .setExpirationTime('8h')
            .setIssuer('urn:tabletop-product:issuer')
            .setAudience('urn:tabletop-product:audience')
            .sign(secret);

        const headers = new Headers();
        headers.set('Content-Type', 'application/json');
        headers.set('Set-Cookie', `AuthToken=${jwt}; HttpOnly; Secure; Path=/; Max-Age=28800; SameSite=Lax`);
        
        console.log(`[Login Success] JWT issued for user: ${user.user_id}`);

        return new Response(JSON.stringify({ success: true, user: { userId: user.user_id, displayName: user.line_display_name } }), {
            status: 200,
            headers: headers
        });
    } catch (error) {
        console.error('Login error:', error);
        return new Response(JSON.stringify({ error: '登入時發生內部錯誤。' }), { status: 500 });
    }
}