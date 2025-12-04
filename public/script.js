// public/script.js (v12.0 - Client Config Adapter)
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

        // 【關鍵修復】應用全域設定 (品牌名稱、主色調)
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

        // 4. 處理 URL 參數 (領券/重置)
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
 * 應用全域設定 (讀取 client_config.global)
 */
function applyGlobalConfig() {
    if (!state.activeTemplate) return;

    // 1. 取得設定
    const clientConfig = state.activeTemplate.client_config || {};
    const globalConfig = clientConfig.global || {};
    const navBarConfig = state.activeTemplate.logic?.navBar || []; 

    // 2. 設定網頁標題
    document.title = globalConfig.brand_name || '店務管理系統';

    // 3. 【新增】設定主色調 (CSS 變數)
    if (globalConfig.primary_color) {
        document.documentElement.style.setProperty('--color-primary', globalConfig.primary_color);
        // 自動計算一個較淺的次要色 (簡單用透明度處理，或者您可以寫更複雜的演算法)
        // 這裡簡單示範：不改變次要色，只改主色
    }

    // 4. 更新導覽列 (Tab Bar)
    const tabButtons = document.querySelectorAll('.tab-button');
    
    tabButtons.forEach(tab => {
        const targetPage = tab.dataset.target;
        const configItem = navBarConfig.find(item => item.target === targetPage);

        if (configItem) {
            if (configItem.enabled === false) {
                tab.style.display = 'none';
            } else {
                tab.style.display = '';
                const label = configItem.label || '未命名'; 
                if (label.length > 2) {
                    tab.innerHTML = label.substring(0, 2) + '<br>' + label.substring(2);
                } else {
                    tab.innerHTML = label;
                }
            }
        } else {
            tab.style.display = ''; 
        }
    });
    
    console.log("[Global Config] Applied brand name and color.");
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