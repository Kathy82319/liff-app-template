document.addEventListener('DOMContentLoaded', () => {

    let myLiffId = ""; 
    let userProfile = null;
    let productData = {};
    const appContent = document.getElementById('app-content');
    const pageTemplates = document.getElementById('page-templates');
    let activeTemplate = null; 
    let CONFIG; 
    
    let productView = { 
        layout: 'grid', 
        sort: 'default' 
    };
    let activeFilters = {
        keyword: '',
        filter_1: null,
        filter_2: null,
        filter_3: null
    };
    let allProducts = [];
    let allNews = [];
    let bookingData = {};

    let guesthouseBookingData = { 
        startDate: null,
        endDate: null,
        numberOfNights: 0,
        roomAvailability: {}, 
        selectedRooms: {} 
    };
    let flatpickrRangeInstance = null;
    let rallyData = { userProgress: [], activeCampaign: null };
    let rallyQrCodeScanner = null;
    const pageInitializers = {
        'page-home': initializeHomePage,
        'page-products': initializeProductsPage,
        'page-profile': initializeProfilePage,
        'page-my-bookings': initializeMyBookingsPage, 
        'page-my-exp-history': initializeMyExpHistoryPage,
        'page-booking': initializeBookingPage,
        'page-info': initializeInfoPage,
        'page-edit-profile': initializeEditProfilePage,
        'page-product-details': (data) => renderProductDetails(data.product),
        'page-news-details': (data) => renderNewsDetails(data.news),
        'page-booking-details': initializeBookingDetailsPage, 
        'page-my-stored-value-history': initializeMyStoredValueHistoryPage,
        'page-my-vouchers': initializeMyVouchersPage,
        'page-rally': initializeRallyPage,
        'page-my-records': initializeMyRecordsPage,
    };

 // 計算所選房間及入住天數的預估總金額
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
            const priceForRoom = roomInfo.totalPrice !== null
                               ? roomInfo.totalPrice
                               : (roomInfo.pricePerNight * guesthouseBookingData.numberOfNights);
            total += priceForRoom * quantity;
        }
    }

    estimatedTotalPriceEl.textContent = `$${Math.round(total)}`; 
}

// public/script.js

function renderRoomList(availabilityData, startDate, endDate) {
    const container = document.getElementById('room-selection-container');
    if (!container) return;

    // 判斷是否為預覽模式 (還沒選日期)
    const isPreviewMode = !availabilityData || !startDate || !endDate;

    guesthouseBookingData.roomAvailability = availabilityData || {}; 
    
    // 只有在非預覽模式下才重置選擇，預覽模式下保持原狀 (或清空)
    if (!isPreviewMode) {
        guesthouseBookingData.selectedRooms = {}; 
    }

    const productsToRender = allProducts.filter(p => p.is_visible);

    if (productsToRender.length === 0) {
        container.innerHTML = '<p style="text-align:center; padding:20px;">目前沒有可預訂的房型。</p>';
        return;
    }

    let hasAnyBookableRoom = false; 

    container.innerHTML = productsToRender.map(product => {
        // --- 預覽模式邏輯 ---
        if (isPreviewMode) {
            const defaultPrice = product.price_weekday !== null ? `$${product.price_weekday} 起` : '洽詢';
            const images = JSON.parse(product.images || '[]');
            const imageUrl = images.length > 0 ? images[0] : 'https://placehold.co/100x100/E6DAC8/A48D78?text=No+Image';
            
            return `
                <div class="room-item" style="opacity: 0.7; background-color: #f9f9f9;">
                    <img src="${imageUrl}" class="room-thumb" alt="${product.name}">
                    <div class="room-content">
                        <div class="room-name">${product.name}</div>
                        <div class="room-price" style="color:#888;">${defaultPrice} <span style="font-size:0.8em; font-weight:normal;">/ 晚</span></div>
                        <span style="font-size:0.8rem; color: var(--color-primary);">← 請先選擇日期</span>
                    </div>
                    <div class="room-controls">
                        <select class="room-qty-select" disabled><option>0</option></select>
                    </div>
                </div>
            `;
        }

        // --- 查詢後邏輯 (有日期資料) ---
        const roomInfo = availabilityData[product.product_id];
        let isOverallAvailable = false;
        let maxQuantity = 0;
        let priceText = '洽詢';
        let disableQuantitySelector = true; 

        if (roomInfo) { 
             isOverallAvailable = roomInfo.isAvailable;
             maxQuantity = roomInfo.minAvailableQuantity || 0;
             priceText = roomInfo.pricePerNight !== null ? `$${roomInfo.pricePerNight}` : '價格洽詢';

            if (isOverallAvailable) {
                 disableQuantitySelector = false;
                 hasAnyBookableRoom = true; 
            }
        }

        const images = JSON.parse(product.images || '[]');
        const imageUrl = images.length > 0 ? images[0] : 'https://placehold.co/100x100/E6DAC8/A48D78?text=No+Image';

        let quantityOptions = '<option value="0">0</option>';
        if (!disableQuantitySelector) {
            for (let i = 1; i <= maxQuantity; i++) {
                quantityOptions += `<option value="${i}">${i}</option>`;
            }
        }

        // 根據狀態調整樣式
        const itemStyle = !isOverallAvailable ? 'opacity: 0.6; background-color: #eee;' : '';
        const statusText = !isOverallAvailable ? '<span style="color:var(--color-danger); font-size:0.8rem;">已售完 / 未開放</span>' : '';

        return `
            <div class="room-item" style="${itemStyle}">
                <img src="${imageUrl}" class="room-thumb" alt="${product.name}">
                
                <div class="room-content">
                    <div class="room-name">${product.name}</div>
                    <div class="room-price">${priceText} <span style="font-size:0.8em; color:#888; font-weight:normal;">/ 晚</span></div>
                    ${statusText}
                </div>

                <div class="room-controls">
                    <select id="room-qty-${product.product_id}" class="room-qty-select" data-product-id="${product.product_id}" ${disableQuantitySelector ? 'disabled' : ''}>
                        ${quantityOptions}
                    </select>
                    ${!disableQuantitySelector ? `<span class="room-stock-badge">剩 ${maxQuantity}</span>` : ''}
                </div>
            </div>
        `;
    }).join('');

    // 綁定數量選擇事件
    container.querySelectorAll('.room-qty-select:not([disabled])').forEach(select => {
        select.addEventListener('change', (e) => {
            const productId = e.target.dataset.productId;
            const quantity = parseInt(e.target.value, 10);
            if (quantity > 0) {
                guesthouseBookingData.selectedRooms[productId] = quantity;
            } else {
                delete guesthouseBookingData.selectedRooms[productId];
            }
            calculateTotalPrice(); 
        });
    });

    if (!isPreviewMode && !hasAnyBookableRoom) {
         container.innerHTML += '<p style="text-align: center; color: var(--color-danger); margin-top: 10px;">抱歉，所選日期區間已無空房。</p>';
    }

    calculateTotalPrice();
}

function getPriceForDate(dateString, product) {
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
            // --- 【修改】先獲取設定檔 ---
        const response = await fetch('/api/get-app-config');
        if (!response.ok) throw new Error(`伺服器錯誤 ${response.status}`);
        const configData = await response.json();
        
        // --- 【新增】從設定檔讀取 LIFF ID ---
        if (configData.ENV && configData.ENV.LIFF_ID) {
            myLiffId = configData.ENV.LIFF_ID;
        } else {
            throw new Error("系統未設定 LIFF_ID (環境變數)");
        }

        if(!configData || !configData.LOGIC){
             throw new Error('獲取到的設定檔格式不正確。');
        }
            
            CONFIG = configData;
            const activeTemplateKey = CONFIG.LOGIC.ACTIVE_INDUSTRY_TEMPLATE;
            activeTemplate = CONFIG.LOGIC.INDUSTRY_TEMPLATE_DEFINITIONS[activeTemplateKey];
            
            if (!activeTemplate) {
                throw new Error(`在設定中找不到名為 "${activeTemplateKey}" 的商業樣板。`);
            }

            // 2. 初始化 LIFF 並處理路由
            await initializeAppFlow();

        } catch (error) {
            console.error("初始化失敗:", error);
            appContent.innerHTML = `<div style="text-align: center; padding: 20px; color: var(--color-danger);">
                <h2>系統啟動失敗</h2><p>${error.message}</p><p>請確認後台設定正常。</p>
            </div>`;
        }
    }
    

    // =================================================================
    // LIFF 初始化與路由判斷 (修正版)
    // =================================================================
async function initializeAppFlow() {
        try {
            await liff.init({ liffId: myLiffId });

            // 1. 登入檢查
            if (!liff.isLoggedIn()) {
                // 【關鍵修正】建立一個乾淨的 redirectUri
                // 這是為了解決網頁版 400 Bad Request 的問題
                const destinationUrl = new URL(window.location.href);
                
                // 移除 LINE 自動帶入的參數，避免參數汙染導致登入失敗
                destinationUrl.searchParams.delete('code');
                destinationUrl.searchParams.delete('state');
                destinationUrl.searchParams.delete('liffClientId');
                destinationUrl.searchParams.delete('liffRedirectUri');
                
                console.log("準備登入，重導向至:", destinationUrl.toString());
                liff.login({ redirectUri: destinationUrl.toString() });
                return; 
            }
            
            userProfile = await liff.getProfile();

            // 2. 參數判斷：區分「領券」與「一般登入」
            const urlParams = new URLSearchParams(window.location.search);
            
            // 【修正】明確檢查 voucher_code 參數
            // 我們不再依賴長度猜測，而是依賴參數名稱，這是最穩健的做法
            const voucherCode = urlParams.get('voucher_code');
            
            // 檢查是否有 LINE 登入回傳的 auth code (用於清理網址)
            const authCode = urlParams.get('code');

            if (voucherCode) {
                console.log(`偵測到優惠券代碼 (voucher_code): ${voucherCode}`);
                await handleVoucherClaim(voucherCode);
            } else {
                // 正常進入 App 流程
                // 如果網址上有殘留的 auth code，清除它以保持網址乾淨
                if (authCode) {
                     // 移除查詢參數，只保留 hash (如果有的話)
                     const cleanUrl = window.location.pathname + window.location.hash;
                     history.replaceState(null, '', cleanUrl);
                }
                
                handleDefaultRouting();
            }

        } catch (err) {
            console.error("LIFF 初始化失敗", err);
            handleDefaultRouting();
        }
    }

    // 處理預設路由 (首頁或 Hash 頁面)
    function handleDefaultRouting() {
        // 優先使用網址 Hash，若無則預設 home
        let currentHash = window.location.hash.substring(1); 
        const initialPageId = currentHash || 'home'; 
        
        history.replaceState({ page: `page-${initialPageId}`, data: null }, '', `#${initialPageId}`);
        applyConfiguration(); 
        setupGlobalEventListeners();
        renderPage(`page-${initialPageId}`);
    }

    // 處理優惠券領取
    async function handleVoucherClaim(claimCode) {
        // 顯示載入畫面
        appContent.innerHTML = `<p style="text-align: center; padding: 30px;">正在領取優惠券...</p>`;
        
        try {
            const response = await fetch('/api/claim-voucher', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    userId: userProfile.userId,
                    public_claim_code: claimCode
                })
            });
            
            const result = await response.json();

            if (!response.ok) {
                // 如果是 409 (已領過)，我們視為一種"資訊"，不算是嚴重錯誤
                if (response.status === 409) {
                     alert(`訊息：\n${result.error}`);
                } else {
                     throw new Error(result.error || '領取失敗');
                }
            } else {
                alert(`✅ 領取成功！\n${result.message}`);
            }

        } catch (error) {
            console.error("領券 API 失敗:", error);
            alert(`❌ 領取失敗：\n${error.message}`);
        } finally {
            // 無論結果如何，清除 URL 參數並跳轉至「我的優惠券」
            history.replaceState(null, '', window.location.pathname); 
            applyConfiguration(); 
            setupGlobalEventListeners();
            showPage('page-my-vouchers'); 
        }
    }

    // 設定檔應用函式
function applyConfiguration() {
          try {
                if (!CONFIG || !activeTemplate) {
                    console.error("嚴重錯誤：CONFIG 或 activeTemplate 設定檔不存在！"); return;
                }

                const features = activeTemplate.features || {};
                const terms = activeTemplate.terms || {};
                const logic = activeTemplate.logic || {};
                const navBarConfig = logic.navBar || []; 

                document.querySelectorAll('.tab-button').forEach(tab => {
                    const targetPage = tab.dataset.target;
                    const config = navBarConfig.find(item => item.target === targetPage);

                    if (config) {
                        if (config.enabled === false) {
                            tab.style.display = 'none';
                        } else {
                            const label = config.label || '未命名'; 
                            tab.innerHTML = label.length > 2 ? label.substring(0, 2) + '<br>' + label.substring(2) : label;
                            tab.style.display = ''; 
                        }
                    } else {
                        tab.style.display = ''; 
                    }
                });
                
                document.title = terms.BUSINESS_NAME || '載入中...';

                if (pageTemplates) {
                    const setContent = (selector, content) => {
                        const el = pageTemplates.querySelector(selector);
                        if (el) el.textContent = content;
                    };
                    const setPlaceholder = (selector, content) => {
                        const el = pageTemplates.querySelector(selector);
                        if (el) el.setAttribute('placeholder', content);
                    };

                    setContent('#page-home .page-main-title', terms.NEWS_PAGE_TITLE || '最新情報');
                    setContent('#page-products .page-main-title', terms.PRODUCT_CATALOG_TITLE || '產品型錄');
                    setContent('#page-profile .page-main-title', "會員中心"); 
                    setContent('#page-booking .page-main-title', terms.BOOKING_PAGE_TITLE || '線上預約');
                    setContent('#page-info .page-main-title', "店家資訊"); 
                    
                    setPlaceholder('#page-products #keyword-search', `搜尋${terms.PRODUCT_NAME || '項目'}關鍵字...`);
                }

            } catch (e) {
                console.error("套用設定檔時發生錯誤:", e);
            }
    }
    // =================================================================
    // LIFF 初始化 & 全域事件
    // =================================================================
    async function checkVoucherClaim() {
        const urlParams = new URLSearchParams(window.location.search);
        const claimCode = urlParams.get('code');

        // 先初始化 LIFF 並登入
        await initializeLiff(); // <-- 將 initializeLiff 移到這裡
        
        if (claimCode && userProfile) {
            // 如果有代碼，且 LIFF 已登入
            console.log(`偵測到領券代碼: ${claimCode}`);
            
            // 顯示一個簡單的載入提示
            appContent.innerHTML = `<p style="text-align: center; padding: 30px;">正在領取優惠券...</p>`;
            
            try {
                const response = await fetch('/api/claim-voucher', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        userId: userProfile.userId,
                        public_claim_code: claimCode
                    })
                });
                
                const result = await response.json();

                if (!response.ok) {
                    throw new Error(result.error || '領取失敗');
                }
                
                // 領取成功
                alert(`✅ 領取成功！\n${result.message}\n\n即將跳轉至「我的優惠券」...`);
                
            } catch (error) {
                // 領取失敗
                console.error("領券 API 失敗:", error);
                alert(`❌ 領取失敗：\n${error.message}`);
            } finally {
                // 無論成功失敗，都清除 URL 代碼並跳轉到優惠券頁面
                history.replaceState(null, '', window.location.pathname); // 清除 code
                showPage('page-my-vouchers'); // 顯示優惠券頁面
            }
        } else {
         
            console.log("沒有領券代碼，正常啟動 App。");
        }
    }
    
    
