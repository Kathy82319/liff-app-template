// public/owner/app.js
import { api } from './api.js';
import { state, setState } from './state.js';
import { ui } from './ui.js';
import * as UI from './ui.js'; // 額外引入供全域事件使用

async function main() {
    const loadingView = document.getElementById('loading-view');
    const unauthorizedView = document.getElementById('unauthorized-view');
    const mainView = document.getElementById('main-view');

    try {
        // 1. 取得設定
        const configResponse = await api.fetchData('/api/get-app-config', { skipGlobalError: true });
        if (configResponse && configResponse.ENV && configResponse.ENV.OWNER_LIFF_ID) {
            setState('myLiffId', configResponse.ENV.OWNER_LIFF_ID);
            window.CONFIG = configResponse;
        } else {
            throw new Error("系統未設定 OWNER_LIFF_ID");
        }

        // 2. 初始化 LIFF
        await liff.init({ liffId: state.myLiffId });
        
        if (!liff.isLoggedIn()) {
            liff.login({ redirectUri: window.location.href });
            return;
        }
        
        const profile = await liff.getProfile();
        setState('userId', profile.userId);

        // 3. 驗證身分與載入產品
        const [verifyResult, productsResponse] = await Promise.all([
            api.fetchData('/api/admin/verify-liff-user', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userId: state.userId })
            }),
            api.fetchData('/api/get-products', { skipGlobalError: true })
        ]);
        
        setState('allProducts', productsResponse || []);

        if (verifyResult.success && verifyResult.isAdmin) {
            setState('currentTemplate', verifyResult.activeTemplate);
            
            mainView.style.display = 'block';
            initializeAppUI(state.currentTemplate);
            setupEventListeners();
            
            // 【修正重點】移除了還不存在的 initOwnerReasonInput() 呼叫
            
            // 進入第一個 Tab
            switchTab('activity');
        } else {
            unauthorizedView.style.display = 'block';
        }

    } catch (error) {
         console.error("[Main] Initialization failed:", error);
         unauthorizedView.innerHTML = `
            <h2 style="color: var(--color-danger);">系統啟動失敗</h2>
            <p>${error.message}</p>
            <button onclick="window.location.reload()" style="padding: 10px 20px; margin-top: 10px;">重新整理</button>
         `;
         unauthorizedView.style.display = 'block';
    } finally {
         loadingView.style.display = 'none';
    }
}

function initializeAppUI(template) {
    const templateDefinition = window.CONFIG?.LOGIC?.INDUSTRY_TEMPLATE_DEFINITIONS[template];
    const features = templateDefinition?.features || {};
    
    const bookingTabButton = document.querySelector('[data-tab="booking"]');
    const roomControlTabButton = document.querySelector('[data-tab="room-control"]');
    const redeemTabButton = document.querySelector('[data-tab="redeem"]');
    const customerTabButton = document.querySelector('[data-tab="customer"]');
    const ecommerceManageBtns = document.querySelector('.ecommerce-manage-buttons');

    if (template === 'ecommerce_template') {
        if (bookingTabButton) bookingTabButton.style.display = 'none';
        if (roomControlTabButton) roomControlTabButton.style.display = 'none';
        if (ecommerceManageBtns) ecommerceManageBtns.style.display = 'flex';
    } else {
        if (bookingTabButton) bookingTabButton.style.display = '';
        if (ecommerceManageBtns) ecommerceManageBtns.style.display = 'none';
        
        if (template === 'guesthouse_template' && features.OWNER_LIFF_ENABLE_ROOM_CONTROL !== false) {
            if (roomControlTabButton) roomControlTabButton.style.display = ''; 
        } else {
            if (roomControlTabButton) roomControlTabButton.style.display = 'none'; 
        }
    }

    if (redeemTabButton) {
        redeemTabButton.style.display = (features.OWNER_LIFF_ENABLE_REDEEM !== false) ? '' : 'none';
    }
    if (customerTabButton) {
        customerTabButton.style.display = '';
    }
}

function setupEventListeners() {
    window.addEventListener('popstate', UI.handlePopState);
    
    document.getElementById('owner-tab-bar').addEventListener('click', (e) => {
        const button = e.target.closest('.tab-button');
        if (button && button.dataset.tab) { switchTab(button.dataset.tab); }
    });

    document.querySelectorAll('.modal-close').forEach(btn => {
        btn.addEventListener('click', () => UI.closeModal());
    });

    const quickBtn = document.getElementById('quick-action-btn');
    if (quickBtn) {
        quickBtn.addEventListener('click', async () => {
            const module = await import('./modules/quickBooking.js');
            module.openQuickBookingModal();
        });
    }
    
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

async function switchTab(tabId) {
    document.querySelectorAll('.tab-button').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.tab === tabId);
    });
    document.querySelectorAll('.tab-content').forEach(content => {
        content.classList.toggle('active', content.id === `tab-content-${tabId}`);
    });

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
        // 因為檔案還沒全補齊，除了 activity 外的 tab 報錯是正常的
    }
}

document.addEventListener('DOMContentLoaded', main);