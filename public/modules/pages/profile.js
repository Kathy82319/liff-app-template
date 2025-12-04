// public/modules/pages/profile.js (v12.0 - Config Driven)
import { api } from '../api.js';
import { state } from '../state.js';
import { router } from '../router.js';

// --- 主頁面初始化 ---
export async function init() {
    if (!state.userProfile) return;

    const config = state.activeTemplate?.client_config?.profile || {};
    const btnToggles = config.btn_toggles || {};

    // 1. 綁定並控制按鈕顯示
    const btnMap = {
        'btn-my-records': { page: 'page-my-records', show: btnToggles.records !== false },
        'btn-my-vouchers': { page: 'page-my-vouchers', show: btnToggles.vouchers !== false },
        'btn-edit-profile': { page: 'page-edit-profile', show: true }, // 編輯永遠顯示
        'btn-go-rally': { page: 'page-rally', show: btnToggles.rally !== false }
    };

    for (const [btnId, setting] of Object.entries(btnMap)) {
        const btn = document.getElementById(btnId);
        if (btn) {
            if (setting.show) {
                btn.style.display = 'flex'; // 恢復顯示
                const newBtn = btn.cloneNode(true);
                btn.parentNode.replaceChild(newBtn, btn);
                newBtn.addEventListener('click', () => router.navigate(setting.page));
            } else {
                btn.style.display = 'none'; // 隱藏
            }
        }
    }

    // 2. 獲取最新資料並更新 UI
    try {
        const userData = await api.getUserProfile(state.userProfile.userId);
        updateDisplay(userData, config);
        
        // 更新 QR Code (如果啟用)
        // 您可以在 config 加入 qr_code 開關，這裡暫時保留
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

function updateDisplay(data, config) {
    if (!data) return;
    
    const toggles = config.info_toggles || {};
    const labels = config.labels || {};

    const setText = (id, val) => { const el = document.getElementById(id); if(el) el.textContent = val; };
    const setDisplay = (id, show) => { const el = document.getElementById(id); if(el) el.style.display = show ? '' : 'none'; };

    // 1. 名稱
    setText('display-name', data.real_name || state.userProfile.displayName);
    
    // 2. 會員方案 (Class)
    if (toggles.plan !== false) {
        setText('user-class', data.class || '一般會員');
        setDisplay('user-class', true);
    } else {
        setDisplay('user-class', false);
    }

    // 3. 等級與點數 (Level & Points)
    // 這裡假設這兩個綁定在一起，或者分開控制
    const levelEl = document.getElementById('user-level');
    if (levelEl) {
        if (toggles.level !== false || toggles.points !== false) {
            let text = '';
            if (toggles.level !== false) text += `Lv.${data.level} `;
            if (toggles.points !== false) text += `(點數: ${data.current_exp})`;
            levelEl.textContent = text;
            levelEl.style.display = '';
        } else {
            levelEl.style.display = 'none';
        }
    }
    
    // 4. 儲值金
    const storedValueEl = document.getElementById('user-stored-value');
    if(storedValueEl) storedValueEl.textContent = `$${data.stored_value_balance || 0}`;
    const balanceContainer = document.getElementById('user-balance-container');
    if (balanceContainer) balanceContainer.style.display = (toggles.balance !== false) ? 'block' : 'none';

    // 5. 專屬優惠行 (Perk)
    const perkP = document.getElementById('user-perk-line');
    if (perkP) {
        if (data.perk && data.class !== '無') {
            const label = labels.perk || '專屬優惠';
            perkP.innerHTML = `<strong>${label}：</strong><span>${data.perk}</span>`;
            perkP.style.display = 'block';
        } else {
            perkP.style.display = 'none';
        }
    }
}

// ... (initEdit, initVouchers, renderVouchers, showRedeemModal 保持不變)
export async function initEdit() {
    const pageTitle = document.querySelector('#page-edit-profile .page-main-title');
    if (pageTitle) pageTitle.textContent = '編輯個人資料';

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