async function initializeLiff() {
        try {
            await liff.init({ liffId: myLiffId });
            if (!liff.isLoggedIn()) {
                // 登入時保留 URL 參數
                liff.login({ redirectUri: window.location.href }); 
                return;
            }
            userProfile = await liff.getProfile();
            
            // 只有在 *沒有* 領券代碼 (code) 時，才執行路由初始化
            const urlParams = new URLSearchParams(window.location.search);
            if (!urlParams.has('code')) {
                
                // --- ▼▼▼ 修正開始：優先使用網址上的 Hash ▼▼▼ ---
                // 1. 取得目前的 Hash (移除 # 號)
                let currentHash = window.location.hash.substring(1); 
                
                // 2. 如果沒有 Hash，才預設為 'home'
                const initialPageId = currentHash || 'home'; 
                
                // 3. 設定 History 狀態 (保留原本的 Hash 或使用 home)
                history.replaceState({ page: `page-${initialPageId}`, data: null }, '', `#${initialPageId}`);
                
                applyConfiguration(); 
                setupGlobalEventListeners();
                
                // 4. 渲染正確的頁面
                renderPage(`page-${initialPageId}`);
                // --- ▲▲▲ 修正結束 ▲▲▲ ---
            }
            
        } catch (err) {
            console.error("LIFF 初始化失敗", err);
            // 發生錯誤時的回退機制
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
            if (target.id === 'my-stored-value-btn') { showPage('page-my-stored-value-history'); return; }
            if (target.id === 'my-vouchers-btn') { showPage('page-my-vouchers'); return; } 
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
        if (!card) return; 
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
            initializeMyBookingsPage();

        } catch (error) {
            alert(error.message);
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
    const pastContainerWrapper = document.getElementById(containerId); // 這是外層 div
    const listContainer = document.getElementById('past-bookings-list'); // 這是內層列表 div

    if (!pastContainerWrapper || !listContainer || !button) return;
    
    const isHidden = pastContainerWrapper.style.display === 'none';
    
    if (isHidden) {
        pastContainerWrapper.style.display = 'block';
        button.textContent = '隱藏過往紀錄';
        listContainer.innerHTML = '<p style="text-align:center; color:#888;">查詢中...</p>';
        
        // 呼叫共用的載入函式
        loadMyBookingsList('past', listContainer);
    } else {
        pastContainerWrapper.style.display = 'none';
        button.textContent = '查看過往/已取消紀錄';
    }
}


function renderBookings(bookings, container, isPast = false) {
    if (!container) return;
    if (!bookings || bookings.length === 0) { 
        container.innerHTML = `<p style="text-align:center; padding:20px; color:#888;">${isPast ? '沒有過往的預約紀錄。' : '您目前沒有即將到來的預約。'}</p>`;
        return;
    }

    const isGuesthouse = (activeTemplate && activeTemplate.logic.adminEntityNamePlural === '民宿') || 
                         (CONFIG && CONFIG.LOGIC.ACTIVE_INDUSTRY_TEMPLATE === 'guesthouse_template');

    container.innerHTML = bookings.map(b => {
        const bookingId = b.booking_id; 
        let dateDisplay = '';
        let itemSummary = '';
        
        // 1. 日期區間顯示
        if (isGuesthouse && b.booking_date && b.check_out_date) {
            dateDisplay = `${b.booking_date} ~ ${b.check_out_date}`;
        } else {
            dateDisplay = `${b.booking_date} ${b.time_slot || ''}`;
        }

        // 2. 房型/項目顯示
        itemSummary = b.items?.map(item => `${item.item_name} x${item.quantity}`).join(', ') || '無項目資訊';
        
        // 3. 總金額
        const totalAmountText = b.total_amount !== null ? `$${b.total_amount}` : '待確認';

        // 狀態顏色
        let statusColor = '#666';
        if (b.status === 'confirmed') statusColor = 'var(--color-success)';
        if (b.status === 'cancelled') statusColor = 'var(--color-danger)';

        // 4. 【修正】移除 onclick，改用 data-booking-id
        return `
            <div class="booking-info-card" data-booking-id="${bookingId}" style="cursor: pointer; background-color: var(--color-card-bg); border: 1px solid var(--color-secondary); border-radius: 8px; padding: 15px; margin-bottom: 15px;">
                <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 8px;">
                    <strong style="font-size: 1.1rem; color: var(--color-text-primary);">${dateDisplay}</strong>
                    <span style="font-size: 0.9rem; color: ${statusColor}; font-weight: bold;">${b.status_text}</span>
                </div>
                <p style="margin: 5px 0; color: var(--color-text-secondary);">${itemSummary}</p>
                <p style="margin: 5px 0; text-align: right; font-weight: bold; color: var(--color-primary);">總金額：${totalAmountText}</p>
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

    const terms = activeTemplate?.terms || {};
    const features = activeTemplate?.features || {};
    const showStoredValue = features.CLIENT_SHOW_STORED_VALUE !== false;

    const displayNameEl = document.getElementById('display-name');
    if (displayNameEl) displayNameEl.textContent = data.real_name || (userProfile ? userProfile.displayName : '訪客');

    const classEl = document.getElementById('user-class');
    const levelEl = document.getElementById('user-level');
    if (classEl) classEl.textContent = data.class || '一般會員';
    if (levelEl) levelEl.textContent = `Lv.${data.level} (點數: ${data.current_exp})`;

    // ★★★ 修正：正確抓取容器與數值元素 ★★★
    const storedValueEl = document.getElementById('user-stored-value');
    const balanceContainer = document.getElementById('user-balance-container');

    if (showStoredValue) {
        const balance = (data.stored_value_balance !== undefined && data.stored_value_balance !== null) ? data.stored_value_balance : 0;
        if (storedValueEl) storedValueEl.textContent = `$${balance}`;
        if (balanceContainer) balanceContainer.style.display = 'block';
    } else {
        if (balanceContainer) balanceContainer.style.display = 'none';
    }

    const perkP = document.getElementById('user-perk-line');
    if (perkP) {
        if (features.PROFILE_SHOW_PERK_LINE !== false && data.perk && data.class !== '無') {
            perkP.innerHTML = `<strong>${terms.PROFILE_PERK_LABEL || '專屬優惠'}：</strong><span>${data.perk}</span>`;
            perkP.style.display = 'block';
        } else {
            perkP.style.display = 'none';
        }
    }
    
    const qrcodeContainer = document.getElementById('qrcode-container');
    if (features.PROFILE_SHOW_QR_CODE === false && qrcodeContainer) {
         qrcodeContainer.style.display = 'none';
    }
}


    // =================================================================
    // 各頁面初始化函式
    // =================================================================
    
async function initializeHomePage() {
    // 綁定懸浮按鈕 (FAB)
    const rallyFab = document.getElementById('rally-fab-btn');
    if (rallyFab && !rallyFab.dataset.listenerAttached) {
        rallyFab.addEventListener('click', () => {
            showPage('page-rally');
        });
        rallyFab.dataset.listenerAttached = 'true';
    }

    // 設定標題
    const terms = activeTemplate?.terms || {};
    try {
        const pageTitle = appContent.querySelector('#page-home .page-main-title');
        if (pageTitle) {
            pageTitle.textContent = terms.NEWS_PAGE_TITLE || '最新情報';
        }
    } catch(e) {
        console.error("設定 Home 標題失敗:", e);
    }

    // 載入最新情報
    const container = document.getElementById('news-list-container');
    if (!container) return;
    
    // 標示載入中
    container.innerHTML = `<p style="padding: 10px; color: var(--color-text-secondary);">載入中...</p>`;
    
    try {
        const response = await fetch('api/get-news');
        if (!response.ok) throw new Error('無法獲取情報');
        
        allNews = await response.json();
        
        // 使用橫向捲動樣式渲染 (CSS 已配合調整)
        // renderNews 函式本身不需要大改，只要容器 class 正確即可
        setupNewsFilters(); 
        renderNews(); 
        
    } catch (error) {
        container.innerHTML = `<p style="padding: 10px; color:var(--color-danger);">載入失敗: ${error.message}</p>`;
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

    try {
        // 1. 獲取最新資料
        const userData = await fetchproductData(true); 
        
        // 【修正】直接呼叫 updateProfileDisplay 來更新所有欄位 (包含儲值金與區塊顯示邏輯)
        updateProfileDisplay(userData);

        // 更新頭像 (保持不變)
        const picEl = document.getElementById('profile-picture');
        if (picEl && userProfile.pictureUrl) picEl.src = userProfile.pictureUrl;

        // QR Code 生成 (保持不變)
        const qrcodeContainer = document.getElementById('qrcode');
        if (qrcodeContainer) {
             qrcodeContainer.innerHTML = ''; 
             try {
                 new QRCode(qrcodeContainer, { 
                     text: userProfile.userId, 
                     width: 65, height: 65, 
                     colorDark : "#4A403A", colorLight : "#ffffff",
                     correctLevel : QRCode.CorrectLevel.L
                 });
             } catch (e) { console.error("QR Code Error", e); }
        }

    } catch (error) {
        console.error("會員資料載入失敗:", error);
    }

    // 2. 綁定功能按鈕 (保持不變)
    const btnMap = {
        'btn-my-records': 'page-my-records',
        'btn-my-vouchers': 'page-my-vouchers',
        'btn-edit-profile': 'page-edit-profile',
        'btn-go-rally': 'page-rally'
    };

    for (const [btnId, pageId] of Object.entries(btnMap)) {
        const btn = document.getElementById(btnId);
        if (btn) {
            const newBtn = btn.cloneNode(true);
            btn.parentNode.replaceChild(newBtn, btn);
            newBtn.addEventListener('click', () => {
                showPage(pageId);
            });
        }
    }
}

async function loadMyBookingsList(filter, container) {
    // 如果沒有傳入 container，嘗試抓取預設的 (防呆)
    if (!container) {
        console.error("loadMyBookingsList 錯誤：未指定容器");
        return;
    }

    container.innerHTML = '<p style="text-align:center; color:#999; padding:15px;">載入中...</p>';
    
    try {
        // 【修正】正確使用傳入的 filter 參數
        const response = await fetch(`api/my-bookings?userId=${userProfile.userId}&filter=${filter}`);
        
        if (!response.ok) throw new Error('查詢預約失敗');
        
        const bookings = await response.json();
        
        // 【修正】傳入正確的參數給 renderBookings (isPast = (filter === 'past'))
        renderBookings(bookings, container, filter === 'past');

    } catch (error) {
        console.error("載入預約列表失敗:", error);
        container.innerHTML = `<p style="color: var(--color-danger); text-align: center;">${error.message}</p>`;
    }
}

// [新增] 初始化綜合紀錄頁面
async function initializeMyRecordsPage() {
    console.log("初始化我的紀錄頁面..."); // Debug 用
    if (!userProfile) return;

    // --- A. 綁定分頁切換事件 (Tab) ---
    const header = document.querySelector('.records-tabs-header');
    if (header && !header.dataset.listenerAttached) {
        header.addEventListener('click', (e) => {
            const targetTab = e.target.closest('.record-tab');
            if (targetTab) {
                // 1. 移除所有 Tab 的 active 樣式
                header.querySelectorAll('.record-tab').forEach(t => t.classList.remove('active'));
                // 2. 設定當前 Tab 為 active
                targetTab.classList.add('active');
                
                // 3. 隱藏所有內容區塊
                const allPanes = document.querySelectorAll('.records-content-pane');
                allPanes.forEach(p => p.classList.remove('active'));
                
                // 4. 顯示對應的內容區塊
                const targetId = targetTab.dataset.target;
                const contentPane = document.getElementById(targetId);
                if (contentPane) {
                    contentPane.classList.add('active');
                } else {
                    console.error(`找不到對應的內容區塊 ID: ${targetId}`);
                }
            }
        });
        header.dataset.listenerAttached = 'true';
    }

    // --- B. 預約紀錄 Tab 初始化 ---
    const bookingContainer = document.getElementById('my-bookings-container');
    const toggleBtn = document.getElementById('toggle-past-bookings-btn');    

    // 確保元素存在才執行
    if (bookingContainer) {
        bookingContainer.innerHTML = '<p style="text-align:center; color:#888;">查詢中...</p>';
        
        // 綁定點擊事件 (委派模式，處理動態生成的卡片)
        bookingContainer.removeEventListener('click', handleBookingCardClick);
        bookingContainer.addEventListener('click', handleBookingCardClick);
        
        // 載入預約資料
        loadMyBookingsList('current', bookingContainer);
    }

    if (toggleBtn) {
        // 重置切換按鈕 (移除舊監聽器)
        const newBtn = toggleBtn.cloneNode(true);
        toggleBtn.parentNode.replaceChild(newBtn, toggleBtn);
        newBtn.addEventListener('click', () => togglePastView('bookings', 'past-bookings-container', newBtn));
        
        // 確保過往紀錄容器預設隱藏
        const pastContainer = document.getElementById('past-bookings-container');
        if (pastContainer) {
            pastContainer.style.display = 'none';
            // 也要為過往紀錄綁定點擊事件
            pastContainer.removeEventListener('click', handleBookingCardClick);
            pastContainer.addEventListener('click', handleBookingCardClick);
        }
    }

    // --- C. 載入點數與儲值紀錄 (這兩行一定要執行) ---
    console.log("正在載入點數與儲值紀錄...");
    loadMyPointsList();
    loadMyWalletList();
}

// 輔助：載入點數列表
async function loadMyPointsList() {
    const container = document.getElementById('my-points-list');
    if (!container) return;
    
    container.innerHTML = '<p style="text-align:center; color:#999; padding:15px;">載入中...</p>';
    
    try {
        const res = await fetch(`api/my-purchase-history?userId=${userProfile.userId}`);
        const points = await res.json();
        
        if (points.length === 0) {
            container.innerHTML = '<p style="text-align:center; padding:20px; color:#888;">尚無點數紀錄</p>';
            return;
        }

        container.innerHTML = points.map(p => {
            const isPlus = p.exp_added > 0;
            return `
                <div class="record-item">
                    <div>
                        <div class="record-main">${p.reason}</div>
                        <div class="record-sub">${new Date(p.created_at).toLocaleDateString()}</div>
                    </div>
                    <div class="record-value ${isPlus ? 'val-plus' : 'val-minus'}">
                        ${isPlus ? '+' : ''}${p.exp_added}
                    </div>
                </div>
            `;
        }).join('');
    } catch (e) { 
        console.error("點數載入錯誤", e);
        container.innerHTML = '<p style="text-align:center; color:red;">載入失敗</p>'; 
    }
}

// 輔助：載入儲值列表
async function loadMyWalletList() {
    const container = document.getElementById('my-wallet-list');
    if (!container) return;
    
    container.innerHTML = '<p style="text-align:center; color:#999; padding:15px;">載入中...</p>';
    
    try {
        const res = await fetch(`api/my-stored-value-history?userId=${userProfile.userId}`);
        const records = await res.json();
        
        if (records.length === 0) {
            container.innerHTML = '<p style="text-align:center; padding:20px; color:#888;">尚無儲值變動紀錄</p>';
            return;
        }

        const typeMap = { 'admin_topup': '儲值', 'admin_deduct': '扣款', 'booking_payment': '消費扣抵' };

        container.innerHTML = records.map(r => {
            const isPlus = r.amount_changed > 0;
            return `
                <div class="record-item">
                    <div>
                        <div class="record-main">${typeMap[r.type] || '變動'}</div>
                        <div class="record-sub">${new Date(r.created_at).toLocaleDateString()} ${r.notes ? '('+r.notes+')' : ''}</div>
                    </div>
                    <div class="record-value ${isPlus ? 'val-plus' : 'val-minus'}">
                        ${isPlus ? '+' : ''}$${Math.abs(r.amount_changed)}
                    </div>
                </div>
            `;
        }).join('');
    } catch (e) { 
        console.error("儲值載入錯誤", e);
        container.innerHTML = '<p style="text-align:center; color:red;">載入失敗</p>'; 
    }
}
async function initializeMyBookingsPage() {
        if (!userProfile) return;

        try {
            const terms = activeTemplate?.terms || {};
            const pageTitle = appContent.querySelector('#page-my-bookings .page-main-title');
            if (pageTitle) {
                pageTitle.textContent = terms.PROFILE_BOOKINGS_BTN_LABEL || '我的預約紀錄';
            }
        } catch(e) {
            console.error("設定 MyBookings 標題失敗:", e);
        }

        const container = document.getElementById('my-bookings-container');
        const pastContainer = document.getElementById('past-bookings-container'); 
        const toggleBtn = document.getElementById('toggle-past-bookings-btn');    

        if (!container || !pastContainer || !toggleBtn) return; 

        container.innerHTML = '<p>查詢中...</p>';
        pastContainer.style.display = 'none';
        toggleBtn.textContent = '查看過往紀錄';
        toggleBtn.replaceWith(toggleBtn.cloneNode(true));
        document.getElementById('toggle-past-bookings-btn').addEventListener('click', () => togglePastView('bookings', 'past-bookings-container', document.getElementById('toggle-past-bookings-btn')));


        try {
            const response = await fetch(`api/my-bookings?userId=${userProfile.userId}&filter=current`);
            if (!response.ok) throw new Error('查詢預約失敗');
            const bookings = await response.json();
            renderBookings(bookings, container, false);

            container.removeEventListener('click', handleBookingCardClick); 
            container.addEventListener('click', handleBookingCardClick);
            pastContainer.removeEventListener('click', handleBookingCardClick); 
            pastContainer.addEventListener('click', handleBookingCardClick);

        } catch (error) {
            container.innerHTML = `<p style="color: var(--color-danger);">${error.message}</p>`;
        }
    }

function handleBookingCardClick(event) {
    const card = event.target.closest('.booking-info-card[data-booking-id]');
    if (card && !event.target.classList.contains('cancel-booking-btn')) {
        const bookingId = card.dataset.bookingId;
        console.log("點擊預約卡片:", bookingId);
        showPage('page-booking-details', { bookingId: Number(bookingId) }); // 傳遞 bookingId
    }
}

async function initializeBookingDetailsPage(data) {
    const loadingEl = document.getElementById('booking-details-loading');
    const contentContainer = document.getElementById('booking-details-content-container');
    const cancelBtn = document.getElementById('details-cancel-booking-btn');

    if (!data || !data.bookingId) { return; }

    loadingEl.style.display = 'block';
    contentContainer.style.display = 'none';
    cancelBtn.style.display = 'none'; // 預設隱藏

    try {
        const [bookingRes, policyRes] = await Promise.all([
            fetch(`/api/my-bookings?userId=${userProfile.userId}&bookingId=${data.bookingId}`),
            fetch('/api/get-booking-policy')
        ]);

        let booking = null;
        if (bookingRes.ok) {
            const bookingResult = await bookingRes.json();
            booking = Array.isArray(bookingResult) ? bookingResult[0] : bookingResult;
        }
        if (!booking) throw new Error('找不到預約資料');

        let policy = await policyRes.json().catch(() => ({ cancellationPolicy: '-', checkInInstructions: '-' }));

        // 填入資料
        document.getElementById('details-check-in-date').textContent = booking.booking_date || '-';
        document.getElementById('details-check-out-date').textContent = booking.check_out_date || '-';
        
        // 計算晚數
        let nights = '-';
        if(booking.booking_date && booking.check_out_date) {
             const start = new Date(booking.booking_date);
             const end = new Date(booking.check_out_date);
             nights = Math.round((end - start) / (1000 * 60 * 60 * 24));
        }
        document.getElementById('details-nights').textContent = nights;

        // 填入項目
        const itemsListEl = document.getElementById('details-items-list');
        itemsListEl.innerHTML = (booking.items || []).map(item => 
            `<div class="room-item-row"><span>${item.item_name} x ${item.quantity}</span> <span>$${item.price * item.quantity}</span></div>`
        ).join('');

        document.getElementById('details-total-amount').textContent = booking.total_amount || '-';
        document.getElementById('details-cancellation-policy').textContent = policy.cancellationPolicy || '未設定';
        document.getElementById('details-check-in-instructions').textContent = policy.checkInInstructions || '未設定';

        // [關鍵] 恢復取消按鈕邏輯
        // 只有狀態是 'confirmed' 且後台設定允許取消 (或預設允許) 時才顯示
        const enableCancellation = CONFIG.FEATURES.ENABLE_CUSTOMER_CANCELLATION !== false; 
        
        if (booking.status === 'confirmed' && enableCancellation) {
            cancelBtn.style.display = 'block'; // 顯示按鈕
            
            // 移除舊監聽器並綁定新的 (防止重複綁定)
            const newBtn = cancelBtn.cloneNode(true);
            cancelBtn.parentNode.replaceChild(newBtn, cancelBtn);
            
            newBtn.addEventListener('click', async () => {
                if (confirm('您確定要取消這筆預約嗎？此操作無法復原。')) {
                    await handleCancelBooking(booking.booking_id); // 呼叫 script.js 既有的取消函式
                }
            });
        }

        loadingEl.style.display = 'none';
        contentContainer.style.display = 'block';

    } catch (error) {
        loadingEl.innerHTML = `<p style="color:red;">載入失敗: ${error.message}</p>`;
    }
}

async function initializeMyExpHistoryPage() {
        if (!userProfile) return;

        const terms = activeTemplate?.terms || {};
        try {
            const pageTitle = appContent.querySelector('#page-my-exp-history .page-main-title');
            if (pageTitle) {
                pageTitle.textContent = terms.PROFILE_EXP_HISTORY_BTN_LABEL || '我的點數紀錄';
            }
        } catch(e) {
            console.error("設定 MyExpHistory 標題失敗:", e);
        }
        
        const container = document.getElementById('my-exp-history-container');
        if (!container) return;
        container.innerHTML = `<p>查詢中...</p>`;
        try {
            const response = await fetch(`api/my-purchase-history?userId=${userProfile.userId}`);
            if (!response.ok) throw new Error('查詢紀錄失敗');
            const records = await response.json();
            
            const pointsName = terms.POINTS_NAME || '點數';

            if (records.length === 0) {
                container.innerHTML = `<p>您目前沒有任何${pointsName}紀錄。</p>`;
            } else {
                container.innerHTML = records.map(r => `<div class="exp-record-card" style="display: flex; justify-content: space-between;"><span>${new Date(r.created_at).toLocaleDateString()}</span><span>${r.reason}</span><span style="font-weight: bold; color: ${r.exp_added > 0 ? 'var(--color-accent)' : 'var(--color-danger)'};">${r.exp_added > 0 ? '+' : ''}${r.exp_added}</span></div>`).join('');
            }
        } catch (error) {
            container.innerHTML = `<p style="color: var(--color-danger);">${error.message}</p>`;
        }
    }

async function initializeMyStoredValueHistoryPage() {
    if (!userProfile) return;

    // (可選) 設定頁面標題
    try {
        const pageTitle = appContent.querySelector('#page-my-stored-value-history .page-main-title');
        if (pageTitle) {
            pageTitle.textContent = '我的儲值金紀錄';
        }
    } catch(e) {
        console.error("設定 MyStoredValueHistory 標題失敗:", e);
    }
    
    const container = document.getElementById('my-stored-value-container');
    if (!container) return;
    container.innerHTML = `<p>查詢中...</p>`;
    
    try {
        // 呼叫新建立的 API
        const response = await fetch(`api/my-stored-value-history?userId=${userProfile.userId}`);
        if (!response.ok) throw new Error('查詢紀錄失敗');
        const records = await response.json();
        
        // 翻譯類型
        const typeMap = {
            'admin_topup': '店家儲值',
            'admin_deduct': '店家扣款',
            'booking_payment': '訂房扣款'
        };

        if (records.length === 0) {
            container.innerHTML = `<p>您目前沒有任何儲值金變動紀錄。</p>`;
        } else {
            // 我們沿用 .exp-record-card 的樣式，但修改排版
            container.innerHTML = records.map(r => {
                const amountClass = r.amount_changed > 0 ? 'var(--color-accent)' : 'var(--color-danger)';
                const amountSign = r.amount_changed > 0 ? '+' : '';
                const notes = r.notes ? `(${r.notes})` : '';

                return `
                <div class="exp-record-card" style="display: grid; grid-template-columns: 1fr 1.5fr 1fr; gap: 10px; align-items: center;">
                    <span style="font-size: 0.9em;">${new Date(r.created_at).toLocaleDateString()}</span>
                    <span style="font-size: 0.9em;">${typeMap[r.type] || r.type} ${notes}</span>
                    <span style="font-weight: bold; color: ${amountClass}; text-align: right;">${amountSign}${r.amount_changed}</span>
                </div>
                `;
            }).join('');
        }
    } catch (error) {
        container.innerHTML = `<p style="color: var(--color-danger);">${error.message}</p>`;
    }
}

/**
 * 任務 3.4: 初始化「我的優惠券」頁面
 */
async function initializeMyVouchersPage() {
    if (!userProfile) return;
    
    // 獲取容器
    const availableContainer = document.getElementById('my-vouchers-container-available');
    const usedContainer = document.getElementById('my-vouchers-container-used');
    if (!availableContainer || !usedContainer) {
        console.error("找不到 my-vouchers-container-available 或 my-vouchers-container-used 元素");
        return;
    }

    availableContainer.innerHTML = '<p>查詢中...</p>';
    usedContainer.innerHTML = '<p>查詢中...</p>';

    try {
        // 1. 呼叫 Task 3.1 建立的 API
        const response = await fetch(`api/my-vouchers?userId=${userProfile.userId}`);
        if (!response.ok) throw new Error('查詢優惠券失敗');
        const vouchers = await response.json();
        
        const now = new Date();
        
        // 2. 篩選「可使用」的券
        const availableVouchers = vouchers.filter(v => 
            !v.is_used && 
            (!v.valid_to || new Date(v.valid_to + 'T23:59:59') >= now)
        );
        
        // 3. 篩選「已失效」的券 (已使用 或 已過期)
        const usedVouchers = vouchers.filter(v => 
            v.is_used || 
            (v.valid_to && new Date(v.valid_to + 'T23:59:59') < now)
        );

        // 4. 渲染列表
        renderVoucherList(availableVouchers, availableContainer, false);
        renderVoucherList(usedVouchers, usedContainer, true);

        // 5. 綁定「可使用」列表的點擊事件
        availableContainer.addEventListener('click', (e) => {
            const redeemBtn = e.target.closest('.btn-redeem-voucher');
            if (redeemBtn) {
                const voucherId = redeemBtn.dataset.voucherId;
                const voucherTitle = redeemBtn.dataset.voucherTitle;
                if(voucherId && voucherTitle) {
                    showRedeemModal(voucherId, voucherTitle);
                }
            }
        });

    } catch (error) {
        console.error("載入優惠券失敗:", error);
        availableContainer.innerHTML = `<p style="color: var(--color-danger);">${error.message}</p>`;
        usedContainer.innerHTML = '';
    }
}

/**
 * 輔助函式：渲染優惠券列表
 * @param {Array} vouchers - 優惠券資料陣列
 * @param {HTMLElement} container - 要渲染的容器
 * @param {boolean} isUsedList - 是否為「已使用/過期」列表
 */
function renderVoucherList(vouchers, container, isUsedList) {
    if (vouchers.length === 0) {
        container.innerHTML = `<p>${isUsedList ? '沒有已使用或過期的紀錄。' : '目前沒有可用的優惠券。'}</p>`;
        return;
    }

    // 使用 booking-info-card 樣式，並加入 voucher-card 識別
    container.innerHTML = vouchers.map(v => {
        let valueText = '';
        switch (v.type) {
            case 'discount_fixed': valueText = `$${v.value} 折扣`; break;
            case 'discount_percentage': valueText = `${v.value}% 折扣`; break;
            case 'redeem_item': valueText = `兌換：${v.redeem_item_name}`; break;
            default: valueText = '優惠';
        }
        
        const validDate = (v.valid_from && v.valid_to) 
            ? `${v.valid_from.split('T')[0]} ~ ${v.valid_to.split('T')[0]}` 
            : '永久有效';
            
        let statusText = '';
        if (isUsedList) {
            if (v.is_used) {
                statusText = `<p class="voucher-status-used">已於 ${new Date(v.used_at).toLocaleDateString()} 核銷</p>`;
            } else {
                statusText = `<p class="voucher-status-used">已過期</p>`;
            }
        } else {
            statusText = `<button class="cta-button btn-redeem-voucher" data-voucher-id="${v.voucher_id}" data-voucher-title="${v.title}" style="margin-top: 10px; padding: 8px; background-color: var(--color-accent);">出示核銷</button>`;
        }

        return `
            <div class="booking-info-card voucher-card ${isUsedList ? 'used-voucher' : ''}">
                <h4>${v.title}</h4>
                <p><strong>類型:</strong> ${valueText}</p>
                <p><strong>低消:</strong> $${v.min_spend || 0}</p>
                <p><strong>效期:</strong> ${validDate}</p>
                ${statusText}
            </div>
        `;
    }).join('');
}

/**
 * 輔助函式：顯示核銷 QR Code Modal
 * @param {string} voucherId - 優惠券 ID
 * @param {string} voucherTitle - 優惠券標題
 */
function showRedeemModal(voucherId, voucherTitle) {
    const modal = document.getElementById('voucher-redeem-modal');
    const qrcodeEl = document.getElementById('voucher-redeem-qrcode');
    const titleEl = document.getElementById('voucher-redeem-title');
    const codeEl = document.getElementById('voucher-redeem-code');
    const closeBtn = document.getElementById('voucher-redeem-close-btn');

    if (!modal || !qrcodeEl || !titleEl || !codeEl || !closeBtn) {
        console.error("找不到 voucher-redeem-modal 相關元素");
        return;
    }
    
    titleEl.textContent = voucherTitle;
    codeEl.textContent = `ID: ${voucherId}`; // 顯示 ID 文字
    qrcodeEl.innerHTML = ''; // 清除舊的 QR code

    try {
        // 產生 QR Code
        new QRCode(qrcodeEl, {
            text: voucherId, // QR Code 內容就是 voucherId
            width: 200,
            height: 200,
        });
    } catch (e) {
        console.error("QRCode library 錯誤:", e);
        qrcodeEl.innerHTML = '<p style="color:red; font-size: 0.8em;">QR Code 產生失敗</p>';
    }
    
    modal.style.display = 'flex';
    
    // 確保關閉按鈕能運作 (使用 onclick 避免重複綁定)
    closeBtn.onclick = () => {
        modal.style.display = 'none';
        qrcodeEl.innerHTML = ''; // 關閉時清除
    };
}
// --- ▲▲▲ 新增函式結束 ▲▲▲ ---

async function initializeInfoPage() {
    // 1. 設定導覽列標題
    try {
        const logic = activeTemplate?.logic || {};
        const navBarConfig = logic.navBar || [];
        const pageTitle = document.querySelector('#page-info .page-main-title');
        if (pageTitle) {
            const infoNav = navBarConfig.find(item => item.target === 'page-info');
            pageTitle.textContent = infoNav?.label || '店家資訊';
        }
    } catch(e) { console.error(e); }

    const container = document.getElementById('store-info-container');
    if (!container) return;

    container.innerHTML = '<p style="text-align:center; color:#888;">載入中...</p>';

    try {
        const response = await fetch('/api/get-store-info');
        if (!response.ok) throw new Error('無法獲取店家資訊');
        const info = await response.json();
        
        // --- 2. 使用 JS 強制重繪 HTML 結構與樣式 (解決 CSS 無效問題) ---
        // 定義樣式常數
        const rowStyle = `
            display: grid; 
            grid-template-columns: 50px 1fr; 
            gap: 8px; 
            align-items: start; 
            padding: 8px 0; 
            border-bottom: 1px solid rgba(0,0,0,0.05);
        `;
        const titleStyle = `
            font-size: 0.95rem; 
            color: var(--color-secondary); 
            margin: 0; 
            font-weight: bold; 
            line-height: 1.5;
            margin-top: 2px;
        `;
        const contentStyle = `
            margin: 0; 
            color: var(--color-text-primary); 
            font-size: 1rem; 
            line-height: 1.5; 
            white-space: pre-wrap;
            display: flex; align-items: center; flex-wrap: wrap;
        `;

        // 準備資料欄位
        const mapUrl = info.address ? `https://www.google.com/maps/search/?api=1&query=$${encodeURIComponent(info.address)}` : '#';
        const addressHtml = info.address ? `
            <span>${info.address}</span>
            <a href="${mapUrl}" target="_blank" class="map-link-btn" title="開啟地圖" style="margin-left:5px; display:inline-flex; align-items:center; justify-content:center; background:#E8F5E9; border-radius:50%; width:24px; height:24px; text-decoration:none; color:#2E7D32;">
                📍
            </a>
        ` : '未提供';

        // 組裝 HTML
        let html = '';
        
        // 名稱 (第一項，特別移除上方 padding)
        if (info.store_name) {
            html += `
                <div class="info-section" style="${rowStyle} padding-top: 10px; border-top: none;font-size: 0.95rem;">
                    <h2 style="${titleStyle}">名稱</h2>
                    <p style="${contentStyle}">${info.store_name}</p>
                </div>
            `;
        }
        
        // 地址
        html += `
            <div class="info-section" style="${rowStyle} font-size: 0.95rem;">
                <h2 style="${titleStyle}">地址</h2>
                <p style="${contentStyle}">${addressHtml}</p>
            </div>
        `;
        
        // 電話
        html += `
            <div class="info-section" style="${rowStyle} font-size: 0.95rem;">
                <h2 style="${titleStyle}">電話</h2>
                <p style="${contentStyle}">${info.phone || '未提供'}</p>
            </div>
        `;
        
        // 營業時間
        html += `
            <div class="info-section" style="${rowStyle} font-size: 0.95rem;">
                <h2 style="${titleStyle}">時間</h2>
                <p style="${contentStyle}">${info.opening_hours || '未提供'}</p>
            </div>
        `;
        
        // 介紹
        html += `
            <div class="info-section" style="${rowStyle} border-bottom: none; font-size: 0.95rem;">
                <h2 style="${titleStyle}">介紹</h2>
                <p style="${contentStyle}">${info.description || '未提供'}</p>
            </div>
        `;

        container.innerHTML = html;

    } catch (error) {
        console.error("店家資訊載入失敗", error);
        container.innerHTML = `<p style="color:var(--color-danger); text-align:center; padding:20px;">載入失敗: ${error.message}</p>`;
    }
}

async function initializeEditProfilePage() {

        try {
            const terms = activeTemplate?.terms || {};
            const pageTitle = appContent.querySelector('#page-edit-profile .page-main-title');
            if (pageTitle) {
                pageTitle.textContent = terms.PROFILE_EDIT_BTN_LABEL || '編輯個人資料';
            }
        } catch(e) {
            console.error("設定 Edit Profile 標題失敗:", e);
        }
        
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

            const formData = {
                userId: userProfile.userId,
                realName: document.getElementById('edit-profile-real-name').value.trim(),
                phone: document.getElementById('edit-profile-phone').value,
                email: document.getElementById('edit-profile-email').value,
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
                setTimeout(() => history.back(), 1500); 
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
    if (!product || typeof product !== 'object') {
        console.error("renderProductDetails 錯誤：傳入的 product 無效。", product);
        appContent.innerHTML = `<p style="color:red;">無法載入產品資料。</p>`; 
        return;
    }
    if (!activeTemplate || !Array.isArray(activeTemplate.fields)) {
        console.error("renderProductDetails 錯誤：activeTemplate 無效或缺少 fields。", activeTemplate);
        appContent.innerHTML = `<p style="color:red;">系統樣板設定錯誤。</p>`;
        return;
    }
    console.log("Rendering details for product:", product); 

    const detailsTitle = appContent.querySelector('.details-title');
    const gallery = appContent.querySelector('.details-gallery');
    const contentContainer = appContent.querySelector('#product-details-content'); 

    if (!detailsTitle || !gallery || !contentContainer) {
         console.error("renderProductDetails 錯誤：找不到必要的 DOM 元素 (title, gallery, or content container)。");
         appContent.innerHTML = `<p style="color:red;">頁面結構錯誤，無法顯示產品詳情。</p>`;
         return;
    }
    const mainImage = gallery.querySelector('.details-image-main');
    const thumbnails = gallery.querySelector('.details-image-thumbnails');
    if(!mainImage || !thumbnails){
         console.error("renderProductDetails 錯誤：找不到 gallery 內的 mainImage 或 thumbnails 元素。");
         gallery.style.display = 'none'; 
    }

    // 設置標題和清空內容
    detailsTitle.textContent = product.name || "產品名稱載入失敗";
    contentContainer.innerHTML = ''; 

    // 1. 處理圖片庫
    try {
         const images = JSON.parse(product.images || '[]');
         if (images.length > 0 && mainImage && thumbnails) {
             mainImage.src = images[0];
             thumbnails.innerHTML = images.map((img, index) => `<img src="${img}" class="${index === 0 ? 'active' : ''}" data-src="${img}">`).join('');
             gallery.style.display = 'block';

             // 重新綁定縮圖點擊事件 (因為 innerHTML 會移除舊監聽器)
             thumbnails.replaceWith(thumbnails.cloneNode(true)); 
             appContent.querySelector('.details-gallery .details-image-thumbnails').addEventListener('click', e => {
                 if (e.target.tagName === 'IMG') {
                      if(mainImage) mainImage.src = e.target.dataset.src;
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

    // 2. 顯示價格區塊
    const priceSection = document.createElement('div');
    priceSection.className = 'detail-field-section product-price-details';
    const priceLabel = document.createElement('h3');
    priceLabel.textContent = '價格';
    const priceContent = document.createElement('p');
    priceContent.innerHTML = `
        平日:${product.price_weekday !== null ? '$' + product.price_weekday : '洽詢'}(平日：週日至周四)<br>
        週五:${product.price_friday !== null ? '$' + product.price_friday : '洽詢'}<br>
        週六:${product.price_saturday !== null ? '$' + product.price_saturday : '洽詢'}
    `;
    priceSection.append(priceLabel, priceContent);
    contentContainer.appendChild(priceSection); 

    // 3. 根據樣板藍圖 (activeTemplate.fields) 依序顯示欄位
    //    並在 'description' 欄位後插入「彈性規格」
    try {
        activeTemplate.fields.forEach(field => {
            
            // 略過已手動處理或不應顯示的欄位
            if (field.key === 'name' || field.key === 'images' || field.key === 'is_visible' || field.key.startsWith('price_')) return;
            
            const value = product[field.key];
            
            // 檢查欄位是否有值 (非 null、非 undefined、非空字串)
            if (value !== null && typeof value !== 'undefined' && String(value).trim() !== '') {
                // 創建 h3 和 p 元素來顯示欄位
                const section = document.createElement('div');
                section.className = 'detail-field-section';
                
                const label = document.createElement('h3');
                label.textContent = field.label; // 顯示藍圖中的標籤
                
                const content = document.createElement('p');
                content.innerHTML = String(value).replace(/\n/g, '<br>'); // 顯示內容並處理換行
                
                section.append(label, content);
                contentContainer.appendChild(section); 

                // 【您的需求】如果剛剛顯示的是 'description'（介紹詞）
                // 立刻接著顯示彈性規格
if (field.key === 'description') {
                // ========== ▼▼▼ 替換 try...catch 區塊 ▼▼▼ ==========
                try {
                    // 手動檢查並渲染「彈性通用規格」
                    for (let i = 1; i <= 5; i++) {
                        const specNameKey = `spec_${i}_name`;
                        const specValueKey = `spec_${i}_value`;

                        const specName = product[specNameKey] || '';  // 獲取名稱，或為空字串
                        const specValue = product[specValueKey] || ''; // 獲取內容，或為空字串

                        // --- 【新條件】只要「名稱」或「內容」其中之一有值，就顯示 ---
                        if (specName || specValue) { 
                            const specSection = document.createElement('div');
                            specSection.className = 'detail-field-section';

                            // --- 【新邏輯】只有在「名稱」有值時，才建立 <h3> 標籤 ---
                            if (specName) {
                                const label = document.createElement('h3');
                                label.textContent = specName; // 標題是規格名稱
                                specSection.appendChild(label);
                            }

                            const content = document.createElement('p');
                            // 內容永遠顯示 (specValue 可能是空字串，也可能有值)
                            content.innerHTML = specValue.replace(/\n/g, '<br>'); 

                            // 如果沒有標題 (h3)，讓段落(p)更貼近頂部
                            if (!specName) {
                                content.style.marginTop = '0';
                            }

                            specSection.appendChild(content);
                            contentContainer.appendChild(specSection);
                        }
                    }
                } catch (e) {
                    console.error("渲染彈性規格時出錯:", e);
                }
                }
            }
        });
    } catch (e) {
        console.error("渲染其他產品欄位時出錯:", e);
         contentContainer.innerHTML += `<p style="color:red;">部分欄位渲染失敗。</p>`; 
    }
}

function renderProducts() {
    const container = document.getElementById('product-list-container');
    const sortButton = document.getElementById('price-sort-btn');
    if(!container || !sortButton) return;

    let filteredProducts = allProducts.filter(p => p.is_visible === 1);

    const keyword = activeFilters.keyword.toLowerCase().trim();
    if (keyword) { 
        filteredProducts = filteredProducts.filter(p => p.name.toLowerCase().includes(keyword)); 
    }

    const filterDefinitions = window.CONFIG?.LOGIC?.PRODUCT_FILTERS || [];
    filterDefinitions.forEach(filterDef => {
        const filterKey = filterDef.id; // e.g., 'filter_1'
        const selectedValue = activeFilters[filterKey];
        if (selectedValue) {
            filteredProducts = filteredProducts.filter(p => p[filterKey] === selectedValue);
        }
    });


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

    container.className = productView.layout === 'grid' ? 'view-grid' : 'view-list';
    document.getElementById('view-grid-btn').classList.toggle('active', productView.layout === 'grid');
    document.getElementById('view-list-btn').classList.toggle('active', productView.layout === 'list');
    sortButton.dataset.sort = productView.sort;

    if (filteredProducts.length === 0) {
        container.innerHTML = `<p>找不到符合條件的${CONFIG.TERMS.PRODUCT_NAME}。</p>`;
        return;
    }

 container.innerHTML = filteredProducts.map(product => {
        let priceDisplay = product.price_weekday != null ? `$${product.price_weekday}` : '洽詢';
        // 如果是列表模式，顯示更多資訊；如果是網格，顯示精簡資訊
        const isList = productView.layout === 'list';
        
        const images = JSON.parse(product.images || '[]');
        // 使用假圖佔位，如果沒有圖片
        const imageUrl = images.length > 0 ? images[0] : 'https://placehold.co/400x300/F5F5F5/CCCCCC?text=No+Image';

        return `
            <div class="product-card" data-product-id="${product.product_id}">
                <img src="${imageUrl}" alt="${product.name}" class="product-image">
                <div class="product-info">
                    <div style="display:flex; justify-content:space-between; align-items:flex-start;">
                        <h3 class="product-title" style="margin:0;">${product.name}</h3>
                        <span style="color:var(--color-primary); font-weight:bold; font-size:1rem;">${priceDisplay}</span>
                    </div>
                    ${isList ? `<p style="font-size:0.85rem; color:#888; margin:5px 0 0 0;">${product.description ? product.description.substring(0, 40) + '...' : ''}</p>` : ''}
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
    return; 
}
if (filterDefinitions.length === 0) {
     return;
}

    filterDefinitions.forEach(filterDef => {
        const select = document.createElement('select');
        select.id = `liff-${filterDef.id}`;
        select.dataset.filterKey = filterDef.id;

        select.add(new Option(`-- ${filterDef.name} --`, ''));

        const options = [...new Set(allProducts.map(p => p[filterDef.id]).filter(Boolean))];
        options.sort(); 
        
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
    
        const pageTitle = appContent.querySelector('#page-products .page-main-title'); 
        const filterControls = document.getElementById('filter-controls');
        const searchInput = document.getElementById('keyword-search');
        const dynamicFilters = document.getElementById('dynamic-filter-container'); 
        const clearBtn = document.getElementById('clear-filters');
        const viewControls = document.getElementById('product-view-controls');
        const layoutSwitcher = document.querySelector('.layout-switcher');
        const gridBtn = document.getElementById('view-grid-btn');
        const listBtn = document.getElementById('view-list-btn');
        const sortButton = document.getElementById('price-sort-btn');
    
        const features = activeTemplate?.features || {};
        const terms = activeTemplate?.terms || {};

        if(pageTitle && terms.PRODUCT_CATALOG_TITLE) { 
            pageTitle.textContent = terms.PRODUCT_CATALOG_TITLE;
        }

        if (filterControls) {
            const showFilters = features.PRODUCT_SHOW_FILTERS !== false;
            const showSearch = features.PRODUCT_SHOW_SEARCH !== false;

            if (showFilters || showSearch) {
                filterControls.style.display = 'block';
                if (searchInput) {
                    searchInput.style.display = showSearch ? 'block' : 'none';
                    if (terms.PRODUCT_NAME) { 
                         searchInput.placeholder = `搜尋${terms.PRODUCT_NAME}關鍵字...`;
                    }
                }
                if (dynamicFilters) dynamicFilters.style.display = showFilters ? 'block' : 'none';
                if (clearBtn) clearBtn.style.display = showFilters ? 'block' : 'none';
            } else {
                filterControls.style.display = 'none';
            }
        }

        if (viewControls) {
            viewControls.style.display = 'flex'; 
            if (layoutSwitcher) {
                layoutSwitcher.style.display = features.ENABLE_PRODUCT_LAYOUT_SWITCH ? 'block' : 'none';
            }
            if (sortButton) {
                sortButton.style.display = features.PRODUCT_SHOW_SORTING !== false ? 'flex' : 'none';
            }
        }
    
        if (!viewControls || !layoutSwitcher || !gridBtn || !listBtn || !sortButton || !searchInput || !clearBtn) {
            console.error("產品型錄頁缺少必要的 UI 元件，功能可能不完整。");
        }

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
            
            if (CONFIG?.LOGIC?.PRODUCT_FILTERS) {
                 populateFilters(); 
            }
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
            container.innerHTML = `<p style="color: var(--color-danger);">讀取${terms.PRODUCT_NAME || '項目'}資料失敗。</p>`;
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
// 數位集點地圖相關函式
// =================================================================


//獲取所有活動、站點及用戶進度

async function fetchRallyData() {
    // [修改] 呼叫 API 時帶上 userId，以便後端判斷是否已領獎
    const campaignRes = await fetch(`/api/rally/campaigns?userId=${userProfile.userId}`);
    if (!campaignRes.ok) throw new Error('無法獲取活動列表');
    const campaigns = await campaignRes.json();
    
    if (!campaigns || campaigns.length === 0) {
         rallyData.campaigns = [];
         return;
    }

    // 2. 為「每一個」活動，平行抓取它的「站點」和「進度」
    const fullCampaignsData = await Promise.all(campaigns.map(async (campaign) => {
        try {
            // 抓站點
            const stationsRes = await fetch(`/api/rally/stations?campaignId=${campaign.campaign_id}`);
            const stations = stationsRes.ok ? await stationsRes.json() : [];
            
            // 抓進度 (公開路徑)
            const progressRes = await fetch(`/api/rally/progress?userId=${userProfile.userId}&campaignId=${campaign.campaign_id}`);
            const userProgress = progressRes.ok ? await progressRes.json() : [];
            
            return {
                ...campaign,
                stations: stations,
                userProgress: userProgress
            };
        } catch (e) {
            console.error(`載入活動 ${campaign.campaign_id} 失敗`, e);
            return null;
        }
    }));

    // 過濾掉載入失敗的，存入全域變數
    rallyData.campaigns = fullCampaignsData.filter(c => c !== null);
}

/**
 * 2. 渲染集點頁面 (卡片列表)
 */
function renderRallyPage() {
    const loadingEl = document.getElementById('rally-campaign-loading');
    const listContainer = document.getElementById('rally-list-container');
    const qrScannerContainer = document.getElementById('rally-qr-scanner-container');
    const rallyAnimationModal = document.getElementById('rally-animation-modal');
    
    if (loadingEl) loadingEl.style.display = 'none';
    if (qrScannerContainer) qrScannerContainer.style.display = 'none'; 
    if (rallyAnimationModal) rallyAnimationModal.style.display = 'none';
    
    if (!rallyData.campaigns || rallyData.campaigns.length === 0) {
        if (listContainer) {
            listContainer.style.display = 'block';
            listContainer.innerHTML = '<p style="text-align:center; color:var(--color-text-secondary);">目前沒有進行中的集點活動。</p>';
        }
        return;
    }

    if (listContainer) {
        listContainer.style.display = 'block';

        // --- 【新增】排序邏輯 ---
        // 規則：進行中 (Active) 排前面，已完成/已結束/已過期 排後面
        rallyData.campaigns.sort((a, b) => {
            // 輔助函式：判斷單一活動是否屬於「黯淡組 (Dimmed)」
            const isDimmed = (campaign) => {
                // 計算進度
                const progressList = Array.isArray(campaign.userProgress) ? campaign.userProgress : [];
                const activeStamps = progressList.filter(p => p.is_archived !== 1);
                const stampedIds = new Set(activeStamps.map(p => p.station_id));
                const isCompleted = stampedIds.size >= campaign.required_stamps;
                const hasUserRedeemed = campaign.user_has_redeemed === 1;
                
                // 檢查過期
                const now = new Date();
                const isExpired = campaign.end_date && new Date(campaign.end_date + 'T23:59:59') < now;
                
                // 已領獎(且不能重複) 或 已過期 -> 視為黯淡
                // 注意：如果已集滿但還沒領獎，還是要顯示在上面提醒領獎
                if (isExpired) return true;
                if (isCompleted && hasUserRedeemed && campaign.can_repeat !== 1) return true;
                
                return false;
            };

            const aDimmed = isDimmed(a);
            const bDimmed = isDimmed(b);

            // 如果 A 是黯淡，B 不是，B 排前面 (return 1)
            if (aDimmed && !bDimmed) return 1;
            // 如果 A 不是，B 是，A 排前面 (return -1)
            if (!aDimmed && bDimmed) return -1;
            // 狀態相同，則依照 ID 排序 (新活動在前)
            return b.campaign_id - a.campaign_id;
        });
        // --- 排序結束 ---


        listContainer.innerHTML = rallyData.campaigns.map((campaign, index) => {
            // 1. 計算進度
            const progressList = Array.isArray(campaign.userProgress) ? campaign.userProgress : [];
            const activeStamps = progressList.filter(p => p.is_archived !== 1);
            const stampedIds = new Set(activeStamps.map(p => p.station_id));
            
            const currentStamps = stampedIds.size;
            const totalStamps = campaign.required_stamps;
            const progressPercent = Math.min(100, Math.round((currentStamps / totalStamps) * 100));
            const isCompleted = currentStamps >= totalStamps;
            
            const isGlobalExhausted = (campaign.voucher_total_supply !== null) && 
                                      (campaign.voucher_issued_count >= campaign.voucher_total_supply);
            const hasUserRedeemed = campaign.user_has_redeemed === 1;

            // 檢查是否過期
            const now = new Date();
            const isExpired = campaign.end_date && new Date(campaign.end_date + 'T23:59:59') < now;

            // 2. 狀態與樣式邏輯
            let badgeClass = 'badge-active';
            let badgeText = '進行中';
            let expiryText = campaign.end_date ? `截止: ${campaign.end_date}` : '永久有效';
            let btnHtml = '';
            let instructionHtml = '';
            let isDimmed = false; // 黯淡標記

            if (isExpired) {
                // [狀態 X] 已過期
                badgeClass = 'badge-expired';
                badgeText = '已結束';
                isDimmed = true;
                btnHtml = `<button class="cta-button" disabled style="background-color: #999;">活動已結束</button>`;
            } else if (isCompleted) {
                if (hasUserRedeemed) {
                    // [狀態 A] 已集滿 且 已領獎
                    badgeClass = 'badge-completed';
                    badgeText = '已完成';
                    
                    if (campaign.can_repeat === 1) {
                        // 可重複 -> 正常顯示
                        const resetLink = `https://liff.line.me/${myLiffId}/#page-rally?action=reset&campaign_id=${campaign.campaign_id}`;
                        btnHtml = `<button class="cta-button btn-start-scan" data-reset-link="${resetLink}" data-campaign-id="${campaign.campaign_id}" style="background-color: var(--color-info);">🔄 掃描重置碼 (開啟新卡)</button>`;
                        instructionHtml = `<div style="margin-top: 10px; font-size: 0.9rem; color: var(--color-text-primary);">
                            <strong>🎉 恭喜完成！</strong><br>您已獲得獎勵。請掃描「重置 QR Code」將卡片歸檔並開始新的一輪。
                        </div>`;
                    } else {
                        // 不可重複 -> 黯淡顯示
                        isDimmed = true;
                        btnHtml = `<button class="cta-button" disabled style="background-color: var(--color-success); opacity: 0.8;">🎉 獎勵已發放</button>`;
                        instructionHtml = `<div style="margin-top: 10px; font-size: 0.9rem; color: var(--color-success);">您已完成此活動並獲得獎勵。</div>`;
                    }

                } else {
                    // [狀態 B] 已集滿 但 未領獎 (這是最重要的狀態，保持亮起)
                    if (isGlobalExhausted) {
                        badgeClass = 'badge-exhausted';
                        badgeText = '獎勵已發完';
                        btnHtml = `<button class="cta-button" disabled style="background-color: #999; cursor: not-allowed;">來晚了一步</button>`;
                        instructionHtml = `<div style="margin-top: 10px; font-size: 0.9rem; color: var(--color-danger);">⚠️ 限量獎勵已全數兌換完畢。</div>`;
                    } else {
                        btnHtml = `<button class="cta-button btn-start-scan" data-campaign-id="${campaign.campaign_id}" style="background-color: var(--color-warning);">⚠️ 點此補領獎勵</button>`;
                        instructionHtml = `<div style="margin-top: 10px; font-size: 0.9rem; color: var(--color-warning);">系統偵測您已集滿但尚未收到獎勵，請點擊按鈕嘗試補領。</div>`;
                    }
                }
            } else {
                // 未集滿
                if (isGlobalExhausted) {
                    badgeClass = 'badge-exhausted';
                    badgeText = '已額滿';
                    isDimmed = true; // 已額滿也讓它黯淡
                    btnHtml = `<button class="cta-button" disabled style="background-color: #999; cursor: not-allowed;">獎勵已兌換完畢</button>`;
                } else {
                    badgeClass = 'badge-active';
                    badgeText = '進行中';
                    btnHtml = `<button class="cta-button btn-start-scan" data-campaign-id="${campaign.campaign_id}" style="background-color: var(--color-accent);">📸 掃描集點</button>`;
                }
            }

            // 3. 渲染站點
            const stationsHtml = (campaign.stations || []).map(s => {
                const isCollected = stampedIds.has(s.station_id);
                const stationData = JSON.stringify(s).replace(/"/g, '&quot;');
                
                return `
                    <div class="mini-station-card ${isCollected ? 'collected' : ''}" onclick="openStationMissionModal(${stationData}, ${isCollected})">
                        <div style="font-weight:bold;">${s.name}</div>
                    </div>
                `;
            }).join('');

            // 4. 【修正】展開邏輯：只有第一個「非黯淡」的活動才預設展開
            // 由於我們已經排過序，現在陣列前面的就是 active 的，所以可以直接用 index === 0，
            // 但要額外判斷該活動是否為 dimmed (避免全部都是 dimmed 時第一個也被展開，視需求而定)
            const isExpanded = (index === 0 && !isDimmed) ? 'expanded' : '';
            
            // 5. 【新增】加入 dimmed class
            const dimmedClass = isDimmed ? 'dimmed' : '';

            return `
                <div class="rally-card ${isExpanded} ${dimmedClass}" id="rally-card-${campaign.campaign_id}">
                    <div class="rally-card-header" onclick="toggleRallyCard(${campaign.campaign_id})">
                        <div class="rally-info">
                            <div style="display:flex; align-items:center;">
                                <div class="rally-title">${campaign.title}</div>
                                <div class="rally-badge ${badgeClass}">${badgeText}</div>
                            </div>
                            <div class="rally-meta">
                                <span>${expiryText}</span>
                                <span>${currentStamps} / ${totalStamps} 點</span>
                            </div>
                            <div class="rally-progress-track">
                                <div class="rally-progress-fill" style="width: ${progressPercent}%"></div>
                            </div>
                        </div>
                        <div class="rally-arrow">▼</div>
                    </div>

                    <div class="rally-card-body">
                        <div class="rally-body-content">
                            <div class="rally-desc">${campaign.description || '無活動說明'}</div>
                            
                            <h4 style="margin: 10px 0; color: var(--color-text-secondary);">集點關卡</h4>
                            <div class="rally-stations-grid">
                                ${stationsHtml}
                            </div>
                            
                            ${instructionHtml}

                            <div style="margin-top: 20px;">
                                ${btnHtml}
                            </div>
                        </div>
                    </div>
                </div>
            `;
        }).join('');

        // 6. 重新綁定按鈕事件
        listContainer.querySelectorAll('.btn-start-scan').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const resetLink = btn.dataset.resetLink;
                const campaignId = btn.dataset.campaignId;
                startRallyScanner(resetLink, Number(campaignId)); 
            });
        });
    }
}

// [新增] 開啟站點任務詳情 Modal
window.openStationMissionModal = function(station, isCollected) {
    const modal = document.getElementById('station-mission-modal');
    if (!modal) return;

    // 填入資料
    document.getElementById('mission-modal-title').textContent = station.name || '站點詳情';
    
    // 任務條件 (這是最重要的)
    const validationInfo = station.partner_validation_info || '親臨現場掃描 QR Code 即可集點。';
    document.getElementById('mission-validation-info').textContent = validationInfo;

    // 合作夥伴 (建議商家在此欄位填寫店名+地址)
    document.getElementById('mission-partner-name').textContent = station.partner_name || '未提供位置資訊';

    // 簡介
    document.getElementById('mission-description').textContent = station.description || '無';

    // 效期
    document.getElementById('mission-expiry').textContent = station.expiry_date || '永久有效';

    // 狀態樣式
    const badge = document.getElementById('mission-status-badge');
    if (isCollected) {
        badge.textContent = '✅ 任務已達成';
        badge.style.backgroundColor = 'var(--color-success)';
    } else {
        badge.textContent = '🔒 任務未完成';
        badge.style.backgroundColor = '#6c757d';
    }

    modal.style.display = 'flex';
};

/**
 * 3. 切換卡片展開/收合
 */
window.toggleRallyCard = function(campaignId) {
    const card = document.getElementById(`rally-card-${campaignId}`);
    if (card) {
        card.classList.toggle('expanded');
    }
};


/**
 * 4. 頁面初始化
 */
async function initializeRallyPage() {
    const loadingEl = document.getElementById('rally-campaign-loading');
    const qrScannerContainer = document.getElementById('rally-qr-scanner-container');
    const rallyAnimationModal = document.getElementById('rally-animation-modal');
    const listContainer = document.getElementById('rally-list-container');
    
    // 確保掃描器實例被清除
    if (rallyQrCodeScanner && rallyQrCodeScanner.isScanning) {
        rallyQrCodeScanner.stop().catch(err => console.error("停止掃描器失敗", err));
        rallyQrCodeScanner.clear();
        rallyQrCodeScanner = null;
    }

    if (loadingEl) loadingEl.style.display = 'block';
    if (listContainer) listContainer.style.display = 'none';
    if (qrScannerContainer) qrScannerContainer.style.display = 'none';
    if (rallyAnimationModal) rallyAnimationModal.style.display = 'none';

    try {
        await fetchRallyData();
        renderRallyPage();
        
        // 綁定全域彈窗的關閉按鈕 (只綁定一次)
        const closeBtn = document.getElementById('rally-modal-close-btn');
        const stopScanBtn = document.getElementById('stop-rally-scan-btn');

        if (closeBtn && !closeBtn.dataset.listenerAttached) {
            closeBtn.addEventListener('click', async () => {
                 rallyAnimationModal.style.display = 'none';
                 await initializeRallyPage(); // 關閉後重新載入
            });
            closeBtn.dataset.listenerAttached = 'true';
        }

        if (stopScanBtn && !stopScanBtn.dataset.listenerAttached) {
            stopScanBtn.addEventListener('click', stopRallyScanner);
            stopScanBtn.dataset.listenerAttached = 'true';
        }

    } catch (error) {
        console.error("初始化集點地圖失敗:", error);
        if (loadingEl) loadingEl.innerHTML = `<p style="color:var(--color-danger);">載入集點活動失敗: ${error.message}</p>`;
    }
}

/**
 * 5. 停止掃描
 */
async function stopRallyScanner() {
    const qrScannerContainer = document.getElementById('rally-qr-scanner-container');
    const listContainer = document.getElementById('rally-list-container');
    
    if (rallyQrCodeScanner && rallyQrCodeScanner.isScanning) {
        // 1. AWAIT 停止，並捕獲錯誤以防止程式中斷
        await rallyQrCodeScanner.stop().catch(err => console.error("Scanner stop failed during await (ignored):", err));
        
        // 2. 停止成功後，再安全地清理實例
        rallyQrCodeScanner.clear(); // Safe to clear now
        rallyQrCodeScanner = null;   // 重置實例
    } else if (rallyQrCodeScanner) {
        // 如果沒有在掃描，但也存在實例，嘗試清理 (確保實例是 null)
        rallyQrCodeScanner.clear();
        rallyQrCodeScanner = null;
    }
    
    // 3. 確保 UI 狀態正確
    if (qrScannerContainer) qrScannerContainer.style.display = 'none';
    if (listContainer) listContainer.style.display = 'block';
    
    const statusMsg = document.getElementById('rally-status-message');
    if (statusMsg) statusMsg.textContent = '';
}
function showRallyResultModal(state, title, message, rewardIssued = false) {
    const modal = document.getElementById('rally-animation-modal');
    const iconEl = document.getElementById('rally-modal-icon');
    const titleEl = document.getElementById('rally-animation-title');
    const messageEl = document.getElementById('rally-animation-message');
    const actionBtn = document.getElementById('rally-modal-action-btn');
    const closeBtn = document.getElementById('rally-modal-close-btn');

    const statusMsg = document.getElementById('rally-status-message');
    if (statusMsg) statusMsg.textContent = '';

    // 設定內容
    titleEl.textContent = title;
    messageEl.textContent = message;
    
    // 根據狀態設定樣式
    if (state === 'loading') {
        iconEl.innerHTML = '⏳'; 
        iconEl.style.animation = 'spin 1s infinite linear'; 
        titleEl.style.color = 'var(--color-primary)';
        actionBtn.style.display = 'none';
        closeBtn.style.display = 'none';
    } else if (state === 'success') {
        iconEl.innerHTML = '✅';
        iconEl.style.animation = '';
        titleEl.style.color = 'var(--color-success)';
        
        if (rewardIssued) {
            actionBtn.style.display = 'block';
            actionBtn.textContent = '查看我的獎勵';
            actionBtn.style.backgroundColor = 'var(--color-primary)';
            actionBtn.onclick = () => {
                modal.style.display = 'none';
                showPage('page-my-vouchers');
            };
        } else {
            actionBtn.style.display = 'none';
        }
        closeBtn.style.display = 'block';
        closeBtn.textContent = '關閉';
    } else { // error
        iconEl.innerHTML = '❌';
        iconEl.style.animation = '';
        titleEl.style.color = 'var(--color-danger)';
        actionBtn.style.display = 'none';
        closeBtn.style.display = 'block';
        closeBtn.textContent = '關閉';
    }
    
    modal.style.display = 'flex';
}

/**
 * 7. 啟動掃描器與處理 API 請求
 */
async function startRallyScanner(resetLink, campaignId) {
    const qrScannerContainer = document.getElementById('rally-qr-scanner-container');
    const rallyStatusMessage = document.getElementById('rally-status-message');
    const rallyQrReader = document.getElementById('rally-qr-reader');
    const listContainer = document.getElementById('rally-list-container');
    
    const hasActiveCampaign = rallyData.campaigns && rallyData.campaigns.length > 0;
    if (!hasActiveCampaign) { return; } 

    // 每次開始掃描前，清空舊實例 (解決權限拒絕後無法再啟動的問題)
    if (rallyQrCodeScanner) { rallyQrCodeScanner.clear(); rallyQrCodeScanner = null; }
    
    // UI 狀態切換
    if (listContainer) listContainer.style.display = 'none';
    if (qrScannerContainer) qrScannerContainer.style.display = 'block';
    if (rallyStatusMessage) { rallyStatusMessage.textContent = '請對準 QR Code (集點或重置)...'; rallyStatusMessage.style.color = 'var(--color-text-primary)'; }
    if (rallyQrReader) rallyQrReader.innerHTML = '';


    if (typeof Html5Qrcode === 'undefined') {
        if (rallyStatusMessage) rallyStatusMessage.textContent = '掃碼庫載入失敗。';
        if (qrScannerContainer) qrScannerContainer.style.display = 'none';
        return;
    }
    
    rallyQrCodeScanner = new Html5Qrcode("rally-qr-reader");

    const onScanSuccess = async (decodedText, decodedResult) => {
        // 1. 【核心修正】停止掃描並等待 Promise 完成
        await stopRallyScanner(); // <--- 確保在繼續之前相機已停止
        showRallyResultModal('loading', '處理中...', '正在讀取 QR Code...');
        
        let partnerCode = null;
        let resetAction = null;
        
        // 2. 解析 QR Code 參數
        try {
             const url = new URL(decodedText);
             let searchParams = url.searchParams;
             
             if (url.hash.includes('?')) {
                 const hashParts = url.hash.split('?');
                 if (hashParts.length > 1) { searchParams = new URLSearchParams(hashParts[1]); }
             }
             
             partnerCode = searchParams.get('partner_code') || searchParams.get('rally_station_code');
             resetAction = searchParams.get('action');
             campaignId = searchParams.get('campaign_id');
        } catch(e) {
             partnerCode = decodedText;
        }

        try {
            let redeemRes;
            let result;
            let finalStatus = null;
            
            // --- 執行 API ---
            
            if (resetAction === 'reset' && campaignId) {
                // === A. 執行重置 ===
                showRallyResultModal('loading', '重置集點卡...', '正在開啟新的一輪...');
                
                redeemRes = await fetch('/api/rally/reset-card', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ userId: userProfile.userId, campaignId: Number(campaignId) })
                });
            } else if (partnerCode) {
                // === B. 執行集點 ===
                showRallyResultModal('loading', '集點驗證中...', '正在驗證站點...');

                redeemRes = await fetch('/api/rally/redeem-station', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ userId: userProfile.userId, partnerCode: partnerCode })
                });

            } else {
                // === C. 無效格式 ===
                throw new Error("無法辨識的 QR Code 格式。");
            }
            
            // 3. 處理 API 回應
            try {
                result = await redeemRes.json();
                finalStatus = result.status; 
            } catch (e) {
                if (!redeemRes.ok) {
                    const text = await redeemRes.text().catch(() => '伺服器回應無法讀取。');
                    throw new Error(`伺服器回應錯誤 (${redeemRes.status})：${text.substring(0, 200)}`);
                }
                throw new Error(`伺服器回應格式錯誤 (非 JSON)。`);
            }

            // 4. 判斷最終結果
            if (finalStatus === 'already_stamped' || finalStatus === 'card_full' || finalStatus === 'archived_conflict') {
                 showRallyResultModal('error', '操作失敗', result.message);
            } else if (redeemRes.ok && result.success) {
                // 真正的成功
                const rewardIssued = result.status === 'reward_issued';
                const title = (resetAction === 'reset') ? '重置成功！' : (rewardIssued ? '🎉 獲得獎勵！' : '集點成功！');
                showRallyResultModal('success', title, result.message, rewardIssued);
            } else {
                 // 失敗 (包含 500 錯誤或 success=false 的情況)
                 throw new Error(result.details || result.error || '未知驗證錯誤。');
            }

        } catch (error) {
             console.error("掃碼處理失敗:", error);
             showRallyResultModal('error', '驗證失敗', error.message.replace('系統錯誤: ', '').replace('Fetch failed: ', '') || '無法連接伺服器。');
        }
    };

    // 啟動相機
    rallyQrCodeScanner.start(
        { facingMode: "environment" }, 
        { fps: 10, qrbox: 250 }, 
        onScanSuccess,
        (errorMessage) => { /* 忽略過程錯誤 */ }
    ).catch(err => {
        console.error("啟動相機失敗:", err);
        if (rallyStatusMessage) {
            rallyStatusMessage.textContent = `❌ 無法啟動相機。請檢查瀏覽器設定，確保該網址已獲得相機權限。`;
            rallyStatusMessage.style.color = 'var(--color-danger)';
        }
        if (qrScannerContainer) qrScannerContainer.style.display = 'none';
        if (listContainer) listContainer.style.display = 'block';
        // 失敗後重置實例，允許下次點擊重新嘗試啟動
        rallyQrCodeScanner = null; 
    });
}

    // =================================================================
    // 預約頁面相關函式
    // =================================================================

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

    const priceInputHidden = document.createElement('input');
    priceInputHidden.type = 'hidden';
    priceInputHidden.className = 'booking-item-actual-price';
    priceInputHidden.value = ''; 

