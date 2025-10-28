document.addEventListener('DOMContentLoaded', () => {


/**
 * 根據日期和產品資料獲取當日價格
 * @param {string} dateString - 日期字串 (YYYY-MM-DD)
 * @param {object} product - 產品物件 (包含 price_weekday, price_friday, price_saturday)
 * @returns {number | null} 當日價格或 null
 */    
    // --- 核心變數 ---
    const myLiffId = "2008032417-3yJQGaO6"; // 請確認這是您的 LIFF ID
    let userProfile = null;
    let productData = {};
    const appContent = document.getElementById('app-content');
    const pageTemplates = document.getElementById('page-templates');
    let activeTemplate = null; // 當前啟用的樣板
    let CONFIG; 

    let productView = { // 用來儲存產品列表的顯示狀態
        layout: 'grid', // 預設佈局 ('grid' or 'list')
        sort: 'default' // 預設排序 ('default', 'price_asc', 'price_desc')
    };
    let activeFilters = { // 用來儲存篩選條件
        keyword: '',
        filter_1: null,
        filter_2: null,
        filter_3: null
        // 未來可以擴充更多篩選器
    };
    // --- 狀態變數 ---
    let allProducts = [];
    let allNews = [];
    let bookingData = {};

    let guesthouseBookingData = { // Specific state for guesthouse bookings
    startDate: null,
    endDate: null,
    numberOfNights: 0,
    roomAvailability: {}, // Stores API response { productId: { isAvailable, minAvailableQuantity, pricePerNight, totalPrice } }
    selectedRooms: {} // Stores user selection { productId: quantity }
    };
    let flatpickrRangeInstance = null; // Instance for the range picker

    // --- 頁面初始化函式映射 ---
    const pageInitializers = {
        'page-home': initializeHomePage,
        'page-products': initializeProductsPage,
        'page-profile': initializeProfilePage,
        'page-my-bookings': initializeMyBookingsPage, // Keep existing
        'page-my-exp-history': initializeMyExpHistoryPage,
        'page-booking': initializeBookingPage,
        'page-info': initializeInfoPage,
        'page-edit-profile': initializeEditProfilePage,
        'page-product-details': (data) => renderProductDetails(data.product),
        'page-news-details': (data) => renderNewsDetails(data.news),
        'page-booking-details': initializeBookingDetailsPage, // Add the new initializer
    };



/**
 * 計算所選房間及入住天數的預估總金額
 */
function calculateTotalPrice() {
    let total = 0;
    const estimatedTotalPriceEl = document.getElementById('estimated-total-price');
    if (!estimatedTotalPriceEl) return;

    if (guesthouseBookingData.numberOfNights <= 0) {
        estimatedTotalPriceEl.textContent = '$0';
        return;
    }

    for (const productId in guesthouseBookingData.selectedRooms) {
        const quantity = guesthouseBookingData.selectedRooms[productId];
        const roomInfo = guesthouseBookingData.roomAvailability[productId];
        if (quantity > 0 && roomInfo && roomInfo.pricePerNight !== null) {
            // 如果 API 回傳了 totalPrice (已計算好的期間總價)，優先使用
            // 否則，使用 pricePerNight * numberOfNights 估算
            const priceForRoom = roomInfo.totalPrice !== null
                               ? roomInfo.totalPrice
                               : (roomInfo.pricePerNight * guesthouseBookingData.numberOfNights);
            total += priceForRoom * quantity;
        }
    }

    estimatedTotalPriceEl.textContent = `$${Math.round(total)}`; // 顯示四捨五入後的總價
}

/**
 * 根據 API 回應渲染房型列表 (v3 - 修正 ReferenceError)
 * @param {object} availabilityData - 從 /api/room-availability 獲取的資料
 * @param {string} startDate - 入住日期 YYYY-MM-DD
 * @param {string} endDate - 退房日期 YYYY-MM-DD
 */
function renderRoomList(availabilityData, startDate, endDate) {
    const container = document.getElementById('room-selection-container');
    const detailsForm = document.getElementById('booking-details-form');
    if (!container || !detailsForm) return;

    guesthouseBookingData.roomAvailability = availabilityData; // 儲存 API 回應供後續使用
    guesthouseBookingData.selectedRooms = {}; // 重置顧客選擇

    // 渲染所有 is_visible 的房型
    const productsToRender = allProducts.filter(p => p.is_visible); //

    if (productsToRender.length === 0) {
        container.innerHTML = '<p>目前沒有可顯示的房型。</p>';
        detailsForm.style.display = 'none';
        return;
    }

    let hasAnyBookableRoom = false; // 標記是否有任何一個房型是可訂的

    // 產生房型列表的 HTML
    container.innerHTML = productsToRender.map(product => {
        const roomInfo = availabilityData[product.product_id];
        let isOverallAvailable = false;
        let maxQuantity = 0;
        let priceText = '價格洽詢';
        let unavailabilityMessage = ''; // 儲存不可訂原因的訊息
        let disableQuantitySelector = true; // 預設禁用數量選擇

        if (roomInfo) { // 確保 API 有回傳此房型的資料
             isOverallAvailable = roomInfo.isAvailable;
             maxQuantity = roomInfo.minAvailableQuantity || 0;
             priceText = roomInfo.pricePerNight !== null ? `$${roomInfo.pricePerNight} / 晚` : '價格洽詢';

            // 檢查不可訂的原因
            if (!isOverallAvailable && roomInfo.dailyDetails && roomInfo.dailyDetails.length > 0) {
                const unavailableDatesInfo = []; // 儲存不可訂的日期和原因
                for (const daily of roomInfo.dailyDetails) {
                    if (!daily.isBookable) { // isBookable 是後端 API 計算好的當日是否可訂
                        let reason = '';
                        // 根據後端 dailyDetails 的內容判斷原因
                        // const inventoryRecord = roomInfo.dailyDetails.find(d => d.date === daily.date); // 這行多餘，daily 本身就是
                        if(daily.status === 'Closed'){ //
                            reason = '未開放';
                        } else if (daily.available <= 0) { //
                            reason = '已售完';
                        } else if (daily.price === null || daily.price <= 0) { //
                            reason = '價格未定';
                        } else {
                            reason = '暫不可訂'; // 其他未知原因
                        }
                        // 將 月/日 格式加入
                        const dateParts = daily.date.split('-');
                        unavailableDatesInfo.push(`${dateParts[1]}/${dateParts[2]} ${reason}`);
                    }
                }
                // 只顯示前幾個不可訂的日期，避免訊息過長
                if (unavailableDatesInfo.length > 0) {
                    unavailabilityMessage = `(${unavailableDatesInfo.slice(0, 3).join(', ')}${unavailableDatesInfo.length > 3 ? '...' : ''})`;
                }
            }

            // 只有整體可訂時才啟用數量選擇
            if (isOverallAvailable) {
                 disableQuantitySelector = false;
                 hasAnyBookableRoom = true; // 標記至少有一個房型可訂
            }
        } else {
             // 如果 API 沒有回傳這個房型的資料，視為不可用
             unavailabilityMessage = '(此期間不可預訂)';
        }

        const images = JSON.parse(product.images || '[]'); //
        const imageUrl = images.length > 0 ? images[0] : 'https://placehold.co/100x80/112240/ccd6f6?text=Room'; //

        // 產生數量下拉選單的選項 (0 到 最大可訂數量)
        // 如果禁用，只顯示 0 選項
        let quantityOptions = '<option value="0">0</option>';
        if (!disableQuantitySelector) {
            for (let i = 1; i <= maxQuantity; i++) {
                quantityOptions += `<option value="${i}">${i}</option>`;
            }
        }

        // 每個房型的 HTML 結構 (加入 unavailabilityMessage)
        return `
            <div class="room-selection-item ${!isOverallAvailable ? 'unavailable-room' : ''}" data-product-id="${product.product_id}" style="display: flex; gap: 15px; margin-bottom: 15px; border-bottom: 1px solid var(--color-secondary); padding-bottom: 15px; ${!isOverallAvailable ? 'opacity: 0.6;' : ''}">
                <img src="${imageUrl}" alt="${product.name}" style="width: 100px; height: 80px; object-fit: cover; border-radius: var(--border-radius);">
                <div style="flex-grow: 1;">
                    <h4 style="margin: 0 0 5px 0;">
                        ${product.name}
                        ${unavailabilityMessage ? `<span style="font-size: 0.8em; color: var(--color-danger); font-weight: normal; margin-left: 5px;">${unavailabilityMessage}</span>` : ''}
                    </h4>
                    <p style="margin: 0 0 8px 0; font-size: 0.9em; color: var(--color-text-secondary);">${product.description ? product.description.substring(0, 50) + '...' : ''}</p>
                    <p style="margin: 0; font-weight: bold; color: var(--color-primary);">${priceText}</p>
                </div>
                <div style="width: 80px;">
                    <label for="room-qty-${product.product_id}" style="font-size: 0.8em; display: block; margin-bottom: 5px;">數量:</label>
                    <select id="room-qty-${product.product_id}" class="room-quantity-select" data-product-id="${product.product_id}" style="width: 100%;" ${disableQuantitySelector ? 'disabled' : ''}>
                        ${quantityOptions}
                    </select>
                    ${!disableQuantitySelector ? `<p style="font-size: 0.8em; color: var(--color-text-secondary); margin-top: 5px;">剩 ${maxQuantity} 間</p>` : ''}
                </div>
            </div>
        `;
    }).join('');

    // 為 **未被禁用** 的數量下拉選單綁定事件監聽器
    container.querySelectorAll('.room-quantity-select:not([disabled])').forEach(select => {
        select.addEventListener('change', (e) => {
            const productId = e.target.dataset.productId;
            const quantity = parseInt(e.target.value, 10);
            if (quantity > 0) {
                guesthouseBookingData.selectedRooms[productId] = quantity; // 更新選擇狀態
            } else {
                delete guesthouseBookingData.selectedRooms[productId]; // 如果数量改为 0，则移除选择
            }
            calculateTotalPrice(); // 重新计算总价
        });
    });

    // 只有當有任何可訂房型時才顯示聯絡表單
    detailsForm.style.display = hasAnyBookableRoom ? 'block' : 'none';

    // **修正點**: 將 bookableProducts 替換為 productsToRender
    if (!hasAnyBookableRoom && productsToRender.length > 0) { // <--- 使用 productsToRender
         // 如果有房型但都不能訂，顯示特定提示
         container.innerHTML += '<p style="text-align: center; color: var(--color-danger);">您選擇的日期範圍內所有房型暫時無法預訂。</p>'; // 修改提示文字
    }
    // **修正點**: 檢查 availabilityData 是否包含 productsToRender 中的房型，而不是用 bookableProducts
    // 這個 else if 條件可能需要調整，檢查 availabilityData 的 key 數量是否為 0 可能更準確
    const returnedProductIds = Object.keys(availabilityData);
    if (returnedProductIds.length === 0 && productsToRender.length > 0) { // <--- 檢查 API 回傳是否為空
         // 如果 API 完全沒回傳任何房型資料 (可能是 API 錯誤或 Products 表是空的)
         container.innerHTML = '<p style="text-align: center; color: var(--color-danger);">無法獲取您選擇日期範圍的房況資訊。</p>';
    }

    calculateTotalPrice(); // 計算初始總價 (應為 $0)
}


function getPriceForDate(dateString, product) {
    if (!dateString || !product) return product?.price_weekday || null; // 預設回傳平日價或 null

    const date = new Date(dateString + 'T00:00:00'); // 確保解析為當地日期
    const dayOfWeek = date.getDay(); // 0=週日, 1=週一, ..., 5=週五, 6=週六

    if (dayOfWeek === 5) { // 週五
        return product.price_friday !== null ? product.price_friday : product.price_weekday;
    } else if (dayOfWeek === 6) { // 週六
        return product.price_saturday !== null ? product.price_saturday : product.price_weekday;
    } else { // 平日 (週日到週四)
        return product.price_weekday !== null ? product.price_weekday : null;
    }
    // 如果連平日價都沒有，最終回傳 null
     return product.price_weekday;
}

    // =================================================================
    // 頁面渲染與導航核心
    // =================================================================
    function renderPage(pageId, data = null) {
        const template = pageTemplates.querySelector(`#${pageId}`);
        if (template) {
            appContent.innerHTML = template.innerHTML;
            if (pageInitializers[pageId]) {
                pageInitializers[pageId](data);
            }
            const isMainTab = Array.from(document.querySelectorAll('.tab-button')).some(btn => btn.dataset.target === pageId);
            document.querySelectorAll('.tab-button').forEach(btn => {
                btn.classList.toggle('active', isMainTab && btn.dataset.target === pageId);
            });
        } else {
            console.error(`在 page-templates 中找不到樣板: ${pageId}`);
            renderPage('page-home');
        }
    }

    function showPage(pageId, data = null) {
        history.pushState({ page: pageId, data: data }, '', `#${pageId.replace('page-', '')}`);
        renderPage(pageId, data);
    }

    window.addEventListener('popstate', (event) => {
        if (event.state && event.state.page) {
            renderPage(event.state.page, event.state.data);
        } else {
            const initialPageId = window.location.hash.substring(1) || 'home';
            renderPage(`page-${initialPageId}`);
        }
    });

    // =================================================================
    // 主函式 (程式啟動點)
    // =================================================================
    async function main() {
        try {
            const response = await fetch('/api/get-app-config');
            if (!response.ok) throw new Error(`伺服器錯誤 ${response.status}`);
            const configData = await response.json();
            if(!configData || !configData.LOGIC){
                 throw new Error('獲取到的設定檔格式不正確。');
            }
            
            CONFIG = configData;

            const activeTemplateKey = CONFIG.LOGIC.ACTIVE_INDUSTRY_TEMPLATE;
            activeTemplate = CONFIG.LOGIC.INDUSTRY_TEMPLATE_DEFINITIONS[activeTemplateKey];
            
            if (!activeTemplate) {
                throw new Error(`在設定中找不到名為 "${activeTemplateKey}" 的商業樣板。`);
            }

            await initializeLiff();

        } catch (error) {
            console.error("初始化失敗:", error);
            appContent.innerHTML = `<div style="text-align: center; padding: 20px; color: var(--color-danger);">
                <h2>系統啟動失敗</h2><p>${error.message}</p><p>請確認後台 API (get-app-config) 運作正常，且已在「系統設定」中儲存並啟用一個樣板。</p>
            </div>`;
        }
    }
    
    // =================================================================
    // 設定檔應用函式
    // =================================================================
    function applyConfiguration() {
      try {
            if (!CONFIG || !activeTemplate) {
                console.error("嚴重錯誤：CONFIG 或 activeTemplate 設定檔不存在！"); return;
            }

            const { terms } = activeTemplate;
            const navBarConfig = activeTemplate.logic.navBar || [];

            document.querySelectorAll('.tab-button').forEach(tab => {
                const targetPage = tab.dataset.target;
                const config = navBarConfig.find(item => item.target === targetPage);

                if (config && config.enabled) {
                    const label = config.label;
                    tab.innerHTML = label.length > 2 ? label.substring(0, 2) + '<br>' + label.substring(2) : label;
                    tab.style.display = '';
                } else {
                    tab.style.display = 'none';
                }
            });
            
            document.title = terms.BUSINESS_NAME;

            if (pageTemplates) {
                const setContent = (selector, content) => {
                    const el = pageTemplates.querySelector(selector);
                    if (el) el.textContent = content;
                };
                const setPlaceholder = (selector, content) => {
                    const el = pageTemplates.querySelector(selector);
                    if (el) el.setAttribute('placeholder', content);
                };

                setContent('#page-home .page-main-title', terms.NEWS_PAGE_TITLE);
                setContent('#page-products .page-main-title', terms.PRODUCT_CATALOG_TITLE);
                setContent('#page-checkout .page-main-title', terms.CHECKOUT_PAGE_TITLE);
                setContent('#page-profile .page-main-title', "會員中心");
                setContent('#page-booking .page-main-title', terms.BOOKING_PAGE_TITLE || `${terms.BOOKING_NAME}服務`);
                setPlaceholder('#page-products #keyword-search', `搜尋${terms.PRODUCT_NAME || '項目'}關鍵字...`);
            }

        } catch (e) {
            console.error("套用設定檔時發生錯誤:", e);
        }
    }

    // =================================================================
    // LIFF 初始化 & 全域事件
    // =================================================================
    async function initializeLiff() {
        try {
            await liff.init({ liffId: myLiffId });
            if (!liff.isLoggedIn()) {
                liff.login();
                return;
            }
            userProfile = await liff.getProfile();
            history.replaceState({ page: 'page-home', data: null }, '', '#home');
            applyConfiguration(); 
            setupGlobalEventListeners();
            const initialPageId = window.location.hash.substring(1);
            renderPage(initialPageId ? `page-${initialPageId}` : 'page-home');
        } catch (err) {
            console.error("LIFF 初始化失敗", err);
            history.replaceState({ page: 'page-home', data: null }, '', '#home');
            applyConfiguration();
            setupGlobalEventListeners();
            renderPage('page-home');
        }
    }

    function setupGlobalEventListeners() {
        appContent.addEventListener('click', (event) => {
            const target = event.target;
            
            if (target.closest('.details-back-button')) {
                history.back();
                return;
            }

            const productCard = target.closest('.product-card');
            if (productCard && productCard.dataset.productId) {
                const product = allProducts.find(p => p.product_id == productCard.dataset.productId);
                if (product) showPage('page-product-details', { product });
                return;
            }
            
            const newsCard = target.closest('.news-card');
            if (newsCard && newsCard.dataset.newsId) {
                const news = allNews.find(n => n.id == newsCard.dataset.newsId);
                if (news) showPage('page-news-details', { news });
                return;
            }

            if (target.id === 'my-bookings-btn') { showPage('page-my-bookings'); return; }
            if (target.id === 'my-exp-history-btn') { showPage('page-my-exp-history'); return; }
            if (target.id === 'edit-profile-btn') { showPage('page-edit-profile'); return; }

            if (target.matches('.cancel-booking-btn')) {
                const bookingId = target.dataset.bookingId;
                if (bookingId && confirm('您確定要取消這筆預約嗎？此操作無法復原。')) {
                    handleCancelBooking(bookingId);
                }
            }
        });

        document.getElementById('tab-bar').addEventListener('click', (event) => {
            const button = event.target.closest('.tab-button');
            if (button && button.style.display !== 'none' && button.dataset.target) {
                showPage(button.dataset.target);
            }
        });
    }

    async function handleCancelBooking(bookingId) {
        const card = document.getElementById(`booking-card-${bookingId}`);
        if (!card) return; // 增加保護，以防找不到元素
        const button = card.querySelector('.cancel-booking-btn');

        try {
            button.disabled = true;
            button.textContent = '處理中...';

            const response = await fetch('/api/cancel-booking', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ bookingId: Number(bookingId), userId: userProfile.userId })
            });

            const result = await response.json();
            if (!response.ok) {
                throw new Error(result.error || '取消失敗，請稍後再試');
            }

            alert('預約已成功取消！');
            // 重新載入預約列表以更新狀態
            initializeMyBookingsPage();

        } catch (error) {
            alert(error.message);
            // 只有在按鈕還存在時才恢復它
            if (button) {
                button.disabled = false;
                button.textContent = '取消預約';
            }
        }
    }
    // =================================================================
    // 輔助函式
    // =================================================================
    async function togglePastView(type, containerId, button) {
        const pastContainer = document.getElementById(containerId);
        if (!pastContainer || !button) return;
        const isHidden = pastContainer.style.display === 'none';
        if (isHidden) {
            pastContainer.innerHTML = '<p>查詢中...</p>';
            pastContainer.style.display = 'block';
            button.textContent = '隱藏過往紀錄';
            try {
                const apiPath = type === 'bookings' ? '/api/my-bookings' : '/api/my-rental-history';
                const response = await fetch(`${apiPath}?userId=${userProfile.userId}&filter=past`);
                if (!response.ok) throw new Error(`查詢過往${type}失敗`);
                const data = await response.json();
                if (type === 'bookings') {
                    renderBookings(data, pastContainer, true);
                } else {
                    renderRentals(data, pastContainer, true);
                }
            } catch (error) {
                pastContainer.innerHTML = `<p style="color: red;">${error.message}</p>`;
            }
        } else {
            pastContainer.style.display = 'none';
            button.textContent = type === 'bookings' ? '查看過往紀錄' : '查看已歸還紀錄';
        }
    }


