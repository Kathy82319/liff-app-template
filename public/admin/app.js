// public/admin/app.js (v5 - 最終修正版)

import { api } from './api.js';
import { ui } from './ui.js';
import { hideBatchToolbar } from './modules/productManagement.js';

function hideDemoMenuItems() {
    const downloadCsvBtn = document.getElementById('download-csv-template-btn');
    const uploadCsvLabel = document.querySelector('label[for="csv-upload-input"]');
    if (downloadCsvBtn) downloadCsvBtn.style.display = 'none';
    if (uploadCsvLabel) uploadCsvLabel.style.display = 'none';

    // 修改儀表板的危險操作區，使其在 DEMO 模式下功能明確
    const dangerZone = document.getElementById('dashboard-danger-zone');
    if (dangerZone) {
        dangerZone.querySelector('h4').textContent = 'DEMO 資料管理';
        dangerZone.querySelector('p').innerHTML = '此按鈕將會清除您在 DEMO 模式中新增/修改的所有資料，並恢復為初始範例。<br>此操作只會影響您自己的瀏覽器。';
        dangerZone.style.display = 'block'; // 確保區塊可見
    }
    
    // 加上 DEMO 提示橫幅
    const demoBanner = document.createElement('div');
    demoBanner.id = 'demo-mode-banner';
    demoBanner.style.cssText = 'background-color: var(--color-warning); color: #000; text-align: center; padding: 10px; font-weight: bold;';
    demoBanner.innerHTML = '您目前正在 DEMO 體驗模式中。所有操作都只是暫存，不會影響真實資料。';
    document.getElementById('admin-panel').prepend(demoBanner);
}

const App = {
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
                    await pageModule.init();
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

        // 【核心修正】將 DEMO 相關操作放在 try...catch 之外的最前面
        // 確保不論後續 API 是否成功，DEMO 模式都能被正確初始化
        if (isDemoMode) {
            console.log("偵測到 DEMO 模式，正在載入模擬 API...");
            const mockScript = document.createElement('script');
            mockScript.type = 'module';
            mockScript.src = './api-mock.js'; 
            document.head.appendChild(mockScript);
            
            // 直接呼叫，因為 App.init() 本身已在 DOMContentLoaded 中
            hideDemoMenuItems(); 
            
            // 給予 mock script 一個極短的載入時間
            await new Promise(resolve => setTimeout(resolve, 50)); 
            console.log("模擬 API 已載入。");
        }
        
        try {
            const response = await fetch('/api/get-app-config');
            if (!response.ok) {
                const errorData = await response.json().catch(() => ({ error: '無法解析錯誤訊息' }));
                throw new Error(`獲取設定檔失敗: ${errorData.error}`);
            }
            window.CONFIG = await response.json();
            
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

        } catch (error) {
            console.error("初始化失敗:", error);
            document.body.innerHTML = `<div style="text-align: center; padding: 50px; color: #dc3545;"><h2>系統啟動失敗</h2><p>${error.message}</p><p>請確認後台 API 是否運作正常，或檢查 DEMO 用的假資料是否完整。</p></div>`;
            return; 
        }
    }
};

document.addEventListener('DOMContentLoaded', () => App.init());