const removeBtn = document.createElement('button');
    removeBtn.type = 'button';
    removeBtn.className = 'remove-booking-item-btn';
    removeBtn.textContent = '-';
    removeBtn.style.cssText = 'background: var(--color-danger); padding: 5px 10px; border: none; color: white; border-radius: 4px; cursor: pointer; height: fit-content;'; // 確保樣式正確

    removeBtn.addEventListener('click', () => {
        itemRow.remove(); 
        const currentContainer = document.getElementById('booking-items-container'); 
        if (currentContainer && currentContainer.children.length < 5) {
            const addBtn = document.getElementById('add-booking-item-btn');
            if (addBtn) addBtn.style.display = 'block';
        }
    });

    select.addEventListener('change', () => {
        const selectedProductName = select.value;
        const selectedProduct = allProducts.find(p => p.name === selectedProductName);
        const bookingDate = bookingData.date; 
        const actualPrice = selectedProduct ? getPriceForDate(bookingDate, selectedProduct) : null;
        priceInputHidden.value = actualPrice !== null ? actualPrice : '';
         updatePriceDisplay(itemRow, actualPrice);
    });

    itemRow.appendChild(select);
    itemRow.appendChild(quantityInput);
    itemRow.appendChild(priceInputHidden); 
    itemRow.appendChild(removeBtn);
    container.appendChild(itemRow);

     function updatePriceDisplay(rowElement, price) {
         let priceDisplay = rowElement.querySelector('.price-display-hint');
         if (!priceDisplay) {
             priceDisplay = document.createElement('span');
             priceDisplay.className = 'price-display-hint';
             priceDisplay.style.fontSize = '0.8em';
             priceDisplay.style.color = 'var(--color-text-secondary)';
              rowElement.insertBefore(priceDisplay, priceInputHidden);
         }
         priceDisplay.textContent = price !== null ? ` ($${price})` : '';
     }


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
    const features = activeTemplate?.features || {};
    const showStoredValue = features.CLIENT_SHOW_STORED_VALUE !== false;
    const storedValuePaymentGroup = document.getElementById('stored-value-payment-group');
    
    if (storedValuePaymentGroup) {
        storedValuePaymentGroup.style.display = showStoredValue ? 'block' : 'none';
    }
    console.log("初始化預約頁面");

    try {
        const terms = CONFIG?.TERMS || {};
        const pageTitle = appContent.querySelector('#page-booking .page-main-title');
        if (pageTitle) pageTitle.textContent = terms.BOOKING_PAGE_TITLE || '線上預約';
        
        const viewMyBookingsBtn = document.getElementById('view-my-bookings-btn');
        if (viewMyBookingsBtn) viewMyBookingsBtn.textContent = terms.PROFILE_BOOKINGS_BTN_LABEL || '查看我的預約';
    } catch(e) { console.error(e); }

    // 確保產品資料已載入
    try {
        if (allProducts.length === 0) {
            const res = await fetch('/api/get-products');
            if (!res.ok) throw new Error('無法獲取服務項目列表');
            allProducts = await res.json();
        }
    } catch (error) {
        console.error("獲取產品失敗:", error);
    }

    // 綁定「查看我的預約」按鈕
    const viewMyBookingsBtn = document.getElementById('view-my-bookings-btn');
    if (viewMyBookingsBtn) {
        const newBtn = viewMyBookingsBtn.cloneNode(true);
        viewMyBookingsBtn.parentNode.replaceChild(newBtn, viewMyBookingsBtn);
        newBtn.addEventListener('click', () => {
            showPage('page-my-records');
        });
    }

    const confirmBtn = document.getElementById('confirm-booking-btn');
    if (confirmBtn && !confirmBtn.dataset.listenerAttached) {
        confirmBtn.addEventListener('click', handleBookingConfirmation); 
        confirmBtn.dataset.listenerAttached = 'true'; 
    }

    // --- [新增功能] 綁定儲值金確認視窗 ---
    const useStoredValueCheckbox = document.getElementById('use-stored-value-checkbox');
    if (useStoredValueCheckbox) {
        const newCheckbox = useStoredValueCheckbox.cloneNode(true);
        useStoredValueCheckbox.parentNode.replaceChild(newCheckbox, useStoredValueCheckbox);
        
        newCheckbox.checked = false; // 重置為未勾選

        newCheckbox.addEventListener('change', (e) => {
            if (e.target.checked) {
                const confirmed = confirm("是否確認是用儲值金作為本次預訂使用？\n\n注意：預訂後若需取消，儲值金將不會自動退還，需聯繫店家人工處理。");
                if (!confirmed) {
                    e.target.checked = false;
                }
            }
        });
    }

    // --- [修復日曆] 呼叫對應的初始化函式 ---
    if (CONFIG.LOGIC.ACTIVE_INDUSTRY_TEMPLATE === 'guesthouse_template') {
        await initializeGuesthouseBooking(); 
    } else {
        await initializeStudioBooking(); 
    }

    // --- [新增功能] 抓取並顯示會員餘額 ---
    try {
        const userData = await fetchproductData(true); // 強制刷新
        
        if (userData) {
            // 預填聯絡資訊
            const nameInput = document.getElementById('contact-name');
            const phoneInput = document.getElementById('contact-phone');
            if (nameInput) nameInput.value = userData.real_name || userProfile?.displayName || '';
            if (phoneInput) phoneInput.value = userData.phone || '';

            // 更新餘額顯示
            const balanceDisplay = document.getElementById('stored-value-balance-display');
            const checkbox = document.getElementById('use-stored-value-checkbox');
            
            if (balanceDisplay) {
                const balance = userData.stored_value_balance || 0;
                balanceDisplay.textContent = `(餘額: $${balance})`;
                
                // 如果餘額為 0，停用勾選框
                if (checkbox) {
                    if (balance <= 0) {
                        checkbox.disabled = true;
                        balanceDisplay.style.color = 'var(--color-danger)';
                        balanceDisplay.textContent += ' - 餘額不足';
                    } else {
                        checkbox.disabled = false;
                        balanceDisplay.style.color = 'var(--color-text-secondary)';
                    }
                }
            }
        }
    } catch(err){ console.warn("預填資訊或餘額載入失敗:", err); }
}
// --- [補回] 初始化民宿預約 (日曆修復關鍵) ---
async function initializeGuesthouseBooking() {
    console.log("初始化民宿訂房 UI");
    const dateRangePickerEl = document.getElementById('booking-date-range-picker');
    const roomSelectionContainer = document.getElementById('room-selection-container');
    const detailsForm = document.getElementById('booking-details-form');

    if (!dateRangePickerEl || !roomSelectionContainer || !detailsForm) return;

    guesthouseBookingData = { startDate: null, endDate: null, numberOfNights: 0, roomAvailability: {}, selectedRooms: {} };
    
    detailsForm.style.display = 'block'; 
    renderRoomList(null, null, null); 
    
    document.getElementById('estimated-total-price').textContent = '$0'; 

    if (flatpickrRangeInstance) {
        flatpickrRangeInstance.destroy();
        flatpickrRangeInstance = null;
    }

    flatpickrRangeInstance = flatpickr(dateRangePickerEl, {
        mode: "range",          
        minDate: "today",       
        dateFormat: "Y-m-d",   
        locale: "zh_tw",        
        onClose: async (selectedDates, dateStr, instance) => { 
            if (selectedDates.length === 2) {
                const start = selectedDates[0];
                const end = selectedDates[1];
                
                if (start.getTime() === end.getTime()) return;

                guesthouseBookingData.startDate = flatpickr.formatDate(start, "Y-m-d");
                guesthouseBookingData.endDate = flatpickr.formatDate(end, "Y-m-d");
                guesthouseBookingData.numberOfNights = Math.round((end - start) / (1000 * 60 * 60 * 24));

                if (guesthouseBookingData.numberOfNights <= 0) { 
                    alert("退房日期必須晚於入住日期");
                    instance.clear(); 
                    renderRoomList(null, null, null);
                    return;
                }

                roomSelectionContainer.style.opacity = '0.5';

                try {
                    const apiUrl = `/api/room-availability?startDate=${guesthouseBookingData.startDate}&endDate=${guesthouseBookingData.endDate}`;
                    const availability = await fetch(apiUrl).then(res => {
                        if (!res.ok) throw new Error(`查詢房況失敗`);
                        return res.json();
                    });
                    
                    roomSelectionContainer.style.opacity = '1';
                    renderRoomList(availability, guesthouseBookingData.startDate, guesthouseBookingData.endDate);
                    
                } catch (error) {
                    console.error("查詢房況失敗:", error);
                    roomSelectionContainer.style.opacity = '1';
                    alert("查詢房況失敗，請稍後再試");
                }
            } else {
                 guesthouseBookingData.startDate = null;
                 guesthouseBookingData.endDate = null;
                 guesthouseBookingData.numberOfNights = 0;
                 renderRoomList(null, null, null); 
                 calculateTotalPrice(); 
            }
        }
    });
}

