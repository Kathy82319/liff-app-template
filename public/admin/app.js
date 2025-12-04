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
        
        // --- 【核心修正】讀取 Sidebar 顯示設定與 Terms ---
        let visibleModules = {};
        let terms = {};
        
        try {
            const activeTemplateKey = window.CONFIG?.LOGIC?.ACTIVE_INDUSTRY_TEMPLATE;
            const activeTemplate = window.CONFIG?.LOGIC?.INDUSTRY_TEMPLATE_DEFINITIONS?.[activeTemplateKey];
            
            if (activeTemplate) {
                visibleModules = activeTemplate.admin_config?.visible_modules || {};
                terms = activeTemplate.terms || {};
            }

            const navTabs = document.querySelector('.nav-tabs');
            if (navTabs) {
                 navTabs.querySelectorAll('a').forEach(tabLink => {
                     const href = tabLink.getAttribute('href')?.substring(1);
                     
                     // 1. 控制顯示/隱藏
                     // 對照表：href -> visible_modules key
                     const moduleMap = {
                         'dashboard': 'dashboard',
                         'users': 'users',
                         'inventory': 'products',      // 注意 key 對應
                         'room-availability': 'room_control', // 注意 key 對應
                         'bookings': 'bookings',
                         'news': 'news',
                         'store-info': 'store_info',
                         'reports': 'finance',         // 注意 key 對應
                         'vouchers': 'coupons',        // 注意 key 對應
                         'rally': 'coupons',           // 集點通常歸類在行銷/coupons
                         'points': 'coupons',          // 點數通常歸類在行銷/coupons
                         'drafts': 'news',             // 草稿歸類在消息
                         'settings': 'always_show'     // 設定頁永遠顯示
                     };
                     
                     const configKey = moduleMap[href];
                     if (configKey && configKey !== 'always_show') {
                         // 如果設定為 false，則隱藏
                         if (visibleModules[configKey] === false) {
                             tabLink.style.display = 'none';
                         } else {
                             tabLink.style.display = ''; 
                         }
                     }

                     // 2. 動態更新 Tab 名稱 (Terms)
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