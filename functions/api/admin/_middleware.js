// functions/api/admin/_middleware.js

import * as jose from 'jose';

async function authMiddleware(context) {
    // 【修改點】取消註解以下區塊
    // vvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvv
    const { request, env, next } = context;
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
    // ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
    // 【修改點】取消註解以上區塊

    // 在開發模式下，直接允許所有請求通過 -> 這行可以保留或刪除
    // console.log('[Auth Middleware] Development mode: Bypassing authentication.');
    return await next();
}

export const onRequest = [authMiddleware];