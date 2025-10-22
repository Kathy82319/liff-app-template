// functions/api/admin/_middleware.js (v5 - Cloudflare Access Check)

import * as jose from 'jose';

async function authMiddleware(context) {
    const { request, env, next } = context;
    const url = new URL(request.url);

    // 如果請求路徑不是 /api/admin/ 開頭，直接放行
    if (!url.pathname.startsWith('/api/admin/')) {
        return await next();
    }

    // 優先檢查 Cloudflare Access 的驗證標頭
    // 常見標頭: Cf-Access-Authenticated-User-Email, Cf-Access-Jwt-Assertion
    const cfAuthUser = request.headers.get('Cf-Access-Authenticated-User-Email');
    if (cfAuthUser) {
        console.log(`[Middleware] Cloudflare Access authenticated user: ${cfAuthUser}. Bypassing Cookie check for ${url.pathname}`);
        // 可選：如果需要，可以在此處驗證 Cf-Access-Jwt-Assertion 以增強安全性
        // 將 Cloudflare Access 的使用者資訊加入 context，供後續 API 使用
        context.data.user = { email: cfAuthUser, source: 'cloudflare-access' };
        return await next(); // 跳過 Cookie 檢查，直接執行目標 API
    }

    // --- 如果沒有 Cloudflare 標頭，則執行標準的 Cookie/JWT 驗證 ---

    // 不需要 Cookie 驗證的白名單 (僅限登入/登出 API 本身)
    const isPublicAuthRoute = url.pathname.startsWith('/api/admin/auth/login') ||
                              url.pathname.startsWith('/api/admin/auth/logout');

    if (isPublicAuthRoute) {
        console.log(`[Middleware] 放行公開登入/登出路由: ${url.pathname}`);
        return await next();
    }

    // --- 對所有其他的 /api/admin/* 路由執行 Cookie/JWT 驗證 ---
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

        // 確保 JWT 中的角色是 'admin'
        if (payload.role !== 'admin') {
            console.log(`[Middleware] Cookie 驗證失敗: 權限不足 (role: ${payload.role})`);
            return new Response(JSON.stringify({ error: 'Forbidden: Insufficient privileges' }), { status: 403 });
        }
        // 將 JWT payload 加入 context data 供後續 API 使用
        context.data.user = { ...payload, source: 'jwt-cookie' };
         console.log(`[Middleware] Cookie 驗證成功: userId=${payload.userId}, role=${payload.role}`);
         return await next(); // 驗證成功，執行目標 API

    } catch (err) {
        console.log(`[Middleware] Cookie 驗證失敗: Token 無效 (${err.message})`);
        // 清除無效的 Cookie
        const headers = new Headers();
        headers.set('Set-Cookie', `AuthToken=; HttpOnly; Secure; Path=/; Max-Age=0; SameSite=Lax`);
        return new Response(JSON.stringify({ error: 'Unauthorized: Invalid token', details: err.message }), { status: 401, headers: headers });
    }
}

export const onRequest = [authMiddleware];