// --- [補回] 初始化工作室預約 (日曆修復關鍵) ---
async function initializeStudioBooking() {
    console.log("初始化工作室預約 UI");
    const pageBookingDiv = document.getElementById('app-content').querySelector('#page-booking');
    const detailsForm = document.getElementById('booking-details-form'); 

    if (!pageBookingDiv || !detailsForm) {
         console.error("工作室初始化失敗：找不到 #page-booking 或 #booking-details-form 元素。");
         return;
    }

     let datepickerContainer = pageBookingDiv.querySelector('#booking-datepicker-container');
     if (!datepickerContainer) {
         datepickerContainer = document.createElement('div');
         datepickerContainer.id = 'booking-datepicker-container';
         const firstDetailsSection = pageBookingDiv.querySelector('.details-section'); 
         if(firstDetailsSection) {
             firstDetailsSection.innerHTML = '<h3>1. 選擇日期與時段</h3>'; 
             firstDetailsSection.appendChild(datepickerContainer); 
         }
     }

     let timeSlotContainer = pageBookingDiv.querySelector('#booking-time-slot-container');
     if (!timeSlotContainer) {
         timeSlotContainer = document.createElement('div');
         timeSlotContainer.id = 'booking-time-slot-container';
         timeSlotContainer.style.marginTop = '20px';
         timeSlotContainer.style.display = 'none'; 
         timeSlotContainer.innerHTML = `
             <label for="time-slot-select" style="display: block; margin-bottom: 10px;">請選擇時段：</label>
             <select id="time-slot-select"></select>
         `;
         datepickerContainer.parentNode.appendChild(timeSlotContainer);
     }

     let itemsContainer = detailsForm.querySelector('#booking-items-container');
     let addBookingItemBtn = detailsForm.querySelector('#add-booking-item-btn');
     if (!itemsContainer) {
         const itemsSection = document.createElement('div');
         itemsSection.className = 'form-group';
         itemsSection.innerHTML = `
             <label>預約項目</label>
             <div id="booking-items-container"></div>
             <button type="button" id="add-booking-item-btn" class="cta-button" style="margin-top: 10px; background-color: var(--color-secondary); font-size: 0.9rem; padding: 8px;">⊕ 新增項目</button>
         `;
         const contactNameInput = detailsForm.querySelector('#contact-name');
         const hrElement = detailsForm.querySelector('hr'); 
         if(contactNameInput && hrElement) {
             detailsForm.insertBefore(itemsSection, hrElement); 
             itemsContainer = document.getElementById('booking-items-container'); 
             addBookingItemBtn = document.getElementById('add-booking-item-btn'); 
         }
     }

    if (itemsContainer) itemsContainer.innerHTML = ''; 
    if(addBookingItemBtn && !addBookingItemBtn.dataset.listenerAttached) {
        addBookingItemBtn.addEventListener('click', () => addBookingItemRow()); 
        addBookingItemBtn.dataset.listenerAttached = 'true';
    }
    if(itemsContainer) addBookingItemRow();

    const cutoffDays = CONFIG.LOGIC.BOOKING_CUTOFF_DAYS || 0;
    const minDate = new Date();
    minDate.setDate(minDate.getDate() + cutoffDays);
    let enabledDates = []; 
    try {
        const response = await fetch('/api/bookings-check?month-init=true');
        if (!response.ok) throw new Error('無法獲取可預約日期');
        enabledDates = (await response.json()).enabledDates;
    } catch(e) {
        console.error('無法獲取可預約日期設定:', e);
    }

    flatpickr(datepickerContainer, { 
        inline: true,    
        minDate: minDate,    
        dateFormat: "Y-m-d", 
        locale: "zh_tw",        
        enable: enabledDates,     
        onChange: (selectedDates, dateStr) => { 
            const timeSlotSel = document.getElementById('time-slot-select'); 
            const detailsFrm = document.getElementById('booking-details-form');

            if (dateStr) { 
                bookingData.date = dateStr;
                if (timeSlotContainer) timeSlotContainer.style.display = 'block';
                if (detailsFrm) detailsFrm.style.display = 'none'; 
                if (timeSlotSel) renderTimeSlots(timeSlotSel); 
            } else { 
                bookingData.date = null;
                if (timeSlotContainer) timeSlotContainer.style.display = 'none'; 
                if (detailsFrm) detailsFrm.style.display = 'none'; 
            }
             document.querySelectorAll('.booking-item-row').forEach(row => { 
                 const select = row.querySelector('.booking-item-select');
                 const priceInputHidden = row.querySelector('.booking-item-actual-price');
                 const selectedProductName = select?.value;
                 if (selectedProductName && priceInputHidden) { 
                     const selectedProduct = allProducts.find(p => p.name === selectedProductName);
                     const actualPrice = selectedProduct ? getPriceForDate(dateStr, selectedProduct) : null;
                     priceInputHidden.value = actualPrice !== null ? actualPrice : '';
                     let priceDisplay = row.querySelector('.price-display-hint');
                     if (priceDisplay) {
                          priceDisplay.textContent = actualPrice !== null ? ` ($${actualPrice})` : '';
                     }
                 }
             });
        },
    });

    const timeSlotSelect = document.getElementById('time-slot-select'); 
    if (timeSlotSelect) { 
        timeSlotSelect.addEventListener('change', (e) => { 
            if (e.target.value) { 
                if (detailsForm) detailsForm.style.display = 'block'; 
            } else { 
                if (detailsForm) detailsForm.style.display = 'none'; 
            }
        });
    }
}

