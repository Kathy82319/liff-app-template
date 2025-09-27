// functions/api/_middleware.js

function parseCookie(cookieString) {
    const cookies = {};
    if (cookieString) {
        cookieString.split(';').forEach(cookie => {
            const parts = cookie.match(/(.*?)=(.*)$/)
            if(parts) {
               cookies[parts[1].trim()] = (parts[2] || '').trim();
            }
        });
    }
    return cookies;
}
 
export const onRequest = async (context) => {
  const { request, next, env } = context;
  const url = new URL(request.url);

  // --- 【新增的偵錯 LOG】 ---
  // 這個 Log 會在任何 /api/* 的請求進來時觸發。
  // 我們要觀察的重點是：
  // 1. 這行 Log 到底有沒有出現？
  // 2. Log 中回報的 DB binding 是否為 true？
  console.log(`[MIDDLEWARE_CHECK] Request received for: ${url.pathname}. DB binding exists: ${!!env.DB}`);
  // --- 【偵錯 LOG 結束】 ---

  // 原始的邏輯保持不變
  if (url.pathname.startsWith('/admin-panel.html')) {
    const cookie = request.headers.get('Cookie') || '';
    const cookies = parseCookie(cookie);
    const token = cookies.AuthToken;

    if (!token) {
      const loginUrl = new URL('/admin-login.html', url);
      return Response.redirect(loginUrl.toString(), 302);
    }
  }

  return await next();
};