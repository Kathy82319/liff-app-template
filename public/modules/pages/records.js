// public/modules/pages/records.js
import { api } from '../api.js';
import { state } from '../state.js';
import { router } from '../router.js';

export async function init() {
    if (!state.userProfile) return;

    // 1. 綁定 Tab 切換 (包含資料重新載入邏輯)
    const header = document.querySelector('.records-tabs-header');
    if (header && !header.dataset.bound) {
        header.addEventListener('click', (e) => {
            const tab = e.target.closest('.record-tab');
            if (tab) {
                // UI 切換
                header.querySelectorAll('.record-tab').forEach(t => t.classList.remove('active'));
                tab.classList.add('active');
                
                document.querySelectorAll('.records-content-pane').forEach(p => p.classList.remove('active'));
                const targetId = tab.dataset.target;
                document.getElementById(targetId).classList.add('active');

                // 資料載入 (修正：切換時才載入，確保資料最新)
                loadDataForTab(targetId);
            }
        });
        header.dataset.bound = 'true';
    }

    // 2. 綁定過往紀錄切換按鈕
    const toggleBtn = document.getElementById('toggle-past-bookings-btn');
    if (toggleBtn && !toggleBtn.dataset.bound) {
        toggleBtn.addEventListener('click', () => {
            const pastContainer = document.getElementById('past-bookings-container');
            const isHidden = pastContainer.style.display === 'none';
            pastContainer.style.display = isHidden ? 'block' : 'none';
            toggleBtn.textContent = isHidden ? '隱藏過往紀錄' : '查看過往/已取消紀錄';
            
            if (isHidden) {
                // 展開時才載入過往資料
                loadBookings('past', document.getElementById('past-bookings-list'));
            }
        });
        toggleBtn.dataset.bound = 'true';
    }

    // 3. 初始化：預設載入第一個分頁 (預約紀錄)
    // 這行確保進入頁面時一定會執行一次查詢
    loadDataForTab('tab-bookings');
}

// 根據 Tab ID 決定要載入什麼資料 (Lazy Load)
function loadDataForTab(tabId) {
    if (tabId === 'tab-bookings') {
        const container = document.getElementById('my-bookings-container');
        if (container) loadBookings('current', container);
    } else if (tabId === 'tab-points') {
        loadPoints();
    } else if (tabId === 'tab-wallet') {
        loadWallet();
    }
}

