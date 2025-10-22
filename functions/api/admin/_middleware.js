// functions/api/admin/_middleware.js (v8 - 配合 MagicLogin 方案)

import * as jose from 'jose';

async function authMiddleware(context) {
    const { request, env, next } = context;
    const url = new URL(request.url);

    // 只處理 /api/admin/ 路徑
    if (!url.pathname.startsWith('/api/admin/')) {
        return await next();
    }

    // 1. 公開路由檢查 (無需任何驗證)
    const isPublicRoute = url.pathname.startsWith('/api/admin/auth/login') || // 標準登入入口
                          url.pathname.startsWith('/api/admin/auth/logout') || // 登出
                          url.pathname.startsWith('/api/admin/verify-liff-user') || // LIFF 身份驗證
                          url.pathname.startsWith('/api/generate-admin-link') || // 產生 Magic Link
                          // 以下是 LIFF 可能需要直接存取的 API (需確認)
                          url.pathname.startsWith('/api/admin/dashboard-stats') ||
                          url.pathname.startsWith('/api/get-bookings') || // 注意：此 API 可能需移至 /api/admin/ 且從白名單移除
                          url.pathname.startsWith('/api/update-booking-status') || // 注意：此 API 可能需移至 /api/admin/ 且從白名單移除
                          url.pathname.startsWith('/api/admin/get-orders');
                          // 注意：`/api/admin/auth/magic-login` 本身不在此列，它受 Cloudflare 保護

    if (isPublicRoute) {
        console.log(`[Middleware] 放行公開路由: ${url.pathname}`);
        return await next();
    }

    // 2. 主要驗證：檢查 AuthToken Cookie
    // 這個 Cookie 應該由標準 Web 登入或 MagicLogin 重導向設定
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

            // 檢查權限
            if (payload.role !== 'admin') {
                console.log(`[Middleware] Cookie 驗證失敗: 權限不足 (role: ${payload.role})`);
                return new Response(JSON.stringify({ error: 'Forbidden: Insufficient privileges' }), { status: 403, headers: { 'Content-Type': 'application/json' } });
            }

            // 驗證成功，將使用者資訊放入 context.data
            context.data.user = payload;
            console.log(`[Middleware] Cookie 驗證成功: userId=${payload.userId}, role=${payload.role}`);
            return await next(); // 放行請求

        } catch (err) {
            console.log(`[Middleware] Cookie 驗證失敗: Token 無效 (${err.message})`);
            // 清除無效 Cookie 並拒絕請求
            const headers = new Headers({ 'Content-Type': 'application/json' });
            headers.set('Set-Cookie', `AuthToken=; HttpOnly; Secure; Path=/; Max-Age=0; SameSite=Lax`);
            return new Response(JSON.stringify({ error: 'Unauthorized: Invalid token', details: err.message }), { status: 401, headers: headers });
        }
    }
     console.log('[Middleware] 未找到有效的 AuthToken Cookie，檢查 Cloudflare Access Header 作為備用...');


    // 3. 次要驗證/備用：檢查 Cloudflare Access Header
    // 這個檢查主要用於記錄或處理 Cookie 尚未設定完成的過渡情況
    const cfAuthUserEmail = request.headers.get('Cf-Access-Authenticated-User-Email');
    if (cfAuthUserEmail) {
        console.log(`[Middleware] 警告：AuthToken Cookie 未找到，但通過 Cloudflare Access 驗證 (Email: ${cfAuthUserEmail})，本次放行: ${url.pathname}`);
        // 嘗試解析 userId 並放入 context
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

    // 4. 如果兩種驗證都失敗，則拒絕請求
    console.log('[Middleware] 驗證失敗: 缺少有效的 AuthToken Cookie 或 Cloudflare Access Header');
    return new Response(JSON.stringify({ error: 'Unauthorized: Missing token or authentication header' }), { status: 401, headers: { 'Content-Type': 'application/json' } });
}

export const onRequest = [authMiddleware];