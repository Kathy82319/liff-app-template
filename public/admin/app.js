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
        // ========== ▼▼▼ 新增：等待設定檔載入完成 ▼▼▼ ==========
        try {
            // 確保 configPromise 已經被初始化並完成
            await this.configPromise;
            console.log("[App DEBUG] Config loaded, proceeding with route change.");
        } catch (error) {
            console.error("[App DEBUG] Failed to wait for config in handleRouteChange:", error);
            // 如果設定檔載入失敗，可能需要顯示錯誤頁面或停止
            ui.showPage('error'); // 假設有一個錯誤頁面
            document.getElementById('page-error').innerHTML = `<p style="color:red;">系統設定檔載入失敗，無法繼續。</p>`;
            return;
        }
        // ========== ▲▲▲ 新增 ▲▲▲ ==========


        // 從 URL hash 獲取當前頁面 ID，預設為 'dashboard'
        const pageId = window.location.hash.substring(1) || 'dashboard';

        hideBatchToolbar();//隱藏產品頁的工具列

        ui.setActiveNav(pageId);
        ui.showPage(pageId);

        const modulePath = this.router[pageId];
        if (modulePath) {
            try {
                // 動態載入對應的模組
                const pageModule = await import(modulePath);
                // 執行模組的初始化函式
                if (pageModule.init) {
                    // 現在可以安全地呼叫 init，因為 config 已經載入
                    await pageModule.init(); // 如果模組 init 是 async，加上 await
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

    // 應用程式初始化函式 (修改後)
    async init() {
        // ========== ▼▼▼ 修改：將設定檔載入包裝成 Promise ▼▼▼ ==========
        this.configPromise = (async () => {
            try {
                console.log("[App DEBUG] Starting to fetch app config...");
                // 使用 api.js 中的 getAppConfig
                window.CONFIG = await api.getAppConfig();
                if (!window.CONFIG || !window.CONFIG.LOGIC) { // 增加檢查
                    throw new Error('獲取到的設定檔格式不正確或為空。');
                }
                console.log('[App DEBUG] App config loaded successfully:', window.CONFIG);
            } catch (error) {
                console.error("[App DEBUG] 初始化載入設定檔失敗:", error);
                // 將錯誤重新拋出，讓 handleRouteChange 可以捕獲到
                throw error;
            }
        })();
        // ========== ▲▲▲ 修改 ▲▲▲ ==========


        /* 這是登入守門員，目前還在建置階段，先關起來
        try {
            await api.checkAuthStatus(); // 假設 api.js 有這個函式
        } catch (error) {
            console.error('未授權，正在重導向到登入頁面...');
            window.location.href = '/admin-login.html';
            return; // 中斷後續所有程式碼的執行
        }
        */
        ui.initSharedEventListeners();// 啟動全域 UI 事件監聽 (如 Modal 關閉)

        // 監聽 URL hash 的變化 (使用者點擊導覽列)
        window.addEventListener('hashchange', () => this.handleRouteChange());

        // 處理手動修改 nav-tabs 連結的行為 (保持不變)
        document.querySelector('.nav-tabs').addEventListener('click', (event) => {
            if (event.target.tagName === 'A') {
                event.preventDefault();
                const newHash = event.target.getAttribute('href');
                if (window.location.hash !== newHash) {
                    window.location.hash = newHash;
                }
            }
        });

        // 第一次載入時，手動觸發一次路由處理
        // 注意：這裡的 handleRouteChange 會等待上面的 configPromise 完成
        await this.handleRouteChange();
    }
};

document.addEventListener('DOMContentLoaded', () => App.init());