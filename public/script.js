// public/script.js (Entry Point)
import { state, setState } from './modules/state.js';
import { api } from './modules/api.js';
import { router } from './modules/router.js';
import { setupGlobalModalClosers } from './modules/ui.js';

document.addEventListener('DOMContentLoaded', async () => {
    try {
        // 1. 載入設定
        const config = await api.getAppConfig();
        setState('config', config);
        setState('liffId', config.ENV.LIFF_ID);
        
        const activeTemplateKey = config.LOGIC.ACTIVE_INDUSTRY_TEMPLATE;
        const activeTemplate = config.LOGIC.INDUSTRY_TEMPLATE_DEFINITIONS[activeTemplateKey];
        setState('activeTemplate', activeTemplate);

        // 【關鍵修復】應用全域設定 (導覽列、網頁標題)
        applyGlobalConfig();

        // 2. 初始化 LIFF
        await liff.init({ liffId: state.liffId });
        
        if (!liff.isLoggedIn()) {
            const destUrl = new URL(window.location.href);
            ['code', 'state', 'liffClientId', 'liffRedirectUri'].forEach(p => destUrl.searchParams.delete(p));
            liff.login({ redirectUri: destUrl.toString() });
            return;
        }

        setState('userProfile', await liff.getProfile());

        // 3. 綁定全域事件
        setupGlobalModalClosers();
        window.addEventListener('popstate', (e) => router.handlePopState(e));
        
        document.body.addEventListener('click', (e) => {
            if (e.target.closest('.details-back-button')) {
                history.back();
            }
        });
        
        document.getElementById('tab-bar').addEventListener('click', (e) => {
            const btn = e.target.closest('.tab-button');
            if (btn && btn.dataset.target) {
                router.navigate(btn.dataset.target);
            }
        });

        // 4. 處理 URL 參數
        const urlParams = new URLSearchParams(window.location.search);
        const voucherCode = urlParams.get('voucher_code');
        
        if (voucherCode) {
            await handleVoucherClaim(voucherCode);
        } else {
            const hash = window.location.hash.substring(1);
            router.navigate(hash ? `page-${hash}` : 'page-home');
        }

    } catch (error) {
        console.error("Initialization Failed:", error);
        document.getElementById('app-content').innerHTML = `<div style="text-align:center; padding:30px; color:red;">
            <h3>系統載入失敗</h3>
            <p>${error.message}</p>
            <button onclick="window.location.reload()" style="padding:10px 20px; margin-top:10px;">重新整理</button>
        </div>`;
    }
});

/**
 * 【新增】應用全域設定
 * 負責連動後台設定，更新導覽列文字、顯示狀態與網頁標題
 */
function applyGlobalConfig() {
    if (!state.activeTemplate) return;

    const terms = state.activeTemplate.terms || {};
    const clientConfig = state.activeTemplate.client_config || {};
    
    // 1. 更新網頁標題
    document.title = clientConfig.global?.brand_name || terms.BUSINESS_NAME || '鐵絲特飯店';

    // 2. 更新導覽列 (Tab Bar)
    const tabMapping = {
        'page-home': { label: clientConfig.home?.title || '最新情報' },
        'page-products': { label: clientConfig.products?.title || '產品型錄' },
        'page-profile': { label: '會員中心' }, // 這個通常固定
        'page-booking': { label: clientConfig.booking?.labels?.checkin ? '線上預約' : (terms.BOOKING_NAME || '線上預約') },
        'page-info': { label: '店家資訊' }
    };

    document.querySelectorAll('.tab-button').forEach(tab => {
        const targetPage = tab.dataset.target;
        const config = tabMapping[targetPage];

        if (config) {
            // 更新文字 (自動換行處理)
            let label = config.label;
            if (label.length > 2) {
                label = label.substring(0, 2) + '<br>' + label.substring(2);
            }
            tab.innerHTML = label;
        }
    });
    
    console.log("[Global Config] Navigation bar updated.");
}

async function handleVoucherClaim(code) {
    document.getElementById('app-content').innerHTML = '<p style="text-align:center; margin-top:50px;">正在領取優惠券...</p>';
    try {
        const res = await api.claimVoucher({ userId: state.userProfile.userId, public_claim_code: code });
        alert(`✅ ${res.message}`);
    } catch (e) {
        if(e.status === 409) alert(e.data.error);
        else alert(`❌ 領取失敗: ${e.message}`);
    }
    history.replaceState(null, '', window.location.pathname);
    router.navigate('page-my-vouchers');
}