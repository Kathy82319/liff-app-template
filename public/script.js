// public/script.js - v1.5 Final Corrected Version
const CONFIG = window.APP_CONFIG;

document.addEventListener('DOMContentLoaded', () => {
    
    // --- 核心變數 ---
    const myLiffId = "2008032417-3yJQGaO6";
    let userProfile = null;
    let gameData = {};
    const appContent = document.getElementById('app-content');
    const pageTemplates = document.getElementById('page-templates');
    const tabBar = document.getElementById('tab-bar');

    // --- 狀態變數 ---
    let allProducts = [];
    let allNews = [];
    let pageHistory = ['page-home'];
    let activeFilters = { keyword: '', tag: null };
    let bookingData = {};
    let bookingHistoryStack = [];
    let dailyAvailability = { limit: 4, booked: 0, available: 4 };
    let enabledDatesByAdmin = [];
    const PEOPLE_PER_TABLE = 4;
    const AVAILABLE_TIME_SLOTS = ['12:00', '12:30', '13:00', '13:30', '14:00', '14:30', '15:00', '15:30', '16:00', '16:30', '17:00', '17:30', '18:00', '18:30', '19:00', '19:30', '20:00', '20:30', '21:00', '21:30'];


    // --- 頁面初始化函式映射 ---
    const pageInitializers = {
        'page-home': initializeHomePage,
        'page-games': initializeProductsPage,
        'page-profile': initializeProfilePage,
        'page-my-bookings': initializeMyBookingsPage,
        'page-my-exp-history': initializeMyExpHistoryPage,
        'page-booking': initializeBookingPage,
        'page-info': initializeInfoPage,
        'page-edit-profile': initializeEditProfilePage,
    };


    // =================================================================
    // 設定檔應用函式 (Template Engine)
    // =================================================================
    function applyConfiguration() {
        try {
            if (typeof CONFIG === 'undefined' || !CONFIG) {
                console.error("嚴重錯誤：找不到 window.CONFIG 設定檔！"); return;
            }
            const { FEATURES, TERMS } = CONFIG;
            
            const homeTab = document.querySelector('.tab-button[data-target="page-home"]');
            const gamesTab = document.querySelector('.tab-button[data-target="page-games"]');
            const checkoutTab = document.querySelector('.tab-button[data-target="page-checkout"]');
            const profileTab = document.querySelector('.tab-button[data-target="page-profile"]');
            const bookingTab = document.querySelector('.tab-button[data-target="page-booking"]');
            const infoTab = document.querySelector('.tab-button[data-target="page-info"]');

            if (gamesTab) gamesTab.style.display = FEATURES.ENABLE_SHOPPING_CART ? 'block' : 'none';
            if (checkoutTab) checkoutTab.style.display = FEATURES.ENABLE_PAYMENT_GATEWAY ? 'block' : 'none';
            if (profileTab) profileTab.style.display = (FEATURES.ENABLE_MEMBERSHIP_SYSTEM || FEATURES.ENABLE_BOOKING_SYSTEM || FEATURES.ENABLE_RENTAL_SYSTEM) ? 'block' : 'none';
            if (bookingTab) bookingTab.style.display = FEATURES.ENABLE_BOOKING_SYSTEM ? 'block' : 'none';

            document.title = TERMS.BUSINESS_NAME;
            const businessNameHeader = document.getElementById('business-name-header');
            if (businessNameHeader) businessNameHeader.textContent = TERMS.BUSINESS_NAME;

            if (homeTab) homeTab.innerHTML = `${TERMS.NEWS_PAGE_TITLE.substring(0,2)}<br>${TERMS.NEWS_PAGE_TITLE.substring(2)}`;
            if (gamesTab) gamesTab.innerHTML = `${TERMS.PRODUCT_CATALOG_TITLE.substring(0,2)}<br>${TERMS.PRODUCT_CATALOG_TITLE.substring(2)}`;
            if (checkoutTab) checkoutTab.innerHTML = `${TERMS.CHECKOUT_PAGE_TITLE.substring(0,2)}<br>${TERMS.CHECKOUT_PAGE_TITLE.substring(2)}`;
            if (profileTab) profileTab.innerHTML = `${TERMS.MEMBER_PROFILE_TITLE.substring(0,2)}<br>${TERMS.MEMBER_PROFILE_TITLE.substring(2)}`;
            if (bookingTab) bookingTab.innerHTML = `${TERMS.BOOKING_NAME}<br>服務`;

            if (pageTemplates) {
                pageTemplates.querySelector('#page-home .page-main-title').textContent = TERMS.NEWS_PAGE_TITLE;
                pageTemplates.querySelector('#page-games .page-main-title').textContent = TERMS.PRODUCT_CATALOG_TITLE;
                pageTemplates.querySelector('#page-checkout .page-main-title').textContent = TERMS.CHECKOUT_PAGE_TITLE;
                pageTemplates.querySelector('#page-profile .page-main-title').textContent = TERMS.MEMBER_PROFILE_TITLE;
                pageTemplates.querySelector('#page-booking .page-main-title').textContent = TERMS.BOOKING_PAGE_TITLE;
                pageTemplates.querySelector('#page-games #keyword-search').setAttribute('placeholder', `搜尋${TERMS.PRODUCT_NAME}關鍵字...`);
            }
        } catch (e) {
            console.error("套用設定檔時發生錯誤:", e);
        }
    }

    // =================================================================
    // 頁面切換邏輯
    // =================================================================
    function showPage(pageId, isBackAction = false) {
        const template = pageTemplates.querySelector(`#${pageId}`);
        if (template) {
            appContent.innerHTML = template.innerHTML;
            if (!isBackAction) {
                if (['page-home', 'page-games', 'page-checkout', 'page-profile', 'page-booking', 'page-info'].includes(pageId)) {
                    pageHistory = [pageId];
                } else {
                    pageHistory.push(pageId);
                }
            }
            if (pageInitializers[pageId]) {
                pageInitializers[pageId]();
            }
            document.querySelectorAll('.tab-button').forEach(btn => {
                btn.classList.toggle('active', btn.dataset.target === pageHistory[0]);
            });
        } else {
            console.error(`在 page-templates 中找不到樣板: ${pageId}`);
        }
    }

    function goBackPage() {
        if (pageHistory.length > 1) {
            pageHistory.pop();
            showPage(pageHistory[pageHistory.length - 1], true);
        } else {
            liff.closeWindow();
        }
    }
    window.addEventListener('popstate', (event) => {
        if (pageHistory.length > 1) {
            pageHistory.pop();
            const previousPageId = pageHistory[pageHistory.length - 1];
            showPage(previousPageId, true);
        }
    });
    
    // =================================================================
    // 全域事件監聽
    // =================================================================
    function setupGlobalEventListeners() {
        appContent.addEventListener('click', (event) => {
            const target = event.target;
            const targetId = target.id;

            // --- 通用按鈕 ---
            if (target.matches('.details-back-button')) {
                goBackPage();
                return;
            }

            // --- 新聞卡片點擊 ---
            const newsCard = target.closest('.news-card');
            if (newsCard && newsCard.dataset.newsId) {
                const newsId = parseInt(newsCard.dataset.newsId, 10);
                const newsItem = allNews.find(n => n.id === newsId);
                if (newsItem) {
                    appContent.innerHTML = `
                        <div id="page-news-details">
                            <button class="details-back-button">← 返回</button>
                            <h1 id="news-details-title" class="page-main-title"></h1>
                            <div class="details-section">
                                <div class="news-card-header" style="margin-bottom: 15px;">
                                    <span id="news-details-category" class="news-card-category"></span>
                                    <span id="news-details-date" class="news-card-date"></span>
                                </div>
                                <img id="news-details-image" src="" alt="" style="width: 100%; border-radius: var(--border-radius); margin-bottom: 15px; display: none;">
                                <div id="news-details-content" style="line-height: 1.8;"></div>
                            </div>
                        </div>
                    `;
                    renderNewsDetails(newsItem);
                }
                return;
            }

            // --- 產品卡片點擊 ---
            const gameCard = target.closest('.product-card');
            if (gameCard && gameCard.dataset.gameId) {
                const gameId = gameCard.dataset.gameId;
                const gameItem = allProducts.find(g => g.game_id == gameId);
                if (gameItem) {
                    appContent.innerHTML = `
                        <div id="page-game-details">
                            <button class="details-back-button">← 返回</button>
                            <h1 class="details-title page-main-title"></h1>
                            <div class="details-section">
                                <div class="details-gallery">
                                    <img src="" class="details-image-main">
                                    <div class="details-image-thumbnails"></div>
                                </div>
                                <div class="core-info-grid">
                                    <div class="info-item">
                                        <span>建議人數</span>
                                        <strong id="game-players"></strong>
                                    </div>
                                    <div class="info-item">
                                        <span>${CONFIG.TERMS.PRODUCT_DIFFICULTY_LABEL}</span>
                                        <strong id="game-difficulty"></strong>
                                    </div>
                                </div>
                                <div id="game-tags-container"></div>
                                <hr style="border-color: var(--color-secondary); border-style: dashed;">
                                <h3>介紹</h3>
                                <p id="game-intro-content"></p>
                                <div id="game-supplementary-section" style="display:none;">
                                    <h3>補充說明</h3>
                                    <p id="game-supplementary-content"></p>
                                </div>
                                <hr style="border-color: var(--color-secondary); border-style: dashed;">
                                <h3>費用</h3>
                                <div id="game-price-content"></div>
                            </div>
                        </div>
                    `;
                    renderGameDetails(gameItem);
                }
                return;
            }

            // --- 會員中心內的導覽按鈕 ---
            if (targetId === 'my-bookings-btn') showPage('page-my-bookings');
            else if (targetId === 'my-exp-history-btn') showPage('page-my-exp-history');
            else if (targetId === 'edit-profile-btn') showPage('page-edit-profile');

            // --- 歷史紀錄頁的切換按鈕 ---
            else if (targetId === 'toggle-past-bookings-btn') togglePastView('bookings', 'past-bookings-container', target);
            else if (targetId === 'toggle-past-rentals-btn') togglePastView('rentals', 'past-rentals-container', target);
            else if (target.matches('.cancel-booking-btn')) {
    const bookingId = target.dataset.bookingId;
    if (!bookingId) return;

    if (confirm('您確定要取消這筆預約嗎？此操作無法復原。')) {
        handleCancelBooking(bookingId);
    }
}
        });
    }
// public/script.js (新增的函式)

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
            applyConfiguration();
            setupGlobalEventListeners();
            showPage('page-home');
        } catch (err) {
            console.error("LIFF 初始化失敗", err);
            applyConfiguration();
            setupGlobalEventListeners();
            showPage('page-home');
        }
    }

    async function fetchGameData(forceRefresh = false) {
        if (!forceRefresh && gameData.user_id) return gameData;
        try {
            const response = await fetch('/api/user', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userId: userProfile.userId, displayName: userProfile.displayName, pictureUrl: userProfile.pictureUrl }),
            });
            if (!response.ok) throw new Error('無法取得會員資料');
            gameData = await response.json();
            return gameData;
        } catch (error) {
            console.error('會員API失敗:', error);
            return null;
        }
    }

    function updateProfileDisplay(data) {
        if (!data) return;
        const displayNameEl = document.getElementById('display-name');
        if(displayNameEl) displayNameEl.textContent = data.nickname || userProfile.displayName;
        const classP = document.querySelector('.profile-stats p:nth-of-type(1)');
        const levelP = document.querySelector('.profile-stats p:nth-of-type(2)');
        const expP = document.querySelector('.profile-stats p:nth-of-type(3)');
        const perkP = document.getElementById('user-perk-line');
        const qrcodeContainer = document.getElementById('qrcode-container');

        if (CONFIG.FEATURES.ENABLE_MEMBERSHIP_SYSTEM) {
            if (qrcodeContainer) qrcodeContainer.style.display = 'flex';
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
        document.querySelector('#rental-history-btn').innerHTML = `${CONFIG.TERMS.RENTAL_NAME}紀錄`;
        document.querySelector('#my-exp-history-btn').style.display = CONFIG.FEATURES.ENABLE_MEMBERSHIP_SYSTEM ? 'block' : 'none';
        document.querySelector('#my-bookings-btn').style.display = CONFIG.FEATURES.ENABLE_BOOKING_SYSTEM ? 'block' : 'none';
        document.querySelector('#rental-history-btn').style.display = CONFIG.FEATURES.ENABLE_RENTAL_SYSTEM ? 'block' : 'none';
        const profilePicture = document.getElementById('profile-picture');
        if (profilePicture && userProfile.pictureUrl) profilePicture.src = userProfile.pictureUrl;
        const qrcodeElement = document.getElementById('qrcode');
        if (qrcodeElement && CONFIG.FEATURES.ENABLE_MEMBERSHIP_SYSTEM) {
            qrcodeElement.innerHTML = '';
            new QRCode(qrcodeElement, { text: userProfile.userId, width: 120, height: 120 });
        }
        try {
            const userData = await fetchGameData(true);
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
                if (!res.ok) throw new Error('無法獲取遊戲資料');
                allProducts = await res.json();
            } catch (error) {
                console.error('獲取遊戲標籤失敗:', error);
            }
        }
        if (!userProfile) return;
        document.getElementById('edit-profile-name').value = userProfile.displayName;
        const userData = await fetchGameData();
        if (!userData) return;
        document.getElementById('edit-profile-real-name').value = userData.real_name || '';
        document.getElementById('edit-profile-nickname').value = userData.nickname || '';
        document.getElementById('edit-profile-phone').value = userData.phone || '';
        document.getElementById('edit-profile-email').value = userData.email || '';
        const gamesContainer = document.getElementById('preferred-games-container');
        const otherContainer = document.getElementById('preferred-games-other-container');
        const otherInput = document.getElementById('preferred-games-other-input');
        if (gamesContainer && otherContainer && otherInput) {
            const allStandardTags = [...new Set(allProducts.flatMap(g => (g.tags || '').split(',')).map(t => t.trim()).filter(Boolean))];
            const userTags = new Set((userData.preferred_games || '').split(',').map(tag => tag.trim()).filter(Boolean));
            const userCustomTags = [...userTags].filter(tag => !allStandardTags.includes(tag));
            gamesContainer.innerHTML = allStandardTags.map(tag => {
                const isActive = userTags.has(tag) ? 'active' : '';
                return `<button type="button" class="preference-tag-btn ${isActive}" data-tag="${tag}">${tag}</button>`;
            }).join('');
            const otherBtn = document.createElement('button');
            otherBtn.type = 'button';
            otherBtn.className = 'preference-tag-btn';
            otherBtn.textContent = '其他';
            gamesContainer.appendChild(otherBtn);
            if (userCustomTags.length > 0) {
                otherBtn.classList.add('active');
                otherContainer.style.display = 'block';
                otherInput.value = userCustomTags.join(', ');
            } else {
                otherContainer.style.display = 'none';
            }
            gamesContainer.addEventListener('click', (e) => {
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
            let selectedGames = Array.from(gamesContainer.querySelectorAll('.preference-tag-btn.active')).map(btn => btn.dataset.tag).filter(tag => tag);
            if (otherContainer.style.display === 'block' && otherInput.value.trim() !== '') {
                const customTags = otherInput.value.trim().split(/[,，\s]+/).filter(Boolean);
                selectedGames.push(...customTags);
            }
            const formData = {
                userId: userProfile.userId,
                realName: document.getElementById('edit-profile-real-name').value.trim(),
                nickname: document.getElementById('edit-profile-nickname').value,
                phone: document.getElementById('edit-profile-phone').value,
                email: document.getElementById('edit-profile-email').value,
                preferredGames: [...new Set(selectedGames)],
                displayName: userProfile.displayName,
                pictureUrl: userProfile.pictureUrl || ''
            };
            try {
                const response = await fetch('/api/update-user-profile', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(formData) });
                const result = await response.json();
                if (!response.ok) throw new Error(result.error || '儲存失敗');
                gameData = {};
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

    function renderGameDetails(game) {
        const mainImage = appContent.querySelector('.details-image-main');
        const thumbnailsContainer = appContent.querySelector('.details-image-thumbnails');
        const images = [game.image_url, game.image_url_2, game.image_url_3].filter(Boolean);
        mainImage.src = images.length > 0 ? images[0] : '';
        thumbnailsContainer.innerHTML = images.map((imgSrc, index) => `<img src="${imgSrc}" class="details-image-thumbnail ${index === 0 ? 'active' : ''}" data-src="${imgSrc}">`).join('');
        thumbnailsContainer.addEventListener('click', e => {
            if (e.target.matches('.details-image-thumbnail')) {
                mainImage.src = e.target.dataset.src;
                thumbnailsContainer.querySelector('.active')?.classList.remove('active');
                e.target.classList.add('active');
            }
        });
        appContent.querySelector('.details-title').textContent = game.name;
        appContent.querySelector('#game-players').textContent = `${game.min_players} - ${game.max_players} ${CONFIG.TERMS.PRODUCT_PLAYER_COUNT_UNIT}`;
        appContent.querySelector('#game-difficulty').textContent = difficultyToStars(game.difficulty);
        const tagsContainer = appContent.querySelector('#game-tags-container');
        const tags = (game.tags || '').split(',').map(t => t.trim()).filter(Boolean);
        if (tags.length > 0) {
            tagsContainer.innerHTML = tags.map(tag => `<span class="game-tag">${tag}</span>`).join('');
            tagsContainer.style.display = 'block';
        } else {
            tagsContainer.style.display = 'none';
        }
        appContent.querySelector('#game-intro-content').textContent = game.description || '暫無介紹。';
        const supplementarySection = appContent.querySelector('#game-supplementary-section');
        if (game.supplementary_info) {
            appContent.querySelector('#game-supplementary-content').innerHTML = game.supplementary_info.replace(/\n/g, '<br>');
            supplementarySection.style.display = 'block';
        } else {
            supplementarySection.style.display = 'none';
        }
        const priceContent = appContent.querySelector('#game-price-content');
        let priceHTML = '';
        if (Number(game.sale_price) > 0) priceHTML += `<div class="price-item"><p class="price-tag">${CONFIG.TERMS.PRODUCT_SALE_PRICE_LABEL}</p><p class="price-value">$${game.sale_price}</p></div>`;
        if (Number(game.rent_price) > 0) priceHTML += `<div class="price-item"><p class="price-tag">${CONFIG.TERMS.PRODUCT_RENTAL_PRICE_LABEL}</p><p class="price-value">$${game.rent_price}</p></div>`;
        priceContent.innerHTML = priceHTML || `<p>價格資訊請洽店內</p>`;
    }

    function renderProducts() {
        const container = document.getElementById('game-list-container');
        if(!container) return;
        let filteredGames = allProducts.filter(g => g.is_visible === 1);
        const keyword = activeFilters.keyword.toLowerCase().trim();
        if (keyword) { filteredGames = filteredGames.filter(g => g.name.toLowerCase().includes(keyword)); }
        if (activeFilters.tag) { filteredGames = filteredGames.filter(g => (g.tags || '').split(',').map(t => t.trim()).includes(activeFilters.tag)); }
        if (filteredGames.length === 0) {
            container.innerHTML = `<p>找不到符合條件的${CONFIG.TERMS.PRODUCT_NAME}。</p>`;
            return;
        }
        container.innerHTML = filteredGames.map(game => `
            <div class="product-card" data-game-id="${game.game_id}">
                <img src="${game.image_url || ''}" alt="${game.name}" class="game-image">
                <div class="game-info">
                    <h3 class="game-title">${game.name}</h3>
                    <p class="game-description">${(game.description || '').substring(0, 40)}...</p> 
                    <div class="game-details">
                        <span>👥 ${game.min_players}-${game.max_players} ${CONFIG.TERMS.PRODUCT_PLAYER_COUNT_UNIT}</span>
                        <span>⭐ ${CONFIG.TERMS.PRODUCT_DIFFICULTY_LABEL}: ${game.difficulty}</span>
                    </div>
                </div>
            </div>
        `).join('');
    }

    function populateFilters() {
        const filterContainer = document.getElementById('tag-filter-container');
        if(!filterContainer) return;
        const allTags = [...new Set(allProducts.flatMap(g => (g.tags || '').split(',')).map(t => t.trim()).filter(Boolean))];
        filterContainer.innerHTML = allTags.map(tag => `<button class="filter-tag-btn" data-tag="${tag}">${tag}</button>`).join('');
        filterContainer.querySelectorAll('.filter-tag-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const currentActive = filterContainer.querySelector('.filter-tag-btn.active');
                if (currentActive) currentActive.classList.remove('active');
                if (activeFilters.tag === btn.dataset.tag) {
                    activeFilters.tag = null;
                } else {
                    activeFilters.tag = btn.dataset.tag;
                    btn.classList.add('active');
                }
                renderProducts();
            });
        });
    }

    async function initializeProductsPage() {
        const container = document.getElementById('game-list-container');
        if (!container) return;
        container.innerHTML = `<p>載入中...</p>`;
        try {
            if (allProducts.length === 0) {
                const res = await fetch('/api/get-products');
                if (!res.ok) throw new Error('API 請求失敗');
                allProducts = await res.json();
            }
            populateFilters();
            renderProducts();
            document.getElementById('keyword-search').addEventListener('input', e => { 
                activeFilters.keyword = e.target.value; 
                renderProducts(); 
            });
            document.getElementById('clear-filters').addEventListener('click', () => {
                activeFilters.keyword = '';
                activeFilters.tag = null;
                document.getElementById('keyword-search').value = '';
                const currentActive = document.querySelector('#tag-filter-container .filter-tag-btn.active');
                if (currentActive) currentActive.classList.remove('active');
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

// public/script.js

async function initializeBookingPage() {
    // 獲取頁面上的元素
    const datepickerContainer = document.getElementById('booking-datepicker-container');
    const timeSlotContainer = document.getElementById('booking-time-slot-container');
    const detailsForm = document.getElementById('booking-details-form');
    const timeSlotSelect = document.getElementById('time-slot-select');

    // 【新增】根據 config 設定顯示/隱藏「預約項目」欄位
    const bookingItemFormGroup = document.getElementById('booking-item')?.closest('.form-group');
    if (bookingItemFormGroup) {
        bookingItemFormGroup.style.display = CONFIG.FEATURES.ENABLE_BOOKING_ITEM_FIELD ? 'block' : 'none';
    }

    // 綁定按鈕事件
    document.getElementById('view-my-bookings-btn').addEventListener('click', () => showPage('page-my-bookings'));
    document.getElementById('confirm-booking-btn').addEventListener('click', handleBookingConfirmation);

    // --- 【核心修改開始】 ---
    // 根據 config 計算最小可預約日期
    const cutoffDays = CONFIG.LOGIC.BOOKING_CUTOFF_DAYS || 0;
    const minDate = new Date();
    minDate.setDate(minDate.getDate() + cutoffDays);
    // --- 【核心修改結束】 ---

    // 初始化日期選擇器
    flatpickr(datepickerContainer, {
        inline: true,
        minDate: minDate, // 【核心修改】應用計算出來的最小日期
        dateFormat: "Y-m-d",
        locale: "zh_tw",
        onChange: (selectedDates, dateStr) => {
            bookingData.date = dateStr;
            renderTimeSlots(timeSlotSelect);
            if (timeSlotContainer) timeSlotContainer.style.display = 'block';
        },
    });

    // 當時段被選擇後，顯示下方的詳細資訊表單
    if (timeSlotSelect) {
        timeSlotSelect.addEventListener('change', (e) => {
            if (e.target.value) {
                if (detailsForm) detailsForm.style.display = 'block';
            } else {
                if (detailsForm) detailsForm.style.display = 'none';
            }
        });
    }

    // 帶入已有的使用者資料
    const userData = await fetchGameData();
    if (userData) {
        const nameInput = document.getElementById('contact-name');
        const phoneInput = document.getElementById('contact-phone');
        if (nameInput) nameInput.value = userData.real_name || userData.nickname || '';
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

// public/script.js

async function handleBookingConfirmation(event) {
    const confirmBtn = event.target;
    if (confirmBtn.dataset.isSubmitting === 'true') return;

    // 從表單獲取所有資料
    bookingData.timeSlot = document.getElementById('time-slot-select').value;
    bookingData.item = document.getElementById('booking-item').value;
    bookingData.people = document.getElementById('booking-people').value;
    bookingData.name = document.getElementById('contact-name').value;
    bookingData.phone = document.getElementById('contact-phone').value;

    if (!bookingData.date || !bookingData.timeSlot || !bookingData.name || !bookingData.phone) {
        alert('日期、時段、姓名與電話為必填！');
        return;
    }

    try {
        confirmBtn.dataset.isSubmitting = 'true';
        confirmBtn.disabled = true;
        confirmBtn.textContent = '處理中...';

        const bookingPayload = {
            userId: userProfile.userId,
            bookingDate: bookingData.date,
            timeSlot: bookingData.timeSlot,
            item: bookingData.item || '未指定',
            numOfPeople: bookingData.people,
            contactName: bookingData.name,
            contactPhone: bookingData.phone
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


        fetch('/api/send-message', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId: userProfile.userId, message: result.confirmationMessage })
        });

        appContent.innerHTML = `
            <div class="details-section" style="text-align: center;">
                <h2 style="color: var(--color-accent);">✅ 預約成功！</h2>
                <p>3 秒後將自動跳轉至您的預約列表...</p>
            </div>
        `;

        setTimeout(() => {
            showPage('page-my-bookings');
        }, 3000);

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
    tabBar.addEventListener('click', (event) => {
        const button = event.target.closest('.tab-button');
        if (button) {
            showPage(button.dataset.target);
        }
    });

    initializeLiff();
});