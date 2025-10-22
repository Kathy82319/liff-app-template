// public/admin/app.js (Simplified Fallback)

import { api } from './api.js';
import { ui } from './ui.js';
import { hideBatchToolbar } from './modules/productManagement.js'; // Keep this import

const App = {
    // 路由表：將頁面 ID 映射到對應的模組路徑
    router: {
        'dashboard': './modules/dashboard.js',
        'users': './modules/userManagement.js',
        'inventory': './modules/productManagement.js',
        'bookings': './modules/bookingManagement.js',
        'exp-history': './modules/expHistory.js',
        'news': './modules/newsManagement.js',
        'drafts': './modules/draftsManagement.js',
        'store-info': './modules/storeInfo.js',
        'points': './modules/pointsCenter.js',
        'settings': './modules/systemSettings.js',
    },

    // 處理路由變更的核心函式
    async handleRouteChange() {
        // **確保 window.CONFIG 存在才繼續**
        if (!window.CONFIG) {
             console.error("[App Fallback] handleRouteChange called before window.CONFIG is ready. Aborting.");
             // Optionally display an error message to the user
             // document.body.innerHTML = `<p style="color:red;">設定檔尚未載入，請稍後再試或重新整理。</p>`;
             return; // Stop execution if config is not ready
        }

        const pageId = window.location.hash.substring(1) || 'dashboard';

        // Attempt to hide toolbar safely
        try {
             hideBatchToolbar();
        } catch(e) { console.warn("Error hiding batch toolbar:", e); }

        ui.setActiveNav(pageId);
        ui.showPage(pageId);

        const modulePath = this.router[pageId];
        if (modulePath) {
            try {
                console.log(`[App Fallback] Importing module: ${modulePath}`);
                const pageModule = await import(modulePath);
                if (pageModule.init) {
                    console.log(`[App Fallback] Calling init for module: ${modulePath}`);
                    await pageModule.init(); // Call init without parameters
                } else {
                     console.warn(`[App Fallback] Module ${modulePath} has no init function.`);
                }
            } catch (error) {
                console.error(`載入或初始化模組 ${modulePath} 失敗:`, error);
                const pageElement = document.getElementById(`page-${pageId}`);
                if (pageElement) {
                     pageElement.innerHTML = `<p style="color:red;">載入頁面功能 (${pageId}) 時發生錯誤。</p>`;
                }
            }
        } else {
             console.warn(`[App Fallback] No module found for pageId: ${pageId}`);
        }
    },

    // 應用程式初始化函式
    async init() {
        console.log("[App Fallback] Initializing...");
        ui.initSharedEventListeners(); // Setup modal close buttons etc.

        try {
            console.log("[App Fallback] Fetching app config...");
            window.CONFIG = await api.getAppConfig(); // Fetch config first
             if (!window.CONFIG || !window.CONFIG.LOGIC || !window.CONFIG.LOGIC.ACTIVE_INDUSTRY_TEMPLATE || !window.CONFIG.LOGIC.INDUSTRY_TEMPLATE_DEFINITIONS) {
                 throw new Error('獲取到的設定檔格式不正確或缺少必要內容。');
             }
            console.log('[App Fallback] App config loaded:', window.CONFIG);

            // Config loaded, now setup routing and initial route handling
            window.addEventListener('hashchange', () => this.handleRouteChange());

            document.querySelector('.nav-tabs').addEventListener('click', (event) => {
                 if (event.target.tagName === 'A') {
                     event.preventDefault();
                     const newHash = event.target.getAttribute('href');
                     if (window.location.hash !== newHash) {
                         window.location.hash = newHash; // This will trigger hashchange
                     } else {
                          // If hash is the same, manually call handleRouteChange if needed
                          // this.handleRouteChange();
                     }
                 }
            });

            // Handle the initial page load AFTER config is loaded
            await this.handleRouteChange();
            console.log("[App Fallback] Initial route handled.");

        } catch (error) {
            console.error("[App Fallback] Initialization failed:", error);
            document.body.innerHTML = `<div style="text-align: center; padding: 50px; color: #dc3545;"><h2>系統啟動失敗</h2><p>${error.message}</p><p>請確認 API (/api/get-app-config) 是否運作正常，且已在「系統設定」中儲存並啟用一個樣板。</p></div>`;
            return;
        }

        /* Login check removed for simplicity now */
    }
};

// ** Wait for DOMContentLoaded before initializing **
document.addEventListener('DOMContentLoaded', () => {
     // Ensure productManagement's init is not called prematurely if it's the initial page
     // The init logic handles the call sequence now.
     App.init();
});