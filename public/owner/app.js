// public/owner/app.js
import { api } from './api.js';
import { state, setState } from './state.js';
import { ui } from './ui.js';
import * as UI from './ui.js'; // 引入所有 UI 函式供全域使用

// 防抖動工具函式
function debounce(func, delay) {
    let timer;
    return function(...args) {
        const context = this;
        clearTimeout(timer);
        timer = setTimeout(() => func.apply(context, args), delay);
    };
}

// --- 核心邏輯 ---

async function main() {
    const loadingView = document.getElementById('loading-view');
    const unauthorizedView = document.getElementById('unauthorized-view');
    const mainView = document.getElementById('main-view');

    try {
        // 1. 優先載入設定檔以取得 LIFF ID
        const configResponse = await api.fetchData('/api/get-app-config', { skipGlobalError: true });
        if (configResponse && configResponse.ENV && configResponse.ENV.OWNER_LIFF_ID) {
            setState('myLiffId', configResponse.ENV.OWNER_LIFF_ID);
            window.CONFIG = configResponse; // 存入全域供其他模組讀取
        } else {
            throw new Error("系統未設定 OWNER_LIFF_ID (環境變數)");
        }

        // 2. 初始化 LIFF
        await liff.init({ liffId: state.myLiffId });
        
        if (!liff.isLoggedIn()) {
            liff.login({ redirectUri: window.location.href });
            return;
        }
        
        const profile = await liff.getProfile();
        setState('userId', profile.userId);

        // 3. 平行執行驗證與資料載入
        const [verifyResult, productsResponse] = await Promise.all([
            api.fetchData('/api/admin/verify-liff-user', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userId: state.userId })
            }),
            api.fetchData('/api/get-products', { skipGlobalError: true })
        ]);
        
        setState('allProducts', productsResponse || []);
        console.log(`[Main] 載入了 ${state.allProducts.length} 個產品項目。`);

        // 4. 權限判斷
        if (verifyResult.success && verifyResult.isAdmin) {
            setState('currentTemplate', verifyResult.activeTemplate);
            
            mainView.style.display = 'block';
            initializeAppUI(state.currentTemplate);
            
            // 初始化全域事件監聽
            setupEventListeners();
            
            // 初始化完成，預設進入第一個 Tab
            switchTab('activity');
        } else {
            // 失敗：顯示權限不足
            unauthorizedView.style.display = 'block';
        }

    } catch (error) {
         console.error("[Main] Initialization failed:", error);
         unauthorizedView.innerHTML = `
            <h2 style="color: var(--color-danger);">系統啟動失敗</h2>
            <p>無法連接伺服器或發生錯誤。</p>
            <p style="font-size: 0.8em; color: #666;">${error.message}</p>
            <button onclick="window.location.reload()" style="padding: 10px 20px; margin-top: 10px;">重新整理</button>
         `;
         unauthorizedView.style.display = 'block';
    } finally {
         loadingView.style.display = 'none';
    }
}

// 初始化介面顯示 (根據樣板隱藏/顯示 Tab)
function initializeAppUI(template) {
    const templateDefinition = window.CONFIG?.LOGIC?.INDUSTRY_TEMPLATE_DEFINITIONS[template];
    const features = templateDefinition?.features || {};
    
    const bookingTabButton = document.querySelector('[data-tab="booking"]');
    const roomControlTabButton = document.querySelector('[data-tab="room-control"]');
    const redeemTabButton = document.querySelector('[data-tab="redeem"]');
    const customerTabButton = document.querySelector('[data-tab="customer"]');
    const ecommerceManageBtns = document.querySelector('.ecommerce-manage-buttons');

    // 1. 預約管理 Tab
    if (template === 'ecommerce_template') {
        if (bookingTabButton) bookingTabButton.style.display = 'none';
        if (roomControlTabButton) roomControlTabButton.style.display = 'none';
        if (ecommerceManageBtns) ecommerceManageBtns.style.display = 'flex';
    } else {
        if (bookingTabButton) bookingTabButton.style.display = '';
        if (ecommerceManageBtns) ecommerceManageBtns.style.display = 'none';
        
        // 民宿控房 Tab
        if (template === 'guesthouse_template' && features.OWNER_LIFF_ENABLE_ROOM_CONTROL !== false) {
            if (roomControlTabButton) roomControlTabButton.style.display = ''; 
        } else {
            if (roomControlTabButton) roomControlTabButton.style.display = 'none'; 
        }
    }

    // 2. 核銷/點數 Tab
    if (redeemTabButton) {
        redeemTabButton.style.display = (features.OWNER_LIFF_ENABLE_REDEEM !== false) ? '' : 'none';
    }

    // 3. 顧客查詢 Tab
    if (customerTabButton) {
        customerTabButton.style.display = '';
    }
    
    // 4. 初始化全域共用的功能 (如原因輸入框，將由 operation 模組處理)
    // 這裡先保留 hook
}

