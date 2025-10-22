// functions/api/admin/auth/magic-login.js (Adding Header Logging)

import * as jose from 'jose';

export async function onRequest(context) {
    const { request, env } = context;
    const url = new URL(request.url);

    const cfAuthUserEmail = request.headers.get('Cf-Access-Authenticated-User-Email');
    if (!cfAuthUserEmail) {
        console.error('[MagicLogin] 錯誤：缺少 Cf-Access-Authenticated-User-Email Header。請確認此端點已受 Cloudflare Access 保護。');
        return new Response('Forbidden: Access denied. Missing Cloudflare authentication header.', { status: 403 });
    }
     console.log(`[MagicLogin] Cloudflare Access 驗證通過，Email: ${cfAuthUserEmail}`);

    const userIdMatch = cfAuthUserEmail.match(/^(U[0-9a-fA-F]+)@magic\.link$/);
    if (!userIdMatch || !userIdMatch[1]) {
        console.error(`[MagicLogin] 錯誤：無法從 Cf-Access-Authenticated-User-Email (${cfAuthUserEmail}) 解析有效的 User ID。`);
        return new Response('Forbidden: Invalid user identity derived from Cloudflare.', { status: 403 });
    }
    const userId = userIdMatch[1];
     console.log(`[MagicLogin] 解析 User ID 成功: ${userId}`);

    try {
        const appSecret = new TextEncoder().encode(env.JWT_SECRET);
        const alg = 'HS256';
        const appJwt = await new jose.SignJWT({ userId: userId, role: 'admin' })
            .setProtectedHeader({ alg })
            .setExpirationTime('8h')
            .setIssuer('urn:tabletop-product:issuer')
            .setAudience('urn:tabletop-product:audience')
            .sign(appSecret);

        const headers = new Headers();
        // *** 建立 Cookie 字串 ***
        const cookieString = `AuthToken=${appJwt}; HttpOnly; Secure; Path=/; Max-Age=28800; SameSite=Lax`;
        headers.set('Set-Cookie', cookieString); // 設定 Cookie
        headers.set('Location', '/admin-panel.html'); // 設定重導向

        // *** 加入詳細日誌 ***
        console.log(`[MagicLogin] 成功為 User ${userId} 產生 AuthToken。`);
        console.log('[MagicLogin] 準備回傳 302 Redirect，包含 Headers:');
        console.log(`  Set-Cookie: ${cookieString}`); // 記錄確切的 Cookie 字串
        console.log(`  Location: /admin-panel.html`);
        // *** 日誌結束 ***

        return new Response(null, {
            status: 302,
            headers: headers
        });

    } catch (error) {
        console.error('[MagicLogin] 產生應用程式 JWT 或設定重導向時發生錯誤:', error);
        return new Response('Internal Server Error during magic login process.', { status: 500 });
    }
}