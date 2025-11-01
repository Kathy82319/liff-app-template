// public/owner-liff.js
// 【已套用 錯誤處理 v4.1 + 訊息功能 v5.0 + 顧客搜尋優化 v5.0】

document.addEventListener('DOMContentLoaded', () => {
    const myLiffId = "2008296713-vPAkV7xr"; // 請確認這是您的老闆 LIFF ID
    let userId = null;
    let currentTemplate = null; // 儲存當前樣板類型
    let flatpickrInstance = null; // 日曆實例
    let currentSelectedDate = new Date(); // 當前日曆選擇的日期
    let allMessageDrafts = []; // 【新增】訊息草稿快取

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

    // --- 【新增】訊息 Modal ---
    const sendMessageModal = document.getElementById('send-message-modal');
    const sendMessageModalTitle = document.getElementById('send-message-modal-title');
    const sendMessageModalCloseBtn = sendMessageModal.querySelector('.modal-close');
    const messageDraftSelect = document.getElementById('message-draft-select');
    const directMessageContent = document.getElementById('direct-message-content');
    const sendMessageSubmitBtn = document.getElementById('send-message-submit-btn');

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
            displayInlineError(error.message, getCurrentVisibleTabContentId());
            throw error;
        }
    }

    // --- UI 輔助函式 (【已修正】) ---
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

    function showModal(title, bodyHtml, actionsHtml = '') {
        detailsModalTitle.textContent = title;
        detailsModalBody.innerHTML = bodyHtml;
        detailsModalActions.innerHTML = actionsHtml;
        detailsModal.style.display = 'flex';
    }

    function hideModal() {
        detailsModal.style.display = 'none';
        detailsModalTitle.textContent = '詳細資訊';
        detailsModalBody.innerHTML = '<p>正在載入資料...</p>';
        detailsModalActions.innerHTML = '';
    }

    // --- Tab 切換邏輯 ---
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
            case 'calendar':
                if (!flatpickrInstance && calendarTabButton.style.display !== 'none') {
                    initializeCalendar();
                } else if (calendarTabButton.style.display !== 'none') {
                     loadDailyCards(currentSelectedDate);
                }
                break;
            case 'order':
                loadOrderList();
                break;
             case 'customer':
                customerSearchResults.innerHTML = '';
                document.getElementById('customer-search-input').value = '';
                break;
        }
    }

    // --- 主程式 (【已修正】) ---
    async function main() {
        try {
            await liff.init({ liffId: myLiffId });
            if (!liff.isLoggedIn()) {
                liff.login({ redirectUri: window.location.href });
                return;
            }
            const profile = await liff.getProfile();
            userId = profile.userId;

            const result = await fetchData('/api/admin/verify-liff-user', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userId: userId })
            });

            if (result.success && result.isAdmin) {
                currentTemplate = result.activeTemplate;
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

    // --- 初始化 App UI (根據樣板調整) ---
    function initializeAppUI(template) {
        appHeaderTitle.textContent = "商家管理面板"; 

        if (template === 'ecommerce_template') {
            calendarTabButton.style.display = 'none';
            manageRoomsBtn.style.display = 'none';
            ecommerceManageBtns.style.display = 'flex';
        } else {
            calendarTabButton.style.display = '';
            ecommerceManageBtns.style.display = 'none';
            if (template === 'guesthouse_template') {
                manageRoomsBtn.style.display = 'block';
            } else {
                manageRoomsBtn.style.display = 'none';
            }
        }
    }

    // --- 事件綁定 (【已修改】) ---
    function setupEventListeners() {
        tabBar.addEventListener('click', (e) => {
            const button = e.target.closest('.tab-button');
            if (button && button.dataset.tab) {
                switchTab(button.dataset.tab);
            }
        });

        // 詳情 Modal 關閉按鈕
        detailsModalCloseBtn.addEventListener('click', hideModal);

        // 【新增】訊息 Modal 關閉按鈕
        sendMessageModalCloseBtn.addEventListener('click', () => {
            sendMessageModal.style.display = 'none';
        });

        // 【新增】訊息 Modal 草稿選擇
        messageDraftSelect.addEventListener('change', (e) => {
            if (e.target.value) {
                directMessageContent.value = e.target.value;
            }
        });

        // 【新增】訊息 Modal 提交按鈕 (事件委派到 setupEventListeners 外，在 openSendMessageModal 中綁定)

        // ( ... 其他現有的 activityListContent, dailyCardsContainer, orderListContent 點擊事件 ... )
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
    }

    // --- 數據加載與渲染 ---
    // ( ... loadActivities, initializeCalendar, markCalendarDates, loadDailyCards, loadOrderList 保持不變 ... )
    async function loadActivities() {
        activityListContent.innerHTML = '<p>正在載入動態...</p>';
        try {
            const activities = await fetchData('/api/admin/activities');
            if (activities.length === 0) {
                activityListContent.innerHTML = '<p>目前沒有最新動態。</p>';
                return;
            }
            activityListContent.innerHTML = activities.map(act => {
                 let statusClass = '';
                 let relatedId = null;
                 let type = '';
                 if (act.link) {
                     const parts = act.link.split('-');
                     if (parts.length === 2) {
                          type = parts[0].substring(1);
                          relatedId = parts[1];
                     }
                 }
                 if (type === 'bookings' || type === 'orders') {
                    if (act.message.includes('取消')) {
                        statusClass = 'status-cancelled';
                    }
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
        } catch (error) {
            console.error("無法載入日曆事件標記:", error);
        }
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
            if (dayElement) {
                dayElement.classList.add('has-event');
            }
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

     // 搜尋顧客 (【已修改】)
     async function searchCustomers() {
        const query = document.getElementById('customer-search-input').value.trim();
        customerSearchResults.innerHTML = '<p>搜尋中...</p>';
        if (query.length < 1) {
            customerSearchResults.innerHTML = '<p>請輸入至少一個字元進行搜尋。</p>';
            return;
        }
        try {
             // API 現在會回傳 phone
             const users = await fetchData(`/api/admin/user-search?q=${encodeURIComponent(query)}`);
             if (users.length === 0) {
                customerSearchResults.innerHTML = '<p>找不到符合的顧客。</p>';
                return;
             }
             // 【修改】顯示 phone 而不是 user_id
             customerSearchResults.innerHTML = users.map(user => `
                <div class="customer-result-item" data-user-id="${user.user_id}" style="padding: 10px; border-bottom: 1px solid var(--color-secondary); cursor: pointer;">
                    <p><strong>${user.nickname || user.line_display_name}</strong></p>
                    <small>${user.phone || '未設定電話'}</small>
                </div>
             `).join('');
        } catch (error) {
             // Error display handled in fetchData
        }
     }

     // --- Modal 內容生成與操作 ---

     // ( ... openDetailsModal, openCustomerDetailsModal, renderBookingDetailsBody, renderOrderDetailsBody, renderCustomerDetailsBody 保持不變 ... )
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
                 actionsHtml = renderBookingActions(bookingDetails.booking, bookingDetails.user); // 【修改】傳入 user
            } else if (type === 'order') {
                const orderDetails = { // 模擬數據
                    order: { order_id: id, customer_name: '電商客', status: 'pending', total_amount: 500, user_id: 'U456...', created_at: Date.now(), shipping_info: '...' },
                    items: [{ product_name: '商品A', quantity: 2, price: 250 }],
                    user: { nickname: '電商客', line_display_name: '電商 LINE', phone: '0987654321'}
                };
                 title = `訂單 #${id} (${orderDetails.order.customer_name})`;
                 bodyHtml = renderOrderDetailsBody(orderDetails);
                 actionsHtml = renderOrderActions(orderDetails.order, orderDetails.user); // 【修改】傳入 user
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


     // 渲染預約操作按鈕 (【已修改】)
     function renderBookingActions(booking, user) { // 【修改】接收 user 物件
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
         
         // 【修改】加入 data-target-name
         const targetName = user?.nickname || user?.line_display_name || booking.contact_name;
         actions.push(`<button class="cta-button" data-action="send-message" data-user-id="${booking.user_id}" data-target-name="${targetName}" style="background-color: var(--color-secondary);">發送訊息</button>`);

         return actions.join('');
     }

     // 渲染訂單操作按鈕 (【已修改】)
     function renderOrderActions(order, user) { // 【修改】接收 user 物件
          let actions = [];
         if (currentTemplate === 'ecommerce_template') {
            if (order.status === 'pending') {
                 actions.push(`<button class="cta-button" data-action="ship" data-id="${order.order_id}" style="background-color: var(--color-success);">標示已出貨</button>`);
            }
             if (order.status !== 'cancelled' && order.status !== 'completed') {
                  actions.push(`<button class="cta-button" data-action="cancel-order" data-id="${order.order_id}" style="background-color: var(--color-danger);">取消訂單</button>`);
             }
         }
         
         // 【修改】加入 data-target-name
         const targetName = user?.nickname || user?.line_display_name || order.customer_name;
         actions.push(`<button class="cta-button" data-action="send-message" data-user-id="${order.user_id}" data-target-name="${targetName}" style="background-color: var(--color-secondary);">發送訊息</button>`);
         return actions.join('');
     }

    // 渲染顧客操作按鈕 (【已修改】)
     function renderCustomerActions(profile) {
          // 【修改】加入 data-target-name
          const targetName = profile.nickname || profile.line_display_name;
          return `<button class="cta-button" data-action="send-message" data-user-id="${profile.user_id}" data-target-name="${targetName}" style="background-color: var(--color-secondary);">發送訊息給 ${targetName}</button>`;
     }

     // 為 Modal 中的按鈕綁定事件
     function bindModalActions() {
         detailsModalActions.querySelectorAll('button').forEach(button => {
             button.addEventListener('click', handleModalAction);
         });
     }

     // 處理 Modal 按鈕點擊事件 (【已修改】)
     async function handleModalAction(event) {
         const button = event.target;
         const action = button.dataset.action;
         const id = button.dataset.id;
         const targetUserId = button.dataset.userId; // 【修改】變數改名
         const targetName = button.dataset.targetName; // 【新增】獲取目標名稱

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
                 
                 // 【修改】
                 case 'send-message':
                      await openSendMessageModal(targetUserId, targetName);
                      // 開啟新 Modal 後，恢復原 Modal 按鈕
                      button.disabled = false;
                      button.textContent = '發送訊息';
                      break;

                 default:
                     console.warn('未知的 Modal 操作:', action);
                     button.disabled = false;
                     button.textContent = '未知操作';
             }
         } catch (error) {
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

    // --- 【新增】開啟訊息發送 Modal ---
    async function openSendMessageModal(targetUserId, targetName) {
        if (!sendMessageModal || !messageDraftSelect || !directMessageContent || !sendMessageSubmitBtn) {
            alert('訊息介面初始化失敗！');
            return;
        }

        // 1. 設定 Modal 標題
        sendMessageModalTitle.textContent = `發送訊息給 ${targetName}`;

        // 2. 清空舊內容
        directMessageContent.value = '';
        messageDraftSelect.innerHTML = '<option value="">-- 載入草稿中... --</option>';

        // 3. 綁定提交按鈕 (確保移除舊監聽)
        // 使用 .cloneNode(true) 和 .replaceWith() 來移除所有舊監聽器
        const newSubmitBtn = sendMessageSubmitBtn.cloneNode(true);
        sendMessageSubmitBtn.parentNode.replaceChild(newSubmitBtn, sendMessageSubmitBtn);
        // 更新 DOM 元素快取
        sendMessageSubmitBtn = document.getElementById('send-message-submit-btn');
        
        // 綁定新的點擊事件
        newSubmitBtn.dataset.userId = targetUserId;
        newSubmitBtn.addEventListener('click', handleSendMessageSubmit);
        newSubmitBtn.disabled = false;
        newSubmitBtn.textContent = '確認發送';


        // 4. 顯示 Modal
        sendMessageModal.style.display = 'flex';

        // 5. 載入草稿 (如果快取為空)
        try {
            if (allMessageDrafts.length === 0) {
                console.log("快取為空，正在從 API 獲取訊息草稿...");
                allMessageDrafts = await fetchData('/api/admin/message-drafts');
            } else {
                 console.log("使用快取的訊息草稿");
            }

            // 6. 填充草稿下拉選單
            messageDraftSelect.innerHTML = '<option value="">-- 手動輸入或選擇草稿 --</option>';
            // 我們只顯示「一般草稿」，過濾掉系統保留的
            const generalDrafts = allMessageDrafts.filter(d => d.draft_id > 2); 
            generalDrafts.forEach(draft => {
                const option = new Option(draft.title, draft.content);
                messageDraftSelect.add(option);
            });

        } catch (error) {
            console.error("載入訊息草稿失敗:", error);
            messageDraftSelect.innerHTML = '<option value="">-- 載入草稿失敗 --</option>';
            // 即使草稿載入失敗，仍然允許手動輸入
        }
    }

    // --- 【新增】處理訊息發送提交 ---
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
            sendMessageModal.style.display = 'none'; // 關閉訊息 Modal
            
            // 注意：我們不需要關閉 detailsModal，老闆可能還想做其他操作
            // hideModal(); 

        } catch (error) {
            alert(`發送失敗：${error.message}`);
        } finally {
            // 恢復按鈕狀態（無論成功或失敗，因為 Modal 會關閉，下次開啟會重新綁定）
            button.disabled = false;
            button.textContent = '確認發送';
        }
    }


    // --- 其他輔助函式 ---
    // ( ... generateAndOpenAdminLink 保持不變 ... )
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