# Copilot Instructions for liff-app-template

## 專案架構總覽
- 本專案為 LINE LIFF 應用的店務管理系統範本，前後端分離，前端在 `public/`，後端 API 在 `functions/api/`。
- 前端頁面：
  - `index.html`：主要入口
  - `admin-login.html`、`admin-panel.html`：後台登入與管理
  - `config.js`：全域設定，控制功能開關、商業術語、業務邏輯
- 後端 API：
  - `functions/api/` 下分為一般 API 與 `admin/` 管理 API
  - `admin/auth/` 處理登入/登出，JWT 驗證
  - 主要 API 依功能分檔，如會員、預約、租借、桌遊、消息等

## 關鍵開發流程
- **前端開發**：直接修改 `public/` 下 HTML/JS/CSS 檔案，設定檔為 `config.js`，可快速客製化。
- **後端 API**：Cloudflare Functions 標準，單檔即一 API，`onRequest` 為進入點。`_middleware.js` 實現權限控管。
- **管理員登入流程**：
  1. 前端 POST `/api/admin/auth/login`，取得 JWT Token
  2. Token 以 Cookie `AuthToken` 存放
  3. 後台頁面與 `/api/admin/` API 皆需 Token 驗證
- **Google Sheet 整合**：部分 API 會與 Google Sheet 同步（如 `sync-d1-to-sheet.js`、`sync-bookings.js`），使用 `google-spreadsheet` 套件

## 專案慣例與模式
- **API 權限控管**：
  - `functions/api/_middleware.js`：前端頁面導向保護
  - `functions/api/admin/_middleware.js`：API 層 JWT 驗證，僅 `admin/auth/` 免驗證
- **設定檔模式**：所有客製化（功能開關、文字、業務邏輯）集中於 `public/config.js`，前後端皆讀取
- **資料流**：前端透過 fetch 呼叫 API，API 依據設定檔與權限回應
- **命名規則**：API 檔案以功能命名，單一檔案即一 API 路由

## 外部依賴
- `google-spreadsheet`：Google Sheet 整合
- `jose`：JWT 處理

## 重要檔案/目錄
- `public/config.js`：全域設定
- `functions/api/_middleware.js`、`functions/api/admin/_middleware.js`：權限控管
- `functions/api/admin/auth/login.js`：管理員登入
- `functions/api/`、`functions/api/admin/`：API 依功能分檔

## 其他注意事項
- **敏感資訊**（如 JWT secret、API 金鑰）請存放於 Cloudflare 環境變數，不可寫入前端設定檔
- **前端頁面**可直接客製化，API 需遵守權限控管

---
如有不清楚或未涵蓋的部分，請回饋以便補充。
