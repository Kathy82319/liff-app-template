// functions/api/admin/_middleware.js (最終版 - 適應 DEMO_SITE_URL)

import * as jose from 'jose';

async function authMiddleware(context) {
    const { request, env, next } = context;
    const url = new URL(request.url);

    // --- 【核心修正】---
    // 檢查 DEMO_SITE_URL 環境變數是否存在(這是我自己設定的變數)
    if (env.DEMO_SITE_URL) {
        try {
            // 獲取當前請求的網址主機名稱 (e.g., "liff-app-template-demo.pages.dev")
            const currentHostname = url.hostname;
            
            // 獲取您在環境變數中設定的 DEMO 網站的主機名稱
            const demoHostname = new URL(env.DEMO_SITE_URL).hostname;

            // 如果兩個主機名稱完全相同，就確認為 DEMO 模式
            if (currentHostname === demoHostname) {
                console.log(`[Auth Middleware] Hostname matches DEMO_SITE_URL. Bypassing authentication.`);
                context.data.user = { userId: 'demo_user', role: 'admin' };
                return await next(); // 放行請求
            }
        } catch (e) {
            console.error("解析 DEMO_SITE_URL 時發生錯誤:", e);
            // 如果 DEMO_SITE_URL 格式不正確，則繼續執行嚴格驗證以策安全
        }
    }
    // --- 【修正結束】---


    // --- 正式環境 (main branch) 或 DEMO 模式不匹配時，執行的嚴格驗證 ---
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
    
    return await next();
}

export const onRequest = [authMiddleware];