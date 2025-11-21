// functions/api/admin/_middleware.js - 安全修正版本

// 引入用於 JWT 驗證的函式，假設您的專案已經有這個設定
import { verifyAuthToken } from '../utils/auth-helpers.js';


// **重要：只有與「登入流程」和「狀態檢查」相關的 API 才是公開的。**
// 任何涉及資料 CRUD（新增、讀取、修改、刪除）的 Admin API 都必須移除。
const isPublicRoute = (pathname) => {
  const publicRoutes = [
    '/api/admin/auth/login',    // 允許：未登入狀態下呼叫登入
    '/api/admin/auth/status',   // 允許：檢查登入狀態
    '/api/admin/auth/logout',   // 允許：登出操作
  ];
  // 檢查當前路徑是否在公開清單中
  return publicRoutes.some(route => pathname.endsWith(route));
};

export const onRequest = async (context) => {
  const { request, next } = context;
  const url = new URL(request.url);
  const pathname = url.pathname.toLowerCase();

  // 1. 如果是公開路由，直接跳過驗證
  if (isPublicRoute(pathname)) {
    console.log(`Middleware: Public route - skipping auth for ${pathname}`);
    return next();
  }

  // 2. 處理需要驗證的路由
  const authHeader = request.headers.get('Authorization');

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return new Response('Unauthorized: Missing or invalid token', { status: 401 });
  }

  const token = authHeader.split(' ')[1];

  try {
    // 驗證 JWT Token。這會檢查 Token 是否有效、未過期。
    const decoded = await verifyAuthToken(token, context.env.JWT_SECRET); 

    // 將解碼後的用戶資訊（如 Admin ID 或角色）附加到 request context，供後續 API 存取
    context.data = context.data || {};
    context.data.adminUser = decoded;

    // 驗證通過，繼續處理請求
    return next();

  } catch (error) {
    console.error('JWT Verification Failed:', error.message);
    return new Response('Forbidden: Invalid or expired token', { status: 403 });
  }
};