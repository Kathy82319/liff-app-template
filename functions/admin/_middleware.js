// functions/_middleware.js
import * as jose from 'jose';

async function authMiddleware(context) {
    const { request, env, next } = context;
    const url = new URL(request.url);

    // 只對 /api/admin/ 路由下的請求進行權限檢查
    if (url.pathname.startsWith('/api/admin/')) {
        // 排除登入/登出 API，否則永遠無法登入
        if (url.pathname.startsWith('/api/admin/auth/')) {
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
                issuer: 'urn:tabletop-game:issuer',
                audience: 'urn:tabletop-game:audience',
            });

            if (payload.role !== 'admin') {
                return new Response(JSON.stringify({ error: 'Forbidden: Insufficient privileges' }), { status: 403 });
            }

            context.data.user = payload; // 將驗證過的用戶資訊傳遞下去

        } catch (err) {
            // Token 驗證失敗 (例如過期、偽造等)
            return new Response(JSON.stringify({ error: 'Unauthorized: Invalid token' }), { status: 401 });
        }
    }

    // 如果不是 admin 路由或驗證通過，就繼續執行原本的 API
    return await next();
}

export const onRequest = [authMiddleware];