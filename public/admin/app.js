// public/admin/app.js

import { api } from './api.js';
import { ui } from './ui.js';
import { hideBatchToolbar } from './modules/productManagement.js';

const App = {
    // 路由表 (保持不變)
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

    // ========== ▼▼▼ 新增：用來追蹤設定檔是否已載入的 Promise ▼▼▼ ==========
    configPromise: null,
    // ========== ▲▲▲ 新增 ▲▲▲ ==========


    // 處理路由變更的核心函式 (修改後)
async handleRouteChange() {
        let configData; // 用來儲存載入的設定
        try {
            await this.configPromise;
            // ========== ▼▼▼ 修改點：直接獲取設定 ▼▼▼ ==========
            configData = window.CONFIG; // 假設此時 window.CONFIG 已就緒
            if (!configData || !configData.LOGIC) { // 再次檢查
                throw new Error("Config data is invalid after await.");
            }
            console.log("[App DEBUG] Config loaded, proceeding with route change.");
            // ========== ▲▲▲ 修改點 ▲▲▲ ==========
        } catch (error) {
            console.error("[App DEBUG] Failed to wait for/validate config in handleRouteChange:", error);
            ui.showPage('error');
            const errorPage = document.getElementById('page-error'); // 假設有 error page
            if(errorPage) errorPage.innerHTML = `<p style="color:red;">系統設定檔載入失敗，無法繼續。</p>`;
            return;
        }

        const pageId = window.location.hash.substring(1) || 'dashboard';
        hideBatchToolbar();
        ui.setActiveNav(pageId);
        ui.showPage(pageId);

        const modulePath = this.router[pageId];
        if (modulePath) {
            try {
                const pageModule = await import(modulePath);
                if (pageModule.init) {
                    console.log(`[App DEBUG] About to call init for module: ${modulePath}`);
                    // ========== ▼▼▼ 修改點：傳遞參數給 init ▼▼▼ ==========
                    // 傳遞整個 config 或只傳遞需要的 active template key/definitions
                    const activeTemplateKey = configData.LOGIC.ACTIVE_INDUSTRY_TEMPLATE;
                    const definitions = configData.LOGIC.INDUSTRY_TEMPLATE_DEFINITIONS;
                    console.log(`[App DEBUG] Passing activeKey='${activeTemplateKey}' and definitions to module init.`);
                    await pageModule.init(activeTemplateKey, definitions);
                    // ========== ▲▲▲ 修改點 ▲▲▲ ==========
                }
            } catch (error) {
                console.error(`載入或初始化模組 ${modulePath} 失敗:`, error);
                const pageElement = document.getElementById(`page-${pageId}`);
                if (pageElement) {
                     pageElement.innerHTML = `<p style="color:red;">載入頁面功能時發生錯誤。</p>`;
                }
            }
        }
    },

    // init 函式 (保持上次的 configPromise 結構)
    async init() {
        this.configPromise = (async () => {
            try {
                console.log("[App DEBUG] Starting to fetch app config...");
                window.CONFIG = await api.getAppConfig();
                if (!window.CONFIG || !window.CONFIG.LOGIC || !window.CONFIG.LOGIC.ACTIVE_INDUSTRY_TEMPLATE || !window.CONFIG.LOGIC.INDUSTRY_TEMPLATE_DEFINITIONS) { // 更嚴格的檢查
                    throw new Error('獲取到的設定檔格式不正確、為空或缺少必要欄位 (LOGIC...)。');
                }
                console.log('[App DEBUG] App config loaded successfully:', window.CONFIG);
            } catch (error) {
                console.error("[App DEBUG] 初始化載入設定檔失敗:", error);
                throw error;
            }
        })();

        ui.initSharedEventListeners();
        window.addEventListener('hashchange', () => this.handleRouteChange());
        document.querySelector('.nav-tabs').addEventListener('click', (event) => { /* ... */ });

        try {
             await this.handleRouteChange(); // 初始路由處理現在也會等待 configPromise
        } catch (initError) {
             console.error("[App DEBUG] Initial route handling failed:", initError);
             // 可以在這裡顯示一個全局錯誤訊息
        }
    }
};

document.addEventListener('DOMContentLoaded', () => App.init());