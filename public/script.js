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
        setState('activeTemplate', config.LOGIC.INDUSTRY_TEMPLATE_DEFINITIONS[config.LOGIC.ACTIVE_INDUSTRY_TEMPLATE]);

        // 2. 初始化 LIFF
        await liff.init({ liffId: state.liffId });
        
        if (!liff.isLoggedIn()) {
            const destUrl = new URL(window.location.href);
            // 清理 LINE Login 參數
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
        
        // 綁定 Tab Bar
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
        document.getElementById('app-content').innerHTML = `<p style="color:red; text-align:center; margin-top:20px;">系統載入失敗，請重新整理。</p>`;
    }
});

async function handleVoucherClaim(code) {
    document.getElementById('app-content').innerHTML = '<p style="text-align:center; margin-top:50px;">正在領取優惠券...</p>';
    try {
        const res = await api.claimVoucher({ userId: state.userProfile.userId, public_claim_code: code });
        alert(`✅ ${res.message}`);
    } catch (e) {
        // 409 Conflict 也是一種狀態，不一定要報錯
        if(e.status === 409) alert(e.data.error);
        else alert(`❌ 領取失敗: ${e.message}`);
    }
    // 清除參數並跳轉
    history.replaceState(null, '', window.location.pathname);
    router.navigate('page-my-vouchers');
}