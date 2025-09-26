document.addEventListener('DOMContentLoaded', async () => {
    // --- 登入畫面相關元素 ---
    const loginContainer = document.getElementById('login-container');
    const adminPanel = document.getElementById('admin-panel');
    const logoutBtn = document.getElementById('logout-btn');
    // --- 登入邏輯 ---
    // 直接顯示後台面板並初始化
    if(loginContainer) loginContainer.style.display = 'none';
    if(adminPanel) adminPanel.style.display = 'block';
    
    // 初始化後台面板
    await initializeAdminPanel();

    // 登出邏輯 (保持不變)
    if (logoutBtn) {
        logoutBtn.addEventListener('click', async () => {
            await fetch('/api/admin/auth/logout');
            // 登出後導向到新的登入頁面
            window.location.href = '/admin-login.html';
        });
    }


async function initializeAdminPanel() {
    
    // --- 【模組名稱：全域變數與 DOM 宣告】 ---
    const mainNav = document.querySelector('.nav-tabs');
    const pages = document.querySelectorAll('.page');

    // 儀表板
    const dashboardGrid = document.getElementById('dashboard-grid');

    // 顧客管理
    const userListTbody = document.getElementById('user-list-tbody');
    const userSearchInput = document.getElementById('user-search-input');
    const editUserModal = document.getElementById('edit-user-modal');
    const editUserForm = document.getElementById('edit-user-form');
    const syncD1ToSheetBtn = document.getElementById('sync-d1-to-sheet-btn');
    const userDetailsModal = document.getElementById('user-details-modal'); 
    
    // 庫存管理
    const gameListTbody = document.getElementById('game-list-tbody');
    const gameSearchInput = document.getElementById('game-search-input');
    const editGameModal = document.getElementById('edit-game-modal');
    const editGameForm = document.getElementById('edit-game-form');
    const syncGamesBtn = document.getElementById('sync-games-btn');
    
    // 租借管理
    const rentalListTbody = document.getElementById('rental-list-tbody');
    const rentalStatusFilter = document.getElementById('rental-status-filter');
    const rentalSearchInput = document.getElementById('rental-search-input');
    const createRentalModal = document.getElementById('create-rental-modal');
    const createRentalForm = document.getElementById('create-rental-form');
    const editRentalModal = document.getElementById('edit-rental-modal');
    const editRentalForm = document.getElementById('edit-rental-form');
    const sortDueDateBtn = document.getElementById('sort-due-date');
    
    // 訂位管理
    const bookingListTbody = document.getElementById('booking-list-tbody');
    const manageBookingDatesBtn = document.getElementById('manage-booking-dates-btn');
    const bookingSettingsModal = document.getElementById('booking-settings-modal'); 
    const cancelBookingModal = document.getElementById('cancel-booking-modal');
    let bookingDatepicker = null; 
    let enabledDates = []; // <--- 變數改名
    
    // 經驗紀錄
    const expHistoryTbody = document.getElementById('exp-history-tbody');
    const expUserFilterInput = document.getElementById('exp-user-filter-input');

    // 情報管理
    const newsListTbody = document.getElementById('news-list-tbody');
    const addNewsBtn = document.getElementById('add-news-btn');
    const editNewsModal = document.getElementById('edit-news-modal');
    const editNewsForm = document.getElementById('edit-news-form');
    const modalNewsTitle = document.getElementById('modal-news-title');
    const deleteNewsBtn = document.getElementById('delete-news-btn');
    
    // 訊息草稿
    const draftListTbody = document.getElementById('draft-list-tbody');
    const addDraftBtn = document.getElementById('add-draft-btn');
    const editDraftModal = document.getElementById('edit-draft-modal');
    const editDraftForm = document.getElementById('edit-draft-form');
    const modalDraftTitle = document.getElementById('modal-draft-title');

    // 店家資訊
    const storeInfoForm = document.getElementById('store-info-form');

    // 掃碼加點
    const qrReaderElement = document.getElementById('qr-reader');
    const scanResultSection = document.getElementById('scan-result');
    const userIdDisplay = document.getElementById('user-id-display');
    const reasonSelect = document.getElementById('reason-select');
    const customReasonInput = document.getElementById('custom-reason-input');
    const expInput = document.getElementById('exp-input');
    const submitExpBtn = document.getElementById('submit-exp-btn');
    const rescanBtn = document.getElementById('rescan-btn');
    const scanStatusMessage = document.querySelector('#scan-status-container');


    // --- 全域狀態變數 ---
    let allUsers = [], allGames = [], allBookings = [], allNews = [], allExpHistory = [], allRentals = [], allDrafts = [];
    let classPerks = {};
    let html5QrCode = null;
    let currentEditingNewsId = null;
    let currentEditingDraftId = null;
    let selectedRentalUser = null;
    let selectedRentalGames = []; 
    let dueDateSortOrder = 'asc'; 
    let sortableGames = null; // 新增：用於拖曳排序

    // --- 【模組名稱：手動全量同步】 ---
    const fullSyncRentalsBtn = document.getElementById('full-sync-rentals-btn');
    if (fullSyncRentalsBtn) {
        fullSyncRentalsBtn.addEventListener('click', async () => {
            if (!confirm('確定要用目前資料庫 (D1) 的「所有」租借紀錄，去完整覆蓋 Google Sheet 上的資料嗎？\n\n這個操作應用於修正歷史資料差異，執行需要一點時間。')) return;

            try {
                fullSyncRentalsBtn.textContent = '同步中...';
                fullSyncRentalsBtn.disabled = true;
                // 我們呼叫您之前就有的 sync-rentals API
                const response = await fetch('/api/admin/sync-rentals', { method: 'POST' });
                const result = await response.json();
                if (!response.ok) { throw new Error(result.details || '同步失敗'); }
                alert(result.message || '同步成功！');
            } catch (error) {
                alert(`錯誤：${error.message}`);
            } finally {
                fullSyncRentalsBtn.textContent = '手動完整同步至 Sheet';
                fullSyncRentalsBtn.disabled = false;
            }
        });
    }

    //--- 【模組名稱：手動同步訂位紀錄】 ---
    const fullSyncBookingsBtn = document.getElementById('full-sync-bookings-btn');
    if (fullSyncBookingsBtn) {
        fullSyncBookingsBtn.addEventListener('click', async () => {
            if (!confirm('確定要用目前資料庫 (D1) 的「所有」訂位紀錄，去完整覆蓋 Google Sheet 上的「預約紀錄」工作表嗎？')) return;

            try {
                fullSyncBookingsBtn.textContent = '同步中...';
                fullSyncBookingsBtn.disabled = true;
                const response = await fetch('/api/admin/sync-bookings-to-sheet', { method: 'POST' });
                const result = await response.json();
                if (!response.ok) { throw new Error(result.details || '同步失敗'); }
                alert(result.message || '同步成功！');
            } catch (error) {
                alert(`錯誤：${error.message}`);
            } finally {
                fullSyncBookingsBtn.textContent = '手動同步至 Sheet';
                fullSyncBookingsBtn.disabled = false;
            }
        });
    }

        // 關閉事件監聽(放在任意位置)
        if (editRentalModal) {
        editRentalModal.querySelector('.modal-close').addEventListener('click', () => editRentalModal.style.display = 'none');
        editRentalModal.querySelector('.btn-cancel').addEventListener('click', () => editRentalModal.style.display = 'none');
        }
        if (userDetailsModal) {
        userDetailsModal.querySelector('.modal-close').addEventListener('click', () => userDetailsModal.style.display = 'none');
        }    

    // ---- 頁面切換邏輯 ----
    function showPage(pageId) {
        if (html5QrCode && html5QrCode.isScanning) {
            html5QrCode.stop().catch(err => console.error("停止掃描器失敗", err));
        }
        pages.forEach(page => page.classList.remove('active'));
        const pageElement = document.getElementById(`page-${pageId}`);
        if(pageElement) pageElement.classList.add('active');

        document.querySelectorAll('.nav-tabs a').forEach(link => {
            link.classList.remove('active');
            if (link.getAttribute('href') === `#${pageId}`) link.classList.add('active');
        });

        const pageLoader = {
            'dashboard': fetchDashboardStats,
            'users': fetchAllUsers,
            'inventory': fetchAllGames,
            'bookings': () => fetchAllBookings('today'),
            'exp-history': fetchAllExpHistory,
            'scan': startScanner,
            'news': fetchAllNews,
            'store-info': fetchStoreInfo,
            'rentals': fetchAllRentals,
            'drafts': fetchAllDrafts
        };
        
        if (pageLoader[pageId]) {
            pageLoader[pageId]();
        }
    }

    mainNav.addEventListener('click', (event) => {
        if (event.target.tagName === 'A') {
            event.preventDefault();
            const pageId = event.target.getAttribute('href').substring(1);
            showPage(pageId);
        }
    });

    // =================================================================
    // 儀表板模組
    // =================================================================
    async function fetchDashboardStats() {
        try {
            const response = await fetch('/api/admin/dashboard-stats');
            if (!response.ok) throw new Error('無法獲取儀表板數據');
            const stats = await response.json();
            
            document.getElementById('stat-today-guests').textContent = stats.today_total_guests || 0;
            document.getElementById('stat-outstanding-rentals').textContent = stats.outstanding_rentals_count || 0;
            document.getElementById('stat-due-today').textContent = stats.due_today_rentals_count || 0;

            // ** 需求 4 修改：綁定點擊事件 **
            if(dashboardGrid) {
                dashboardGrid.addEventListener('click', (e) => {
                    const card = e.target.closest('.stat-card');
                    if (!card) return;

                    const target = card.dataset.target;
                    if (target === 'bookings') {
                        showPage('bookings');
                        // 自動點擊 '今日預約' 篩選器
                        document.querySelector('#booking-status-filter button[data-filter="today"]').click();
                    } else if (target === 'rentals-rented') {
                        showPage('rentals');
                        // 自動點擊 '租借中' 篩選器
                        document.querySelector('#rental-status-filter button[data-filter="rented"]').click();
                    } else if (target === 'rentals-due-today') {
                        showPage('rentals');
                        // 自動點擊 '今日到期' 篩選器
                        document.querySelector('#rental-status-filter button[data-filter="due_today"]').click();
                    }
                });
            }

        } catch (error) {
            console.error('獲取儀表板數據失敗:', error);
            if(dashboardGrid) dashboardGrid.innerHTML = `<p style="color:red;">讀取數據失敗</p>`;
        }
    }
    // =================================================================
    //     // 【安全修正】使用 DOM API 和 textContent 重寫 renderUserList 函式，防止 XSS 攻擊
    function renderUserList(users) {
        if (!userListTbody) return;
        userListTbody.innerHTML = ''; // 清空現有內容

        users.forEach(user => {
            const row = userListTbody.insertRow(); // 建立 <tr> 元素
            row.dataset.userId = user.user_id;
            row.style.cursor = 'pointer';

            // 處理顯示名稱
            const displayName = user.nickname ? `${user.line_display_name} (${user.nickname})` : user.line_display_name;

            // 建立每個儲存格 <td>
            const cellName = row.insertCell();
            const cellLevel = row.insertCell();
            const cellExp = row.insertCell();
            const cellClass = row.insertCell();
            const cellTag = row.insertCell();
            const cellActions = row.insertCell();

            // --- 填充「名稱/ID」儲存格 (安全方式) ---
            cellName.className = 'compound-cell';
            cellName.style.textAlign = 'left';
            const mainInfoDiv = document.createElement('div');
            mainInfoDiv.className = 'main-info';
            mainInfoDiv.textContent = displayName || 'N/A'; // 使用 textContent
            const subInfoDiv = document.createElement('div');
            subInfoDiv.className = 'sub-info';
            subInfoDiv.textContent = user.user_id; // 使用 textContent
            cellName.appendChild(mainInfoDiv);
            cellName.appendChild(subInfoDiv);

            // --- 填充其他儲存格 (安全方式) ---
            cellLevel.textContent = user.level;
            cellExp.textContent = `${user.current_exp} / 10`;
            cellClass.textContent = user.class || '無';
            
            const tagSpan = document.createElement('span');
            tagSpan.className = 'tag-display';
            tagSpan.textContent = user.tag || '無';
            cellTag.appendChild(tagSpan);

            cellActions.className = 'actions-cell';
            const editButton = document.createElement('button');
            editButton.className = 'action-btn btn-edit';
            editButton.textContent = '編輯';
            cellActions.appendChild(editButton);
        });
    }

    async function fetchAllUsers() {
        // (此函式邏輯不變)
        if (allUsers.length > 0) return;
        try {
            const response = await fetch('/api/get-users');
            if (!response.ok) throw new Error('無法獲取使用者列表');
            allUsers = await response.json();
            renderUserList(allUsers);
        } catch (error) { console.error('獲取使用者列表失敗:', error); }
    }
    
    if (syncD1ToSheetBtn) {
        syncD1ToSheetBtn.addEventListener('click', async () => {
             if (!confirm('確定要用目前資料庫 (D1) 的所有使用者資料，完整覆蓋 Google Sheet 上的「使用者列表」嗎？\n\n這個操作通常用於手動備份。')) return;
            try {
                syncD1ToSheetBtn.textContent = '同步中...';
                syncD1ToSheetBtn.disabled = true;
                const response = await fetch('/api/sync-d1-to-sheet', { method: 'POST' });
                const result = await response.json();
                if (!response.ok) { throw new Error(result.details || '同步失敗'); }
                alert(result.message || '同步成功！');
            } catch (error) {
                alert(`錯誤：${error.message}`);
            } finally {
                syncD1ToSheetBtn.textContent = '同步至 Google Sheet';
                syncD1ToSheetBtn.disabled = false;
            }
        });
    }

    if(userSearchInput){
        userSearchInput.addEventListener('input', () => {
            const searchTerm = userSearchInput.value.toLowerCase().trim();
            const filteredUsers = searchTerm 
                ? allUsers.filter(user => 
                    (user.line_display_name || '').toLowerCase().includes(searchTerm) ||
                    (user.nickname || '').toLowerCase().includes(searchTerm)
                  ) 
                : allUsers;
            renderUserList(filteredUsers);
        });
    }

    function openEditUserModal(userId) {
        const user = allUsers.find(u => u.user_id === userId);
        if (!user) return;
        document.getElementById('modal-user-title').textContent = `編輯：${user.line_display_name}`;
        document.getElementById('edit-user-id').value = user.user_id;
        document.getElementById('edit-level-input').value = user.level;
        document.getElementById('edit-exp-input').value = user.current_exp;
        const classSelect = document.getElementById('edit-class-select');
        const otherClassInput = document.getElementById('edit-class-other-input');
        const perkSelect = document.getElementById('edit-perk-select');
        const otherPerkInput = document.getElementById('edit-perk-other-input');
        const tagSelect = document.getElementById('edit-tag-select');
        const otherTagInput = document.getElementById('edit-tag-other-input');
        const notesTextarea = document.getElementById('edit-notes-textarea'); // 【新增這一行】
    // 【修正點 1】先清空兩個下拉選單，避免重複疊加
    classSelect.innerHTML = '';
    perkSelect.innerHTML = '';

    // 【修正點 2】建立一個不重複的福利列表，用於判斷
    const standardPerks = [...new Set(Object.values(classPerks))];

    // --- 填充「職業」下拉選單 ---
    for (const className in classPerks) {
        const option = document.createElement('option');
        option.value = className;
        option.textContent = className;
        classSelect.appendChild(option);
    }
    classSelect.appendChild(new Option('其他 (自訂)', 'other'));

    // --- 填充「福利」下拉選單 ---
    standardPerks.forEach(perkDescription => {
        const option = document.createElement('option');
        option.value = perkDescription;
        option.textContent = perkDescription;
        perkSelect.appendChild(option);
    });
    perkSelect.appendChild(new Option('其他 (自訂)', 'other'));


    // --- 設定職業下拉選單的預設值 ---
    if (classPerks[user.class]) {
        classSelect.value = user.class;
        otherClassInput.style.display = 'none';
    } else {
        classSelect.value = 'other';
        otherClassInput.style.display = 'block';
        otherClassInput.value = user.class || '';
    }
    
    // --- 設定福利下拉選單的預設值 ---
    if (standardPerks.includes(user.perk)) {
        perkSelect.value = user.perk;
        otherPerkInput.style.display = 'none';
    } else {
        perkSelect.value = 'other';
        otherPerkInput.style.display = 'block';
        otherPerkInput.value = user.perk || '';
    }

    // --- 設定標籤和其他欄位的預設值 (保持不變) ---
    const standardTags = ["", "會員", "員工", "黑名單", "特殊"];
    if (user.tag && !standardTags.includes(user.tag)) {
        tagSelect.value = 'other';
        otherTagInput.style.display = 'block';
        otherTagInput.value = user.tag;
    } else {
        tagSelect.value = user.tag || '';
        otherTagInput.style.display = 'none';
        otherTagInput.value = '';
    }
    notesTextarea.value = user.notes || '';
    
    editUserModal.style.display = 'flex';
}

    if(document.getElementById('edit-class-select')) {
        document.getElementById('edit-class-select').addEventListener('change', (e) => {
            const otherClassInput = document.getElementById('edit-class-other-input');
            const perkSelect = document.getElementById('edit-perk-select');
            const otherPerkInput = document.getElementById('edit-perk-other-input');
            if (e.target.value === 'other') {
                otherClassInput.style.display = 'block';
                perkSelect.value = 'other';
                otherPerkInput.style.display = 'block';
            } else {
                otherClassInput.style.display = 'none';
                perkSelect.value = classPerks[e.target.value];
                otherPerkInput.style.display = 'none';
            }
        });
    }
    
    if(document.getElementById('edit-perk-select')){
        document.getElementById('edit-perk-select').addEventListener('change', (e) => {
            document.getElementById('edit-perk-other-input').style.display = (e.target.value === 'other') ? 'block' : 'none';
        });
    }

    if(document.getElementById('edit-tag-select')){
        document.getElementById('edit-tag-select').addEventListener('change', (e) => {
            document.getElementById('edit-tag-other-input').style.display = (e.target.value === 'other') ? 'block' : 'none';
        });
    }

    if(editUserModal){
        editUserModal.querySelector('.modal-close').addEventListener('click', () => editUserModal.style.display = 'none');
        editUserModal.querySelector('.btn-cancel').addEventListener('click', () => editUserModal.style.display = 'none');
    }

    if(editUserForm) {
        editUserForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const userId = document.getElementById('edit-user-id').value;
            let newClass = document.getElementById('edit-class-select').value;
            if (newClass === 'other') newClass = document.getElementById('edit-class-other-input').value.trim();
            let newPerk = document.getElementById('edit-perk-select').value;
            if (newPerk === 'other') newPerk = document.getElementById('edit-perk-other-input').value.trim();
            let newTag = document.getElementById('edit-tag-select').value;
            if (newTag === 'other') newTag = document.getElementById('edit-tag-other-input').value.trim();
            const updatedData = {
                userId: userId,
                level: document.getElementById('edit-level-input').value,
                current_exp: document.getElementById('edit-exp-input').value,
                tag: newTag,
                user_class: newClass,
                perk: newPerk,
                notes: document.getElementById('edit-notes-textarea').value
            };
            try {
                const response = await fetch('/api/update-user-details', {
                    method: 'POST', headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(updatedData)
                });
                const result = await response.json();
                if (!response.ok) throw new Error(result.error || '更新失敗');
                const user = allUsers.find(u => u.user_id === userId);
                if (user) {
                    user.level = updatedData.level;
                    user.current_exp = updatedData.current_exp;
                    user.tag = updatedData.tag;
                    user.class = updatedData.user_class;
                    user.perk = updatedData.perk;
                    user.notes = updatedData.notes; // 【新增這一行】
                }
                renderUserList(allUsers);
                editUserModal.style.display = 'none';
            } catch (error) { alert(`錯誤：${error.message}`); }
        });
    }

    if(userListTbody) {
        userListTbody.addEventListener('click', async (event) => {
            const target = event.target;
            const row = target.closest('tr');
            if (!row || !row.dataset.userId) return;

            const userId = row.dataset.userId;
            
            if (target.classList.contains('btn-edit')) {
                openEditUserModal(userId);
            } else {
                openUserDetailsModal(userId);
            }
        });
    }
    
async function openUserDetailsModal(userId) {
        console.log("CRM 檢查點 A: 已進入 openUserDetailsModal 函式，收到的 userId 是:", userId);

        if (!userId) {
            console.error("CRM 流程中斷：傳入的 userId 是空的！");
            return;
        }
        if (!userDetailsModal) {
            console.error("CRM 流程中斷：在 JS 檔案頂部找不到 userDetailsModal 變數！請檢查 HTML 的 id 是否為 'user-details-modal'。");
            return;
        }
        console.log("CRM 檢查點 B: userId 和 userDetailsModal 變數都存在。");

        const contentContainer = userDetailsModal.querySelector('#user-details-content');
        if (!contentContainer) {
            console.error("CRM 流程中斷：在彈出視窗中找不到 id 為 'user-details-content' 的元素！");
            return;
        }
        console.log("CRM 檢查點 C: 成功找到 contentContainer，準備顯示 Modal。");

        contentContainer.innerHTML = '<p>讀取中...</p>';
        userDetailsModal.style.display = 'flex';
        console.log("CRM 檢查點 D: 已將 Modal 的 display 設為 'flex'，準備呼叫後端 API...");

        try {
            const response = await fetch(`/api/admin/user-details?userId=${userId}`);
            console.log("CRM 檢查點 E: 後端 API 回應狀態碼:", response.status);

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`API 請求失敗: ${errorText}`);
            }
            const data = await response.json();
            renderUserDetails(data); // <-- 呼叫下面重寫過的安全版本
        } catch (error) {
            console.error("CRM 執行錯誤:", error);
            contentContainer.innerHTML = `<p style="color:red;">載入資料時發生錯誤：${error.message}</p>`;
        }
    }

