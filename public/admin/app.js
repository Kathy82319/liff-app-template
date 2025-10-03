// public/admin/app.js

import { api } from './api.js';
import { ui } from './ui.js';

const App = {
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
        // 從 URL hash 獲取當前頁面 ID，預設為 'dashboard'
        const pageId = window.location.hash.substring(1) || 'dashboard';
        
        ui.setActiveNav(pageId);
        ui.showPage(pageId);

        const modulePath = this.router[pageId];
        if (modulePath) {
            try {
                // 動態載入對應的模組
                const pageModule = await import(modulePath);
                // 執行模組的初始化函式
                if (pageModule.init) {
                    pageModule.init();
                }
            } catch (error) {
                console.error(`載入模組 ${modulePath} 失敗:`, error);
                document.getElementById(`page-${pageId}`).innerHTML = `<p style="color:red;">載入頁面功能時發生錯誤。</p>`;
            }
        }
    },

    // 應用程式初始化函式
    async init() {
        // **【資安重點】**
        // 在執行任何操作之前，先檢查管理員登入狀態。
        // 這是前端安全的第一道防線。
        
        /* 這是登入守門員，目前還在建置階段，先關起來
        try {
            await api.checkAuthStatus(); // 假設 api.js 有這個函式
        } catch (error) {
            console.error('未授權，正在重導向到登入頁面...');
            window.location.href = '/admin-login.html';
            return; // 中斷後續所有程式碼的執行
        }
        */
        // 監聽 URL hash 的變化 (使用者點擊導覽列)
        window.addEventListener('hashchange', () => this.handleRouteChange());
        
        // 處理手動修改 nav-tabs 連結的行為
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
    }
};

// 當 DOM 載入完成後，啟動應用程式
document.addEventListener('DOMContentLoaded', () => App.init());