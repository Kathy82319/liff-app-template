// public/owner-liff.js
// 【v6.4 - 合併 預約/訂單 Tab +  控房管理 Tab】

document.addEventListener('DOMContentLoaded', () => {
    const myLiffId = "2008296713-vPAkV7xr"; // 您的 Owner LIFF ID
    let userId = null;
    let currentTemplate = null;
    let flatpickrInstance = null; // 日曆 Tab 的 Flatpickr
    let currentSelectedDate = new Date();
    let allMessageDrafts = [];
    let allProducts = []; // 【控房】需要讀取所有產品
    let currentHistoryState = { modal: null };
    let currentEditingProfile = null;

    // --- DOM 元素快取 ---
    const loadingView = document.getElementById('loading-view');
    const unauthorizedView = document.getElementById('unauthorized-view');
    const mainView = document.getElementById('main-view');
    const tabBar = document.getElementById('owner-tab-bar');
    const tabContents = document.querySelectorAll('.tab-content');
    const activityListContent = document.getElementById('activity-list-content');
    
    // --- 預約管理 Tab ---
    const bookingTabContent = document.getElementById('tab-content-booking');
    const bookingViewSwitcher = bookingTabContent?.querySelector('.view-switcher');
    const bookingViewCalendar = document.getElementById('booking-view-calendar');
    const bookingViewList = document.getElementById('booking-view-list');
    const calendarPlaceholder = document.getElementById('calendar-placeholder');
    const selectedDateDisplay = document.getElementById('selected-date-display');
    const dailyCardsContainer = document.getElementById('daily-cards-container');
    const orderListContent = document.getElementById('order-list-content');
    
    // --- 控房管理 Tab ---
    const roomControlTabContent = document.getElementById('tab-content-room-control');
    const roomControlTabButton = document.querySelector('[data-tab="room-control"]');
    let rcDateRangePicker = null; // 控房 Tab 的 Flatpickr
    let currentRoomInventoryData = {}; // 控房 API 資料快取
    let rcDisplayedDates = []; // 控房 表格顯示的日期
    const weekdayShort = ["日", "一", "二", "三", "四", "五", "六"]; // 控房 輔助

    // --- ▼核銷票券 Tab DOM ---
    let html5QrCodeScanner = null; // For redeeming
    const redeemTabContent = document.getElementById('tab-content-redeem');
    const startRedeemScanBtn = document.getElementById('start-redeem-scan-btn');
    const redeemQrReader = document.getElementById('redeem-qr-reader');
    const redeemStatusMessage = document.getElementById('redeem-status-message');

    // --- 顧客查詢 Tab ---
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

    // --- 快速預約 Modal ---
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

    // --- 【刪除】簡易控房 Modal 相關變數 ---
    // const roomControlModal = ... (已刪除)
    // const roomControlForm = ... (已刪除)
    // const rcRoomSelect = ... (已刪除)
    // ...

    // --- 簡易編輯顧客 Modal ---
    const editCustomerModal = document.getElementById('edit-customer-modal');
    const editCustomerForm = document.getElementById('edit-customer-form');
    const editCustomerModalTitle = document.getElementById('edit-customer-modal-title');
    const editCustomerUserId = document.getElementById('edit-customer-user-id');
    const editCustomerPhone = document.getElementById('edit-customer-phone');
    const editCustomerNotes = document.getElementById('edit-customer-notes');

    // --- 樣板特定元素 ---
    // const calendarTabButton = ... (已合併)
    // const manageRoomsBtn = ... (已刪除)
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

    function translateStatus(status) {
        switch (status) {
            case 'confirmed': return '已確認';
            case 'checked-in': return (currentTemplate === 'guesthouse_template') ? '已入住' : '已報到';
            case 'cancelled': return '已取消';
            case 'no-show': return '未如期入住';
            default: return status || '未知';
        }
    }

    function getCurrentVisibleTabContentId() {
        const activeTab = document.querySelector('.tab-content.active');
        return activeTab ? activeTab.id : 'tab-content-activity';
    }

    function showModal(title, bodyHtml, actionsHtml = '') {
        detailsModalTitle.textContent = title;
        detailsModalBody.innerHTML = bodyHtml;
        detailsModalActions.innerHTML = actionsHtml;
        detailsModal.style.display = 'flex';
        updateHistoryState('details', 'open');
    }

    function hideModal() {
        if (currentHistoryState.modal) {
            history.back();
        } else {
            detailsModal.style.display = 'none';
        }
    }

    function hideModalProgrammatically() {
        detailsModal.style.display = 'none';
        sendMessageModal.style.display = 'none';
        quickBookingModal.style.display = 'none';
        // roomControlModal.style.display = 'none'; // (已刪除)
        editCustomerModal.style.display = 'none';
        currentHistoryState = { modal: null };
    }

    function updateHistoryState(modalName, action = 'open') {
        if (action === 'open') {
            const newState = { modal: modalName };
            history.pushState(newState, '');
            currentHistoryState = newState;
        } else {
            if (currentHistoryState.modal === modalName) {
                 history.back();
            }
        }
    }

    function handlePopState(event) {
        const targetState = event.state || { modal: null };
        currentHistoryState = targetState;
        hideModalProgrammatically();
    }

    // --- Tab 切換邏輯 (【v6.4 修改】) ---
function switchTab(tabId) {
        tabBar.querySelectorAll('.tab-button').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.tab === tabId);
        });
        tabContents.forEach(content => {
            content.classList.toggle('active', content.id === `tab-content-${tabId}`);
        });

        switch (tabId) {
            case 'activity': 
                loadActivities(); 
                break;
            case 'booking':
                // (內容不變)
                if (!flatpickrInstance) {
                    initializeCalendar();
                } else {
                    loadDailyCards(currentSelectedDate);
                }
                break;
            case 'room-control':
                // (內容不變)
                if (!rcDateRangePicker) {
                    initializeRoomControl();
                }
                break;
            // --- ▼▼▼ 新增：核銷 Tab 邏輯 ▼▼▼ ---
            case 'redeem':
                if(redeemStatusMessage) redeemStatusMessage.textContent = '';
                // 停止掃描器 (如果正在掃)
                if (html5QrCodeScanner && html5QrCodeScanner.isScanning) {
                    html5QrCodeScanner.stop().catch(err => console.error("Scanner stop failed", err));
                }
                if(redeemQrReader) redeemQrReader.style.display = 'none';
                if(startRedeemScanBtn) {
                    startRedeemScanBtn.style.display = 'block';
                    startRedeemScanBtn.textContent = '啟動相機掃碼';
                }
                break;
            // --- ▲▲▲ 新增結束 ▲▲▲ ---
            case 'customer':
                // (內容不變)
                customerSearchResults.innerHTML = '';
                document.getElementById('customer-search-input').value = '';
                break;
        }
    }

    // --- 預約 Tab 內部的視圖切換 (【v6.4 】) ---
    function switchBookingView(viewName) {
        if (!bookingViewCalendar || !bookingViewList || !bookingViewSwitcher) return;

        bookingViewSwitcher.querySelectorAll('.view-switch-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.view === viewName);
        });

        bookingViewCalendar.classList.toggle('active', viewName === 'calendar');
        bookingViewList.classList.toggle('active', viewName === 'list');

        if (viewName === 'list' && orderListContent.innerHTML === '') {
            // 如果列表是空的，自動載入一次
            loadOrderList();
        }
        if (viewName === 'calendar' && !flatpickrInstance) {
            // 如果日曆還沒初始化，初始化
            initializeCalendar();
        }
    }


    // --- 主程式 (v6.3 邏輯) ---
    async function main() {
        try {
            await liff.init({ liffId: myLiffId });
            if (!liff.isLoggedIn()) {
                liff.login({ redirectUri: window.location.href });
                return;
            }
            const profile = await liff.getProfile();
            userId = profile.userId;

            const [verifyResult, productsResponse, configResponse] = await Promise.all([
                fetchData('/api/admin/verify-liff-user', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ userId: userId })
                }),
                fetchData('/api/get-products'), // 【控房】需要產品資料
                fetchData('/api/get-app-config')
            ]);
            
            allProducts = productsResponse || []; // 【控房】儲存產品資料
            console.log(`[Main] 載入了 ${allProducts.length} 個產品項目。`);

            if(configResponse && configResponse.LOGIC) {
                window.CONFIG = configResponse;
                console.log("[Main] 成功獲取完整 App Config");
            } else {
                 throw new Error("get-app-config 回傳格式不正確");
            }

            if (verifyResult.success && verifyResult.isAdmin) {
                currentTemplate = verifyResult.activeTemplate;
                
                loadingView.style.display = 'none';
                mainView.style.display = 'block';

                initializeAppUI(currentTemplate);
                
                setupEventListeners();
                switchTab('activity');
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

    // --- 初始化 App UI (【v6.4 修改】) ---
    function initializeAppUI(template) {

        const templateDefinition = window.CONFIG?.LOGIC?.INDUSTRY_TEMPLATE_DEFINITIONS[template];
        const features = templateDefinition?.features || {};
        const redeemTabButton = document.querySelector('[data-tab="redeem"]');
        if (redeemTabButton) {
            redeemTabButton.style.display = ''; // 確保核銷 Tab 顯示
        }
        if (template === 'ecommerce_template') {
            // 電商：隱藏「預約管理」和「控房管理」
            document.querySelector('[data-tab="booking"]').style.display = 'none';
            if (roomControlTabButton) roomControlTabButton.style.display = 'none';
            // 顯示電商按鈕
            ecommerceManageBtns.style.display = 'flex';
        } else {
            // 非電商：顯示「預約管理」，隱藏電商按鈕
            document.querySelector('[data-tab="booking"]').style.display = '';
            ecommerceManageBtns.style.display = 'none';
            
            // 檢查是否為民宿且啟用了控房功能
            if (template === 'guesthouse_template' && features.OWNER_LIFF_ENABLE_ROOM_CONTROL === true) {
                if (roomControlTabButton) roomControlTabButton.style.display = ''; // 顯示「控房管理」Tab
                console.log("[initializeAppUI] 顯示 控房管理 Tab (v6.4 logic)");
            } else {
                if (roomControlTabButton) roomControlTabButton.style.display = 'none'; // 隱藏「控房管理」Tab
                console.log(`[initializeAppUI] 隱藏 控房管理 Tab (Template: ${template}, Feature: ${features.OWNER_LIFF_ENABLE_ROOM_CONTROL}) (v6.4 logic)`);
            }
        }
    }

    // --- 事件綁定 (【v6.4 修改】) ---
    function setupEventListeners() {
        window.addEventListener('popstate', handlePopState);
        
        // Tab Bar
        tabBar.addEventListener('click', (e) => {
            const button = e.target.closest('.tab-button');
            if (button && button.dataset.tab) { switchTab(button.dataset.tab); }
        });

        // 【】預約管理 Tab 內部的視圖切換
        bookingViewSwitcher?.addEventListener('click', (e) => {
            const button = e.target.closest('.view-switch-btn');
            if (button && button.dataset.view) {
                switchBookingView(button.dataset.view);
            }
        });

        // Modal 關閉按鈕
        detailsModalCloseBtn.addEventListener('click', () => { updateHistoryState('details', 'close'); });
        sendMessageModalCloseBtn.addEventListener('click', () => { updateHistoryState('send-message', 'close'); });
        quickBookingModal.querySelector('.modal-close').addEventListener('click', () => { updateHistoryState('quick-booking', 'close'); });
        // roomControlModal... (已刪除)
        editCustomerModal.querySelector('.modal-close').addEventListener('click', () => { updateHistoryState('edit-customer', 'close'); });

        // 訊息 Modal
        messageDraftSelect.addEventListener('change', (e) => {
            if (e.target.value) { directMessageContent.value = e.target.value; }
        });

        // 列表點擊
        activityListContent.addEventListener('click', (e) => {
            const card = e.target.closest('.activity-card');
            if (card && card.dataset.id && card.dataset.type) {
                 const type = card.dataset.type;
                 const id = card.dataset.id;
                 if (id === 'unknown' || id === 'null' || id === 'undefined') {
                     alert("這是一筆較舊的動態紀錄，無法開啟詳細資料。");
                     return;
                 }
                 openDetailsModal(type, id);
            }
        });
         dailyCardsContainer.addEventListener('click', (e) => {
            const card = e.target.closest('.daily-card');
            if (card && card.dataset.id) {
                 openDetailsModal(card.dataset.type, card.dataset.id);
            }
        });
        orderListContent.addEventListener('click', (e) => {
            const item = e.target.closest('.order-list-item');
            if (item && item.dataset.id) {
                 openDetailsModal(item.dataset.type, item.dataset.id);
            }
        });

        // 篩選與搜尋按鈕
        document.getElementById('order-filter-apply-btn')?.addEventListener('click', loadOrderList);
        document.getElementById('customer-search-btn')?.addEventListener('click', searchCustomers);
        customerSearchResults.addEventListener('click', (e) => {
             const item = e.target.closest('.customer-result-item');
             if(item && item.dataset.userId){ openCustomerDetailsModal(item.dataset.userId); }
         });
         
        //核銷掃碼按鈕
        startRedeemScanBtn?.addEventListener('click', startRedeemScanner);
        // 功能按鈕
        document.getElementById('go-to-admin-panel-btn')?.addEventListener('click', generateAndOpenAdminLink);
        quickActionBtn.addEventListener('click', openQuickBookingModal);
        // manageRoomsBtn... (已刪除)
        
        // 快速預約表單
        qbCustomerSearchInput.addEventListener('input', handleCustomerSearchInput);
        qbCustomerSearchResults.addEventListener('click', handleCustomerSelect);
        qbCustomerChangeBtn.addEventListener('click', resetCustomerSearch);
        quickBookingForm.addEventListener('submit', handleQuickBookingSubmit);
        

        // 編輯顧客表單
        editCustomerForm.addEventListener('submit', handleEditCustomerSubmit);
    }

    // --- 數據加載與渲染 (v6.3 邏輯) ---
    async function loadActivities() {
        // ... (保持不變) ...
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
                     if (act.link.startsWith('#users-')) {
                         type = 'user'; relatedId = act.link.substring(7);
                     } else if (act.link.startsWith('#bookings-')) {
                         type = 'booking'; relatedId = act.link.substring(10);
                     } else if (act.link === '#bookings') {
                         type = 'booking'; relatedId = 'unknown';
                     }
                 }
                 if (type === 'booking' || type === 'order') {
                    if (act.message.includes('取消')) { statusClass = 'status-cancelled'; }
                 } else if (type === 'user') {
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
        // ... (保持不變) ...
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
        // ... (保持不變) ...
        if (!calendarInstance || !datesToMark || datesToMark.length === 0) return;
        calendarInstance.calendarContainer.querySelectorAll('.has-event').forEach(day => day.classList.remove('has-event'));
        datesToMark.forEach(dateStr => {
            const dayElement = calendarInstance.calendarContainer.querySelector(`.flatpickr-day[aria-label="${flatpickr.formatDate(new Date(dateStr + 'T00:00:00'), 'F j, Y')}"]`);
            if (dayElement) { dayElement.classList.add('has-event'); }
        });
    }
    async function loadDailyCards(date) {
        // ... (保持不變) ...
        dailyCardsContainer.innerHTML = '<p>正在載入今日事項...</p>';
        const dateStr = date.toISOString().split('T')[0];
        let apiUrl = '';
        if (currentTemplate === 'studio_template' || currentTemplate === 'guesthouse_template') {
            apiUrl = `/api/get-bookings?date=${dateStr}`;
        } else if (currentTemplate === 'ecommerce_template') {
             apiUrl = `/api/admin/get-orders?date=${dateStr}`;
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
                     if (item.status === 'no-show') statusClass = 'status-no-show';
                     const itemsSummary = item.items?.map(i => `${i.item_name} x${i.quantity}`).join(', ') || '無項目';
                     cardHtml = `
                         <p><strong>${item.time_slot || ''} - ${item.contact_name}</strong> (${item.num_of_people}人)</p>
                         <small>${itemsSummary} (${translateStatus(item.status)})</small>
                     `;
                } else if (currentTemplate === 'ecommerce_template') {
                    type = 'order';
                    id = item.order_id;
                     cardHtml = `
                         <p><strong>訂單 #${id} - ${item.customer_name}</strong></p>
                         <small>狀態: ${translateStatus(item.status)}, 金額: $${item.total_amount || 0}</small>
                     `;
                }
                return `<div class="daily-card ${statusClass}" data-id="${id}" data-type="${type}">${cardHtml}</div>`;
            }).join('');
        } catch (error) {}
    }
    async function loadOrderList() {
        // ... (保持不變) ...
        orderListContent.innerHTML = '<p>正在載入列表...</p>';
        let apiUrl = '';
        const search = document.getElementById('order-search-input').value;
        const dateType = document.getElementById('order-date-filter-type').value;
        const startDate = document.getElementById('order-date-filter-start').value;
        const endDate = document.getElementById('order-date-filter-end').value;
        const status = document.getElementById('order-status-filter').value;
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
                         <p><strong>${item.booking_date} ${item.time_slot || ''} - ${item.contact_name}</strong> (${item.num_of_people}人)</p>
                         <small>狀態: ${translateStatus(item.status)}, 建立: ${new Date(item.created_at).toLocaleDateString()}</small>
                     `;
                 } else if (currentTemplate === 'ecommerce_template') {
                     type = 'order';
                     id = item.order_id;
                     itemHtml = `
                         <p><strong>訂單 #${id} - ${item.customer_name}</strong></p>
                         <small>狀態: ${translateStatus(item.status)}, 金額: $${item.total_amount || 0}, 日期: ${new Date(item.created_at).toLocaleDateString()}</small>
                     `;
                 }
                return `<div class="order-list-item" data-id="${id}" data-type="${type}">${itemHtml}</div>`;
            }).join('');
        } catch (error) {}
    }
     async function searchCustomers() {
        // ... (保持不變) ...
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

     // --- Modal 內容生成與操作 (v6.3 邏輯) ---
     async function openDetailsModal(type, id) {
        // ... (保持不變) ...
        showModal('載入中...', '<p>正在獲取詳細資料...</p>');
        try {
            let title = '', bodyHtml = '', actionsHtml = '';
            if (type === 'booking') {
                 const bookingResults = await fetchData(`/api/my-bookings?userId=${userId}&bookingId=${id}`);
                 const bookingData = bookingResults[0];
                 if (!bookingData) throw new Error(`找不到預約資料 (ID: ${id})`);
                 
                 let userProfile = null;
                 try {
                    userProfile = (await fetchData(`/api/admin/user-details?userId=${bookingData.user_id}`)).profile;
                 } catch (e) { console.warn("獲取 booking 的 user profile 失敗", e); }
                 
                 const bookingDetails = { booking: bookingData, items: bookingData.items, user: userProfile };
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

            } else if (type === 'user') {
                 await openCustomerDetailsModal(id);
                 return;
            } else if (type === 'activity') {
                 title = `動態 #${id}`;
                 bodyHtml = `<p>這是一則動態消息，但目前沒有更多詳細資料可顯示。</p>`;
            } else {
                 throw new Error(`未知的詳細資料類型: ${type}`);
            }
            showModal(title, bodyHtml, actionsHtml);
            bindModalActions();
        } catch (error) {
             alert(`[openDetailsModal Error] ${error.message}\n\nStack: ${error.stack}`);
             showModal('錯誤', `<p style="color: var(--color-danger);">載入詳細資料失敗：${error.message}</p>`);
        }
     }
     async function openCustomerDetailsModal(targetUserId) {
        // ... (保持不變) ...
         showModal('載入中...', '<p>正在獲取顧客資料...</p>');
         try {
             const data = await fetchData(`/api/admin/user-details?userId=${targetUserId}`);
             currentEditingProfile = data.profile; 
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
        // ... (保持不變) ...
         const { booking, items, user } = details;
         let html = `
             <h4>預約資訊</h4>
             <p><strong>日期:</strong> ${booking.booking_date} ${booking.time_slot || ''}</p>
             <p><strong>人數:</strong> ${booking.num_of_people}</p>
             <p><strong>狀態:</strong> ${translateStatus(booking.status)}</p>
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
        // ... (保持不變) ...
         const { order, items, user } = details;
          let html = `
             <h4>訂單資訊</h4>
             <p><strong>狀態:</strong> ${translateStatus(order.status)}</p>
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
        // ... (保持不變) ...
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
             ${bookings.slice(0, 3).map(b => `<p>- ${b.booking_date} ${b.time_slot || ''} (${translateStatus(b.status)})</p>`).join('') || '<p>無</p>'}
             <h4>近期點數紀錄 (${exp_history.length})</h4>
             ${exp_history.slice(0, 3).map(h => `<p>- ${new Date(h.created_at).toLocaleDateString()} ${h.reason} (${h.exp_added > 0 ? '+' : ''}${h.exp_added})</p>`).join('') || '<p>無</p>'}
         `;
         return html;
     }
     function renderBookingActions(booking, user) {
        // ... (保持不變) ...
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
         if (booking.status !== 'cancelled' && booking.status !== 'no-show') {
              actions.push(`<button class="cta-button" data-action="cancel" data-id="${booking.booking_id}" style="background-color: var(--color-danger);">取消預約</button>`);
         }
         const targetName = user?.nickname || user?.line_display_name || booking.contact_name;
         actions.push(`<button class="cta-button" data-action="send-message" data-user-id="${booking.user_id}" data-target-name="${targetName}" style="background-color: var(--color-secondary);">發送訊息</button>`);
         return actions.join('');
     }
     function renderOrderActions(order, user) {
        // ... (保持不變) ...
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
        // ... (保持不變) ...
          const targetName = profile.nickname || profile.line_display_name;
          return `
            <button class="cta-button" data-action="edit-customer" data-user-id="${profile.user_id}" style="background-color: var(--color-primary);">編輯資料</button>
            <button class="cta-button" data-action="send-message" data-user-id="${profile.user_id}" data-target-name="${targetName}" style="background-color: var(--color-secondary);">發送訊息</button>
          `;
     }
     function bindModalActions() {
        // ... (保持不變) ...
         detailsModalActions.querySelectorAll('button').forEach(button => {
             button.addEventListener('click', handleModalAction);
         });
     }
     async function handleModalAction(event) {
        // ... (保持不變) ...
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
                     await fetchData('/api/update-booking-status', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ bookingId: Number(id), status: 'checked-in' }) });
                     alert('狀態已更新！'); updateHistoryState('details', 'close');
                     switchTab(document.querySelector('#owner-tab-bar .active').dataset.tab);
                     break;
                 case 'cancel':
                     if (confirm('確定要取消此預約嗎？')) {
                         await fetchData('/api/update-booking-status', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ bookingId: Number(id), status: 'cancelled' }) });
                         alert('預約已取消！'); updateHistoryState('details', 'close');
                         switchTab(document.querySelector('#owner-tab-bar .active').dataset.tab);
                     } else {
                          button.disabled = false; button.textContent = '取消預約';
                     }
                     break;
                 case 'ship':
                     alert('訂單已標示為已出貨！(模擬)'); updateHistoryState('details', 'close');
                     switchTab(document.querySelector('#owner-tab-bar .active').dataset.tab);
                     break;
                 case 'cancel-order':
                     if (confirm('確定要取消此訂單嗎？')) {
                         alert('訂單已取消！(模擬)'); updateHistoryState('details', 'close');
                         switchTab(document.querySelector('#owner-tab-bar .active').dataset.tab);
                     } else {
                         button.disabled = false; button.textContent = '取消訂單';
                     }
                     break;
                 case 'send-message':
                      await openSendMessageModal(targetUserId, targetName);
                      button.disabled = false; button.textContent = '發送訊息';
                      updateHistoryState('details', 'close');
                      break;
                 case 'edit-customer':
                     await openEditCustomerModal();
                     button.disabled = false; button.textContent = '編輯資料';
                     updateHistoryState('details', 'close');
                     break;
                 default:
                     console.warn('未知的 Modal 操作:', action);
                     button.disabled = false; button.textContent = '未知操作';
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
             else if (action === 'edit-customer') button.textContent = '編輯資料';
             else button.textContent = '操作失敗';
         }
     }
    async function openSendMessageModal(targetUserId, targetName) {
        // ... (保持不變) ...
        if (!sendMessageModal || !messageDraftSelect || !directMessageContent || !sendMessageSubmitBtn) {
            alert('訊息介面初始化失敗！'); return;
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
            updateHistoryState('send-message', 'open');
            if (allMessageDrafts.length === 0) {
                allMessageDrafts = await fetchData('/api/admin/message-drafts');
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
        // ... (保持不變) ...
        const button = event.target;
        const targetUserId = button.dataset.userId;
        const message = directMessageContent.value.trim();
        if (!message) { alert('訊息內容不可為空！'); return; }
        if (!targetUserId) { alert('錯誤：找不到目標使用者 ID！'); return; }
        button.disabled = true;
        button.textContent = '發送中...';
        try {
            await fetchData('/api/send-message', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userId: targetUserId, message: message })
            });
            alert('訊息已發送！');
            updateHistoryState('send-message', 'close');
        } catch (error) {
            alert(`[handleSendMessageSubmit Error] ${error.message}\n\nStack: ${error.stack}`);
            alert(`發送失敗：${error.message}`);
        } finally {
            button.disabled = false;
            button.textContent = '確認發送';
        }
    }

    // --- 快速預約相關功能 (v6.3 邏輯) ---
    function openQuickBookingModal() {
        // ... (保持不變) ...
        console.log("開啟快速預約 Modal...");
        quickBookingForm.reset();
        resetCustomerSearch();
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
        if (qbDatePicker) qbDatePicker.destroy();
        qbDatePicker = flatpickr("#qb-booking-date", {
            dateFormat: "Y-m-d",
            locale: "zh_tw",
            defaultDate: "today"
        });
        const now = new Date();
        const nextHour = (now.getMinutes() > 30) ? now.getHours() + 1 : now.getHours();
        const nextMinute = (now.getMinutes() > 30) ? '00' : '30';
        document.getElementById('qb-booking-time').value = `${String(nextHour).padStart(2, '0')}:${nextMinute}`;
        quickBookingModal.style.display = 'flex';
        updateHistoryState('quick-booking', 'open');
    }
    async function handleCustomerSearchInput(e) {
        // ... (保持不變) ...
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
        // ... (保持不變) ...
        const item = e.target.closest('.customer-result-item');
        if (!item) return;
        const userId = item.dataset.userId;
        const userName = item.dataset.userName;
        const userPhone = item.dataset.userPhone;
        qbCustomerSelectedId.value = userId;
        qbCustomerSelectedName.textContent = userName;
        qbContactPhone.value = userPhone;
        qbCustomerSearchResults.style.display = 'none';
        qbCustomerSearchInput.style.display = 'none';
        qbCustomerSelectedView.style.display = 'block';
    }
    function resetCustomerSearch() {
        // ... (保持不變) ...
        qbCustomerSelectedId.value = '';
        qbCustomerSelectedName.textContent = '';
        qbContactPhone.value = '';
        qbCustomerSearchInput.value = '';
        qbCustomerSearchResults.style.display = 'none';
        qbCustomerSearchInput.style.display = 'block';
        qbCustomerSelectedView.style.display = 'none';
    }
    async function handleQuickBookingSubmit(e) {
        // ... (保持不變) ...
        e.preventDefault();
        const button = document.getElementById('quick-booking-submit-btn');
        button.disabled = true;
        button.textContent = '建立中...';
        try {
            let finalUserId = qbCustomerSelectedId.value;
            let finalContactName = qbCustomerSelectedName.textContent;
            if (!finalUserId) {
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
            if (!selectedProductId) { throw new Error('請選擇一個預約項目'); }
            const product = allProducts.find(p => p.product_id === selectedProductId);
            if (!product) { throw new Error('找不到對應的產品資料'); }
            const bookingDate = document.getElementById('qb-booking-date').value;
            const timeSlot = document.getElementById('qb-booking-time').value;
            const numOfPeople = document.getElementById('qb-booking-people').value;
            if (!bookingDate || !timeSlot) { throw new Error('日期和時段為必填'); }
            const price = getPriceForDate(bookingDate, product);
            if (price === null) {
                 throw new Error(`項目 "${product.name}" 在 ${bookingDate} 價格未定，無法預約`);
            }
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
                items: [ { name: product.name, qty: 1, price: price } ] // 注意：這裡是 name, qty, price
            };
            await fetchData('/api/admin/create-booking', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            alert('快速預約建立成功！');
            updateHistoryState('quick-booking', 'close');
            switchTab(document.querySelector('#owner-tab-bar .active').dataset.tab);
        } catch (error) {
            alert(`[QuickBooking Error] 建立失敗: ${error.message}\n\nStack: ${error.stack}`);
        } finally {
            button.disabled = false;
            button.textContent = '確認建立';
        }
    }
    function getPriceForDate(dateString, product) {
        // ... (保持不變) ...
        if (!dateString || !product) return product?.price_weekday || null;
        const date = new Date(dateString + 'T00:00:00');
        const dayOfWeek = date.getDay();
        if (dayOfWeek === 5) {
            return product.price_friday !== null ? product.price_friday : product.price_weekday;
        } else if (dayOfWeek === 6) {
            return product.price_saturday !== null ? product.price_saturday : product.price_weekday;
        } else {
            return product.price_weekday !== null ? product.price_weekday : null;
        }
    }

    // --- 【刪除】簡易控房相關功能 ---
    // function openRoomControlModal() { ... }
    // async function handleRoomControlSubmit(newStatus) { ... }

    // --- 【】控房管理 Tab (v6.4) ---
    
    // 輔助：獲取日期範圍 (從 admin 複製)
    function getRcDateRange(startDateStr, endDateStr) {
        const dates = [];
        let currentDate = new Date(startDateStr + 'T00:00:00');
        const endDate = new Date(endDateStr + 'T00:00:00');
        while (currentDate <= endDate) {
            dates.push(currentDate.toISOString().split('T')[0]);
            currentDate.setDate(currentDate.getDate() + 1);
        }
        return dates;
    }
    
    // 輔助：計算格子樣式 (從 admin 複製並簡化)
    function calculateCellVisuals(status, quantity, price) {
        let bgColor = 'var(--color-card-bg)'; // 預設
        let tooltip = '';
        let iconHtml = '';
        let buttonBgColor = '';
        let buttonText = '';
        let buttonTextColor = 'white';

        if (status === 'Open') {
            const isValidPrice = (price !== null && price !== undefined && price > 0);
            if (quantity > 0) {
                if (isValidPrice) {
                    tooltip = `可預訂 (${quantity} 間, $${price})`;
                    buttonBgColor = 'var(--color-success, green)';
                    buttonText = '開啟';
                } else {
                    const reason = (price === null || price === undefined) ? '價格未定' : '價格為零';
                    tooltip = `${reason} (${quantity} 間可用)`;
                    iconHtml = `<span class="rc-price-warning" title="${reason}">!</span>`;
                    bgColor = 'rgba(255, 193, 7, 0.3)'; // 黃色背景
                    buttonBgColor = 'var(--color-success, green)';
                    buttonText = '開啟';
                }
            } else {
                tooltip = '已售罄';
                buttonBgColor = 'var(--color-warning, #ffc107)';
                buttonText = '售完';
                buttonTextColor = 'var(--color-text-dark, #212529)';
                if (!isValidPrice) {
                     const reason = (price === null || price === undefined) ? '價格未定' : '價格為零';
                     tooltip += ` (${reason})`;
                     iconHtml = `<span class="rc-price-warning" title="${reason}">!</span>`;
                     bgColor = 'rgba(255, 193, 7, 0.3)';
                }
            }
        } else { // status === 'Closed'
            tooltip = '房間關閉';
            bgColor = 'rgba(220, 53, 69, 0.3)'; // 紅色背景
            buttonBgColor = 'var(--color-danger, red)';
            buttonText = '關閉';
        }
        return { bgColor, tooltip, iconHtml, buttonBgColor, buttonText, buttonTextColor };
    }

    // 初始化控房 Tab
function initializeRoomControl() {
    const dateInput = document.getElementById('rc-date-range-picker');
    const loadBtn = document.getElementById('rc-load-grid-btn');
    const gridContainer = document.getElementById('rc-grid-container');
    
    // ▼▼▼ 控房的房型下拉選單邏輯 ▼▼▼
    const productFilterSelect = document.getElementById('rc-product-filter');
    // ▲▲▲ 結束 ▲▲▲

    if (!dateInput || !loadBtn || !gridContainer || !productFilterSelect) { // <-- 檢查 new select
        console.error("控房 Tab缺少必要元素");
        return;
    }

    // ▼▼▼ ：填充房型下拉選單 ▼▼▼
    try {
        const templateKey = window.CONFIG?.LOGIC?.ACTIVE_INDUSTRY_TEMPLATE;
        const templateDef = window.CONFIG?.LOGIC?.INDUSTRY_TEMPLATE_DEFINITIONS[templateKey];
        const roomCategory = templateDef?.logic?.roomCategoryName || '房型';
        // 確保 allProducts 已經載入
        const roomProducts = (allProducts || []).filter(p => p.category === roomCategory);
        
        productFilterSelect.innerHTML = '<option value="all">所有房型</option>'; // 重設
        roomProducts.forEach(p => {
            productFilterSelect.add(new Option(p.name, p.product_id));
        });
    } catch (e) {
        console.error("填充控房房型篩選器失敗:", e);
        productFilterSelect.innerHTML = '<option value="all">所有房型 (載入失敗)</option>';
    }
    // ▲▲▲ 結束 ▲▲▲

    // 1. 初始化日期選擇器 (原邏輯不變)
    rcDateRangePicker = flatpickr(dateInput, {
        mode: "range",
        dateFormat: "Y-m-d",
        locale: "zh_tw",
        defaultDate: [new Date(), new Date(new Date().setDate(new Date().getDate() + 14))] 
    });

    // 2. 綁定載入按鈕 (原邏輯不變)
    loadBtn.addEventListener('click', loadRoomControlGrid);

    // 3. 綁定格線事件 (原邏輯不變)
    gridContainer.addEventListener('click', (e) => handleRoomGridEvent(e, 'click'));
    gridContainer.addEventListener('change', (e) => handleRoomGridEvent(e, 'change'));

    // 4. 首次載入 (原邏輯不變)
    loadRoomControlGrid();
}

    // 載入控房格線資料
    async function loadRoomControlGrid() {
        const gridContainer = document.getElementById('rc-grid-container');
        const loadBtn = document.getElementById('rc-load-grid-btn');
        if (!rcDateRangePicker || !gridContainer || !loadBtn) return;
        
        const dateRange = rcDateRangePicker.selectedDates;
        if (dateRange.length < 2) {
            alert("請選擇一個有效的日期範圍");
            return;
        }

        const startDate = flatpickr.formatDate(dateRange[0], "Y-m-d");
        const endDate = flatpickr.formatDate(dateRange[1], "Y-m-d");

        rcDisplayedDates = getRcDateRange(startDate, endDate);
        
        if (rcDisplayedDates.length > 90) { // 限制查詢天數
            alert("日期範圍過大，請選擇 90 天以內的範圍");
            return;
        }

        gridContainer.innerHTML = '<p>正在載入房況資料...</p>';
        loadBtn.disabled = true;

        try {
            const params = new URLSearchParams({ startDate, endDate });
            currentRoomInventoryData = await fetchData(`/api/admin/get-room-inventory?${params.toString()}`);
            renderRoomControlGrid();
        } catch (error) {
            gridContainer.innerHTML = `<p style="color:red;">載入房況失敗: ${error.message}</p>`;
        } finally {
            loadBtn.disabled = false;
        }
    }

    // 渲染控房格線
function renderRoomControlGrid() {
    const container = document.getElementById('rc-grid-container');
    // ▼▼▼ ：讀取房型篩選器的值 ▼▼▼
    const productFilterSelect = document.getElementById('rc-product-filter');
    const selectedProductId = productFilterSelect ? productFilterSelect.value : 'all';
    // ▲▲▲ 結束 ▲▲▲

    if (!container) return;
    
    // 篩選出民宿房型 (原邏輯)
    const templateKey = window.CONFIG?.LOGIC?.ACTIVE_INDUSTRY_TEMPLATE;
    const templateDef = window.CONFIG?.LOGIC?.INDUSTRY_TEMPLATE_DEFINITIONS[templateKey];
    const roomCategory = templateDef?.logic?.roomCategoryName || '房型';
    const baseProductsToRender = (allProducts || []).filter(p => p.category === roomCategory);

    // ▼▼▼ 修改：根據 selectedProductId 再次篩選 ▼▼▼
    const productsToRender = (selectedProductId === 'all')
        ? baseProductsToRender
        : baseProductsToRender.filter(p => p.product_id === selectedProductId);
    // ▲▲▲ 修改結束 ▲▲▲

    if (productsToRender.length === 0 || rcDisplayedDates.length === 0) {
        container.innerHTML = '<p>沒有找到符合條件的房型或日期。</p>'; // <--- 修改提示訊息
        return;
    }

    let tableHtml = '<table class="rc-table">';
    // 表頭 (日期)
    tableHtml += '<thead><tr><th>房型</th>';
    rcDisplayedDates.forEach(dateStr => {
        const date = new Date(dateStr + 'T00:00:00');
        const monthDay = `${date.getMonth() + 1}/${date.getDate()}`;
        const dayOfWeek = weekdayShort[date.getDay()];
        tableHtml += `<th>${monthDay}<br>${dayOfWeek}</th>`;
    });
    tableHtml += '</tr></thead>';

    // 表格內容 (使用 productsToRender 進行)
    tableHtml += '<tbody>';
    productsToRender.forEach(product => { // <-- 這裡使用了新的 productsToRender
        tableHtml += `<tr><td>${product.name}</td>`; // 房型名稱
        rcDisplayedDates.forEach(dateStr => {
            const inventory = currentRoomInventoryData[product.product_id]?.[dateStr];
            const status = inventory?.status || 'Closed';
            const quantity = inventory?.quantity_available ?? 0;
            const price = inventory?.base_price;
            const priceText = (price === null || price === undefined) ? '' : String(price);

            const visuals = calculateCellVisuals(status, quantity, price);

            tableHtml += `
                <td style="background-color: ${visuals.bgColor};" data-product-id="${product.product_id}" data-date="${dateStr}" title="${visuals.tooltip}">
                    <button class="rc-status-btn ${status === 'Open' ? (quantity > 0 ? 'status-open' : 'status-soldout') : 'status-closed'}" 
                            data-status="${status}"
                            style="background-color: ${visuals.buttonBgColor}; color: ${visuals.buttonTextColor};">
                        ${visuals.buttonText}
                    </button>
                    <input type="number" class="rc-quantity-input" value="${quantity}" min="0" ${status === 'Closed' ? 'disabled' : ''}>
                    <input type="number" class="rc-price-input" value="${priceText}" placeholder="預設" min="0" ${status === 'Closed' ? 'disabled' : ''}>
                    ${visuals.iconHtml}
                </td>`;
        });
        tableHtml += `</tr>`;
    });
    tableHtml += '</tbody></table>';
    container.innerHTML = tableHtml;
}

    // 處理控房格線的事件
    async function handleRoomGridEvent(e, eventType) {
        const target = e.target;
        const cell = target.closest('td[data-product-id][data-date]');
        if (!cell) return;

        const productId = cell.dataset.productId;
        const date = cell.dataset.date;
        let payload = { updates: [] };
        let updateType = '';

        try {
            if (eventType === 'click' && target.classList.contains('rc-status-btn')) {
                // --- 1. 點擊狀態按鈕 ---
                target.disabled = true;
                target.textContent = '...';
                const currentStatus = target.dataset.status;
                const newStatus = currentStatus === 'Open' ? 'Closed' : 'Open';
                payload.updates.push({ productId, date, status: newStatus });
                updateType = 'status';

            } else if (eventType === 'change' && (target.classList.contains('rc-quantity-input') || target.classList.contains('rc-price-input'))) {
                // --- 2. 修改數量或價格 ---
                const qtyInput = cell.querySelector('.rc-quantity-input');
                const priceInput = cell.querySelector('.rc-price-input');
                
                const quantity = parseInt(qtyInput.value, 10);
                const priceStr = priceInput.value.trim();
                const price = (priceStr === '') ? null : parseInt(priceStr, 10);

                if (isNaN(quantity) || quantity < 0) {
                    alert('數量必須是有效的非負整數');
                    qtyInput.value = currentRoomInventoryData[productId]?.[date]?.quantity_available ?? 0; // 恢復原值
                    return;
                }
                if (priceStr !== '' && (isNaN(price) || price < 0)) {
                    alert('價格必須是有效的非負數字，或留空使用預設價');
                    const oldPrice = currentRoomInventoryData[productId]?.[date]?.base_price;
                    priceInput.value = (oldPrice === null || oldPrice === undefined) ? '' : oldPrice; // 恢復原值
                    return;
                }
                
                // 兩種輸入框都更新，所以一次發送
                payload.updates.push({ productId, date, quantity: quantity, price: price });
                updateType = 'inputs';
            } else {
                return; // 不是目標事件
            }

            // --- 呼叫 API ---
            await fetchData('/api/admin/update-room-inventory', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            // --- API 成功後，更新本地快取和 UI ---
            const updatedData = payload.updates[0];
            if (!currentRoomInventoryData[productId]) currentRoomInventoryData[productId] = {};
            if (!currentRoomInventoryData[productId][date]) currentRoomInventoryData[productId][date] = {};
            
            if (updateType === 'status') {
                currentRoomInventoryData[productId][date].status = updatedData.status;
            }
            if (updateType === 'inputs') {
                currentRoomInventoryData[productId][date].quantity_available = updatedData.quantity;
                currentRoomInventoryData[productId][date].base_price = updatedData.price;
            }

            // 重新渲染該格
            updateCellVisuals(cell);

        } catch (error) {
            alert(`更新失敗: ${error.message}`);
            // 失敗時，重新渲染格線以恢復到 API 的狀態
            renderRoomControlGrid();
        } finally {
            if (updateType === 'status') {
                target.disabled = false; // 恢復按鈕
            }
        }
    }

    // 輔助：只更新單一格的 UI (從 admin 複製)
    function updateCellVisuals(cell) {
        if (!cell) return;
        const productId = cell.dataset.productId;
        const date = cell.dataset.date;
        
        const inventory = currentRoomInventoryData[productId]?.[date];
        const status = inventory?.status || 'Closed';
        const quantity = inventory?.quantity_available ?? 0;
        const price = inventory?.base_price;
        const priceText = (price === null || price === undefined) ? '' : String(price);

        const visuals = calculateCellVisuals(status, quantity, price);

        cell.style.backgroundColor = visuals.bgColor;
        cell.title = visuals.tooltip;

        const statusBtn = cell.querySelector('.rc-status-btn');
        const qtyInput = cell.querySelector('.rc-quantity-input');
        const priceInput = cell.querySelector('.rc-price-input');
        
        if(statusBtn) {
            statusBtn.dataset.status = status;
            statusBtn.style.backgroundColor = visuals.buttonBgColor;
            statusBtn.style.color = visuals.buttonTextColor;
            statusBtn.textContent = visuals.buttonText;
            statusBtn.className = `rc-status-btn ${status === 'Open' ? (quantity > 0 ? 'status-open' : 'status-soldout') : 'status-closed'}`;
        }
        if(qtyInput) {
            qtyInput.value = quantity;
            qtyInput.disabled = (status === 'Closed');
        }
        if(priceInput) {
            priceInput.value = priceText;
            priceInput.disabled = (status === 'Closed');
        }
        
        let iconSpan = cell.querySelector('.rc-price-warning');
        if (visuals.iconHtml) {
            if (!iconSpan) {
                iconSpan = document.createElement('span');
                priceInput.parentNode.insertBefore(iconSpan, priceInput.nextSibling);
            }
            iconSpan.outerHTML = visuals.iconHtml;
        } else if (iconSpan) {
            iconSpan.remove();
        }
    }

// --- ▼▼▼ 新增：核銷票券相關函式 (2 個) ▼▼▼ ---
    
    /**
     * 任務 3.5: 啟動核銷掃碼器
     */
    function startRedeemScanner() {
        if (!redeemQrReader || !startRedeemScanBtn || !redeemStatusMessage) {
            console.error("核銷 Tab 的 DOM 元素未正確獲取");
            return;
        }

        redeemQrReader.style.display = 'block';
        startRedeemScanBtn.style.display = 'none';
        redeemStatusMessage.textContent = '請對準 QR Code...';
        redeemStatusMessage.style.color = 'var(--color-text-primary)'; // 恢復預設顏色

        if (html5QrCodeScanner && html5QrCodeScanner.isScanning) {
            console.log("Scanner already running.");
            return; // 已經在掃描了
        }

        // 初始化掃描器
        if (!html5QrCodeScanner) {
            try {
                // 確保 Html5Qrcode 存在
                if (typeof Html5Qrcode === 'undefined') {
                    throw new Error('Html5Qrcode library not loaded');
                }
                html5QrCodeScanner = new Html5Qrcode("redeem-qr-reader");
                console.log("New Html5Qrcode instance created for redeem.");
            } catch (e) {
                console.error("初始化 Html5Qrcode 失敗:", e);
                redeemStatusMessage.textContent = `掃碼器初始化失敗: ${e.message}`;
                redeemStatusMessage.style.color = 'var(--color-danger)';
                redeemQrReader.style.display = 'none';
                startRedeemScanBtn.style.display = 'block';
                return;
            }
        }

        // 啟動掃描
        html5QrCodeScanner.start(
            { facingMode: "environment" }, // 優先使用後置鏡頭
            { 
                fps: 10, 
                qrbox: (videoWidth, videoHeight) => {
                    const minEdge = Math.min(videoWidth, videoHeight);
                    const qrboxSize = Math.floor(minEdge * 0.7); // 使用 70% 的大小
                    return { width: qrboxSize, height: qrboxSize };
                }
            },
            onRedeemScanSuccess, // 成功掃描後的回呼
            (errorMessage) => { 
                // 掃描中的錯誤 (通常不用顯示)
                // console.warn(`QR scan error: ${errorMessage}`); 
            }
        ).catch((err) => {
            console.error("啟動相機失敗:", err);
            redeemStatusMessage.textContent = `無法啟動相機: ${err}`;
            redeemStatusMessage.style.color = 'var(--color-danger)';
            redeemQrReader.style.display = 'none';
            startRedeemScanBtn.style.display = 'block';
        });
    }

    /**
     * 任務 3.5: 掃描成功後的回呼函式
     * @param {string} decodedText - 掃描到的 QR Code 內容 (應為 voucherId)
     */
    async function onRedeemScanSuccess(decodedText, decodedResult) {
        if (!html5QrCodeScanner) return;
        
        try {
            redeemStatusMessage.textContent = `掃描成功: ${decodedText}。\n正在核銷...`;
            
            // 停止掃描器
            if (html5QrCodeScanner.isScanning) {
                 await html5QrCodeScanner.stop();
            }
            redeemQrReader.style.display = 'none';
            
            // 呼叫 Task 3.2 建立的 API
            const result = await fetchData('/api/admin/redeem-voucher', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ voucherId: decodedText }) // 假設 QR Code 內容就是 voucherId
            });

            if (result.success) {
                redeemStatusMessage.textContent = `✅ 核銷成功！\n(${result.message || '已標記為已使用'})`;
                redeemStatusMessage.style.color = 'var(--color-success)';
            } else {
                // API 回傳了 { error: "..." }
                throw new Error(result.error || '核銷失敗');
            }

        } catch (error) {
            console.error("核銷失敗:", error);
            redeemStatusMessage.textContent = `❌ 核銷失敗：\n${error.message}`;
            redeemStatusMessage.style.color = 'var(--color-danger)';
        } finally {
            // 允許再次掃描
            if(startRedeemScanBtn) {
                startRedeemScanBtn.style.display = 'block';
                startRedeemScanBtn.textContent = '掃描下一個';
            }
        }
    }
    // --- ▲▲▲ 新增函式結束 ▲▲▲ ---


    // --- 編輯顧客功能 (v6.3 邏輯) ---
    function openEditCustomerModal() {
        // ... (保持不變) ...
        if (!currentEditingProfile) {
            alert("錯誤：找不到要編輯的顧客資料。");
            return;
        }
        editCustomerModalTitle.textContent = `編輯: ${currentEditingProfile.nickname || currentEditingProfile.line_display_name}`;
        editCustomerUserId.value = currentEditingProfile.user_id;
        editCustomerPhone.value = currentEditingProfile.phone || '';
        editCustomerNotes.value = currentEditingProfile.notes || '';
        editCustomerModal.style.display = 'flex';
        updateHistoryState('edit-customer', 'open');
    }
    async function handleEditCustomerSubmit(e) {
        // ... (保持不變) ...
        e.preventDefault();
        const button = document.getElementById('edit-customer-submit-btn');
        button.disabled = true;
        button.textContent = '儲存中...';
        const userId = editCustomerUserId.value;
        const phone = editCustomerPhone.value.trim();
        const notes = editCustomerNotes.value.trim();
        try {
            if (phone && !/^09\d{8}$/.test(phone)) {
                 throw new Error('請輸入正確的 10 碼手機號碼 (09開頭)，或留空');
            }
            const payload = { userId: userId, phone: phone || null, notes: notes || null };
            const result = await fetchData('/api/admin/update-user-details', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            alert('顧客資料更新成功！');
            updateHistoryState('edit-customer', 'close');
            if (result.updatedUser) {
                currentEditingProfile = result.updatedUser;
            } else {
                currentEditingProfile.phone = phone || null;
                currentEditingProfile.notes = notes || null;
            }
            openCustomerDetailsModal(userId);
        } catch (error) {
            alert(`[EditCustomer Error] 儲存失敗: ${error.message}`);
        } finally {
            button.disabled = false;
            button.textContent = '儲存變更';
        }
    }

    // --- (generateAndOpenAdminLink - 保持不變) ---
    async function generateAndOpenAdminLink() {
        // ... (保持不變) ...
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