function renderBookings(bookings, container, isPast = false) {
    if (!container) return;
    if (!bookings || bookings.length === 0) { // 確保 bookings 是陣列
        container.innerHTML = `<p>${isPast ? '沒有過往的預約紀錄。' : '您目前沒有即將到來的預約。'}</p>`;
        return;
    }

    container.innerHTML = bookings.map(b => {
        let cardContentHTML = '';
        const bookingId = b.booking_id; // 獲取 booking_id

        // --- 民宿樣板 ---
        if (CONFIG.LOGIC.ACTIVE_INDUSTRY_TEMPLATE === 'guesthouse_template') {
            const startDate = b.booking_date || '未知日期';
            const endDate = b.check_out_date || '未知日期';
            let nights = '-';
            if (b.booking_date && b.check_out_date) {
                try {
                    const start = new Date(b.booking_date + 'T00:00:00');
                    const end = new Date(b.check_out_date + 'T00:00:00');
                    nights = Math.round((end - start) / (1000 * 60 * 60 * 24));
                } catch(e) { console.error("計算晚數失敗:", e); }
            }
            const itemSummary = b.items?.map(item => `${item.item_name} x${item.quantity}`).join(', ') || '無項目資訊';
            const totalAmountText = b.total_amount !== null ? `$${b.total_amount}` : '待確認';

            cardContentHTML = `
                <p><strong>入住:</strong> ${startDate}</p>
                <p><strong>退房:</strong> ${endDate} (${nights} 晚)</p>
                <p><strong>房型:</strong> ${itemSummary}</p>
                <p><strong>總金額:</strong> ${totalAmountText}</p>
                <p><strong>狀態:</strong> ${b.status_text}</p>
            `;
        }
        // --- 工作室或其他樣板 (保持原樣) ---
        else {
            const itemHTML = b.items?.map(item => `${item.item_name} x${item.quantity}`).join(', ') || '無項目資訊'; // 顯示所有項目
            cardContentHTML = `
                <p><strong>日期:</strong> ${b.booking_date}</p>
                <p><strong>時段:</strong> ${b.time_slot}</p>
                <p><strong>項目:</strong> ${itemHTML}</p>
                <p><strong>人數:</strong> ${b.num_of_people} ${CONFIG.TERMS.PRODUCT_PLAYER_COUNT_UNIT || '人'}</p>
                <p><strong>狀態:</strong> ${b.status_text}</p>
            `;
        }

        const cancelButtonHTML = (!isPast && b.status === 'confirmed' && CONFIG.FEATURES.ENABLE_CUSTOMER_CANCELLATION) // 只有 confirmed 狀態才能取消
            ? `<button class="cta-button cancel-booking-btn" data-booking-id="${bookingId}" style="background-color: var(--color-danger); margin-top: 10px; padding: 8px;">取消預約</button>`
            : '';

        // --- 將 data-booking-id 加到最外層 div ---
        return `
            <div class="booking-info-card" id="booking-card-${bookingId}" data-booking-id="${bookingId}" style="cursor: pointer;">
                ${cardContentHTML}
                ${cancelButtonHTML}
            </div>
        `;
    }).join('');
}
 
    // =================================================================
    // LIFF 初始化 & 啟動
    // =================================================================
    async function initializeLiff() {
        try {
            await liff.init({ liffId: myLiffId });
            if (!liff.isLoggedIn()) {
                liff.login();
                return;
            }
            userProfile = await liff.getProfile();

            history.replaceState({ page: 'page-home', data: null }, '', '#home');

            applyConfiguration(); 
            setupGlobalEventListeners();

            renderPage('page-home');

        } catch (err) {
            console.error("LIFF 初始化失敗", err);
            // 即使 LIFF 失敗，也要嘗試渲染頁面 (用於桌面端測試)
            history.replaceState({ page: 'page-home', data: null }, '', '#home');
            applyConfiguration();
            setupGlobalEventListeners();
            renderPage('page-home');
        }
    }

    async function fetchproductData(forceRefresh = false) {
        if (!forceRefresh && productData.user_id) return productData;
        try {
            const response = await fetch('/api/user', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userId: userProfile.userId, displayName: userProfile.displayName, pictureUrl: userProfile.pictureUrl }),
            });
            if (!response.ok) throw new Error('無法取得會員資料');
            productData = await response.json();
            return productData;
        } catch (error) {
            console.error('會員API失敗:', error);
            return null;
        }
    }

    function updateProfileDisplay(data) {
        if (!data) return;
        const displayNameEl = document.getElementById('display-name');
        if(displayNameEl) displayNameEl.textContent = data.nickname || (userProfile ? userProfile.displayName : '訪客');
        const classP = document.querySelector('.profile-stats p:nth-of-type(1)');
        const levelP = document.querySelector('.profile-stats p:nth-of-type(2)');
        const expP = document.querySelector('.profile-stats p:nth-of-type(3)');
        const perkP = document.getElementById('user-perk-line');
        const qrcodeContainer = document.getElementById('qrcode-container');

        if (CONFIG.FEATURES.ENABLE_MEMBERSHIP_SYSTEM) {
            if (qrcodeContainer && userProfile) qrcodeContainer.style.display = 'flex';
            if (classP) classP.style.display = 'block';
            if (levelP) levelP.style.display = 'block';
            if (expP) expP.style.display = 'block';
            if(classP) classP.innerHTML = `<strong>${CONFIG.TERMS.MEMBER_CLASS_LABEL}：</strong><span>${data.class || "無"}</span>`;
            if(levelP) levelP.innerHTML = `<strong>${CONFIG.TERMS.MEMBER_LEVEL_LABEL}：</strong><span>${data.level}</span>`;
            if(expP) expP.innerHTML = `<strong>${CONFIG.TERMS.POINTS_NAME}：</strong><span>${data.current_exp} / 10</span>`;
            if (perkP && data.perk && data.class !== '無') {
                perkP.innerHTML = `<strong>${CONFIG.TERMS.MEMBER_PERK_LABEL}：</strong><span>${data.perk}</span>`;
                perkP.style.display = 'block';
            } else if (perkP) {
                perkP.style.display = 'none';
            }
        } else {
            if (qrcodeContainer) qrcodeContainer.style.display = 'none';
            if (classP) classP.style.display = 'none';
            if (levelP) levelP.style.display = 'none';
            if (expP) expP.style.display = 'none';
            if (perkP) perkP.style.display = 'none';
        }
    }

    // =================================================================
    // 各頁面初始化函式
    // =================================================================
    async function initializeHomePage() {
        const container = document.getElementById('news-list-container');
        if (!container) return;
        container.innerHTML = `<p>載入中...</p>`;
        try {
            const response = await fetch('api/get-news');
            if (!response.ok) throw new Error(`無法獲取${CONFIG.TERMS.NEWS_PAGE_TITLE}`);
            allNews = await response.json();
            
            setupNewsFilters(); // 移到資料獲取後
            renderNews(); // 初始渲染
        } catch (error) {
            container.innerHTML = `<p style="color:var(--color-danger);">${error.message}</p>`;
        }
    }

    function renderNews(filterCategory = 'ALL') {
        const container = document.getElementById('news-list-container');
        if (!container) return;
        const filteredNews = (filterCategory === 'ALL') ? allNews : allNews.filter(news => news.category === filterCategory);
        if (filteredNews.length === 0) {
            container.innerHTML = `<p>這個分類目前沒有${CONFIG.TERMS.NEWS_PAGE_TITLE}。</p>`;
            return;
        }
        container.innerHTML = filteredNews.map(news => {
            const snippet = news.content ? news.content.substring(0, 50) + '...' : '';
            const imageHTML = news.image_url ? `<img src="${news.image_url}" alt="${news.title}" class="news-card-image">` : '';
            return `
            <div class="news-card" data-news-id="${news.id}">
                <div class="news-card-header">
                    <span class="news-card-category">${news.category}</span>
                    <span class="news-card-date">${news.published_date}</span>
                </div>
                ${imageHTML}
                <h3 class="news-card-title">${news.title}</h3>
                <p class="news-card-snippet">${snippet}</p>
            </div>`;
        }).join('');
    }

    function setupNewsFilters() {
        const container = document.getElementById('news-filter-container');
        if (!container) return;
        const categories = ['ALL', ...new Set(allNews.map(news => news.category))];
        container.innerHTML = categories.map(cat => 
            `<button class="news-filter-btn ${cat === 'ALL' ? 'active' : ''}" data-category="${cat}">${cat === 'ALL' ? '全部' : cat}</button>`
        ).join('');
        container.querySelectorAll('.news-filter-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                container.querySelector('.active').classList.remove('active');
                btn.classList.add('active');
                renderNews(btn.dataset.category);
            });
        });
    }

    function renderNewsDetails(newsItem) {
        if (!newsItem) return;
        document.getElementById('news-details-title').textContent = newsItem.title;        
        document.getElementById('news-details-category').textContent = newsItem.category;
        document.getElementById('news-details-date').textContent = newsItem.published_date;
        const contentEl = document.getElementById('news-details-content');
        contentEl.innerHTML = newsItem.content ? newsItem.content.replace(/\n/g, '<br>') : '<p>此消息沒有提供詳細內容。</p>';
        const imageEl = document.getElementById('news-details-image');
        if (newsItem.image_url) {
            imageEl.src = newsItem.image_url;
            imageEl.alt = newsItem.title;
            imageEl.style.display = 'block';
        } else {
            imageEl.style.display = 'none';
        }
    }

    async function initializeProfilePage() {
        if (!userProfile) return;
        document.querySelector('#my-bookings-btn').innerHTML = `${CONFIG.TERMS.BOOKING_NAME}紀錄`;
        document.querySelector('#my-exp-history-btn').innerHTML = `${CONFIG.TERMS.POINTS_NAME}紀錄`;
        document.querySelector('#my-exp-history-btn').style.display = CONFIG.FEATURES.ENABLE_MEMBERSHIP_SYSTEM ? 'block' : 'none';
        document.querySelector('#my-bookings-btn').style.display = CONFIG.FEATURES.ENABLE_BOOKING_SYSTEM ? 'block' : 'none';
        const profilePicture = document.getElementById('profile-picture');
        if (profilePicture && userProfile.pictureUrl) profilePicture.src = userProfile.pictureUrl;
        const qrcodeElement = document.getElementById('qrcode');
        if (qrcodeElement && CONFIG.FEATURES.ENABLE_MEMBERSHIP_SYSTEM) {
            qrcodeElement.innerHTML = '';
            new QRCode(qrcodeElement, { text: userProfile.userId, width: 120, height: 120 });
        }
        try {
            const userData = await fetchproductData(true);
            updateProfileDisplay(userData);
        } catch (error) {
            const displayNameEl = document.getElementById('display-name');
            if(displayNameEl) displayNameEl.textContent = '資料載入失敗';
        }
    }

