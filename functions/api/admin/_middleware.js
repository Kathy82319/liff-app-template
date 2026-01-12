// functions/api/admin/_middleware.js - 最終修復版 (支援 Cookie)

// 引入驗證函式 (路徑已修正為上層的 utils)
import { verifyAuthToken } from '../utils/auth-helpers.js';

const isPublicRoute = (pathname) => {
  const publicRoutes = [
    '/api/admin/auth/login',
    '/api/admin/auth/logout',
    '/api/admin/verify-liff-user',
    '/api/admin/auth/forgot-password',
    '/api/admin/reset-default-admin'
  ];
  return publicRoutes.some(route => pathname.endsWith(route));
};

export const onRequest = async (context) => {
  const { request, next } = context;
  const url = new URL(request.url);
  const pathname = url.pathname.toLowerCase();

  // 1. 公開路由直接放行
  if (isPublicRoute(pathname)) {
    return next();
  }

  let token = null;

  // 2. 嘗試從 Header 取得 Token (Bearer Token)
  const authHeader = request.headers.get('Authorization');
  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.split(' ')[1];
  } 
  
  // 3. 【新增】如果 Header 沒 Token，嘗試從 Cookie 取得 (AuthToken)
  else {
    const cookieHeader = request.headers.get('Cookie');
    if (cookieHeader) {
      // 簡單的 Cookie 解析邏輯
      const cookies = cookieHeader.split(';').reduce((acc, cookie) => {
        const [name, value] = cookie.split('=').map(c => c.trim());
        if (name && value) acc[name] = value;
        return acc;
      }, {});
      token = cookies['AuthToken'];
    }
  }

  // 4. 如果兩邊都找不到 Token，就擋下
  if (!token) {
    return new Response('Unauthorized: Missing token in Header or Cookie', { status: 401 });
  }

  try {
    // 5. 驗證 Token
    const decoded = await verifyAuthToken(token, context.env.JWT_SECRET); 
    
    // 將用戶資訊放入 context，供後續 API 使用
    context.data = context.data || {};
    context.data.adminUser = decoded;

    return next();

  } catch (error) {
    console.error('JWT Verification Failed:', error.message);
    return new Response('Forbidden: Invalid or expired token', { status: 403 });
  }
};