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
    container.innerHTML = '<p style="text-align:center; padding: 20px; color:#888;">載入中...</p>';
    try {
        const bookings = await api.getMyBookings(state.userProfile.userId, filter);
        
        if (bookings.length === 0) {
            container.innerHTML = '<p style="text-align:center; color:#999; padding:20px;">無相關紀錄</p>';
            return;
        }
        
        container.innerHTML = bookings.map(b => {
            // 1. 狀態顏色邏輯 (與後台一致的色系)
            let statusColor = '#888';
            let statusBg = '#f0f0f0';
            
            switch(b.status) {
                case 'confirmed': statusColor = '#28a745'; statusBg = '#e6f4ea'; break; // 綠 (已確認)
                case 'checked-in': statusColor = '#17a2b8'; statusBg = '#e0f7fa'; break; // 藍 (已報到/入住)
                case 'cancelled': statusColor = '#dc3545'; statusBg = '#ffebee'; break; // 紅 (已取消)
                case 'no-show': statusColor = '#ffc107'; statusBg = '#fff8e1'; break;   // 黃 (未到)
                default: break;
            }
            
            const statusText = b.status_text || b.status;

            // 2. 住宿期間 / 預約時間 格式化
            let period = b.booking_date;
            if (b.check_out_date && b.check_out_date !== b.booking_date) {
                // 民宿模式：顯示 入住 ~ 退房
                period = `${b.booking_date} ~ ${b.check_out_date}`; 
            } else if (b.time_slot) {
                // 工作室模式：顯示 日期 + 時段
                period = `${b.booking_date} ${b.time_slot}`;
            }

            // 3. 項目名稱摘要
            const itemsName = b.items && b.items.length > 0 
                ? b.items.map(i => `${i.item_name} x${i.quantity}`).join(', ') 
                : '無項目資訊';

            // 4. 新的卡片 HTML 結構
            // 加入 onclick 事件，並在右下角增加 "詳情 ›" 引導
            return `
            <div class="booking-info-card" onclick="openDetails(${b.booking_id})" style="cursor: pointer; position: relative; padding: 15px; border-left: 5px solid ${statusColor};">
                <div style="display: flex; justify-content: space-between; align-items: flex-start;">
                    
                    <div style="flex: 1; padding-right: 10px;">
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
                    
                    <div style="text-align: right; display: flex; flex-direction: column; align-items: flex-end; justify-content: space-between; min-height: 70px;">
                        <span style="color: ${statusColor}; background: ${statusBg}; padding: 4px 8px; border-radius: 6px; font-size: 0.85rem; font-weight: bold; white-space: nowrap;">
                            ${statusText}
                        </span>
                        
                        <div style="color: var(--color-secondary); font-size: 0.9rem; display: flex; align-items: center; margin-top: 15px;">
                            詳情 <span style="font-size: 1.2rem; margin-left: 3px; font-weight: bold;">›</span>
                        </div>
                    </div>
                </div>
            </div>`;
        }).join('');
        
        // 確保全域函式存在 (如果是透過 onclick="openDetails..." 呼叫)
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