async function initializeMyBookingsPage() {
    if (!userProfile) return;
    const container = document.getElementById('my-bookings-container');
    const pastContainer = document.getElementById('past-bookings-container'); // Past container
    const toggleBtn = document.getElementById('toggle-past-bookings-btn');    // Toggle button

    if (!container || !pastContainer || !toggleBtn) return; // Make sure all elements exist

    // Reset view
    container.innerHTML = '<p>查詢中...</p>';
    pastContainer.style.display = 'none';
    toggleBtn.textContent = '查看過往紀錄';
    // Remove previous listener if exists to prevent duplicates
    toggleBtn.replaceWith(toggleBtn.cloneNode(true));
    document.getElementById('toggle-past-bookings-btn').addEventListener('click', () => togglePastView('bookings', 'past-bookings-container', document.getElementById('toggle-past-bookings-btn')));


    try {
        const response = await fetch(`api/my-bookings?userId=${userProfile.userId}&filter=current`);
        if (!response.ok) throw new Error('查詢預約失敗');
        const bookings = await response.json();
        renderBookings(bookings, container, false);

        // --- 新增：為卡片添加點擊事件監聽 (事件委派) ---
        container.removeEventListener('click', handleBookingCardClick); // 移除舊監聽器 (如果有的話)
        container.addEventListener('click', handleBookingCardClick);
        pastContainer.removeEventListener('click', handleBookingCardClick); // 也為過往紀錄添加
        pastContainer.addEventListener('click', handleBookingCardClick);
        // --- 新增結束 ---

    } catch (error) {
        container.innerHTML = `<p style="color: var(--color-danger);">${error.message}</p>`;
    }
}

// --- 新增：處理卡片點擊的獨立函數 ---
function handleBookingCardClick(event) {
    const card = event.target.closest('.booking-info-card[data-booking-id]');
    // 確保點擊的不是取消按鈕
    if (card && !event.target.classList.contains('cancel-booking-btn')) {
        const bookingId = card.dataset.bookingId;
        console.log("點擊預約卡片:", bookingId);
        showPage('page-booking-details', { bookingId: Number(bookingId) }); // 傳遞 bookingId
    }
}