// public/admin-login.js

function renderUserDetails(data) {
    const { profile, bookings, rentals, exp_history } = data;
    const contentContainer = userDetailsModal.querySelector('#user-details-content');
    if (!contentContainer) return;

    const displayName = profile.nickname || profile.line_display_name;
    document.getElementById('user-details-title').textContent = displayName;

    contentContainer.innerHTML = '';

    const creationDate = new Date(profile.created_at).toLocaleDateString();
    const avatarSrc = `/api/admin/get-avatar?userId=${profile.user_id}`;

    const grid = document.createElement('div');
    grid.className = 'details-grid';

    const summary = document.createElement('div');
    summary.className = 'profile-summary';

    const details = document.createElement('div');
    details.className = 'profile-details';

    const messageSender = document.createElement('div');
    messageSender.className = 'message-sender';
    
    // 填充左側的個人資料 (Summary)
    const avatarImg = document.createElement('img');
    avatarImg.src = avatarSrc;
    avatarImg.alt = "Profile Picture";
    summary.appendChild(avatarImg);

    const h4 = document.createElement('h4');
    h4.textContent = displayName;
    summary.appendChild(h4);

    function createProfileLine(label, value) {
        const p = document.createElement('p');
        const strong = document.createElement('strong');
        strong.textContent = `${label}: `;
        p.appendChild(strong);
        p.append(document.createTextNode(value || '未設定'));
        return p;
    }

    summary.appendChild(createProfileLine('姓名', profile.real_name));
    summary.appendChild(createProfileLine('電話', profile.phone));
    summary.appendChild(createProfileLine('Email', profile.email));
    summary.appendChild(createProfileLine('偏好遊戲', profile.preferred_games));
    summary.appendChild(createProfileLine('建檔日期', creationDate));
    summary.appendChild(document.createElement('hr'));
    summary.appendChild(createProfileLine('等級', `${profile.level} (${profile.current_exp}/10 EXP)`));
    summary.appendChild(createProfileLine('職業', profile.class));
    summary.appendChild(createProfileLine('福利', profile.perk));
    summary.appendChild(createProfileLine('標籤', profile.tag));

    // 依序建立並填充右側的詳細資訊 (Details)
    if (profile.notes) {
        const notesSection = document.createElement('div');
        notesSection.className = 'crm-notes-section'; 
        // 【修改點】在此處加入 max-height 和 overflow-y
        notesSection.style.cssText = 'margin-bottom: 1rem; padding: 0.8rem; background-color: #fffbe6; border-radius: 6px; border: 1px solid #ffe58f; max-height: 5em; overflow-y: auto;';
        
        const notesTitle = document.createElement('h4');
        notesTitle.textContent = '顧客備註';
        notesTitle.style.marginTop = 0;
        
        const notesContent = document.createElement('p');
        notesContent.style.whiteSpace = 'pre-wrap';
        notesContent.style.margin = 0;
        notesContent.textContent = profile.notes;

        notesSection.appendChild(notesTitle);
        notesSection.appendChild(notesContent);
        
        details.appendChild(notesSection);
    }

    const tabsContainer = document.createElement('div');
    tabsContainer.className = 'details-tabs';
    tabsContainer.innerHTML = `
        <button class="details-tab active" data-target="tab-rentals">租借紀錄</button>
        <button class="details-tab" data-target="tab-bookings">預約紀錄</button>
        <button class="details-tab" data-target="tab-exp">經驗值紀錄</button>
    `;
    details.appendChild(tabsContainer);

    const tabContents = document.createElement('div');
    const rentalTab = document.createElement('div');
    rentalTab.id = 'tab-rentals';
    rentalTab.className = 'details-tab-content active';
    rentalTab.appendChild(renderHistoryTable(rentals, ['rental_date', 'game_name', 'status'], { rental_date: '租借日', game_name: '遊戲', status: '狀態' }));
    
    const bookingTab = document.createElement('div');
    bookingTab.id = 'tab-bookings';
    bookingTab.className = 'details-tab-content';
    bookingTab.appendChild(renderHistoryTable(bookings, ['booking_date', 'num_of_people', 'status'], { booking_date: '預約日', num_of_people: '人數', status: '狀態' }));
    
    const expTab = document.createElement('div');
    expTab.id = 'tab-exp';
    expTab.className = 'details-tab-content';
    expTab.appendChild(renderHistoryTable(exp_history, ['created_at', 'reason', 'exp_added'], { created_at: '日期', reason: '原因', exp_added: '經驗' }));

    tabContents.appendChild(rentalTab);
    tabContents.appendChild(bookingTab);
    tabContents.appendChild(expTab);
    details.appendChild(tabContents);

    // 填充訊息發送區
    messageSender.innerHTML = `
        <h4>發送 LINE 訊息</h4>
        <div class="form-group">
            <label for="message-draft-select">選擇訊息草稿</label>
            <select id="message-draft-select"><option value="">-- 手動輸入或選擇草稿 --</option></select>
        </div>
        <div class="form-group">
            <label for="direct-message-content">訊息內容</label>
            <textarea id="direct-message-content" rows="4"></textarea>
        </div>
        <div class="form-actions">
            <button id="send-direct-message-btn" class="action-btn btn-save" data-userid="${profile.user_id}">確認發送</button>
        </div>
    `;

    // 將所有主要區塊組裝到頁面上
    grid.appendChild(summary);
    grid.appendChild(details);
    contentContainer.appendChild(grid);
    contentContainer.appendChild(messageSender);

    // 重新為新的頁籤按鈕綁定點擊事件
    tabsContainer.addEventListener('click', e => {
        if (e.target.tagName === 'BUTTON') {
            tabsContainer.querySelector('.active')?.classList.remove('active');
            e.target.classList.add('active');
            
            tabContents.querySelector('.details-tab-content.active')?.classList.remove('active');
            tabContents.querySelector(`#${e.target.dataset.target}`)?.classList.add('active');
        }
    });

    // 載入訊息草稿
    loadAndBindMessageDrafts(profile.user_id);
}


    // 【安全修正】讓 renderHistoryTable 回傳一個 DOM 片段 (DocumentFragment) 而不是 HTML 字串
    function renderHistoryTable(items, columns, headers) {
        const fragment = document.createDocumentFragment();
        if (!items || items.length === 0) {
            const p = document.createElement('p');
            p.textContent = '無相關紀錄';
            fragment.appendChild(p);
            return fragment;
        }
        
        const table = document.createElement('table');
        const thead = table.createTHead();
        const tbody = table.createTBody();
        const headRow = thead.insertRow();
        
        Object.values(headers).forEach(hText => {
            const th = document.createElement('th');
            th.textContent = hText;
            headRow.appendChild(th);
        });

        items.forEach(item => {
            const row = tbody.insertRow();
            columns.forEach(col => {
                const cell = row.insertCell();
                let value = item[col];
                
                if (col === 'created_at' || col === 'rental_date' || col === 'booking_date') {
                    value = new Date(value).toLocaleDateString();
                }
                
                // 處理狀態時，因為包含 HTML，所以要特別處理
                if (col === 'status') {
                    switch(value) {
                        case 'confirmed': cell.textContent = '預約成功'; break;
                        case 'checked-in': cell.textContent = '已報到'; break;
                        case 'cancelled': cell.textContent = '已取消'; break;
                        case 'rented': cell.textContent = '租借中'; break;
                        case 'returned': cell.textContent = '已歸還'; break;
                        case 'overdue': 
                            // 只有這個情況是安全的，因為 HTML 是我們自己寫死的，不是來自使用者輸入
                            cell.innerHTML = '<span style="color:var(--danger-color); font-weight:bold;">逾期</span>'; 
                            break;
                        default: cell.textContent = value;
                    }
                } else {
                    cell.textContent = value; // 其他所有情況都用 textContent
                }
            });
        });
        
        fragment.appendChild(table);
        return fragment;
    }

    // =================================================================
    // 訊息草稿模組
    // =================================================================
    async function fetchAllDrafts() {
        if (allDrafts.length > 0) {
            renderDraftList(allDrafts);
            return;
        }
        try {
            const response = await fetch('/api/admin/message-drafts');
            if (!response.ok) throw new Error('無法獲取訊息草稿');
            allDrafts = await response.json();
            renderDraftList(allDrafts);
        } catch (error) {
            console.error('獲取訊息草稿失敗:', error);
            if(draftListTbody) draftListTbody.innerHTML = '<tr><td colspan="3">讀取失敗</td></tr>';
        }
    }

    function renderDraftList(drafts) {
        if (!draftListTbody) return;
        draftListTbody.innerHTML = '';
        drafts.forEach(draft => {
            const row = draftListTbody.insertRow();
            const cellTitle = row.insertCell();
            const cellContent = row.insertCell();
            const cellActions = row.insertCell();
            
            cellTitle.textContent = draft.title;
            cellContent.textContent = draft.content.substring(0, 50) + '...';
            cellActions.className = 'actions-cell';
            
            const editBtn = document.createElement('button');
            editBtn.className = 'action-btn btn-edit';
            editBtn.dataset.draftid = draft.draft_id;
            editBtn.textContent = '編輯';
            
            const deleteBtn = document.createElement('button');
            deleteBtn.className = 'action-btn btn-delete-draft';
            deleteBtn.dataset.draftid = draft.draft_id;
            deleteBtn.style.backgroundColor = 'var(--danger-color)';
            deleteBtn.textContent = '刪除';
            
            cellActions.appendChild(editBtn);
            cellActions.appendChild(deleteBtn);
        });
    }

    function openEditDraftModal(draft = null) {
        if (!editDraftForm) return;
        editDraftForm.reset();
        currentEditingDraftId = draft ? draft.draft_id : null;
        if (modalDraftTitle) modalDraftTitle.textContent = draft ? '編輯訊息草稿' : '新增訊息草稿';

        if (draft) {
            document.getElementById('edit-draft-id').value = draft.draft_id;
            document.getElementById('edit-draft-title').value = draft.title;
            document.getElementById('edit-draft-content').value = draft.content;
        }
        
        if (editDraftModal) editDraftModal.style.display = 'flex';
    }

    if (addDraftBtn) {
        addDraftBtn.addEventListener('click', () => openEditDraftModal());
    }
    if (editDraftModal) {
        editDraftModal.querySelector('.modal-close').addEventListener('click', () => editDraftModal.style.display = 'none');
        editDraftModal.querySelector('.btn-cancel').addEventListener('click', () => editDraftModal.style.display = 'none');
    }

    if (editDraftForm) {
        editDraftForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const draftData = {
                draft_id: currentEditingDraftId,
                title: document.getElementById('edit-draft-title').value,
                content: document.getElementById('edit-draft-content').value,
            };

            const isUpdating = !!currentEditingDraftId;
            const url = '/api/admin/message-drafts';
            const method = isUpdating ? 'PUT' : 'POST';

            try {
                const response = await fetch(url, {
                    method: method,
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(draftData)
                });
                if (!response.ok) {
                    const error = await response.json();
                    throw new Error(error.error || '儲存失敗');
                }
                alert('草稿儲存成功！');
                editDraftModal.style.display = 'none';
                allDrafts = [];
                await fetchAllDrafts();
            } catch (error) {
                alert(`錯誤： ${error.message}`);
            }
        });
    }

    if (draftListTbody) {
        draftListTbody.addEventListener('click', async (e) => {
            const target = e.target;
            const draftId = target.dataset.draftid;
            if (!draftId) return;

            if (target.classList.contains('btn-edit')) {
                const draft = allDrafts.find(d => d.draft_id == draftId);
                openEditDraftModal(draft);
            } else if (target.classList.contains('btn-delete-draft')) {
                if (confirm('確定要刪除這則草稿嗎？')) {
                    try {
                        const response = await fetch('/api/admin/message-drafts', {
                            method: 'DELETE',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ draft_id: Number(draftId) })
                        });
                        if (!response.ok) throw new Error('刪除失敗');
                        alert('刪除成功！');
                        allDrafts = allDrafts.filter(d => d.draft_id != draftId);
                        renderDraftList(allDrafts);
                    } catch (error) {
                        alert(`錯誤：${error.message}`);
                    }
                }
            }
        });
    }

    async function loadAndBindMessageDrafts(userId) {
        const select = document.getElementById('message-draft-select');
        const content = document.getElementById('direct-message-content');
        const sendBtn = document.getElementById('send-direct-message-btn');
        if (!select || !content || !sendBtn) return;

        await fetchAllDrafts();
        select.innerHTML = '<option value="">-- 手動輸入或選擇草稿 --</option>';
        allDrafts.forEach(draft => {
            const option = document.createElement('option');
            option.value = draft.content;
            option.textContent = draft.title;
            select.appendChild(option);
        });

        select.onchange = () => { content.value = select.value; };

        sendBtn.onclick = async () => {
            const message = content.value.trim();
            if (!message) { alert('訊息內容不可為空！'); return; }
            if (!confirm(`確定要發送以下訊息給該顧客嗎？\n\n${message}`)) return;
            
            sendBtn.textContent = '傳送中...';
            sendBtn.disabled = true;
            try {
                const response = await fetch('/api/send-message', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ userId, message })
                });
                if (!response.ok) {
                    const err = await response.json();
                    throw new Error(err.error || '傳送失敗');
                }
                alert('訊息傳送成功！');
                content.value = '';
            } catch (error) {
                alert(`傳送失敗：${error.message}`);
            } finally {
                sendBtn.textContent = '確認發送';
                sendBtn.disabled = false;
            }
        };
    }


