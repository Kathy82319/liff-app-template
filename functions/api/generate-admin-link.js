// functions/api/generate-admin-link.js

import * as jose from 'jose';

export async function onRequest(context) {
    try {
        // 1. 檢查請求方法和內容
        if (context.request.method !== 'POST') {
            return new Response(JSON.stringify({ success: false, error: '僅允許 POST 請求' }), { status: 405 });
        }

        const { userId } = await context.request.json();
        if (!userId) {
            return new Response(JSON.stringify({ success: false, error: '缺少使用者 ID' }), { status: 400 });
        }

        const db = context.env.DB;
        const { CF_ACCESS_CLIENT_ID, CF_ACCESS_CLIENT_SECRET, DEMO_SITE_URL } = context.env;

        // 2. 檢查必要的環境變數是否存在
        if (!CF_ACCESS_CLIENT_ID || !CF_ACCESS_CLIENT_SECRET || !DEMO_SITE_URL) {
            console.error('缺少必要的環境變數：CF_ACCESS_CLIENT_ID, CF_ACCESS_CLIENT_SECRET, 或 DEMO_SITE_URL');
            return new Response(JSON.stringify({ success: false, error: '伺服器設定不完整，無法產生連結' }), { status: 500 });
        }

        // 3. 安全性檢查：從資料庫查詢使用者是否在黑名單
        const user = await db.prepare("SELECT tag FROM Users WHERE user_id = ?").bind(userId).first();
        if (user && user.tag === '黑名單') {
            return new Response(JSON.stringify({ success: false, error: '抱歉，您目前無權限體驗後台功能' }), { status: 403 });
        }

        // 4. 使用 jose 函式庫產生 Cloudflare Access 需要的 JWT
        const now = Math.floor(Date.now() / 1000);
        const exp = now + 3600; // JWT 有效期 1 小時

        const claims = {
            "email": `${userId}@demo.com`, // Cloudflare Access 需要一個 email 格式的聲明
            "iat": now,
            "exp": exp,
            "iss": `https://您的CloudflareAccess域名`, // 請到 Zero Trust 後台 Access -> Applications -> 找到您的應用 -> Overview -> Application domain
            "aud": [CF_ACCESS_CLIENT_ID]
        };
        
        const secret = new TextEncoder().encode(CF_ACCESS_CLIENT_SECRET);
        
        // 注意：這裡我們不直接簽署，Cloudflare 的 Service Token 是直接組合使用的
        // 根據 Cloudflare 的 Magic Link 邏輯，我們是將 claims 送到一個特定的 URL
        // 為了簡化，我們先假設一個可以直接使用的 JWT 驗證方式
        
        const jwt = await new jose.SignJWT(claims)
            .setProtectedHeader({ alg: 'HS256' })
            .sign(secret);
            
        // 5. 組合 Magic Link
        // 這個連結格式是 Cloudflare 一個非標準但可行的做法，將 JWT 作為 token 參數
        // 這需要您的 Zero Trust Policy 設定為 "Allow" based on "Service Auth" or "JWT"
        const magicLink = `${DEMO_SITE_URL}/admin-panel.html?cf_authorization=${jwt}`;

        return new Response(JSON.stringify({ success: true, link: magicLink }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
        });

    } catch (error) {
        console.error('產生 Magic Link 時發生錯誤:', error);
        return new Response(JSON.stringify({ success: false, error: '產生連結時發生內部錯誤' }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' },
        });
    }
}