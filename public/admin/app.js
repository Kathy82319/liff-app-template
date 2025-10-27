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

    async handleRouteChange() {
        if (!this.isConfigReady) {
            try {
                await this.configPromise; 
                this.isConfigReady = true; 
            } catch (error) {
                console.error("[App Delay Check] Config promise failed:", error);
                ui.showPage('error');
                const errorPage = document.getElementById('page-error');
                if(errorPage) errorPage.innerHTML = `<p style="color:red;">系統設定檔載入失敗，無法繼續。</p>`;
                return;
            }
        }

        const pageId = window.location.hash.substring(1) || 'dashboard';
        try { hideBatchToolbar(); } catch(e) { console.warn("Error hiding batch toolbar:", e); }
        ui.setActiveNav(pageId);
        ui.showPage(pageId);

        const modulePath = this.router[pageId];
        if (modulePath) {
            try {
                const pageModule = await import(modulePath);

                if (pageModule.init) {
                    let attempts = 0;
                    const maxAttempts = 10; 

                    while (!window.CONFIG && attempts < maxAttempts) {
                        attempts++;
                        console.warn(`[App Delay Check] window.CONFIG not ready yet (Attempt ${attempts}). Waiting 100ms...`);
                        await this.delay(100);
                    }

                    if (!window.CONFIG) {
                        console.error(`[App Delay Check] window.CONFIG still not ready after ${maxAttempts} attempts. Aborting init for ${modulePath}.`);
                        throw new Error("無法載入必要的設定檔 (window.CONFIG)");
                    }

                    await pageModule.init(); 
                // ******** 新增判斷 ********
                // ******** 修改：使用 requestAnimationFrame ********
                if (pageId === 'room-availability' && pageModule.initializeDatePickers) {
                    console.log("[App.js] Requesting animation frame to call initializeDatePickers for room-availability...");
                    // 使用 requestAnimationFrame 確保 DOM 更新後再執行
                    requestAnimationFrame(() => {
                        // 可以再包一層以增加可靠性，等待下一幀繪製
                        requestAnimationFrame(() => {
                            console.log("[App.js] Inside requestAnimationFrame, calling initializeDatePickers...");
                            try {
                                pageModule.initializeDatePickers();
                            } catch (pickerError) {
                                console.error("[App.js] Error calling initializeDatePickers:", pickerError);
                                ui.toast.error(`初始化日期選擇器失敗: ${pickerError.message}`);
                            }
                        });
                    });
                }
                // ******** 修改結束 ********
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