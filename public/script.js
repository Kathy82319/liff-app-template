// 【改造】在檔案最頂部，立刻讀取設定檔，方便全域使用
const CONFIG = window.APP_CONFIG;

document.addEventListener('DOMContentLoaded', () => {
    // =================================================================
    // 核心DOM元素與全域變數
    // =================================================================
    const myLiffId = "2008032417-3yJQGaO6"; // 【更新】已使用您提供的新 LIFF ID
    let userProfile = null;
    let gameData = {};
    const appContent = document.getElementById('app-content');
    const pageTemplates = document.getElementById('page-templates');
    const tabBar = document.getElementById('tab-bar');

    const TOTAL_TABLES = 4;
    const PEOPLE_PER_TABLE = 4;
    const AVAILABLE_TIME_SLOTS = ['12:00', '12:30', '13:00', '13:30', '14:00', '14:30', '15:00', '15:30', '16:00', '16:30', '17:00', '17:30', '18:00', '18:30', '19:00', '19:30', '20:00', '20:30', '21:00', '21:30'];

    let myRentals = [];
    let allGames = [];
    let allNews = [];
    let pageHistory = ['page-home'];
    let activeFilters = { keyword: '', tag: null };
    let bookingData = {};
    let bookingHistoryStack = [];
    let dailyAvailability = { limit: TOTAL_TABLES, booked: 0, available: TOTAL_TABLES };
    let enabledDatesByAdmin = [];

    // =================================================================
    // 【改造】新增：設定檔應用函式 (Template Engine)
    // =================================================================
    function applyConfiguration() {
        // --- 任務 2: 實現功能模組化 (可插拔架構) ---
        const { FEATURES } = CONFIG;

        // 【修正】此處的語法錯誤，從 == 改為 =
        const gamesTabButton = document.querySelector('.tab-button[data-target="page-games"]');
        if (gamesTabButton) gamesTabButton.style.display = FEATURES.ENABLE_SHOPPING_CART ? 'block' : 'none';

        const bookingTabButton = document.querySelector('.tab-button[data-target="page-booking"]');
        if (bookingTabButton) bookingTabButton.style.display = FEATURES.ENABLE_BOOKING_SYSTEM ? 'block' : 'none';

        // --- 任務 3: 實現術語通用化 ---
        const { TERMS } = CONFIG;

        document.title = TERMS.BUSINESS_NAME;

        const gamesTab = document.querySelector('.tab-button[data-target="page-games"]');
        if (gamesTab) gamesTab.innerHTML = `${TERMS.PRODUCT_CATALOG_TITLE.substring(0,2)}<br>${TERMS.PRODUCT_CATALOG_TITLE.substring(2)}`;

        const profileTab = document.querySelector('.tab-button[data-target="page-profile"]');
        if (profileTab) profileTab.innerHTML = `${TERMS.MEMBER_PROFILE_TITLE.substring(0,2)}<br>${TERMS.MEMBER_PROFILE_TITLE.substring(2)}`;

        const bookingTab = document.querySelector('.tab-button[data-target="page-booking"]');
        if (bookingTab) bookingTab.innerHTML = `${TERMS.BOOKING_NAME}<br>服務`;

        pageTemplates.querySelector('#page-profile .page-main-title')?.textContent = TERMS.MEMBER_PROFILE_TITLE;
        pageTemplates.querySelector('#page-games #keyword-search')?.setAttribute('placeholder', `搜尋${TERMS.PRODUCT_NAME}關鍵字...`);
        pageTemplates.querySelector('#page-booking .page-main-title')?.textContent = TERMS.BOOKING_PAGE_TITLE;
    }

    // =================================================================
    // 頁面切換邏輯
    // =================================================================
    function showPage(pageId, isBackAction = false) {
        const template = pageTemplates.querySelector(`#${pageId}`);
        if (template) {
            appContent.innerHTML = template.innerHTML;
            const state = { page: pageId };
            const url = `#${pageId}`;

            if (!isBackAction) {
                if (['page-home', 'page-games', 'page-profile', 'page-booking', 'page-info'].includes(pageId)) {
                    pageHistory = [pageId];
                    history.replaceState(state, '', url);
                } else {
                    pageHistory.push(pageId);
                    history.pushState(state, '', url);
                }
            }
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
            history.back();
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
                showPage('page-news-details');
                renderNewsDetails(newsItem);
            }
        }
        const gameCard = event.target.closest('.game-card');
        if (gameCard && gameCard.dataset.gameId) {
            const gameId = gameCard.dataset.gameId;
            const gameItem = allGames.find(g => g.game_id == gameId);
            if (gameItem) {
                showPage('page-game-details');
                renderGameDetails(gameItem);
            }
        }
    });
    
    // =================================================================
    // LIFF 初始化
    // =================================================================
    function handleInitialRouting() {
        const hash = window.location.hash;
        const pageId = hash ? hash.substring(1) : 'page-home';
        const templateExists = document.getElementById(pageId);
        showPage(templateExists ? pageId : 'page-home');
    }

    async function initializeLiff() {
        try {
            await liff.init({ liffId: myLiffId });
            if (!liff.isLoggedIn()) {
                liff.login();
                return;
            }
            userProfile = await liff.getProfile();
            applyConfiguration();
            handleInitialRouting();
        } catch (err) {
            console.error("LIFF 初始化或 Profile 獲取失敗", err);
            applyConfiguration();
            showPage('page-home');
        }
    }

    // =================================================================
    // 各頁面初始化與渲染函式
    // =================================================================
    
    // --- 首頁 (最新情報) ---
    function renderNews(filterCategory = 'ALL') {
        const container = document.getElementById('news-list-container');
        if (!container) return;
        const filteredNews = (filterCategory === 'ALL') ? allNews : allNews.filter(news => news.category === filterCategory);
        if (filteredNews.length === 0) {
            container.innerHTML = '<p>這個分類目前沒有消息。</p>';
            return;
        }
        container.innerHTML = filteredNews.map(news => {
            const snippet = news.content ? news.content.substring(0, 50) + '...' : '';
            const imageHTML = news.image_url ? `<div class="news-card-image-container"><img src="${news.image_url}" alt="${news.title}" class="news-card-image"></div>` : '';
            return `
            <div class="news-card" data-news-id="${news.id}">
                <div class="news-card-header">
                    <span class="news-card-category">${news.category}</span>
                    <span class="news-card-date">${news.published_date}</span>
                </div>
                <div class="news-card-content">
                    <h3 class="news-card-title">${news.title}</h3>
                    ${imageHTML}
                    <p class="news-card-snippet">${snippet}</p>
                </div>
            </div>`;
        }).join('');
    }

    function setupNewsFilters() {
        const container = document.getElementById('news-filter-container');
        if (!container) return;
        const categories = ['ALL', ...new Set(allNews.map(news => news.category))];
        container.innerHTML = categories.map(cat => `<button class="news-filter-btn ${cat === 'ALL' ? 'active' : ''}" data-category="${cat}">${cat === 'ALL' ? '全部' : cat}</button>`).join('');
        container.querySelectorAll('.news-filter-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                container.querySelector('.active').classList.remove('active');
                btn.classList.add('active');
                renderNews(btn.dataset.category);
            });
        });
    }

    async function initializeHomePage() {
        try {
            const response = await fetch('/api/get-news');
            if (!response.ok) throw new Error('無法獲取最新情報');
            allNews = await response.json();
            setupNewsFilters();
            renderNews();
        } catch (error) {
            console.error(error);
            const container = document.getElementById('news-list-container');
            if(container) container.innerHTML = `<p style="color:red;">${error.message}</p>`;
        }
    }
    
    function renderNewsDetails(newsItem) {
        document.getElementById('news-details-title').textContent = newsItem.title;
        document.getElementById('news-details-category').textContent = newsItem.category;
        document.getElementById('news-details-date').textContent = newsItem.published_date;
        const contentEl = document.getElementById('news-details-content');
        contentEl.innerHTML = newsItem.content ? newsItem.content.replace(/\n/g, '<br>') : '<p style="color: #888;">此消息沒有提供詳細內容。</p>';
        const imageEl = document.getElementById('news-details-image');
        if (newsItem.image_url) {
            imageEl.src = newsItem.image_url;
            imageEl.alt = newsItem.title;
            imageEl.style.display = 'block';
        } else {
            imageEl.style.display = 'none';
        }
    }

    // --- 個人資料頁 ---
    async function initializeProfilePage() {
        if (!userProfile) return;

        document.querySelector('#my-bookings-btn').innerHTML = `${CONFIG.TERMS.BOOKING_NAME}紀錄`;
        document.querySelector('#my-exp-history-btn').innerHTML = `${CONFIG.TERMS.POINTS_NAME}<br>紀錄`;
        document.querySelector('#rental-history-btn').innerHTML = `${CONFIG.TERMS.RENTAL_NAME}<br>紀錄`;
        document.querySelector('#my-exp-history-btn').style.display = CONFIG.FEATURES.ENABLE_MEMBERSHIP_SYSTEM ? 'block' : 'none';
        document.querySelector('#my-bookings-btn').style.display = CONFIG.FEATURES.ENABLE_BOOKING_SYSTEM ? 'block' : 'none';
        document.querySelector('#rental-history-btn').style.display = CONFIG.FEATURES.ENABLE_RENTAL_SYSTEM ? 'block' : 'none';

        const profilePicture = document.getElementById('profile-picture');
        if (userProfile.pictureUrl) profilePicture.src = userProfile.pictureUrl;
        const qrcodeElement = document.getElementById('qrcode');
        if (qrcodeElement) {
            qrcodeElement.innerHTML = '';
            new QRCode(qrcodeElement, { text: userProfile.userId, width: 150, height: 150 });
        }
        document.getElementById('edit-profile-btn').addEventListener('click', () => showPage('page-edit-profile'));
        document.getElementById('my-bookings-btn').addEventListener('click', () => showPage('page-my-bookings'));
        document.getElementById('my-exp-history-btn').addEventListener('click', () => showPage('page-my-exp-history'));
        document.getElementById('rental-history-btn').addEventListener('click', () => showPage('page-rental-history'));

        try {
            const userData = await fetchGameData(true);
            updateProfileDisplay(userData);
        } catch (error) {
            console.error("無法更新個人資料畫面:", error);
            document.getElementById('display-name').textContent = '資料載入失敗';
        }
    }

    async function fetchGameData(forceRefresh = false) {
        if (!forceRefresh && gameData && gameData.user_id) return gameData;
        try {
            const response = await fetch('/api/user', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userId: userProfile.userId, displayName: userProfile.displayName, pictureUrl: userProfile.pictureUrl }),
            });
            if (!response.ok) throw new Error('無法取得會員遊戲資料');
            gameData = await response.json();
            return gameData;
        } catch (error) {
            console.error('呼叫會員 API 失敗:', error);
            document.getElementById('display-name').textContent = userProfile.displayName;
            return null;
        }
    }

    function updateProfileDisplay(data) {
        if (!data) return;
        document.getElementById('display-name').textContent = data.nickname || userProfile.displayName;

        const classP = document.querySelector('.profile-stats p:nth-of-type(1)');
        const levelP = document.querySelector('.profile-stats p:nth-of-type(2)');
        const expP = document.querySelector('.profile-stats p:nth-of-type(3)');
        const perkP = document.getElementById('user-perk-line');

        if (CONFIG.FEATURES.ENABLE_MEMBERSHIP_SYSTEM) {
            if (classP) classP.style.display = 'block';
            if (levelP) levelP.style.display = 'block';
            if (expP) expP.style.display = 'block';
            
            if(classP) classP.innerHTML = `<strong>職業：</strong><span id="user-class">${data.class || "無"}</span>`;
            if(levelP) levelP.innerHTML = `<strong>等級：</strong><span id="user-level">${data.level}</span>`;
            if(expP) expP.innerHTML = `<strong>${CONFIG.TERMS.POINTS_NAME}：</strong><span id="user-exp">${data.current_exp} / 10</span>`;

            if (perkP && data.perk && data.class !== '無') {
                perkP.innerHTML = `<strong>職業福利：</strong><span id="user-perk">${data.perk}</span>`;
                perkP.style.display = 'block';
            } else if (perkP) {
                perkP.style.display = 'none';
            }
        } else {
            if (classP) classP.style.display = 'none';
            if (levelP) levelP.style.display = 'none';
            if (expP) expP.style.display = 'none';
            if (perkP) perkP.style.display = 'none';
        }
    }
    
    // --- 歷史紀錄頁面 (預約、積分、租借) ---
    async function initializeMyBookingsPage() {
        if (!userProfile) return;
        const currentContainer = document.getElementById('my-bookings-container');
        const pastContainer = document.getElementById('past-bookings-container');
        const toggleBtn = document.getElementById('toggle-past-bookings-btn');
        if (!currentContainer || !pastContainer || !toggleBtn) return;
        currentContainer.innerHTML = '<p>正在查詢您的預約紀錄...</p>';
        const renderBookings = (bookings, container, isPast = false) => {
            if (bookings.length === 0) {
                container.innerHTML = `<p>${isPast ? '沒有過往的預約紀錄。' : '您目前沒有即將到來的預約。'}</p>`;
                return;
            }
            container.innerHTML = bookings.map(booking => `
                <div class="booking-info-card">
                    <p class="booking-date-time">${booking.booking_date} - ${booking.time_slot}</p>
                    <p><strong>預約姓名：</strong> ${booking.contact_name}</p>
                    <p><strong>預約人數：</strong> ${booking.num_of_people} 人</p>
                    <p><strong>狀態：</strong> <span class="booking-status-${booking.status}">${booking.status_text}</span></p>
                </div>`).join('');
        };
        try {
            const currentResponse = await fetch(`/api/my-bookings?userId=${userProfile.userId}&filter=current`);
            if (!currentResponse.ok) throw new Error('查詢預約失敗');
            const currentBookings = await currentResponse.json();
            renderBookings(currentBookings, currentContainer);
            toggleBtn.addEventListener('click', async () => {
                const isHidden = pastContainer.style.display === 'none';
                if (isHidden) {
                    pastContainer.innerHTML = '<p>正在查詢過往紀錄...</p>';
                    pastContainer.style.display = 'block';
                    toggleBtn.textContent = '隱藏過往紀錄';
                    try {
                        const pastResponse = await fetch(`/api/my-bookings?userId=${userProfile.userId}&filter=past`);
                        if (!pastResponse.ok) throw new Error('查詢過往預約失敗');
                        const pastBookings = await pastResponse.json();
                        renderBookings(pastBookings, pastContainer, true);
                    } catch (error) {
                        pastContainer.innerHTML = `<p style="color: red;">${error.message}</p>`;
                    }
                } else {
                    pastContainer.style.display = 'none';
                    toggleBtn.textContent = '查看過往紀錄';
                }
            });
        } catch (error) {
            currentContainer.innerHTML = `<p style="color: red;">${error.message}</p>`;
        }
    }

    async function initializeMyExpHistoryPage() {
        if (!userProfile) return;
        const container = document.getElementById('my-exp-history-container');
        if (!container) return;
        container.innerHTML = '<p>正在查詢您的經驗紀錄...</p>';
        try {
            const response = await fetch(`/api/my-exp-history?userId=${userProfile.userId}`);
            if (!response.ok) throw new Error('查詢紀錄失敗');
            const records = await response.json();
            if (records.length === 0) {
                container.innerHTML = '<p>您目前沒有任何經驗值紀錄。</p>';
                return;
            }
            container.innerHTML = records.map(record => {
                const date = new Date(record.created_at).toLocaleDateString('sv');
                const expClass = record.exp_added > 0 ? 'exp-gain' : 'exp-loss';
                const expSign = record.exp_added > 0 ? '+' : '';
                return `
                    <div class="exp-record-card">
                        <div class="exp-record-date">${date}</div>
                        <div class="exp-record-reason">${record.reason}</div>
                        <div class="exp-record-value ${expClass}">${expSign}${record.exp_added}</div>
                    </div>`;
            }).join('');
        } catch (error) {
            container.innerHTML = `<p style="color: red;">無法載入經驗紀錄。</p>`;
        }
    }
    
    async function initializeRentalHistoryPage() {
        if (!userProfile) return;
        const currentContainer = document.getElementById('rental-history-container');
        const pastContainer = document.getElementById('past-rentals-container');
        const toggleBtn = document.getElementById('toggle-past-rentals-btn');
        if (!currentContainer || !pastContainer || !toggleBtn) return;
        currentContainer.innerHTML = '<p>正在查詢您目前的租借...</p>';
        const renderRentals = (rentals, container, isPast = false) => {
            if (rentals.length === 0) {
                container.innerHTML = `<p>${isPast ? '沒有過往的租借紀錄。' : '您目前沒有租借中的遊戲。'}</p>`;
                return;
            }
            container.innerHTML = rentals.map(rental => {
                let statusHTML = '';
                if (rental.status === 'returned') {
                    statusHTML = `<div class="rental-status returned">已於 ${rental.return_date || ''} 歸還</div>`;
                } else if (typeof rental.overdue_days === 'number' && rental.overdue_days > 0) {
                    statusHTML = `<div class="rental-status overdue-text"><strong>已逾期 ${rental.overdue_days} 天</strong><br>累積逾期金額 ${rental.calculated_late_fee} 元</div>`;
                } else {
                    statusHTML = `<div class="rental-status rented">租借中</div>`;
                }
                return `
                    <div class="rental-card">
                        <img src="${rental.game_image_url || 'placeholder.jpg'}" class="rental-game-image">
                        <div class="rental-info">
                            <h3 class="rental-game-title">${rental.game_name}</h3>
                            <p>租借日期：${rental.rental_date}</p>
                            <p>應還日期：${rental.due_date}</p>
                            ${statusHTML}
                        </div>
                    </div>`;
            }).join('');
        };
        try {
            const currentResponse = await fetch(`/api/my-rental-history?userId=${userProfile.userId}&filter=current`);
            if (!currentResponse.ok) throw new Error('查詢租借紀錄失敗');
            const currentRentals = await currentResponse.json();
            renderRentals(currentRentals, currentContainer);
            toggleBtn.addEventListener('click', async () => {
                const isHidden = pastContainer.style.display === 'none';
                if (isHidden) {
                    pastContainer.innerHTML = '<p>正在查詢過往紀錄...</p>';
                    pastContainer.style.display = 'block';
                    toggleBtn.textContent = '隱藏過往紀錄';
                    try {
                        const pastResponse = await fetch(`/api/my-rental-history?userId=${userProfile.userId}&filter=past`);
                        if (!pastResponse.ok) throw new Error('查詢過往租借失敗');
                        const pastRentals = await pastResponse.json();
                        renderRentals(pastRentals, pastContainer, true);
                    } catch (error) {
                        pastContainer.innerHTML = `<p style="color: red;">${error.message}</p>`;
                    }
                } else {
                    pastContainer.style.display = 'none';
                    toggleBtn.textContent = '查看過往紀錄';
                }
            });
        } catch (error) {
            currentContainer.innerHTML = `<p style="color: red;">${error.message}</p>`;
        }
    }
    
    // --- 編輯個人資料頁 ---
    async function initializeEditProfilePage() {
        if (allGames.length === 0) {
            try {
                const res = await fetch('/api/get-boardgames');
                if (!res.ok) throw new Error('無法獲取遊戲資料');
                allGames = await res.json();
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
            const allStandardTags = [...new Set(allGames.flatMap(g => (g.tags || '').split(',')).map(t => t.trim()).filter(Boolean))];
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
                const response = await fetch('/api/update-user-profile', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(formData)
                });
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

    // --- 產品/服務頁 ---
    function difficultyToStars(difficulty) {
        const levels = { '簡單': 1, '普通': 2, '困難': 3, '專家': 4 };
        const level = levels[difficulty] || 2;
        const totalStars = 4;
        let stars = '';
        for (let i = 0; i < totalStars; i++) {
            stars += i < level ? '★' : '☆';
        }
        return stars;
    }

    function renderGameDetails(game) {
        const mainImage = appContent.querySelector('.details-image-main');
        const thumbnailsContainer = appContent.querySelector('.details-image-thumbnails');
        const images = [game.image_url, game.image_url_2, game.image_url_3].filter(Boolean);
        mainImage.src = images.length > 0 ? images[0] : 'placeholder.jpg';
        thumbnailsContainer.innerHTML = images.map((imgSrc, index) => `<img src="${imgSrc}" class="details-image-thumbnail ${index === 0 ? 'active' : ''}" data-src="${imgSrc}">`).join('');
        thumbnailsContainer.addEventListener('click', e => {
            if (e.target.matches('.details-image-thumbnail')) {
                mainImage.src = e.target.dataset.src;
                thumbnailsContainer.querySelector('.active')?.classList.remove('active');
                e.target.classList.add('active');
            }
        });
        appContent.querySelector('.details-title').textContent = game.name;
        appContent.querySelector('#game-players').textContent = `${game.min_players} - ${game.max_players} 人`;
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
        const hasSalePrice = Number(game.sale_price) > 0;
        const hasRentPrice = Number(game.rent_price) > 0;
        if (hasSalePrice) {
            priceHTML += `<div class="price-item"><p class="price-tag">參考售價</p><p class="price-value">$${game.sale_price}</p></div>`;
        }
        if (hasRentPrice) {
            priceHTML += `<div class="price-item"><p class="price-tag">租借費用 (三天)</p><p class="price-value">$${game.rent_price}</p></div>`;
        }
        if (priceHTML === '') {
            priceContent.innerHTML = `<p style="text-align:center;">價格資訊請洽店內公告</p>`;
        } else {
            priceContent.innerHTML = `<div class="price-grid">${priceHTML}</div>`;
        }
    }

    function renderGames() {
        const container = document.getElementById('game-list-container');
        if (!container) return;
        let filteredGames = allGames.filter(g => g.is_visible === 1);
        const keyword = activeFilters.keyword.toLowerCase().trim();
        if (keyword) {
            filteredGames = filteredGames.filter(g => g.name.toLowerCase().includes(keyword) || g.description.toLowerCase().includes(keyword));
        }
        if (activeFilters.tag) {
            filteredGames = filteredGames.filter(g => (g.tags || '').split(',').map(t => t.trim()).includes(activeFilters.tag));
        }
        if (filteredGames.length === 0) {
            container.innerHTML = '<p>找不到符合條件的遊戲。</p>';
            return;
        }
        container.innerHTML = filteredGames.map(game => `
            <div class="game-card" data-game-id="${game.game_id}">
                <img src="${game.image_url || 'placeholder.jpg'}" alt="${game.name}" class="game-image">
                <div class="game-info">
                    <h3 class="game-title">${game.name}</h3>
                    <p class="game-description">${game.description}</p>
                    <div class="game-details">
                        <span>👥 ${game.min_players}-${game.max_players} 人</span>
                        <span>⭐ 難度: ${game.difficulty}</span>
                    </div>
                    <div class="game-tags">
                        ${(game.tags || '').split(',').map(t => t.trim()).filter(Boolean).map(tag => `<span class="game-tag">${tag}</span>`).join('')}
                    </div>
                </div>
            </div>`).join('');
    }

    function populateFilters() {
        const filterContainer = document.getElementById('tag-filter-container');
        const primaryTagsContainer = document.getElementById('primary-tags');
        const secondaryTagsContainer = document.getElementById('secondary-tags');
        document.getElementById('more-tags-btn')?.remove();
        document.getElementById('clear-filters')?.remove();
        if (!filterContainer || !primaryTagsContainer || !secondaryTagsContainer) return;
        const primaryTagsList = ["家庭", "兒童", "派對", "陣營", "小品", "策略"];
        const allTags = [...new Set(allGames.flatMap(g => (g.tags || '').split(',')).map(t => t.trim()).filter(Boolean))];
        primaryTagsContainer.innerHTML = '';
        secondaryTagsContainer.innerHTML = '';
        allTags.forEach(tag => {
            const btn = document.createElement('button');
            btn.textContent = tag;
            btn.dataset.tag = tag;
            btn.className = 'filter-tag-btn';
            btn.addEventListener('click', () => {
                const currentActive = filterContainer.querySelector('.filter-tag-btn.active');
                if (currentActive) {
                    currentActive.classList.remove('active');
                }
                if (activeFilters.tag === tag) {
                    activeFilters.tag = null;
                } else {
                    activeFilters.tag = tag;
                    btn.classList.add('active');
                }
                renderGames();
            });
            if (primaryTagsList.includes(tag)) {
                primaryTagsContainer.appendChild(btn);
            } else {
                secondaryTagsContainer.appendChild(btn);
            }
        });
        const moreBtn = document.createElement('button');
        moreBtn.id = 'more-tags-btn';
        moreBtn.textContent = '更多標籤';
        const clearBtn = document.createElement('button');
        clearBtn.id = 'clear-filters';
        clearBtn.textContent = '清除所有篩選';
        filterContainer.appendChild(moreBtn);
        filterContainer.appendChild(clearBtn);
        if (secondaryTagsContainer.children.length > 0) {
            moreBtn.style.display = 'inline-block';
            moreBtn.addEventListener('click', () => {
                const isHidden = secondaryTagsContainer.style.display === 'none';
                secondaryTagsContainer.style.display = isHidden ? 'contents' : 'none';
                moreBtn.textContent = isHidden ? '收起標籤' : '更多標籤';
            });
        } else {
            moreBtn.style.display = 'none';
        }
        clearBtn.addEventListener('click', () => {
            activeFilters.keyword = '';
            activeFilters.tag = null;
            document.getElementById('keyword-search').value = '';
            document.querySelectorAll('#tag-filter-container button').forEach(b => b.classList.remove('active'));
            renderGames();
        });
    }

    async function initializeGamesPage() {
        if (allGames.length === 0) {
            try {
                const res = await fetch('/api/get-boardgames');
                if (!res.ok) throw new Error('API 請求失敗');
                allGames = await res.json();
            } catch (error) {
                console.error('初始化桌遊圖鑑失敗:', error);
                const container = document.getElementById('game-list-container');
                if (container) container.innerHTML = '<p style="color: red;">讀取桌遊資料失敗。</p>';
                return;
            }
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
            document.querySelectorAll('#tag-filter-container button').forEach(b => b.classList.remove('active'));
            renderGames();
        });
    }

    // --- 預約頁 ---
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
        if (bookingHistoryStack[bookingHistoryStack.length - 1] !== stepId) {
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

    async function initializeBookingPage() {
        bookingHistoryStack = [];
        showBookingStep('step-preference');
        document.getElementById('view-my-bookings-btn').addEventListener('click', () => {
            showPage('page-my-bookings');
        });
        try {
            const response = await fetch('/api/bookings-check?month-init=true');
            const data = await response.json();
            enabledDatesByAdmin = data.enabledDates || [];
        } catch (error) {
            console.error("獲取可預約日期失敗:", error);
            enabledDatesByAdmin = [];
        }
        const wizardContainer = document.getElementById('booking-wizard-container');
        if (wizardContainer) {
            wizardContainer.addEventListener('click', async (e) => {
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
        const datepickerContainer = appContent.querySelector("#booking-datepicker-container");
        if (datepickerContainer) {
            flatpickr(datepickerContainer, {
                inline: true,
                minDate: "today",
                dateFormat: "Y-m-d",
                locale: "zh_tw",
                enable: enabledDatesByAdmin,
                onChange: (selectedDates, dateStr) => {
                    bookingData.date = dateStr;
                    fetchAndRenderSlots(dateStr);
                },
                onClick: (selectedDates, dateStr, instance) => {
                    setTimeout(() => {
                        const clickedElement = instance.selectedDateElem;
                        if (clickedElement && clickedElement.classList.contains('flatpickr-disabled')) {
                            const slotsPlaceholder = document.getElementById('slots-placeholder');
                            const slotsContainer = document.getElementById('booking-slots-container');
                            if (slotsPlaceholder && slotsContainer) {
                                slotsPlaceholder.textContent = '此日期未開放預約';
                                slotsPlaceholder.style.display = 'block';
                                slotsContainer.innerHTML = '';
                            }
                        }
                    }, 10);
                }
            });
        }
        const userData = await fetchGameData();
        if (userData) {
            const nameInput = document.getElementById('contact-name');
            const phoneInput = document.getElementById('contact-phone');
            if (nameInput) nameInput.value = userData.real_name || '';
            if (phoneInput) phoneInput.value = userData.phone || '';
        }
    }

    async function fetchAndRenderSlots(date) {
        const slotsPlaceholder = document.getElementById('slots-placeholder');
        const slotsContainer = document.getElementById('booking-slots-container');
        slotsPlaceholder.textContent = '正在查詢當日空位...';
        slotsContainer.innerHTML = '';
        slotsPlaceholder.style.display = 'block';
        try {
            const response = await fetch(`/api/bookings-check?date=${date}`);
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
            <p><span>人數:</span><span>${bookingData.people} 人</span></p>`;
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
            await fetch('/api/send-message', {
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

    // --- 店家資訊頁 ---
    async function initializeInfoPage() {
        try {
            const response = await fetch('/api/get-store-info');
            if (!response.ok) throw new Error('無法獲取店家資訊');
            const info = await response.json();
            document.getElementById('store-address').textContent = info.address;
            document.getElementById('store-phone').textContent = info.phone;
            document.getElementById('store-hours').innerHTML = info.opening_hours.replace(/\n/g, '<br>');
            document.getElementById('store-description').innerHTML = info.description.replace(/\n/g, '<br>');
        } catch (error) {
            document.getElementById('store-info-container').innerHTML = `<p style="color:red;">${error.message}</p>`;
        }
    }

    // =================================================================
    // Tab Bar 主導航
    // =================================================================
    tabBar.addEventListener('click', (event) => {
        const button = event.target.closest('.tab-button');
        if (button) {
            const targetPageId = button.dataset.target;
            showPage(targetPageId);
        }
    });

    // 啟動 LIFF
    initializeLiff();
});