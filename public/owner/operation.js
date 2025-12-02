// public/owner/modules/operation.js
import { api } from '../api.js';
import { state, setState } from '../state.js';
import { ui } from '../ui.js';

export function init() {
    initOwnerReasonInput();
    
    // 綁定按鈕
    document.getElementById('start-redeem-scan-btn')?.addEventListener('click', startRedeemScanner);
    document.getElementById('op-search-btn')?.addEventListener('click', handleOpSearch);
    document.getElementById('op-submit-points-btn')?.addEventListener('click', handleOpSubmitPoints);
    
    // 綁定輸入即搜尋
    const opInput = document.getElementById('op-search-input');
    if (opInput && !opInput.dataset.bound) {
        opInput.addEventListener('input', debounce(handleOpSearch, 500));
        opInput.dataset.bound = 'true';
    }
    
    // 綁定內部 Tab 切換 (發點數/核銷券)
    const opActionPanel = document.getElementById('op-action-panel');
    if (opActionPanel) {
        opActionPanel.querySelector('.view-switcher')?.addEventListener('click', (e) => {
            const btn = e.target.closest('.view-switch-btn');
            if (btn) {
                document.querySelectorAll('#op-action-panel .view-switch-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                document.getElementById('op-view-points').style.display = btn.dataset.opView === 'points' ? 'block' : 'none';
                document.getElementById('op-view-vouchers').style.display = btn.dataset.opView === 'vouchers' ? 'block' : 'none';
            }
        });
        
        // 綁定核銷按鈕 (事件委派)
        document.getElementById('op-voucher-list')?.addEventListener('click', handleOpVoucherClick);
    }
}

// 供 DetailsModal 呼叫的快速入口
export async function openQuickAction(action, userId, userName) {
    // 切換到 Redeem Tab
    document.querySelector('.tab-button[data-tab="redeem"]').click();
    
    // 預填搜尋並鎖定該用戶
    document.getElementById('op-search-input').value = userName;
    await selectOpUser(userId);
    
    // 根據 action 切換子分頁
    if (action === 'adjust-stored-value') {
        // 手機板暫無儲值介面，這裡可以導向點數介面或提示
        alert("手機板暫時僅支援點數發放與優惠券核銷。請使用完整後台進行儲值操作。");
    } else if (action === 'issue-voucher') {
        // 手機板暫無發券介面
        alert("手機板暫時僅支援核銷。請使用完整後台發送優惠券。");
    }
}

function startRedeemScanner() {
    const qrReader = document.getElementById('redeem-qr-reader');
    const startBtn = document.getElementById('start-redeem-scan-btn');
    const msgEl = document.getElementById('redeem-status-message');
    
    if (!qrReader) return;
    
    qrReader.style.display = 'block';
    startBtn.style.display = 'none';
    msgEl.textContent = '請對準 QR Code...';
    
    if (state.html5QrCodeScanner) return; // 避免重複啟動

    if (typeof Html5Qrcode === 'undefined') {
        alert("掃碼元件未載入");
        return;
    }

    state.html5QrCodeScanner = new Html5Qrcode("redeem-qr-reader");
    state.html5QrCodeScanner.start(
        { facingMode: "environment" },
        { fps: 10, qrbox: 250 },
        async (decodedText) => {
            msgEl.textContent = `掃描成功！正在處理...`;
            await state.html5QrCodeScanner.stop();
            state.html5QrCodeScanner = null;
            qrReader.style.display = 'none';
            handleScanResult(decodedText);
        }
    ).catch(err => {
        msgEl.textContent = `相機啟動失敗: ${err}`;
        startBtn.style.display = 'block';
    });
}

async function handleScanResult(text) {
    try {
        // 假設 text 就是 voucherId (或是包含 voucherId 的 URL)
        // 這裡做個簡單處理，如果是 URL 取參數，否則直接當 ID
        let voucherId = text;
        try {
            const url = new URL(text);
            voucherId = url.searchParams.get('voucher_id') || text;
        } catch(e){}

        const result = await api.fetchData('/api/admin/redeem-voucher', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ voucherId: voucherId })
        });
        
        document.getElementById('redeem-status-message').innerHTML = `<span style="color:green">✅ 核銷成功！</span>`;
        document.getElementById('start-redeem-scan-btn').style.display = 'block';
        
    } catch (error) {
        document.getElementById('redeem-status-message').innerHTML = `<span style="color:red">❌ 核銷失敗: ${error.message}</span>`;
        document.getElementById('start-redeem-scan-btn').style.display = 'block';
    }
}

