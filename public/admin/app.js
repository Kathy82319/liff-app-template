// public/admin/app.js

import { ui } from './ui.js';

const App = {
    api: null, // API 物件將在此處動態載入
    isDemoMode: false, // 是否為 DEMO 模式

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
        const pageId = window.location.hash.substring(1) || 'dashboard';
        
        ui.setActiveNav(pageId);
        ui.showPage(pageId);

        const modulePath = this.router[pageId];
        if (modulePath) {
            try {
                // 動態載入的模組會自動使用 App.api
                const pageModule = await import(modulePath);
                if (pageModule.init) {
                    // 將 api 物件傳遞給模組
                    pageModule.init(this.api);
                }
            } catch (error) {
                console.error(`載入模組 ${modulePath} 失敗:`, error);
                document.getElementById(`page-${pageId}`).innerHTML = `<p style="color:red;">載入頁面功能時發生錯誤。</p>`;
            }
        }
    },

    // 顯示 DEMO 模式的提示橫幅
    showDemoBanner() {
        const banner = document.createElement('div');
        banner.innerHTML = `您目前正在 DEMO 體驗模式中。所有操作都只會暫存在您的瀏覽器，不會影響真實資料。 <button id="reset-demo-btn" style="margin-left: 15px; padding: 2px 8px; cursor: pointer;">重設體驗資料</button>`;
        banner.style.cssText = 'background-color: var(--color-warning); color: #000; text-align: center; padding: 10px; font-weight: bold;';
        
        const header = document.querySelector('.header');
        header.parentNode.insertBefore(banner, header.nextSibling);

        document.getElementById('reset-demo-btn').addEventListener('click', async () => {
            if (confirm('確定要重設所有體驗資料，恢復到初始範例狀態嗎？')) {
                await this.api.resetDemoData();
                alert('DEMO 資料已重設！頁面將重新整理。');
                window.location.reload();
            }
        });
    },

    // 【*** 隱藏的項目，可以一併寫在這裡 ***】
    hideDemoMenuItems() {
        // 選取 href 為 #settings 的導覽列按鈕
        const settingsTab = document.querySelector('.nav-tabs a[href="#settings"]');
        if (settingsTab) {
            settingsTab.style.display = 'none'; 
        }

    },



    // 應用程式初始化函式
    async init() {
        // 【*** 核心修正區塊 ***】
        const urlParams = new URLSearchParams(window.location.search);
        this.isDemoMode = urlParams.get('demo') === 'true';

        try {
            if (this.isDemoMode) {
                console.log("正在啟用 DEMO 模式...");
                const { api } = await import('./api-mock.js');
                this.api = api;
                this.showDemoBanner();
                this.hideDemoMenuItems(); 
            } else {
                console.log("正在啟用標準模式...");
                const { api } = await import('./api.js');
                this.api = api;
                // 在非 DEMO 模式下，才檢查登入狀態
                await this.api.checkAuthStatus();
            }
        } catch (error) {
             if (!this.isDemoMode) {
                console.error('未授權，正在重導向到登入頁面...');
                window.location.href = '/admin-login.html';
                return; // 中斷後續所有程式碼的執行
             }
        }
        
        // 將 api 物件掛載到全域，方便模組引用
        // 雖然不是最佳實踐，但為了最小化改動現有模組，暫時這樣處理
        window.api = this.api;

        ui.initSharedEventListeners();
        
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

        this.handleRouteChange();
    }
};

document.addEventListener('DOMContentLoaded', () => App.init());