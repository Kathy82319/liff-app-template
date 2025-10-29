// functions/api/admin/_middleware.js (簡化版 - 僅 Cookie 驗證)
async function authMiddleware(context) {
    const { request, env, next } = context;
    const url = new URL(request.url);

    if (!url.pathname.startsWith('/api/admin/')) {
        return await next();
    }

    // 1. 公開路由檢查 (登入/登出 API)
    const isPublicRoute = url.pathname.startsWith('/api/admin/auth/login') ||
                          url.pathname.startsWith('/api/admin/auth/logout') ||
                          url.pathname.startsWith('/api/admin/verify-liff-user') ||
                          url.pathname.startsWith('/api/generate-admin-link') ||
                          url.pathname.startsWith('/api/admin/dashboard-stats') ||
                          url.pathname.startsWith('/api/get-bookings') ||     
                          url.pathname.startsWith('/api/update-booking-status') || 
                          url.pathname.startsWith('/api/admin/get-orders');      

    if (isPublicRoute) {
        console.log(`[Middleware] 放行公開路由: ${url.pathname}`);
        return await next();
    }

    // 2. 驗證 AuthToken Cookie
    console.log(`[Middleware] 執行 Cookie 驗證: ${url.pathname}`);
    const cookie = request.headers.get('Cookie') || '';
    const tokenMatch = cookie.match(/AuthToken=([^;]+)/);
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
            console.log(`[Middleware] Cookie 驗證成功`);
            return await next();

        } catch (err) { /* Token 無效處理 */ }
    }

    // 3. 驗證失敗
    console.log('[Middleware] Cookie 驗證失敗: 缺少或無效的 Token');
    // 可以選擇重導向到登入頁，或直接回傳 401
    // return Response.redirect(`https://${url.hostname}/admin-login.html`, 302); // 選項 A: 重導向
    return new Response(JSON.stringify({ error: 'Unauthorized: Missing or invalid token' }), { status: 401, headers: { /* Set-Cookie 清除 */ } }); // 選項 B: 回傳 401
}

export const onRequest = [authMiddleware];