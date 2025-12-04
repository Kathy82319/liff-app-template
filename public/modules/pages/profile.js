// public/modules/pages/profile.js
import { api } from '../api.js';
import { state } from '../state.js';
import { router } from '../router.js';
import { ui } from '../ui.js';

// --- 主頁面初始化 ---
export async function init() {
    if (!state.userProfile) return;

    // 1. 讀取設定
    const profileConfig = state.activeTemplate?.client_config?.profile || {};
    const btnToggles = profileConfig.btn_toggles || {};

    // 2. 綁定會員選單按鈕 (根據設定顯示/隱藏)
    const btnMap = {
        'btn-my-records': { page: 'page-my-records', show: btnToggles.records !== false },
        'btn-my-vouchers': { page: 'page-my-vouchers', show: btnToggles.vouchers !== false },
        'btn-edit-profile': { page: 'page-edit-profile', show: true }, // 編輯資料預設總是顯示
        'btn-go-rally': { page: 'page-rally', show: btnToggles.rally !== false }
    };

    for (const [btnId, config] of Object.entries(btnMap)) {
        const btn = document.getElementById(btnId);
        if (btn) {
            // 控制顯示
            btn.style.display = config.show ? 'flex' : 'none';
            
            // 綁定事件 (使用 cloneNode 清除舊監聽器)
            const newBtn = btn.cloneNode(true);
            btn.parentNode.replaceChild(newBtn, btn);
            newBtn.addEventListener('click', () => router.navigate(config.page));
        }
    }

    // 3. 獲取最新資料並更新 UI
    try {
        const userData = await api.getUserProfile(state.userProfile.userId);
        updateDisplay(userData);
        
        // 更新 QR Code
        const qrContainer = document.getElementById('qrcode');
        if (qrContainer) {
            qrContainer.innerHTML = '';
            new QRCode(qrContainer, { text: state.userProfile.userId, width: 65, height: 65 });
        }
        
        // 更新頭像
        const picEl = document.getElementById('profile-picture');
        if (picEl && state.userProfile.pictureUrl) picEl.src = state.userProfile.pictureUrl;

    } catch (e) {
        console.error("Profile load failed", e);
    }
}

function updateDisplay(data) {
    if (!data) return;
    
    // 讀取設定
    const profileConfig = state.activeTemplate?.client_config?.profile || {};
    const infoToggles = profileConfig.info_toggles || {};
    const labels = state.activeTemplate?.client_config?.profile?.labels || {}; // 若無設定則 fallback
    const terms = state.activeTemplate?.terms || {};

    const setText = (id, val) => { const el = document.getElementById(id); if(el) el.textContent = val; };
    const setDisplay = (id, show) => { const el = document.getElementById(id); if(el) el.style.display = show ? '' : 'none'; };
    
    setText('display-name', data.real_name || state.userProfile.displayName);
    
    // 1. 會員方案 (Class)
    setText('user-class', data.class || '一般會員');
    setDisplay('user-class', infoToggles.plan !== false);

    // 2. 等級與點數 (Level & Points)
    // 這裡假設 HTML 結構是 <p id="user-level">...</p>，若要分開控制需調整 HTML
    // 目前邏輯：只要 level 或 points 其中一個開啟，就顯示該行，但內容會變動
    const showLevel = infoToggles.level !== false;
    const showPoints = infoToggles.points !== false;
    const levelEl = document.getElementById('user-level');
    
    if (levelEl) {
        if (!showLevel && !showPoints) {
            levelEl.style.display = 'none';
        } else {
            levelEl.style.display = '';
            let text = '';
            if (showLevel) text += `Lv.${data.level}`;
            if (showLevel && showPoints) text += ' / ';
            if (showPoints) text += `點數: ${data.current_exp}`;
            levelEl.textContent = text;
        }
    }
    
    // 3. 儲值金 (Stored Value)
    const storedValueEl = document.getElementById('user-stored-value');
    if(storedValueEl) storedValueEl.textContent = `$${data.stored_value_balance || 0}`;

    const balanceContainer = document.getElementById('user-balance-container');
    // 優先使用新設定 info_toggles.balance
    const showBalance = infoToggles.balance !== false;
    if (balanceContainer) balanceContainer.style.display = showBalance ? 'block' : 'none';

    // 4. 專屬優惠行 (Perk)
    const perkP = document.getElementById('user-perk-line');
    if (perkP) {
        // 這裡可以增加一個 toggle，目前沿用舊邏輯但加入設定判斷
        // 假設 perk 總是顯示 (如果有的話)，除非未來加入開關
        if (data.perk && data.class !== '無') {
            const label = labels.perk || terms.PROFILE_PERK_LABEL || '專屬優惠';
            perkP.innerHTML = `<strong>${label}：</strong><span>${data.perk}</span>`;
            perkP.style.display = 'block';
        } else {
            perkP.style.display = 'none';
        }
    }
}

