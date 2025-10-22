// functions/api/admin/_middleware.js (修正後)

import * as jose from 'jose';

async function authMiddleware(context) {
    const { request, env, next } = context;
    const url = new URL(request.url);

    if (url.pathname.startsWith('/api/admin/')) {
        // 【核心修正】將 LIFF 專用的驗證 API 也加入到白名單中
        const isPublicRoute = url.pathname.startsWith('/api/admin/auth/login') ||
                              url.pathname.startsWith('/api/admin/auth/logout') ||
                              url.pathname.startsWith('/api/admin/verify-liff-user');

        // 如果是公開路由 (登入、登出、LIFF驗證)，就直接放行
        if (isPublicRoute) {
            return await next();
        }

        // --- 以下是針對完整版後台的 Cookie 驗證邏輯 ---
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