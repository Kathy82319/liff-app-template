// functions/_middleware.js

// 這是一個輔助函式，用來解析 Cookie 字串
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


export async function onRequest(context) {
  const { request, next } = context;
  const url = new URL(request.url);

  // 檢查使用者是否正在存取後台面板頁面
  if (url.pathname.startsWith('/admin-panel.html')) {
    const cookie = request.headers.get('Cookie') || '';
    const cookies = parseCookie(cookie);
    const token = cookies.AuthToken;

    // 如果沒有 token，就將使用者重新導向到登入頁面
    if (!token) {
      const loginUrl = new URL('/admin-login.html', url);
      return Response.redirect(loginUrl.toString(), 302);
    }
    
    // 如果有 token，我們可以在這裡選擇性地驗證它。
    // 但因為所有 /api/admin 的請求都已經有 middleware 保護，
    // 這裡只做存在性檢查也可以達到保護頁面的效果。
  }

  // 對於所有其他請求，繼續正常處理
  return await next();
}