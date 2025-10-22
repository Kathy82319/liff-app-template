// functions/api/admin/_middleware.js (v9 - More Logging on Failure)

import * as jose from 'jose';

async function authMiddleware(context) {
    const { request, env, next } = context;
    const url = new URL(request.url);

    if (!url.pathname.startsWith('/api/admin/')) {
        return await next();
    }

    const isPublicRoute = url.pathname.startsWith('/api/admin/auth/login') ||
                          url.pathname.startsWith('/api/admin/auth/logout') ||
                          url.pathname.startsWith('/api/admin/verify-liff-user') ||
                          url.pathname.startsWith('/api/generate-admin-link') ||
                          url.pathname.startsWith('/api/admin/dashboard-stats') || // Keep for LIFF for now
                          url.pathname.startsWith('/api/get-bookings') ||       // Keep for LIFF for now
                          url.pathname.startsWith('/api/update-booking-status') || // Keep for LIFF for now
                          url.pathname.startsWith('/api/admin/get-orders');       // Keep for LIFF for now

    if (isPublicRoute) {
        console.log(`[Middleware] 放行公開路由: ${url.pathname}`);
        return await next();
    }

    console.log(`[Middleware] 執行驗證: ${url.pathname}`);
    const cookieHeader = request.headers.get('Cookie') || ''; // 取得完整的 Cookie Header
    const tokenMatch = cookieHeader.match(/AuthToken=([^;]+)/);
    const token = tokenMatch ? tokenMatch[1] : null;

    if (token) {
        try {
            const secret = new TextEncoder().encode(env.JWT_SECRET);
            const { payload } = await jose.jwtVerify(token, secret, {
                 issuer: 'urn:tabletop-product:issuer',
                 audience: 'urn:tabletop-product:audience',
             });

            if (payload.role !== 'admin') {
                console.log(`[Middleware] Cookie 驗證失敗: 權限不足 (role: ${payload.role})`);
                return new Response(JSON.stringify({ error: 'Forbidden: Insufficient privileges' }), { status: 403, headers: { 'Content-Type': 'application/json' } });
            }

            context.data.user = payload;
            console.log(`[Middleware] Cookie 驗證成功: userId=${payload.userId}, role=${payload.role}`);
            return await next();

        } catch (err) {
            console.log(`[Middleware] Cookie 驗證失敗: Token 無效 (${err.message})`);
            // *** 加入詳細日誌 ***
            console.log(`[Middleware] 無效 Token 時收到的 Cookie Header: ${cookieHeader}`);
            // *** 日誌結束 ***
            const headers = new Headers({ 'Content-Type': 'application/json' });
            headers.set('Set-Cookie', `AuthToken=; HttpOnly; Secure; Path=/; Max-Age=0; SameSite=Lax`);
            return new Response(JSON.stringify({ error: 'Unauthorized: Invalid token', details: err.message }), { status: 401, headers: headers });
        }
    }
     console.log('[Middleware] 未找到有效的 AuthToken Cookie，檢查 Cloudflare Access Header 作為備用...');

    const cfAuthUserEmail = request.headers.get('Cf-Access-Authenticated-User-Email');
    if (cfAuthUserEmail) {
        console.log(`[Middleware] 警告：AuthToken Cookie 未找到，但通過 Cloudflare Access 驗證 (Email: ${cfAuthUserEmail})，本次放行: ${url.pathname}`);
        const userIdMatch = cfAuthUserEmail.match(/^(U[0-9a-fA-F]+)@magic\.link$/);
        if (userIdMatch && userIdMatch[1]) {
            context.data.user = { userId: userIdMatch[1], role: 'admin' };
            console.log(`[Middleware] 從 CF Header 解析出 userId: ${userIdMatch[1]}`);
        } else {
             console.warn(`[Middleware] 無法從 Cf-Access-Authenticated-User-Email (${cfAuthUserEmail}) 解析 userId`);
             context.data.user = { userId: 'unknown_cf_user', role: 'admin' };
        }
        return await next(); // 基於 CF Header 放行
    }

    // *** 加入詳細日誌 ***
    console.log('[Middleware] 驗證失敗: 缺少有效的 AuthToken Cookie 或 Cloudflare Access Header');
    console.log(`[Middleware] 最終失敗時收到的 Cookie Header: ${cookieHeader || '(not present)'}`); // 記錄收到的 Cookie
    console.log(`[Middleware] 最終失敗時收到的 Cf-Access-Authenticated-User-Email: ${cfAuthUserEmail || '(not present)'}`); // 記錄 CF Header
    console.log(`[Middleware] 最終失敗時收到的所有 Headers:`); // 記錄所有 Header
    request.headers.forEach((value, key) => {
      console.log(`  ${key}: ${value}`);
    });
    // *** 日誌結束 ***
    return new Response(JSON.stringify({ error: 'Unauthorized: Missing token or authentication header' }), { status: 401, headers: { 'Content-Type': 'application/json' } });
}

export const onRequest = [authMiddleware];