// --- 編輯個人資料頁面 ---
export async function initEdit() {
    const terms = state.activeTemplate?.terms || {};
    const pageTitle = document.querySelector('#page-edit-profile .page-main-title');
    if (pageTitle) pageTitle.textContent = terms.PROFILE_EDIT_BTN_LABEL || '編輯個人資料';

    const userData = await api.getUserProfile(state.userProfile.userId);
    const form = document.getElementById('edit-profile-form');
    
    if (form) {
        document.getElementById('edit-profile-name').value = state.userProfile.displayName;
        document.getElementById('edit-profile-real-name').value = userData.real_name || '';
        document.getElementById('edit-profile-phone').value = userData.phone || '';
        document.getElementById('edit-profile-email').value = userData.email || '';

        form.onsubmit = async (e) => {
            e.preventDefault();
            const statusMsg = document.getElementById('edit-profile-form-status');
            statusMsg.textContent = '儲存中...';
            try {
                await api.updateUserProfile({
                    userId: state.userProfile.userId,
                    realName: document.getElementById('edit-profile-real-name').value.trim(),
                    phone: document.getElementById('edit-profile-phone').value,
                    email: document.getElementById('edit-profile-email').value,
                    displayName: state.userProfile.displayName,
                    pictureUrl: state.userProfile.pictureUrl
                });
                statusMsg.textContent = '儲存成功！';
                statusMsg.style.color = 'green';
                setTimeout(() => history.back(), 1500);
            } catch (err) {
                statusMsg.textContent = `失敗: ${err.message}`;
                statusMsg.style.color = 'red';
            }
        };
    }
}

// --- 我的優惠券頁面 (保持不變，或可微調) ---
export async function initVouchers() {
    const availableContainer = document.getElementById('my-vouchers-container-available');
    const usedContainer = document.getElementById('my-vouchers-container-used');
    if (!availableContainer || !usedContainer) return;

    availableContainer.innerHTML = '<p style="text-align:center;">查詢中...</p>';
    usedContainer.innerHTML = '<p style="text-align:center;">查詢中...</p>';

    try {
        const vouchers = await api.getMyVouchers(state.userProfile.userId);
        const now = new Date();
        
        const available = vouchers.filter(v => !v.is_used && (!v.valid_to || new Date(v.valid_to + 'T23:59:59') >= now));
        const used = vouchers.filter(v => v.is_used || (v.valid_to && new Date(v.valid_to + 'T23:59:59') < now));

        renderVouchers(available, availableContainer, false);
        renderVouchers(used, usedContainer, true);

        availableContainer.onclick = (e) => {
            const btn = e.target.closest('.btn-redeem-voucher');
            if (btn) {
                showRedeemModal(btn.dataset.voucherId, btn.dataset.voucherTitle);
            }
        };
    } catch (e) {
        availableContainer.innerHTML = `<p style="color:red; text-align:center;">${e.message}</p>`;
        usedContainer.innerHTML = '';
    }
}

function renderVouchers(list, container, isUsed) {
    if (list.length === 0) {
        container.innerHTML = `<p style="text-align:center; color:#999; padding:20px;">${isUsed ? '無紀錄' : '無可用優惠券'}</p>`;
        return;
    }
    container.innerHTML = list.map(v => {
        let valText = v.type === 'redeem_item' ? `兌換: ${v.redeem_item_name}` : (v.type === 'discount_fixed' ? `$${v.value} 折扣` : `${v.value}% 折扣`);
        
        let actionHtml = isUsed 
            ? (v.is_used ? `<p class="voucher-status-used">已使用</p>` : `<p class="voucher-status-used">已過期</p>`)
            : `<button class="cta-button btn-redeem-voucher" data-voucher-id="${v.voucher_id}" data-voucher-title="${v.title}" style="margin-top:10px; padding:8px;">出示核銷</button>`;
        
        return `
        <div class="booking-info-card voucher-card ${isUsed ? 'used-voucher' : ''}">
            <h4>${v.title}</h4>
            <p><strong>${valText}</strong></p>
            <p>效期: ${v.valid_to || '永久'}</p>
            ${actionHtml}
        </div>`;
    }).join('');
}

function showRedeemModal(id, title) {
    const modal = document.getElementById('voucher-redeem-modal');
    if (!modal) return;
    
    document.getElementById('voucher-redeem-title').textContent = title;
    document.getElementById('voucher-redeem-code').textContent = `ID: ${id}`;
    
    const qrEl = document.getElementById('voucher-redeem-qrcode');
    qrEl.innerHTML = '';
    new QRCode(qrEl, { text: id, width: 200, height: 200 });
    
    modal.style.display = 'flex';
    document.getElementById('voucher-redeem-close-btn').onclick = () => modal.style.display = 'none';
}