// =================================================================
// 庫存管理模組
// =================================================================
function applyGameFiltersAndRender() {
    if (!allGames) return;

    const searchTerm = gameSearchInput.value.toLowerCase().trim();
    let filteredGames = searchTerm
        ? allGames.filter(game => (game.name || '').toLowerCase().includes(searchTerm))
        : [...allGames];

    const stockFilterEl = document.querySelector('#inventory-stock-filter .active');
    if (stockFilterEl) {
        const stockFilter = stockFilterEl.dataset.filter;
        if (stockFilter === 'in_stock') {
            filteredGames = filteredGames.filter(game => Number(game.for_rent_stock) > 0);
        } else if (stockFilter === 'out_of_stock') {
            filteredGames = filteredGames.filter(game => Number(game.for_rent_stock) <= 0);
        }
    }

    const visibilityFilterEl = document.querySelector('#inventory-visibility-filter .active');
    if(visibilityFilterEl) {
        const visibilityFilter = visibilityFilterEl.dataset.filter;
        if (visibilityFilter === 'visible') {
            filteredGames = filteredGames.filter(game => game.is_visible === 1);
        } else if (visibilityFilter === 'hidden') {
            filteredGames = filteredGames.filter(game => game.is_visible !== 1);
        }
    }
    
    renderGameList(filteredGames);
}

    // 【安全修正】重寫 renderGameList
    function renderGameList(games) {
        if (!gameListTbody) return;
        gameListTbody.innerHTML = '';
        games.forEach(game => {
            const row = gameListTbody.insertRow();
            row.className = 'draggable-row';
            row.dataset.gameId = game.game_id;
            
            const isVisible = game.is_visible === 1;
            
            const cellOrder = row.insertCell();
            const cellGame = row.insertCell();
            const cellTotalStock = row.insertCell();
            const cellRentStock = row.insertCell();
            const cellPrice = row.insertCell();
            const cellVisible = row.insertCell();
            const cellActions = row.insertCell();

            // 順序欄
            cellOrder.className = 'drag-handle-cell';
            const handleSpan = document.createElement('span');
            handleSpan.className = 'drag-handle';
            handleSpan.textContent = '⠿';
            cellOrder.appendChild(handleSpan);
            cellOrder.append(document.createTextNode(game.display_order || 'N/A'));

            // 遊戲欄
            cellGame.className = 'compound-cell';
            cellGame.style.textAlign = 'left';
            const nameDiv = document.createElement('div');
            nameDiv.className = 'main-info';
            nameDiv.textContent = game.name;
            const idDiv = document.createElement('div');
            idDiv.className = 'sub-info';
            idDiv.textContent = `ID: ${game.game_id}`;
            const tagsDiv = document.createElement('div');
            tagsDiv.className = 'sub-info';
            tagsDiv.style.marginTop = '5px';
            (game.tags || '').split(',').map(t => t.trim()).filter(Boolean).forEach(tag => {
                const tagSpan = document.createElement('span');
                tagSpan.style.cssText = 'background:#eee; padding: 2px 6px; border-radius: 4px; font-size: 0.75rem; margin-right: 4px;';
                tagSpan.textContent = tag;
                tagsDiv.appendChild(tagSpan);
            });
            cellGame.appendChild(nameDiv);
            cellGame.appendChild(idDiv);
            cellGame.appendChild(tagsDiv);

            // 其他欄
            cellTotalStock.textContent = game.total_stock;
            cellRentStock.textContent = game.for_rent_stock;
            
            cellPrice.className = 'compound-cell';
            const saleDiv = document.createElement('div');
            saleDiv.className = 'main-info';
            saleDiv.textContent = `$${game.sale_price}`;
            const rentDiv = document.createElement('div');
            rentDiv.className = 'sub-info';
            rentDiv.textContent = `租金: $${game.rent_price}`;
            cellPrice.appendChild(saleDiv);
            cellPrice.appendChild(rentDiv);

            cellVisible.textContent = isVisible ? '是' : '否';
            
            // 操作欄
            cellActions.className = 'actions-cell';
            const actionContainer = document.createElement('div');
            actionContainer.style.cssText = 'display: flex; gap: 5px; justify-content: center;';
            const rentBtn = document.createElement('button');
            rentBtn.className = 'action-btn btn-rent';
            rentBtn.dataset.gameid = game.game_id;
            rentBtn.style.backgroundColor = '#007bff';
            rentBtn.textContent = '出借';
            const editBtn = document.createElement('button');
            editBtn.className = 'action-btn btn-edit-game';
            editBtn.dataset.gameid = game.game_id;
            editBtn.style.cssText = 'background-color: #ffc107; color: #000;';
            editBtn.textContent = '編輯';
            actionContainer.appendChild(rentBtn);
            actionContainer.appendChild(editBtn);
            cellActions.appendChild(actionContainer);
        });
    }

