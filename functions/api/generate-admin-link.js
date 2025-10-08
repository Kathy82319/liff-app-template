// functions/api/generate-admin-link.js

import * as jose from 'jose';

export async function onRequest(context) {
    try {
        if (context.request.method !== 'POST') {
            return new Response(JSON.stringify({ success: false, error: '僅允許 POST 請求' }), { status: 405, headers: { 'Content-Type': 'application/json' } });
        }

        const { userId } = await context.request.json();
        if (!userId) {
            return new Response(JSON.stringify({ success: false, error: '缺少使用者 ID' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
        }

        const { DB, CF_ACCESS_CLIENT_ID, CF_ACCESS_CLIENT_SECRET } = context.env;

        if (!CF_ACCESS_CLIENT_ID || !CF_ACCESS_CLIENT_SECRET) {
            console.error('伺服器環境變數不完整: 缺少 CF_ACCESS_CLIENT_ID 或 CF_ACCESS_CLIENT_SECRET');
            return new Response(JSON.stringify({ success: false, error: '伺服器設定不完整，無法產生連結' }), { status: 500, headers: { 'Content-Type': 'application/json' } });
        }

        const user = await DB.prepare("SELECT tag FROM Users WHERE user_id = ?").bind(userId).first();
        if (user && user.tag === '黑名單') {
            return new Response(JSON.stringify({ success: false, error: '抱歉，您目前無權限體驗後台功能' }), { status: 403, headers: { 'Content-Type': 'application/json' } });
        }

        const now = Math.floor(Date.now() / 1000);
        
        // 根據 Cloudflare Service Token 的要求，payload 需包含 email, nonce, iat, exp 等
        const payload = {
            email: `${userId.substring(0, 10)}@magic.link`, // 建立一個唯一的假 Email
            iat: now,
            nbf: now,
            exp: now + 3600, // 1 小時後過期
            nonce: crypto.randomUUID()
        };
        
        const secret = new TextEncoder().encode(CF_ACCESS_CLIENT_SECRET);
        
        const jwt = await new jose.SignJWT(payload)
            .setProtectedHeader({ alg: 'HS256', kid: context.env.CF_ACCESS_KEY_ID }) // 如果您的 Service Token 有 Key ID，請加入
            .sign(secret);
            
        // 組合 Magic Link
        const url = new URL(context.request.url);
        const magicLink = `https://${url.hostname}/admin-panel.html?cf_authorization=${jwt}`;

        return new Response(JSON.stringify({ success: true, link: magicLink }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
        });

    } catch (error) {
        console.error('產生 Magic Link 時發生錯誤:', error);
        return new Response(JSON.stringify({ success: false, error: `產生連結時發生內部錯誤: ${error.message}` }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' },
        });
    }
}