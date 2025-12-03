// public/owner/modules/booking.js
import { api } from '../api.js';
import { state, setState } from '../state.js';
import { ui } from '../ui.js';
import { openDetailsModal } from './detailsModal.js';

export async function init() {
    // 綁定視圖切換按鈕
    const viewSwitcher = document.querySelector('#tab-content-booking .view-switcher');
    if (viewSwitcher && !viewSwitcher.dataset.bound) {
        viewSwitcher.addEventListener('click', (e) => {
            const btn = e.target.closest('.view-switch-btn');
            if (btn) switchBookingView(btn.dataset.view);
        });
        viewSwitcher.dataset.bound = 'true';
    }

    // 綁定篩選按鈕
    const filterBtn = document.getElementById('order-filter-apply-btn');
    if (filterBtn && !filterBtn.dataset.bound) {
        filterBtn.addEventListener('click', loadOrderList);
        filterBtn.dataset.bound = 'true';
    }

    // 綁定卡片點擊 (日曆 & 列表)
    const dailyContainer = document.getElementById('daily-cards-container');
    const listContainer = document.getElementById('order-list-content');
    
    [dailyContainer, listContainer].forEach(container => {
        if (container && !container.dataset.bound) {
            container.addEventListener('click', (e) => {
                const item = e.target.closest('.daily-card, .order-list-item');
                if (item && item.dataset.id) {
                    openDetailsModal(item.dataset.type, item.dataset.id);
                }
            });
            container.dataset.bound = 'true';
        }
    });

    // 初始化預設視圖
    if (!state.flatpickrInstance) {
        initializeCalendar();
    } else {
        // 如果已經初始化過，就重新載入當前選取日期的資料
        loadDailyCards(state.currentSelectedDate);
    }
}

// 供外部呼叫的重整函式
export function reload() {
    if (document.getElementById('booking-view-calendar').classList.contains('active')) {
        loadDailyCards(state.currentSelectedDate);
    } else {
        loadOrderList();
    }
}

function switchBookingView(viewName) {
    document.querySelectorAll('.view-switch-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.view === viewName);
    });

    document.getElementById('booking-view-calendar').classList.toggle('active', viewName === 'calendar');
    document.getElementById('booking-view-list').classList.toggle('active', viewName === 'list');

    if (viewName === 'list') {
        loadOrderList();
    }
}

function initializeCalendar() {
    const calendarEl = document.getElementById('calendar-placeholder');
    if (!calendarEl) return;
    
    calendarEl.innerHTML = '';
    
    state.flatpickrInstance = flatpickr(calendarEl, {
        locale: "zh_tw",
        inline: true,
        onChange: function(selectedDates) {
            if (selectedDates.length > 0) {
                state.currentSelectedDate = selectedDates[0];
                updateDateDisplay(state.currentSelectedDate);
                loadDailyCards(state.currentSelectedDate);
            }
        },
        onReady: function(selectedDates) {
             const today = new Date();
             state.currentSelectedDate = today;
             updateDateDisplay(today);
             loadDailyCards(today);
        }
    });
}

function updateDateDisplay(date) {
    const el = document.getElementById('selected-date-display');
    if (el) el.textContent = date.toLocaleDateString('zh-TW');
}

async function loadDailyCards(date) {
    const container = document.getElementById('daily-cards-container');
    if (!container) return;
    
    container.innerHTML = '<p>正在載入...</p>';
    const dateStr = date.toISOString().split('T')[0];
    
    let apiUrl = '';
    if (state.currentTemplate === 'ecommerce_template') {
         apiUrl = `/api/admin/get-orders?date=${dateStr}`;
    } else {
         apiUrl = `/api/get-bookings?date=${dateStr}`;
    }

    try {
        const items = await api.fetchData(apiUrl); 
        if (items.length === 0) {
            container.innerHTML = '<p>本日無事項。</p>';
            return;
        }
        
        container.innerHTML = items.map(item => {
            let cardHtml = '', type = '', id = null, statusClass = '';
            
            if (state.currentTemplate === 'ecommerce_template') {
                type = 'order';
                id = item.order_id;
                cardHtml = `
                     <p><strong>訂單 #${String(id).padStart(5, '0')} - ${item.customer_name}</strong></p>
                     <small>狀態: ${ui.translateStatus(item.status)}, 金額: $${item.total_amount || 0}</small>
                 `;
            } else {
                 type = 'booking';
                 id = item.booking_id;
                 if (item.status === 'checked-in') statusClass = 'status-checked-in';
                 if (item.status === 'cancelled') statusClass = 'status-cancelled';
                 
                 const itemsSummary = item.items?.map(i => `${i.item_name} x${i.quantity}`).join(', ') || '無項目';
                 cardHtml = `
                     <p><strong>${item.time_slot || ''} - ${item.contact_name}</strong> (${item.num_of_people}人)</p>
                     <small>${itemsSummary} (${ui.translateStatus(item.status)})</small>
                 `;
            }
            return `<div class="daily-card ${statusClass}" data-id="${id}" data-type="${type}">${cardHtml}</div>`;
        }).join('');
    } catch (error) {
        container.innerHTML = `<p style="color:red">載入失敗</p>`;
    }
}