// --- 新增：初始化預約詳情頁面 ---
async function initializeBookingDetailsPage(data) {
    const loadingEl = document.getElementById('booking-details-loading');
    const contentContainer = document.getElementById('booking-details-content-container');
    const cancelBtn = document.getElementById('details-cancel-booking-btn');

    if (!data || !data.bookingId || !loadingEl || !contentContainer || !cancelBtn) {
        appContent.innerHTML = `<p style="color:red;">頁面載入錯誤：缺少預約 ID 或頁面元素。</p>`;
        return;
    }

loadingEl.style.display = 'block';
    contentContainer.style.display = 'none';
    cancelBtn.style.display = 'none';

    try {
        const [bookingRes, policyRes] = await Promise.all([
            fetch(`/api/my-bookings?userId=${userProfile.userId}&bookingId=${data.bookingId}`),
            fetch('/api/get-booking-policy')
        ]);

        // --- 【修改】更安全的處理 bookingRes ---
        let booking = null;
        if (bookingRes.ok) {
            const contentType = bookingRes.headers.get("content-type");
            if (contentType && contentType.indexOf("application/json") !== -1) {
                const bookingResult = await bookingRes.json(); //
                booking = Array.isArray(bookingResult) ? bookingResult[0] : bookingResult;
                if (!booking) throw new Error('找不到指定的預約紀錄 (API 回傳空)'); //
            } else {
                // 回應不是 JSON
                const text = await bookingRes.text();
                throw new Error(`無法獲取預約詳情：伺服器回應非預期格式 (${contentType}). 回應內容: ${text.substring(0, 100)}...`);
            }
        } else {
             // fetch 請求失敗 (例如 404, 500)
             const errorText = await bookingRes.text(); // 嘗試讀取錯誤訊息文字
             throw new Error(`無法獲取預約詳情 (HTTP ${bookingRes.status}): ${errorText.substring(0, 100)}...`); //
        }
        // --- 【修改結束】---

        // --- 【修改】更安全的處理 policyRes ---
        let policy = { cancellationPolicy: '未設定', checkInInstructions: '未設定' };
        if (policyRes.ok) {
            const contentType = policyRes.headers.get("content-type");
            if (contentType && contentType.indexOf("application/json") !== -1) {
                policy = await policyRes.json(); //
            } else {
                 const text = await policyRes.text();
                 console.warn(`無法獲取預約政策：伺服器回應非預期格式 (${contentType}). 使用預設值. 回應內容: ${text.substring(0, 100)}...`); //
            }
        } else {
             const errorText = await policyRes.text();
             console.warn(`無法獲取預約政策 (HTTP ${policyRes.status}): ${errorText.substring(0, 100)}... 使用預設值.`); //
        }

        // --- 填充頁面內容 ---
        const startDate = booking.booking_date || '';
        const endDate = booking.check_out_date || '';

        if (startDate && endDate) {
            try {
                const start = new Date(startDate + 'T00:00:00');
                const end = new Date(endDate + 'T00:00:00');
                nights = Math.round((end - start) / (1000 * 60 * 60 * 24));
            } catch(e) { console.error("計算晚數失敗:", e); }
        }

document.getElementById('details-check-in-date').textContent = booking.booking_date || '-'; //
        document.getElementById('details-check-out-date').textContent = booking.check_out_date || '-'; //
        let nights = '-';
        if (booking.booking_date && booking.check_out_date) {
            try {
                const start = new Date(booking.booking_date + 'T00:00:00');
                const end = new Date(booking.check_out_date + 'T00:00:00');
                nights = Math.round((end - start) / (1000 * 60 * 60 * 24));
            } catch(e) { console.error("計算晚數失敗:", e); }
        }
        document.getElementById('details-nights').textContent = nights; //

        const itemsListEl = document.getElementById('details-items-list');
        if (booking.items && booking.items.length > 0) {
            itemsListEl.innerHTML = booking.items.map(item =>
                `<p>- ${item.item_name} x ${item.quantity} (小計: $${item.price !== null ? item.price * item.quantity : 'N/A'})</p>`
            ).join(''); //
        } else {
            itemsListEl.innerHTML = '<p>無項目資訊</p>'; //
        }

        document.getElementById('details-total-amount').textContent = booking.total_amount !== null ? `$${booking.total_amount}` : '-'; //
        document.getElementById('details-cancellation-policy').textContent = policy.cancellationPolicy; //
        document.getElementById('details-check-in-instructions').textContent = policy.checkInInstructions; //


        // --- (處理取消按鈕的程式碼保持不變) ---
        if (booking.status === 'confirmed' && CONFIG.FEATURES.ENABLE_CUSTOMER_CANCELLATION) { //
            cancelBtn.style.display = 'block'; //
            cancelBtn.replaceWith(cancelBtn.cloneNode(true)); //
            document.getElementById('details-cancel-booking-btn').addEventListener('click', () => { //
                 if (confirm('您確定要取消這筆預約嗎？此操作無法復原。')) { //
                     handleCancelBooking(booking.booking_id); //
                 }
            });
        }

        loadingEl.style.display = 'none'; //
        contentContainer.style.display = 'block'; //

    } catch (error) {
        console.error("載入預約詳情失敗:", error);
        loadingEl.innerHTML = `<p style="color: red;">載入失敗：${error.message}</p>`; // 顯示更詳細的錯誤 //
        contentContainer.style.display = 'none'; //
    }
}

    async function initializeMyExpHistoryPage() {
        if (!userProfile) return;
        const container = document.getElementById('my-exp-history-container');
        if (!container) return;
        container.innerHTML = `<p>查詢中...</p>`;
        try {
            const response = await fetch(`api/my-purchase-history?userId=${userProfile.userId}`);
            if (!response.ok) throw new Error('查詢紀錄失敗');
            const records = await response.json();
            if (records.length === 0) {
                container.innerHTML = `<p>您目前沒有任何${CONFIG.TERMS.POINTS_NAME}紀錄。</p>`;
            } else {
                container.innerHTML = records.map(r => `<div class="exp-record-card" style="display: flex; justify-content: space-between;"><span>${new Date(r.created_at).toLocaleDateString()}</span><span>${r.reason}</span><span style="font-weight: bold; color: ${r.exp_added > 0 ? 'var(--color-accent)' : 'var(--color-danger)'};">${r.exp_added > 0 ? '+' : ''}${r.exp_added}</span></div>`).join('');
            }
        } catch (error) {
            container.innerHTML = `<p style="color: var(--color-danger);">${error.message}</p>`;
        }
    }

    async function initializeInfoPage() {
        const container = document.getElementById('store-info-container');
        if (!container) return;
        container.innerHTML = `<p>載入中...</p>`;
        try {
            const response = await fetch('/api/get-store-info');
            if (!response.ok) throw new Error('無法獲取店家資訊');
            const info = await response.json();
            container.innerHTML = `<div class="info-section"><h2>地址</h2><p>${info.address}</p></div><div class="info-section"><h2>電話</h2><p>${info.phone}</p></div><div class="info-section"><h2>營業時間</h2><p style="white-space: pre-wrap;">${info.opening_hours}</p></div><div class="info-section"><h2>店家介紹</h2><p style="white-space: pre-wrap;">${info.description}</p></div>`;
        } catch (error) {
            container.innerHTML = `<p style="color:var(--color-danger);">${error.message}</p>`;
        }
    }

    async function initializeEditProfilePage() {
        if (allProducts.length === 0) {
            try {
                const res = await fetch('/api/get-products');
                if (!res.ok) throw new Error('無法獲取資料');
                allProducts = await res.json();
            } catch (error) {
                console.error('獲取標籤失敗:', error);
            }
        }
        if (!userProfile) return;
        document.getElementById('edit-profile-name').value = userProfile.displayName;
        const userData = await fetchproductData();
        if (!userData) return;
        document.getElementById('edit-profile-real-name').value = userData.real_name || '';
        document.getElementById('edit-profile-nickname').value = userData.nickname || '';
        document.getElementById('edit-profile-phone').value = userData.phone || '';
        document.getElementById('edit-profile-email').value = userData.email || '';
        const productContainer = document.getElementById('preferred-product-container');
        const otherContainer = document.getElementById('preferred-product-other-container');
        const otherInput = document.getElementById('preferred-product-other-input');
        if (productContainer && otherContainer && otherInput) {
            const allStandardTags = [...new Set(allProducts.flatMap(g => (g.tags || '').split(',')).map(t => t.trim()).filter(Boolean))];
            const userTags = new Set((userData.preferred_product || '').split(',').map(tag => tag.trim()).filter(Boolean));
            const userCustomTags = [...userTags].filter(tag => !allStandardTags.includes(tag));
            productContainer.innerHTML = allStandardTags.map(tag => {
                const isActive = userTags.has(tag) ? 'active' : '';
                return `<button type="button" class="preference-tag-btn ${isActive}" data-tag="${tag}">${tag}</button>`;
            }).join('');
            const otherBtn = document.createElement('button');
            otherBtn.type = 'button';
            otherBtn.className = 'preference-tag-btn';
            otherBtn.textContent = '其他';
            productContainer.appendChild(otherBtn);
            if (userCustomTags.length > 0) {
                otherBtn.classList.add('active');
                otherContainer.style.display = 'block';
                otherInput.value = userCustomTags.join(', ');
            } else {
                otherContainer.style.display = 'none';
            }
            productContainer.addEventListener('click', (e) => {
                const target = e.target;
                if (target.classList.contains('preference-tag-btn')) {
                    if (target === otherBtn) {
                        const isNowActive = otherBtn.classList.toggle('active');
                        otherContainer.style.display = isNowActive ? 'block' : 'none';
                    } else {
                        target.classList.toggle('active');
                    }
                }
            });
            otherInput.addEventListener('input', () => {
                let value = otherInput.value;
                let chineseCount = (value.match(/[\u4e00-\u9fa5]/g) || []).length;
                let englishCount = (value.match(/[a-zA-Z]/g) || []).length;
                if (chineseCount > 10) {
                    value = Array.from(value).filter(char => /[\u4e00-\u9fa5]/.test(char)).slice(0, 10).join('');
                    otherInput.value = value;
                }
                if (englishCount > 30) {
                     value = Array.from(value).filter(char => /[a-zA-Z]/.test(char)).slice(0, 30).join('');
                     otherInput.value = value;
                }
            });
        }
        const form = document.getElementById('edit-profile-form');
        form.onsubmit = async (event) => {
            event.preventDefault();
            const statusMsg = document.getElementById('edit-profile-form-status');
            statusMsg.textContent = '儲存中...';
            let selectedproduct = Array.from(productContainer.querySelectorAll('.preference-tag-btn.active')).map(btn => btn.dataset.tag).filter(tag => tag);
            if (otherContainer.style.display === 'block' && otherInput.value.trim() !== '') {
                const customTags = otherInput.value.trim().split(/[,，\s]+/).filter(Boolean);
                selectedproduct.push(...customTags);
            }
            const formData = {
                userId: userProfile.userId,
                realName: document.getElementById('edit-profile-real-name').value.trim(),
                nickname: document.getElementById('edit-profile-nickname').value,
                phone: document.getElementById('edit-profile-phone').value,
                email: document.getElementById('edit-profile-email').value,
                preferredproduct: [...new Set(selectedproduct)],
                displayName: userProfile.displayName,
                pictureUrl: userProfile.pictureUrl || ''
            };
            try {
                const response = await fetch('/api/update-user-profile', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(formData) });
                const result = await response.json();
                if (!response.ok) throw new Error(result.error || '儲存失敗');
                productData = {};
                statusMsg.textContent = '儲存成功！';
                statusMsg.style.color = 'green';
                setTimeout(() => goBackPage(), 1500);
            } catch (error) {
                statusMsg.textContent = `儲存失敗: ${error.message}`;
                statusMsg.style.color = 'red';
            }
        };
    }
    
    function difficultyToStars(difficulty) {
        const levels = { '簡單': 1, '普通': 2, '困難': 3, '專家': 4 };
        const level = levels[difficulty] || 2;
        return '★'.repeat(level) + '☆'.repeat(4 - level);
    }


