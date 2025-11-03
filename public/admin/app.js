// public/admin/app.js (Fallback with Delay Check & Admin Page Enablement)

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

    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    },

// public/admin/app.js

async handleRouteChange() {
    console.log(`[App.js HandleRouteChange] Hash changed to: ${window.location.hash}`);
    
    // ========== ▼▼▼ 【關鍵修正 1】▼▼▼ ==========
    // 移除 "if (!this.isConfigReady)" 檢查
    // 強制*永遠*等待 configPromise。這很安全，因為等待一個
    // 已經解析 (resolved) 的 Promise 是立即完成的。
    console.log("[App.js HandleRouteChange] Awaiting config promise...");
    try {
        await this.configPromise; // <--- 強制等待
        console.log("[App.js HandleRouteChange] Config promise resolved.");
    } catch (error) {
        console.error("[App.js HandleRouteChange] Config promise failed:", error);
        ui.showPage('error');
        const errorPage = document.getElementById('page-error');
        if(errorPage) errorPage.innerHTML = `<p style="color:red;">系統設定檔載入失敗，無法繼續。</p>`;
        return; 
    }
    // ========== ▲▲▲ 【修正結束 1】▲▲▲ ==========


    const pageId = window.location.hash.substring(1) || 'dashboard';
    console.log(`[App.js HandleRouteChange] Determined pageId: ${pageId}`);

    // --- (檢查 adminPagesConfig 的邏輯保持不變，現在 window.CONFIG 必定存在) ---
    let adminPagesConfig = {}; 
    try {
        const activeTemplateKey = window.CONFIG?.LOGIC?.ACTIVE_INDUSTRY_TEMPLATE;
        const activeTemplate = window.CONFIG?.LOGIC?.INDUSTRY_TEMPLATE_DEFINITIONS?.[activeTemplateKey];
        
        if (activeTemplate && activeTemplate.logic && activeTemplate.logic.adminPagesEnabled) {
            adminPagesConfig = activeTemplate.logic.adminPagesEnabled;
            console.log(`[App.js] Loaded adminPagesEnabled from template '${activeTemplateKey}'`);
        } else {
            console.warn(`[App.js] Could not find adminPagesEnabled in active template '${activeTemplateKey}'. Using default (all enabled).`);
        }
        
        const navTabs = document.querySelector('.nav-tabs');
        if (navTabs) {
             navTabs.querySelectorAll('a').forEach(tabLink => {
                 const targetPage = tabLink.getAttribute('href')?.substring(1);
                 if (targetPage) {
                     if (adminPagesConfig.hasOwnProperty(targetPage) && adminPagesConfig[targetPage] === false) {
                         tabLink.style.display = 'none';
                     } else {
                         tabLink.style.display = ''; 
                     }
                 }
             });
             console.log("[App.js HandleRouteChange] Applied adminPagesEnabled config to nav tabs.");
        } else {
            console.warn("[App.js HandleRouteChange] Could not find .nav-tabs to apply enablement config.");
        }
    } catch (e) {
         console.error("[App.js HandleRouteChange] Error applying adminPagesEnabled config:", e);
    }
    // --- (檢查結束) ---


    try {
        console.log("[App.js HandleRouteChange] Attempting to hide batch toolbar...");
        hideBatchToolbar();
    } catch(e) {
        console.warn("[App.js HandleRouteChange] Error hiding batch toolbar:", e);
    }

    console.log(`[App.js HandleRouteChange] Setting active nav for: ${pageId}`);
    ui.setActiveNav(pageId);

    console.log(`[App.js HandleRouteChange] About to call ui.showPage('${pageId}')`);
    ui.showPage(pageId);
    console.log(`[App.js HandleRouteChange] ui.showPage('${pageId}') finished.`);

    const modulePath = this.router[pageId];
    console.log(`[App.js HandleRouteChange] Module path for ${pageId}: ${modulePath || 'None'}`);

    if (modulePath) {
        try {
            // --- (檢查頁面是否被禁用的邏輯保持不變) ---
            if (adminPagesConfig.hasOwnProperty(pageId) && adminPagesConfig[pageId] === false) {
                 console.warn(`[App.js HandleRouteChange] Access denied: Page '${pageId}' is disabled in template settings.`);
                 const pageElement = document.getElementById(`page-${pageId}`);
                 if(pageElement) pageElement.innerHTML = `<p style="color:orange; text-align: center;">此頁面 (${pageId}) 在目前的樣板設定中已被停用。</p>`;
                 return; 
            }
            // --- (檢查結束) ---

            console.log(`[App.js HandleRouteChange] Importing module: ${modulePath}`);
            const pageModule = await import(modulePath);
            console.log(`[App.js HandleRouteChange] Module ${modulePath} imported successfully.`);

            if (pageModule.init) {
                // ========== ▼▼▼ 【關鍵修正 2】▼▼▼ ==========
                // 移除 "if (!window.CONFIG)" 檢查，因為
                // 函式開頭的 await this.configPromise 已保證 window.CONFIG 存在。
                // ========== ▲▲▲ 【修正結束 2】▲▲▲ ==========

                console.log(`[App.js HandleRouteChange] Calling init() for ${modulePath}`);
                await pageModule.init();
                console.log(`[App.js HandleRouteChange] init() for ${modulePath} finished.`);

                // (room-availability 的 RAF 邏輯保持不變)
                if (pageId === 'room-availability' && pageModule.initializeDatePickers) {
                    console.log(`[App.js HandleRouteChange] Page is room-availability, scheduling initializeDatePickers via RAF...`);
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
        console.log("[App Init] Starting initialization...");
        ui.initSharedEventListeners();

        // ========== ▼▼▼ 【關鍵修正 3】▼▼▼ ==========
        this.configPromise = (async () => {
            console.log("[App Init] Starting config fetch...");
            try {
                window.CONFIG = await api.getAppConfig();
                // (驗證 config 結構的邏輯保持不變)
                if (!window.CONFIG || typeof window.CONFIG !== 'object' ||
                    !window.CONFIG.LOGIC || typeof window.CONFIG.LOGIC !== 'object' ||
                    !window.CONFIG.LOGIC.ACTIVE_INDUSTRY_TEMPLATE ||
                    !window.CONFIG.LOGIC.INDUSTRY_TEMPLATE_DEFINITIONS || typeof window.CONFIG.LOGIC.INDUSTRY_TEMPLATE_DEFINITIONS !== 'object') {
                    console.error("[App Init] Invalid config structure received:", window.CONFIG);
                    throw new Error('獲取到的設定檔格式不正確或缺少必要內容。');
                }
                console.log("[App Init] Config fetched and seems valid:", window.CONFIG);
                // this.isConfigReady = true; // <--- 【修正】移除此行
            } catch (error) {
                console.error("[App Init] Config fetch failed:", error);
                // this.isConfigReady = false; // <--- 【修正】移除此行
                const loadingView = document.getElementById('loading-view');
G                if (loadingView) loadingView.innerHTML = `<p style="color:red;">讀取核心設定失敗: ${error.message}</p>`;
                throw error; // 
            }
        })();
        // ========== ▲▲▲ 【修正結束 3】▲▲▲ ==========

        window.addEventListener('hashchange', () => this.handleRouteChange());

        // (navTabsElement 監聽器保持不變)
        const navTabsElement = document.querySelector('.nav-tabs');
        if (navTabsElement) {
            navTabsElement.addEventListener('click', (event) => {
                if (event.target.tagName === 'A') {
                    event.preventDefault();
                    const newHash = event.target.getAttribute('href');
                    if (window.location.hash !== newHash) {
                        window.location.hash = newHash; // This will trigger the 'hashchange' listener
                    }
                }
            });
        } else {
            console.error("[App Init] '.nav-tabs' element not found. Navigation might not work.");
        }


        // (Initial route handling 保持不變)
        console.log("[App Init] Triggering initial handleRouteChange...");
        try {
             await this.handleRouteChange();
             console.log("[App Init] Initial route handled.");
        } catch (initialRouteError) {
             console.error("[App Init] Error during initial route handling:", initialRouteError);
        }
        console.log("[App Init] Initialization finished.");
    }
};

// (DOMContentLoaded 監聽器保持不變)
document.addEventListener('DOMContentLoaded', () => {
     console.log('[DOMContentLoaded] Skipping frontend cookie check. Initializing App...');
     App.init(); 
});