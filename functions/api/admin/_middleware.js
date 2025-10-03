// functions/api/admin/_middleware.js

import * as jose from 'jose';

async function authMiddleware(context) {
    const { next } = context;
    
    // **【資安重點 - 開發中暫時停用】**
    // TODO: 在專案完成後，務必取消註解此區塊，以重新啟用後端 API 的 JWT 驗證！
    /*
    const { request, env } = context;
    const url = new URL(request.url);

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
    */

    // 在開發模式下，直接允許所有請求通過
    console.log('[Auth Middleware] Development mode: Bypassing authentication.');
    return await next();
}

export const onRequest = [authMiddleware];