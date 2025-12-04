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
            // 清理 LINE Login 參數，避免汙染 URL
            ['code', 'state', 'liffClientId', 'liffRedirectUri'].forEach(p => destUrl.searchParams.delete(p));
            liff.login({ redirectUri: destUrl.toString() });
            return;
        }

        setState('userProfile', await liff.getProfile());

        // 3. 綁定全域事件
        setupGlobalModalClosers();
        window.addEventListener('popstate', (e) => router.handlePopState(e));
        
        // 綁定全域返回按鈕
        document.body.addEventListener('click', (e) => {
            if (e.target.closest('.details-back-button')) {
                history.back();
            }
        });
        
        // 綁定 Tab Bar 點擊事件
        document.getElementById('tab-bar').addEventListener('click', (e) => {
            const btn = e.target.closest('.tab-button');
            if (btn && btn.dataset.target) {
                router.navigate(btn.dataset.target);
            }
        });

        // 4. 處理 URL 參數 (領券/重置)
        const urlParams = new URLSearchParams(window.location.search);
        const voucherCode = urlParams.get('voucher_code');
        
        if (voucherCode) {
            await handleVoucherClaim(voucherCode);
        } else {
            // 正常啟動路由
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
    const logic = state.activeTemplate.logic || {};
    const navBarConfig = logic.navBar || []; 

    // 1. 更新網頁標題
    document.title = terms.BUSINESS_NAME || '店務管理系統';

    // 2. 更新導覽列 (Tab Bar)
    const tabButtons = document.querySelectorAll('.tab-button');
    
    tabButtons.forEach(tab => {
        const targetPage = tab.dataset.target; // 例如 'page-booking'
        
        // 在設定中尋找對應的設定項
        const configItem = navBarConfig.find(item => item.target === targetPage);

        if (configItem) {
            // 判斷是否啟用
            if (configItem.enabled === false) {
                tab.style.display = 'none';
            } else {
                tab.style.display = ''; // 恢復顯示
                
                // 更新按鈕文字 (支援自動換行排版)
                const label = configItem.label || '未命名'; 
                // 如果文字超過 2 個字，嘗試在第 2 個字後換行 (配合 CSS 樣式)
                if (label.length > 2) {
                    tab.innerHTML = label.substring(0, 2) + '<br>' + label.substring(2);
                } else {
                    tab.innerHTML = label;
                }
            }
        } else {
            // 如果設定檔中沒有此頁面的設定，預設顯示
            tab.style.display = ''; 
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
        // 409 Conflict 也是一種狀態 (已領過)，不一定要報紅字錯誤
        if(e.status === 409) alert(e.data.error);
        else alert(`❌ 領取失敗: ${e.message}`);
    }
    // 清除參數並跳轉
    history.replaceState(null, '', window.location.pathname);
    router.navigate('page-my-vouchers');
}