async function fetchAllGames() {
    try {
        const response = await fetch('/api/get-boardgames');
        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`從資料庫獲取桌遊列表失敗: ${errorText}`);
        }
        allGames = await response.json();
        applyGameFiltersAndRender();
        initializeGameDragAndDrop();
    } catch (error) { 
        console.error('獲取桌遊列表失敗:', error);
        if(gameListTbody) gameListTbody.innerHTML = `<tr><td colspan="7" style="color: red;">讀取資料失敗，請檢查 API 紀錄。</td></tr>`;
    }
}

function initializeGameDragAndDrop() {
    if (sortableGames) {
        sortableGames.destroy();
    }
    if (gameListTbody) {
        sortableGames = new Sortable(gameListTbody, {
            animation: 150,
            handle: '.drag-handle',
            onEnd: async (evt) => {
                const orderedIds = Array.from(gameListTbody.children).map(row => row.dataset.gameId);
                
                allGames.sort((a, b) => orderedIds.indexOf(a.game_id) - orderedIds.indexOf(b.game_id));
                applyGameFiltersAndRender();

                try {
                    const response = await fetch('/api/admin/update-boardgame-order', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ orderedGameIds: orderedIds })
                    });
                    if (!response.ok) {
                        throw new Error('儲存順序失敗，請刷新頁面重試。');
                    }
                    await fetchAllGames(); 
                } catch (error) {
                    alert(error.message);
                    await fetchAllGames(); 
                }
            }
        });
    }
}

if (gameSearchInput) {
    gameSearchInput.addEventListener('input', applyGameFiltersAndRender);
}
    
const inventoryStockFilter = document.getElementById('inventory-stock-filter');
if (inventoryStockFilter) {
    inventoryStockFilter.addEventListener('click', (e) => {
        if (e.target.tagName === 'BUTTON') {
            inventoryStockFilter.querySelector('.active')?.classList.remove('active');
            e.target.classList.add('active');
            applyGameFiltersAndRender();
        }
    });
}

const inventoryVisibilityFilter = document.getElementById('inventory-visibility-filter');
if (inventoryVisibilityFilter) {
    inventoryVisibilityFilter.addEventListener('click', (e) => {
        if (e.target.tagName === 'BUTTON') {
            inventoryVisibilityFilter.querySelector('.active')?.classList.remove('active');
            e.target.classList.add('active');
            applyGameFiltersAndRender();
        }
    });
}

if (syncGamesBtn) {
    syncGamesBtn.addEventListener('click', async () => {
        if (!confirm('確定要從 Google Sheet 同步所有桌遊資料到資料庫嗎？\n\n這將會用 Sheet 上的資料覆蓋現有資料。')) return;

        try {
            syncGamesBtn.textContent = '同步中...';
            syncGamesBtn.disabled = true;
            const response = await fetch('/api/get-boardgames', { method: 'POST' });
            const result = await response.json();
            if (!response.ok) {
                throw new Error(result.details || '同步失敗');
            }
            alert(result.message || '同步成功！');
            await fetchAllGames();
        } catch (error) {
            alert(`錯誤：${error.message}`);
        } finally {
            syncGamesBtn.textContent = '同步至資料庫';
            syncGamesBtn.disabled = false;
        }
    });
}


if (gameListTbody) {
    gameListTbody.addEventListener('click', (e) => {
        const target = e.target;
        const gameId = target.dataset.gameid; 
        if (!gameId) return;

        if (target.classList.contains('btn-edit-game')) {
            openEditGameModal(gameId);
        } else if (target.classList.contains('btn-rent')) {
            openCreateRentalModal(gameId);
        }
    });
}

function openEditGameModal(gameId) {
    const game = allGames.find(g => g.game_id == gameId);
    if (!game) return alert('找不到遊戲資料');

    if(editGameForm) editGameForm.reset();
    document.getElementById('modal-game-title').textContent = `編輯：${game.name}`;
    
    document.getElementById('edit-game-id').value = game.game_id;
    document.getElementById('edit-game-id-display').value = game.game_id;
    document.getElementById('edit-game-name').value = game.name;
    document.getElementById('edit-game-tags').value = game.tags || '';
    document.getElementById('edit-game-image').value = game.image_url || '';
    document.getElementById('edit-game-image-2').value = game.image_url_2 || '';
    document.getElementById('edit-game-image-3').value = game.image_url_3 || '';
    document.getElementById('edit-game-desc').value = game.description || '';
    document.getElementById('edit-min-players').value = game.min_players || 1;
    document.getElementById('edit-max-players').value = game.max_players || 1;
    document.getElementById('edit-difficulty').value = game.difficulty || '普通';
    document.getElementById('edit-total-stock').value = game.total_stock || 0;
    document.getElementById('edit-for-rent-stock').value = game.for_rent_stock || 0;
    document.getElementById('edit-sale-price').value = game.sale_price || 0;
    document.getElementById('edit-rent-price').value = game.rent_price || 0;
    document.getElementById('edit-deposit').value = game.deposit || 0;
    document.getElementById('edit-late-fee').value = game.late_fee_per_day || 50;
    document.getElementById('edit-is-visible').checked = game.is_visible === 1;
    document.getElementById('edit-supplementary-info').value = game.supplementary_info || '';
    
    if(editGameModal) editGameModal.style.display = 'flex';
}

