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
 
// functions/api/_middleware.js (建議的簡潔版本)
 
export const onRequest = async (context) => {
  const { request, next, env } = context;
  const url = new URL(request.url);

  // 保留這個有用的偵錯日誌
  console.log(`[API GATEWAY] Request for: ${url.pathname}. DB binding exists: ${!!env.DB}`);

  // 任務完成，將請求交給下一個守門員 (如果路徑匹配的話) 或目標 API
  return await next();
};