// --- [新增功能] 民宿訂房確認 (傳遞 useStoredValue) ---
async function handleGuesthouseBookingConfirmation(confirmBtn) {
    console.log("處理民宿訂房提交");

    if (!guesthouseBookingData.startDate || !guesthouseBookingData.endDate || guesthouseBookingData.numberOfNights <= 0) {
        alert('請先選擇有效的入住與退房日期！');
        return;
    }
    if (Object.keys(guesthouseBookingData.selectedRooms).length === 0) {
        alert('請至少選擇一個房型與數量！');
        return;
    }

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

    const itemsForApi = [];
    for (const productId in guesthouseBookingData.selectedRooms) {
        const quantity = guesthouseBookingData.selectedRooms[productId];
        if (quantity > 0) {
            itemsForApi.push({ productId: productId, quantity: quantity });
        }
    }

    if (itemsForApi.length === 0) {
        alert('請至少選擇一個房型與數量！');
        return;
    }

    // [關鍵] 讀取是否使用儲值金
    const useStoredValue = document.getElementById('use-stored-value-checkbox')?.checked || false;

    const bookingPayload = {
        userId: userProfile.userId,          
        startDate: guesthouseBookingData.startDate, 
        endDate: guesthouseBookingData.endDate,    
        contactName: contactName,           
        contactPhone: contactPhone,        
        items: itemsForApi,                  
        bookingType: 'guesthouse',
        useStoredValue: useStoredValue // 傳遞參數
    };

    try {
        confirmBtn.dataset.isSubmitting = 'true'; 
        confirmBtn.disabled = true;            
        confirmBtn.textContent = '處理中...';   

        console.log("送出民宿訂房 payload:", JSON.stringify(bookingPayload));

        const createRes = await fetch('/api/bookings-create', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(bookingPayload)
        });

        const result = await createRes.json(); 

        if (!createRes.ok) {
            // 如果是餘額不足等錯誤，會在這裡被 catch
            throw new Error(result.error || '建立訂房時發生未知錯誤');
        }

        fetch('/api/send-message', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId: userProfile.userId, message: result.confirmationMessage })
        }).catch(err => console.error("發送 LINE 通知失敗:", err));

        appContent.innerHTML = `
            <div class="details-section" style="text-align: center;">
                <h2 style="color: var(--color-accent);">✅ 訂房成功！</h2>
                <p>3 秒後將自動跳轉至您的預約列表...</p>
            </div>
        `;
        setTimeout(() => { showPage('page-my-bookings'); }, 3000);

    } catch (error) { 
        console.error("訂房失敗:", error);
        alert(`訂房失敗：${error.message}`);
        confirmBtn.dataset.isSubmitting = 'false'; 
        confirmBtn.disabled = false;           
        confirmBtn.textContent = '確認訂房';       
    }
}

