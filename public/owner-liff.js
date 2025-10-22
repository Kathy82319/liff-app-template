// public/owner-liff.js (v3 - 數據載入版)

document.addEventListener('DOMContentLoaded', () => {
    const myLiffId = "2008296713-vPAkV7xr"; 
    let userId = null;
    let currentTemplate = null; // 儲存當前樣板類型

    // --- DOM 元素快取 ---
    const loadingView = document.getElementById('loading-view');
    const unauthorizedView = document.getElementById('unauthorized-view');
    const mainView = document.getElementById('main-view');
    const mainTitle = document.getElementById('main-title');
    const dashboardContainer = document.getElementById('dashboard-container');
    const listContainer = document.getElementById('list-container');
    const listTitle = document.getElementById('list-title');
    const listContent = document.getElementById('booking-list-content'); // 修正 ID
    const adminPanelBtn = document.getElementById('go-to-admin-panel-btn');

    // --- 輔助函式：顯示錯誤 ---
    function displayError(message) {
        console.error(message);
        if (loadingView) {
            loadingView.innerHTML = `<p style="color: red; text-align: center; white-space: pre-wrap;">${message}</p>`;
            loadingView.style.display = 'block'; // 確保錯誤可見
        }
        if (mainView) mainView.style.display = 'none';
        if (unauthorizedView) unauthorizedView.style.display = 'none';
    }

    // --- 輔助函式：API 請求 ---
    async function fetchData(url, options = {}) {
        try {
            const response = await fetch(url, options);
            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`API 請求失敗 (${url})，狀態碼: ${response.status}, 回應: ${errorText}`);
            }
            // 如果狀態碼是 204 No Content，直接回傳成功
            if (response.status === 204) return { success: true };
            return await response.json();
        } catch (error) {
            console.error(error);
            displayError(`與伺服器 (${url}) 通訊時發生錯誤:\n${error.message}`);
            throw error; // 將錯誤拋出，讓呼叫者知道
        }
    }

    // --- 主程式 ---
    async function main() {
        try {
            console.log("1. 腳本開始執行，準備初始化 LIFF...");
            await liff.init({ liffId: myLiffId });
            console.log("2. LIFF 初始化成功。");

            if (!liff.isLoggedIn()) {
                console.log("3. 使用者未登入，執行 liff.login()...");
                liff.login({ redirectUri: window.location.href });
                return;
            }
            console.log("3. 使用者已登入。");

            const profile = await liff.getProfile();
            userId = profile.userId;
            console.log(`4. 成功獲取使用者 Profile，userId: ${userId}`);

            console.log("5. 準備呼叫後端 API '/api/admin/verify-liff-user'...");
            const result = await fetchData('/api/admin/verify-liff-user', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userId: userId })
            });
            console.log("7. 成功解析後端回傳的 JSON:", result);

            if (result.success && result.isAdmin) {
                console.log("8. 驗證成功，使用者是管理員。顯示主畫面。");
                currentTemplate = result.activeTemplate; // 儲存樣板
                loadingView.style.display = 'none';
                mainView.style.display = 'block';
                initializeApp(currentTemplate); // 傳入樣板名稱
            } else {
                console.log("8. 驗證失敗或非管理員。顯示權限不足畫面。");
                loadingView.style.display = 'none';
                unauthorizedView.style.display = 'block';
            }
        } catch (error) {
            // displayError 已在 fetchData 中處理
        }
    }

    // --- 初始化 App ---
    function initializeApp(template) {
        console.log(`以 ${template} 樣板初始化管理介面`);
        mainTitle.textContent = "即時數據總覽";
        renderDashboardStructure(template); // 先畫出結構
        loadDashboardData(template);        // 再載入數據
        loadAndRenderList(template);        // 載入列表
        adminPanelBtn.addEventListener('click', generateAndOpenAdminLink);
    }

    // --- 步驟 2.2: 渲染儀表板結構 ---
    function renderDashboardStructure(template) {
        let cardsHtml = '';
        switch (template) {
            case 'studio':
                cardsHtml = `
                    <div class="stat-card"><h3>今日預約</h3><p class="stat-value" id="stat-today-guests">...</p></div>
                    <div class="stat-card"><h3>待處理</h3><p class="stat-value" id="stat-pending-bookings">...</p></div>
                    <div class="stat-card" style="grid-column: span 2;"><h3>本月營業額</h3><p class="stat-value" id="stat-monthly-revenue">...</p></div>
                `;
                break;
            case 'guesthouse': // 民宿
                 cardsHtml = `
                    <div class="stat-card"><h3>今日入住率</h3><p class="stat-value" id="stat-occupancy">...%</p></div>
                    <div class="stat-card"><h3>待處理訂房</h3><p class="stat-value" id="stat-pending-bookings">...</p></div>
                    <div class="stat-card" style="grid-column: span 2;"><h3>本月營業額</h3><p class="stat-value" id="stat-monthly-revenue">...</p></div>
                `;
                break;
            case 'ecommerce': // 電商
                 cardsHtml = `
                    <div class="stat-card"><h3>今日訂單</h3><p class="stat-value" id="stat-today-orders">...</p></div>
                    <div class="stat-card"><h3>待處理出貨</h3><p class="stat-value" id="stat-pending-shipment">...</p></div>
                    <div class="stat-card" style="grid-column: span 2;"><h3>本月營收</h3><p class="stat-value" id="stat-monthly-revenue">...</p></div>
                `;
                break;
            default:
                cardsHtml = '<p>未知的樣板類型，無法顯示儀表板。</p>';
        }
        dashboardContainer.innerHTML = `<div class="dashboard-grid">${cardsHtml}</div>`;
    }

    // --- 步驟 2.2: 載入儀表板數據 ---
    async function loadDashboardData(template) {
        try {
            const stats = await fetchData('/api/admin/dashboard-stats');

            // 更新共用的數據
            const revenueEl = document.getElementById('stat-monthly-revenue');
            if (revenueEl) {
                revenueEl.textContent = new Intl.NumberFormat('zh-TW', { style: 'currency', currency: 'TWD', minimumFractionDigits: 0 }).format(stats.monthly_revenue || 0);
            }
             const pendingEl = document.getElementById('stat-pending-bookings');
            if (pendingEl) {
                pendingEl.textContent = stats.pending_bookings || 0;
            }

            // 更新樣板專屬的數據
            switch (template) {
                case 'studio':
                    const guestsEl = document.getElementById('stat-today-guests');
                    if (guestsEl) guestsEl.textContent = stats.today_total_guests || 0;
                    break;
                case 'guesthouse':
                    const occupancyEl = document.getElementById('stat-occupancy');
                    if(occupancyEl) occupancyEl.textContent = `${stats.monthly_occupancy_rate || 0}%`; // 假設 API 會回傳入住率
                    // 待處理訂房已更新
                    break;
                case 'ecommerce':
                    const ordersEl = document.getElementById('stat-today-orders');
                    if(ordersEl) ordersEl.textContent = stats.today_orders || 0; // 假設 API 會回傳今日訂單
                    const shipmentEl = document.getElementById('stat-pending-shipment');
                    if(shipmentEl) shipmentEl.textContent = stats.pending_shipment || 0; // 假設 API 會回傳待出貨
                    break;
            }
        } catch (error) {
            // displayError 已在 fetchData 中處理，這裡可以選擇性地在卡片上顯示錯誤
             dashboardContainer.innerHTML = `<p style="color: red;">載入儀表板數據失敗。</p>`;
        }
    }

    // --- 步驟 2.3: 載入並渲染列表 ---
    async function loadAndRenderList(template) {
        let apiUrl = '';
        let title = '';

        // 根據樣板決定 API 和標題
        switch (template) {
            case 'studio':
            case 'guesthouse':
                apiUrl = '/api/get-bookings?status=today'; // 獲取今天的 booking
                title = '今日預約列表';
                break;
            case 'ecommerce':
                 apiUrl = '/api/admin/get-orders?status=today'; // 假設未來會有這個 API
                 title = '今日訂單列表';
                 break;
            default:
                 listContent.innerHTML = '<p>未知的樣板類型，無法載入列表。</p>';
                 return;
        }
        listTitle.textContent = title;
        listContent.innerHTML = '<p>正在載入資料...</p>';

        try {
            const items = await fetchData(apiUrl);
            if (items.length === 0) {
                listContent.innerHTML = '<p>今日無相關事項。</p>';
                return;
            }

            // 根據樣板渲染不同的列表項
            if (template === 'studio' || template === 'guesthouse') {
                renderBookingList(items);
            } else if (template === 'ecommerce') {
                renderOrderList(items); // 未來實作
            }

        } catch (error) {
            // displayError 已在 fetchData 中處理
            listContent.innerHTML = `<p style="color: red;">載入列表失敗。</p>`;
        }
    }

    // --- 步驟 2.3 輔助：渲染預約列表 ---
    function renderBookingList(bookings) {
        listContent.innerHTML = bookings.map(booking => {
            let statusText = '未知', statusClass = '';
            if (booking.status === 'confirmed') { statusText = '預約成功'; statusClass = 'status-confirmed'; }
            if (booking.status === 'checked-in') { statusText = '已報到'; statusClass = 'status-checked-in'; }
            if (booking.status === 'cancelled') { statusText = '已取消'; statusClass = 'status-cancelled'; }

            const itemsSummary = booking.items?.map(item => `${item.item_name} x${item.quantity}`).join(', ') || '無項目';

            // 只有在非 "已報到" 或 "已取消" 狀態下才顯示按鈕
            const actionButtons = (booking.status === 'confirmed') ? `
                <div class="booking-actions">
                    <button class="cta-button btn-check-in" data-booking-id="${booking.booking_id}" style="background-color: var(--color-success);">報到</button>
                    <button class="cta-button btn-cancel-booking" data-booking-id="${booking.booking_id}" style="background-color: var(--color-danger);">取消</button>
                </div>
            ` : '';

            return `
                <div class="booking-list-item ${statusClass}" data-booking-id="${booking.booking_id}">
                    <p><strong>${booking.time_slot} - ${booking.contact_name}</strong> (${booking.num_of_people}人)</p>
                    <p style="font-size: 0.9em; color: var(--color-text-secondary);">${itemsSummary}</p>
                    <p>狀態：${statusText}</p>
                    ${actionButtons}
                </div>
            `;
        }).join('');

        // 為新產生的按鈕綁定事件
        listContent.querySelectorAll('.btn-check-in').forEach(btn => {
            btn.addEventListener('click', () => handleUpdateBookingStatus(btn.dataset.bookingId, 'checked-in'));
        });
        listContent.querySelectorAll('.btn-cancel-booking').forEach(btn => {
            btn.addEventListener('click', () => handleUpdateBookingStatus(btn.dataset.bookingId, 'cancelled'));
        });
    }

    // --- 步驟 2.3 輔助：處理預約狀態更新 ---
    async function handleUpdateBookingStatus(bookingId, newStatus) {
        const itemElement = listContent.querySelector(`.booking-list-item[data-booking-id="${bookingId}"]`);
        const buttons = itemElement.querySelectorAll('.booking-actions button');
        buttons.forEach(btn => btn.disabled = true); // 禁用按鈕防止重複點擊

        try {
            await fetchData('/api/update-booking-status', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ bookingId: Number(bookingId), status: newStatus })
            });
            // 更新成功後，重新載入整個列表以反映最新狀態
            loadAndRenderList(currentTemplate);
            alert(`預約 #${bookingId} 狀態已更新為 ${newStatus === 'checked-in' ? '已報到' : '已取消'}！`);
        } catch (error) {
            alert(`更新狀態失敗: ${error.message}`);
            buttons.forEach(btn => btn.disabled = false); // 失敗時恢復按鈕
        }
    }

    // --- 步驟 2.4: 產生並開啟完整後台連結 ---
    async function generateAndOpenAdminLink() {
        adminPanelBtn.disabled = true;
        adminPanelBtn.textContent = '正在產生安全連結...';
        try {
            const result = await fetchData('/api/generate-admin-link', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userId: userId })
            });
            if (!result.success) throw new Error(result.error);
            liff.openWindow({ url: result.link, external: true });
        } catch (error) {
            alert(`開啟失敗: ${error.message}`);
        } finally {
            adminPanelBtn.disabled = false;
            adminPanelBtn.textContent = '開啟完整版後台';
        }
    }

    // 啟動 App
    main();
});