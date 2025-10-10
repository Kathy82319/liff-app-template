document.addEventListener('DOMContentLoaded', () => {
    
    // --- 核心變數 ---
    const myLiffId = "2008032417-3yJQGaO6";
    let userProfile = null;
    let productData = {};
    const appContent = document.getElementById('app-content');
    const pageTemplates = document.getElementById('page-templates');
    const tabBar = document.getElementById('tab-bar');
    let activeTemplate = null; // 當前啟用的樣板
    
    let CONFIG; 
    
    // --- 狀態變數 ---
    let allProducts = [];
    let allNews = [];
    let activeFilters = { 
    keyword: '', 
    filter_1: null, 
    filter_2: null, 
    filter_3: null 
    };
    let productView = {
    layout: 'grid', 
    sort: 'default' 
    };
    let bookingData = {};
    let bookingHistoryStack = [];
    let dailyAvailability = { limit: 4, booked: 0, available: 4 };
    let enabledDatesByAdmin = [];
    const PEOPLE_PER_TABLE = 4;
    const AVAILABLE_TIME_SLOTS = ['12:00', '12:30', '13:00', '13:30', '14:00', '14:30', '15:00', '15:30', '16:00', '16:30', '17:00', '17:30', '18:00', '18:30', '19:00', '19:30', '20:00', '20:30', '21:00', '21:30'];

    // --- 頁面初始化函式映射 ---
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
    };

    // =================================================================
    // 【新增】頁面渲染核心 (只負責顯示，不碰歷史紀錄)
    // =================================================================
    function renderPage(pageId, data = null) {
        const template = pageTemplates.querySelector(`#${pageId}`);
        if (template) {
            appContent.innerHTML = template.innerHTML;
            
            if (pageInitializers[pageId]) {
                pageInitializers[pageId](data);
            }

            // 判斷 pageId 是否為底部 Tab Bar 的主頁籤之一
            const isMainTab = ['page-home', 'page-products', 'page-checkout', 'page-profile', 'page-booking', 'page-info'].includes(pageId);
            document.querySelectorAll('.tab-button').forEach(btn => {
                // 如果是主頁籤，高亮對應按鈕；如果不是(如細節頁)，則不高亮任何按鈕
                btn.classList.toggle('active', isMainTab && btn.dataset.target === pageId);
            });
        } else {
            console.error(`在 page-templates 中找不到樣板: ${pageId}`);
            // 如果找不到頁面，保險起見，強制顯示首頁
            renderPage('page-home');
        }
    }

    // =================================================================
    // 非同步主函式 (程式啟動點)
    // =================================================================
    async function main() {
        try {
            const response = await fetch('/api/get-app-config');
            if (!response.ok) throw new Error(`伺服器錯誤 ${response.status}`);
            const configData = await response.json();
            if(!configData || !configData.FEATURES){
                 throw new Error('獲取到的設定檔格式不正確。');
            }
            
            window.CONFIG = configData;
            CONFIG = configData;

            // 【新增】在啟動時就決定要用哪個樣板
            const activeTemplateKey = CONFIG.LOGIC.ACTIVE_INDUSTRY_TEMPLATE;
            activeTemplate = CONFIG.LOGIC.INDUSTRY_TEMPLATE_DEFINITIONS[activeTemplateKey];
            if (!activeTemplate) {
                throw new Error(`在設定中找不到名為 "${activeTemplateKey}" 的商業樣板。`);
            }

            await initializeLiff();

        } catch (error) {
            console.error("初始化失敗:", error);
            appContent.innerHTML = `<div style="text-align: center; padding: 20px; color: var(--color-danger);">
                <h2>系統啟動失敗</h2><p>${error.message}</p><p>請確認後台 API (get-app-config) 運作正常後，再試一次。</p>
            </div>`;
        }
    }
    // =================================================================
    // 設定檔應用函式 (Template Engine)
    // =================================================================
    function applyConfiguration() {
      try {
            if (!CONFIG || !activeTemplate) {
                console.error("嚴重錯誤：CONFIG 或 activeTemplate 設定檔不存在！"); return;
            }
            const { FEATURES, TERMS } = CONFIG;
            
            const homeTab = document.querySelector('.tab-button[data-target="page-home"]');
            const productTab = document.querySelector('.tab-button[data-target="page-products"]');
            const checkoutTab = document.querySelector('.tab-button[data-target="page-checkout"]');
            const profileTab = document.querySelector('.tab-button[data-target="page-profile"]');
            const bookingTab = document.querySelector('.tab-button[data-target="page-booking"]');
            const infoTab = document.querySelector('.tab-button[data-target="page-info"]');

            if (productTab) productTab.style.display = FEATURES.ENABLE_SHOPPING_CART ? 'block' : 'none';
            if (checkoutTab) checkoutTab.style.display = FEATURES.ENABLE_PAYMENT_GATEWAY ? 'block' : 'none';
            if (profileTab) profileTab.style.display = (FEATURES.ENABLE_MEMBERSHIP_SYSTEM || FEATURES.ENABLE_BOOKING_SYSTEM || FEATURES.ENABLE_RENTAL_SYSTEM) ? 'block' : 'none';
            if (bookingTab) bookingTab.style.display = FEATURES.ENABLE_BOOKING_SYSTEM ? 'block' : 'none';

            document.title = TERMS.BUSINESS_NAME;
            const businessNameHeader = document.getElementById('business-name-header');
            if (productTab) {
                const title = activeTemplate.entityNamePlural || TERMS.PRODUCT_CATALOG_TITLE;
                productTab.innerHTML = `${title.substring(0,2)}<br>${title.substring(2)}`;
            }            
            
            if (businessNameHeader) businessNameHeader.textContent = TERMS.BUSINESS_NAME;

            if (homeTab) homeTab.innerHTML = `${TERMS.NEWS_PAGE_TITLE.substring(0,2)}<br>${TERMS.NEWS_PAGE_TITLE.substring(2)}`;
            if (productTab) productTab.innerHTML = `${TERMS.PRODUCT_CATALOG_TITLE.substring(0,2)}<br>${TERMS.PRODUCT_CATALOG_TITLE.substring(2)}`;
            if (checkoutTab) checkoutTab.innerHTML = `${TERMS.CHECKOUT_PAGE_TITLE.substring(0,2)}<br>${TERMS.CHECKOUT_PAGE_TITLE.substring(2)}`;
            if (profileTab) profileTab.innerHTML = `${TERMS.MEMBER_PROFILE_TITLE.substring(0,2)}<br>${TERMS.MEMBER_PROFILE_TITLE.substring(2)}`;
            if (bookingTab) bookingTab.innerHTML = `${TERMS.BOOKING_NAME}<br>服務`;

            if (pageTemplates) {
                const productPageTitle = pageTemplates.querySelector('#page-products .page-main-title');
                if (productPageTitle) {
                    productPageTitle.textContent = activeTemplate.entityNamePlural || TERMS.PRODUCT_CATALOG_TITLE;
                }
                const productSearch = pageTemplates.querySelector('#page-products #keyword-search');
                if (productSearch) {
                    const placeholderText = activeTemplate.entityName || TERMS.PRODUCT_NAME;
                    productSearch.setAttribute('placeholder', `搜尋${placeholderText}關鍵字...`);
                }                
                pageTemplates.querySelector('#page-products .page-main-title').textContent = TERMS.PRODUCT_CATALOG_TITLE; 
                pageTemplates.querySelector('#page-products .page-main-title').textContent = TERMS.PRODUCT_CATALOG_TITLE;
                pageTemplates.querySelector('#page-checkout .page-main-title').textContent = TERMS.CHECKOUT_PAGE_TITLE;
                pageTemplates.querySelector('#page-profile .page-main-title').textContent = TERMS.MEMBER_PROFILE_TITLE;
                pageTemplates.querySelector('#page-booking .page-main-title').textContent = TERMS.BOOKING_PAGE_TITLE;
                pageTemplates.querySelector('#page-products #keyword-search').setAttribute('placeholder', `搜尋${TERMS.PRODUCT_NAME}關鍵字...`);
            }
        } catch (e) {
            console.error("套用設定檔時發生錯誤:", e);
        }
    }

    // =================================================================
    // 頁面切換邏輯
    // =================================================================
    /**
     * 導航函式：當需要前往一個新頁面時呼叫此函式。
     * 它會建立一個新的瀏覽歷史紀錄點，並呼叫 renderPage 來顯示頁面。
     */
    function showPage(pageId, data = null) {
        // 使用 history.pushState 建立一個新的歷史紀錄點
        history.pushState({ page: pageId, data: data }, '', `#${pageId.replace('page-', '')}`);
        // 呼叫渲染核心來實際顯示頁面
        renderPage(pageId, data);
    }

    /**
     * 監聽返回事件 (popstate)：
     * 當使用者點擊手機的實體返回鍵，或程式呼叫 history.back() 時，此事件會被觸發。
     */
    window.addEventListener('popstate', (event) => {
        // event.state 就是我們之前用 pushState 存進去的物件
        if (event.state && event.state.page) {
            // 根據歷史紀錄中的資訊，重新渲染對應的頁面
            renderPage(event.state.page, event.state.data);
        } else {
            // 如果 state 為空 (例如，使用者一直按返回，退到了 LIFF 的最開頭)
            // 這種情況下我們顯示首頁，而不是關閉 App
            renderPage('page-home');
        }
    });

    // =================================================================
    // 【新增】監聽所有返回事件 (popstate)
    // =================================================================
    window.addEventListener('popstate', (event) => {
        // event.state 就是我們之前用 pushState 存進去的物件
        if (event.state && event.state.page) {
            // 收到返回指令，直接用渲染核心顯示對應的頁面即可
            renderPage(event.state.page, event.state.data);
        } else {
            // 如果 state 為空，通常意味著退到了最開始的狀態，顯示首頁
            renderPage('page-home');
        }
    });    

    // =================================================================
    // 全域事件監聽 (請確保這也是最新版本)
    // =================================================================
    function setupGlobalEventListeners() {
        appContent.addEventListener('click', (event) => {
            const target = event.target;

            // 返回按鈕：現在只呼叫 history.back()，剩下的交給 popstate 監聽器處理
            if (target.closest('.details-back-button')) {
                history.back();
                return;
            }

            // 產品卡片點擊
            const productCard = target.closest('.product-card');
            if (productCard && productCard.dataset.productId) {
                const productId = productCard.dataset.productId;
                const productItem = allProducts.find(p => p.product_id == productId);
                if (productItem) {
                    showPage('page-product-details', { product: productItem });
                }
                return;
            }
            
            // 情報卡片點擊
            const newsCard = target.closest('.news-card');
            if (newsCard && newsCard.dataset.newsId) {
                const newsId = parseInt(newsCard.dataset.newsId, 10);
                const newsItem = allNews.find(n => n.id === newsId);
                if (newsItem) {
                    showPage('page-news-details', { news: newsItem });
                }
                return;
            }

            // 其他按鈕點擊
            const targetId = target.id;
            if (targetId === 'my-bookings-btn') showPage('page-my-bookings');
            else if (targetId === 'my-exp-history-btn') showPage('page-my-exp-history');
            else if (targetId === 'edit-profile-btn') showPage('page-edit-profile');
            else if (targetId === 'toggle-past-bookings-btn') togglePastView('bookings', 'past-bookings-container', target);
            else if (target.id === 'experience-backend-btn') {if (!userProfile || !userProfile.userId) {alert('無法獲取您的 LINE 資料，請稍後再試。');
            return;
            }
    target.disabled = true;
    target.textContent = '正在產生連結...';

    fetch('/api/generate-admin-link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: userProfile.userId })
    })
    .then(response => {
        if (!response.ok) {
            return response.json().then(err => { throw new Error(err.error || '產生連結失敗') });
        }
        return response.json();
    })
    .then(data => {
        if (data.magicLink) {
            // 使用 LIFF 的 API 在外部瀏覽器開啟，體驗最好
            liff.openWindow({
                url: data.magicLink,
                external: true
            });
        }
    })
    .catch(error => {
        alert(error.message);
    })
    .finally(() => {
        target.disabled = false;
        target.textContent = '一鍵體驗後台 (Magic Link)';
    });
}


            // 取消預約按鈕
            if (target.matches('.cancel-booking-btn')) {
                const bookingId = target.dataset.bookingId;
                if (!bookingId) return;
                if (confirm('您確定要取消這筆預約嗎？此操作無法復原。')) {
                    handleCancelBooking(bookingId);
                }
            }
        });
    }