function renderProductDetails(product) {
    // --- 在函數開頭檢查傳入的 product 和 activeTemplate ---
    if (!product || typeof product !== 'object') {
        console.error("renderProductDetails 錯誤：傳入的 product 無效。", product);
        appContent.innerHTML = `<p style="color:red;">無法載入產品資料。</p>`; // 直接在 appContent 顯示錯誤
        return;
    }
    if (!activeTemplate || !Array.isArray(activeTemplate.fields)) {
        console.error("renderProductDetails 錯誤：activeTemplate 無效或缺少 fields。", activeTemplate);
        appContent.innerHTML = `<p style="color:red;">系統樣板設定錯誤。</p>`;
        return;
    }
    console.log("Rendering details for product:", product); // 輸出收到的產品資料

    // --- 檢查 DOM 元素是否存在 ---
    const detailsTitle = appContent.querySelector('.details-title');
    const gallery = appContent.querySelector('.details-gallery');

    if (!detailsTitle || !gallery || !contentContainer) {
         console.error("renderProductDetails 錯誤：找不到必要的 DOM 元素 (title, gallery, or content container)。");
         appContent.innerHTML = `<p style="color:red;">頁面結構錯誤，無法顯示產品詳情。</p>`;
         return;
    }
    const mainImage = gallery.querySelector('.details-image-main');
    const thumbnails = gallery.querySelector('.details-image-thumbnails');
    if(!mainImage || !thumbnails){
         console.error("renderProductDetails 錯誤：找不到 gallery 內的 mainImage 或 thumbnails 元素。");
         // 即使找不到圖片元素，也嘗試繼續渲染文字內容
         gallery.style.display = 'none'; // 隱藏圖片區塊
    }


    detailsTitle.textContent = product.name || "產品名稱載入失敗"; // 提供預設值
    contentContainer.innerHTML = ''; // 清空內容

    // --- 圖片處理 (增加 try-catch 和元素檢查) ---
    try {
         const images = JSON.parse(product.images || '[]');
         if (images.length > 0 && mainImage && thumbnails) { // 再次檢查元素
             mainImage.src = images[0];
             thumbnails.innerHTML = images.map((img, index) => `<img src="${img}" class="${index === 0 ? 'active' : ''}" data-src="${img}">`).join('');
             gallery.style.display = 'block';

             // 清除舊監聽器 (如果有的話) 再綁定新的
             thumbnails.replaceWith(thumbnails.cloneNode(true)); // 簡單粗暴但有效的方法
             appContent.querySelector('.details-gallery .details-image-thumbnails').addEventListener('click', e => {
                 if (e.target.tagName === 'IMG') {
                      if(mainImage) mainImage.src = e.target.dataset.src; // 再次檢查 mainImage
                      appContent.querySelector('.details-gallery .details-image-thumbnails .active')?.classList.remove('active');
                      e.target.classList.add('active');
                 }
             });
         } else {
             gallery.style.display = 'none';
         }
    } catch(e) {
         console.error("處理產品圖片時出錯:", e);
         gallery.style.display = 'none';
    }


    const contentContainer = appContent.querySelector('#product-details-content');
    contentContainer.innerHTML = ''; // 清空內容

    // --- 顯示價格區塊 ---
    const priceSection = document.createElement('div');
    priceSection.className = 'detail-field-section product-price-details'; // 給價格區塊加個 class
    const priceLabel = document.createElement('h3');
    priceLabel.textContent = '價格';
    const priceContent = document.createElement('p');
    // 清楚列出三種價格
    priceContent.innerHTML = `
        平日 (日~四): ${product.price_weekday !== null ? '$' + product.price_weekday : '洽詢'}<br>
        週五: ${product.price_friday !== null ? '$' + product.price_friday : '同平日'}<br>
        週六: ${product.price_saturday !== null ? '$' + product.price_saturday : '同平日'}
    `;
    priceSection.append(priceLabel, priceContent);
    contentContainer.appendChild(priceSection);

    // --- 其他欄位 (增加檢查) ---
    try {
        activeTemplate.fields.forEach(field => {
            if (field.key === 'name' || field.key === 'images' || field.key === 'is_visible' || field.key.startsWith('price_')) return;
            const value = product[field.key];
            if (value !== null && typeof value !== 'undefined' && value !== '') { // 更嚴格的檢查
                const section = document.createElement('div');
                section.className = 'detail-field-section';
                const label = document.createElement('h3');
                label.textContent = field.label;
                const content = document.createElement('p');
                // 確保 value 是字串再取代換行符
                content.innerHTML = String(value).replace(/\n/g, '<br>');
                section.append(label, content);
                contentContainer.appendChild(section);
            }
        });
    } catch (e) {
        console.error("渲染其他產品欄位時出錯:", e);
        // 可以在 contentContainer 附加一個錯誤提示
         contentContainer.innerHTML += `<p style="color:red;">部分欄位渲染失敗。</p>`;
    }
}

function renderProducts() {
    const container = document.getElementById('product-list-container');
    const sortButton = document.getElementById('price-sort-btn');
    if(!container || !sortButton) return;

    // 1. 篩選
    let filteredProducts = allProducts.filter(p => p.is_visible === 1);

    // 關鍵字篩選
    const keyword = activeFilters.keyword.toLowerCase().trim();
    if (keyword) { 
        filteredProducts = filteredProducts.filter(p => p.name.toLowerCase().includes(keyword)); 
    }

    // 【核心修改】新的動態篩選器邏輯
    const filterDefinitions = window.CONFIG?.LOGIC?.PRODUCT_FILTERS || [];
    filterDefinitions.forEach(filterDef => {
        const filterKey = filterDef.id; // e.g., 'filter_1'
        const selectedValue = activeFilters[filterKey];
        if (selectedValue) {
            filteredProducts = filteredProducts.filter(p => p[filterKey] === selectedValue);
        }
    });


    // --- 修改排序邏輯 ---
    // 排序時，我們主要以平日價格為基準
    switch (productView.sort) {
        case 'price_desc':
            filteredProducts.sort((a, b) => (b.price_weekday || 0) - (a.price_weekday || 0));
            break;
        case 'price_asc':
            filteredProducts.sort((a, b) => (a.price_weekday || 0) - (b.price_weekday || 0));
            break;
        default:
            filteredProducts.sort((a, b) => a.display_order - b.display_order);
            break;
    }

    // 3. 更新 UI 狀態 (邏輯不變)
    container.className = productView.layout === 'grid' ? 'view-grid' : 'view-list';
    document.getElementById('view-grid-btn').classList.toggle('active', productView.layout === 'grid');
    document.getElementById('view-list-btn').classList.toggle('active', productView.layout === 'list');
    sortButton.dataset.sort = productView.sort;

    if (filteredProducts.length === 0) {
        container.innerHTML = `<p>找不到符合條件的${CONFIG.TERMS.PRODUCT_NAME}。</p>`;
        return;
    }

    // --- 修改渲染 HTML ---
    container.innerHTML = filteredProducts.map(product => {
        // --- 顯示平日價格，並加上 "起" ---
        let priceDisplay = product.price_weekday != null ? `$${product.price_weekday} 起` : '價格洽詢';
        const images = JSON.parse(product.images || '[]');
        const imageUrl = images.length > 0 ? images[0] : 'https://placehold.co/150x150/112240/ccd6f6?text=Image';

        return `
            <div class="product-card" data-product-id="${product.product_id}">
                <img src="${imageUrl}" alt="${product.name}" class="product-image">
                <div class="product-info">
                    <h3 class="product-title">${product.name}</h3>
                    <p class="product-price">${priceDisplay}</p>
                </div>
            </div>
        `;
    }).join('');
}

function populateFilters() {
    const container = document.getElementById('dynamic-filter-container');
    if (!container) return;
    container.innerHTML = '';
const filterDefinitions = CONFIG?.LOGIC?.PRODUCT_FILTERS;
if (!Array.isArray(filterDefinitions)) {
    console.warn("PRODUCT_FILTERS 設定未定義或非陣列，無法產生篩選器。", filterDefinitions);
    return; // 如果不是陣列，直接結束函數
}
if (filterDefinitions.length === 0) {
     return; // 如果是空陣列，也直接結束
}

    filterDefinitions.forEach(filterDef => {
        const select = document.createElement('select');
        select.id = `liff-${filterDef.id}`;
        select.dataset.filterKey = filterDef.id;

        select.add(new Option(`-- ${filterDef.name} --`, ''));

        // 從 allProducts 中提取該篩選器的所有唯一選項
        const options = [...new Set(allProducts.map(p => p[filterDef.id]).filter(Boolean))];
        options.sort(); // 排序選項
        
        options.forEach(option => {
            select.add(new Option(option, option));
        });

        select.addEventListener('change', (e) => {
            const key = e.target.dataset.filterKey;
            const value = e.target.value;
            activeFilters[key] = value || null;
            renderProducts();
        });

        container.appendChild(select);
    });
}
    
async function initializeProductsPage() {
    productView.layout = localStorage.getItem('product_layout_preference') || 'grid';
    productView.sort = 'default';

    const container = document.getElementById('product-list-container');
    if (!container) return;
    container.innerHTML = `<p>載入中...</p>`; 
    
        const viewControls = document.getElementById('product-view-controls');
        const layoutSwitcher = document.querySelector('.layout-switcher');
        const gridBtn = document.getElementById('view-grid-btn');
        const listBtn = document.getElementById('view-list-btn');
        const sortButton = document.getElementById('price-sort-btn');
        const searchInput = document.getElementById('keyword-search');
        const clearBtn = document.getElementById('clear-filters');
    
        // 【錯誤修正】在綁定事件前，先檢查所有元素都存在
        if (!viewControls || !layoutSwitcher || !gridBtn || !listBtn || !sortButton || !searchInput || !clearBtn) {
            console.error("產品型錄頁缺少必要的 UI 元件，功能可能不完整。");
            // 即使缺少某些元件，也嘗試繼續執行，避免完全崩潰
        }
    
        if (CONFIG.FEATURES.ENABLE_PRODUCT_LAYOUT_SWITCH && layoutSwitcher) {
            layoutSwitcher.style.display = 'block';
        } else if (layoutSwitcher) {
            layoutSwitcher.style.display = 'none';
        }
        if (viewControls) viewControls.style.display = 'flex';
    
        // 安全地綁定事件
        gridBtn?.addEventListener('click', () => {
            productView.layout = 'grid';
            localStorage.setItem('product_layout_preference', 'grid');
            renderProducts();
        });
        listBtn?.addEventListener('click', () => {
            productView.layout = 'list';
            localStorage.setItem('product_layout_preference', 'list');
            renderProducts();
        });
        sortButton?.addEventListener('click', () => {
            const currentSort = productView.sort;
            if (currentSort === 'default') productView.sort = 'price_desc';
            else if (currentSort === 'price_desc') productView.sort = 'price_asc';
            else productView.sort = 'default';
            renderProducts();
        });
    
        try {
            if (allProducts.length === 0) {
                const res = await fetch('/api/get-products');
                if (!res.ok) throw new Error('API 請求失敗');
                allProducts = await res.json();
            }
            
            populateFilters();
            renderProducts();
            
            searchInput?.addEventListener('input', e => { 
                activeFilters.keyword = e.target.value; 
                renderProducts(); 
            });
            
            clearBtn?.addEventListener('click', () => {
                activeFilters.keyword = '';
                activeFilters.filter_1 = null;
                activeFilters.filter_2 = null;
                activeFilters.filter_3 = null;
                
                if(searchInput) searchInput.value = '';
                document.querySelectorAll('#dynamic-filter-container select').forEach(select => {
                    select.selectedIndex = 0;
                });
                renderProducts();
            });
        } catch (error) {
            console.error('初始化產品型錄失敗:', error);
            container.innerHTML = `<p style="color: var(--color-danger);">讀取${CONFIG.TERMS.PRODUCT_NAME}資料失敗。</p>`;
        }
    }

    function showBookingStep(stepId) {
        document.querySelectorAll('#booking-wizard-container .booking-step').forEach(step => step.classList.remove('active'));
        const targetStep = document.getElementById(stepId);
        if (targetStep) targetStep.classList.add('active');
        if (stepId === 'step-date-and-slots') {
            const slotsPlaceholder = document.getElementById('slots-placeholder');
            const slotsContainer = document.getElementById('booking-slots-container');
            if (slotsPlaceholder && slotsContainer) {
                slotsPlaceholder.textContent = '請先從上方選擇日期';
                slotsPlaceholder.style.display = 'block';
                slotsContainer.innerHTML = '';
            }
        }
        if(bookingHistoryStack[bookingHistoryStack.length - 1] !== stepId) {
            bookingHistoryStack.push(stepId);
        }
    }

    function goBackBookingStep() {
        if (bookingHistoryStack.length > 1) {
            bookingHistoryStack.pop();
            const lastStep = bookingHistoryStack[bookingHistoryStack.length - 1];
            showBookingStep(lastStep);
            return true;
        }
        return false;
    }


    // =================================================================
    // 【大幅修改】預約頁面相關函式
    // =================================================================

    // 【全新】輔助函式：新增一列預約項目
