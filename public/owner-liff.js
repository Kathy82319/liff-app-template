// public/owner-liff.js
// 【v6.0 - 加入返回鍵修正、快速預約、簡易控房功能】

document.addEventListener('DOMContentLoaded', () => {
    const myLiffId = "2008296713-vPAkV7xr";
    let userId = null;
    let currentTemplate = null;
    let flatpickrInstance = null;
    let currentSelectedDate = new Date();
    let allMessageDrafts = [];
    let allProducts = []; // 【新增】快取所有產品
    let currentHistoryState = { modal: null }; // 【新增】用於管理返回鍵

    // --- DOM 元素快取 ---
    const loadingView = document.getElementById('loading-view');
    const unauthorizedView = document.getElementById('unauthorized-view');
    const mainView = document.getElementById('main-view');
    const appHeaderTitle = document.querySelector('#app-header h1');
    const tabBar = document.getElementById('owner-tab-bar');
    const tabContents = document.querySelectorAll('.tab-content');
    const activityListContent = document.getElementById('activity-list-content');
    const calendarPlaceholder = document.getElementById('calendar-placeholder');
    const selectedDateDisplay = document.getElementById('selected-date-display');
    const dailyCardsContainer = document.getElementById('daily-cards-container');
    const orderListContent = document.getElementById('order-list-content');
    const customerSearchResults = document.getElementById('customer-search-results');
    
    // --- 詳情 Modal ---
    const detailsModal = document.getElementById('details-modal');
    const detailsModalTitle = document.getElementById('details-modal-title');
    const detailsModalBody = document.getElementById('details-modal-body');
    const detailsModalActions = document.getElementById('details-modal-actions');
    const detailsModalCloseBtn = detailsModal.querySelector('.modal-close');

    // --- 訊息 Modal ---
    const sendMessageModal = document.getElementById('send-message-modal');
    const sendMessageModalTitle = document.getElementById('send-message-modal-title');
    const sendMessageModalCloseBtn = sendMessageModal.querySelector('.modal-close');
    const messageDraftSelect = document.getElementById('message-draft-select');
    const directMessageContent = document.getElementById('direct-message-content');
    let sendMessageSubmitBtn = document.getElementById('send-message-submit-btn');

    // --- 【新增】快速預約 Modal ---
    const quickActionBtn = document.getElementById('quick-action-btn');
    const quickBookingModal = document.getElementById('quick-booking-modal');
    const quickBookingForm = document.getElementById('quick-booking-form');
    const qbCustomerSearchInput = document.getElementById('qb-customer-search-input');
    const qbCustomerSearchResults = document.getElementById('qb-customer-search-results');
    const qbCustomerSelectedView = document.getElementById('qb-customer-selected-view');
    const qbCustomerSelectedId = document.getElementById('qb-customer-selected-id');
    const qbCustomerSelectedName = document.getElementById('qb-customer-selected-name');
    const qbCustomerChangeBtn = document.getElementById('qb-customer-change-btn');
    const qbContactPhone = document.getElementById('qb-contact-phone');
    const qbBookingItemSelect = document.getElementById('qb-booking-item');
    let qbDatePicker = null;

    // --- 【新增】簡易控房 Modal ---
    const roomControlModal = document.getElementById('room-control-modal');
    const roomControlForm = document.getElementById('room-control-form');
    const rcRoomSelect = document.getElementById('rc-room-select');
    const rcDateRangeInput = document.getElementById('rc-date-range');
    let rcDatePicker = null;

    // --- 樣板特定元素 ---
    const calendarTabButton = document.querySelector('[data-tab="calendar"]');
    const manageRoomsBtn = document.getElementById('manage-rooms-btn');
    const ecommerceManageBtns = document.querySelector('.ecommerce-manage-buttons');

    // --- API 輔助函式 ---
    async function fetchData(url, options = {}) {
        try {
            const response = await fetch(url, options);
            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`API 請求失敗 (${url.split('/').pop()}), 狀態: ${response.status}, 回應: ${errorText}`);
            }
            if (response.status === 204) return { success: true };
            const text = await response.text();
            try {
                return JSON.parse(text);
            } catch (e) {
                 console.warn(`API ${url.split('/').pop()} 回應非 JSON:`, text.substring(0, 100));
                 const match = text.match(/<pre>(.*?)<\/pre>/i);
                 const extractedError = match ? match[1] : `非預期的回應格式 (非 JSON)`;
                 throw new Error(extractedError);
            }
        } catch (error) {
            console.error(error);
            alert(`[fetchData Error] ${error.message}\n\nURL: ${url.split('/').pop()}`);
            displayInlineError(error.message, getCurrentVisibleTabContentId());
            throw error;
        }
    }

    // --- UI 輔助函式 ---
    function displayInlineError(message, containerId = 'activity-list-content') {
        const container = document.getElementById(containerId);
        if (container && container.id !== 'loading-view') { 
            container.innerHTML = `<p style="color: var(--color-danger); text-align: center;">${message}</p>`;
        } else {
             console.error(`Inline error display failed for container '${containerId}'. Error: ${message}`);
        }
    }

    function getCurrentVisibleTabContentId() {
        const activeTab = document.querySelector('.tab-content.active');
        return activeTab ? activeTab.id : 'tab-content-activity';
    }

    // --- 【修改】Modal 相關函式 (加入歷史狀態管理) ---
    function showModal(title, bodyHtml, actionsHtml = '') {
        detailsModalTitle.textContent = title;
        detailsModalBody.innerHTML = bodyHtml;
        detailsModalActions.innerHTML = actionsHtml;
        detailsModal.style.display = 'flex';
        updateHistoryState('details', 'open'); // 【新增】
    }

    function hideModal() {
        // 【修改】不直接隱藏，而是觸發返回
        if (currentHistoryState.modal) {
            history.back();
        } else {
            // 備用方案，以防 history 狀態不對
            detailsModal.style.display = 'none';
        }
    }

    function hideModalProgrammatically() {
        // 供 PopState 事件呼叫，直接關閉 Modal 不再動 History
        detailsModal.style.display = 'none';
        sendMessageModal.style.display = 'none';
        quickBookingModal.style.display = 'none';
        roomControlModal.style.display = 'none';
        
        currentHistoryState = { modal: null };
    }

    // --- 【新增】歷史狀態管理 (處理返回鍵) ---
    function updateHistoryState(modalName, action = 'open') {
        if (action === 'open') {
            const newState = { modal: modalName };
            history.pushState(newState, '');
            currentHistoryState = newState;
        } else { // 'close'
            if (currentHistoryState.modal === modalName) {
                 history.back();
            }
        }
    }

    function handlePopState(event) {
        // 當使用者點擊返回鍵時，popstate 會被觸發
        // event.state 會是 "我們即將返回到" 的狀態
        const targetState = event.state || { modal: null };
        currentHistoryState = targetState;
        
        // 我們只需要關閉所有當前開啟的 Modal
        hideModalProgrammatically();
    }

    // --- Tab 切換邏輯 (保持不變) ---
    function switchTab(tabId) {
        tabBar.querySelectorAll('.tab-button').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.tab === tabId);
        });
        tabContents.forEach(content => {
            content.classList.toggle('active', content.id === `tab-content-${tabId}`);
        });

        switch (tabId) {
            case 'activity': loadActivities(); break;
            case 'calendar':
                if (!flatpickrInstance && calendarTabButton.style.display !== 'none') {
                    initializeCalendar();
                } else if (calendarTabButton.style.display !== 'none') {
                     loadDailyCards(currentSelectedDate);
                }
                break;
            case 'order': loadOrderList(); break;
             case 'customer':
                customerSearchResults.innerHTML = '';
                document.getElementById('customer-search-input').value = '';
                break;
        }
    }

    // --- 主程式 (【已修改】) ---
    async function main() {
        try {
            await liff.init({ liffId: myLiffId });
            if (!liff.isLoggedIn()) {
                liff.login({ redirectUri: window.location.href });
                return;
            }
            const profile = await liff.getProfile();
            userId = profile.userId;

            // 【修改】同時獲取 config 和 products
            const [result, productsResponse] = await Promise.all([
                fetchData('/api/admin/verify-liff-user', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ userId: userId })
                }),
                fetchData('/api/get-products') // 【新增】獲取產品
            ]);
            
            allProducts = productsResponse || []; // 【新增】儲存產品
            console.log(`[Main] 載入了 ${allProducts.length} 個產品項目。`);

            if (result.success && result.isAdmin) {
                currentTemplate = result.activeTemplate;
                // 【新增】將 Config 存到 window，供簡易控房按鈕使用
                window.CONFIG = { 
                    LOGIC: { 
                        ACTIVE_INDUSTRY_TEMPLATE: currentTemplate 
                    },
                    FEATURES: {
                        // 這裡需要從後台 API 獲取，但 verify-liff-user 沒回傳
                        // 先暫時 hardcode，理想情況是 verify-liff-user 回傳
                        // 此處假設我們在步驟 5 中儲存的設定能被 /api/get-app-config 讀取
                        // 但 owner-liff.js 沒有呼叫 /api/get-app-config
                        // **【緊急修正】** 我們在 verify-liff-user 成功後，*主動* 呼叫 get-app-config
                    }
                };
                
                // 【新增】主動呼叫 get-app-config
                try {
                    const appConfig = await fetchData('/api/get-app-config');
                    if(appConfig && appConfig.LOGIC) {
                        window.CONFIG = appConfig; // 覆蓋為完整的 Config
                        console.log("[Main] 成功獲取完整 App Config");
                    } else {
                         throw new Error("get-app-config 回傳格式不正確");
                    }
                } catch (configError) {
                    console.error("[Main] 獲取 App Config 失敗:", configError);
                    // 即使失敗，也繼續，但控房按鈕可能不顯示
                }


                loadingView.style.display = 'none';
                mainView.style.display = 'block';
                initializeAppUI(currentTemplate); // 調整 UI 顯示
                setupEventListeners();          // 綁定事件
                switchTab('activity');          // 顯示預設 Tab 並載入數據
            } else {
                loadingView.style.display = 'none';
                unauthorizedView.style.display = 'block';
            }
        } catch (error) {
             alert(`[Main Error] ${error.message}\n\nStack: ${error.stack}`);
             console.error("Main function catch block:", error);
             if (loadingView && unauthorizedView) {
                loadingView.style.display = 'none';
                unauthorizedView.style.display = 'block';
                unauthorizedView.innerHTML = `
                    <h2 style="color: var(--color-danger);">驗證失敗</h2>
                    <p>無法初始化管理員介面。請確認您的帳號具備管理員權限，或檢查後台日誌。</p>
                    <p style="font-size: 0.8em; color: var(--color-text-secondary); white-space: pre-wrap;">詳細錯誤: ${error.message || '未知錯誤'}</p>
                `;
             }
        }
    }

    // --- 初始化 App UI (【已修改】) ---
    function initializeAppUI(template) {
        appHeaderTitle.textContent = "商家管理面板"; 

        if (template === 'ecommerce_template') {
            calendarTabButton.style.display = 'none';
            manageRoomsBtn.style.display = 'none';
            ecommerceManageBtns.style.display = 'flex';
        } else {
            calendarTabButton.style.display = '';
            ecommerceManageBtns.style.display = 'none';
            
            // 【修改】根據 window.CONFIG 檢查
            const features = window.CONFIG?.FEATURES || {};
            if (template === 'guesthouse_template' && features.OWNER_LIFF_ENABLE_ROOM_CONTROL === true) {
                manageRoomsBtn.style.display = 'block'; // 民宿且功能開啟
                console.log("[initializeAppUI] 顯示簡易控房按鈕");
            } else {
                manageRoomsBtn.style.display = 'none'; // 其他
                console.log(`[initializeAppUI] 隱藏簡易控房按鈕 (Template: ${template}, Feature: ${features.OWNER_LIFF_ENABLE_ROOM_CONTROL})`);
            }
        }
    }

    // --- 事件綁定 (【已修改】) ---
    function setupEventListeners() {
        // 【新增】綁定返回鍵
        window.addEventListener('popstate', handlePopState);

        tabBar.addEventListener('click', (e) => {
            const button = e.target.closest('.tab-button');
            if (button && button.dataset.tab) {
                switchTab(button.dataset.tab);
            }
        });

        detailsModalCloseBtn.addEventListener('click', () => {
             updateHistoryState('details', 'close'); // 【修改】
        });

        sendMessageModalCloseBtn.addEventListener('click', () => {
            updateHistoryState('send-message', 'close'); // 【修改】
        });
        
        // 【新增】快速預約 Modal 關閉
        quickBookingModal.querySelector('.modal-close').addEventListener('click', () => {
            updateHistoryState('quick-booking', 'close'); // 【修改】
        });

        // 【新增】簡易控房 Modal 關閉
        roomControlModal.querySelector('.modal-close').addEventListener('click', () => {
            updateHistoryState('room-control', 'close'); // 【修改】
        });

        messageDraftSelect.addEventListener('change', (e) => {
            if (e.target.value) {
                directMessageContent.value = e.target.value;
            }
        });

        activityListContent.addEventListener('click', (e) => {
            const card = e.target.closest('.activity-card');
            if (card && card.dataset.id) {
                 const type = card.dataset.type;
                 const id = card.dataset.id;
                 openDetailsModal(type, id);
            }
        });
         dailyCardsContainer.addEventListener('click', (e) => {
            const card = e.target.closest('.daily-card');
            if (card && card.dataset.id) {
                 const type = card.dataset.type;
                 const id = card.dataset.id;
                 openDetailsModal(type, id);
            }
        });
        orderListContent.addEventListener('click', (e) => {
            const item = e.target.closest('.order-list-item');
            if (item && item.dataset.id) {
                 const type = item.dataset.type;
                 const id = item.dataset.id;
                 openDetailsModal(type, id);
            }
        });

        document.getElementById('order-filter-apply-btn')?.addEventListener('click', loadOrderList);

         document.getElementById('customer-search-btn')?.addEventListener('click', searchCustomers);
         customerSearchResults.addEventListener('click', (e) => {
             const item = e.target.closest('.customer-result-item');
             if(item && item.dataset.userId){
                 openCustomerDetailsModal(item.dataset.userId);
             }
         });

        document.getElementById('go-to-admin-panel-btn')?.addEventListener('click', generateAndOpenAdminLink);

        // --- 【新增】綁定新按鈕和表單 ---
        
        // 1. 綁定「+」浮動按鈕
        quickActionBtn.addEventListener('click', openQuickBookingModal);

        // 2. 綁定「管理房量」按鈕 (民宿)
        manageRoomsBtn.addEventListener('click', openRoomControlModal);

        // 3. 綁定「快速預約」表單
        qbCustomerSearchInput.addEventListener('input', handleCustomerSearchInput);
        qbCustomerSearchResults.addEventListener('click', handleCustomerSelect);
        qbCustomerChangeBtn.addEventListener('click', resetCustomerSearch);
        quickBookingForm.addEventListener('submit', handleQuickBookingSubmit);
        
        // 4. 綁定「簡易控房」表單
        roomControlForm.addEventListener('submit', (e) => {
            e.preventDefault();
            const status = e.submitter.dataset.status; // 獲取是 "Open" 還是 "Closed"
            handleRoomControlSubmit(status);
        });
    }

    // --- 數據加載與渲染 (保持不變) ---
    async function loadActivities() {
        activityListContent.innerHTML = '<p>正在載入動態...</p>';
        try {
            const activities = await fetchData('/api/admin/activities');
            if (activities.length === 0) {
                activityListContent.innerHTML = '<p>目前沒有最新動態。</p>';
                return;
            }
            activityListContent.innerHTML = activities.map(act => {
                 let statusClass = '', relatedId = null, type = '';
                 if (act.link) {
                     const parts = act.link.split('-');
                     if (parts.length === 2) {
                          type = parts[0].substring(1);
                          relatedId = parts[1];
                     }
                 }
                 if (type === 'bookings' || type === 'orders') {
                    if (act.message.includes('取消')) { statusClass = 'status-cancelled'; }
                 } else if (type === 'users') {
                     statusClass = 'status-new-user';
                 }
                 return `
                    <div class="activity-card ${statusClass}" data-id="${relatedId || act.activity_id}" data-type="${type || 'activity'}">
                        <p>${act.message}</p>
                        <small>${new Date(act.created_at).toLocaleString()}</small>
                    </div>
                 `;
            }).join('');
        } catch (error) {}
    }
    async function initializeCalendar() {
        calendarPlaceholder.innerHTML = '';
        let eventsMarkDates = [];
        try {
            // const eventDatesResult = await fetchData('/api/admin/get-event-dates?month=...');
            // eventsMarkDates = eventDatesResult.dates;
        } catch (error) { console.error("無法載入日曆事件標記:", error); }
        flatpickrInstance = flatpickr(calendarPlaceholder, {
            locale: "zh_tw",
            inline: true,
            onChange: function(selectedDates, dateStr, instance) {
                if (selectedDates.length > 0) {
                    currentSelectedDate = selectedDates[0];
                    const formattedDate = currentSelectedDate.toLocaleDateString('sv-SE');
                    selectedDateDisplay.textContent = formattedDate;
                    loadDailyCards(currentSelectedDate);
                }
            },
            onReady: function(selectedDates, dateStr, instance) {
                 const today = new Date();
                 currentSelectedDate = today;
                 selectedDateDisplay.textContent = today.toLocaleDateString('sv-SE');
                 loadDailyCards(today);
                 markCalendarDates(instance, eventsMarkDates);
            },
             onMonthChange: async function(selectedDates, dateStr, instance) {
                 // const newMonthEvents = await fetchData('/api/admin/get-event-dates?month=...');
                 // markCalendarDates(instance, newMonthEvents.dates);
             }
        });
    }
    function markCalendarDates(calendarInstance, datesToMark) {
        if (!calendarInstance || !datesToMark || datesToMark.length === 0) return;
        calendarInstance.calendarContainer.querySelectorAll('.has-event').forEach(day => day.classList.remove('has-event'));
        datesToMark.forEach(dateStr => {
            const dayElement = calendarInstance.calendarContainer.querySelector(`.flatpickr-day[aria-label="${flatpickr.formatDate(new Date(dateStr + 'T00:00:00'), 'F j, Y')}"]`);
            if (dayElement) { dayElement.classList.add('has-event'); }
        });
    }
    async function loadDailyCards(date) {
        dailyCardsContainer.innerHTML = '<p>正在載入今日事項...</p>';
        const dateStr = date.toISOString().split('T')[0];
        let apiUrl = '';
        if (currentTemplate === 'studio_template' || currentTemplate === 'guesthouse_template') {
            apiUrl = `/api/get-bookings?status=specific_date&date=${dateStr}`;
        } else if (currentTemplate === 'ecommerce_template') {
             apiUrl = `/api/admin/get-orders?status=specific_date&date=${dateStr}`;
        } else {
             dailyCardsContainer.innerHTML = '<p>此樣板無日曆檢視。</p>';
             return;
        }
        try {
            const items = await fetchData(apiUrl); 
            if (items.length === 0) {
                dailyCardsContainer.innerHTML = '<p>本日無事項。</p>';
                return;
            }
            dailyCardsContainer.innerHTML = items.map(item => {
                let cardHtml = '', type = '', id = null, statusClass = '';
                if (currentTemplate === 'studio_template' || currentTemplate === 'guesthouse_template') {
                     type = 'booking';
                     id = item.booking_id;
                     if (item.status === 'checked-in') statusClass = 'status-checked-in';
                     if (item.status === 'cancelled') statusClass = 'status-cancelled';
                     const itemsSummary = item.items?.map(i => `${i.item_name} x${i.quantity}`).join(', ') || '無項目';
                     cardHtml = `
                         <p><strong>${item.time_slot} - ${item.contact_name}</strong> (${item.num_of_people}人)</p>
                         <small>${itemsSummary}</small>
                     `;
                } else if (currentTemplate === 'ecommerce_template') {
                    type = 'order';
                    id = item.order_id;
                     cardHtml = `
                         <p><strong>訂單 #${id} - ${item.customer_name}</strong></p>
                         <small>狀態: ${item.status || '未知'}, 金額: $${item.total_amount || 0}</small>
                     `;
                }
                return `<div class="daily-card ${statusClass}" data-id="${id}" data-type="${type}">${cardHtml}</div>`;
            }).join('');
        } catch (error) {}
    }
    async function loadOrderList() {
        orderListContent.innerHTML = '<p>正在載入列表...</p>';
        let apiUrl = '';
        const search = document.getElementById('order-search-input').value;
        const dateType = document.getElementById('order-date-filter-type').value;
        const startDate = document.getElementById('order-date-filter-start').value;
        const endDate = document.getElementById('order-date-filter-end').value;
        const status = document.getElementById('order-status-filter').value;
        const params = new URLSearchParams();
        if (search) params.append('search', search);
        if (startDate) params.append(`${dateType}_start`, startDate);
        if (endDate) params.append(`${dateType}_end`, endDate);
        if (status) params.append('status', status);

        if (currentTemplate === 'studio_template' || currentTemplate === 'guesthouse_template') {
            apiUrl = `/api/get-bookings?${params.toString()}`;
        } else if (currentTemplate === 'ecommerce_template') {
             apiUrl = `/api/admin/get-orders?${params.toString()}`;
        } else {
             orderListContent.innerHTML = '<p>此樣板無訂單列表。</p>';
             return;
        }
        try {
            const items = await fetchData(apiUrl);
            if (items.length === 0) {
                orderListContent.innerHTML = '<p>找不到符合條件的項目。</p>';
                return;
            }
            orderListContent.innerHTML = items.map(item => {
                 let itemHtml = '', type = '', id = null;
                 if (currentTemplate === 'studio_template' || currentTemplate === 'guesthouse_template') {
                     type = 'booking';
                     id = item.booking_id;
                     itemHtml = `
                         <p><strong>${item.booking_date} ${item.time_slot} - ${item.contact_name}</strong> (${item.num_of_people}人)</p>
                         <small>狀態: ${item.status || '未知'}, 建立: ${new Date(item.created_at).toLocaleDateString()}</small>
                     `;
                 } else if (currentTemplate === 'ecommerce_template') {
                     type = 'order';
                     id = item.order_id;
                     itemHtml = `
                         <p><strong>訂單 #${id} - ${item.customer_name}</strong></p>
                         <small>狀態: ${item.status || '未知'}, 金額: $${item.total_amount || 0}, 日期: ${new Date(item.created_at).toLocaleDateString()}</small>
                     `;
                 }
                return `<div class="order-list-item" data-id="${id}" data-type="${type}">${itemHtml}</div>`;
            }).join('');
        } catch (error) {}
    }
     async function searchCustomers() {
        const query = document.getElementById('customer-search-input').value.trim();
        customerSearchResults.innerHTML = '<p>搜尋中...</p>';
        if (query.length < 1) {
            customerSearchResults.innerHTML = '<p>請輸入至少一個字元進行搜尋。</p>';
            return;
        }
        try {
             const users = await fetchData(`/api/admin/user-search?q=${encodeURIComponent(query)}`);
             if (users.length === 0) {
                customerSearchResults.innerHTML = '<p>找不到符合的顧客。</p>';
                return;
             }
             customerSearchResults.innerHTML = users.map(user => `
                <div class="customer-result-item" data-user-id="${user.user_id}" style="padding: 10px; border-bottom: 1px solid var(--color-secondary); cursor: pointer;">
                    <p><strong>${user.nickname || user.line_display_name}</strong></p>
                    <small>${user.phone || '未設定電話'}</small>
                </div>
             `).join('');
        } catch (error) {}
     }

     // --- Modal 內容生成與操作 ---
     async function openDetailsModal(type, id) {
        showModal('載入中...', '<p>正在獲取詳細資料...</p>');
        try {
            let title = '', bodyHtml = '', actionsHtml = '';
            if (type === 'booking') {
                 const bookingDetails = { // 模擬數據
                      booking: { booking_id: id, booking_date: '2025-10-26', time_slot: '14:00', contact_name: '測試員', num_of_people: 2, status: 'confirmed', notes: '無', total_amount: 1280, user_id: 'U123...', created_at: Date.now()},
                      items: [{ item_name: '標準雙人房', quantity: 1, price: 1280 }],
                      user: { nickname: '測試員', line_display_name: '測試 LINE 名', phone: '0912345678' }
                 };
                 title = `預約 #${id} (${bookingDetails.booking.contact_name})`;
                 bodyHtml = renderBookingDetailsBody(bookingDetails);
                 actionsHtml = renderBookingActions(bookingDetails.booking, bookingDetails.user);
            } else if (type === 'order') {
                const orderDetails = { // 模擬數據
                    order: { order_id: id, customer_name: '電商客', status: 'pending', total_amount: 500, user_id: 'U456...', created_at: Date.now(), shipping_info: '...' },
                    items: [{ product_name: '商品A', quantity: 2, price: 250 }],
                    user: { nickname: '電商客', line_display_name: '電商 LINE', phone: '0987654321'}
                };
                 title = `訂單 #${id} (${orderDetails.order.customer_name})`;
                 bodyHtml = renderOrderDetailsBody(orderDetails);
                 actionsHtml = renderOrderActions(orderDetails.order, orderDetails.user);
            } else if (type === 'activity') {
                 title = `動態 #${id}`;
                 bodyHtml = `<p>這裡顯示動態的詳細內容 (如果有的話)。</p>`;
            } else {
                 throw new Error(`未知的詳細資料類型: ${type}`);
            }
            showModal(title, bodyHtml, actionsHtml);
            bindModalActions();
        } catch (error) {
             showModal('錯誤', `<p style="color: var(--color-danger);">載入詳細資料失敗：${error.message}</p>`);
        }
     }
     async function openCustomerDetailsModal(targetUserId) {
         showModal('載入中...', '<p>正在獲取顧客資料...</p>');
         try {
             const data = await fetchData(`/api/admin/user-details?userId=${targetUserId}`);
             const title = `顧客: ${data.profile.nickname || data.profile.line_display_name}`;
             const bodyHtml = renderCustomerDetailsBody(data);
             const actionsHtml = renderCustomerActions(data.profile);
             showModal(title, bodyHtml, actionsHtml);
             bindModalActions();
         } catch(error){
              showModal('錯誤', `<p style="color: var(--color-danger);">載入顧客資料失敗：${error.message}</p>`);
         }
     }
     function renderBookingDetailsBody(details) {
         const { booking, items, user } = details;
         let html = `
             <h4>預約資訊</h4>
             <p><strong>日期:</strong> ${booking.booking_date} ${booking.time_slot}</p>
             <p><strong>人數:</strong> ${booking.num_of_people}</p>
             <p><strong>狀態:</strong> ${booking.status}</p>
             <p><strong>總金額:</strong> ${booking.total_amount || 'N/A'}</p>
             <p><strong>備註:</strong> ${booking.notes || '無'}</p>
             <p><strong>建立時間:</strong> ${new Date(booking.created_at).toLocaleString()}</p>
             <h4>預約項目</h4>
         `;
         items.forEach(item => {
             html += `<p>- ${item.item_name} x ${item.quantity} ($${item.price || 'N/A'})</p>`;
         });
         html += `
             <h4>顧客資訊</h4>
             <p><strong>姓名:</strong> ${user?.nickname || user?.line_display_name || booking.contact_name}</p>
             <p><strong>電話:</strong> ${user?.phone || booking.contact_phone || '未提供'}</p>
             <p><strong>User ID:</strong> ${booking.user_id}</p>
             `;
         return html;
     }
     function renderOrderDetailsBody(details) {
         const { order, items, user } = details;
          let html = `
             <h4>訂單資訊</h4>
             <p><strong>狀態:</strong> ${order.status}</p>
             <p><strong>總金額:</strong> $${order.total_amount || 0}</p>
             <p><strong>運送資訊:</strong> ${order.shipping_info || 'N/A'}</p>
             <p><strong>建立時間:</strong> ${new Date(order.created_at).toLocaleString()}</p>
             <h4>訂單項目</h4>
         `;
         items.forEach(item => {
             html += `<p>- ${item.product_name} x ${item.quantity} ($${item.price || 'N/A'})</p>`;
         });
         html += `
             <h4>顧客資訊</h4>
             <p><strong>姓名:</strong> ${user?.nickname || user?.line_display_name || order.customer_name}</p>
             <p><strong>電話:</strong> ${user?.phone || '未提供'}</p>
             <p><strong>User ID:</strong> ${order.user_id}</p>
         `;
         return html;
     }
    function renderCustomerDetailsBody(data) {
         const { profile, bookings, exp_history } = data;
         let html = `
             <h4>基本資料</h4>
             <p><strong>LINE 名稱:</strong> ${profile.line_display_name}</p>
             <p><strong>暱稱:</strong> ${profile.nickname || '未設定'}</p>
             <p><strong>電話:</strong> ${profile.phone || '未設定'}</p>
             <p><strong>User ID:</strong> ${profile.user_id}</p>
             <p><strong>等級/點數:</strong> ${profile.level} / ${profile.current_exp}</p>
             <p><strong>方案:</strong> ${profile.class || '無'}</p>
             <p><strong>標籤:</strong> ${profile.tag || '無'}</p>
             <p><strong>備註:</strong> ${profile.notes || '無'}</p>
             <h4>近期預約/訂單 (${bookings.length})</h4>
             ${bookings.slice(0, 3).map(b => `<p>- ${b.booking_date} ${b.time_slot} (${b.status})</p>`).join('') || '<p>無</p>'}
             <h4>近期點數紀錄 (${exp_history.length})</h4>
             ${exp_history.slice(0, 3).map(h => `<p>- ${new Date(h.created_at).toLocaleDateString()} ${h.reason} (${h.exp_added > 0 ? '+' : ''}${h.exp_added})</p>`).join('') || '<p>無</p>'}
         `;
         return html;
     }

     function renderBookingActions(booking, user) {
         let actions = [];
         if (currentTemplate === 'studio_template') {
             if (booking.status === 'confirmed') {
                 actions.push(`<button class="cta-button" data-action="check-in" data-id="${booking.booking_id}" style="background-color: var(--color-success);">標記報到</button>`);
             }
         } else if (currentTemplate === 'guesthouse_template') {
             if (booking.status === 'confirmed') {
                 actions.push(`<button class="cta-button" data-action="check-in" data-id="${booking.booking_id}" style="background-color: var(--color-success);">標記入住</button>`);
             }
         }
         if (booking.status !== 'cancelled') {
              actions.push(`<button class="cta-button" data-action="cancel" data-id="${booking.booking_id}" style="background-color: var(--color-danger);">取消預約</button>`);
         }
         const targetName = user?.nickname || user?.line_display_name || booking.contact_name;
         actions.push(`<button class="cta-button" data-action="send-message" data-user-id="${booking.user_id}" data-target-name="${targetName}" style="background-color: var(--color-secondary);">發送訊息</button>`);
         return actions.join('');
     }

     function renderOrderActions(order, user) {
          let actions = [];
         if (currentTemplate === 'ecommerce_template') {
            if (order.status === 'pending') {
                 actions.push(`<button class="cta-button" data-action="ship" data-id="${order.order_id}" style="background-color: var(--color-success);">標示已出貨</button>`);
            }
             if (order.status !== 'cancelled' && order.status !== 'completed') {
                  actions.push(`<button class="cta-button" data-action="cancel-order" data-id="${order.order_id}" style="background-color: var(--color-danger);">取消訂單</button>`);
             }
         }
         const targetName = user?.nickname || user?.line_display_name || order.customer_name;
         actions.push(`<button class="cta-button" data-action="send-message" data-user-id="${order.user_id}" data-target-name="${targetName}" style="background-color: var(--color-secondary);">發送訊息</button>`);
         return actions.join('');
     }

     function renderCustomerActions(profile) {
          const targetName = profile.nickname || profile.line_display_name;
          return `<button class="cta-button" data-action="send-message" data-user-id="${profile.user_id}" data-target-name="${targetName}" style="background-color: var(--color-secondary);">發送訊息給 ${targetName}</button>`;
     }

     function bindModalActions() {
         detailsModalActions.querySelectorAll('button').forEach(button => {
             button.addEventListener('click', handleModalAction);
         });
     }

     async function handleModalAction(event) {
         const button = event.target;
         const action = button.dataset.action;
         const id = button.dataset.id;
         const targetUserId = button.dataset.userId;
         const targetName = button.dataset.targetName;

         button.disabled = true;
         button.textContent = '處理中...';

         try {
             switch (action) {
                 case 'check-in':
                     await fetchData('/api/update-booking-status', {
                         method: 'POST',
                         headers: { 'Content-Type': 'application/json' },
                         body: JSON.stringify({ bookingId: Number(id), status: 'checked-in' })
                     });
                     alert('狀態已更新！');
                     hideModal();
                     switchTab(document.querySelector('#owner-tab-bar .active').dataset.tab);
                     break;
                 case 'cancel':
                     if (confirm('確定要取消此預約嗎？')) {
                         await fetchData('/api/update-booking-status', {
                             method: 'POST',
                             headers: { 'Content-Type': 'application/json' },
                             body: JSON.stringify({ bookingId: Number(id), status: 'cancelled' })
                         });
                         alert('預約已取消！');
                         hideModal();
                         switchTab(document.querySelector('#owner-tab-bar .active').dataset.tab);
                     } else {
                          button.disabled = false;
                          button.textContent = '取消預約';
                     }
                     break;
                 case 'ship':
                     alert('訂單已標示為已出貨！(模擬)');
                     hideModal();
                     switchTab(document.querySelector('#owner-tab-bar .active').dataset.tab);
                     break;
                 case 'cancel-order':
                     if (confirm('確定要取消此訂單嗎？')) {
                         alert('訂單已取消！(模擬)');
                         hideModal();
                         switchTab(document.querySelector('#owner-tab-bar .active').dataset.tab);
                     } else {
                         button.disabled = false;
                         button.textContent = '取消訂單';
                     }
                     break;
                 case 'send-message':
                      await openSendMessageModal(targetUserId, targetName);
                      button.disabled = false;
                      button.textContent = '發送訊息';
                      updateHistoryState('details', 'close'); // 【新增】關閉詳情
                      break;
                 default:
                     console.warn('未知的 Modal 操作:', action);
                     button.disabled = false;
                     button.textContent = '未知操作';
             }
         } catch (error) {
             alert(`[handleModalAction Error] ${error.message}\n\nAction: ${action}\nStack: ${error.stack}`);
             alert(`操作失敗：${error.message}`);
             button.disabled = false;
             if (action === 'check-in') button.textContent = '標記報到/入住';
             else if (action === 'cancel') button.textContent = '取消預約';
             else if (action === 'ship') button.textContent = '標示已出貨';
             else if (action === 'cancel-order') button.textContent = '取消訂單';
             else if (action === 'send-message') button.textContent = '發送訊息';
             else button.textContent = '操作失敗';
         }
     }

    async function openSendMessageModal(targetUserId, targetName) {
        if (!sendMessageModal || !messageDraftSelect || !directMessageContent || !sendMessageSubmitBtn) {
            alert('訊息介面初始化失敗！');
            return;
        }

        try {
            sendMessageModalTitle.textContent = `發送訊息給 ${targetName}`;
            directMessageContent.value = '';
            messageDraftSelect.innerHTML = '<option value="">-- 載入草稿中... --</option>';

            const newSubmitBtn = sendMessageSubmitBtn.cloneNode(true);
            sendMessageSubmitBtn.parentNode.replaceChild(newSubmitBtn, sendMessageSubmitBtn);
            sendMessageSubmitBtn = document.getElementById('send-message-submit-btn');
            
            newSubmitBtn.dataset.userId = targetUserId;
            newSubmitBtn.addEventListener('click', handleSendMessageSubmit);
            newSubmitBtn.disabled = false;
            newSubmitBtn.textContent = '確認發送';

            sendMessageModal.style.display = 'flex';
            updateHistoryState('send-message', 'open'); // 【新增】

            if (allMessageDrafts.length === 0) {
                console.log("快取為空，正在從 API 獲取訊息草稿...");
                allMessageDrafts = await fetchData('/api/admin/message-drafts');
            } else {
                 console.log("使用快取的訊息草稿");
            }

            messageDraftSelect.innerHTML = '<option value="">-- 手動輸入或選擇草稿 --</option>';
            const generalDrafts = allMessageDrafts.filter(d => d.draft_id > 2); 
            generalDrafts.forEach(draft => {
                const option = new Option(draft.title, draft.content);
                messageDraftSelect.add(option);
            });

        } catch (error) {
            alert(`[openSendMessageModal Error] ${error.message}\n\nStack: ${error.stack}`);
            console.error("載入訊息草稿失敗:", error);
            messageDraftSelect.innerHTML = '<option value="">-- 載入草稿失敗 --</option>';
        }
    }

    async function handleSendMessageSubmit(event) {
        const button = event.target;
        const targetUserId = button.dataset.userId;
        const message = directMessageContent.value.trim();

        if (!message) {
            alert('訊息內容不可為空！');
            return;
        }
        if (!targetUserId) {
            alert('錯誤：找不到目標使用者 ID！');
            return;
        }

        button.disabled = true;
        button.textContent = '發送中...';

        try {
            await fetchData('/api/send-message', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userId: targetUserId, message: message })
            });
            alert('訊息已發送！');
            updateHistoryState('send-message', 'close'); // 【新增】

        } catch (error) {
            alert(`[handleSendMessageSubmit Error] ${error.message}\n\nStack: ${error.stack}`);
            alert(`發送失敗：${error.message}`);
        } finally {
            button.disabled = false;
            button.textContent = '確認發送';
        }
    }

    // --- 【新增】快速預約相關功能 ---

    function openQuickBookingModal() {
        console.log("開啟快速預約 Modal...");
        quickBookingForm.reset();
        resetCustomerSearch();
        
        // 填充項目下拉選單
        qbBookingItemSelect.innerHTML = '<option value="">-- 選擇項目 --</option>';
        const itemsToShow = allProducts.filter(p => p.is_visible);
        if(itemsToShow.length === 0) {
             qbBookingItemSelect.innerHTML = '<option value="">-- 沒有可預約項目 --</option>';
        } else {
            itemsToShow.forEach(p => {
                const priceText = p.price_weekday != null ? `$${p.price_weekday}` : '洽詢';
                qbBookingItemSelect.add(new Option(`${p.name} (${priceText})`, p.product_id));
            });
        }
        
        // 初始化日期選擇器
        if (qbDatePicker) qbDatePicker.destroy();
        qbDatePicker = flatpickr("#qb-booking-date", {
            dateFormat: "Y-m-d",
            locale: "zh_tw",
            defaultDate: "today"
        });
        
        // 設置預設時間
        const now = new Date();
        const nextHour = (now.getMinutes() > 30) ? now.getHours() + 1 : now.getHours();
        const nextMinute = (now.getMinutes() > 30) ? '00' : '30';
        document.getElementById('qb-booking-time').value = `${String(nextHour).padStart(2, '0')}:${nextMinute}`;

        quickBookingModal.style.display = 'flex';
        updateHistoryState('quick-booking', 'open');
    }

    async function handleCustomerSearchInput(e) {
        const query = e.target.value.trim();
        qbCustomerSearchResults.innerHTML = '';
        if (query.length < 1) {
            qbCustomerSearchResults.style.display = 'none';
            return;
        }
        
        try {
            const users = await fetchData(`/api/admin/user-search?q=${encodeURIComponent(query)}`);
            if (users.length > 0) {
                qbCustomerSearchResults.innerHTML = users.map(user => `
                    <div class="customer-result-item" data-user-id="${user.user_id}" data-user-name="${user.nickname || user.line_display_name}" data-user-phone="${user.phone || ''}" style="padding: 10px; cursor: pointer; border-bottom: 1px solid var(--color-secondary);">
                        <p style="margin:0; font-weight: bold;">${user.nickname || user.line_display_name}</p>
                        <small style="color: var(--color-text-secondary);">${user.phone || '未設定電話'}</small>
                    </div>
                `).join('');
                qbCustomerSearchResults.style.display = 'block';
            } else {
                qbCustomerSearchResults.innerHTML = '<div style="padding: 10px; color: var(--color-text-secondary);">找不到顧客</div>';
                qbCustomerSearchResults.style.display = 'block';
            }
        } catch (error) {
            qbCustomerSearchResults.innerHTML = `<div style="padding: 10px; color: var(--color-danger);">搜尋失敗</div>`;
            qbCustomerSearchResults.style.display = 'block';
        }
    }

    function handleCustomerSelect(e) {
        const item = e.target.closest('.customer-result-item');
        if (!item) return;

        const userId = item.dataset.userId;
        const userName = item.dataset.userName;
        const userPhone = item.dataset.userPhone;

        qbCustomerSelectedId.value = userId;
        qbCustomerSelectedName.textContent = userName;
        qbContactPhone.value = userPhone; // 自動帶入電話
        
        qbCustomerSearchResults.style.display = 'none';
        qbCustomerSearchInput.style.display = 'none'; // 隱藏搜尋框
        qbCustomerSelectedView.style.display = 'block'; // 顯示已選顧客
    }
    
    function resetCustomerSearch() {
        qbCustomerSelectedId.value = '';
        qbCustomerSelectedName.textContent = '';
        qbContactPhone.value = '';
        qbCustomerSearchInput.value = '';
        
        qbCustomerSearchResults.style.display = 'none';
        qbCustomerSearchInput.style.display = 'block';
        qbCustomerSelectedView.style.display = 'none';
    }

    async function handleQuickBookingSubmit(e) {
        e.preventDefault();
        const button = document.getElementById('quick-booking-submit-btn');
        button.disabled = true;
        button.textContent = '建立中...';

        try {
            let finalUserId = qbCustomerSelectedId.value;
            let finalContactName = qbCustomerSelectedName.textContent;
            
            if (!finalUserId) {
                // 處理臨時顧客
                finalContactName = qbCustomerSearchInput.value.trim();
                if (!finalContactName) {
                    throw new Error('請搜尋選擇顧客，或在搜尋框中輸入新顧客的名稱');
                }
                finalUserId = `walk-in-${Date.now()}`;
            }
            
            const contactPhone = qbContactPhone.value.trim();
            if (contactPhone && !/^09\d{8}$/.test(contactPhone)) {
                 throw new Error('請輸入正確的 10 碼手機號碼 (09開頭)，或留空');
            }

            const selectedProductId = qbBookingItemSelect.value;
            if (!selectedProductId) {
                throw new Error('請選擇一個預約項目');
            }
            
            const product = allProducts.find(p => p.product_id === selectedProductId);
            if (!product) {
                throw new Error('找不到對應的產品資料');
            }

            const bookingDate = document.getElementById('qb-booking-date').value;
            const timeSlot = document.getElementById('qb-booking-time').value;
            const numOfPeople = document.getElementById('qb-booking-people').value;

            if (!bookingDate || !timeSlot) {
                throw new Error('日期和時段為必填');
            }

            // 取得所選日期的價格
            const price = product.price_weekday; // 簡化：先統一用平日價
            const totalAmount = price * parseInt(numOfPeople, 10);

            const payload = {
                userId: finalUserId,
                contactName: finalContactName,
                contactPhone: contactPhone || null,
                bookingDate: bookingDate,
                timeSlot: timeSlot,
                numOfPeople: parseInt(numOfPeople, 10),
                totalAmount: totalAmount,
                notes: document.getElementById('qb-booking-notes').value.trim() || null,
                items: [
                    { name: product.name, qty: 1, price: price } // 簡化：快速預約只支援 1 個項目
                ]
            };
            
            await fetchData('/api/admin/create-booking', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            alert('快速預約建立成功！');
            updateHistoryState('quick-booking', 'close');
            // 刷新當前 Tab
            switchTab(document.querySelector('#owner-tab-bar .active').dataset.tab);

        } catch (error) {
            alert(`建立失敗: ${error.message}`);
        } finally {
            button.disabled = false;
            button.textContent = '確認建立';
        }
    }
    
    // --- 【新增】簡易控房相關功能 ---

    function openRoomControlModal() {
        console.log("開啟簡易控房 Modal...");
        roomControlForm.reset();
        
        // 填充房型下拉選單
        rcRoomSelect.innerHTML = '<option value="all">所有房型</option>';
        const roomProducts = allProducts.filter(p => p.category === '房型'); // 假設民宿房型分類為'房型'
        if(roomProducts.length > 0) {
            roomProducts.forEach(p => {
                rcRoomSelect.add(new Option(p.name, p.product_id));
            });
        } else {
             // 備案：如果沒有'房型'分類，顯示所有產品
             allProducts.forEach(p => {
                rcRoomSelect.add(new Option(p.name, p.product_id));
            });
        }

        // 初始化日期選擇器
        if (rcDatePicker) rcDatePicker.destroy();
        rcDatePicker = flatpickr("#rc-date-range", {
            mode: "range",
            dateFormat: "Y-m-d",
            locale: "zh_tw",
            minDate: "today"
        });

        roomControlModal.style.display = 'flex';
        updateHistoryState('room-control', 'open');
    }

    async function handleRoomControlSubmit(newStatus) {
        const button = (newStatus === 'Open') ? document.getElementById('rc-submit-open-btn') : document.getElementById('rc-submit-close-btn');
        const otherButton = (newStatus === 'Open') ? document.getElementById('rc-submit-close-btn') : document.getElementById('rc-submit-open-btn');
        
        button.disabled = true;
        otherButton.disabled = true;
        button.textContent = '處理中...';

        try {
            const selectedProductId = rcRoomSelect.value;
            const selectedDates = rcDatePicker.selectedDates;
            
            if (selectedDates.length < 2) {
                throw new Error('請選擇一個有效的日期範圍');
            }

            const startDate = flatpickr.formatDate(selectedDates[0], "Y-m-d");
            const endDate = flatpickr.formatDate(selectedDates[1], "Y-m-d");
            
            const productIdsToUpdate = (selectedProductId === 'all') 
                ? allProducts.filter(p => p.category === '房型').map(p => p.product_id) // 假設
                : [selectedProductId];
                
            if (productIdsToUpdate.length === 0) {
                 throw new Error("找不到要更新的房型");
            }

            const payload = {
                // API update-room-inventory 需要的格式
                startDate: startDate,
                endDate: endDate,
                weekdays: [0, 1, 2, 3, 4, 5, 6], // 範圍內的每一天
                updateValues: {
                    status: newStatus
                }
            };
            
            // 為每一個房型ID呼叫一次API
            const apiCalls = productIdsToUpdate.map(pid => {
                return fetchData('/api/admin/update-room-inventory', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ ...payload, productId: pid }) // 傳入 productId
                });
            });
            
            await Promise.all(apiCalls);

            alert(`成功將 ${productIdsToUpdate.length} 個房型在 ${startDate} 到 ${endDate} 期間標記為「${newStatus === 'Open' ? '開啟' : '關閉'}」`);
            updateHistoryState('room-control', 'close');
            // 刷新日曆
            if (flatpickrInstance) {
                loadDailyCards(currentSelectedDate);
            }

        } catch (error) {
            alert(`控房失敗: ${error.message}`);
        } finally {
            button.disabled = false;
            otherButton.disabled = false;
            button.textContent = (newStatus === 'Open') ? '開啟房間' : '關閉房間';
            otherButton.textContent = (newStatus === 'Open') ? '關閉房間' : '開啟房間';
        }
    }


    // --- 其他輔助函式 ---
    async function generateAndOpenAdminLink() {
        const adminPanelBtn = document.getElementById('go-to-admin-panel-btn');
        adminPanelBtn.disabled = true;
        adminPanelBtn.textContent = '正在產生安全連結...';
        try {
            const result = await fetchData('/api/generate-admin-link', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userId: userId })
            });
            if (!result.success) throw new Error(result.error || '無法產生連結');
            liff.openWindow({ url: result.link, external: true });
        } catch (error) {
            alert(`開啟失敗: ${error.message}`);
        } finally {
            adminPanelBtn.disabled = false;
            adminPanelBtn.textContent = '開啟完整版後台';
        }
    }

    // --- 啟動 App ---
    main();
});