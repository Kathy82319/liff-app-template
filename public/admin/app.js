// public/admin/app.js (Fallback with Delay Check)

import { api } from './api.js';
import { ui } from './ui.js';
import { hideBatchToolbar } from './modules/productManagement.js';

const App = {
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
    configPromise: null,
    isConfigReady: false, // 新增標誌

    // 延遲函式
    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    },

    async handleRouteChange() {
        // 等待 Config Promise 完成 (如果還沒完成)
        if (!this.isConfigReady) {
            try {
                await this.configPromise; // 等待
                this.isConfigReady = true; // 標記完成
                console.log("[App Delay Check] Config is ready after await in handleRouteChange.");
            } catch (error) {
                console.error("[App Delay Check] Config promise failed:", error);
                ui.showPage('error');
                const errorPage = document.getElementById('page-error');
                if(errorPage) errorPage.innerHTML = `<p style="color:red;">系統設定檔載入失敗，無法繼續。</p>`;
                return;
            }
        }
        // 到這裡，this.configPromise 必定已完成，且 window.CONFIG 理應存在

        const pageId = window.location.hash.substring(1) || 'dashboard';
        try { hideBatchToolbar(); } catch(e) { console.warn("Error hiding batch toolbar:", e); }
        ui.setActiveNav(pageId);
        ui.showPage(pageId);

        const modulePath = this.router[pageId];
        if (modulePath) {
            try {
                console.log(`[App Delay Check] Importing module: ${modulePath}`);
                const pageModule = await import(modulePath);

                if (pageModule.init) {
                    console.log(`[App Delay Check] Module imported. Checking window.CONFIG before calling init...`);

                    // ========== ▼▼▼ **核心修改：延遲檢查** ▼▼▼ ==========
                    let attempts = 0;
                    const maxAttempts = 10; // 最多等 1 秒 (10 * 100ms)

                    while (!window.CONFIG && attempts < maxAttempts) {
                        attempts++;
                        console.warn(`[App Delay Check] window.CONFIG not ready yet (Attempt ${attempts}). Waiting 100ms...`);
                        await this.delay(100);
                    }

                    if (!window.CONFIG) {
                        console.error(`[App Delay Check] window.CONFIG still not ready after ${maxAttempts} attempts. Aborting init for ${modulePath}.`);
                        throw new Error("無法載入必要的設定檔 (window.CONFIG)");
                    }
                    // ========== ▲▲▲ **核心修改結束** ▲▲▲ ==========


                    console.log(`[App Delay Check] window.CONFIG confirmed ready. Calling init for module: ${modulePath}`);
                    await pageModule.init(); // 不傳參數

                } else {
                     console.warn(`[App Delay Check] Module ${modulePath} has no init function.`);
                }
            } catch (error) {
                console.error(`載入或初始化模組 ${modulePath} 失敗:`, error);
                const pageElement = document.getElementById(`page-${pageId}`);
                if (pageElement) {
                     pageElement.innerHTML = `<p style="color:red;">載入頁面功能 (${pageId}) 時發生錯誤: ${error.message}</p>`;
                }
            }
        } else {
             console.warn(`[App Delay Check] No module found for pageId: ${pageId}`);
        }
    },

    async init() {
        console.log("[App Delay Check] Initializing...");
        ui.initSharedEventListeners();

        // 啟動設定檔載入 Promise
        this.configPromise = (async () => {
            try {
                console.log("[App Delay Check] Starting config fetch...");
                window.CONFIG = await api.getAppConfig();
                if (!window.CONFIG || !window.CONFIG.LOGIC || !window.CONFIG.LOGIC.ACTIVE_INDUSTRY_TEMPLATE || !window.CONFIG.LOGIC.INDUSTRY_TEMPLATE_DEFINITIONS) {
                    throw new Error('獲取到的設定檔格式不正確或缺少必要內容。');
                }
                console.log('[App Delay Check] Config fetch successful:', window.CONFIG);
                this.isConfigReady = true; // 標記完成
            } catch (error) {
                console.error("[App Delay Check] Config fetch failed:", error);
                this.isConfigReady = false; // 標記失敗
                throw error; // 重新拋出，讓 handleRouteChange 可以捕捉
            }
        })();

        // 設定路由監聽
        window.addEventListener('hashchange', () => this.handleRouteChange());
        document.querySelector('.nav-tabs').addEventListener('click', (event) => {
            if (event.target.tagName === 'A') {
                event.preventDefault();
                const newHash = event.target.getAttribute('href');
                if (window.location.hash !== newHash) {
                    window.location.hash = newHash;
                }
            }
        });

        // 處理初始路由 (會等待 configPromise)
        await this.handleRouteChange();
        console.log("[App Delay Check] Initial route handled.");
    }
};

document.addEventListener('DOMContentLoaded', () => {
     App.init();
});