function addBookingItemRow(name = '', qty = 1) {
    const container = document.getElementById('booking-items-container');
    if (!container || container.children.length >= 5) {
        if (container && container.children.length >= 5) {
            document.getElementById('add-booking-item-btn').style.display = 'none';
        }
        return;
    }

    const itemRow = document.createElement('div');
    itemRow.className = 'booking-item-row';
    itemRow.style.cssText = 'display: flex; gap: 10px; margin-bottom: 10px; align-items: center;';

    const select = document.createElement('select');
    select.className = 'booking-item-select';
    select.style.flexGrow = '1';
    select.add(new Option('-- 請選擇服務項目 --', ''));
    allProducts.filter(p => p.is_visible).forEach(p => {
        // --- 選項文字顯示平日價格 ---
        const priceText = p.price_weekday !== null ? `$${p.price_weekday} 起` : '洽詢';
        select.add(new Option(`${p.name} - ${priceText}`, p.name));
    });
    select.value = name;

    const quantityInput = document.createElement('input');
    quantityInput.type = 'number';
    quantityInput.className = 'booking-item-qty';
    quantityInput.value = qty;
    quantityInput.min = 1;
    quantityInput.style.width = '70px';

    // --- 新增：隱藏欄位存放實際價格 ---
    const priceInputHidden = document.createElement('input');
    priceInputHidden.type = 'hidden';
    priceInputHidden.className = 'booking-item-actual-price';
    priceInputHidden.value = ''; // 稍後根據日期和選擇更新

const removeBtn = document.createElement('button');
    removeBtn.type = 'button';
    removeBtn.className = 'remove-booking-item-btn';
    removeBtn.textContent = '-';
    removeBtn.style.cssText = 'background: var(--color-danger); padding: 5px 10px; border: none; color: white; border-radius: 4px; cursor: pointer; height: fit-content;'; // 確保樣式正確

    // --- 確保這段事件綁定存在 ---
    removeBtn.addEventListener('click', () => {
        itemRow.remove(); // 移除自己所在的整列
        // 移除後，檢查是否需要重新顯示 "新增項目" 按鈕
        const currentContainer = document.getElementById('booking-items-container'); // 重新獲取容器
        if (currentContainer && currentContainer.children.length < 5) {
            const addBtn = document.getElementById('add-booking-item-btn');
            if (addBtn) addBtn.style.display = 'block';
        }
    });
    // --- 事件綁定結束 ---

    // --- 當選擇項目改變時，更新隱藏的價格欄位 ---
    select.addEventListener('change', () => {
        const selectedProductName = select.value;
        const selectedProduct = allProducts.find(p => p.name === selectedProductName);
        const bookingDate = bookingData.date; // 從全域變數獲取已選日期
        const actualPrice = selectedProduct ? getPriceForDate(bookingDate, selectedProduct) : null;
        priceInputHidden.value = actualPrice !== null ? actualPrice : ''; // 更新隱藏欄位的值
         // (可選) 在旁邊顯示當日價格提示
         updatePriceDisplay(itemRow, actualPrice);
    });

    itemRow.appendChild(select);
    itemRow.appendChild(quantityInput);
    itemRow.appendChild(priceInputHidden); // 加入隱藏欄位
    itemRow.appendChild(removeBtn);
    container.appendChild(itemRow);

     // (可選) 新增函式顯示價格提示
     function updatePriceDisplay(rowElement, price) {
         let priceDisplay = rowElement.querySelector('.price-display-hint');
         if (!priceDisplay) {
             priceDisplay = document.createElement('span');
             priceDisplay.className = 'price-display-hint';
             priceDisplay.style.fontSize = '0.8em';
             priceDisplay.style.color = 'var(--color-text-secondary)';
             // 插入到數量框旁邊
              rowElement.insertBefore(priceDisplay, priceInputHidden);
         }
         priceDisplay.textContent = price !== null ? ` ($${price})` : '';
     }


    // 初始載入時也嘗試設定價格 (如果 name 已經有值)
     if(name) {
         const initialProduct = allProducts.find(p => p.name === name);
         const initialPrice = initialProduct ? getPriceForDate(bookingData.date, initialProduct) : null;
         priceInputHidden.value = initialPrice !== null ? initialPrice : '';
         updatePriceDisplay(itemRow, initialPrice);
     }


    if (container.children.length >= 5) {
        document.getElementById('add-booking-item-btn').style.display = 'none';
    }
}


async function initializeBookingPage() {
    console.log("初始化預約頁面 - 當前樣板:", CONFIG.LOGIC.ACTIVE_INDUSTRY_TEMPLATE);

    // 共用前置作業：確保產品列表已載入
    try {
        if (allProducts.length === 0) {
            const res = await fetch('/api/get-products');
            if (!res.ok) throw new Error('無法獲取服務項目列表');
            allProducts = await res.json();
            console.log(`載入了 ${allProducts.length} 個產品`);
        }
    } catch (error) {
        console.error("初始化預約頁面失敗 (獲取產品):", error);
        const pageContent = document.getElementById('app-content').querySelector('#page-booking'); // 在目前頁面中尋找 #page-booking
        if (pageContent) {
            pageContent.innerHTML = `<p style="color:red; text-align: center;">無法載入服務項目，請稍後再試。</p>`;
        }
        return; // 如果產品載入失敗，停止後續初始化
    }

    // 綁定共用按鈕 ('查看我的預約', '確認預約/訂房')，使用 dataset 標記避免重複綁定
    const viewMyBookingsBtn = document.getElementById('view-my-bookings-btn');
    if (viewMyBookingsBtn && !viewMyBookingsBtn.dataset.listenerAttached) {
        viewMyBookingsBtn.addEventListener('click', () => showPage('page-my-bookings'));
        viewMyBookingsBtn.dataset.listenerAttached = 'true'; // 標記已綁定
    }
     const confirmBtn = document.getElementById('confirm-booking-btn');
     if (confirmBtn && !confirmBtn.dataset.listenerAttached) {
        confirmBtn.addEventListener('click', handleBookingConfirmation); // 指向中央處理函式
        confirmBtn.dataset.listenerAttached = 'true'; // 標記已綁定
     }


    // --- 根據樣板執行不同的初始化邏輯 ---
    if (CONFIG.LOGIC.ACTIVE_INDUSTRY_TEMPLATE === 'guesthouse_template') {
        await initializeGuesthouseBooking(); // 執行民宿樣板的初始化
    } else {
        // 假設是工作室樣板或其他使用舊邏輯的樣板
        await initializeStudioBooking(); // 執行工作室樣板的初始化 (包含動態創建元素)
    }

     // --- 預填聯絡資訊 (共用邏輯) ---
     try {
         const userData = await fetchproductData(); // 使用既有函式獲取用戶資料
         if (userData) {
             const nameInput = document.getElementById('contact-name');
             const phoneInput = document.getElementById('contact-phone');
             // 優先使用暱稱，其次真實姓名，最後 LINE 名稱
             if (nameInput) nameInput.value = userData.nickname || userData.real_name || userProfile?.displayName || '';
             if (phoneInput) phoneInput.value = userData.phone || '';
         }
     } catch(err){
         console.warn("無法預填聯絡資訊:", err);
     }
}

/**
 * 初始化民宿樣板的預約頁面
 */
async function initializeGuesthouseBooking() {
    console.log("初始化民宿訂房 UI");
    const dateRangePickerEl = document.getElementById('booking-date-range-picker');
    const roomSelectionContainer = document.getElementById('room-selection-container');
    const detailsForm = document.getElementById('booking-details-form');

    if (!dateRangePickerEl || !roomSelectionContainer || !detailsForm) {
        console.error("民宿初始化失敗：缺少必要的 HTML 元素。");
        return;
    }

    // 重置民宿相關狀態
    guesthouseBookingData = { startDate: null, endDate: null, numberOfNights: 0, roomAvailability: {}, selectedRooms: {} };
    roomSelectionContainer.innerHTML = '<p>請先選擇入住與退房日期以查看房型。</p>';
    detailsForm.style.display = 'none'; // 初始隱藏表單
    document.getElementById('estimated-total-price').textContent = '$0'; // 重置總價顯示

    // 如果已有 Flatpickr 實例，先銷毀
    if (flatpickrRangeInstance) {
        flatpickrRangeInstance.destroy();
        flatpickrRangeInstance = null;
    }

    // 初始化 Flatpickr 為日期範圍模式
    flatpickrRangeInstance = flatpickr(dateRangePickerEl, {
        mode: "range",          // 範圍選擇模式
        minDate: "today",       // 最早可選今天
        dateFormat: "Y-m-d",    // 日期格式
        locale: "zh_tw",        // 繁體中文
        onClose: async (selectedDates, dateStr, instance) => { // 當選擇器關閉時觸發
            if (selectedDates.length === 2) { // 必須選了開始和結束日期
                const start = selectedDates[0];
                const end = selectedDates[1];
                guesthouseBookingData.startDate = flatpickr.formatDate(start, "Y-m-d");
                guesthouseBookingData.endDate = flatpickr.formatDate(end, "Y-m-d");
                // 計算入住晚數
                guesthouseBookingData.numberOfNights = Math.round((end - start) / (1000 * 60 * 60 * 24));

                if (guesthouseBookingData.numberOfNights <= 0) { // 退房日必須晚於入住日
                    alert("退房日期必須晚於入住日期");
                    instance.clear(); // 清除選擇
                    roomSelectionContainer.innerHTML = '<p>請選擇有效的入住與退房日期。</p>';
                    detailsForm.style.display = 'none';
                    return;
                }

                console.log(`選擇日期範圍: ${guesthouseBookingData.startDate} 到 ${guesthouseBookingData.endDate} (${guesthouseBookingData.numberOfNights} 晚)`);
                roomSelectionContainer.innerHTML = '<p>正在查詢房況...</p>'; // 顯示載入中
                detailsForm.style.display = 'none'; // 查詢時隱藏表單

                try {
                    // 呼叫後端 API 查詢房況
                    const apiUrl = `/api/room-availability?startDate=${guesthouseBookingData.startDate}&endDate=${guesthouseBookingData.endDate}`;
                    const availability = await fetch(apiUrl).then(res => {
                        if (!res.ok) throw new Error(`查詢房況失敗 (${res.status})`);
                        return res.json();
                    });
                    // 使用 API 回應渲染房型列表
                    renderRoomList(availability, guesthouseBookingData.startDate, guesthouseBookingData.endDate);
                } catch (error) {
                    console.error("查詢房況失敗:", error);
                    roomSelectionContainer.innerHTML = `<p style="color: red;">查詢房況失敗：${error.message}</p>`;
                    detailsForm.style.display = 'none';
                }
            } else {
                 // 如果使用者清除了選擇或只選了一個日期
                 guesthouseBookingData.startDate = null;
                 guesthouseBookingData.endDate = null;
                 guesthouseBookingData.numberOfNights = 0;
                 roomSelectionContainer.innerHTML = '<p>請先選擇入住與退房日期以查看房型。</p>';
                 detailsForm.style.display = 'none';
                 calculateTotalPrice(); // 重置總價為 $0
            }
        }
    });
}

