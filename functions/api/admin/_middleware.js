// functions/api/admin/_middleware.js (v7 - 加入 Cloudflare Access 檢查)

import * as jose from 'jose';

async function authMiddleware(context) {
    const { request, env, next } = context;
    const url = new URL(request.url);

    // 只處理 /api/admin/ 路徑下的請求
    if (!url.pathname.startsWith('/api/admin/')) {
        return await next();
    }

    // 1. 檢查是否為 LIFF 或其他完全公開的路由 (不需要任何驗證)
    const isPublicRoute = url.pathname.startsWith('/api/admin/auth/login') ||
                          url.pathname.startsWith('/api/admin/auth/logout') ||
                          url.pathname.startsWith('/api/admin/verify-liff-user') ||
                          url.pathname.startsWith('/api/admin/dashboard-stats') ||
                          url.pathname.startsWith('/api/get-bookings') || // booking 列表 API (注意: 此路徑可能需調整)
                          url.pathname.startsWith('/api/update-booking-status') || // booking 狀態更新 API (注意: 此路徑可能需調整)
                          url.pathname.startsWith('/api/generate-admin-link') ||
                          url.pathname.startsWith('/api/admin/get-orders'); // 訂單 API

    if (isPublicRoute) {
        console.log(`[Middleware] 放行公開路由: ${url.pathname}`);
        return await next();
    }

    // 2. 檢查是否通過 Cloudflare Access 驗證 (Magic Link 流程)
    // Cloudflare Access 驗證成功後會添加 Cf-Access-Authenticated-User-Email Header
    const cfAuthUserEmail = request.headers.get('Cf-Access-Authenticated-User-Email');
    if (cfAuthUserEmail) {
        console.log(`[Middleware] 通過 Cloudflare Access 驗證 (Email: ${cfAuthUserEmail})，放行: ${url.pathname}`);
        // 這裡可以選擇性地解析 cfAuthUserEmail 或 Cf-Access-Jwt-Assertion 來獲取用戶資訊放入 context.data
        // 例如，如果我們用 user ID 當 email 前綴:
        const userIdMatch = cfAuthUserEmail.match(/^(U[0-9a-f]+)@magic\.link$/);
        if (userIdMatch && userIdMatch[1]) {
            context.data.user = { userId: userIdMatch[1], role: 'admin' }; // 假設通過 CF Access 就是 admin
             console.log(`[Middleware] 從 CF Header 解析出 userId: ${userIdMatch[1]}`);
        } else {
             console.warn(`[Middleware] 無法從 Cf-Access-Authenticated-User-Email (${cfAuthUserEmail}) 解析 userId`);
             context.data.user = { userId: 'unknown_cf_user', role: 'admin' };
        }
        return await next();
    }
     console.log(`[Middleware] 未找到 Cloudflare Access Header，繼續檢查 Cookie...`);


    // 3. 檢查是否有 AuthToken Cookie (標準 Web 登入流程)
    console.log(`[Middleware] 執行 Cookie 驗證: ${url.pathname}`);
    const cookie = request.headers.get('Cookie') || '';
    const tokenMatch = cookie.match(/AuthToken=([^;]+)/);
    const token = tokenMatch ? tokenMatch[1] : null;

    if (!token) {
        console.log('[Middleware] Cookie 驗證失敗: 缺少 Token');
        return new Response(JSON.stringify({ error: 'Unauthorized: Missing token' }), { status: 401, headers: { 'Content-Type': 'application/json' } });
    }

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
        // 將 payload 存入 context.data 供後續 API 使用
        context.data.user = payload;
        console.log(`[Middleware] Cookie 驗證成功: userId=${payload.userId}, role=${payload.role}`);
        return await next(); // 驗證成功，繼續處理請求

    } catch (err) {
        console.log(`[Middleware] Cookie 驗證失敗: Token 無效 (${err.message})`);
        // 清除可能無效的 Cookie
        const headers = new Headers({ 'Content-Type': 'application/json' });
        headers.set('Set-Cookie', `AuthToken=; HttpOnly; Secure; Path=/; Max-Age=0; SameSite=Lax`);
        return new Response(JSON.stringify({ error: 'Unauthorized: Invalid token', details: err.message }), { status: 401, headers: headers });
    }
}

export const onRequest = [authMiddleware];