if(editGameModal) {
    editGameModal.querySelector('.modal-close').addEventListener('click', () => editGameModal.style.display = 'none');
    editGameModal.querySelector('.btn-cancel').addEventListener('click', () => editGameModal.style.display = 'none');

    if(editGameForm) {
        editGameForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            
            const updatedData = {
                gameId: document.getElementById('edit-game-id').value,
                name: document.getElementById('edit-game-name').value,
                tags: document.getElementById('edit-game-tags').value,
                image_url: document.getElementById('edit-game-image').value,
                image_url_2: document.getElementById('edit-game-image-2').value,
                image_url_3: document.getElementById('edit-game-image-3').value,
                description: document.getElementById('edit-game-desc').value,
                min_players: document.getElementById('edit-min-players').value,
                max_players: document.getElementById('edit-max-players').value,
                difficulty: document.getElementById('edit-difficulty').value,
                total_stock: document.getElementById('edit-total-stock').value,
                for_rent_stock: document.getElementById('edit-for-rent-stock').value,
                sale_price: document.getElementById('edit-sale-price').value,
                rent_price: document.getElementById('edit-rent-price').value,
                deposit: document.getElementById('edit-deposit').value,
                late_fee_per_day: document.getElementById('edit-late-fee').value,
                is_visible: document.getElementById('edit-is-visible').checked,
                supplementary_info: document.getElementById('edit-supplementary-info').value
            };

            try {
                const response = await fetch('/api/admin/update-boardgame-details', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(updatedData)
                });
                const result = await response.json();
                if (!response.ok) throw new Error(result.error || '更新失敗');
                
                // 【** 關鍵修正：更新前端的資料狀態 **】
                const gameIndex = allGames.findIndex(g => g.game_id === updatedData.gameId);
                if (gameIndex !== -1) {
                    // 將回傳的更新資料合併到現有的 allGames 陣列中
                    // 注意 is_visible 需要從布林值轉回 1 或 0
                    allGames[gameIndex] = { 
                        ...allGames[gameIndex], 
                        ...updatedData,
                        is_visible: updatedData.is_visible ? 1 : 0
                    };
                }
                
                applyGameFiltersAndRender();
                editGameModal.style.display = 'none';
                alert('更新成功！');
            } catch (error) {
                alert(`錯誤：${error.message}`);
            }
        });
    }
}


// =================================================================
// 桌遊租借模組
// =================================================================
async function applyRentalFiltersAndRender() {
    if (!rentalSearchInput) return;
    const keyword = rentalSearchInput.value.toLowerCase().trim();
    let status = 'all';
    if (rentalStatusFilter) {
        const activeFilter = rentalStatusFilter.querySelector('.active');
        if(activeFilter) status = activeFilter.dataset.filter;
    }

    let url = '/api/admin/get-all-rentals';
    if (status !== 'all') {
        url += `?status=${status}`;
    }
    
    try {
        const response = await fetch(url);
        if (!response.ok) throw new Error('無法獲取租借列表');
        allRentals = await response.json();

        // 在前端進行關鍵字篩選
        const filteredRentals = !keyword ? allRentals : allRentals.filter(rental => 
                                 (rental.game_name || '').toLowerCase().includes(keyword) ||
                                 (rental.nickname || rental.line_display_name || '').toLowerCase().includes(keyword)
                             );
        
        sortRentals(); // 在渲染前先進行排序
        renderRentalList(filteredRentals);

    } catch (error) { 
        console.error('獲取租借列表失敗:', error); 
    }
}

function sortRentals() {
    allRentals.sort((a, b) => {
        const dateA = new Date(a.due_date);
        const dateB = new Date(b.due_date);
        if (dueDateSortOrder === 'asc') {
            return dateA - dateB;
        } else {
            return dateB - dateA;
        }
    });
    // 更新排序按鈕的視覺狀態
    if(sortDueDateBtn) {
        sortDueDateBtn.classList.remove('asc', 'desc');
        sortDueDateBtn.classList.add(dueDateSortOrder);
    }
}

function renderRentalList(rentals) {
        if (!rentalListTbody) return;
        rentalListTbody.innerHTML = '';
        rentals.forEach(rental => {
            const row = rentalListTbody.insertRow();
            const userName = rental.nickname || rental.line_display_name || '未知用戶';
            
            const cellStatus = row.insertCell();
            const cellGame = row.insertCell();
            const cellUser = row.insertCell();
            const cellDue = row.insertCell();
            const cellReturn = row.insertCell();
            const cellActions = row.insertCell();

            // 狀態欄 (包含安全的 HTML)
            let statusBadgeHTML = '';
            switch(rental.derived_status) {
                case 'overdue':
                    statusBadgeHTML = '<span style="background-color: var(--danger-color); color: #fff; padding: 4px 8px; border-radius: 12px; font-size: 0.8rem;">逾期未歸還</span>';
                    break;
                case 'rented':
                    statusBadgeHTML = '<span style="background-color: #ffc107; color: #000; padding: 4px 8px; border-radius: 12px; font-size: 0.8rem;">租借中</span>';
                    break;
                case 'returned':
                    statusBadgeHTML = '<span style="background-color: #28a745; color: #fff; padding: 4px 8px; border-radius: 12px; font-size: 0.8rem;">已歸還</span>';
                    break;
                default:
                    const span = document.createElement('span');
                    span.textContent = rental.status;
                    statusBadgeHTML = span.outerHTML;
            }
            cellStatus.innerHTML = statusBadgeHTML; // 此處是安全的，因為 HTML 內容由我們控制

            // 其他欄
            cellGame.textContent = rental.game_name;
            cellUser.textContent = userName;
            cellDue.textContent = rental.due_date;
            cellReturn.textContent = rental.return_date || '--';

            // 操作欄
            cellActions.className = 'actions-cell';
            const actionContainer = document.createElement('div');
            actionContainer.style.cssText = 'display: flex; gap: 5px; justify-content: center;';
            const manageBtn = document.createElement('button');
            manageBtn.className = 'action-btn btn-edit-rental';
            manageBtn.dataset.rentalid = rental.rental_id;
            manageBtn.style.backgroundColor = '#007bff';
            manageBtn.textContent = '管理';
            const returnBtn = document.createElement('button');
            returnBtn.className = 'action-btn btn-return';
            returnBtn.dataset.rentalid = rental.rental_id;
            returnBtn.style.backgroundColor = '#17a2b8';
            returnBtn.disabled = (rental.status === 'returned');
            returnBtn.textContent = '歸還';
            actionContainer.appendChild(manageBtn);
            actionContainer.appendChild(returnBtn);
            cellActions.appendChild(actionContainer);
        });
    }

function fetchAllRentals() {
    applyRentalFiltersAndRender();
}

if (rentalStatusFilter) {
    rentalStatusFilter.addEventListener('click', (e) => {
        if (e.target.tagName === 'BUTTON') {
            rentalStatusFilter.querySelector('.active')?.classList.remove('active');
            e.target.classList.add('active');
            applyRentalFiltersAndRender();
        }
    });
}

if(rentalSearchInput) {
    rentalSearchInput.addEventListener('input', applyRentalFiltersAndRender);
}

if (sortDueDateBtn) {
    sortDueDateBtn.addEventListener('click', () => {
        dueDateSortOrder = dueDateSortOrder === 'asc' ? 'desc' : 'asc';
        const keyword = rentalSearchInput.value.toLowerCase().trim();
        const filteredRentals = !keyword ? allRentals : allRentals.filter(rental => 
            (rental.game_name || '').toLowerCase().includes(keyword) ||
            (rental.nickname || rental.line_display_name || '').toLowerCase().includes(keyword)
        );
        sortRentals();
        renderRentalList(filteredRentals); 
    });
}

if (rentalListTbody) {
    rentalListTbody.addEventListener('click', async (e) => {
        const target = e.target;
        const rentalId = target.dataset.rentalid;
        if (!rentalId) return;

        if (target.classList.contains('btn-edit-rental')) {
            openEditRentalModal(rentalId);
            return;
        }

        if (target.classList.contains('btn-return')) {
            const rental = allRentals.find(r => r.rental_id == rentalId);
            if (!rental) return;

            if (confirm(`確定要將《${rental.game_name}》標記為已歸還嗎？`)) {
                try {
                    const response = await fetch('/api/admin/update-rental-status', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            rentalId: Number(rentalId),
                            status: 'returned'
                        })
                    });
                    const result = await response.json();
                    if (!response.ok) throw new Error(result.error || '歸還失敗');
                    alert('歸還成功！');

                    await applyRentalFiltersAndRender();
                    if (allGames.length > 0) await fetchAllGames();

                } catch (error) {
                    alert(`錯誤：${error.message}`);
                }
            }
        }
    });
}

function openEditRentalModal(rentalId) {
    const rental = allRentals.find(r => r.rental_id == rentalId);
    if (!rental) return alert('找不到該筆租借紀錄');

    document.getElementById('edit-rental-id').value = rental.rental_id;
    document.getElementById('modal-rental-title').textContent = `管理租借：${rental.game_name}`;
    
    const autoCalculatedFee = rental.overdue_days > 0 ? rental.overdue_days * (rental.late_fee_per_day || 50) : 0;
    document.getElementById('calculated-late-fee-display').value = `$ ${autoCalculatedFee}`;

    document.getElementById('edit-rental-due-date').value = rental.due_date;
    
    document.getElementById('edit-rental-override-fee').value = rental.late_fee_override ?? '';

    flatpickr("#edit-rental-due-date", { dateFormat: "Y-m-d" });

    if(rental && rental.user_id) {
        loadAndBindRentalMessageDrafts(rental.user_id);
    }

    editRentalModal.style.display = 'flex';
}

async function loadAndBindRentalMessageDrafts(userId) {
    const select = document.getElementById('rental-message-draft-select');
    const content = document.getElementById('rental-direct-message-content');
    const sendBtn = document.getElementById('rental-send-direct-message-btn');
    if (!select || !content || !sendBtn) return;

    await fetchAllDrafts(); 
    select.innerHTML = '<option value="">-- 手動輸入或選擇草稿 --</option>';
    allDrafts.forEach(draft => {
        const option = document.createElement('option');
        option.value = draft.content;
        option.textContent = draft.title;
        select.appendChild(option);
    });

    select.onchange = () => { 
        content.value = select.value;
    };
    
    const newSendBtn = sendBtn.cloneNode(true);
    sendBtn.parentNode.replaceChild(newSendBtn, sendBtn);
    
    newSendBtn.onclick = async () => {
        const message = content.value.trim();
        if (!message) { alert('訊息內容不可為空！'); return; }
        if (!confirm(`確定要發送以下訊息給該顧客嗎？\n\n${message}`)) return;
        
        newSendBtn.textContent = '傳送中...';
        newSendBtn.disabled = true;
        try {
            const response = await fetch('/api/send-message', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userId, message })
            });
            if (!response.ok) {
                const err = await response.json();
                throw new Error(err.error || '傳送失敗');
            }
            alert('訊息傳送成功！');
            content.value = '';
            select.value = '';
        } catch (error) {
            alert(`傳送失敗：${error.message}`);
        } finally {
            newSendBtn.textContent = '確認發送';
            newSendBtn.disabled = false;
        }
    };
}

