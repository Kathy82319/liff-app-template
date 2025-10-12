// public/admin/app.js (v2 - 修正競爭條件)

import { api } from './api.js';
import { ui } from './ui.js';
import { hideBatchToolbar } from './modules/productManagement.js';

function hideDemoMenuItems() {
    const downloadCsvBtn = document.getElementById('download-csv-template-btn');
    const uploadCsvLabel = document.querySelector('label[for="csv-upload-input"]');
    if (downloadCsvBtn) downloadCsvBtn.style.display = 'none';
    if (uploadCsvLabel) uploadCsvLabel.style.display = 'none';

    const dangerZone = document.getElementById('dashboard-danger-zone');
    if (dangerZone) dangerZone.style.display = 'none';
    
    const demoBanner = document.createElement('div');
    demoBanner.id = 'demo-mode-banner';
    demoBanner.style.cssText = 'background-color: var(--color-warning); color: #000; text-align: center; padding: 10px; font-weight: bold;';
    demoBanner.innerHTML = '您目前正在 DEMO 體驗模式中。所有操作都只是暫存，不會影響真實資料。';
    document.getElementById('admin-panel').prepend(demoBanner);
}

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

    async handleRouteChange() {
        const pageId = window.location.hash.substring(1) || 'dashboard';
        hideBatchToolbar();
        ui.setActiveNav(pageId);
        ui.showPage(pageId);
        const modulePath = this.router[pageId];
        if (modulePath) {
            try {
                const pageModule = await import(modulePath);
                if (pageModule.init) {
                    await pageModule.init(); // 確保模組初始化完成
                }
            } catch (error) {
                console.error(`載入模組 ${modulePath} 失敗:`, error);
                const pageElement = document.getElementById(`page-${pageId}`);
                if (pageElement) {
                    pageElement.innerHTML = `<p style="color:red;">載入頁面功能時發生錯誤。</p>`;
                }
            }
        }
    },



    async init() {
        const isDemoMode = new URLSearchParams(window.location.search).get('demo') === 'true';
        if (isDemoMode) {
            console.log("偵測到 DEMO 模式，正在載入模擬 API...");
            const mockScript = document.createElement('script');
            mockScript.type = 'module';
            mockScript.src = './api-mock.js';
            document.head.appendChild(mockScript);
            
            // 等待 DOMContentLoaded 後再隱藏元素，確保元素已存在
            document.addEventListener('DOMContentLoaded', hideDemoMenuItems);
            
            await new Promise(resolve => setTimeout(resolve, 100)); 
            console.log("模擬 API 已載入。");
        }
        
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
            // ▼▼▼ 【核心修正】將路由相關的程式碼移到這裡 ▼▼▼
            // 確保必須在 CONFIG 載入成功後，才開始處理頁面渲染和路由
            
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

            // 第一次載入時，手動觸發一次路由處理
            this.handleRouteChange();
            // ▲▲▲ 【修正結束】 ▲▲▲

        } catch (error) {
            console.error("初始化失敗:", error);
            document.body.innerHTML = `<div style="text-align: center; padding: 50px; color: #dc3545;"><h2>系統啟動失敗</h2><p>${error.message}</p><p>請確認後台 API (get-app-config) 是否運作正常。</p></div>`;
            // 發生嚴重錯誤時，不再繼續執行後續程式碼
            return; 
        }
    }
};

// 【小幅修正】確保 App.init() 在 DOMContentLoaded 事件後才執行
document.addEventListener('DOMContentLoaded', () => App.init());