// 全域事件監聽 (Tab 切換、Modal 關閉、快速按鈕)
function setupEventListeners() {
    // 處理瀏覽器上一頁 (關閉 Modal)
    window.addEventListener('popstate', UI.handlePopState);
    
    // Tab Bar 點擊
    document.getElementById('owner-tab-bar').addEventListener('click', (e) => {
        const button = e.target.closest('.tab-button');
        if (button && button.dataset.tab) { switchTab(button.dataset.tab); }
    });

    // 綁定所有 Modal 的關閉按鈕
    document.querySelectorAll('.modal-close').forEach(btn => {
        btn.addEventListener('click', () => UI.updateHistoryState('close', 'close'));
    });

    // 快速操作按鈕 (+)
    const quickBtn = document.getElementById('quick-action-btn');
    if (quickBtn) {
        quickBtn.addEventListener('click', async () => {
            // 動態載入快速預約模組
            const module = await import('./modules/quickBooking.js');
            module.openQuickBookingModal();
        });
    }
    
    // 綁定「開啟完整後台」按鈕
    document.getElementById('go-to-admin-panel-btn')?.addEventListener('click', async (e) => {
        const btn = e.target;
        btn.disabled = true;
        btn.textContent = '正在產生連結...';
        try {
            const result = await api.fetchData('/api/generate-admin-link', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userId: state.userId })
            });
            if (!result.success) throw new Error(result.error || '無法產生連結');
            liff.openWindow({ url: result.link, external: true });
        } catch (error) {
            alert(`開啟失敗: ${error.message}`);
        } finally {
            btn.disabled = false;
            btn.textContent = '開啟完整版後台';
        }
    });
}

// Tab 切換與模組載入器
async function switchTab(tabId) {
    // UI 切換
    document.querySelectorAll('.tab-button').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.tab === tabId);
    });
    document.querySelectorAll('.tab-content').forEach(content => {
        content.classList.toggle('active', content.id === `tab-content-${tabId}`);
    });

    // --- 關鍵：動態載入對應模組 (Lazy Loading) ---
    // 這會在我們建立下一階段的檔案後生效
    try {
        switch (tabId) {
            case 'activity': 
                const activityModule = await import('./modules/activity.js');
                activityModule.init(); 
                break;
            case 'booking':
                const bookingModule = await import('./modules/booking.js');
                bookingModule.init();
                break;
            case 'room-control':
                const roomModule = await import('./modules/roomControl.js');
                roomModule.init();
                break;
            case 'redeem':
                const opModule = await import('./modules/operation.js');
                opModule.init();
                break;
            case 'customer':
                const customerModule = await import('./modules/customer.js');
                customerModule.init();
                break;
        }
    } catch (e) {
        console.error(`載入模組 ${tabId} 失敗:`, e);
        // 在模組檔案建立前，這裡會報錯是正常的
        if (e.message.includes('Failed to fetch dynamically imported module')) {
            console.log(`(開發提示：請確保 public/owner/modules/${tabId}.js 已建立)`);
        }
    }
}

// 啟動程式
document.addEventListener('DOMContentLoaded', main);