async function loadOrderList() {
        const container = orderListContent; // 使用上方已宣告的變數
        container.innerHTML = '<p style="text-align:center; padding:20px; color:#888;">正在載入列表...</p>';
        
        let apiUrl = '';
        const search = document.getElementById('order-search-input').value;
        const dateType = document.getElementById('order-date-filter-type').value;
        let startDate = document.getElementById('order-date-filter-start').value;
        let endDate = document.getElementById('order-date-filter-end').value;
        const status = document.getElementById('order-status-filter').value;

        // --- [新增] 日期預設值邏輯 ---
        if (!startDate && !endDate) {
            const today = new Date();
            const nextMonth = new Date();
            nextMonth.setMonth(today.getMonth() + 1);
            
            startDate = today.toISOString().split('T')[0];
            endDate = nextMonth.toISOString().split('T')[0];
            
            // 回填到輸入框，讓使用者知道目前的篩選範圍
            document.getElementById('order-date-filter-start').value = startDate;
            document.getElementById('order-date-filter-end').value = endDate;
        }
        // ---------------------------

        const params = new URLSearchParams();
        if (search) params.append('search', search);
        if (startDate) params.append(`${dateType === 'booking_date' ? 'startDate' : 'created_start'}`, startDate);
        if (endDate) params.append(`${dateType === 'booking_date' ? 'endDate' : 'created_end'}`, endDate);
        if (status) params.append('status', status);

        if (currentTemplate === 'studio_template' || currentTemplate === 'guesthouse_template') {
            apiUrl = `/api/get-bookings?${params.toString()}`;
        } else if (currentTemplate === 'ecommerce_template') {
             apiUrl = `/api/admin/get-orders?${params.toString()}`;
        } else {
             container.innerHTML = '<p>此樣板無訂單列表。</p>';
             return;
        }

        try {
            const items = await fetchData(apiUrl);
            if (items.length === 0) {
                container.innerHTML = '<p style="text-align:center; padding:20px; color:#888;">在此期間找不到符合條件的項目。</p>';
                return;
            }
            
            container.innerHTML = items.map(item => {
                 let type = '', id = null;
                 let title = '', subtitle = '', dateInfo = '';
                 
                 // 決定顏色與文字
                 let statusColor = '#888';
                 let statusBg = 'transparent';
                 if (item.status === 'confirmed') { statusColor = '#28a745'; statusBg = '#e6f4ea'; } // 綠色
                 else if (item.status === 'cancelled') { statusColor = '#dc3545'; statusBg = '#ffebee'; } // 紅色
                 else if (item.status === 'no-show') { statusColor = '#ffc107'; statusBg = '#fff8e1'; } // 黃色
                 else if (item.status === 'checked-in') { statusColor = '#17a2b8'; statusBg = '#e0f7fa'; } // 藍色

                 if (currentTemplate === 'studio_template' || currentTemplate === 'guesthouse_template') {
                     type = 'booking';
                     id = item.booking_id;
                     // 標題：日期 + 時段
                     title = `${item.booking_date} ${item.time_slot || ''}`;
                     // 副標題：姓名 (人數)
                     subtitle = `${item.contact_name} <span style="color:#888; font-size:0.9em;">(${item.num_of_people}人)</span>`;
                     // 底部：建立日期
                     dateInfo = `建立: ${new Date(item.created_at).toLocaleDateString()}`;
                 } else {
                     type = 'order';
                     id = item.order_id;
                     title = `訂單 #${String(id).padStart(5, '0')}`;
                     subtitle = `${item.customer_name} <span style="color:#888;">($${item.total_amount})</span>`;
                     dateInfo = `建立: ${new Date(item.created_at).toLocaleDateString()}`;
                 }

                // --- 新的卡片 HTML 結構 (左右佈局) ---
                return `
                <div class="order-list-item" data-id="${id}" data-type="${type}">
                    <div class="order-card-layout">
                        <div class="order-card-left">
                            <div style="font-weight: 900; font-size: 1.05rem; color: var(--color-text-primary); margin-bottom: 4px;">
                                ${title}
                            </div>
                            <div style="font-size: 1rem; color: var(--color-text-primary);">
                                ${subtitle}
                            </div>
                            <div style="font-size: 0.8rem; color: #999; margin-top: 8px;">
                                ${dateInfo}
                            </div>
                        </div>
                        <div class="order-card-right">
                            <span class="status-badge-text" style="color: ${statusColor}; background: ${statusBg};">
                                ${translateStatus(item.status)}
                            </span>
                        </div>
                    </div>
                </div>`;
            }).join('');
        } catch (error) {
            container.innerHTML = `<p style="color:red; text-align:center;">載入失敗: ${error.message}</p>`;
        }
    }