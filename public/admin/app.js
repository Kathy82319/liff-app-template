// public/admin/app.js
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
        'news': './modules/newsManagement.js',
        'drafts': './modules/draftsManagement.js',
        'store-info': './modules/storeInfo.js',
        'points': './modules/pointsCenter.js',
        'settings': './modules/systemSettings.js',
        'vouchers': './modules/voucherManagement.js',
        'reports': './modules/financialReports.js',
        'rally': './modules/rallyManagement.js',
    },
    configPromise: null, 

    async handleRouteChange() {
        // 等待設定載入
        try { await this.configPromise; } catch (e) { return; }

        const pageId = window.location.hash.substring(1) || 'dashboard';
        
        // --- 【核心修正】讀取分散的 JSON 設定並轉譯為 visibleModules ---
        let visibleModules = {};
        let terms = {};
        
        try {
            const activeTemplateKey = window.CONFIG?.LOGIC?.ACTIVE_INDUSTRY_TEMPLATE;
            const activeTemplate = window.CONFIG?.LOGIC?.INDUSTRY_TEMPLATE_DEFINITIONS?.[activeTemplateKey];
            
            if (activeTemplate) {
                const ac = activeTemplate.admin_config || {};
                
                // 1. 【關鍵修正】手動對應您的 JSON 結構到程式邏輯
                // 將分散在各區塊的 enabled 或 others 屬性，統一收集到 visibleModules
                visibleModules = {
                    'dashboard': ac.dashboard?.enabled,
                    'users': ac.users?.enabled,
                    'products': ac.inventory?.enabled,       // JSON 是 inventory
                    'room_control': ac.room_control?.enabled,
                    'bookings': ac.bookings?.enabled,
                    'news': ac.news?.enabled,
                    'store_info': ac.store_info?.enabled,
                    // others 區塊
                    'finance': ac.others?.reports,           // 報表對應 finance
                    'coupons': ac.others?.vouchers,          // 優惠券對應 coupons
                    'rally': ac.others?.rally,               // 集點
                    'points': ac.others?.points,             // 點數
                    'drafts': ac.others?.drafts              // 草稿
                };

                terms = activeTemplate.terms || {};
            }

            const navTabs = document.querySelector('.nav-tabs');
            if (navTabs) {
                 navTabs.querySelectorAll('a').forEach(tabLink => {
                     const href = tabLink.getAttribute('href')?.substring(1);
                     
                     // 2. 控制顯示/隱藏
                     // 對照表：href (HTML ID) -> visibleModules key (上面定義的 Key)
                     const moduleMap = {
                         'dashboard': 'dashboard',
                         'users': 'users',
                         'inventory': 'products',      
                         'room-availability': 'room_control', 
                         'bookings': 'bookings',
                         'news': 'news',
                         'store-info': 'store_info',
                         'reports': 'finance',         
                         'vouchers': 'coupons',        
                         'rally': 'rally', // 修正：讓集點獨立控制 (若您的 others 有 rally)
                         'points': 'points', // 修正：讓點數獨立控制
                         'drafts': 'drafts',             
                         'settings': 'always_show'     // 設定頁永遠顯示
                     };
                     
                     const configKey = moduleMap[href];
                     
                     // 特殊邏輯：如果是 coupons (優惠券) 被關閉，相關的 rally 和 points 也建議隱藏，
                     // 但這裡我們優先依照 visibleModules 內的具體設定。
                     
                     if (configKey && configKey !== 'always_show') {
                         // 檢查設定：只有當明確為 false 時才隱藏 (undefined 視為顯示，避免設定檔缺漏導致全白)
                         const isHidden = visibleModules[configKey] === false;
                         
                         if (isHidden) {
                             tabLink.style.display = 'none';
                         } else {
                             tabLink.style.display = ''; 
                         }
                     }

                     // 3. 動態更新 Tab 名稱 (Terms)
                     if (href === 'inventory' && terms.PRODUCT_NAME) {
                         tabLink.textContent = `${terms.PRODUCT_NAME}管理`;
                     }
                     if (href === 'bookings' && terms.BOOKING_NAME) {
                         tabLink.textContent = `${terms.BOOKING_NAME}管理`;
                     }
                 });
            }
        } catch (e) {
             console.error("[App.js] Config apply error:", e);
        }
        // --- 修正結束 ---

        try { hideBatchToolbar(); } catch(e) {}

        ui.setActiveNav(pageId);
        ui.showPage(pageId);

        const modulePath = this.router[pageId];
        if (modulePath) {
            try {
                const pageModule = await import(modulePath);
                if (pageModule.init) {
                    await pageModule.init();
                    
                    // Room Availability 特殊處理
                    if (pageId === 'room-availability' && pageModule.initializeDatePickers) {
                        requestAnimationFrame(() => {
                             requestAnimationFrame(() => {
                                try { pageModule.initializeDatePickers(); } catch (e) {}
                            });
                        });
                    }
                }
            } catch (error) {
                 console.error(`載入模組 ${modulePath} 失敗:`, error);
                 const pageElement = document.getElementById(`page-${pageId}`);
                 if (pageElement) pageElement.innerHTML = `<p style="color:red;">載入失敗: ${error.message}</p>`;
            }
        }
    },

    async init() {
        console.log("[App Init] Starting...");
        ui.initSharedEventListeners();

        try {
            const authStatus = await api.checkAuthStatus();
            if (!authStatus || !authStatus.loggedIn) {
                window.location.href = '/admin-login.html';
                return; 
            }
        } catch (authError) {
             window.location.href = '/admin-login.html';
             return; 
        }
        
        this.configPromise = (async () => {
            try {
                window.CONFIG = await api.getAppConfig(); 
                if (!window.CONFIG || !window.CONFIG.LOGIC) {
                    throw new Error('設定檔格式錯誤');
                }
            } catch (error) {
                console.error("Config fetch failed:", error);
                throw error; 
            }
        })();

        window.addEventListener('hashchange', () => this.handleRouteChange());

        const navTabsElement = document.querySelector('.nav-tabs');
        if (navTabsElement) {
            navTabsElement.addEventListener('click', (event) => {
                if (event.target.tagName === 'A') {
                    event.preventDefault();
                    const newHash = event.target.getAttribute('href');
                    if (window.location.hash !== newHash) window.location.hash = newHash; 
                }
            });
        }

        try { await this.handleRouteChange(); } catch (e) {}
    }
};

document.addEventListener('DOMContentLoaded', () => { App.init(); });