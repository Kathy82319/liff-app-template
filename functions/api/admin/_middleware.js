// functions/api/admin/_middleware.js (修正並加入偵錯日誌)
import * as jose from 'jose';

async function authMiddleware(context) {
    const { request, env, next } = context;
    const url = new URL(request.url);

    // 只對 /api/admin/ 路由下的請求進行權限檢查
    if (url.pathname.startsWith('/api/admin/')) {
        // 排除登入/登出和狀態檢查 API
        if (url.pathname.startsWith('/api/admin/auth/')) {
            return await next();
        }

        const cookie = request.headers.get('Cookie') || '';
        const tokenMatch = cookie.match(/AuthToken=([^;]+)/);
        const token = tokenMatch ? tokenMatch[1] : null;

        if (!token) {
            console.log('[Auth Middleware] 驗證失敗: 找不到 Token。');
            return new Response(JSON.stringify({ error: 'Unauthorized: Missing token' }), { status: 401 });
        }

        try {
            const secret = new TextEncoder().encode(env.JWT_SECRET);
            
            // 【**核心修正：將 'game' 改為 'product'**】
            const { payload } = await jose.jwtVerify(token, secret, {
                issuer: 'urn:tabletop-product:issuer',
                audience: 'urn:tabletop-product:audience',
            });

            if (payload.role !== 'admin') {
                console.log(`[Auth Middleware] 權限不足: Role is '${payload.role}', but expected 'admin'.`);
                return new Response(JSON.stringify({ error: 'Forbidden: Insufficient privileges' }), { status: 403 });
            }

            // 將驗證過的用戶資訊傳遞給後續的 API 函式
            context.data.user = payload; 

        } catch (err) {
            // 【偵錯強化】讓靜默的錯誤在後台日誌中顯示出來
            console.error('[Auth Middleware] JWT 驗證失敗:', err.code, err.message);
            return new Response(JSON.stringify({ error: 'Unauthorized: Invalid token', details: err.message }), { status: 401 });
        }
    }

    // 如果不是 admin 路由或驗證通過，就繼續執行
    return await next();
}

export const onRequest = [authMiddleware];