/**
 * 初始化工作室樣板 (或其他) 的預約頁面
 * 嘗試動態創建所需的 UI 元素
 */
async function initializeStudioBooking() {
    console.log("初始化工作室預約 UI");
    const pageBookingDiv = document.getElementById('app-content').querySelector('#page-booking');
    const detailsForm = document.getElementById('booking-details-form'); // 這個應該存在於修改後的 HTML

    if (!pageBookingDiv || !detailsForm) {
         console.error("工作室初始化失敗：找不到 #page-booking 或 #booking-details-form 元素。");
         return;
    }

     // --- 動態創建工作室需要的 UI 元素 (如果它們不存在) ---
     let datepickerContainer = pageBookingDiv.querySelector('#booking-datepicker-container');
     if (!datepickerContainer) {
         console.log("動態創建 #booking-datepicker-container (工作室樣板用)。");
         datepickerContainer = document.createElement('div');
         datepickerContainer.id = 'booking-datepicker-container';
         // 插入到聯絡資訊表單之前
         const firstDetailsSection = pageBookingDiv.querySelector('.details-section'); // 就是包含日期範圍選擇器的那個 section
         if(firstDetailsSection) {
             firstDetailsSection.innerHTML = '<h3>1. 選擇日期與時段</h3>'; // 覆寫民宿的標題
             firstDetailsSection.appendChild(datepickerContainer); // 將日曆容器加進去
         } else {
             console.error("找不到可以插入 datepickerContainer 的位置。");
             pageBookingDiv.innerHTML = `<p style="color:red">頁面結構錯誤，無法初始化預約功能。</p>`;
             return;
         }
     }

     let timeSlotContainer = pageBookingDiv.querySelector('#booking-time-slot-container');
     if (!timeSlotContainer) {
         console.log("動態創建 #booking-time-slot-container (工作室樣板用)。");
         timeSlotContainer = document.createElement('div');
         timeSlotContainer.id = 'booking-time-slot-container';
         timeSlotContainer.style.marginTop = '20px';
         timeSlotContainer.style.display = 'none'; // 初始隱藏
         timeSlotContainer.innerHTML = `
             <label for="time-slot-select" style="display: block; margin-bottom: 10px;">請選擇時段：</label>
             <select id="time-slot-select"></select>
         `;
         // 插入到日曆容器之後
         datepickerContainer.parentNode.appendChild(timeSlotContainer);
     }

     // 檢查並創建項目容器和按鈕 (如果需要)
     let itemsContainer = detailsForm.querySelector('#booking-items-container');
     let addBookingItemBtn = detailsForm.querySelector('#add-booking-item-btn');
     if (!itemsContainer) {
         console.log("動態創建 #booking-items-container 和按鈕 (工作室樣板用)。");
         const itemsSection = document.createElement('div');
         itemsSection.className = 'form-group';
         itemsSection.innerHTML = `
             <label>預約項目</label>
             <div id="booking-items-container"></div>
             <button type="button" id="add-booking-item-btn" class="cta-button" style="margin-top: 10px; background-color: var(--color-secondary); font-size: 0.9rem; padding: 8px;">⊕ 新增項目</button>
         `;
         // 插入到聯絡資訊表單的最前面 (在 hr 和姓名之前)
         const contactNameInput = detailsForm.querySelector('#contact-name');
         const hrElement = detailsForm.querySelector('hr'); // 找到分隔線
         if(contactNameInput && hrElement) {
             detailsForm.insertBefore(itemsSection, hrElement); // 插入在 hr 前面
             itemsContainer = document.getElementById('booking-items-container'); // 重新獲取引用
             addBookingItemBtn = document.getElementById('add-booking-item-btn'); // 重新獲取引用
         } else {
              console.error("找不到可以插入 itemsContainer 的位置。");
         }
     }

    // --- 現在，使用這些 (可能被動態創建的) 元素執行原本的工作室初始化邏輯 ---

    if (itemsContainer) itemsContainer.innerHTML = ''; // 清空可能殘留的項目
    // 綁定 "+ 新增項目" 按鈕事件 (如果按鈕存在且未綁定)
    if(addBookingItemBtn && !addBookingItemBtn.dataset.listenerAttached) {
        addBookingItemBtn.addEventListener('click', () => addBookingItemRow()); // 使用舊的 addBookingItemRow
        addBookingItemBtn.dataset.listenerAttached = 'true';
    }
    // 為工作室添加第一個預約項目行
    if(itemsContainer) addBookingItemRow();

    // 獲取預約截止天數和最早可預約日期
    const cutoffDays = CONFIG.LOGIC.BOOKING_CUTOFF_DAYS || 0;
    const minDate = new Date();
    minDate.setDate(minDate.getDate() + cutoffDays);
    let enabledDates = []; // 可預約日期列表
    try {
        // 從後端獲取可預約日期
        const response = await fetch('/api/bookings-check?month-init=true');
        if (!response.ok) throw new Error('無法獲取可預約日期');
        enabledDates = (await response.json()).enabledDates;
    } catch(e) {
        console.error('無法獲取可預約日期設定:', e);
        if(datepickerContainer) { // 如果日曆容器存在
            datepickerContainer.innerHTML = `<p style="color:var(--color-danger)">無法載入可預約日期，請稍後再試。</p>`;
        }
        return; // 無法載入日期則停止
    }

    // 初始化 Flatpickr 為單日選擇模式
    flatpickr(datepickerContainer, { // 使用 (可能動態創建的) 日曆容器
        inline: true,              // 內嵌顯示
        minDate: minDate,          // 最早可選日期
        dateFormat: "Y-m-d",       // 日期格式
        locale: "zh_tw",           // 繁體中文
        enable: enabledDates,      // 只啟用後端回傳的日期
        onChange: (selectedDates, dateStr) => { // 當選擇日期改變時
            const timeSlotSel = document.getElementById('time-slot-select'); // 獲取 (可能動態創建的) 時段下拉選單
            const detailsFrm = document.getElementById('booking-details-form');

            if (dateStr) { // 如果選擇了日期
                bookingData.date = dateStr; // 儲存選擇的日期
                if (timeSlotContainer) timeSlotContainer.style.display = 'block'; // 顯示時段容器
                if (detailsFrm) detailsFrm.style.display = 'none'; // 隱藏聯絡表單 (直到選了時段)
                if (timeSlotSel) renderTimeSlots(timeSlotSel); // 渲染時段選項
            } else { // 如果清除了日期選擇
                bookingData.date = null;
                if (timeSlotContainer) timeSlotContainer.style.display = 'none'; // 隱藏時段容器
                if (detailsFrm) detailsFrm.style.display = 'none'; // 隱藏聯絡表單
            }
             // 工作室日期變更邏輯：更新項目價格
             document.querySelectorAll('.booking-item-row').forEach(row => { // 注意 class 可能需要調整為工作室專用
                 const select = row.querySelector('.booking-item-select');
                 const priceInputHidden = row.querySelector('.booking-item-actual-price');
                 const selectedProductName = select?.value;
                 if (selectedProductName && priceInputHidden) { // 確保元素存在
                     const selectedProduct = allProducts.find(p => p.name === selectedProductName);
                     const actualPrice = selectedProduct ? getPriceForDate(dateStr, selectedProduct) : null;
                     priceInputHidden.value = actualPrice !== null ? actualPrice : ''; // 更新隱藏價格
                     // 更新價格提示
                     let priceDisplay = row.querySelector('.price-display-hint');
                     if (priceDisplay) {
                          priceDisplay.textContent = actualPrice !== null ? ` ($${actualPrice})` : '';
                     }
                 } else if (priceInputHidden){ // 如果日期清除或未選項目，清空價格
                      priceInputHidden.value = '';
                      let priceDisplay = row.querySelector('.price-display-hint');
                      if (priceDisplay) priceDisplay.textContent = '';
                 }
             });
        },
    });

    const timeSlotSelect = document.getElementById('time-slot-select'); // 獲取 (可能動態創建的) 時段下拉選單
    if (timeSlotSelect) { // 如果時段下拉選單存在
        timeSlotSelect.addEventListener('change', (e) => { // 當選擇時段改變時
            if (e.target.value) { // 如果選擇了有效的時段
                if (detailsForm) detailsForm.style.display = 'block'; // 顯示聯絡表單
            } else { // 如果選擇了 "-- 請選擇 --"
                if (detailsForm) detailsForm.style.display = 'none'; // 隱藏聯絡表單
            }
        });
    }
}

function renderTimeSlots(selectElement) {
    if (!selectElement) return;

    selectElement.innerHTML = '<option value="">-- 請選擇 --</option>'; // 清空並加入預設選項

    // 產生 8:00 到 18:00 的時間選項
    for (let hour = 8; hour <= 18; hour++) {
        const timeString = `${hour.toString().padStart(2, '0')}:00`;
        const option = document.createElement('option');
        option.value = timeString;
        option.textContent = timeString;
        selectElement.appendChild(option);
    }
}

    async function fetchAndRenderSlots(date) {
        const slotsPlaceholder = document.getElementById('slots-placeholder');
        const slotsContainer = document.getElementById('booking-slots-container');
        slotsPlaceholder.textContent = '正在查詢當日空位...';
        slotsContainer.innerHTML = '';
        slotsPlaceholder.style.display = 'block';
        try {
            const response = await fetch(`api/bookings-check?date=${date}`);
            if (!response.ok) throw new Error('查詢失敗');
            dailyAvailability = await response.json();
            if (dailyAvailability.available <= 0) {
                slotsPlaceholder.textContent = '抱歉，本日預約已額滿';
                return;
            }
            slotsPlaceholder.style.display = 'none';
            const now = new Date();
            const todayStr = now.toISOString().split('T')[0];
            const isToday = (date === todayStr);
            slotsContainer.innerHTML = AVAILABLE_TIME_SLOTS.map(slot => {
                let isDisabled = false;
                if (isToday) {
                    const [hour, minute] = slot.split(':');
                    const slotTime = new Date();
                    slotTime.setHours(hour, minute, 0, 0);
                    if (slotTime < now) {
                        isDisabled = true;
                    }
                }
                return `<button class="slot-button" ${isDisabled ? 'disabled' : ''}>${slot}</button>`;
            }).join('');
            slotsContainer.querySelectorAll('.slot-button:not([disabled])').forEach(btn => {
                btn.addEventListener('click', () => {
                    bookingData.timeSlot = btn.textContent;
                    document.getElementById('contact-summary').textContent = `${bookingData.date} 的 ${bookingData.timeSlot}`;
                    showBookingStep('step-contact');
                });
            });
        } catch (error) {
            slotsPlaceholder.textContent = `查詢空位失敗：${error.message}`;
        }
    }

    function renderSummary() {
        const summaryCard = document.getElementById('booking-summary-card');
        summaryCard.innerHTML = `
            <p><span>姓名:</span><span>${bookingData.name}</span></p>
            <p><span>電話:</span><span>${bookingData.phone}</span></p>
            <p><span>日期:</span><span>${bookingData.date}</span></p>
            <p><span>時段:</span><span>${bookingData.timeSlot}</span></p>
            <p><span>人數:</span><span>${bookingData.people} 人</span></p>
        `;
    }

