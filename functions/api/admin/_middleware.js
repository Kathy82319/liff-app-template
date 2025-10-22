// functions/api/admin/_middleware.js (v6 - 正確處理 LIFF 和 Cloudflare Access)

import * as jose from 'jose';

async function authMiddleware(context) {
    const { request, env, next } = context;
    const url = new URL(request.url);

    // 如果請求路徑不是 /api/admin/ 開頭，直接放行
    if (!url.pathname.startsWith('/api/admin/')) {
        return await next();
    }

    // --- 第一道檢查：Cloudflare Access 驗證標頭 ---
    const cfAuthUser = request.headers.get('Cf-Access-Authenticated-User-Email');
    if (cfAuthUser) {
        console.log(`[Middleware] Cloudflare Access authenticated user: ${cfAuthUser}. Bypassing Cookie check for ${url.pathname}`);
        context.data.user = { email: cfAuthUser, source: 'cloudflare-access' };
        return await next(); // 已通過 CF 驗證，放行
    }

    // --- 第二道檢查：不需要 Cookie 的公開路由 (LIFF 會用到) ---
    const isPublicRoute = url.pathname.startsWith('/api/admin/auth/login') ||
                          url.pathname.startsWith('/api/admin/auth/logout') ||
                          // ↓↓↓ LIFF 需要的 API 放這裡 ↓↓↓
                          url.pathname.startsWith('/api/admin/verify-liff-user') ||
                          url.pathname.startsWith('/api/admin/dashboard-stats') ||
                          url.pathname.startsWith('/api/get-bookings') || // 注意：這個路徑不在 /admin/ 下，但為了一致性先放著
                          url.pathname.startsWith('/api/update-booking-status') || // 注意：這個路徑不在 /admin/ 下
                          url.pathname.startsWith('/api/generate-admin-link') || // 注意：這個路徑不在 /admin/ 下
                          url.pathname.startsWith('/api/admin/activities');

    if (isPublicRoute) {
        // 特別處理不在 /admin/ 下的路徑，確保它們真的不需要驗證
        // (如果未來這些 API 也需要 admin 權限，需要調整)
        if (!url.pathname.startsWith('/api/admin/')) {
             console.log(`[Middleware] 放行非 Admin 公開路由: ${url.pathname}`);
        } else {
             console.log(`[Middleware] 放行 Admin 公開路由: ${url.pathname}`);
        }
        return await next(); // 是公開路由，放行
    }

    // --- 第三道檢查：標準 Cookie/JWT 驗證 (用於完整版後台) ---
    console.log(`[Middleware] 執行 Cookie 驗證: ${url.pathname}`);
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
        context.data.user = { ...payload, source: 'jwt-cookie' };
        console.log(`[Middleware] Cookie 驗證成功: userId=${payload.userId}, role=${payload.role}`);
        return await next(); // 驗證成功，執行目標 API

    } catch (err) {
        console.log(`[Middleware] Cookie 驗證失敗: Token 無效 (${err.message})`);
        const headers = new Headers();
        headers.set('Set-Cookie', `AuthToken=; HttpOnly; Secure; Path=/; Max-Age=0; SameSite=Lax`);
        return new Response(JSON.stringify({ error: 'Unauthorized: Invalid token', details: err.message }), { status: 401, headers: headers });
    }
}

export const onRequest = [authMiddleware];