if (editRentalForm) {
    editRentalForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const rentalId = document.getElementById('edit-rental-id').value;
        const updatedData = {
            rentalId: Number(rentalId),
            dueDate: document.getElementById('edit-rental-due-date').value,
            lateFeeOverride: document.getElementById('edit-rental-override-fee').value
        };

        try {
            const response = await fetch('/api/admin/update-rental-details', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(updatedData)
            });
            const result = await response.json();
            if (!response.ok) throw new Error(result.error || '更新失敗');

            alert('更新成功！');
            editRentalModal.style.display = 'none';
            await applyRentalFiltersAndRender();

        } catch (error) {
            alert(`錯誤： ${error.message}`);
        }
    });
}

async function openCreateRentalModal(gameId) {
    const statusDiv = document.getElementById('rental-modal-status');
    if(statusDiv) statusDiv.textContent = ''; 

    if (allUsers.length === 0) {
        if(statusDiv) statusDiv.textContent = '正在載入會員列表，請稍候...';
        try {
            await fetchAllUsers();
            if(statusDiv) statusDiv.textContent = '會員列表載入完成！';
            setTimeout(() => { if(statusDiv) statusDiv.textContent = ''; }, 2000);
        } catch (error) {
            alert('會員列表載入失敗，無法建立租借紀錄。');
            if(statusDiv) statusDiv.textContent = '';
            return;
        }
    }

    if (createRentalForm) createRentalForm.reset();
    selectedRentalUser = null;
    selectedRentalGames = []; 

    const game = allGames.find(g => g.game_id == gameId);
    if (game) {
        selectedRentalGames.push(game); 
    }
    
    updateSelectedGamesDisplay();

    const userSelect = document.getElementById('rental-user-select');
    if(userSelect) userSelect.style.display = 'none';

    // 【修改處】自動帶入預設金額
    document.getElementById('rental-rent-price').value = game ? (game.rent_price || 0) : 0;
    document.getElementById('rental-deposit').value = game ? (game.deposit || 0) : 0;
    document.getElementById('rental-late-fee').value = game ? (game.late_fee_per_day || 50) : 50;

    const today = new Date();
    today.setDate(today.getDate() + 3);
    document.getElementById('rental-due-date').value = today.toISOString().split('T')[0];

    if(createRentalModal) createRentalModal.style.display = 'flex';
}
    
function updateSelectedGamesDisplay() {
    const container = document.getElementById('rental-games-container');
    const searchInput = document.getElementById('rental-game-search');
    if(!container || !searchInput) return;

    [...container.children].forEach(child => {
        if (child.id !== 'rental-game-search') {
            container.removeChild(child);
        }
    });

    selectedRentalGames.forEach(game => {
        const chip = document.createElement('span');
        chip.className = 'game-tag-chip';
        chip.textContent = game.name;
        
        const removeBtn = document.createElement('button');
        removeBtn.type = 'button'; 
        removeBtn.className = 'remove-game-tag';
        removeBtn.textContent = '×';
        removeBtn.onclick = () => {
            selectedRentalGames = selectedRentalGames.filter(g => g.game_id !== game.game_id);
            updateSelectedGamesDisplay();
        };
        
        chip.appendChild(removeBtn);
        container.insertBefore(chip, searchInput); 
    });
}

if(createRentalModal) {
    const rentalUserSearch = document.getElementById('rental-user-search');
    const rentalUserSelect = document.getElementById('rental-user-select');
    const gameSearchInput = document.getElementById('rental-game-search');
    const gameSearchResults = document.getElementById('game-search-results');

    createRentalModal.querySelector('.modal-close').addEventListener('click', () => createRentalModal.style.display = 'none');
    createRentalModal.querySelector('.btn-cancel').addEventListener('click', () => createRentalModal.style.display = 'none');
    
    if (rentalUserSearch) {
        rentalUserSearch.addEventListener('input', () => {
            const searchTerm = rentalUserSearch.value.toLowerCase().trim();
            if (searchTerm.length < 2) {
                if(rentalUserSelect) rentalUserSelect.style.display = 'none';
                return;
            }
            // ** 需求 2 修改：增加 real_name 到搜尋條件 **
            const filteredUsers = allUsers.filter(user => 
                (user.line_display_name || '').toLowerCase().includes(searchTerm) ||
                (user.nickname || '').toLowerCase().includes(searchTerm) ||
                (user.user_id || '').toLowerCase().includes(searchTerm) ||
                (user.real_name || '').toLowerCase().includes(searchTerm) // 新增此行
            );
            
            if(rentalUserSelect) {
                rentalUserSelect.innerHTML = '<option value="">-- 請選擇會員 --</option>';
                filteredUsers.forEach(user => {
                    const option = document.createElement('option');
                    option.value = user.user_id;
                    const displayName = user.nickname || user.line_display_name;
                    // 在選項中也顯示真實姓名，方便辨識
                    const realNameDisplay = user.real_name ? ` [${user.real_name}]` : '';
                    option.textContent = `${displayName}${realNameDisplay} (${user.user_id.substring(0, 10)}...)`;
                    rentalUserSelect.appendChild(option);
                });
                rentalUserSelect.style.display = 'block';
            }
        });
    }
    
    if (rentalUserSelect) {
        rentalUserSelect.addEventListener('change', () => {
            selectedRentalUser = allUsers.find(u => u.user_id === rentalUserSelect.value);
            if (selectedRentalUser) {
                const nameInput = document.getElementById('rental-contact-name');
                const phoneInput = document.getElementById('rental-contact-phone');
                if(nameInput) nameInput.value = selectedRentalUser.nickname || selectedRentalUser.line_display_name || '';
                if(phoneInput) phoneInput.value = selectedRentalUser.phone || '';
            }
        });
    }

    if(gameSearchInput && gameSearchResults) {
        gameSearchInput.addEventListener('input', () => {
            const searchTerm = gameSearchInput.value.toLowerCase().trim();
            if (searchTerm.length < 1) {
                gameSearchResults.style.display = 'none';
                return;
            }
            
            const filteredGames = allGames.filter(game => 
                game.name.toLowerCase().includes(searchTerm) &&
                !selectedRentalGames.some(sg => sg.game_id === game.game_id)
            );

            gameSearchResults.innerHTML = '';
            if (filteredGames.length > 0) {
                filteredGames.slice(0, 5).forEach(game => {
                    const li = document.createElement('li');
                    li.textContent = `${game.name} (庫存: ${game.for_rent_stock})`;
                    li.onclick = () => {
                        selectedRentalGames.push(game);
                        updateSelectedGamesDisplay();
                        gameSearchInput.value = '';
                        gameSearchResults.style.display = 'none';
                    };
                    gameSearchResults.appendChild(li);
                });
                gameSearchResults.style.display = 'block';
            } else {
                gameSearchResults.style.display = 'none';
            }
        });
    }

if (createRentalForm) {
    createRentalForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        if (!selectedRentalUser) {
            alert('請務必搜尋並選擇一位租借會員！');
            return;
        }
        if (selectedRentalGames.length === 0) {
            alert('請至少選擇一個租借品項！');
            return;
        }

        // 【修改處】讀取表單上的客製化金額
        const rentalData = {
            userId: selectedRentalUser.user_id,
            gameIds: selectedRentalGames.map(g => g.game_id),
            dueDate: document.getElementById('rental-due-date').value,
            name: document.getElementById('rental-contact-name').value,
            phone: document.getElementById('rental-contact-phone').value,
            rentPrice: document.getElementById('rental-rent-price').value,
            deposit: document.getElementById('rental-deposit').value,
            lateFeePerDay: document.getElementById('rental-late-fee').value
        };

        if (!rentalData.name || !rentalData.phone) {
            alert('租借人姓名與電話為必填欄位！');
            return;
        }

            const gameNames = selectedRentalGames.map(g => g.name).join('\n- ');
            const confirmationMessage = `請確認租借資訊：\n\n` +
                `會員：${selectedRentalUser.nickname || selectedRentalUser.line_display_name}\n` +
                `遊戲：\n- ${gameNames}\n` +
                `租借人：${rentalData.name}\n` +
                `電話：${rentalData.phone}\n` +
                `歸還日：${rentalData.dueDate}`;

            if (!confirm(confirmationMessage)) return;
            
            try {
                const response = await fetch('/api/admin/create-rental', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(rentalData)
                });
                const result = await response.json();
                if (!response.ok) throw new Error(result.error || '建立失敗');
                alert('租借成功！');
                createRentalModal.style.display = 'none';
                
                rentalData.gameIds.forEach(gameId => {
                    const rentedGame = allGames.find(g => g.game_id === gameId);
                    if(rentedGame) {
                        rentedGame.for_rent_stock = Number(rentedGame.for_rent_stock) - 1;
                    }
                });
                applyGameFiltersAndRender();
                
                await fetchAllRentals();
                showPage('rentals');
            } catch (error) {
                alert(`錯誤：${error.message}`);
            }
        });
    }
}
    
