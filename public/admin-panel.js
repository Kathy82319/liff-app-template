// public/admin/api.js (最終完整版)

async function request(url, options = {}) {
    try {
        const response = await fetch(url, options);
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({ error: `HTTP 錯誤，狀態碼: ${response.status}` }));
            throw new Error(errorData.error || '未知的 API 錯誤');
        }
        if (response.status === 204) return { success: true };
        return await response.json();
    } catch (error) {
        console.error(`API 請求失敗: ${url}`, error);
        throw error;
    }
}

export const api = {
    checkAuthStatus: () => request('/api/admin/auth/status'),
    getDashboardStats: () => request('/api/admin/dashboard-stats'),
    
    getUsers: () => request('/api/get-users'),
    updateUserDetails: (data) => request('/api/update-user-details', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) }),
    getUserDetails: (userId) => request(`/api/admin/user-details?userId=${userId}`),
    searchUsers: (query) => request(`/api/admin/user-search?q=${encodeURIComponent(query)}`),

    getProducts: () => request('/api/get-products'),
    updateProductOrder: (orderedproductIds) => request('/api/admin/update-product-order', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ orderedproductIds }) }),
    toggleProductVisibility: (productId, isVisible) => request('/api/admin/toggle-product-visibility', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ productId, isVisible }) }),
    updateProductDetails: (data) => request('/api/admin/update-product-details', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) }),
    batchUpdateProducts: (productIds, isVisible) => request('/api/admin/batch-update-products', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ productIds, isVisible }) }),
    createProduct: (data) => request('/api/admin/create-product', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) }),
    deleteProducts: (productIds) => request('/api/admin/delete-products', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ productIds }) }),
    // 【新增】CSV 匯入 API
    bulkCreateProducts: (data) => request('/api/admin/bulk-create-products', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) }),


    getBookings: (status = 'all_upcoming') => request(`/api/get-bookings?status=${status}`),
    updateBookingStatus: (bookingId, status) => request('/api/update-booking-status', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ bookingId, status }) }),
    getBookingSettings: () => request('/api/admin/booking-settings'),
    saveBookingSettings: (body) => request('/api/admin/booking-settings', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }),
    createBooking: (data) => request('/api/admin/create-booking', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) }),

    getExpHistory: () => request('/api/admin/exp-history-list'),
    addPoints: (data) => request('/api/add-points', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) }),

    getAllNews: () => request('/api/admin/get-all-news'),
    createNews: (data) => request('/api/admin/create-news', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) }),
    updateNews: (data) => request('/api/admin/update-news', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) }),
    deleteNews: (id) => request('/api/admin/delete-news', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }) }),

    getMessageDrafts: () => request('/api/admin/message-drafts'),
    createMessageDraft: (data) => request('/api/admin/message-drafts', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) }),
    updateMessageDraft: (data) => request('/api/admin/message-drafts', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) }),
    deleteMessageDraft: (draft_id) => request('/api/admin/message-drafts', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ draft_id }) }),
    sendMessage: (userId, message) => request('/api/send-message', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ userId, message }) }),

    getStoreInfo: () => request('/api/get-store-info'),
    updateStoreInfo: (data) => request('/api/admin/update-store-info', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) }),

    getSettings: () => request('/api/admin/get-settings'),
    updateSettings: (settings) => request('/api/admin/update-settings', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(settings) }),
    
    resetDemoData: () => request('/api/admin/reset-demo-data', { method: 'POST' }),

    syncD1ToSheet: () => request('/api/sync-d1-to-sheet', { method: 'POST' }),
    syncProductsFromSheet: () => request('/api/get-products', { method: 'POST' })
};


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
       
        ui.initSharedEventListeners();// 啟動全域 UI 事件監聽 (如 Modal 關閉)
        
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

// public/admin/ui.js

// 存放所有與 UI 操作相關的函式
export const ui = {
    /**
     * 顯示指定的頁面，並隱藏其他頁面
     * @param {string} pageId - 頁面 ID (例如 'dashboard', 'users')
     */
    showPage(pageId) {
        document.querySelectorAll('.page').forEach(page => {
            page.classList.toggle('active', page.id === `page-${pageId}`);
        });
    },

    /**
     * 設定導覽列的啟用狀態
     * @param {string} pageId - 頁面 ID
     */
    setActiveNav(pageId) {
        document.querySelectorAll('.nav-tabs a').forEach(link => {
            const linkTarget = link.getAttribute('href').substring(1);
            link.classList.toggle('active', linkTarget === pageId);
        });
    },

    // --- 【** 以下為本次新增功能 **】 ---

    /**
     * 顯示指定的 Modal 彈窗
     * @param {string} modalId - Modal 的 ID (例如 '#edit-user-modal')
     */
    showModal(modalId) {
        const modal = document.querySelector(modalId);
        if (modal) {
            modal.style.display = 'flex';
        }
    },

    /**
     * 隱藏指定的 Modal 彈窗
     * @param {string} modalId - Modal 的 ID
     */
    hideModal(modalId) {
        const modal = document.querySelector(modalId);
        if (modal) {
            modal.style.display = 'none';
        }
    },

    /**
     * 初始化全域共享的事件監聽器 (例如：所有 Modal 的關閉按鈕)
     */
    initSharedEventListeners() {
        // 監聽所有 class 為 .modal-close 或 .btn-cancel 的點擊事件
        document.addEventListener('click', (e) => {
            if (e.target.matches('.modal-close') || e.target.matches('.btn-cancel')) {
                // 找到被點擊按鈕所在的最近的一個 Modal
                const modal = e.target.closest('.modal-overlay');
                if (modal) {
                    modal.style.display = 'none';
                }
            }
        });
    }
};