// --- [新增功能] 工作室預約確認 (傳遞 useStoredValue) ---
async function handleStudioBookingConfirmation(confirmBtn) {
     console.log("處理工作室預約提交");
    const items = [];
    const itemRows = document.querySelectorAll('.booking-item-row'); 
    let calculatedTotalAmount = 0;
    let itemsValid = true;

    const bookingDate = bookingData.date; 
    if (!bookingDate) { 
        alert('請先選擇預約日期！');
        return;
    }

    itemRows.forEach(row => {
        if (!itemsValid) return;
        const nameSelect = row.querySelector('.booking-item-select');
        const qtyInput = row.querySelector('.booking-item-qty');
        const priceInputHidden = row.querySelector('.booking-item-actual-price'); 

        const name = nameSelect?.value; 
        const qty = parseInt(qtyInput?.value, 10); 
        const priceStr = priceInputHidden?.value; 
        const price = (priceStr !== undefined && priceStr !== '') ? parseFloat(priceStr) : null;

        if (name && !isNaN(qty) && qty > 0) { 
             if (price === null || isNaN(price) || price < 0) { 
                 alert(`項目 "${name}" 無法根據您選擇的日期找到有效價格，請確認日期或重新選擇項目。`);
                 itemsValid = false; 
             } else {
                 items.push({ name, qty, price }); 
                 calculatedTotalAmount += qty * price;
             }
        } else if (name) { 
             alert(`項目 "${name}" 的數量無效。`);
             itemsValid = false;
        }
    });

    if (!itemsValid || items.length === 0) {
        if (items.length === 0 && itemsValid) { 
            alert('請至少選擇一個有效的預約項目！');
        }
        return;
    }

    const timeSlot = document.getElementById('time-slot-select')?.value; 
    const numOfPeople = document.getElementById('booking-people')?.value; 
    const contactName = document.getElementById('contact-name')?.value;  
    const contactPhone = document.getElementById('contact-phone')?.value; 

    if (!timeSlot || !contactName || !contactPhone || !numOfPeople) {
         alert('時段、姓名、電話與人數為必填！');
         return;
    }
     const phoneRegex = /^09\d{8}$/;
     if (!phoneRegex.test(contactPhone)) {
         alert('請輸入正確的 10 位手機號碼 (必須為 09 開頭)。');
         return;
     }

    // [關鍵] 讀取是否使用儲值金
    const useStoredValue = document.getElementById('use-stored-value-checkbox')?.checked || false;

    const bookingPayload = {
        userId: userProfile.userId,
        bookingDate: bookingDate,      
        timeSlot: timeSlot,         
        numOfPeople: numOfPeople,    
        contactName: contactName,
        contactPhone: contactPhone,
        items: items,                
        totalAmount: calculatedTotalAmount, 
        bookingType: 'studio',
        useStoredValue: useStoredValue // 傳遞參數
    };

    try {
        confirmBtn.dataset.isSubmitting = 'true'; 
        confirmBtn.disabled = true;            
        confirmBtn.textContent = '處理中...';   

        const createRes = await fetch('/api/bookings-create', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(bookingPayload)
        });

        const result = await createRes.json(); 

        if (!createRes.ok) {
            throw new Error(result.error || '建立預約時發生未知錯誤');
        }

        fetch('/api/send-message', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId: userProfile.userId, message: result.confirmationMessage })
        }).catch(err => console.error("發送 LINE 通知失敗:", err));

        appContent.innerHTML = `
            <div class="details-section" style="text-align: center;">
                <h2 style="color: var(--color-accent);">✅ 預約成功！</h2>
                <p>3 秒後將自動跳轉至您的預約列表...</p>
            </div>
        `;
        setTimeout(() => { showPage('page-my-bookings'); }, 3000);

    } catch (error) { 
        console.error("預約失敗:", error);
        alert(`預約失敗：${error.message}`);
        confirmBtn.dataset.isSubmitting = 'false'; 
        confirmBtn.disabled = false;            
        confirmBtn.textContent = '確認預約';       
    }
}