async function handleOpSearch() {
    const query = document.getElementById('op-search-input').value.trim();
    const resultContainer = document.getElementById('op-search-result-container');
    
    if (!query) {
        if (!state.currentOpUser) resultContainer.style.display = 'none';
        return;
    }
    
    resultContainer.style.display = 'block';
    resultContainer.innerHTML = '<p style="padding:10px">搜尋中...</p>';
    
    try {
        const users = await api.fetchData(`/api/admin/user-search?q=${encodeURIComponent(query)}`);
        if (users.length === 0) {
            resultContainer.innerHTML = '<p style="padding:10px">找不到顧客</p>';
        } else {
            resultContainer.innerHTML = users.map(u => `
                <div class="redeem-user-card" data-id="${u.user_id}" style="cursor:pointer; padding:10px; border-bottom:1px solid #eee;">
                    <strong>${u.line_display_name}</strong> (${u.real_name || '無實名'})
                    <br><small>${u.phone || '無電話'}</small>
                </div>
            `).join('');
            
            resultContainer.querySelectorAll('.redeem-user-card').forEach(card => {
                card.addEventListener('click', () => selectOpUser(card.dataset.id));
            });
        }
    } catch (e) {
        resultContainer.innerHTML = `<p style="color:red; padding:10px">搜尋錯誤</p>`;
    }
}

async function selectOpUser(userId) {
    state.currentOpUser = userId;
    document.getElementById('op-search-result-container').style.display = 'none';
    document.getElementById('op-action-panel').style.display = 'block';
    
    // 載入該用戶的優惠券
    const list = document.getElementById('op-voucher-list');
    list.innerHTML = '<p>載入優惠券...</p>';
    
    try {
        const data = await api.fetchData(`/api/admin/user-details?userId=${userId}`);
        const vouchers = (data.vouchers || []).filter(v => !v.is_used);
        
        if (vouchers.length === 0) {
            list.innerHTML = '<p>無可用優惠券</p>';
        } else {
            list.innerHTML = vouchers.map(v => `
                <div style="border:1px solid #ddd; padding:10px; margin-bottom:5px; border-radius:5px; display:flex; justify-content:space-between; align-items:center;">
                    <span>${v.title}</span>
                    <button class="cta-button btn-op-redeem" data-id="${v.voucher_id}" style="width:auto; padding:5px 10px; font-size:0.8rem;">核銷</button>
                </div>
            `).join('');
        }
    } catch(e) {
        list.innerHTML = '<p style="color:red">載入失敗</p>';
    }
}

async function handleOpSubmitPoints() {
    if (!state.currentOpUser) return alert('未選擇顧客');
    const points = parseInt(document.getElementById('op-points-input').value);
    const reason = document.getElementById('op-points-reason-input')?.value.trim();
    
    if (!points || points <= 0) return alert('請輸入有效點數');
    if (!reason) return alert('請輸入原因');
    
    const btn = document.getElementById('op-submit-points-btn');
    btn.disabled = true;
    
    try {
        await api.fetchData('/api/admin/add-points', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId: state.currentOpUser, expValue: points, reason: reason })
        });
        
        saveOwnerReason(reason);
        alert(`成功發放 ${points} 點！`);
        document.getElementById('op-points-input').value = '';
    } catch (e) {
        alert(`發放失敗: ${e.message}`);
    } finally {
        btn.disabled = false;
    }
}

async function handleOpVoucherClick(e) {
    const btn = e.target.closest('.btn-op-redeem');
    if (!btn) return;
    
    if (!confirm('確定要核銷此券嗎？')) return;
    
    btn.disabled = true;
    try {
        await api.fetchData('/api/admin/redeem-voucher', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ voucherId: btn.dataset.id })
        });
        alert('核銷成功');
        btn.parentElement.remove();
    } catch(e) {
        alert('核銷失敗: ' + e.message);
        btn.disabled = false;
    }
}

function initOwnerReasonInput() {
    // 檢查並建立 datalist (參考原 owner-liff.js 邏輯)
    const select = document.getElementById('op-points-reason');
    if (select) {
        const container = select.parentElement;
        select.remove();
        
        const input = document.createElement('input');
        input.id = 'op-points-reason-input';
        input.setAttribute('list', 'reason-list');
        input.className = 'form-control'; // 假設有這個 class
        container.appendChild(input);
        
        const datalist = document.createElement('datalist');
        datalist.id = 'reason-list';
        document.body.appendChild(datalist);
        
        updateReasonDatalist();
    }
}

function updateReasonDatalist() {
    const datalist = document.getElementById('reason-list');
    if (!datalist) return;
    
    const defaults = ["消費回饋", "活動獎勵", "補償"];
    let saved = [];
    try { saved = JSON.parse(localStorage.getItem('admin_reasons') || '[]'); } catch(e){}
    
    const all = [...new Set([...defaults, ...saved])];
    datalist.innerHTML = all.map(r => `<option value="${r}">`).join('');
}

function saveOwnerReason(reason) {
    let saved = [];
    try { saved = JSON.parse(localStorage.getItem('admin_reasons') || '[]'); } catch(e){}
    if (!saved.includes(reason)) {
        saved.unshift(reason);
        if (saved.length > 10) saved.pop();
        localStorage.setItem('admin_reasons', JSON.stringify(saved));
        updateReasonDatalist();
    }
}

function debounce(func, delay) {
    let timer;
    return function(...args) {
        clearTimeout(timer);
        timer = setTimeout(() => func.apply(this, args), delay);
    };
}