flatpickr("#rental-due-date", { dateFormat: "Y-m-d", minDate: "today" });


    // =================================================================
    // 訂位管理模組
    // =================================================================
  function renderBookingList(bookings) {
        if (!bookingListTbody) return;
        bookingListTbody.innerHTML = '';
        if (bookings.length === 0) {
            const row = bookingListTbody.insertRow();
            const cell = row.insertCell();
            cell.colSpan = 5;
            cell.style.textAlign = 'center';
            cell.textContent = '找不到符合條件的預約。';
            return;
        }
        bookings.forEach(booking => {
            const row = bookingListTbody.insertRow();
            let statusText = '未知';
            if (booking.status === 'confirmed') statusText = '預約成功';
            if (booking.status === 'checked-in') statusText = '已報到';
            if (booking.status === 'cancelled') statusText = '已取消';

            const cellTime = row.insertCell();
            const cellClient = row.insertCell();
            const cellPeople = row.insertCell();
            const cellStatus = row.insertCell();
            const cellActions = row.insertCell();

            // 時間欄
            cellTime.className = 'compound-cell';
            const dateDiv = document.createElement('div');
            dateDiv.className = 'main-info';
            dateDiv.textContent = booking.booking_date;
            const slotDiv = document.createElement('div');
            slotDiv.className = 'sub-info';
            slotDiv.textContent = booking.time_slot;
            cellTime.appendChild(dateDiv);
            cellTime.appendChild(slotDiv);

            // 客戶欄
            cellClient.className = 'compound-cell';
            const nameDiv = document.createElement('div');
            nameDiv.className = 'main-info';
            nameDiv.textContent = booking.contact_name;
            const phoneDiv = document.createElement('div');
            phoneDiv.className = 'sub-info';
            phoneDiv.textContent = booking.contact_phone;
            cellClient.appendChild(nameDiv);
            cellClient.appendChild(phoneDiv);

            // 其他欄
            cellPeople.textContent = booking.num_of_people;
            cellStatus.textContent = statusText;
            
            // 操作欄
            cellActions.className = 'actions-cell';
            const checkInBtn = document.createElement('button');
            checkInBtn.className = 'action-btn btn-check-in';
            checkInBtn.dataset.bookingid = booking.booking_id;
            checkInBtn.style.backgroundColor = '#28a745';
            checkInBtn.disabled = (booking.status !== 'confirmed');
            checkInBtn.textContent = '報到';
            const cancelBtn = document.createElement('button');
            cancelBtn.className = 'action-btn btn-cancel-booking';
            cancelBtn.dataset.bookingid = booking.booking_id;
            cancelBtn.style.backgroundColor = 'var(--danger-color)';
            cancelBtn.disabled = (booking.status === 'cancelled');
            cancelBtn.textContent = '取消';
            cellActions.appendChild(checkInBtn);
            cellActions.appendChild(cancelBtn);
        });
    }

    async function fetchAllBookings(status = 'today') {
        try {
            const response = await fetch(`/api/get-bookings?status=${status}`);
            if (!response.ok) throw new Error('無法獲取預約列表');
            allBookings = await response.json();
            renderBookingList(allBookings);
        } catch (error) { 
            console.error('獲取預約列表失敗:', error); 
            if(bookingListTbody) bookingListTbody.innerHTML = '<tr><td colspan="5" style="color: red; text-align: center;">讀取預約失敗</td></tr>';
        }
    }
    
    const bookingStatusFilter = document.getElementById('booking-status-filter');
    if (bookingStatusFilter) {
        bookingStatusFilter.addEventListener('click', (e) => {
            if (e.target.tagName === 'BUTTON') {
                bookingStatusFilter.querySelector('.active')?.classList.remove('active');
                e.target.classList.add('active');
                const status = e.target.dataset.filter;
                fetchAllBookings(status);
            }
        });
    }
    
    async function initializeBookingSettings() {
        if (bookingDatepicker) {
            // 如果已存在，只需更新日期
            const response = await fetch('/api/admin/booking-settings');
            enabledDates = await response.json();
            bookingDatepicker.setDate(enabledDates, false); // 更新日曆上的選中日期
            return;
        }

        try {
            const response = await fetch('/api/admin/booking-settings');
            if (!response.ok) throw new Error('無法獲取公休日設定');
            enabledDates = await response.json(); // <--- 變數改名

            bookingDatepicker = flatpickr("#booking-datepicker-admin-container", {
                inline: true,
                mode: "multiple",
                dateFormat: "Y-m-d",
                defaultDate: enabledDates, // <--- 變數改名
                // 當日曆月份改變時，更新「開啟本月」按鈕的文字
                onMonthChange: (selectedDates, dateStr, instance) => {
                    const openMonthBtn = document.getElementById('open-month-btn');
                    if (openMonthBtn) {
                        openMonthBtn.textContent = `開啟 ${instance.currentYear} / ${instance.currentMonth + 1} 月所有日期`;
                    }
                },
                // 日曆準備好時，也更新按鈕文字
                onReady: (selectedDates, dateStr, instance) => {
                    const openMonthBtn = document.getElementById('open-month-btn');
                    if (openMonthBtn) {
                        openMonthBtn.textContent = `開啟 ${instance.currentYear} / ${instance.currentMonth + 1} 月所有日期`;
                    }
                }
            });
        } catch (error) {
            console.error("初始化可預約日設定失敗:", error);
            alert("初始化可預約日設定失敗，請檢查 API。");
        }
    }

    // 【** 修改這個函式 **】
    async function saveBookingSettings() {
        const saveBtn = document.getElementById('save-booking-settings-btn');
        if (!bookingDatepicker || !saveBtn) return;
        
        saveBtn.textContent = '儲存中...';
        saveBtn.disabled = true;

        try {
            const newEnabledDates = bookingDatepicker.selectedDates.map(d => bookingDatepicker.formatDate(d, "Y-m-d"));
            
            const datesToAdd = newEnabledDates.filter(d => !enabledDates.includes(d));
            const datesToRemove = enabledDates.filter(d => !newEnabledDates.includes(d));

            const promises = [];
            datesToAdd.forEach(date => {
                promises.push(fetch('/api/admin/booking-settings', {
                    method: 'POST', headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ date, action: 'add' })
                }));
            });
            datesToRemove.forEach(date => {
                promises.push(fetch('/api/admin/booking-settings', {
                    method: 'POST', headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ date, action: 'remove' })
                }));
            });

            await Promise.all(promises);

            enabledDates = newEnabledDates;
            alert('可預約日設定已成功儲存！');
            if (bookingSettingsModal) bookingSettingsModal.style.display = 'none';

        } catch (error) {
            console.error("儲存可預約日設定失敗:", error);
            alert("儲存失敗，請再試一次。");
        } finally {
            saveBtn.textContent = '儲存變更';
            saveBtn.disabled = false;
        }
    }

    if(manageBookingDatesBtn) {
        manageBookingDatesBtn.addEventListener('click', () => {
            initializeBookingSettings(); 
            if (bookingSettingsModal) {
                bookingSettingsModal.style.display = 'flex';
            }
        });
    }

    if(bookingSettingsModal) {
        bookingSettingsModal.querySelector('.modal-close').addEventListener('click', () => bookingSettingsModal.style.display = 'none');
        bookingSettingsModal.querySelector('.btn-cancel').addEventListener('click', () => bookingSettingsModal.style.display = 'none');
        
        const saveBtn = bookingSettingsModal.querySelector('#save-booking-settings-btn');
        if(saveBtn) saveBtn.addEventListener('click', saveBookingSettings);

        // 【** 新增「開啟本月」按鈕的事件 **】
        const openMonthBtn = document.getElementById('open-month-btn');
        if(openMonthBtn) {
            openMonthBtn.addEventListener('click', async () => {
                if (!bookingDatepicker) return;
                const year = bookingDatepicker.currentYear;
                const month = bookingDatepicker.currentMonth; // 0-11

                if (!confirm(`確定要將 ${year} 年 ${month + 1} 月的所有日期都設定為可預約嗎？`)) return;

                openMonthBtn.textContent = '處理中...';
                openMonthBtn.disabled = true;
                try {
                    const response = await fetch('/api/admin/booking-settings', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ action: 'open_month', year, month })
                    });
                    if (!response.ok) throw new Error('開啟月份失敗');

                    alert(`${year} 年 ${month + 1} 月已全部開啟！`);
                    // 重新初始化日曆以載入最新日期
                    await initializeBookingSettings();

                } catch (error) {
                    alert(`錯誤：${error.message}`);
                } finally {
                    openMonthBtn.disabled = false;
                    // onMonthChange/onReady 會自動更新按鈕文字
                }
            });
        }
    }



// REPLACE THIS EVENT LISTENER
if(bookingListTbody){
    bookingListTbody.addEventListener('click', async (event) => {
        const target = event.target;
        const bookingId = target.dataset.bookingid;
        if (!bookingId) return;

        const handleStatusUpdate = async (id, newStatus, confirmMsg, successMsg, errorMsg) => {
            const booking = allBookings.find(b => b.booking_id == id);
            if (!booking) return;
            if (confirm(confirmMsg)) {
                 try {
                    const response = await fetch('/api/update-booking-status', {
                        method: 'POST', headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ bookingId: Number(id), status: newStatus })
                    });
                    const result = await response.json();
                    if (!response.ok) throw new Error(result.error || errorMsg);
                    alert(successMsg);
                    booking.status = newStatus;
                    renderBookingList(allBookings);
                } catch (error) { alert(`錯誤：${error.message}`); }
            }
        };

        if (target.classList.contains('btn-check-in')) {
            const booking = allBookings.find(b => b.booking_id == bookingId);
            await handleStatusUpdate(bookingId, 'checked-in', 
                `確定要將 ${booking.booking_date} ${booking.contact_name} 的預約標示為「已報到」嗎？`,
                '報到成功！', '報到失敗');
        }
        
        // ** 需求 3 修改：取消按鈕的邏輯 **
        if (target.classList.contains('btn-cancel-booking')) {
            const booking = allBookings.find(b => b.booking_id == bookingId);
            openCancelBookingModal(booking);
        }
    });
}

// ADD THESE TWO ITEMS

// ** 需求 3 新增：打開取消預約視窗的函式 **
async function openCancelBookingModal(booking) {
    if (!booking || !cancelBookingModal) return;

    document.getElementById('cancel-booking-info').textContent = `${booking.booking_date} ${booking.contact_name}`;
    
    const select = document.getElementById('cancel-message-draft-select');
    const content = document.getElementById('cancel-direct-message-content');
    const confirmBtn = document.getElementById('confirm-cancel-booking-btn');

    content.value = ''; // 清空
    await fetchAllDrafts(); // 確保草稿已載入
    select.innerHTML = '<option value="">-- 不發送通知或手動輸入 --</option>';
    allDrafts.forEach(draft => {
        const option = document.createElement('option');
        option.value = draft.content;
        option.textContent = draft.title;
        select.appendChild(option);
    });

    select.onchange = () => { content.value = select.value; };

    const newConfirmBtn = confirmBtn.cloneNode(true);
    confirmBtn.parentNode.replaceChild(newConfirmBtn, confirmBtn);

    newConfirmBtn.onclick = async () => {
        const message = content.value.trim();
        const shouldSendMessage = message.length > 0;

        if (!confirm(`確定要取消此預約嗎？${shouldSendMessage ? '\n\n並發送通知訊息。' : ''}`)) return;

        try {
            newConfirmBtn.textContent = '處理中...';
            newConfirmBtn.disabled = true;

            if (shouldSendMessage) {
                const msgResponse = await fetch('/api/send-message', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ userId: booking.user_id, message: message })
                });
                 if (!msgResponse.ok) console.error("發送 LINE 通知失敗");
            }

            const statusResponse = await fetch('/api/update-booking-status', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ bookingId: Number(booking.booking_id), status: 'cancelled' })
            });

            if (!statusResponse.ok) throw new Error('更新預約狀態失敗');

            alert('預約已成功取消！');
            booking.status = 'cancelled';
            renderBookingList(allBookings);
            cancelBookingModal.style.display = 'none';

        } catch (error) {
            alert(`操作失敗：${error.message}`);
        } finally {
            newConfirmBtn.textContent = '確認取消';
            newConfirmBtn.disabled = false;
        }
    };

    cancelBookingModal.style.display = 'flex';
}

