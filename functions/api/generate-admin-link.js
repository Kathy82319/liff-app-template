// functions/api/generate-admin-link.js
import * as jose from 'jose';

export async function onRequest(context) {
    try {
        if (context.request.method !== 'POST') {
            return new Response(JSON.stringify({ error: '無效的請求方法' }), { status: 405 });
        }

        const { userId } = await context.request.json();
        if (!userId) {
            return new Response(JSON.stringify({ error: '缺少使用者 ID' }), { status: 400 });
        }

        const { env, request } = context;
        const db = env.DB;
        
        // --- 【黑名單檢查】 ---
        const user = await db.prepare("SELECT tag FROM Users WHERE user_id = ?").bind(userId).first();
        if (user && user.tag === '黑名單') {
            return new Response(JSON.stringify({ error: '您的帳號權限不足，無法體驗此功能。' }), { status: 403 });
        }
        // --- 檢查結束 ---

        const { CF_ACCESS_CLIENT_ID, CF_ACCESS_CLIENT_SECRET } = env;
        if (!CF_ACCESS_CLIENT_ID || !CF_ACCESS_CLIENT_SECRET) {
            throw new Error('缺少 Cloudflare Access 的環境變數設定。');
        }

        // 產生一個有時效性的 JWT
        const secret = new TextEncoder().encode(CF_ACCESS_CLIENT_SECRET);
        const now = Math.floor(Date.now() / 1000);
        
        const jwt = await new jose.SignJWT({
            // 使用者的身份識別，可以是任意 email 格式
            email: `${userId}@demo.internal`, 
            // 簽發時間
            iat: now,
            // 過期時間 (iat + 1小時)
            exp: now + 3600, 
        })
        .setProtectedHeader({ 
            alg: 'HS256',
            kid: CF_ACCESS_CLIENT_ID // 指定金鑰 ID
        })
        .sign(secret);

        // 組合 Magic Link
        const url = new URL(request.url);
        // 【注意】這裡的 /admin-panel.html 是後台的實際路徑
        const magicLink = `https://${url.hostname}/admin-panel.html?cf_authorization=${jwt}`;

        return new Response(JSON.stringify({ magicLink }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
        });

    } catch (error) {
        console.error('Error generating magic link:', error);
        return new Response(JSON.stringify({ error: '產生體驗連結時發生錯誤。' }), { status: 500 });
    }
}