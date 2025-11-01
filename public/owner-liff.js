// public/owner-liff.js (v4 - Tabbed Interface & Calendar Base)
// 【已套用錯誤處理修正 v4.1】

document.addEventListener('DOMContentLoaded', () => {
    const myLiffId = "2008296713-vPAkV7xr"; // 請確認這是您的老闆 LIFF ID
    let userId = null;
    let currentTemplate = null; // 儲存當前樣板類型
    let flatpickrInstance = null; // 日曆實例
    let currentSelectedDate = new Date(); // 當前日曆選擇的日期

    // --- DOM 元素快取 ---
    const loadingView = document.getElementById('loading-view');
    const unauthorizedView = document.getElementById('unauthorized-view');
    const mainView = document.getElementById('main-view');
    const appHeaderTitle = document.querySelector('#app-header h1'); // 更新選擇器
    const tabBar = document.getElementById('owner-tab-bar');
    const tabContents = document.querySelectorAll('.tab-content');
    const activityListContent = document.getElementById('activity-list-content');
    const calendarPlaceholder = document.getElementById('calendar-placeholder');
    const selectedDateDisplay = document.getElementById('selected-date-display');
    const dailyCardsContainer = document.getElementById('daily-cards-container');
    const orderListContent = document.getElementById('order-list-content');
    const customerSearchResults = document.getElementById('customer-search-results');
    const detailsModal = document.getElementById('details-modal');
    const detailsModalTitle = document.getElementById('details-modal-title');
    const detailsModalBody = document.getElementById('details-modal-body');
    const detailsModalActions = document.getElementById('details-modal-actions');
    const detailsModalCloseBtn = detailsModal.querySelector('.modal-close');

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
            // 嘗試解析 JSON，如果失敗則回傳純文字錯誤
            const text = await response.text();
            try {
                return JSON.parse(text);
            } catch (e) {
                 // 如果 API 回應的不是 JSON (例如 HTML 錯誤頁面)
                 console.warn(`API ${url.split('/').pop()} 回應非 JSON:`, text.substring(0, 100));
                 // 嘗試從 text 中提取錯誤訊息 (如果有的話)
                 const match = text.match(/<pre>(.*?)<\/pre>/i); // 嘗試抓 <pre> 標籤內容
                 const extractedError = match ? match[1] : `非預期的回應格式 (非 JSON)`;
                 throw new Error(extractedError);
            }
        } catch (error) {
            console.error(error);
            // 改為在 Modal 或特定區域顯示錯誤，避免覆蓋整個畫面
            displayInlineError(error.message, getCurrentVisibleTabContentId());
            throw error;
        }
    }

    // --- UI 輔助函式 (【已修正】) ---
    function displayInlineError(message, containerId = 'activity-list-content') {
        const container = document.getElementById(containerId);
        // 【修改】確保 container 存在，且不是 'loading-view'
        if (container && container.id !== 'loading-view') { 
            container.innerHTML = `<p style="color: var(--color-danger); text-align: center;">${message}</p>`;
        } else {
             // 如果容器未找到，或就是 loading-view，僅在 console 紀錄
             // 錯誤將由 main() 函數的 catch 區塊統一處理
             console.error(`Inline error display failed for container '${containerId}'. Error: ${message}`);
        }
    }

    function getCurrentVisibleTabContentId() {
        const activeTab = document.querySelector('.tab-content.active');
        return activeTab ? activeTab.id : 'tab-content-activity'; // 預設返回活動列表
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
        // 更新按鈕狀態
        tabBar.querySelectorAll('.tab-button').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.tab === tabId);
        });
        // 顯示對應內容
        tabContents.forEach(content => {
            content.classList.toggle('active', content.id === `tab-content-${tabId}`);
        });

        // 根據 Tab 加載數據 (如果尚未加載)
        switch (tabId) {
            case 'activity':
                loadActivities(); // 每次切換都可能需要刷新
                break;
            case 'calendar':
                // 只有在第一次切換到日曆時初始化
                if (!flatpickrInstance && calendarTabButton.style.display !== 'none') {
                    initializeCalendar();
                } else if (calendarTabButton.style.display !== 'none') {
                     // 如果已初始化，刷新當天卡片
                     loadDailyCards(currentSelectedDate);
                }
                break;
            case 'order':
                loadOrderList(); // 每次切換都可能需要刷新或根據篩選條件刷新
                break;
             case 'customer':
                // 可以選擇在這裡清空搜尋結果或保留上次結果
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
                initializeAppUI(currentTemplate); // 調整 UI 顯示
                setupEventListeners();          // 綁定事件
                switchTab('activity');          // 顯示預設 Tab 並載入數據
            } else {
                loadingView.style.display = 'none';
                unauthorizedView.style.display = 'block';
            }
        } catch (error) {
             // 【修改】
             // 即使 fetchData 已經在 loadingView 顯示錯誤，我們仍要確保切換視圖
             console.error("Main function catch block:", error); // 在 console 顯示完整錯誤
             if (loadingView && unauthorizedView) {
                loadingView.style.display = 'none';
                unauthorizedView.style.display = 'block';
                // 在 unauthorizedView 中顯示更清楚的錯誤
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
        appHeaderTitle.textContent = "商家管理面板"; // 或根據樣板設定

        // 隱藏/顯示 Tab 按鈕和特定功能按鈕
        if (template === 'ecommerce_template') {
            calendarTabButton.style.display = 'none'; // 電商隱藏日曆 Tab
            manageRoomsBtn.style.display = 'none';
            ecommerceManageBtns.style.display = 'flex'; // 顯示電商管理按鈕
        } else {
            calendarTabButton.style.display = ''; // 其他樣板顯示日曆 Tab
            ecommerceManageBtns.style.display = 'none';
            if (template === 'guesthouse_template') {
                manageRoomsBtn.style.display = 'block'; // 民宿顯示控房按鈕
            } else {
                manageRoomsBtn.style.display = 'none';
            }
        }
        // 根據需要調整其他 UI 元素...
    }

    // --- 事件綁定 ---
    function setupEventListeners() {
        // Tab 按鈕點擊
        tabBar.addEventListener('click', (e) => {
            const button = e.target.closest('.tab-button');
            if (button && button.dataset.tab) {
                switchTab(button.dataset.tab);
            }
        });

        // Modal 關閉按鈕
        detailsModalCloseBtn.addEventListener('click', hideModal);

        // 最新動態列表點擊 (事件委派)
        activityListContent.addEventListener('click', (e) => {
            const card = e.target.closest('.activity-card');
            if (card && card.dataset.id) {
                 const type = card.dataset.type; // 'booking' or 'order' or 'user'
                 const id = card.dataset.id;
                 openDetailsModal(type, id);
            }
        });

         // 日曆下方卡片點擊 (事件委派)
         dailyCardsContainer.addEventListener('click', (e) => {
            const card = e.target.closest('.daily-card');
            if (card && card.dataset.id) {
                 const type = card.dataset.type; // 'booking' or 'order'
                 const id = card.dataset.id;
                 openDetailsModal(type, id);
            }
        });

        // 訂單列表點擊 (事件委派)
        orderListContent.addEventListener('click', (e) => {
            const item = e.target.closest('.order-list-item');
            if (item && item.dataset.id) {
                 const type = item.dataset.type; // 'booking' or 'order'
                 const id = item.dataset.id;
                 openDetailsModal(type, id);
            }
        });

        // 訂單篩選按鈕
        document.getElementById('order-filter-apply-btn')?.addEventListener('click', loadOrderList);

         // 顧客搜尋按鈕
         document.getElementById('customer-search-btn')?.addEventListener('click', searchCustomers);
         customerSearchResults.addEventListener('click', (e) => { // 點擊搜尋結果
             const item = e.target.closest('.customer-result-item');
             if(item && item.dataset.userId){
                 openCustomerDetailsModal(item.dataset.userId);
             }
         });

        // 完整後台按鈕
        document.getElementById('go-to-admin-panel-btn')?.addEventListener('click', generateAndOpenAdminLink);

        // TODO: 綁定民宿控房按鈕、電商管理按鈕的事件...
    }

    // --- 數據加載與渲染 ---

    // 加載最新動態
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

                 // 嘗試從 link 中解析 ID
                 if (act.link) {
                     const parts = act.link.split('-'); // 假設 link 格式是 #bookings-123 或 #orders-456
                     if (parts.length === 2) {
                          type = parts[0].substring(1); // 'bookings' or 'orders' etc.
                          relatedId = parts[1];
                     }
                 }
                // 根據 type 決定樣式和 data-* 屬性
                 if (type === 'bookings' || type === 'orders') { // 簡化處理
                    // 可根據 act.message 判斷是否為取消單
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
        } catch (error) {
            // displayInlineError 已在 fetchData 中處理
        }
    }

    // 初始化日曆
    async function initializeCalendar() {
        calendarPlaceholder.innerHTML = ''; // 清空 placeholder
        let eventsMarkDates = [];
        try {
            // TODO: 後端需要一個 API 回傳指定月份有事件的日期
            // const eventDatesResult = await fetchData('/api/admin/get-event-dates?month=...');
            // eventsMarkDates = eventDatesResult.dates; // 假設 API 回傳 ["2025-10-26", "2025-11-26"]
        } catch (error) {
            console.error("無法載入日曆事件標記:", error);
        }

        flatpickrInstance = flatpickr(calendarPlaceholder, {
            locale: "zh_tw", // 使用繁體中文
            inline: true,    // 內嵌顯示
            onChange: function(selectedDates, dateStr, instance) {
                if (selectedDates.length > 0) {
                    currentSelectedDate = selectedDates[0];
                    const formattedDate = currentSelectedDate.toLocaleDateString('sv-SE'); // YYYY-MM-DD
                    selectedDateDisplay.textContent = formattedDate;
                    loadDailyCards(currentSelectedDate);
                }
            },
            onReady: function(selectedDates, dateStr, instance) {
                // 初始加載當天數據
                 const today = new Date();
                 currentSelectedDate = today;
                 selectedDateDisplay.textContent = today.toLocaleDateString('sv-SE');
                 loadDailyCards(today);
                 // 標記有事件的日期
                 markCalendarDates(instance, eventsMarkDates);
            },
             onMonthChange: async function(selectedDates, dateStr, instance) {
                 // TODO: 月份變更時，重新獲取該月有事件的日期並標記
                 // const newMonthEvents = await fetchData('/api/admin/get-event-dates?month=...');
                 // markCalendarDates(instance, newMonthEvents.dates);
             }
        });
    }

    // 標記日曆上有事件的日期
    function markCalendarDates(calendarInstance, datesToMark) {
        if (!calendarInstance || !datesToMark || datesToMark.length === 0) return;
        // 清除舊標記 (如果需要)
        calendarInstance.calendarContainer.querySelectorAll('.has-event').forEach(day => day.classList.remove('has-event'));
        // 添加新標記
        datesToMark.forEach(dateStr => {
            const dayElement = calendarInstance.calendarContainer.querySelector(`.flatpickr-day[aria-label="${flatpickr.formatDate(new Date(dateStr + 'T00:00:00'), 'F j, Y')}"]`); // 需要校驗時區問題
            if (dayElement) {
                dayElement.classList.add('has-event');
            }
        });
    }

    // 加載指定日期的卡片摘要
    async function loadDailyCards(date) {
        dailyCardsContainer.innerHTML = '<p>正在載入今日事項...</p>';
        const dateStr = date.toISOString().split('T')[0]; // YYYY-MM-DD
        let apiUrl = '';

        // 根據樣板決定 API
        if (currentTemplate === 'studio_template' || currentTemplate === 'guesthouse_template') {
            apiUrl = `/api/get-bookings?status=specific_date&date=${dateStr}`; // 假設後端支持 specific_date 篩選
        } else if (currentTemplate === 'ecommerce_template') {
             apiUrl = `/api/admin/get-orders?status=specific_date&date=${dateStr}`; // 假設後端支持
        } else {
             dailyCardsContainer.innerHTML = '<p>此樣板無日曆檢視。</p>';
             return;
        }

        try {
            const items = await fetchData(apiUrl); // TODO: 後端需實作此 API
            if (items.length === 0) {
                dailyCardsContainer.innerHTML = '<p>本日無事項。</p>';
                return;
            }

            dailyCardsContainer.innerHTML = items.map(item => {
                let cardHtml = '';
                let type = '';
                let id = null;
                let statusClass = '';

                // 根據樣板渲染卡片
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
                    id = item.order_id; // 假設訂單有 order_id
                    // TODO: 根據訂單狀態設定 statusClass
                     cardHtml = `
                         <p><strong>訂單 #${id} - ${item.customer_name}</strong></p>
                         <small>狀態: ${item.status || '未知'}, 金額: $${item.total_amount || 0}</small>
                     `;
                }

                return `<div class="daily-card ${statusClass}" data-id="${id}" data-type="${type}">${cardHtml}</div>`;
            }).join('');
        } catch (error) {
             // displayInlineError 已在 fetchData 中處理
        }
    }

    // 加載訂單/預約列表 (含篩選)
    async function loadOrderList() {
        orderListContent.innerHTML = '<p>正在載入列表...</p>';
        let apiUrl = '';
        const search = document.getElementById('order-search-input').value;
        const dateType = document.getElementById('order-date-filter-type').value;
        const startDate = document.getElementById('order-date-filter-start').value;
        const endDate = document.getElementById('order-date-filter-end').value;
        const status = document.getElementById('order-status-filter').value;

        // 構建查詢參數
        const params = new URLSearchParams();
        if (search) params.append('search', search);
        if (startDate) params.append(`${dateType}_start`, startDate);
        if (endDate) params.append(`${dateType}_end`, endDate);
        if (status) params.append('status', status);

        // 根據樣板決定 API
        if (currentTemplate === 'studio_template' || currentTemplate === 'guesthouse_template') {
            apiUrl = `/api/get-bookings?${params.toString()}`; // 假設後端支持這些參數
        } else if (currentTemplate === 'ecommerce_template') {
             apiUrl = `/api/admin/get-orders?${params.toString()}`; // 假設後端支持
        } else {
             orderListContent.innerHTML = '<p>此樣板無訂單列表。</p>';
             return;
        }

        try {
            const items = await fetchData(apiUrl); // TODO: 後端需實作篩選 API
            if (items.length === 0) {
                orderListContent.innerHTML = '<p>找不到符合條件的項目。</p>';
                return;
            }
            orderListContent.innerHTML = items.map(item => {
                 let itemHtml = '';
                 let type = '';
                 let id = null;

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
        } catch (error) {
            // displayInlineError 已在 fetchData 中處理
        }
    }

     // 搜尋顧客
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
                    <small>${user.user_id}</small>
                </div>
             `).join('');
        } catch (error) {
             // Error display handled in fetchData
        }
     }

     // --- Modal 內容生成與操作 ---

     // 打開詳細資料 Modal (通用入口)
     async function openDetailsModal(type, id) {
        showModal('載入中...', '<p>正在獲取詳細資料...</p>');
        try {
            let title = '';
            let bodyHtml = '';
            let actionsHtml = '';

            if (type === 'booking') {
                 // TODO: 需要一個 API 能獲取單筆 booking 及其 items 和 user profile
                 // const bookingDetails = await fetchData(`/api/admin/get-booking-details?id=${id}`);
                 const bookingDetails = { // 模擬數據
                      booking: { booking_id: id, booking_date: '2025-10-26', time_slot: '14:00', contact_name: '測試員', num_of_people: 2, status: 'confirmed', notes: '無', total_amount: 1280, user_id: 'U123...', created_at: Date.now()},
                      items: [{ item_name: '標準雙人房', quantity: 1, price: 1280 }],
                      user: { nickname: '測試員', line_display_name: '測試 LINE 名', phone: '0912345678' }
                 };

                 title = `預約 #${id} (${bookingDetails.booking.contact_name})`;
                 bodyHtml = renderBookingDetailsBody(bookingDetails);
                 actionsHtml = renderBookingActions(bookingDetails.booking);

            } else if (type === 'order') {
                // TODO: 需要一個 API 能獲取單筆 order 及其 items 和 user profile
                // const orderDetails = await fetchData(`/api/admin/get-order-details?id=${id}`);
                const orderDetails = { // 模擬數據
                    order: { order_id: id, customer_name: '電商客', status: 'pending', total_amount: 500, user_id: 'U456...', created_at: Date.now(), shipping_info: '...' },
                    items: [{ product_name: '商品A', quantity: 2, price: 250 }],
                    user: { nickname: '電商客', line_display_name: '電商 LINE', phone: '0987654321'}
                };
                 title = `訂單 #${id} (${orderDetails.order.customer_name})`;
                 bodyHtml = renderOrderDetailsBody(orderDetails);
                 actionsHtml = renderOrderActions(orderDetails.order);

            } else if (type === 'activity') {
                 // 活動紀錄本身可能沒有更多細節，或者可以顯示關聯訂單/用戶
                 title = `動態 #${id}`;
                 bodyHtml = `<p>這裡顯示動態的詳細內容 (如果有的話)。</p>`;
                 // 活動通常沒有操作按鈕
            } else {
                 throw new Error(`未知的詳細資料類型: ${type}`);
            }

            showModal(title, bodyHtml, actionsHtml);
            bindModalActions(); // 為新生成的按鈕綁定事件

        } catch (error) {
             showModal('錯誤', `<p style="color: var(--color-danger);">載入詳細資料失敗：${error.message}</p>`);
        }
     }

     // 打開顧客詳細資料 Modal
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

     // 渲染預約 Modal Body
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

     // 渲染訂單 Modal Body
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

    // 渲染顧客 Modal Body
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


     // 渲染預約操作按鈕
     function renderBookingActions(booking) {
         let actions = [];
         // 根據樣板和狀態決定按鈕
         if (currentTemplate === 'studio_template') {
             if (booking.status === 'confirmed') {
                 actions.push(`<button class="cta-button" data-action="check-in" data-id="${booking.booking_id}" style="background-color: var(--color-success);">標記報到</button>`);
             }
         } else if (currentTemplate === 'guesthouse_template') {
             if (booking.status === 'confirmed') {
                 actions.push(`<button class="cta-button" data-action="check-in" data-id="${booking.booking_id}" style="background-color: var(--color-success);">標記入住</button>`);
             }
             // 可加入標記退房按鈕等
         }

         // 通用取消按鈕 (如果尚未取消)
         if (booking.status !== 'cancelled') {
              actions.push(`<button class="cta-button" data-action="cancel" data-id="${booking.booking_id}" style="background-color: var(--color-danger);">取消預約</button>`);
         }
         // 可加入編輯按鈕等
          actions.push(`<button class="cta-button" data-action="send-message" data-user-id="${booking.user_id}" style="background-color: var(--color-secondary);">發送訊息</button>`);

         return actions.join('');
     }

     // 渲染訂單操作按鈕
     function renderOrderActions(order) {
          let actions = [];
         if (currentTemplate === 'ecommerce_template') {
            if (order.status === 'pending') { // 假設 'pending' 是待出貨
                 actions.push(`<button class="cta-button" data-action="ship" data-id="${order.order_id}" style="background-color: var(--color-success);">標示已出貨</button>`);
            }
             if (order.status !== 'cancelled' && order.status !== 'completed') {
                  actions.push(`<button class="cta-button" data-action="cancel-order" data-id="${order.order_id}" style="background-color: var(--color-danger);">取消訂單</button>`);
             }
         }
          actions.push(`<button class="cta-button" data-action="send-message" data-user-id="${order.user_id}" style="background-color: var(--color-secondary);">發送訊息</button>`);
         return actions.join('');
     }

    // 渲染顧客操作按鈕
     function renderCustomerActions(profile) {
          return `<button class="cta-button" data-action="send-message" data-user-id="${profile.user_id}" style="background-color: var(--color-secondary);">發送訊息給 ${profile.nickname || profile.line_display_name}</button>`;
     }

     // 為 Modal 中的按鈕綁定事件
     function bindModalActions() {
         detailsModalActions.querySelectorAll('button').forEach(button => {
             button.addEventListener('click', handleModalAction);
         });
     }

     // 處理 Modal 按鈕點擊事件
     async function handleModalAction(event) {
         const button = event.target;
         const action = button.dataset.action;
         const id = button.dataset.id; // booking_id or order_id
         const userId = button.dataset.userId; // target user id for messaging

         button.disabled = true;
         button.textContent = '處理中...';

         try {
             switch (action) {
                 case 'check-in': // 適用於工作室和民宿
                     await fetchData('/api/update-booking-status', {
                         method: 'POST',
                         headers: { 'Content-Type': 'application/json' },
                         body: JSON.stringify({ bookingId: Number(id), status: 'checked-in' })
                     });
                     alert('狀態已更新！');
                     hideModal();
                     // 刷新當前 Tab 的數據
                     switchTab(document.querySelector('#owner-tab-bar .active').dataset.tab);
                     break;
                 case 'cancel': // 適用於預約
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
                          button.disabled = false; // 取消操作，恢復按鈕
                          button.textContent = '取消預約'; // 恢復文字
                     }
                     break;
                 case 'ship': // 適用於電商訂單
                     // TODO: 呼叫標示已出貨的 API
                     // await fetchData('/api/admin/update-order-status', { method: 'POST', body: JSON.stringify({ orderId: Number(id), status: 'shipped' }) });
                     alert('訂單已標示為已出貨！(模擬)');
                     hideModal();
                     switchTab(document.querySelector('#owner-tab-bar .active').dataset.tab);
                     break;
                 case 'cancel-order': // 適用於電商訂單
                     if (confirm('確定要取消此訂單嗎？')) {
                         // TODO: 呼叫取消訂單的 API
                         // await fetchData('/api/admin/update-order-status', { method: 'POST', body: JSON.stringify({ orderId: Number(id), status: 'cancelled' }) });
                         alert('訂單已取消！(模擬)');
                         hideModal();
                         switchTab(document.querySelector('#owner-tab-bar .active').dataset.tab);
                     } else {
                         button.disabled = false;
                         button.textContent = '取消訂單';
                     }
                     break;
                 case 'send-message':
                      // 這裡需要彈出一個新的輸入框或介面來發送訊息
                      // 可以複用 admin panel 的 userManagement.js 中的 loadAndBindMessageDrafts 邏輯
                      // 暫時先用 prompt 模擬
                      const message = prompt(`請輸入要發送給 ${userId} 的訊息:`, "");
                      if (message) {
                           await fetchData('/api/send-message', { // 確認 API 路徑是否需要 /admin/ 前綴
                               method: 'POST',
                               headers: { 'Content-Type': 'application/json' },
                               body: JSON.stringify({ userId: userId, message: message })
                           });
                           alert('訊息已發送！');
                           // 發送後不一定需要關閉 modal，讓老闆可以繼續操作
                           button.disabled = false;
                           button.textContent = '發送訊息';
                      } else {
                           button.disabled = false; // 取消輸入，恢復按鈕
                           button.textContent = '發送訊息';
                      }
                      break;
                 default:
                     console.warn('未知的 Modal 操作:', action);
                     button.disabled = false; // 未知操作，恢復按鈕
                     button.textContent = '未知操作';
             }
         } catch (error) {
             alert(`操作失敗：${error.message}`);
             // 操作失敗時，恢復按鈕狀態，讓使用者可以重試
             button.disabled = false;
             // 根據 action 恢復原始文字
             if (action === 'check-in') button.textContent = '標記報到/入住';
             else if (action === 'cancel') button.textContent = '取消預約';
             else if (action === 'ship') button.textContent = '標示已出貨';
             else if (action === 'cancel-order') button.textContent = '取消訂單';
             else if (action === 'send-message') button.textContent = '發送訊息';
             else button.textContent = '操作失敗';
         }
     }

    // --- 其他輔助函式 ---
    // 產生並開啟完整後台連結 (保持不變)
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