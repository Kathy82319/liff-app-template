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
    let allGames = [];
    let allNews = [];
    let pageHistory = ['page-home'];
    let activeFilters = { keyword: '', tag: null };
    let bookingData = {};
    let bookingHistoryStack = [];
    let dailyAvailability = { limit: 4, booked: 0, available: 4 };
    let enabledDatesByAdmin = [];

    // --- 頁面初始化函式映射 ---
    const pageInitializers = {
        'page-home': initializeHomePage,
        'page-games': initializeGamesPage,
        'page-profile': initializeProfilePage,
        'page-my-bookings': initializeMyBookingsPage,
        'page-my-exp-history': initializeMyExpHistoryPage,
        'page-rental-history': initializeRentalHistoryPage,
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
    
    appContent.addEventListener('click', (event) => {
        if (event.target.matches('.details-back-button')) {
             goBackPage();
             return;
        }

        const newsCard = event.target.closest('.news-card');
        if (newsCard && newsCard.dataset.newsId) {
            const newsId = parseInt(newsCard.dataset.newsId, 10);
            const newsItem = allNews.find(n => n.id === newsId);
            if (newsItem) {
                // 動態生成詳情頁面的HTML結構
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
        }
        
        const gameCard = event.target.closest('.game-card');
        if (gameCard && gameCard.dataset.gameId) {
            const gameId = gameCard.dataset.gameId;
            const gameItem = allGames.find(g => g.game_id == gameId);
            if (gameItem) {
                // 動態生成遊戲詳情頁面的HTML結構
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
        }
    });

    // =================================================================
    // 全域事件監聽 (需新增)
    // =================================================================
    function setupGlobalEventListeners() {
        /*
        從這段開始複製
        */
        appContent.addEventListener('click', (event) => {
            const target = event.target;
            const targetId = target.id;

            // --- 通用按鈕 ---
            if (target.matches('.details-back-button')) {
                goBackPage();
                return;
            }

            // --- 會員中心內的導覽按鈕 ---
            if (targetId === 'my-bookings-btn') {
                showPage('page-my-bookings');
            } else if (targetId === 'my-exp-history-btn') {
                showPage('page-my-exp-history');
            } else if (targetId === 'rental-history-btn') {
                showPage('page-rental-history');
            } else if (targetId === 'edit-profile-btn') {
                // 未來編輯個人資料頁面的入口
                console.log('TODO: 前往編輯個人資料頁');
            }

            // --- 歷史紀錄頁的切換按鈕 ---
            else if (targetId === 'toggle-past-bookings-btn') {
                togglePastView('bookings', 'past-bookings-container', target);
            } else if (targetId === 'toggle-past-rentals-btn') {
                togglePastView('rentals', 'past-rentals-container', target);
            }
        });
        /*
        到這裡結束
        */
    }

    // =================================================================
    // 輔助函式 (需新增)
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
                const apiPath = type === 'bookings' ? '/my-bookings' : '/my-rental-history';
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
    // =================================================================
    // 輔助函式 (資料渲染、API 請求等)
    // =================================================================
    function renderBookings(bookings, container, isPast = false) {
        if (!container) return;
        if (bookings.length === 0) {
            container.innerHTML = `<p>${isPast ? '沒有過往的預約紀錄。' : '您目前沒有即將到來的預約。'}</p>`;
            return;
        }
        container.innerHTML = bookings.map(b => `
            <div class="booking-info-card">
                <p><strong>日期:</strong> ${b.booking_date}</p>
                <p><strong>時段:</strong> ${b.time_slot}</p>
                <p><strong>人數:</strong> ${b.num_of_people} ${CONFIG.TERMS.PRODUCT_PLAYER_COUNT_UNIT}</p>
                <p><strong>狀態:</strong> ${b.status_text}</p>
            </div>
        `).join('');
    }

    function renderRentals(rentals, container, isPast = false) {
        if (!container) return;
        if (rentals.length === 0) {
            container.innerHTML = `<p>${isPast ? '沒有已歸還的紀錄。' : `您目前沒有租借中的${CONFIG.TERMS.PRODUCT_NAME}。`}</p>`;
            return;
        }
        container.innerHTML = rentals.map(r => {
            let statusHTML = '';
            if (r.status === 'returned') {
                statusHTML = `<div>已於 ${r.return_date || ''} 歸還</div>`;
            } else if (r.overdue_days > 0) {
                statusHTML = `<div style="color: var(--color-danger);">已逾期 ${r.overdue_days} 天</div>`;
            } else {
                statusHTML = `<div>租借中</div>`;
            }
            return `
                <div class="rental-card" style="display: flex; gap: 15px; align-items: center;">
                    <img src="${r.game_image_url || ''}" style="width: 60px; height: 60px; border-radius: var(--border-radius); object-fit: cover;">
                    <div class="rental-info" style="flex-grow: 1;">
                        <h3 style="margin: 0 0 5px 0; font-size: 1rem;">${r.game_name}</h3>
                        <p style="margin: 0; font-size: 0.9rem; color: var(--color-text-secondary);">應還日期：${r.due_date}</p>
                        ${statusHTML}
                    </div>
                </div>
            `;
        }).join('');
    }

    // =================================================================
    // 首頁 (最新情報)
    // =================================================================
    function renderNews(filterCategory = 'ALL') {
        const container = document.getElementById('news-list-container');
        if (!container) return;

        const filteredNews = (filterCategory === 'ALL')
            ? allNews
            : allNews.filter(news => news.category === filterCategory);

        if (filteredNews.length === 0) {
            container.innerHTML = `<p>這個分類目前沒有${CONFIG.TERMS.NEWS_PAGE_TITLE}。</p>`;
            return;
        }

        container.innerHTML = filteredNews.map(news => {
            const snippet = news.content ? news.content.substring(0, 50) + '...' : '';
            const imageHTML = news.image_url
                ? `<img src="${news.image_url}" alt="${news.title}" class="news-card-image">` : '';

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
            const response = await fetch('/user', {
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
            const response = await fetch('/get-news');
            if (!response.ok) throw new Error(`無法獲取${CONFIG.TERMS.NEWS_PAGE_TITLE}`);
            allNews = await response.json();
            if (allNews.length === 0) {
                container.innerHTML = `<p>目前沒有${CONFIG.TERMS.NEWS_PAGE_TITLE}。</p>`;
            } else {
                container.innerHTML = allNews.map(news => `<div class="news-card" data-news-id="${news.id}"><div class="news-card-header"><span class="news-card-category">${news.category}</span><span class="news-card-date">${news.published_date}</span></div><h3 class="news-card-title">${news.title}</h3><p class="news-card-snippet">${news.content ? news.content.substring(0, 50) + '...' : ''}</p></div>`).join('');
            }
        } catch (error) {
            container.innerHTML = `<p style="color:var(--color-danger);">${error.message}</p>`;
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
            const response = await fetch(`/my-bookings?userId=${userProfile.userId}&filter=current`);
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
            const response = await fetch(`/my-purchase-history?userId=${userProfile.userId}`);
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

    async function initializeRentalHistoryPage() {
        if (!userProfile) return;
        const container = document.getElementById('rental-history-container');
        if (!container) return;
        container.innerHTML = '<p>查詢中...</p>';
        try {
            const response = await fetch(`/my-rental-history?userId=${userProfile.userId}&filter=current`);
            if (!response.ok) throw new Error('查詢租借紀錄失敗');
            const rentals = await response.json();
            renderRentals(rentals, container, false);
        } catch (error) {
            container.innerHTML = `<p style="color: var(--color-danger);">${error.message}</p>`;
        }
    }

    async function initializeInfoPage() {
        const container = document.getElementById('store-info-container');
        if (!container) return;
        container.innerHTML = `<p>載入中...</p>`;
        try {
            const response = await fetch('/get-store-info');
            if (!response.ok) throw new Error('無法獲取店家資訊');
            const info = await response.json();
            container.innerHTML = `<div class="info-section"><h2>地址</h2><p>${info.address}</p></div><div class="info-section"><h2>電話</h2><p>${info.phone}</p></div><div class="info-section"><h2>營業時間</h2><p style="white-space: pre-wrap;">${info.opening_hours}</p></div><div class="info-section"><h2>店家介紹</h2><p style="white-space: pre-wrap;">${info.description}</p></div>`;
        } catch (error) {
            container.innerHTML = `<p style="color:var(--color-danger);">${error.message}</p>`;
        }
    }


    // =================================================================
    // 編輯個人資料頁
    // =================================================================
// public/script.js (initializeEditProfilePage 修正版)
async function initializeEditProfilePage() {
    // 步驟 1: 確保遊戲資料已載入
    if (allGames.length === 0) {
        try {
            // 【核心修正】確認此處呼叫的是 get-products
            const res = await fetch('/get-products');
            if (!res.ok) throw new Error('無法獲取遊戲資料');
            allGames = await res.json();
        } catch (error) {
            console.error('獲取遊戲標籤失敗:', error);
        }
    }

    if (!userProfile) return;

    // 步驟 2: 填充基本資料 (保持不變)
    document.getElementById('edit-profile-name').value = userProfile.displayName;
    const userData = await fetchGameData();
    if (!userData) return;
    
    document.getElementById('edit-profile-real-name').value = userData.real_name || '';
    document.getElementById('edit-profile-nickname').value = userData.nickname || '';
    document.getElementById('edit-profile-phone').value = userData.phone || '';
    document.getElementById('edit-profile-email').value = userData.email || '';

    // 步驟 3: 【核心修改】處理「偏好遊戲類型」的顯示邏輯
    const gamesContainer = document.getElementById('preferred-games-container');
    const otherContainer = document.getElementById('preferred-games-other-container');
    const otherInput = document.getElementById('preferred-games-other-input');

    if (gamesContainer && otherContainer && otherInput) {
        // 從所有遊戲中提取出不重複的標籤列表
        const allStandardTags = [...new Set(allGames.flatMap(g => (g.tags || '').split(',')).map(t => t.trim()).filter(Boolean))];
        
        // 獲取使用者已儲存的偏好，並轉換為 Set 以方便快速查找
        const userTags = new Set((userData.preferred_games || '').split(',').map(tag => tag.trim()).filter(Boolean));
        
        // 找出使用者自訂的標籤 (不在標準標籤內的)
        const userCustomTags = [...userTags].filter(tag => !allStandardTags.includes(tag));

        // 渲染標準標籤按鈕
        gamesContainer.innerHTML = allStandardTags.map(tag => {
            const isActive = userTags.has(tag) ? 'active' : '';
            return `<button type="button" class="preference-tag-btn ${isActive}" data-tag="${tag}">${tag}</button>`;
        }).join('');
        
        // 新增「其他」按鈕
        const otherBtn = document.createElement('button');
        otherBtn.type = 'button';
        otherBtn.className = 'preference-tag-btn';
        otherBtn.textContent = '其他';
        gamesContainer.appendChild(otherBtn);

        // 如果使用者有自訂標籤，則預設展開「其他」區塊並填入值
        if (userCustomTags.length > 0) {
            otherBtn.classList.add('active');
            otherContainer.style.display = 'block';
            otherInput.value = userCustomTags.join(', ');
        } else {
            otherContainer.style.display = 'none';
        }

        // 綁定所有標籤按鈕的點擊事件
        gamesContainer.addEventListener('click', (e) => {
            const target = e.target;
            if (target.classList.contains('preference-tag-btn')) {
                // 如果點擊的是「其他」按鈕
                if (target === otherBtn) {
                    const isNowActive = otherBtn.classList.toggle('active');
                    otherContainer.style.display = isNowActive ? 'block' : 'none';
                } else {
                    // 點擊的是一般標籤按鈕
                    target.classList.toggle('active');
                }
            }
        });
        
        // 為「其他」輸入框加上字數限制
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

    // 步驟 4: 修改表單提交邏輯
    const form = document.getElementById('edit-profile-form');
    form.onsubmit = async (event) => {
        event.preventDefault();
        const statusMsg = document.getElementById('edit-profile-form-status');
        statusMsg.textContent = '儲存中...';

        // 收集所有被選中的標準標籤
        let selectedGames = Array.from(gamesContainer.querySelectorAll('.preference-tag-btn.active'))
                                 .map(btn => btn.dataset.tag)
                                 .filter(tag => tag); // 過濾掉 "其他" 按鈕的 undefined
        
        // 如果「其他」按鈕被選中，則收集自訂標籤
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
            preferredGames: [...new Set(selectedGames)], // 使用 Set 去除重複項
            displayName: userProfile.displayName,
            pictureUrl: userProfile.pictureUrl || ''
        };

        try {
            const response = await fetch('/update-user-profile', {
                method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(formData)
            });
            const result = await response.json();
            if (!response.ok) throw new Error(result.error || '儲存失敗');
            
            gameData = {}; // 清空快取，確保下次進入時資料是新的
            statusMsg.textContent = '儲存成功！';
            statusMsg.style.color = 'green';
            setTimeout(() => goBackPage(), 1500);

        } catch (error) {
            statusMsg.textContent = `儲存失敗: ${error.message}`;
            statusMsg.style.color = 'red';
        }
    };
}
    // =================================================================
    // 產品型錄頁
    // =================================================================
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
        
        thumbnailsContainer.innerHTML = images.map((imgSrc, index) => 
            `<img src="${imgSrc}" class="details-image-thumbnail ${index === 0 ? 'active' : ''}" data-src="${imgSrc}">`
        ).join('');
        
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
        if (Number(game.sale_price) > 0) {
            priceHTML += `<div class="price-item"><p class="price-tag">${CONFIG.TERMS.PRODUCT_SALE_PRICE_LABEL}</p><p class="price-value">$${game.sale_price}</p></div>`;
        }
        if (Number(game.rent_price) > 0) {
            priceHTML += `<div class="price-item"><p class="price-tag">${CONFIG.TERMS.PRODUCT_RENTAL_PRICE_LABEL}</p><p class="price-value">$${game.rent_price}</p></div>`;
        }
        
        priceContent.innerHTML = priceHTML || `<p>價格資訊請洽店內</p>`;
    }


    function renderGames() {
        const container = document.getElementById('game-list-container');
        if(!container) return;

        let filteredGames = allGames.filter(g => g.is_visible === 1);
        const keyword = activeFilters.keyword.toLowerCase().trim();
        if (keyword) { filteredGames = filteredGames.filter(g => g.name.toLowerCase().includes(keyword)); }
        if (activeFilters.tag) { filteredGames = filteredGames.filter(g => (g.tags || '').split(',').map(t => t.trim()).includes(activeFilters.tag)); }

        if (filteredGames.length === 0) {
            container.innerHTML = `<p>找不到符合條件的${CONFIG.TERMS.PRODUCT_NAME}。</p>`;
            return;
        }

        container.innerHTML = filteredGames.map(game => `
            <div class="game-card" data-game-id="${game.game_id}">
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
        
        const allTags = [...new Set(allGames.flatMap(g => (g.tags || '').split(',')).map(t => t.trim()).filter(Boolean))];
        
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
                renderGames();
            });
        });
    }

async function initializeGamesPage() {
        try {
            if (allGames.length === 0) {
                const res = await fetch('/get-products');
                if (!res.ok) throw new Error('API 請求失敗');
                allGames = await res.json();
            }
            renderGames();
            populateFilters();
            document.getElementById('keyword-search').addEventListener('input', e => { 
                activeFilters.keyword = e.target.value; 
                renderGames(); 
            });
            document.getElementById('clear-filters').addEventListener('click', () => {
                activeFilters.keyword = '';
                activeFilters.tag = null;
                document.getElementById('keyword-search').value = '';
                const currentActive = document.querySelector('#tag-filter-container .filter-tag-btn.active');
                if (currentActive) currentActive.classList.remove('active');
                renderGames();
            });
        } catch (error) {
            console.error('初始化產品型錄失敗:', error);
            const container = document.getElementById('game-list-container');
            if (!container) return;
            container.innerHTML = `<p>載入中...</p>`;
            try {
                if (allGames.length === 0) {
                    const res = await fetch('/get-products');
                    if (!res.ok) throw new Error('API 請求失敗');
                    allGames = await res.json();
                }
                
                // 渲染遊戲列表
                const filteredGames = allGames.filter(g => g.is_visible === 1);
                if (filteredGames.length === 0) {
                    container.innerHTML = `<p>目前沒有可顯示的${CONFIG.TERMS.PRODUCT_NAME}。</p>`;
                } else {
                    container.innerHTML = filteredGames.map(game => `
                        <div class="game-card" data-game-id="${game.game_id}">
                            <img src="${game.image_url || ''}" alt="${game.name}" class="game-image">
                            <div class="game-info">
                                <h3 class="game-title">${game.name}</h3>
                                <p class="game-description">${(game.description || '').substring(0, 40)}...</p> 
                            </div>
                        </div>
                    `).join('');
                }
            } catch (error) {
                container.innerHTML = `<p style="color: var(--color-danger);">讀取${CONFIG.TERMS.PRODUCT_NAME}資料失敗。</p>`;
            }
        }
    }

    // =================================================================
    // 場地預約頁
    // =================================================================
    function showBookingStep(stepId) {
        document.querySelectorAll('#booking-wizard-container .booking-step').forEach(step => step.classList.remove('active'));
        const targetStep = document.getElementById(stepId);
        if (targetStep) targetStep.classList.add('active');

        // ** 新增的關鍵邏輯 **
        // 當顯示的是「選擇日期」這一步時，強制重置時段區塊的狀態
        if (stepId === 'step-date-and-slots') {
            const slotsPlaceholder = document.getElementById('slots-placeholder');
            const slotsContainer = document.getElementById('booking-slots-container');
            if (slotsPlaceholder && slotsContainer) {
                // 恢復提示文字
                slotsPlaceholder.textContent = '請先從上方選擇日期';
                // 確保提示文字是可見的
                slotsPlaceholder.style.display = 'block';
                // 清空任何可能殘留的時段按鈕
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
            showBookingStep(lastStep); // 呼叫我們修改過的新函式
            return true;
        }
        return false;
    }

    async function initializeBookingPage() {
        bookingHistoryStack = [];
        showBookingStep('step-preference');

        document.getElementById('view-my-bookings-btn').addEventListener('click', () => {
            showPage('page-my-bookings');
        });

        try {
            // 請求的 API 端點不變，但後端回傳的內容已改變
            const response = await fetch('/bookings-check?month-init=true');
            const data = await response.json();
            // 將接收到的資料存到 enabledDatesByAdmin
            enabledDatesByAdmin = data.enabledDates || []; 
        } catch (error) {
            console.error("獲取可預約日期失敗:", error);
            enabledDatesByAdmin = [];
        }

        const wizardContainer = document.getElementById('booking-wizard-container');
        if (wizardContainer) {
            wizardContainer.addEventListener('click', async (e) => {
            // ... (原本的 click 事件邏輯不變) ...
             if (e.target.matches('.back-button')) {
                goBackBookingStep();
            } else if (e.target.closest('.preference-btn')) {
                showBookingStep('step-date-and-slots');
            } else if (e.target.matches('#to-summary-btn')) {
                const peopleInput = document.getElementById('booking-people');
                const nameInput = document.getElementById('contact-name');
                const phoneInput = document.getElementById('contact-phone');

                bookingData.people = Number(peopleInput.value);
                bookingData.name = nameInput.value.trim();
                bookingData.phone = phoneInput.value.trim();

                if (!bookingData.people || !bookingData.name || bookingData.phone.length < 10) {
                    alert('請確實填寫所有資訊，並確認手機號碼為10碼！');
                    return;
                }
                const tablesNeeded = Math.ceil(bookingData.people / PEOPLE_PER_TABLE);
                if (tablesNeeded > dailyAvailability.available) {
                    alert(`抱歉，座位不足！您需要 ${tablesNeeded} 桌，但當日僅剩 ${dailyAvailability.available} 桌可預約。`);
                    return;
                }
                renderSummary();
                showBookingStep('step-summary');
            } else if (e.target.matches('#confirm-booking-btn')) {
                await handleBookingConfirmation(e.target);
            }
        });
    }

    // 【關鍵修改】選取當前頁面上的日曆容器來初始化
        const datepickerContainer = appContent.querySelector("#booking-datepicker-container");
        if (datepickerContainer) {
            // 【** 請用下面的版本完整取代你現有的 flatpickr() 初始化區塊 **】
            flatpickr(datepickerContainer, {
                inline: true,
                minDate: "today",
                dateFormat: "Y-m-d",
                locale: "zh_tw",
                enable: enabledDatesByAdmin,
                
                // onChange 事件只會在點擊 "可選取" 日期時觸發，這是正確的
                onChange: (selectedDates, dateStr) => {
                    bookingData.date = dateStr;
                    fetchAndRenderSlots(dateStr);
                },

                // ** 新增 onClick 事件來處理所有點擊 **
                // 無論點擊的是否為可選日期，這個事件都會觸發
                onClick: (selectedDates, dateStr, instance) => {
                    // 檢查被點擊的日期元素是否包含 'flatpickr-disabled' class
                    // 我們需要稍微延遲檢查，確保 flatpickr 完成了 class 的更新
                    setTimeout(() => {
                        const clickedElement = instance.selectedDateElem;
                        if (clickedElement && clickedElement.classList.contains('flatpickr-disabled')) {
                            // 如果是不可選的日期，就重置時段選擇區
                            const slotsPlaceholder = document.getElementById('slots-placeholder');
                            const slotsContainer = document.getElementById('booking-slots-container');
                            if (slotsPlaceholder && slotsContainer) {
                                slotsPlaceholder.textContent = '此日期未開放預約'; // 給予更明確的提示
                                slotsPlaceholder.style.display = 'block';
                                slotsContainer.innerHTML = '';
                            }
                        }
                    }, 10); // 10毫秒的延遲通常就足夠了
                }
            });
        }

        const userData = await fetchGameData();
        if (userData) {
            const nameInput = document.getElementById('contact-name');
            const phoneInput = document.getElementById('contact-phone');
            if(nameInput) nameInput.value = userData.real_name || '';
            if(phoneInput) phoneInput.value = userData.phone || '';
        }
    

    async function fetchAndRenderSlots(date) {
        const slotsPlaceholder = document.getElementById('slots-placeholder');
        const slotsContainer = document.getElementById('booking-slots-container');
        slotsPlaceholder.textContent = '正在查詢當日空位...';
        slotsContainer.innerHTML = '';
        slotsPlaceholder.style.display = 'block';

        try {
            const response = await fetch(`/bookings-check?date=${date}`);
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

    async function handleBookingConfirmation(confirmBtn) {
        if (confirmBtn.dataset.isSubmitting === 'true') return;

        try {
            confirmBtn.dataset.isSubmitting = 'true';
            confirmBtn.disabled = true;
            confirmBtn.textContent = '處理中...';
            
            const bookingPayload = {
                userId: userProfile.userId,
                bookingDate: bookingData.date,
                timeSlot: bookingData.timeSlot,
                numOfPeople: bookingData.people,
                contactName: bookingData.name,
                contactPhone: bookingData.phone
            };

            const createRes = await fetch('/bookings-create', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(bookingPayload)
            });

            if (!createRes.ok) {
                const errorResult = await createRes.json();
                throw new Error(errorResult.error || '建立預約時發生未知錯誤');
            }
            
            const result = await createRes.json();
            
            await fetch('/send-message', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userId: userProfile.userId, message: result.confirmationMessage })
            });

            document.getElementById('booking-result-content').innerHTML = `
                <h2 class="success">✅ 預約成功！</h2>
                <p>已將預約確認訊息發送至您的 LINE，我們到時見！</p>
                <button id="booking-done-btn" class="cta-button">返回預約首頁</button>`;
            showBookingStep('step-result');

            document.getElementById('booking-done-btn').addEventListener('click', () => showPage('page-booking'));

        } catch (error) {
            alert(`預約失敗：${error.message}`);
        } finally {
            confirmBtn.dataset.isSubmitting = 'false';
            confirmBtn.disabled = false;
            confirmBtn.textContent = '確認送出';
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