// ** 需求 3 新增：為取消視窗加上關閉按鈕事件 **
if(cancelBookingModal) {
    cancelBookingModal.querySelector('.modal-close').addEventListener('click', () => cancelBookingModal.style.display = 'none');
}

    // =================================================================
    // 掃碼加點模組
    // =================================================================
    function onScanSuccess(decodedText, decodedResult) {
        if (html5QrCode && html5QrCode.isScanning) {
            html5QrCode.stop().then(() => {
                if(qrReaderElement) qrReaderElement.style.display = 'none';
                if(scanResultSection) scanResultSection.style.display = 'block';
                if(userIdDisplay) userIdDisplay.value = decodedText;
                if(scanStatusMessage) {
                    scanStatusMessage.textContent = '掃描成功！請輸入點數。';
                    scanStatusMessage.className = 'success';
                }
            }).catch(err => console.error("停止掃描失敗", err));
        }
    }

    function startScanner() {
        if (!qrReaderElement) return;
        if (html5QrCode && html5QrCode.isScanning) {
            html5QrCode.stop().catch(err => console.log("掃描器已停止"));
        }
        
        html5QrCode = new Html5Qrcode("qr-reader");
        qrReaderElement.style.display = 'block';
        if(scanResultSection) scanResultSection.style.display = 'none';
        if(scanStatusMessage) {
            scanStatusMessage.textContent = '請將顧客的 QR Code 對準掃描框';
            scanStatusMessage.className = '';
        }
        if(expInput) expInput.value = '';
        if(reasonSelect) reasonSelect.value = '消費回饋';
        if(customReasonInput) customReasonInput.style.display = 'none';

        const config = { fps: 10, qrbox: { width: 250, height: 250 } };
        html5QrCode.start({ facingMode: "environment" }, config, onScanSuccess)
            .catch(err => {
                console.error("無法啟動掃描器", err);
                if(scanStatusMessage) scanStatusMessage.textContent = '無法啟動相機，請檢查權限。';
            });
    }
    
    if (reasonSelect) {
        reasonSelect.addEventListener('change', () => {
            if(customReasonInput) customReasonInput.style.display = (reasonSelect.value === 'other') ? 'block' : 'none';
        });
    }

    if (rescanBtn) {
        rescanBtn.addEventListener('click', startScanner);
    }

    if (submitExpBtn) {
        submitExpBtn.addEventListener('click', async () => {
            const userId = userIdDisplay.value;
            const expValue = Number(expInput.value);
            let reason = reasonSelect.value;
            if (reason === 'other') reason = customReasonInput.value.trim();
            if (!userId || !expValue || expValue <= 0 || !reason) {
                if(scanStatusMessage) {
                    scanStatusMessage.textContent = '錯誤：所有欄位皆為必填。';
                    scanStatusMessage.className = 'error';
                }
                return;
            }
            try {
                if(scanStatusMessage) {
                    scanStatusMessage.textContent = '正在處理中...';
                    scanStatusMessage.className = '';
                }
                submitExpBtn.disabled = true;
                const response = await fetch('/api/add-exp', {
                    method: 'POST', headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ userId, expValue, reason }),
                });
                const result = await response.json();
                if (!response.ok) throw new Error(result.error || '未知錯誤');
                if(scanStatusMessage) {
                    scanStatusMessage.textContent = `成功為 ${userId.substring(0, 10)}... 新增 ${expValue} 點經驗！`;
                    scanStatusMessage.className = 'success';
                }
                if(expInput) expInput.value = '';
            } catch (error) {
                if(scanStatusMessage) {
                    scanStatusMessage.textContent = `新增失敗: ${error.message}`;
                    scanStatusMessage.className = 'error';
                }
            } finally {
                submitExpBtn.disabled = false;
            }
        });
    }

    // =================================================================
    // 經驗紀錄模組
    // =================================================================
// public/admin-login.js

async function fetchAllExpHistory() {
    try {
        // 【修改這裡】將網址對應到新的檔案名稱
        const response = await fetch('/api/admin/exp-history-list');

        if (!response.ok) throw new Error('無法獲取經驗紀錄');
        allExpHistory = await response.json();
        renderExpHistoryList(allExpHistory);
    } catch (error) {
        console.error('獲取經驗紀錄失敗:', error);
        if (expHistoryTbody) expHistoryTbody.innerHTML = `<tr><td colspan="4" style="color:red;">讀取紀錄失敗</td></tr>`;
    }
}

    function renderExpHistoryList(records) {
        if (!expHistoryTbody) return;
        expHistoryTbody.innerHTML = '';
        if (records.length === 0) {
            const row = expHistoryTbody.insertRow();
            const cell = row.insertCell();
            cell.colSpan = 4;
            cell.style.textAlign = 'center';
            cell.textContent = '找不到符合條件的紀錄。';
            return;
        }
        records.forEach(record => {
            const row = expHistoryTbody.insertRow();
            const displayName = record.nickname || record.line_display_name || '未知使用者';
            const date = new Date(record.created_at).toLocaleString('sv').replace(' ', '\n');
            const expClass = record.exp_added > 0 ? 'exp-gain' : 'exp-loss';
            const expSign = record.exp_added > 0 ? '+' : '';
            
            const cellUser = row.insertCell();
            const cellDate = row.insertCell();
            const cellReason = row.insertCell();
            const cellExp = row.insertCell();
            
            // 使用者欄
            cellUser.className = 'compound-cell';
            const userDiv = document.createElement('div');
            userDiv.className = 'main-info';
            userDiv.textContent = displayName;
            const userIdDiv = document.createElement('div');
            userIdDiv.className = 'sub-info';
            userIdDiv.textContent = record.user_id;
            cellUser.appendChild(userDiv);
            cellUser.appendChild(userIdDiv);
            
            // 其他欄
            cellDate.style.whiteSpace = 'pre-wrap';
            cellDate.textContent = date;
            cellReason.textContent = record.reason;
            cellExp.className = expClass;
            cellExp.style.fontWeight = 'bold';
            cellExp.textContent = `${expSign}${record.exp_added}`;
        });
    }


    if (expUserFilterInput) {
        expUserFilterInput.addEventListener('input', () => {
            const searchTerm = expUserFilterInput.value.toLowerCase().trim();
            if (!searchTerm) {
                renderExpHistoryList(allExpHistory);
                return;
            }
            const filteredRecords = allExpHistory.filter(record => {
                const displayName = record.nickname || record.line_display_name || '';
                const userId = record.user_id || '';
                return displayName.toLowerCase().includes(searchTerm) || userId.toLowerCase().includes(searchTerm);
            });
            renderExpHistoryList(filteredRecords);
        });
    }

    // =================================================================
    // 情報管理模組
    // =================================================================
    function renderNewsList(newsItems) {
        if(!newsListTbody) return;
        newsListTbody.innerHTML = '';
        newsItems.forEach(news => {
            const row = newsListTbody.insertRow();
            const cellTitle = row.insertCell();
            const cellCategory = row.insertCell();
            const cellDate = row.insertCell();
            const cellStatus = row.insertCell();
            const cellActions = row.insertCell();

            cellTitle.textContent = news.title;
            cellCategory.textContent = news.category;
            cellDate.textContent = news.published_date;
            cellStatus.textContent = news.is_published ? '已發布' : '草稿';

            cellActions.className = 'actions-cell';
            const editBtn = document.createElement('button');
            editBtn.className = 'action-btn btn-edit';
            editBtn.dataset.newsId = news.id;
            editBtn.textContent = '編輯';
            cellActions.appendChild(editBtn);
        });
    }
    

    async function fetchAllNews() {
        try {
            const response = await fetch('/api/admin/get-all-news');
            if (!response.ok) throw new Error('無法獲取情報列表');
            allNews = await response.json();
            renderNewsList(allNews);
        } catch (error) { console.error('獲取情報列表失敗:', error); }
    }

    function openEditNewsModal(news = null) {
        if(editNewsForm) editNewsForm.reset();
        currentEditingNewsId = news ? news.id : null;
        if(modalNewsTitle) modalNewsTitle.textContent = news ? '編輯情報' : '新增情報';
        
        if (news) {
            document.getElementById('edit-news-id').value = news.id;
            document.getElementById('edit-news-title').value = news.title;
            document.getElementById('edit-news-category').value = news.category;
            document.getElementById('edit-news-date').value = news.published_date;
            document.getElementById('edit-news-image').value = news.image_url;
            document.getElementById('edit-news-content').value = news.content;
            document.getElementById('edit-news-published').checked = !!news.is_published;
            if(deleteNewsBtn) deleteNewsBtn.style.display = 'inline-block';
        } else {
            if(deleteNewsBtn) deleteNewsBtn.style.display = 'none';
        }
        
        if(editNewsModal) editNewsModal.style.display = 'flex';
    }

    if(addNewsBtn) addNewsBtn.addEventListener('click', () => openEditNewsModal());
    if(editNewsModal) {
        editNewsModal.querySelector('.modal-close').addEventListener('click', () => editNewsModal.style.display = 'none');
        editNewsModal.querySelector('.btn-cancel').addEventListener('click', () => editNewsModal.style.display = 'none');
    }
    
    if(newsListTbody) {
        newsListTbody.addEventListener('click', (e) => {
            if (e.target.classList.contains('btn-edit')) {
                const newsId = e.target.dataset.newsId;
                const newsItem = allNews.find(n => n.id == newsId);
                openEditNewsModal(newsItem);
            }
        });
    }

    if(editNewsForm) {
        editNewsForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const formData = {
                id: currentEditingNewsId,
                title: document.getElementById('edit-news-title').value,
                category: document.getElementById('edit-news-category').value,
                published_date: document.getElementById('edit-news-date').value,
                image_url: document.getElementById('edit-news-image').value,
                content: document.getElementById('edit-news-content').value,
                is_published: document.getElementById('edit-news-published').checked
            };
            const url = currentEditingNewsId ? '/api/admin/update-news' : '/api/admin/create-news';
            try {
                const response = await fetch(url, {
                    method: 'POST', headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(formData)
                });
                const result = await response.json();
                if (!response.ok) throw new Error(result.error || '儲存失敗');
                alert('儲存成功！');
                if(editNewsModal) editNewsModal.style.display = 'none';
                await fetchAllNews();
            } catch (error) { alert(`錯誤：${error.message}`); }
        });
    }
    
    if(deleteNewsBtn) {
        deleteNewsBtn.addEventListener('click', async () => {
            if (!currentEditingNewsId || !confirm('確定要刪除這則情報嗎？此操作無法復原。')) return;
            try {
                const response = await fetch('/api/admin/delete-news', {
                    method: 'POST', headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ id: currentEditingNewsId })
                });
                const result = await response.json();
                if (!response.ok) throw new Error(result.error || '刪除失敗');
                alert('刪除成功！');
                if(editNewsModal) editNewsModal.style.display = 'none';
                await fetchAllNews();
            } catch (error) { alert(`錯誤：${error.message}`); }
        });
    }

    flatpickr("#edit-news-date", { dateFormat: "Y-m-d" });

    // =================================================================
    // 店家資訊管理模組
    // =================================================================
    async function fetchStoreInfo() {
        try {
            const response = await fetch('/api/get-store-info');
            if (!response.ok) throw new Error('無法載入店家資訊');
            const info = await response.json();
            document.getElementById('info-address').value = info.address;
            document.getElementById('info-phone').value = info.phone;
            document.getElementById('info-hours').value = info.opening_hours;
            document.getElementById('info-desc').value = info.description;
        } catch (error) { alert(`錯誤：${error.message}`); }
    }

    if(storeInfoForm) {
        storeInfoForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const formData = {
                address: document.getElementById('info-address').value,
                phone: document.getElementById('info-phone').value,
                opening_hours: document.getElementById('info-hours').value,
                description: document.getElementById('info-desc').value
            };
            try {
                const response = await fetch('/api/admin/update-store-info', {
                    method: 'POST', headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(formData)
                });
                const result = await response.json();
                if (!response.ok) throw new Error(result.error || '更新失敗');
                alert('更新成功！');
            } catch (error) { alert(`錯誤：${error.message}`); }
        });
    }

    // ---- 初始化 ----
    async function initialize() {
        try {
            const response = await fetch('/api/get-class-perks');
            if (!response.ok) throw new Error('無法獲取職業設定');
            classPerks = await response.json();
        } catch (error) {
            console.error('初始化職業設定失敗:', error);
            alert(`警告：無法從 Google Sheet 獲取職業設定。`);
        }
        // 【修改點 5】我們不再在這裡呼叫 showPage
    }

    // 【修改點 6】使用 await 等待 initialize() 完成所有非同步任務
    await initialize();
    // 【修改點 7】在所有東西都準備好之後，最後才呼叫 showPage('dashboard')
    showPage('dashboard'); 
    }
});
 