function renderTimeSlots(selectElement) {
    if (!selectElement) return;

    selectElement.innerHTML = '<option value="">-- 請選擇 --</option>'; 

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
    if (confirmBtn.dataset.isSubmitting === 'true') return;

    if (CONFIG.LOGIC.ACTIVE_INDUSTRY_TEMPLATE === 'guesthouse_template') {
        await handleGuesthouseBookingConfirmation(confirmBtn); 
    } else {
        await handleStudioBookingConfirmation(confirmBtn);
    }
}



async function handleGuesthouseBookingConfirmation(confirmBtn) {
    console.log("處理民宿訂房提交");

    if (!guesthouseBookingData.startDate || !guesthouseBookingData.endDate || guesthouseBookingData.numberOfNights <= 0) {
        alert('請先選擇有效的入住與退房日期！');
        return;
    }
    if (Object.keys(guesthouseBookingData.selectedRooms).length === 0) {
        alert('請至少選擇一個房型與數量！');
        return;
    }

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

    const itemsForApi = [];
    for (const productId in guesthouseBookingData.selectedRooms) {
        const quantity = guesthouseBookingData.selectedRooms[productId];
        if (quantity > 0) {
            itemsForApi.push({ productId: productId, quantity: quantity });
        }
    }

    // 再次確認是否有選擇項目
    if (itemsForApi.length === 0) {
        alert('請至少選擇一個房型與數量！');
        return;
    }

    const bookingPayload = {
        userId: userProfile.userId,          
        startDate: guesthouseBookingData.startDate, 
        endDate: guesthouseBookingData.endDate,    
        contactName: contactName,           
        contactPhone: contactPhone,        
        items: itemsForApi,                  
        bookingType: 'guesthouse'            
    };

    try {
        confirmBtn.dataset.isSubmitting = 'true'; 
        confirmBtn.disabled = true;            
        confirmBtn.textContent = '處理中...';   

        console.log("送出民宿訂房 payload:", JSON.stringify(bookingPayload));

        const createRes = await fetch('/api/bookings-create', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(bookingPayload)
        });

        if (!createRes.ok) {
            const errorResult = await createRes.json().catch(() => ({ error: `伺服器錯誤 ${createRes.status}` }));
            throw new Error(errorResult.error || '建立訂房時發生未知錯誤');
        }

        const result = await createRes.json(); 

        fetch('/api/send-message', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId: userProfile.userId, message: result.confirmationMessage })
        }).catch(err => console.error("發送 LINE 通知失敗:", err));

        appContent.innerHTML = `
            <div class="details-section" style="text-align: center;">
                <h2 style="color: var(--color-accent);">✅ 訂房成功！</h2>
                <p>3 秒後將自動跳轉至您的預約列表...</p>
            </div>
        `;
        setTimeout(() => { showPage('page-my-bookings'); }, 3000);

    } catch (error) { 
        console.error("訂房失敗:", error);
        alert(`訂房失敗：${error.message}`);
        confirmBtn.dataset.isSubmitting = 'false'; 
        confirmBtn.disabled = false;           
        confirmBtn.textContent = '確認訂房';       
    }
}


