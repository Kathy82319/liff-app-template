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
    isConfigReady: false,

    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    },

async handleRouteChange() {
    console.log(`[App.js HandleRouteChange] Hash changed to: ${window.location.hash}`); // 記錄觸發
    if (!this.isConfigReady) {
        console.log("[App.js HandleRouteChange] Config not ready, awaiting promise...");
        try {
            await this.configPromise;
            // Config promise resolved successfully here
            this.isConfigReady = true; // Mark config as ready
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

    // --- ****** 新增：控制導覽列顯示 ****** ---
    try {
        // Ensure window.CONFIG and nested properties exist before accessing
        const adminPagesConfig = window.CONFIG?.LOGIC?.adminPagesEnabled || {};
        const navTabs = document.querySelector('.nav-tabs');
        if (navTabs) {
             navTabs.querySelectorAll('a').forEach(tabLink => {
                 const targetPage = tabLink.getAttribute('href')?.substring(1);
                 if (targetPage) {
                     // If the config has this page key and it's explicitly false, hide it
                     if (adminPagesConfig.hasOwnProperty(targetPage) && adminPagesConfig[targetPage] === false) {
                         tabLink.style.display = 'none';
                     } else {
                         tabLink.style.display = ''; // Otherwise, show it (default or true)
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
    // --- ****** 新增結束 ****** ---


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
            // --- ****** 新增：檢查頁面是否被禁用 ****** ---
            // Ensure window.CONFIG and nested properties exist
            const adminPagesConfig = window.CONFIG?.LOGIC?.adminPagesEnabled || {};
            // Check if the pageId exists as a key and its value is explicitly false
            if (adminPagesConfig.hasOwnProperty(pageId) && adminPagesConfig[pageId] === false) {
                 console.warn(`[App.js HandleRouteChange] Access denied: Page '${pageId}' is disabled in template settings.`);
                 // Display an error message or redirect
                 const pageElement = document.getElementById(`page-${pageId}`);
                 if(pageElement) pageElement.innerHTML = `<p style="color:orange; text-align: center;">此頁面 (${pageId}) 在目前的樣板設定中已被停用。</p>`;
                 // Optionally redirect: window.location.hash = '#dashboard';
                 return; // Prevent module loading
            }
            // --- ****** 新增結束 ****** ---


            console.log(`[App.js HandleRouteChange] Importing module: ${modulePath}`);
            const pageModule = await import(modulePath);
            console.log(`[App.js HandleRouteChange] Module ${modulePath} imported successfully.`);

            if (pageModule.init) {
                if (!window.CONFIG) {
                     console.error(`[App.js HandleRouteChange] CRITICAL: window.CONFIG is missing AFTER await! Aborting init for ${modulePath}.`);
                     throw new Error("無法載入必要的設定檔 (window.CONFIG)");
                }

                console.log(`[App.js HandleRouteChange] Calling init() for ${modulePath}`);
                await pageModule.init();
                console.log(`[App.js HandleRouteChange] init() for ${modulePath} finished.`);

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

        this.configPromise = (async () => {
            console.log("[App Init] Starting config fetch...");
            try {
                window.CONFIG = await api.getAppConfig();
                // Add more robust checks for the structure of CONFIG
                if (!window.CONFIG || typeof window.CONFIG !== 'object' ||
                    !window.CONFIG.LOGIC || typeof window.CONFIG.LOGIC !== 'object' ||
                    !window.CONFIG.LOGIC.ACTIVE_INDUSTRY_TEMPLATE ||
                    !window.CONFIG.LOGIC.INDUSTRY_TEMPLATE_DEFINITIONS || typeof window.CONFIG.LOGIC.INDUSTRY_TEMPLATE_DEFINITIONS !== 'object') {
                    console.error("[App Init] Invalid config structure received:", window.CONFIG);
                    throw new Error('獲取到的設定檔格式不正確或缺少必要內容。');
                }
                console.log("[App Init] Config fetched and seems valid:", window.CONFIG); // Log the fetched config
                this.isConfigReady = true; // Mark as ready only after validation
            } catch (error) {
                console.error("[App Init] Config fetch failed:", error);
                this.isConfigReady = false; // Ensure it's marked as not ready on error
                // Display error immediately if possible
                const loadingView = document.getElementById('loading-view'); // Assuming this exists
                if (loadingView) loadingView.innerHTML = `<p style="color:red;">讀取核心設定失敗: ${error.message}</p>`;
                throw error; // Re-throw to prevent further execution relying on config
            }
        })();

        window.addEventListener('hashchange', () => this.handleRouteChange());

        // Ensure nav-tabs exists before adding listener
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


        // Initial route handling
        console.log("[App Init] Triggering initial handleRouteChange...");
        // Use try-catch here as well, as initial handleRouteChange depends on configPromise
        try {
             await this.handleRouteChange();
             console.log("[App Init] Initial route handled.");
        } catch (initialRouteError) {
             console.error("[App Init] Error during initial route handling:", initialRouteError);
             // Error display should have happened within handleRouteChange or configPromise
        }
        console.log("[App Init] Initialization finished.");
    }
};

document.addEventListener('DOMContentLoaded', () => {
     // Check for AuthToken cookie before initializing the app -- REMOVED THIS CHECK
     /* REMOVED:
     const cookies = document.cookie.split('; ').reduce((acc, current) => {
         const [name, ...value] = current.split('=');
         acc[name] = value.join('=');
         return acc;
     }, {});

     console.log('[DOMContentLoaded] Checking for AuthToken cookie...');
     // REMOVED alert('[DOMContentLoaded] Checking for AuthToken cookie:\n' + document.cookie); // Alert for debugging

     if (!cookies.AuthToken) {
         console.log('[DOMContentLoaded] AuthToken not found. Redirecting to login page.');
         // REMOVED alert('[DOMContentLoaded] AuthToken not found. Redirecting...'); // Alert for debugging
         // Redirect to login page if no token is found
         window.location.href = '/admin-login.html';
     } else {
         console.log('[DOMContentLoaded] AuthToken found. Initializing App...');
         // REMOVED alert('[DOMContentLoaded] AuthToken found. Initializing App...'); // Alert for debugging
         // Initialize the app if token exists
         App.init(); // <-- Keep this line
     }
     */

     // --- NEW CODE: Unconditionally initialize the app ---
     console.log('[DOMContentLoaded] Skipping frontend cookie check. Initializing App...');
     App.init(); // Directly initialize the app
     // The backend middleware will handle authentication when API calls are made.
     // --- END NEW CODE ---
});