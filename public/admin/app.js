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
function hideDemoMenuItems() {
    // 隱藏產品頁的 CSV 功能按鈕
    const downloadCsvBtn = document.getElementById('download-csv-template-btn');
    const uploadCsvLabel = document.querySelector('label[for="csv-upload-input"]');
    if (downloadCsvBtn) downloadCsvBtn.style.display = 'none';
    if (uploadCsvLabel) uploadCsvLabel.style.display = 'none';

    // 隱藏儀表板的危險操作區
    const dangerZone = document.getElementById('dashboard-danger-zone');
    if (dangerZone) dangerZone.style.display = 'none';
    
    // 【新增】顯示 DEMO 模式的提示橫幅
    const demoBanner = document.createElement('div');
    demoBanner.id = 'demo-mode-banner';
    demoBanner.style.cssText = 'background-color: var(--color-warning); color: #000; text-align: center; padding: 10px; font-weight: bold;';
    demoBanner.innerHTML = '您目前正在 DEMO 體驗模式中。所有操作都只是暫存，不會影響真實資料。';
    document.getElementById('admin-panel').prepend(demoBanner);
}




    async init() {
        // ▼▼▼ 【核心修改】在這裡加入 DEMO 模式的判斷與處理 ▼▼▼
        const isDemoMode = new URLSearchParams(window.location.search).get('demo') === 'true';
        if (isDemoMode) {
            console.log("偵測到 DEMO 模式，正在載入模擬 API...");
            // 動態載入 api-mock.js
            const mockScript = document.createElement('script');
            mockScript.type = 'module';
            // 重要：請確保您的 api-mock.js 檔案確實存在於 /public/admin/ 目錄下
            mockScript.src = './api-mock.js';
            document.head.appendChild(mockScript);
            
            // 呼叫我們新增的函式來隱藏 DEMO 項目
            hideDemoMenuItems();
            
            // 給一點時間讓 mock API 生效
            await new Promise(resolve => setTimeout(resolve, 100)); 
            console.log("模擬 API 已載入。");
        }
        // ▲▲▲ 【修改結束】 ▲▲▲
        
        try {
            const response = await fetch('/api/get-app-config');
            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`獲取設定檔失敗: ${errorText}`);
            }
            window.CONFIG = await response.json();
            console.log('App config loaded:', window.CONFIG);
        } catch (error) {
            console.error("初始化失敗:", error);
            document.body.innerHTML = `<div style="text-align: center; padding: 50px; color: #dc3545;"><h2>系統啟動失敗</h2><p>${error.message}</p><p>請確認 API (/api/get-app-config) 是否運作正常。</p></div>`;
            return;
        }

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