async function handleBookingConfirmation(event) {
    const confirmBtn = event.target;
    // 防止重複提交
    if (confirmBtn.dataset.isSubmitting === 'true') return;

    // --- 根據樣板分流處理 ---
    if (CONFIG.LOGIC.ACTIVE_INDUSTRY_TEMPLATE === 'guesthouse_template') {
        await handleGuesthouseBookingConfirmation(confirmBtn); // 執行民宿訂房的提交邏輯
    } else {
        // 假設是工作室樣板或其他
        await handleStudioBookingConfirmation(confirmBtn); // 執行工作室預約的提交邏輯
    }
}


/**
 * 處理民宿樣板的訂房提交
 */
async function handleGuesthouseBookingConfirmation(confirmBtn) {
    console.log("處理民宿訂房提交");

    // 驗證：是否已選日期範圍
    if (!guesthouseBookingData.startDate || !guesthouseBookingData.endDate || guesthouseBookingData.numberOfNights <= 0) {
        alert('請先選擇有效的入住與退房日期！');
        return;
    }
    // 驗證：是否已選房型和數量
    if (Object.keys(guesthouseBookingData.selectedRooms).length === 0) {
        alert('請至少選擇一個房型與數量！');
        return;
    }

    // 驗證：聯絡資訊
    const contactName = document.getElementById('contact-name').value.trim();
    const contactPhone = document.getElementById('contact-phone').value.trim();
    if (!contactName || !contactPhone) {
        alert('預約姓名與聯絡電話為必填！');
        return;
    }
    const phoneRegex = /^09\d{8}$/;
    if (!phoneRegex.test(contactPhone)) {
        alert('請輸入正確的 10 位手機號碼 (必須為 09 開頭)。');
        return;
    }

    // 準備要傳給 API 的 items 陣列
    const itemsForApi = [];
    for (const productId in guesthouseBookingData.selectedRooms) {
        const quantity = guesthouseBookingData.selectedRooms[productId];
        if (quantity > 0) {
            itemsForApi.push({ productId: productId, quantity: quantity });
            // 注意：民宿訂房不需要從前端發送價格，後端會根據日期和庫存計算/驗證
        }
    }

    // 再次確認是否有選擇項目
    if (itemsForApi.length === 0) {
        alert('請至少選擇一個房型與數量！');
        return;
    }

    // 準備 API Payload (傳送給後端的資料結構)
    const bookingPayload = {
        userId: userProfile.userId,          // LIFF 使用者 ID
        startDate: guesthouseBookingData.startDate, // 入住日期
        endDate: guesthouseBookingData.endDate,     // 退房日期
        contactName: contactName,            // 聯絡人姓名
        contactPhone: contactPhone,          // 聯絡人電話
        items: itemsForApi,                  // 包含 { productId, quantity } 的陣列
        // 注意：人數(numOfPeople)欄位在此情境下可能不需要，後端可自行判斷或忽略
        // 注意：總金額(totalAmount)應由後端計算，前端不需傳送
        bookingType: 'guesthouse'            // 加上類型標記，方便後端區分
    };

    // --- 提交 API ---
    try {
        confirmBtn.dataset.isSubmitting = 'true'; // 標記為提交中
        confirmBtn.disabled = true;             // 禁用按鈕
        confirmBtn.textContent = '處理中...';    // 更改按鈕文字

        console.log("送出民宿訂房 payload:", JSON.stringify(bookingPayload));

        // 重要：假設後端 /api/bookings-create API 已更新，能處理此 payload
        const createRes = await fetch('/api/bookings-create', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(bookingPayload)
        });

        // 檢查 API 回應是否成功
        if (!createRes.ok) {
            // 嘗試解析錯誤訊息
            const errorResult = await createRes.json().catch(() => ({ error: `伺服器錯誤 ${createRes.status}` }));
            throw new Error(errorResult.error || '建立訂房時發生未知錯誤');
        }

        const result = await createRes.json(); // 獲取成功回應

        // 發送 LINE 確認訊息 (在背景執行，不影響主要流程)
        fetch('/api/send-message', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId: userProfile.userId, message: result.confirmationMessage })
        }).catch(err => console.error("發送 LINE 通知失敗:", err));

        // 顯示成功訊息並準備跳轉
        appContent.innerHTML = `
            <div class="details-section" style="text-align: center;">
                <h2 style="color: var(--color-accent);">✅ 訂房成功！</h2>
                <p>3 秒後將自動跳轉至您的預約列表...</p>
            </div>
        `;
        // 3 秒後跳轉到 '我的預約' 頁面
        setTimeout(() => { showPage('page-my-bookings'); }, 3000);

    } catch (error) { // 如果 API 提交失敗
        console.error("訂房失敗:", error);
        alert(`訂房失敗：${error.message}`);
        confirmBtn.dataset.isSubmitting = 'false'; // 解除提交中標記
        confirmBtn.disabled = false;             // 啟用按鈕
        confirmBtn.textContent = '確認訂房';       // 恢復按鈕文字
    }
}

/**
 * 處理工作室樣板 (或其他) 的預約提交 (原本的邏輯)
 */
async function handleStudioBookingConfirmation(confirmBtn) {
     console.log("處理工作室預約提交");
    // --- 收集工作室預約資料 (使用舊邏輯) ---
    const items = [];
    const itemRows = document.querySelectorAll('.booking-item-row'); // 工作室使用 .booking-item-row
    let calculatedTotalAmount = 0;
    let itemsValid = true;

    const bookingDate = bookingData.date; // 從單日選擇器獲取的日期
    if (!bookingDate) { // 確認日期已選
        alert('請先選擇預約日期！');
        return;
    }

    // 遍歷所有項目行
    itemRows.forEach(row => {
        if (!itemsValid) return; // 如果前面有項目無效，跳過後續
        const nameSelect = row.querySelector('.booking-item-select');
        const qtyInput = row.querySelector('.booking-item-qty');
        const priceInputHidden = row.querySelector('.booking-item-actual-price'); // 從隱藏欄位獲取價格

        const name = nameSelect?.value; // 獲取項目名稱
        const qty = parseInt(qtyInput?.value, 10); // 獲取數量
        const priceStr = priceInputHidden?.value; // 獲取隱藏的價格字串
        const price = (priceStr !== undefined && priceStr !== '') ? parseFloat(priceStr) : null; // 轉換為數字或 null

        if (name && !isNaN(qty) && qty > 0) { // 項目名稱有效，數量有效
             if (price === null || isNaN(price) || price < 0) { // 價格必須有效
                 console.error(`工作室項目 "${name}" 價格無效: '${priceStr}'`);
                 alert(`項目 "${name}" 無法根據您選擇的日期找到有效價格，請確認日期或重新選擇項目。`);
                 itemsValid = false; // 標記為無效
             } else {
                 items.push({ name, qty, price }); // 加入項目列表
                 calculatedTotalAmount += qty * price; // 累加總金額
             }
        } else if (name) { // 如果有選名稱但數量無效
             alert(`項目 "${name}" 的數量無效。`);
             itemsValid = false; // 標記為無效
        }
    });

    // 如果有任何項目無效，或沒有選擇任何項目，則停止提交
    if (!itemsValid || items.length === 0) {
        if (items.length === 0 && itemsValid) { // 確保不是因為價格無效而被攔截
            alert('請至少選擇一個有效的預約項目！');
        }
        return;
    }

    // 獲取其他表單欄位的值
    const timeSlot = document.getElementById('time-slot-select')?.value; // 時段
    const numOfPeople = document.getElementById('booking-people')?.value; // 人數 (假設工作室需要)
    const contactName = document.getElementById('contact-name')?.value;   // 姓名
    const contactPhone = document.getElementById('contact-phone')?.value; // 電話

    // 驗證必填欄位
    if (!timeSlot || !contactName || !contactPhone || !numOfPeople) {
         alert('時段、姓名、電話與人數為必填！');
         return;
    }
     // 驗證電話格式
     const phoneRegex = /^09\d{8}$/;
     if (!phoneRegex.test(contactPhone)) {
         alert('請輸入正確的 10 位手機號碼 (必須為 09 開頭)。');
         return;
     }

    // --- 準備工作室 API Payload (使用舊格式) ---
    const bookingPayload = {
        userId: userProfile.userId,
        bookingDate: bookingDate,      // 單一日期
        timeSlot: timeSlot,          // 單一時段
        numOfPeople: numOfPeople,      // 人數
        contactName: contactName,
        contactPhone: contactPhone,
        items: items,                // 包含 { name, qty, price } 的陣列
        totalAmount: calculatedTotalAmount, // 發送計算出的總金額
        bookingType: 'studio'          // 加上類型標記
    };

    // --- API 提交 (使用舊邏輯) ---
    try {
        confirmBtn.dataset.isSubmitting = 'true'; // 標記為提交中
        confirmBtn.disabled = true;             // 禁用按鈕
        confirmBtn.textContent = '處理中...';    // 更改按鈕文字

        console.log("送出工作室預約 payload:", JSON.stringify(bookingPayload));

        const createRes = await fetch('/api/bookings-create', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(bookingPayload)
        });

        // 檢查 API 回應是否成功
        if (!createRes.ok) {
            // 嘗試解析錯誤訊息
            const errorResult = await createRes.json().catch(() => ({ error: `伺服器錯誤 ${createRes.status}` }));
            throw new Error(errorResult.error || '建立預約時發生未知錯誤');
        }

        const result = await createRes.json(); // 獲取成功回應

        // 發送 LINE 確認訊息 (在背景執行)
        fetch('/api/send-message', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId: userProfile.userId, message: result.confirmationMessage })
        }).catch(err => console.error("發送 LINE 通知失敗:", err));

        // 顯示成功訊息並準備跳轉
        appContent.innerHTML = `
            <div class="details-section" style="text-align: center;">
                <h2 style="color: var(--color-accent);">✅ 預約成功！</h2>
                <p>3 秒後將自動跳轉至您的預約列表...</p>
            </div>
        `;
        // 3 秒後跳轉到 '我的預約' 頁面
        setTimeout(() => { showPage('page-my-bookings'); }, 3000);

    } catch (error) { // 如果 API 提交失敗
        console.error("預約失敗:", error);
        alert(`預約失敗：${error.message}`);
        confirmBtn.dataset.isSubmitting = 'false'; // 解除提交中標記
        confirmBtn.disabled = false;             // 啟用按鈕
        confirmBtn.textContent = '確認預約';       // 恢復按鈕文字 (工作室用)
    }
}

    // =================================================================
    // Tab Bar 主導航
    // =================================================================

    // --- 啟動點 ---
    main();
});