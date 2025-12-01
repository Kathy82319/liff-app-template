// public/modules/pages/records.js
import { api } from '../api.js';
import { state } from '../state.js';
import { router } from '../router.js';

export async function init() {
    if (!state.userProfile) return;

    // 1. 綁定 Tab 切換
    const header = document.querySelector('.records-tabs-header');
    if (header && !header.dataset.bound) {
        header.addEventListener('click', (e) => {
            const tab = e.target.closest('.record-tab');
            if (tab) {
                header.querySelectorAll('.record-tab').forEach(t => t.classList.remove('active'));
                tab.classList.add('active');
                document.querySelectorAll('.records-content-pane').forEach(p => p.classList.remove('active'));
                document.getElementById(tab.dataset.target).classList.add('active');
            }
        });
        header.dataset.bound = 'true';
    }

    // 2. 載入預約紀錄
    const bookingContainer = document.getElementById('my-bookings-container');
    if (bookingContainer) {
        loadBookings('current', bookingContainer);
    }
    
    // 綁定過往紀錄切換
    const toggleBtn = document.getElementById('toggle-past-bookings-btn');
    if (toggleBtn && !toggleBtn.dataset.bound) {
        toggleBtn.addEventListener('click', () => {
            const pastContainer = document.getElementById('past-bookings-container');
            if (pastContainer.style.display === 'none') {
                pastContainer.style.display = 'block';
                loadBookings('past', document.getElementById('past-bookings-list'));
                toggleBtn.textContent = '隱藏過往紀錄';
            } else {
                pastContainer.style.display = 'none';
                toggleBtn.textContent = '查看過往紀錄';
            }
        });
        toggleBtn.dataset.bound = 'true';
    }

    // 3. 載入點數與儲值
    loadPoints();
    loadWallet();
}

async function loadBookings(filter, container) {
    container.innerHTML = '<p style="text-align:center;">載入中...</p>';
    try {
        const bookings = await api.getMyBookings(state.userProfile.userId, filter);
        if (bookings.length === 0) {
            container.innerHTML = '<p style="text-align:center; color:#999; padding:10px;">無紀錄</p>';
            return;
        }
        
        container.innerHTML = bookings.map(b => {
            let statusColor = b.status === 'confirmed' ? 'green' : 'red';
            // 簡單翻譯狀態
            let statusText = b.status_text || b.status;
            
            return `
            <div class="booking-info-card" onclick="openDetails(${b.booking_id})">
                <div style="display:flex; justify-content:space-between;">
                    <strong>${b.booking_date}</strong>
                    <span style="color:${statusColor}">${statusText}</span>
                </div>
                <p>${b.items[0]?.item_name}...</p>
                <p style="text-align:right;">$${b.total_amount}</p>
            </div>`;
        }).join('');
        
        window.openDetails = (id) => router.navigate('page-booking-details', { bookingId: id });

    } catch (e) {
        container.innerHTML = `<p style="color:red; text-align:center;">${e.message}</p>`;
    }
}

async function loadPoints() {
    const container = document.getElementById('my-points-list');
    if (!container) return;
    
    try {
        const records = await api.getMyPurchaseHistory(state.userProfile.userId);
        
        if (records.length === 0) {
            container.innerHTML = '<p style="text-align:center; color:#999; padding:20px;">目前沒有點數紀錄。</p>';
            return;
        }

        container.innerHTML = records.map(r => `
            <div class="record-item">
                <div>${r.reason} <small>${new Date(r.created_at).toLocaleDateString()}</small></div>
                <div class="${r.exp_added > 0 ? 'val-plus' : 'val-minus'}">${r.exp_added > 0 ? '+' : ''}${r.exp_added}</div>
            </div>
        `).join('');
    } catch(e) {
        container.innerHTML = '<p style="color:red; text-align:center;">載入失敗</p>';
    }
}

async function loadWallet() {
    const container = document.getElementById('my-wallet-list');
    if (!container) return;
    
    // 【關鍵修正】定義中文對照表
    const typeMap = {
        'admin_topup': '店家儲值',
        'admin_deduct': '店家扣款',
        'booking_payment': '預訂扣款'
    };

    try {
        const records = await api.getMyStoredValueHistory(state.userProfile.userId);
        
        if (records.length === 0) {
            container.innerHTML = '<p style="text-align:center; color:#999; padding:20px;">目前沒有儲值紀錄。</p>';
            return;
        }

        container.innerHTML = records.map(r => {
            // 轉換類型名稱
            const typeLabel = typeMap[r.type] || r.type;
            // 金額加號處理
            const amountDisplay = r.amount_changed > 0 ? `+${r.amount_changed}` : r.amount_changed;
            // 備註顯示
            const noteDisplay = r.notes ? ` <span style="font-size:0.8em; color:#aaa;">(${r.notes})</span>` : '';

            return `
            <div class="record-item">
                <div>${typeLabel}${noteDisplay} <small style="display:block; margin-top:2px;">${new Date(r.created_at).toLocaleDateString()}</small></div>
                <div class="${r.amount_changed > 0 ? 'val-plus' : 'val-minus'}">$${amountDisplay}</div>
            </div>
        `;
        }).join('');
    } catch(e) {
        container.innerHTML = '<p style="color:red; text-align:center;">載入失敗</p>';
    }
}