async function handleStudioBookingConfirmation(confirmBtn) {
     console.log("處理工作室預約提交");
    const items = [];
    const itemRows = document.querySelectorAll('.booking-item-row'); 
    let calculatedTotalAmount = 0;
    let itemsValid = true;

    const bookingDate = bookingData.date; 
    if (!bookingDate) { 
        alert('請先選擇預約日期！');
        return;
    }

    itemRows.forEach(row => {
        if (!itemsValid) return;
        const nameSelect = row.querySelector('.booking-item-select');
        const qtyInput = row.querySelector('.booking-item-qty');
        const priceInputHidden = row.querySelector('.booking-item-actual-price'); 

        const name = nameSelect?.value; 
        const qty = parseInt(qtyInput?.value, 10); 
        const priceStr = priceInputHidden?.value; 
        const price = (priceStr !== undefined && priceStr !== '') ? parseFloat(priceStr) : null;

        if (name && !isNaN(qty) && qty > 0) { 
             if (price === null || isNaN(price) || price < 0) { 
                 console.error(`工作室項目 "${name}" 價格無效: '${priceStr}'`);
                 alert(`項目 "${name}" 無法根據您選擇的日期找到有效價格，請確認日期或重新選擇項目。`);
                 itemsValid = false; 
             } else {
                 items.push({ name, qty, price }); 
                 calculatedTotalAmount += qty * price;
             }
        } else if (name) { 
             alert(`項目 "${name}" 的數量無效。`);
             itemsValid = false;
        }
    });

    if (!itemsValid || items.length === 0) {
        if (items.length === 0 && itemsValid) { 
            alert('請至少選擇一個有效的預約項目！');
        }
        return;
    }

    const timeSlot = document.getElementById('time-slot-select')?.value; 
    const numOfPeople = document.getElementById('booking-people')?.value; 
    const contactName = document.getElementById('contact-name')?.value;  
    const contactPhone = document.getElementById('contact-phone')?.value; 

    if (!timeSlot || !contactName || !contactPhone || !numOfPeople) {
         alert('時段、姓名、電話與人數為必填！');
         return;
    }
     const phoneRegex = /^09\d{8}$/;
     if (!phoneRegex.test(contactPhone)) {
         alert('請輸入正確的 10 位手機號碼 (必須為 09 開頭)。');
         return;
     }

    const bookingPayload = {
        userId: userProfile.userId,
        bookingDate: bookingDate,      
        timeSlot: timeSlot,         
        numOfPeople: numOfPeople,    
        contactName: contactName,
        contactPhone: contactPhone,
        items: items,                
        totalAmount: calculatedTotalAmount, 
        bookingType: 'studio'         
    };

    try {
        confirmBtn.dataset.isSubmitting = 'true'; 
        confirmBtn.disabled = true;            
        confirmBtn.textContent = '處理中...';   

        console.log("送出工作室預約 payload:", JSON.stringify(bookingPayload));

        const createRes = await fetch('/api/bookings-create', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(bookingPayload)
        });

        if (!createRes.ok) {
            const errorResult = await createRes.json().catch(() => ({ error: `伺服器錯誤 ${createRes.status}` }));
            throw new Error(errorResult.error || '建立預約時發生未知錯誤');
        }

        const result = await createRes.json(); 

        fetch('/api/send-message', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId: userProfile.userId, message: result.confirmationMessage })
        }).catch(err => console.error("發送 LINE 通知失敗:", err));

        appContent.innerHTML = `
            <div class="details-section" style="text-align: center;">
                <h2 style="color: var(--color-accent);">✅ 預約成功！</h2>
                <p>3 秒後將自動跳轉至您的預約列表...</p>
            </div>
        `;
        setTimeout(() => { showPage('page-my-bookings'); }, 3000);

    } catch (error) { 
        console.error("預約失敗:", error);
        alert(`預約失敗：${error.message}`);
        confirmBtn.dataset.isSubmitting = 'false'; 
        confirmBtn.disabled = false;            
        confirmBtn.textContent = '確認預約';       
    }
}

    // =================================================================
    // Tab Bar 主導航
    // =================================================================

    main();
});