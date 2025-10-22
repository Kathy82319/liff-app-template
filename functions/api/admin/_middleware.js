// functions/api/admin/_middleware.js (最終修正版)

import * as jose from 'jose';

async function authMiddleware(context) {
    const { request, env, next } = context;
    const url = new URL(request.url);

    if (url.pathname.startsWith('/api/admin/')) {
        // 【核心修正】將 LIFF 會用到的所有 admin API 都加入白名單
        const isPublicRoute = url.pathname.startsWith('/api/admin/auth/login') ||
                              url.pathname.startsWith('/api/admin/auth/logout') ||
                              url.pathname.startsWith('/api/admin/verify-liff-user') ||
                              url.pathname.startsWith('/api/admin/dashboard-stats'); // <--- 新增這一行

        // 如果是公開路由 (登入、登出、LIFF驗證、LIFF儀表板)，就直接放行
        if (isPublicRoute) {
            console.log(`[Middleware] 放行公開路由: ${url.pathname}`); // 增加日誌確認
            return await next();
        }

        // --- 以下是針對完整版後台的 Cookie 驗證邏輯 ---
        console.log(`[Middleware] 執行 Cookie 驗證: ${url.pathname}`); // 增加日誌確認
        const cookie = request.headers.get('Cookie') || '';
        const tokenMatch = cookie.match(/AuthToken=([^;]+)/);
        const token = tokenMatch ? tokenMatch[1] : null;

        if (!token) {
            console.log('[Middleware] Cookie 驗證失敗: 缺少 Token');
            return new Response(JSON.stringify({ error: 'Unauthorized: Missing token' }), { status: 401 });
        }

        try {
            const secret = new TextEncoder().encode(env.JWT_SECRET);
            const { payload } = await jose.jwtVerify(token, secret, {
                issuer: 'urn:tabletop-product:issuer',
                audience: 'urn:tabletop-product:audience',
            });

            if (payload.role !== 'admin') {
                console.log(`[Middleware] Cookie 驗證失敗: 權限不足 (role: ${payload.role})`);
                return new Response(JSON.stringify({ error: 'Forbidden: Insufficient privileges' }), { status: 403 });
            }
            context.data.user = payload;
             console.log(`[Middleware] Cookie 驗證成功: userId=${payload.userId}, role=${payload.role}`);
        } catch (err) {
            console.log(`[Middleware] Cookie 驗證失敗: Token 無效 (${err.message})`);
            return new Response(JSON.stringify({ error: 'Unauthorized: Invalid token', details: err.message }), { status: 401 });
        }
    }


    return await next();
}

export const onRequest = [authMiddleware];