async function loadBookings(filter, container) {
    container.innerHTML = '<p style="text-align:center; padding: 20px; color:#888;">載入中...</p>';
    try {
        const bookings = await api.getMyBookings(state.userProfile.userId, filter);
        
        if (bookings.length === 0) {
            container.innerHTML = '<p style="text-align:center; color:#999; padding:20px;">目前無相關紀錄</p>';
            return;
        }
        
        // 提示文字 (只在顯示"進行中"預約且有資料時顯示一次)
        let hintHtml = '';
        if (filter === 'current') {
            hintHtml = `<div style="font-size: 0.85rem; color: #666; margin-bottom: 10px; text-align: center; background-color: #fffbe6; padding: 5px; border-radius: 8px;">💡 點擊卡片可查看詳細資訊</div>`;
        }

        const listHtml = bookings.map(b => {
            // 1. 狀態顏色邏輯
            let statusColor = '#888';
            let statusBg = '#f0f0f0';
            let statusText = b.status_text || b.status;
            
            switch(b.status) {
                case 'confirmed': statusColor = '#28a745'; statusBg = '#e6f4ea'; statusText = '已確認'; break;
                case 'checked-in': statusColor = '#17a2b8'; statusBg = '#e0f7fa'; statusText = '已入住'; break;
                case 'cancelled': statusColor = '#dc3545'; statusBg = '#ffebee'; statusText = '已取消'; break;
                case 'no-show': statusColor = '#ffc107'; statusBg = '#fff8e1'; statusText = '未到'; break;
            }

            // 2. 住宿期間 / 預約時間
            let period = b.booking_date;
            if (b.check_out_date && b.check_out_date !== b.booking_date) {
                period = `${b.booking_date} ~ ${b.check_out_date}`; 
            } else if (b.time_slot) {
                period = `${b.booking_date} ${b.time_slot}`;
            }

            // 3. 項目摘要
            const itemsName = b.items && b.items.length > 0 
                ? b.items.map(i => `${i.item_name} x${i.quantity}`).join(', ') 
                : '無項目資訊';

            // 4. 卡片 HTML (加入點擊引導)
            return `
            <div class="booking-info-card" onclick="openDetails(${b.booking_id})" style="cursor: pointer; position: relative; padding: 15px; border-left: 5px solid ${statusColor}; margin-bottom: 15px; box-shadow: 0 2px 8px rgba(0,0,0,0.05);">
                <div style="display: flex; justify-content: space-between; align-items: stretch;">
                    
                    <div style="flex: 1; padding-right: 10px; display: flex; flex-direction: column; justify-content: center;">
                        <div style="font-weight: 900; color: var(--color-primary); font-size: 1.05rem; margin-bottom: 6px;">
                            ${period}
                        </div>
                        <div style="font-size: 1rem; color: var(--color-text-primary); margin-bottom: 6px; font-weight: 500; line-height: 1.4;">
                            ${itemsName}
                        </div>
                        <div style="font-size: 0.9rem; color: #999;">
                            總金額：$${b.total_amount}
                        </div>
                    </div>
                    
                    <div style="text-align: right; display: flex; flex-direction: column; justify-content: space-between; align-items: flex-end; min-width: 80px;">
                        <span style="color: ${statusColor}; background: ${statusBg}; padding: 4px 8px; border-radius: 6px; font-size: 0.85rem; font-weight: bold; white-space: nowrap; display: inline-block;">
                            ${statusText}
                        </span>
                        
                        <div style="color: var(--color-secondary); font-size: 0.9rem; display: flex; align-items: center; margin-top: auto; padding-top: 10px;">
                            詳情 <span style="font-size: 1.2rem; margin-left: 3px; font-weight: bold;">›</span>
                        </div>
                    </div>
                </div>
            </div>`;
        }).join('');
        
        container.innerHTML = hintHtml + listHtml;
        
        // 確保全域函式存在
        window.openDetails = (id) => router.navigate('page-booking-details', { bookingId: id });

    } catch (e) {
        container.innerHTML = `<p style="color:red; text-align:center;">${e.message}</p>`;
    }
}

async function loadPoints() {
    const container = document.getElementById('my-points-list');
    if (!container) return;
    container.innerHTML = '<p style="text-align:center;">載入中...</p>';
    
    try {
        const records = await api.getMyPurchaseHistory(state.userProfile.userId);
        if (records.length === 0) {
            container.innerHTML = '<p style="text-align:center; color:#999; padding:20px;">目前沒有點數紀錄。</p>';
            return;
        }
        container.innerHTML = records.map(r => `
            <div class="record-item">
                <div>
                    <div class="record-main">${r.reason}</div>
                    <div class="record-sub">${new Date(r.created_at).toLocaleDateString()}</div>
                </div>
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
    container.innerHTML = '<p style="text-align:center;">載入中...</p>';
    
    const typeMap = { 'admin_topup': '店家儲值', 'admin_deduct': '店家扣款', 'booking_payment': '預訂扣款' };

    try {
        const records = await api.getMyStoredValueHistory(state.userProfile.userId);
        if (records.length === 0) {
            container.innerHTML = '<p style="text-align:center; color:#999; padding:20px;">目前沒有儲值紀錄。</p>';
            return;
        }
        container.innerHTML = records.map(r => {
            const typeLabel = typeMap[r.type] || r.type;
            const amountDisplay = r.amount_changed > 0 ? `+${r.amount_changed}` : r.amount_changed;
            const noteDisplay = r.notes ? ` <span style="font-size:0.8em; color:#aaa;">(${r.notes})</span>` : '';

            return `
            <div class="record-item">
                <div>
                    <div class="record-main">${typeLabel}${noteDisplay}</div>
                    <div class="record-sub">${new Date(r.created_at).toLocaleDateString()}</div>
                </div>
                <div class="${r.amount_changed > 0 ? 'val-plus' : 'val-minus'}">$${amountDisplay}</div>
            </div>`;
        }).join('');
    } catch(e) {
        container.innerHTML = '<p style="color:red; text-align:center;">載入失敗</p>';
    }
}