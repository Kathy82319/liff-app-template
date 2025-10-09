// functions/api/admin/_middleware.js (修正後)
//LIFF 環境(行動裝置)對於 Cookie 和跨網域請求更嚴格，因此這裡的修改只for Demo，讓Demo限制寬鬆(留意不要合併到main去了)
import * as jose from 'jose';

async function authMiddleware(context) {
    const { request, env, next } = context;
    const url = new URL(request.url);

    // --- 【核心修正】---
    // 檢查 Cloudflare 環境變數，如果是在 DEMO 模式，就直接跳過所有驗證
    if (env.IS_DEMO_MODE === 'true') {
        console.log('[Auth Middleware] DEMO mode is active. Bypassing authentication.');
        // 將一個模擬的使用者物件放進 context，確保後續 API 能正常運作
        context.data.user = { userId: 'demo_user', role: 'admin' };
        return await next();
    }
    // --- 【修正結束】---


    // --- 以下是正式環境 (main branch) 才會執行的嚴格驗證 ---
    if (url.pathname.startsWith('/api/admin/')) {
        const isAuthRoute = url.pathname.startsWith('/api/admin/auth/login') || url.pathname.startsWith('/api/admin/auth/logout');
        if (isAuthRoute) {
            return await next();
        }

        const cookie = request.headers.get('Cookie') || '';
        const tokenMatch = cookie.match(/AuthToken=([^;]+)/);
        const token = tokenMatch ? tokenMatch[1] : null;

        if (!token) {
            return new Response(JSON.stringify({ error: 'Unauthorized: Missing token' }), { status: 401 });
        }

        try {
            const secret = new TextEncoder().encode(env.JWT_SECRET);
            const { payload } = await jose.jwtVerify(token, secret, {
                issuer: 'urn:tabletop-product:issuer',
                audience: 'urn:tabletop-product:audience',
            });

            if (payload.role !== 'admin') {
                return new Response(JSON.stringify({ error: 'Forbidden: Insufficient privileges' }), { status: 403 });
            }
            context.data.user = payload;
        } catch (err) {
            return new Response(JSON.stringify({ error: 'Unauthorized: Invalid token', details: err.message }), { status: 401 });
        }
    }
    
    return await next();
}

export const onRequest = [authMiddleware];