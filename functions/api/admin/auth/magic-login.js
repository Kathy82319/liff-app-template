// functions/api/admin/auth/magic-login.js (新檔案)

import * as jose from 'jose';

export async function onRequest(context) {
    const { request, env } = context;
    const url = new URL(request.url);

    // 1. 透過 Header 驗證 Cloudflare Access 身份
    // **重要前提**：此 `/api/admin/auth/magic-login` 路徑必須在 Cloudflare Access 中
    // 使用與 `/admin-panel.html` 相同的應用程式/政策進行保護。
    const cfAuthUserEmail = request.headers.get('Cf-Access-Authenticated-User-Email');
    if (!cfAuthUserEmail) {
        console.error('[MagicLogin] 錯誤：缺少 Cf-Access-Authenticated-User-Email Header。請確認此端點已受 Cloudflare Access 保護。');
        // 可以回傳一個更友善的錯誤頁面或訊息
        return new Response('Forbidden: Access denied. Missing Cloudflare authentication header.', { status: 403 });
    }
     console.log(`[MagicLogin] Cloudflare Access 驗證通過，Email: ${cfAuthUserEmail}`);

    // (可選，但建議) 驗證 URL 中的 token 與 Header 中的身份是否匹配
    // const tokenFromUrl = url.searchParams.get('token');
    // 如果需要驗證 tokenFromUrl，可以使用 jose.jwtVerify 配合 CF_ACCESS_CLIENT_SECRET
    // 但如果端點本身已受 CF 保護，僅檢查 Header 通常足夠

    // 2. 從 Email Header 中提取 User ID
    // 假設格式為 <userId>@magic.link，且 userId 符合 LINE User ID 格式 (U 開頭 + 十六進制字符)
    const userIdMatch = cfAuthUserEmail.match(/^(U[0-9a-fA-F]+)@magic\.link$/);
    if (!userIdMatch || !userIdMatch[1]) {
        console.error(`[MagicLogin] 錯誤：無法從 Cf-Access-Authenticated-User-Email (${cfAuthUserEmail}) 解析有效的 User ID。`);
        return new Response('Forbidden: Invalid user identity derived from Cloudflare.', { status: 403 });
    }
    const userId = userIdMatch[1];
     console.log(`[MagicLogin] 解析 User ID 成功: ${userId}`);

    // (可選) 在資料庫中再次確認使用者身份和權限
    // const db = env.DB;
    // const user = await db.prepare("SELECT role FROM Users WHERE user_id = ?").bind(userId).first();
    // if (!user || user.role !== 'admin') {
    //     console.error(`[MagicLogin] User ${userId} 在資料庫中找不到或非管理員。`);
    //     return new Response('Forbidden: User not authorized in application database.', { status: 403 });
    // }

    try {
        // 3. 產生應用程式內部的 AuthToken JWT (用於 Cookie)
        const appSecret = new TextEncoder().encode(env.JWT_SECRET); // 使用您應用程式自己的 JWT 密鑰
        const alg = 'HS256';
        const appJwt = await new jose.SignJWT({ userId: userId, role: 'admin' }) // 假設通過 CF Access 的都是 admin
            .setProtectedHeader({ alg })
            .setExpirationTime('8h') // 與標準登入的 Cookie 有效期一致
            .setIssuer('urn:tabletop-product:issuer') // 與標準登入的 Issuer 一致
            .setAudience('urn:tabletop-product:audience') // 與標準登入的 Audience 一致
            .sign(appSecret);

        // 4. 準備 302 重導向回應，並設定 AuthToken Cookie
        const headers = new Headers();
        headers.set('Set-Cookie', `AuthToken=${appJwt}; HttpOnly; Secure; Path=/; Max-Age=28800; SameSite=Lax`); // 設定應用程式 Cookie
        headers.set('Location', '/admin-panel.html'); // 設定重導向目標

        console.log(`[MagicLogin] 成功為 User ${userId} 產生 AuthToken 並準備重導向至 /admin-panel.html`);

        // 5. 回傳重導向回應
        return new Response(null, {
            status: 302, // Found (Redirect)
            headers: headers
        });

    } catch (error) {
        console.error('[MagicLogin] 產生應用程式 JWT 或設定重導向時發生錯誤:', error);
        return new Response('Internal Server Error during magic login process.', { status: 500 });
    }
}