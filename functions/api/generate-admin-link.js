// functions/api/generate-admin-link.js (修改後 - 指向 magic-login)


export async function onRequest(context) {
    try {
        if (context.request.method !== 'POST') {
            return new Response(JSON.stringify({ success: false, error: '僅允許 POST 請求' }), { status: 405, headers: { 'Content-Type': 'application/json' } });
        }

        const { userId } = await context.request.json();
        if (!userId) {
            return new Response(JSON.stringify({ success: false, error: '缺少使用者 ID' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
        }

        // 從環境變數讀取 Cloudflare Access 設定，包含 KEY ID (如果有的話)
        const { DB, CF_ACCESS_CLIENT_ID, CF_ACCESS_CLIENT_SECRET, CF_ACCESS_KEY_ID } = context.env;

        if (!CF_ACCESS_CLIENT_ID || !CF_ACCESS_CLIENT_SECRET) {
            console.error('伺服器環境變數不完整: 缺少 CF_ACCESS_CLIENT_ID 或 CF_ACCESS_CLIENT_SECRET');
            return new Response(JSON.stringify({ success: false, error: '伺服器設定不完整，無法產生連結' }), { status: 500, headers: { 'Content-Type': 'application/json' } });
        }

        // --- 使用者黑名單檢查 (保持不變) ---
        const user = await DB.prepare("SELECT tag FROM Users WHERE user_id = ?").bind(userId).first();
        if (user && user.tag === '黑名單') {
            return new Response(JSON.stringify({ success: false, error: '抱歉，您目前無權限體驗後台功能' }), { status: 403, headers: { 'Content-Type': 'application/json' } });
        }

        const now = Math.floor(Date.now() / 1000);

        // --- 產生 Cloudflare Access JWT (保持不變) ---
        const payload = {
            email: `${userId.substring(0, 10)}@magic.link`, // 使用與使用者相關的唯一識別符
            iat: now,
            nbf: now,
            exp: now + 3600, // Cloudflare JWT 的有效期限 (例如 1 小時)
            nonce: crypto.randomUUID()
        };
        const secret = new TextEncoder().encode(CF_ACCESS_CLIENT_SECRET);
        const jwt = await new jose.SignJWT(payload)
            // 如果您的 Cloudflare Service Token 設定了 Key ID，請取消下一行的註解並確保環境變數已設定
             .setProtectedHeader({ alg: 'HS256', ...(CF_ACCESS_KEY_ID && { kid: CF_ACCESS_KEY_ID }) })
            .sign(secret);

        // --- *** 關鍵修改：變更 magicLink 的目標 URL *** ---
const url = new URL(context.request.url);
    // 直接指向登入頁面
    const magicLink = `https://${url.hostname}/admin-login.html`; // 或 /admin-panel.html

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