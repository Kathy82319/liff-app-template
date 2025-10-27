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
        'room-availability': './modules/roomAvailabilityManagement.js', 
        'exp-history': './modules/expHistory.js',
        'news': './modules/newsManagement.js',
        'drafts': './modules/draftsManagement.js',
        'store-info': './modules/storeInfo.js',
        'points': './modules/pointsCenter.js',
        'settings': './modules/systemSettings.js',
    },
    configPromise: null,
    isConfigReady: false, 

    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    },

// public/admin/app.js

async handleRouteChange() {
    console.log(`[App.js HandleRouteChange] Hash changed to: ${window.location.hash}`); // 記錄觸發
    if (!this.isConfigReady) {
        console.log("[App.js HandleRouteChange] Config not ready, awaiting promise...");
        try {
            await this.configPromise;
            this.isConfigReady = true;
            console.log("[App.js HandleRouteChange] Config promise resolved.");
        } catch (error) {
            console.error("[App.js HandleRouteChange] Config promise failed:", error);
            ui.showPage('error');
            const errorPage = document.getElementById('page-error');
            if(errorPage) errorPage.innerHTML = `<p style="color:red;">系統設定檔載入失敗，無法繼續。</p>`;
            return; // Config 失敗，停止後續處理
        }
    } else {
         console.log("[App.js HandleRouteChange] Config was already ready.");
    }

    const pageId = window.location.hash.substring(1) || 'dashboard';
    console.log(`[App.js HandleRouteChange] Determined pageId: ${pageId}`);

    try {
        console.log("[App.js HandleRouteChange] Attempting to hide batch toolbar...");
        hideBatchToolbar();
    } catch(e) {
        console.warn("[App.js HandleRouteChange] Error hiding batch toolbar:", e);
    }

    console.log(`[App.js HandleRouteChange] Setting active nav for: ${pageId}`);
    ui.setActiveNav(pageId);

    // ***** Add logging around ui.showPage *****
    console.log(`[App.js HandleRouteChange] About to call ui.showPage('${pageId}')`);
    ui.showPage(pageId); // This updates innerHTML and sets display style
    console.log(`[App.js HandleRouteChange] ui.showPage('${pageId}') finished.`);
    // ***** Logging added *****

    const modulePath = this.router[pageId];
    console.log(`[App.js HandleRouteChange] Module path for ${pageId}: ${modulePath || 'None'}`);

    if (modulePath) {
        try {
            console.log(`[App.js HandleRouteChange] Importing module: ${modulePath}`);
            const pageModule = await import(modulePath);
            console.log(`[App.js HandleRouteChange] Module ${modulePath} imported successfully.`);

            if (pageModule.init) {
                // ... (window.CONFIG check remains the same) ...
                if (!window.CONFIG) {
                     // 這段理論上不該發生，因為前面 await 了 configPromise
                     console.error(`[App.js HandleRouteChange] CRITICAL: window.CONFIG is missing AFTER await! Aborting init for ${modulePath}.`);
                     throw new Error("無法載入必要的設定檔 (window.CONFIG)");
                }

                console.log(`[App.js HandleRouteChange] Calling init() for ${modulePath}`);
                await pageModule.init();
                console.log(`[App.js HandleRouteChange] init() for ${modulePath} finished.`);

                // ***** Modify the initialization trigger *****
                if (pageId === 'room-availability' && pageModule.initializeDatePickers) {
                    console.log(`[App.js HandleRouteChange] Page is room-availability, scheduling initializeDatePickers via RAF...`);
                    // 使用兩層 RAF 確保 DOM 更新
                    requestAnimationFrame(() => {
                         requestAnimationFrame(() => {
                            console.log("%c[App.js HandleRouteChange] Inside RAF, calling initializeDatePickers NOW...", "color: orange;");
                            try {
                                pageModule.initializeDatePickers();
                            } catch (pickerError) {
                                console.error("[App.js HandleRouteChange] Error calling initializeDatePickers from RAF:", pickerError);
                                ui.toast.error(`初始化日期選擇器失敗: ${pickerError.message}`);
                            }
                        });
                    });
                } else {
                     console.log(`[App.js HandleRouteChange] Not calling initializeDatePickers for ${pageId}.`);
                }
            } else {
                 console.warn(`[App.js HandleRouteChange] Module ${modulePath} has no init function.`);
            }
        } catch (error) {
             console.error(`載入或初始化模組 ${modulePath} 失敗:`, error);
             const pageElement = document.getElementById(`page-${pageId}`);
             if (pageElement) {
                  pageElement.innerHTML = `<p style="color:red;">載入頁面功能 (${pageId}) 時發生錯誤: ${error.message}</p>`;
             }
        }
    } else {
         console.warn(`[App.js HandleRouteChange] No module found for pageId: ${pageId}`);
    }
    console.log(`[App.js HandleRouteChange] Finished handling route for ${pageId}.`);
},

    async init() {
        ui.initSharedEventListeners();

        this.configPromise = (async () => {
            try {
                window.CONFIG = await api.getAppConfig();
                if (!window.CONFIG || !window.CONFIG.LOGIC || !window.CONFIG.LOGIC.ACTIVE_INDUSTRY_TEMPLATE || !window.CONFIG.LOGIC.INDUSTRY_TEMPLATE_DEFINITIONS) {
                    throw new Error('獲取到的設定檔格式不正確或缺少必要內容。');
                }
                this.isConfigReady = true; 
            } catch (error) {
                console.error("[App Delay Check] Config fetch failed:", error);
                this.isConfigReady = false; 
                throw error; 
            }
        })();

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

        await this.handleRouteChange();
    }
};

document.addEventListener('DOMContentLoaded', () => {
     App.init();
});