async function handleCancelBooking(bookingId) {
    const card = document.getElementById(`booking-card-${bookingId}`);
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
        // 重新載入預約列表
        initializeMyBookingsPage();

    } catch (error) {
        alert(error.message);
        button.disabled = false;
        button.textContent = '取消預約';
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

// public/script.js -> renderBookings function (修改後)

function renderBookings(bookings, container, isPast = false) {
    if (!container) return;
    if (bookings.length === 0) {
        container.innerHTML = `<p>${isPast ? '沒有過往的預約紀錄。' : '您目前沒有即將到來的預約。'}</p>`;
        return;
    }
    container.innerHTML = bookings.map(b => {
        const itemHTML = b.item ? `<p><strong>項目:</strong> ${b.item}</p>` : '';

        // 【新增】取消按鈕的邏輯
        const cancelButtonHTML = (!isPast && CONFIG.FEATURES.ENABLE_CUSTOMER_CANCELLATION)
            ? `<button class="cta-button cancel-booking-btn" data-booking-id="${b.booking_id}" style="background-color: var(--color-danger); margin-top: 10px; padding: 8px;">取消預約</button>`
            : '';

        return `
            <div class="booking-info-card" id="booking-card-${b.booking_id}">
                <p><strong>日期:</strong> ${b.booking_date}</p>
                <p><strong>時段:</strong> ${b.time_slot}</p>
                ${itemHTML} 
                <p><strong>人數:</strong> ${b.num_of_people} ${CONFIG.TERMS.PRODUCT_PLAYER_COUNT_UNIT}</p>
                <p><strong>狀態:</strong> ${b.status_text}</p>
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

            // 【最終修正】設定 App 啟動時的初始歷史狀態
            // replaceState 不會觸發 popstate，它只是替換當前的歷史紀錄點
            history.replaceState({ page: 'page-home', data: null }, '', '#home');

            applyConfiguration(); 
            setupGlobalEventListeners();

            // 第一次載入時，直接使用渲染核心，不建立新的歷史紀錄
            renderPage('page-home');

        } catch (err) {
            console.error("LIFF 初始化失敗", err);
            // 即使 LIFF 失敗，也要嘗試渲染頁面
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
        if (!container) return;
        container.innerHTML = '<p>查詢中...</p>';
        try {
            const response = await fetch(`api/my-bookings?userId=${userProfile.userId}&filter=current`);
            if (!response.ok) throw new Error('查詢預約失敗');
            const bookings = await response.json();
            renderBookings(bookings, container, false);
        } catch (error) {
            container.innerHTML = `<p style="color: var(--color-danger);">${error.message}</p>`;
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
        if (!product || !activeTemplate) return;

        const detailsTitle = appContent.querySelector('.details-title');
        const gallery = appContent.querySelector('.details-gallery');
        const mainImage = gallery.querySelector('.details-image-main');
        const thumbnails = gallery.querySelector('.details-image-thumbnails');
        const contentContainer = appContent.querySelector('#product-details-content');

        detailsTitle.textContent = product.name;
        contentContainer.innerHTML = ''; // 清空內容

        // 1. 處理圖片
        try {
            const images = JSON.parse(product.images || '[]');
            if (images.length > 0) {
                mainImage.src = images[0];
                thumbnails.innerHTML = images.map((img, index) => 
                    `<img src="${img}" class="${index === 0 ? 'active' : ''}" data-src="${img}">`
                ).join('');
                gallery.style.display = 'block';

                thumbnails.addEventListener('click', e => {
                    if (e.target.tagName === 'IMG') {
                        mainImage.src = e.target.dataset.src;
                        thumbnails.querySelector('.active')?.classList.remove('active');
                        e.target.classList.add('active');
                    }
                });
            } else {
                gallery.style.display = 'none';
            }
        } catch(e) { gallery.style.display = 'none'; }

        // 2. 根據藍圖動態生成內容
        activeTemplate.fields.forEach(field => {
            // 跳過 'name' (已顯示在標題) 和 'images' (已處理) 和 'is_visible' (不需顯示)
            if (field.key === 'name' || field.key === 'images' || field.key === 'is_visible') return;

            const value = product[field.key];
            if (value) { // 只顯示有值的欄位
                const section = document.createElement('div');
                section.className = 'detail-field-section';
                
                const label = document.createElement('h3');
                label.textContent = field.label;
                
                const content = document.createElement('p');
                if (field.key === 'price') {
                    content.innerHTML = `<span class="price-value">$${value}</span>`;
                } else {
                    content.textContent = value;
                }
                
                section.append(label, content);
                contentContainer.appendChild(section);
            }
        });
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

    // 2. 排序 (邏輯不變)
    switch (productView.sort) {
        case 'price_desc':
            filteredProducts.sort((a, b) => (b.price || 0) - (a.price || 0));
            break;
        case 'price_asc':
            filteredProducts.sort((a, b) => (a.price || 0) - (b.price || 0));
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

    // 4. 渲染 HTML (邏輯不變)
        container.innerHTML = filteredProducts.map(product => {
            let priceDisplay = product.price != null ? `$${product.price}` : '價格洽詢';
            const images = JSON.parse(product.images || '[]');
            // 如果有圖片就用第一張，沒有就用預設圖
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
    
        // 直接使用全域 CONFIG 變數
        const filterDefinitions = CONFIG?.LOGIC?.PRODUCT_FILTERS || [];
    
        if (filterDefinitions.length === 0) {
            return; // 如果沒有定義篩選器，就直接結束，不做任何事
        }
    
        filterDefinitions.forEach(filterDef => {
            const select = document.createElement('select');
            select.id = `liff-${filterDef.id}`;
            select.dataset.filterKey = filterDef.id;
    
            select.add(new Option(filterDef.name, ''));
    
            filterDef.options.forEach(option => {
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
            // 最多 5 組
            if (container.children.length >= 5) {
                document.getElementById('add-booking-item-btn').style.display = 'none';
            }
            return;
        }

        const itemRow = document.createElement('div');
        itemRow.className = 'booking-item-row';
        itemRow.style.display = 'flex';
        itemRow.style.gap = '10px';
        itemRow.style.marginBottom = '10px';
        
        itemRow.innerHTML = `
            <input type="text" class="booking-item-name" placeholder="服務項目名稱" value="${name}" style="flex-grow: 1;">
            <input type="number" class="booking-item-qty" value="${qty}" min="1" style="width: 70px;">
            <button type="button" class="remove-booking-item-btn" style="background: var(--color-danger); padding: 5px 10px; border: none; color: white; border-radius: 4px; cursor: pointer;">-</button>
        `;

        container.appendChild(itemRow);
        
        // 為移除按鈕綁定事件
        itemRow.querySelector('.remove-booking-item-btn').addEventListener('click', (e) => {
            e.target.closest('.booking-item-row').remove();
            // 移除後檢查是否要重新顯示新增按鈕
            if (container.children.length < 5) {
                document.getElementById('add-booking-item-btn').style.display = 'block';
            }
        });

        // 新增後再次檢查是否要隱藏新增按鈕
        if (container.children.length >= 5) {
            document.getElementById('add-booking-item-btn').style.display = 'none';
        }
    }

    async function initializeBookingPage() {
        const datepickerContainer = document.getElementById('booking-datepicker-container');
        const timeSlotContainer = document.getElementById('booking-time-slot-container');
        const detailsForm = document.getElementById('booking-details-form');
        const timeSlotSelect = document.getElementById('time-slot-select');
        const addBookingItemBtn = document.getElementById('add-booking-item-btn');

        // 綁定按鈕事件
        document.getElementById('view-my-bookings-btn').addEventListener('click', () => showPage('page-my-bookings'));
        document.getElementById('confirm-booking-btn').addEventListener('click', handleBookingConfirmation);
        if (addBookingItemBtn) {
            addBookingItemBtn.addEventListener('click', () => addBookingItemRow());
        }
        
        // 清空並加入預設項目
        const itemsContainer = document.getElementById('booking-items-container');
        if (itemsContainer) itemsContainer.innerHTML = '';
        addBookingItemRow(); // 預設顯示一欄

        // 日期選擇器的邏輯 (不變)
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
            if(datepickerContainer) {
                datepickerContainer.innerHTML = `<p style="color:var(--color-danger)">無法載入可預約日期，請稍後再試。</p>`;
            }
        }
        flatpickr(datepickerContainer, {
            inline: true, minDate: minDate, dateFormat: "Y-m-d", locale: "zh_tw", enable: enabledDates,
            onChange: (selectedDates, dateStr) => {
                if (dateStr) {
                    bookingData.date = dateStr;
                    timeSlotContainer.style.display = 'block';
                    detailsForm.style.display = 'none';
                    renderTimeSlots(timeSlotSelect);
                } else {
                    bookingData.date = null;
                    timeSlotContainer.style.display = 'none';
                    detailsForm.style.display = 'none';
                }
            },
        });

        // 時段選擇邏輯 (不變)
        if (timeSlotSelect) {
            timeSlotSelect.addEventListener('change', (e) => {
                if (e.target.value) {
                    if (detailsForm) detailsForm.style.display = 'block';
                } else {
                    if (detailsForm) detailsForm.style.display = 'none';
                }
            });
        }

        // 帶入使用者資料 (不變)
        const userData = await fetchproductData();
        if (userData) {
            const nameInput = document.getElementById('contact-name');
            const phoneInput = document.getElementById('contact-phone');
            if (nameInput) nameInput.value = userData.nickname || userData.real_name || '';
            if (phoneInput) phoneInput.value = userData.phone || '';
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



    // 【修改】處理預約確認與送出
    async function handleBookingConfirmation(event) {
        const confirmBtn = event.target;
        if (confirmBtn.dataset.isSubmitting === 'true') return;

        // 1. 收集所有預約項目
        const items = [];
        const itemRows = document.querySelectorAll('.booking-item-row');
        itemRows.forEach(row => {
            const name = row.querySelector('.booking-item-name').value.trim();
            const qty = row.querySelector('.booking-item-qty').value;
            if (name) { // 只收集有填寫名稱的項目
                items.push({ name, qty });
            }
        });

        if (items.length === 0) {
            alert('請至少填寫一個預約項目！');
            return;
        }

        // 2. 收集其他基本資料
        bookingData.timeSlot = document.getElementById('time-slot-select').value;
        bookingData.people = document.getElementById('booking-people').value;
        bookingData.name = document.getElementById('contact-name').value;
        bookingData.phone = document.getElementById('contact-phone').value;

        if (!bookingData.date || !bookingData.timeSlot || !bookingData.name || !bookingData.phone) {
            alert('日期、時段、姓名與電話為必填！');
            return;
        }
        
        const phoneRegex = /^09\d{8}$/;
        if (!phoneRegex.test(bookingData.phone)) {
            alert('請輸入正確的 10 位手機號碼 (必須為 09 開頭)。');
            return;
        }

        try {
            confirmBtn.dataset.isSubmitting = 'true';
            confirmBtn.disabled = true;
            confirmBtn.textContent = '處理中...';

            // 3. 組成新的 API Payload
            const bookingPayload = {
                userId: userProfile.userId,
                bookingDate: bookingData.date,
                timeSlot: bookingData.timeSlot,
                numOfPeople: bookingData.people,
                contactName: bookingData.name,
                contactPhone: bookingData.phone,
                items: items // 將收集到的項目陣列放入
            };

            const createRes = await fetch('/api/bookings-create', { 
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(bookingPayload)
            });

            if (!createRes.ok) {
                const errorResult = await createRes.json();
                throw new Error(errorResult.error || '建立預約時發生未知錯誤');
            }
            const result = await createRes.json();

            // 4. 發送 LINE 通知 (不變)
            fetch('/api/send-message', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userId: userProfile.userId, message: result.confirmationMessage })
            });
            
            // 5. 顯示成功訊息 (不變)
            appContent.innerHTML = `
                <div class="details-section" style="text-align: center;">
                    <h2 style="color: var(--color-accent);">✅ 預約成功！</h2>
                    <p>3 秒後將自動跳轉至您的預約列表...</p>
                </div>
            `;
            setTimeout(() => { showPage('page-my-bookings'); }, 3000);

        } catch (error) {
            alert(`預約失敗：${error.message}`);
            confirmBtn.dataset.isSubmitting = 'false';
            confirmBtn.disabled = false;
            confirmBtn.textContent = '確認預約';
        }
    }

    // =================================================================
    // Tab Bar 主導航
    // =================================================================
    if (tabBar) {
        tabBar.addEventListener('click', (event) => {
            const button = event.target.closest('.tab-button');
            if (button && button.dataset.target) {
                // 【修正】統一呼叫 showPage 函式來切換頁面
                // 這樣能確保 pageHistory 堆疊被正確重置
                showPage(button.dataset.target);
            }
        });
    }
    // --- 啟動點 ---
    main();
});