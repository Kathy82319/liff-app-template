document.addEventListener('DOMContentLoaded', async () => {
    console.log('[DEBUG] 1. DOMContentLoaded event fired.');

    // 登入頁面的表單提交邏輯
    const loginForm = document.getElementById('login-form');
    if (loginForm) {
        console.log('[DEBUG] 1a. Login form found, setting up listener.');
        loginForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const username = document.getElementById('login-username').value.trim();
            const password = document.getElementById('login-password').value;
            const loginStatus = document.getElementById('login-status');
            const loginButton = document.getElementById('login-button');
            
            loginStatus.textContent = '';
            loginButton.disabled = true;
            loginButton.textContent = '登入中...';
            
            try {
                const response = await fetch('/api/admin/auth/login', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ username, password })
                });
                const result = await response.json();
                if (!response.ok) throw new Error(result.error || '登入失敗');

                console.log('[DEBUG] Login successful, redirecting to admin panel...');
                window.location.href = '/admin-panel.html';

            } catch (error) {
                loginStatus.textContent = error.message;
            } finally {
                loginButton.disabled = false;
                loginButton.textContent = '登入';
            }
        });
        return; // 如果是登入頁，後續代碼不執行
    }
    
    // 後台頁面的啟動邏輯
    async function checkLoginStatus() {
        try {
            console.log('[DEBUG] 2. Starting login status check...');
            const response = await fetch('/api/admin/auth/status');
            
            if (response.ok) {
                console.log('[DEBUG] 3. Login status OK. Initializing admin panel...');
                const adminPanel = document.getElementById('admin-panel');
                if(adminPanel) {
                    adminPanel.style.display = 'block';
                    console.log('[DEBUG] 4. Admin panel display set to "block".');
                } else {
                    console.error('[DEBUG] CRITICAL: Admin panel element not found!');
                    return;
                }
                await initializeAdminPanel();
            } else {
                console.error('[DEBUG] Login status check failed. Redirecting to login page.');
                window.location.href = '/admin-login.html';
            }
        } catch (error) {
            console.error('[DEBUG] Error during login status check:', error);
            window.location.href = '/admin-login.html';
        }
    }

    if (window.location.pathname.includes('admin-panel.html')) {
        await checkLoginStatus();
    }
});

async function initializeAdminPanel() {

    // --- DOM 元素宣告 ---
    const mainNav = document.querySelector('.nav-tabs');
    const pages = document.querySelectorAll('.page');
    const dashboardGrid = document.getElementById('dashboard-grid');
    const resetDemoDataBtn = document.getElementById('reset-demo-data-btn');
    const userListTbody = document.getElementById('user-list-tbody');
    const userSearchInput = document.getElementById('user-search-input');
    const editUserModal = document.getElementById('edit-user-modal');
    const editUserForm = document.getElementById('edit-user-form');
    const syncD1ToSheetBtn = document.getElementById('sync-d1-to-sheet-btn');
    const userDetailsModal = document.getElementById('user-details-modal');
    const productListTbody = document.getElementById('product-list-tbody')
    const productSearchInput = document.getElementById('product-search-input');
    const editProductModal = document.getElementById('edit-product-modal');
    const editProductForm = document.getElementById('edit-product-form');
    const syncProductsBtn = document.getElementById('sync-product-btn');
    const bookingListTbody = document.getElementById('booking-list-tbody');
    const manageBookingDatesBtn = document.getElementById('manage-booking-dates-btn');
    const bookingSettingsModal = document.getElementById('booking-settings-modal');
    const createBookingBtn = document.getElementById('create-booking-btn');
    const createBookingModal = document.getElementById('create-booking-modal');
    const createBookingForm = document.getElementById('create-booking-form');
    const switchToCalendarViewBtn = document.getElementById('switch-to-calendar-view-btn');
    const calendarViewContainer = document.getElementById('calendar-view-container');
    const listViewContainer = document.getElementById('list-view-container');
    const calendarGrid = document.getElementById('calendar-grid');
    const calendarMonthYear = document.getElementById('calendar-month-year');
    const calendarPrevMonthBtn = document.getElementById('calendar-prev-month-btn');
    const calendarNextMonthBtn = document.getElementById('calendar-next-month-btn');
    const cancelBookingModal = document.getElementById('cancel-booking-modal');
    const expHistoryTbody = document.getElementById('exp-history-tbody');
    const expUserFilterInput = document.getElementById('exp-user-filter-input');
    const newsListTbody = document.getElementById('news-list-tbody');
    const addNewsBtn = document.getElementById('add-news-btn');
    const editNewsModal = document.getElementById('edit-news-modal');
    const editNewsForm = document.getElementById('edit-news-form');
    const draftListTbody = document.getElementById('draft-list-tbody');
    const addDraftBtn = document.getElementById('add-draft-btn');
    const editDraftModal = document.getElementById('edit-draft-modal');
    const editDraftForm = document.getElementById('edit-draft-form');
    const storeInfoForm = document.getElementById('store-info-form');
    const qrReaderElement = document.getElementById('qr-reader');
    const scanResultSection = document.getElementById('scan-result');
    const userIdDisplay = document.getElementById('user-id-display');
    const reasonSelect = document.getElementById('reason-select');
    const customReasonInput = document.getElementById('custom-reason-input');
    const expInput = document.getElementById('exp-input');
    const submitExpBtn = document.getElementById('submit-exp-btn');
    const rescanBtn = document.getElementById('rescan-btn');
    const scanStatusMessage = document.querySelector('#scan-status-container');
    const settingsForm = document.getElementById('settings-form');
    const settingsContainer = document.getElementById('settings-container');
    const pointsPage = document.getElementById('page-points');
    const userSearchInputPoints = document.getElementById('user-search-input-points');
    const userSearchResults = document.getElementById('user-search-results');
    const startScanBtn = document.getElementById('start-scan-btn');
    const qrReaderPoints = document.getElementById('qr-reader');
    const selectedUserDisplay = document.getElementById('selected-user-display');
    const pointsEntryForm = document.getElementById('points-entry-form');
    const pointsStatusMessage = document.getElementById('points-status-message');    
    const modalDraftTitle = document.querySelector('#edit-draft-modal #modal-draft-title');
    
    // --- 全域狀態 ---
    let allUsers = [], allProducts = [], allBookings = [], allNews = [], allExpHistory = [], allDrafts = [];
    let classPerks = {};
    let currentCalendarDate = new Date();
    let html5QrCode = null;
    let sortableProducts = null;
    let allSettings = [];
    let currentSelectedUserForPoints = null;
    let currentEditingDraftId = null;

    // --- 頁面切換邏輯 ---
    function showPage(pageId) {
        if (html5QrCode && html5QrCode.isScanning) {
            html5QrCode.stop().catch(err => console.error("停止掃描器失敗", err));
        }
        pages.forEach(page => page.classList.remove('active'));
        const targetPageId = pageId === 'scan' ? 'points' : pageId;
        const targetPage = document.getElementById(`page-${targetPageId}`);
        if (targetPage) {
            targetPage.classList.add('active');
        }

        document.querySelectorAll('.nav-tabs a').forEach(link => {
            const linkTarget = link.getAttribute('href').substring(1);
            link.classList.toggle('active', linkTarget === pageId);
        });

        const pageLoader = {
            'dashboard': fetchDashboardStats,
            'users': fetchAllUsers,
            'inventory': fetchAllProducts,
            'bookings': () => fetchAllBookings('today'),
            'exp-history': fetchAllExpHistory,
            'news': fetchAllNews,
            'drafts': fetchAllDrafts,
            'store-info': fetchStoreInfo,
            'points': initializePointsPage,
            'settings': fetchAndRenderSettings
        };
        pageLoader[targetPageId]?.();
    }

    mainNav.addEventListener('click', (event) => {
        if (event.target.tagName === 'A') {
            event.preventDefault();
            const pageId = event.target.getAttribute('href').substring(1);
            showPage(pageId);
        }
    });

    
    // =================================================================
    // 儀表板模組 (Dashboard)
    // =================================================================
    async function fetchDashboardStats() {
        try {
            const response = await fetch('/api/admin/dashboard-stats');
            if (!response.ok) throw new Error('無法獲取儀表板數據');
            const stats = await response.json();
            
            const guestsEl = document.getElementById('stat-today-guests');
            if(guestsEl) guestsEl.textContent = stats.today_total_guests || 0;

        } catch (error) {
            console.error('獲取儀表板數據失敗:', error);
            if(dashboardGrid) dashboardGrid.innerHTML = `<p style="color:red;">讀取數據失敗</p>`;
        }
    }

    if (dashboardGrid) {
        dashboardGrid.addEventListener('click', (e) => {
            const card = e.target.closest('.stat-card');
            if (!card) return;
            const target = card.dataset.target;
            if (target === 'bookings') {
                showPage('bookings');
                document.querySelector('#booking-status-filter button[data-filter="today"]').click();
            }
        });
    }

    if (resetDemoDataBtn) {
        resetDemoDataBtn.addEventListener('click', async () => {
            if (!confirm('【警告】您真的確定要清空所有展示資料嗎？\n\n此操作將會刪除所有預約和消費紀錄，且無法復原！')) {
                return;
            }
            try {
                resetDemoDataBtn.textContent = '正在清空中...';
                resetDemoDataBtn.disabled = true;
                const response = await fetch('/api/admin/reset-demo-data', { method: 'POST' });
                const result = await response.json();
                if (!response.ok) throw new Error(result.error || '清空失敗');
                alert('展示資料已成功清空！');
                fetchDashboardStats();
                allBookings = [];
                allExpHistory = [];
            } catch (error) {
                alert(`錯誤：${error.message}`);
            } finally {
                resetDemoDataBtn.textContent = '清空所有展示資料';
                resetDemoDataBtn.disabled = false;
            }
        });
    }
    
    // =================================================================
    // 產品/服務管理模組 (Product Management)
    // =================================================================
    async function fetchAllProducts() {
        try {
            const response = await fetch('/api/get-products');
            if (!response.ok) throw new Error('無法獲取產品列表');
            allProducts = await response.json();
            applyProductFiltersAndRender();
            initializeProductDragAndDrop();
        } catch (error) {
            console.error('獲取產品列表失敗:', error);
            if (productListTbody) productListTbody.innerHTML = `<tr><td colspan="6" style="color: red; text-align: center;">讀取資料失敗</td></tr>`;
        }
    }

    function applyProductFiltersAndRender() {
        const searchTerm = productSearchInput.value.toLowerCase().trim();
        let filtered = searchTerm
            ? allProducts.filter(p => (p.name || '').toLowerCase().includes(searchTerm))
            : [...allProducts];
        renderProductList(filtered);
    }

    function renderProductList(products) {
        if (!productListTbody) return;
        productListTbody.innerHTML = '';
        products.forEach(p => {
            const row = productListTbody.insertRow();
            const cellVisible = row.insertCell();
            cellVisible.innerHTML = `
                <label class="switch">
                    <input type="checkbox" class="visibility-toggle" data-product-id="${p.product_id}" ${p.is_visible ? 'checked' : ''}>
                    <span class="slider"></span>
                </label>`;            
            row.className = 'draggable-row';
            row.dataset.productId = p.product_id;

            let stockDisplay = '無管理';
            if (p.inventory_management_type === 'quantity') stockDisplay = `數量: ${p.stock_quantity ?? 'N/A'}`;
            else if (p.inventory_management_type === 'status') stockDisplay = `狀態: ${p.stock_status ?? 'N/A'}`;
            
            let priceDisplay = '未設定';
            if (p.price_type === 'simple') {
                priceDisplay = `$${p.price}`;
            } else if (p.price_type === 'multiple' && p.price_options) {
                try {
                    const options = JSON.parse(p.price_options);
                    priceDisplay = options.map(opt => `${opt.name}: $${opt.price}`).join('<br>');
                } catch (e) { priceDisplay = '價格格式錯誤'; }
            }
            
            const cellOrder = row.insertCell();
            const cellProduct = row.insertCell();
            const cellStock = row.insertCell();
            const cellPrice = row.insertCell();          
            const cellActions = row.insertCell();

            cellOrder.className = 'drag-handle-cell';
            cellOrder.innerHTML = `<span class="drag-handle">⠿</span> ${p.display_order}`;
            
            cellProduct.className = 'compound-cell';
            cellProduct.style.textAlign = 'left';
            cellProduct.innerHTML = `<div class="main-info">${p.name}</div><div class="sub-info">ID: ${p.product_id}</div><div class="sub-info">分類: ${p.category || '未分類'}</div>`;

            cellStock.innerHTML = stockDisplay;
            cellPrice.innerHTML = priceDisplay;
            cellVisible.textContent = p.is_visible ? '是' : '否';
            cellActions.innerHTML = `<td class="actions-cell"><button class="action-btn btn-edit-product" data-productid="${p.product_id}" style="background-color: #ffc107; color: #000;">編輯</button></td>`;
        });
    }

    function initializeProductDragAndDrop() {
        if (sortableProducts) sortableProducts.destroy();
        if (productListTbody) {
            sortableProducts = new Sortable(productListTbody, {
                animation: 150,
                handle: '.drag-handle',
                onEnd: async (evt) => {
                    const orderedIds = Array.from(productListTbody.children).map(row => row.dataset.productId);
                    try {
                        const response = await fetch('/api/admin/update-product-order', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ orderedproductIds: orderedIds })
                        });
                        if (!response.ok) throw new Error('儲存順序失敗');
                        
                        orderedIds.forEach((id, index) => {
                           const product = allProducts.find(p => p.product_id === id);
                           if(product) product.display_order = index + 1;
                        });
                        allProducts.sort((a, b) => a.display_order - b.display_order);
                        applyProductFiltersAndRender();

                    } catch (error) {
                        alert(error.message);
                        await fetchAllProducts();
                    }
                }
            });
        }
    }

    if (productSearchInput) {
        productSearchInput.addEventListener('input', applyProductFiltersAndRender);
    }
    
    if (syncProductsBtn) {
        syncProductsBtn.addEventListener('click', async () => {
            if (!confirm('確定要從 Google Sheet 同步所有產品資料到資料庫嗎？\n這將會用 Sheet 上的資料覆蓋現有資料。')) return;
            try {
                syncProductsBtn.textContent = '同步中...';
                syncProductsBtn.disabled = true;
                const response = await fetch('/api/get-products', { method: 'POST' });
                const result = await response.json();
                if (!response.ok) throw new Error(result.details || '同步失敗');
                alert(result.message || '同步成功！');
                await fetchAllProducts();
            } catch (error) {
                alert(`錯誤：${error.message}`);
            } finally {
                syncProductsBtn.textContent = '同步至資料庫';
                syncProductsBtn.disabled = false;
            }
        });
    }

    if (productListTbody) {
        productListTbody.addEventListener('click', (e) => {
            const button = e.target.closest('.btn-edit-product');
            if (button) {
                openEditProductModal(button.dataset.productid);
            }
        });
    }
   
    function openEditProductModal(productId) {
        const product = allProducts.find(p => p.product_id === productId);
        if (!product || !editProductModal || !editProductForm) return;

        editProductForm.reset();
        editProductModal.querySelector('#modal-product-title').textContent = `編輯產品：${product.name}`;
        
        document.getElementById('edit-product-id').value = product.product_id;
        document.getElementById('edit-product-id-display').value = product.product_id;
        document.getElementById('edit-product-name').value = product.name;
        document.getElementById('edit-product-description').value = product.description || '';
        document.getElementById('edit-product-category').value = product.category || '';
        document.getElementById('edit-product-tags').value = product.tags || '';
        document.getElementById('edit-product-images').value = product.images || '[]';
        document.getElementById('edit-product-is-visible').checked = !!product.is_visible;

        const inventoryTypeSelect = document.getElementById('edit-product-inventory-type');
        const quantityGroup = document.getElementById('stock-quantity-group');
        const statusGroup = document.getElementById('stock-status-group');
        
        inventoryTypeSelect.value = product.inventory_management_type || 'none';
        quantityGroup.style.display = (inventoryTypeSelect.value === 'quantity') ? 'block' : 'none';
        statusGroup.style.display = (inventoryTypeSelect.value === 'status') ? 'block' : 'none';
        document.getElementById('edit-product-stock-quantity').value = product.stock_quantity || 0;
        document.getElementById('edit-product-stock-status').value = product.stock_status || '';

        const images = JSON.parse(product.images || '[]');
        for(let i=1; i<=5; i++){
            document.getElementById(`edit-product-image-${i}`).value = images[i-1] || '';
        }
        document.getElementById('edit-product-price-options').value = product.price_options || '[]';

        for (let i = 1; i <= 5; i++) {
            document.getElementById(`edit-spec-${i}-name`).value = product[`spec_${i}_name`] || '';
            document.getElementById(`edit-spec-${i}-value`).value = product[`spec_${i}_value`] || '';
        }

        editProductModal.style.display = 'flex';
    }

    if(editProductModal){
        document.getElementById('edit-product-inventory-type').addEventListener('change', (e) => {
            document.getElementById('stock-quantity-group').style.display = (e.target.value === 'quantity') ? 'block' : 'none';
            document.getElementById('stock-status-group').style.display = (e.target.value === 'status') ? 'block' : 'none';
        });
    }

    if (editProductForm) {
        editProductForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const productId = document.getElementById('edit-product-id').value;
            const images = [];
            for(let i=1; i<=5; i++){
                const imgUrl = document.getElementById(`edit-product-image-${i}`).value.trim();
                if(imgUrl) images.push(imgUrl);
            }
            const formData = new FormData(editProductForm);
            const updatedData = {
                images: JSON.stringify(images),
                price: document.getElementById('edit-product-price').value,                
                productId: productId,
                name: document.getElementById('edit-product-name').value,
                description: document.getElementById('edit-product-description').value,
                category: document.getElementById('edit-product-category').value,
                tags: document.getElementById('edit-product-tags').value,
                is_visible: document.getElementById('edit-product-is-visible').checked,
                inventory_management_type: document.getElementById('edit-product-inventory-type').value,
                stock_quantity: document.getElementById('edit-product-stock-quantity').value,
                stock_status: document.getElementById('edit-product-stock-status').value,
                price: document.getElementById('edit-product-price').value,
            };
            for(let i=1; i<=5; i++){
                updatedData[`spec_${i}_name`] = document.getElementById(`edit-spec-${i}-name`).value;
                updatedData[`spec_${i}_value`] = document.getElementById(`edit-spec-${i}-value`).value;
            }

            try {
                const response = await fetch('/api/admin/update-product-details', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(updatedData)
                });
                if (!response.ok) {
                    const err = await response.json();
                    throw new Error(err.error || '更新失敗');
                }
                
                await fetchAllProducts();
                editProductModal.style.display = 'none';
            } catch (error) {
                alert(`錯誤：${error.message}`);
            }
        });
    }

    if(editProductModal) {
      editProductModal.querySelector('.modal-close').addEventListener('click', () => editProductModal.style.display = 'none');
      editProductModal.querySelector('.btn-cancel').addEventListener('click', () => editProductModal.style.display = 'none');
    }
    
    // =================================================================
    // 顧客管理模組 (User Management)
    // =================================================================
    async function fetchAllUsers() {
        try {
            // 先獲取設定，因為後續的 openEditUserModal 會用到
            if (allSettings.length === 0) {
                const settingsResponse = await fetch('/api/admin/get-settings');
                if (!settingsResponse.ok) throw new Error('無法預先獲取系統設定');
                allSettings = await settingsResponse.json();
            }
            
            const usersResponse = await fetch('/api/get-users');
            if (!usersResponse.ok) throw new Error('無法獲取使用者列表');
            allUsers = await usersResponse.json();
            
            renderUserList(allUsers);
        } catch (error) {
            console.error('獲取使用者列表失敗:', error);
            if(userListTbody) userListTbody.innerHTML = `<tr><td colspan="6" style="color: red; text-align: center;">讀取使用者資料失敗</td></tr>`;
        }
    }


    function renderUserList(users) {
        if (!userListTbody) return;
        userListTbody.innerHTML = '';
        users.forEach(user => {
            const row = userListTbody.insertRow();
            row.dataset.userId = user.user_id;
            row.style.cursor = 'pointer';
            const displayName = user.nickname ? `${user.line_display_name} (${user.nickname})` : user.line_display_name;
            
            row.innerHTML = `
                <td class="compound-cell" style="text-align: left;">
                    <div class="main-info">${displayName || 'N/A'}</div>
                    <div class="sub-info">${user.user_id}</div>
                </td>
                <td>${user.class || '無'}</td>
                <td>${user.level} / ${user.current_exp}</td>
                <td>${user.perk || '無'}</td>
                <td><span class="tag-display">${user.tag || '無'}</span></td>
                <td class="actions-cell">
                    <button class="action-btn btn-edit-user" data-userid="${user.user_id}" style="background-color: #ffc107; color: #000;">編輯</button>
                </td>
            `;
        });
    }
    
    if (userListTbody) {
        userListTbody.addEventListener('click', (event) => {
            const target = event.target;
            const row = target.closest('tr');
            if (!row || !row.dataset.userId) return;
            const userId = row.dataset.userId;
            
            if (target.classList.contains('btn-edit-user')) {
                openEditUserModal(userId);
            } else {
                openUserDetailsModal(userId);
            }
        });
    }

    if (userSearchInput) {
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
        if (!user || !editUserModal || !editUserForm) return;

        editUserForm.reset();
        editUserModal.querySelector('#modal-user-title').textContent = `編輯：${user.line_display_name}`;
        
        document.getElementById('edit-user-id').value = user.user_id;
        document.getElementById('edit-level-input').value = user.level;
        document.getElementById('edit-exp-input').value = user.current_exp;
        document.getElementById('edit-notes-textarea').value = user.notes || '';

        // --- 【核心修改】從系統設定動態產生下拉選單 ---
        const classSelect = document.getElementById('edit-class-select');
        const otherClassInput = document.getElementById('edit-class-other-input');
        const perkInput = document.getElementById('edit-perk-input');
        
        classSelect.innerHTML = '<option value="">無方案</option>';
        let membershipPlans = [];
        const plansSetting = allSettings.find(s => s.key === 'LOGIC_MEMBERSHIP_PLANS');
        
        if (plansSetting && plansSetting.value) {
            try {
                membershipPlans = JSON.parse(plansSetting.value);
                membershipPlans.forEach(plan => {
                    classSelect.add(new Option(plan.planName, plan.planName));
                });
            } catch(e) {
                console.error("解析會員方案設定失敗:", e);
            }
        }
        classSelect.add(new Option('其他 (自訂)', 'other'));
        
        // 設定預設值
        const foundPlan = membershipPlans.find(p => p.planName === user.class);
        if (foundPlan) {
            classSelect.value = user.class;
            perkInput.value = foundPlan.perk;
            otherClassInput.style.display = 'none';
        } else {
            classSelect.value = 'other';
            otherClassInput.style.display = 'block';
            otherClassInput.value = user.class || '';
            perkInput.value = user.perk || '';
        }
        
        // --- 標籤部分維持不變 ---
        const tagSelect = document.getElementById('edit-tag-select');
        const otherTagInput = document.getElementById('edit-tag-other-input');
        const standardTags = ["", "會員", "員工", "黑名單"];
        if (user.tag && !standardTags.includes(user.tag)) {
            tagSelect.value = 'other';
            otherTagInput.style.display = 'block';
            otherTagInput.value = user.tag;
        } else {
            tagSelect.value = user.tag || '';
            otherTagInput.style.display = 'none';
        }

        editUserModal.style.display = 'flex';
    }

    if(editUserModal) {
        editUserModal.querySelector('.modal-close').addEventListener('click', () => editUserModal.style.display = 'none');
        editUserModal.querySelector('.btn-cancel').addEventListener('click', () => editUserModal.style.display = 'none');

        // 【修改】監聽會員方案的 select 元素
        const classSelect = document.getElementById('edit-class-select');
        const otherClassInput = document.getElementById('edit-class-other-input');
        const perkInput = document.getElementById('edit-perk-input');
        
        classSelect?.addEventListener('change', (e) => {
            const selectedValue = e.target.value;
            otherClassInput.style.display = (selectedValue === 'other') ? 'block' : 'none';
            
            if (selectedValue === 'other') {
                 perkInput.value = ''; // 自訂時清空優惠
            } else if (selectedValue === '') {
                 perkInput.value = ''; // '無方案' 也清空
            } else {
                const plansSetting = allSettings.find(s => s.key === 'LOGIC_MEMBERSHIP_PLANS');
                if (plansSetting) {
                    const membershipPlans = JSON.parse(plansSetting.value);
                    const foundPlan = membershipPlans.find(p => p.planName === selectedValue);
                    perkInput.value = foundPlan ? foundPlan.perk : '';
                }
            }
        });
        
        document.getElementById('edit-tag-select')?.addEventListener('change', (e) => {
            document.getElementById('edit-tag-other-input').style.display = (e.target.value === 'other') ? 'block' : 'none';
        });
    }

    if (editUserForm) {
        editUserForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const userId = document.getElementById('edit-user-id').value;
            
            let newClass = document.getElementById('edit-class-select').value;
            if (newClass === 'other') newClass = document.getElementById('edit-class-other-input').value.trim();
            
            let newPerk = document.getElementById('edit-perk-input').value.trim();
            
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
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(updatedData)
                });
                if (!response.ok) {
                    const err = await response.json();
                    throw new Error(err.error || '更新失敗');
                }
                
                await fetchAllUsers();
                editUserModal.style.display = 'none';
            } catch (error) {
                alert(`錯誤：${error.message}`);
            }
        });
    }
    
    async function openUserDetailsModal(userId) {
        const contentContainer = userDetailsModal.querySelector('#user-details-content');
        if (!userDetailsModal || !contentContainer) return;
        
        contentContainer.innerHTML = '<p>讀取中...</p>';
        userDetailsModal.style.display = 'flex';

        try {
            const response = await fetch(`/api/admin/user-details?userId=${userId}`);
            if (!response.ok) throw new Error('API 請求失敗');
            const data = await response.json();
            renderUserDetails(data);
        } catch (error) {
            console.error("CRM 執行錯誤:", error);
            contentContainer.innerHTML = `<p style="color:red;">載入資料時發生錯誤：${error.message}</p>`;
        }
    }

    function renderUserDetails(data) {
        const { profile, bookings, exp_history } = data;
        const contentContainer = userDetailsModal.querySelector('#user-details-content');
        if (!contentContainer) return;

        const displayName = profile.nickname || profile.line_display_name;
        userDetailsModal.querySelector('#user-details-title').textContent = displayName;

        contentContainer.innerHTML = `
            <div class="details-grid">
                <div class="profile-summary">
                    <img src="/api/admin/get-avatar?userId=${profile.user_id}" alt="Avatar">
                    <h4>${displayName}</h4>
                    <p><strong>姓名:</strong> ${profile.real_name || '未設定'}</p>
                    <p><strong>電話:</strong> ${profile.phone || '未設定'}</p>
                    <p><strong>Email:</strong> ${profile.email || '未設定'}</p>
                    <p><strong>偏好類型:</strong> ${profile.preferred_product || '未設定'}</p>
                    <hr>
                    <p><strong>等級:</strong> ${profile.level} (${profile.current_exp}/10 EXP)</p>
                    <p><strong>會員方案:</strong> ${profile.class}</p>
                    <p><strong>特殊優惠:</strong> ${profile.perk}</p>
                    <p><strong>標籤:</strong> ${profile.tag}</p>
                </div>
                <div class="profile-details">
                    ${profile.notes ? `<div class="crm-notes-section" style="margin-bottom: 1rem; padding: 0.8rem; background-color: #fffbe6; border-radius: 6px; border: 1px solid #ffe58f; max-height: 5em; overflow-y: auto;"><h4>顧客備註</h4><p style="white-space: pre-wrap; margin: 0;">${profile.notes}</p></div>` : ''}
                    <div class="details-tabs">
                        <button class="details-tab active" data-target="tab-bookings">預約紀錄</button>
                        <button class="details-tab" data-target="tab-exp">點數紀錄</button>
                    </div>
                    <div class="details-tab-content active" id="tab-bookings"></div>
                    <div class="details-tab-content" id="tab-exp"></div>
                </div>
            </div>
            <div class="message-sender">
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
            </div>
        `;

        contentContainer.querySelector('#tab-bookings').appendChild(renderHistoryTable(bookings, ['booking_date', 'num_of_people', 'status'], { booking_date: '預約日', num_of_people: '人數', status: '狀態' }));
        contentContainer.querySelector('#tab-exp').appendChild(renderHistoryTable(exp_history, ['created_at', 'reason', 'exp_added'], { created_at: '日期', reason: '原因', exp_added: '點數' }));

        contentContainer.querySelector('.details-tabs').addEventListener('click', e => {
            if (e.target.tagName === 'BUTTON') {
                contentContainer.querySelector('.details-tab.active')?.classList.remove('active');
                e.target.classList.add('active');
                contentContainer.querySelector('.details-tab-content.active')?.classList.remove('active');
                contentContainer.querySelector(`#${e.target.dataset.target}`)?.classList.add('active');
            }
        });
        
        loadAndBindMessageDrafts(profile.user_id);
    }
    
    function renderHistoryTable(items, columns, headers) {
        const fragment = document.createDocumentFragment();
        if (!items || items.length === 0) {
            const p = document.createElement('p');
            p.textContent = '無相關紀錄';
            fragment.appendChild(p);
            return fragment;
        }
        
        const table = document.createElement('table');
        table.innerHTML = `<thead><tr>${Object.values(headers).map(h => `<th>${h}</th>`).join('')}</tr></thead>`;
        const tbody = table.createTBody();

        items.forEach(item => {
            const row = tbody.insertRow();
            columns.forEach(col => {
                const cell = row.insertCell();
                let value = item[col];
                if (col.includes('date') || col.includes('_at')) {
                    value = new Date(value).toLocaleDateString();
                }
                cell.textContent = value;
            });
        });
        
        fragment.appendChild(table);
        return fragment;
    }
    
    if(userDetailsModal) {
      userDetailsModal.querySelector('.modal-close').addEventListener('click', () => userDetailsModal.style.display = 'none');
    }
    
    async function loadAndBindMessageDrafts(userId) {
        const select = document.querySelector('#message-draft-select');
        const content = document.querySelector('#direct-message-content');
        const sendBtn = document.querySelector('#send-direct-message-btn');
        if (!select || !content || !sendBtn) return;
        
        await fetchAllDrafts();
        select.innerHTML = '<option value="">-- 手動輸入或選擇草稿 --</option>';
        allDrafts.forEach(d => select.add(new Option(d.title, d.content)));
        
        select.onchange = () => { content.value = select.value; };

        sendBtn.onclick = async () => {
            const message = content.value.trim();
            if (!message) { alert('訊息內容不可為空！'); return; }
            if (!confirm(`確定要發送以下訊息給 ${userId} 嗎？\n\n${message}`)) return;
            try {
                sendBtn.textContent = '發送中...';
                sendBtn.disabled = true;
                const response = await fetch('/api/send-message', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ userId, message })
                });
                if (!response.ok) throw new Error('發送失敗');
                alert('訊息發送成功！');
                content.value = '';
                select.value = '';
            } catch (error) {
                alert(`錯誤：${error.message}`);
            } finally {
                sendBtn.textContent = '確認發送';
                sendBtn.disabled = false;
            }
        };
    }
    
    if (syncD1ToSheetBtn) {
        syncD1ToSheetBtn.addEventListener('click', async () => {
            if (!confirm('確定要將所有 D1 使用者資料完整同步至 Google Sheet 嗎？\n這將會覆蓋 Sheet 上的現有資料。')) return;
            try {
                syncD1ToSheetBtn.textContent = '同步中...';
                syncD1ToSheetBtn.disabled = true;
                const response = await fetch('/api/sync-d1-to-sheet', { method: 'POST' });
                const result = await response.json();
                if (!response.ok) throw new Error(result.error || '同步失敗');
                alert(result.message);
            } catch (error) {
                alert(`錯誤：${error.message}`);
            } finally {
                syncD1ToSheetBtn.textContent = '同步至 Google Sheet';
                syncD1ToSheetBtn.disabled = false;
            }
        });
    }

    // =================================================================
    // 預約管理模組 (Booking Management)
    // =================================================================
    let bookingDatepicker = null;
    let enabledDates = [];

    async function fetchAllBookings(status = 'all_upcoming') {
        try {
            const response = await fetch(`/api/get-bookings?status=${status}`);
            if (!response.ok) throw new Error('無法獲取預約列表');
            allBookings = await response.json();

            // 根據當前顯示的視圖（列表或日曆）來渲染
            if (document.getElementById('list-view-container').style.display !== 'none') {
                renderBookingList(allBookings);
            }
            if (document.getElementById('calendar-view-container').style.display !== 'none') {
                updateCalendar();
            }
        } catch (error) { 
            console.error('獲取預約列表失敗:', error); 

            if(bookingListTbody) bookingListTbody.innerHTML = '<tr><td colspan="5" style="color: red; text-align: center;">讀取預約失敗</td></tr>';
        }
    }

    function renderBookingList(bookings) {

        if (!bookingListTbody) return;
        
        // 列表篩選邏輯
        const activeFilter = document.querySelector('#booking-status-filter .active')?.dataset.filter || 'today';
        let filteredList = bookings;
        if (activeFilter === 'today') {
            const today = new Date().toISOString().split('T')[0];
            filteredList = bookings.filter(b => b.booking_date === today && b.status !== 'cancelled');
        } else if (activeFilter !== 'all_upcoming') {
             filteredList = bookings.filter(b => b.status === activeFilter);
        }

        bookingListTbody.innerHTML = '';
        if (filteredList.length === 0) {
            bookingListTbody.innerHTML = '<tr><td colspan="5" style="text-align: center;">找不到符合條件的預約。</td></tr>';
            return;
        }

        filteredList.forEach(booking => {
            const row = bookingListTbody.insertRow();
            let statusText = '未知';
            if (booking.status === 'confirmed') statusText = '預約成功';
            if (booking.status === 'checked-in') statusText = '已報到';
            if (booking.status === 'cancelled') statusText = '已取消';

            row.innerHTML = `
                <td class="compound-cell">
                    <div class="main-info">${booking.booking_date}</div>
                    <div class="sub-info">${booking.time_slot}</div>
                </td>
                <td class="compound-cell">
                    <div class="main-info">${booking.contact_name}</div>
                    <div class="sub-info">${booking.contact_phone}</div>
                </td>
                <td>${booking.num_of_people}</td>
                <td>${statusText}</td>
                <td class="actions-cell">
                    <button class="action-btn btn-check-in" data-booking-id="${booking.booking_id}" style="background-color: var(--success-color);" ${booking.status !== 'confirmed' ? 'disabled' : ''}>報到</button>
                    <button class="action-btn btn-cancel-booking" data-booking-id="${booking.booking_id}" style="background-color: var(--danger-color);" ${booking.status === 'cancelled' ? 'disabled' : ''}>取消</button>
                </td>
            `;
        });
    }

    function updateCalendar() {
        if (!calendarGrid || !calendarMonthYear) return;
        const year = currentCalendarDate.getFullYear();
        const month = currentCalendarDate.getMonth();
        calendarMonthYear.textContent = `${year} 年 ${month + 1} 月`;
        calendarGrid.innerHTML = '';
        ['日', '一', '二', '三', '四', '五', '六'].forEach(day => {
            calendarGrid.innerHTML += `<div class="calendar-weekday">${day}</div>`;
        });

        const firstDayOfMonth = new Date(year, month, 1);
        const lastDayOfMonth = new Date(year, month + 1, 0);
        const startingDayOfWeek = firstDayOfMonth.getDay();

        for (let i = 0; i < startingDayOfWeek; i++) {
            calendarGrid.innerHTML += `<div class="calendar-day day-other-month"></div>`;
        }

        for (let day = 1; day <= lastDayOfMonth.getDate(); day++) {
            const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
            const bookingsForDay = allBookings.filter(b => b.booking_date === dateStr);
            const isPast = new Date(dateStr) < new Date(new Date().toDateString());
            
            let bookingsHTML = bookingsForDay.map(b => {
                const actionsHTML = `
                    <div class="actions">
                        <button class="action-btn btn-check-in" data-booking-id="${b.booking_id}" style="background:var(--success-color);" ${b.status !== 'confirmed' || isPast ? 'disabled' : ''}>✓</button>
                        <button class="action-btn btn-cancel-booking" data-booking-id="${b.booking_id}" style="background:var(--danger-color);" ${b.status === 'cancelled' ? 'disabled' : ''}>✗</button>
                    </div>`;

                return `<div class="calendar-booking status-${b.status}" data-booking-id="${b.booking_id}">
                            ${b.time_slot} ${b.contact_name}
                            ${actionsHTML}
                        </div>`;
            }).join('');
            
            calendarGrid.innerHTML += `<div class="calendar-day ${isPast ? 'is-past' : ''}"><span class="day-number">${day}</span>${bookingsHTML}</div>`;
        }
    }
    
    // --- 事件監聽器 ---

    if (calendarGrid) {
        calendarGrid.addEventListener('click', async (e) => {
            const button = e.target.closest('button.action-btn');
            if(!button) return;
            
            const bookingId = button.dataset.bookingId;
            if(!bookingId) return;
            const booking = allBookings.find(b => b.booking_id == bookingId);
            if(!booking) return;

            if (button.classList.contains('btn-check-in')) {
                if (confirm(`確定要將 ${booking.booking_date} ${booking.contact_name} 的預約標示為「已報到」嗎？`)) {
                    await updateBookingStatus(Number(bookingId), 'checked-in');
                }
            } else if (button.classList.contains('btn-cancel-booking')) {
                openCancelBookingModal(booking);
            }
        });
    }


    if (bookingListTbody) {
        bookingListTbody.addEventListener('click', async (event) => {
            const target = event.target;
            if (!target.classList.contains('action-btn')) return;

            const bookingId = target.closest('td').querySelector('.action-btn').dataset.bookingid;
            if (!bookingId) return;
            const booking = allBookings.find(b => b.booking_id == bookingId);
            if (!booking) return;

            if (target.classList.contains('btn-check-in')) {
                if (confirm(`確定要將 ${booking.booking_date} ${booking.contact_name} 的預約標示為「已報到」嗎？`)) {
                    await updateBookingStatus(Number(bookingId), 'checked-in');
                }
            } else if (target.classList.contains('btn-cancel-booking')) {
                openCancelBookingModal(booking);
            }
        });
    }

    async function updateBookingStatus(bookingId, status) {
        try {
            const response = await fetch('/api/update-booking-status', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ bookingId, status })
            });
            if (!response.ok) throw new Error(`將狀態更新為 ${status} 失敗`);
            alert('狀態更新成功！');
            const activeFilter = document.querySelector('#booking-status-filter .active')?.dataset.filter || 'all_upcoming';
            await fetchAllBookings(activeFilter); // 重新載入數據
        } catch (error) {
            alert(`錯誤：${error.message}`);
        }
    }
    

    async function initializeBookingSettings() {
        try {
            const response = await fetch('/api/admin/booking-settings');
            if (!response.ok) throw new Error('無法獲取公休日設定');
            enabledDates = await response.json();
            
            if (bookingDatepicker) bookingDatepicker.destroy(); // 確保銷毀舊的實例

            bookingDatepicker = flatpickr("#booking-datepicker-admin-container", {
                inline: true,
                mode: "multiple",
                dateFormat: "Y-m-d",
                defaultDate: enabledDates,
            });
        } catch (error) {
            console.error("初始化可預約日設定失敗:", error);
            alert("初始化可預約日設定失敗，請檢查 API。");
        }
    }

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
            if(datesToAdd.length > 0) promises.push(fetch('/api/admin/booking-settings', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ dates: datesToAdd, action: 'add' }) }));
            if(datesToRemove.length > 0) promises.push(fetch('/api/admin/booking-settings', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ dates: datesToRemove, action: 'remove' }) }));
            
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
            if (bookingSettingsModal) bookingSettingsModal.style.display = 'flex';
        });
    }

    if(bookingSettingsModal) {
        bookingSettingsModal.querySelector('.modal-close').addEventListener('click', () => bookingSettingsModal.style.display = 'none');
        bookingSettingsModal.querySelector('.btn-cancel').addEventListener('click', () => bookingSettingsModal.style.display = 'none');
        bookingSettingsModal.querySelector('#save-booking-settings-btn')?.addEventListener('click', saveBookingSettings);
        bookingSettingsModal.querySelector('#open-month-btn')?.addEventListener('click', async () => {
            if (!bookingDatepicker) return;
            const currentDate = bookingDatepicker.currentYear ? new Date(bookingDatepicker.currentYear, bookingDatepicker.currentMonth) : new Date();
            const year = currentDate.getFullYear();
            const month = currentDate.getMonth();

            if(!confirm(`確定要將 ${year} 年 ${month + 1} 月的所有日期都設定為可預約嗎？`)) return;

            try {
                 await fetch('/api/admin/booking-settings', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ year, month, action: 'open_month' }) });
                 await initializeBookingSettings(); // 重新載入
            } catch (error) {
                alert('開啟整月失敗: ' + error.message);
            }
        });
    }

    function openCreateBookingModal() {
        if (!createBookingModal) return;
        createBookingForm.reset();
        flatpickr("#booking-date-input", { dateFormat: "Y-m-d", minDate: "today" });
        const slotSelect = document.getElementById('booking-slot-select');
        slotSelect.innerHTML = '<option value="">-- 請選擇 --</option>';
        for (let hour = 8; hour <= 22; hour++) {
          for(let minute of ['00', '30']){
            if(hour === 22 && minute === '30') continue;
            const timeString = `${String(hour).padStart(2, '0')}:${minute}`;
            slotSelect.add(new Option(timeString, timeString));
          }
        }
        document.getElementById('booking-user-select').style.display = 'none';
        createBookingModal.style.display = 'flex';
    }

    function handleAdminUserSearch(searchTerm) {
        const userSelect = document.getElementById('booking-user-select');
        if (searchTerm.length < 1) {
            userSelect.style.display = 'none';
            return;
        }
        const filteredUsers = allUsers.filter(user =>
            (user.line_display_name || '').toLowerCase().includes(searchTerm) ||
            (user.nickname || '').toLowerCase().includes(searchTerm) ||
            (user.user_id || '').toLowerCase().includes(searchTerm)
        );
        userSelect.innerHTML = '<option value="">-- 從搜尋結果中選擇會員 --</option>';
        filteredUsers.forEach(user => {
            const displayName = user.nickname || user.line_display_name;
            userSelect.add(new Option(`${displayName} (${user.user_id.substring(0, 10)}...)`, user.user_id));
        });
        userSelect.style.display = 'block';
    }

    async function handleCreateBookingSubmit(e) {
        e.preventDefault();
        const selectedUserId = document.getElementById('booking-user-select').value;
        if (!selectedUserId) {
            alert('請務必從搜尋結果中選擇一位會員！');
            return;
        }
        const bookingData = {
            userId: selectedUserId,
            bookingDate: document.getElementById('booking-date-input').value,
            timeSlot: document.getElementById('booking-slot-select').value,
            contactName: document.getElementById('booking-name-input').value,
            contactPhone: document.getElementById('booking-phone-input').value,
            numOfPeople: document.getElementById('booking-people-input').value,
            item: document.getElementById('booking-item-input').value
        };
        try {
            const response = await fetch('/api/admin/create-booking', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(bookingData)
            });
            const result = await response.json();
            if (!response.ok) throw new Error(result.error || '建立失敗');
            alert('預約建立成功！');
            createBookingModal.style.display = 'none';
            await fetchAllBookings();
        } catch (error) {
            alert(`錯誤：${error.message}`);
        }
    }

    async function openCancelBookingModal(booking) {
        if (!booking || !cancelBookingModal) return;
        document.getElementById('cancel-booking-info').textContent = `${booking.booking_date} ${booking.contact_name}`;
        const select = document.getElementById('cancel-message-draft-select');
        const content = document.getElementById('cancel-direct-message-content');
        const confirmBtn = document.getElementById('confirm-cancel-booking-btn');
        content.value = '';
        await fetchAllDrafts();
        select.innerHTML = '<option value="">-- 不發送通知或手動輸入 --</option>';
        allDrafts.forEach(draft => select.add(new Option(draft.title, draft.content)));
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
                    await fetch('/api/send-message', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ userId: booking.user_id, message: message })
                    });
                }
                const statusResponse = await fetch('/api/update-booking-status', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ bookingId: Number(booking.booking_id), status: 'cancelled' })
                });
                if (!statusResponse.ok) throw new Error('更新預約狀態失敗');
                
                alert('預約已成功取消！');
                const activeFilter = document.querySelector('#booking-status-filter .active')?.dataset.filter || 'today';
                await fetchAllBookings(activeFilter);
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
    
    if(cancelBookingModal) {
        cancelBookingModal.querySelector('.modal-close').addEventListener('click', () => cancelBookingModal.style.display = 'none');
    }

    // =================================================================
    // 點數紀錄模組 (Experience/Points History)
    // =================================================================
    async function fetchAllExpHistory() {
        try {
            const response = await fetch('/api/admin/exp-history-list');
            if (!response.ok) throw new Error('無法獲取點數紀錄');
            allExpHistory = await response.json();
            renderExpHistoryList(allExpHistory);
        } catch (error) {
            console.error('獲取點數紀錄失敗:', error);
            if (expHistoryTbody) expHistoryTbody.innerHTML = `<tr><td colspan="4" style="color:red;">讀取紀錄失敗</td></tr>`;
        }
    }

    function renderExpHistoryList(records) {
        if (!expHistoryTbody) return;
        expHistoryTbody.innerHTML = '';
        if (records.length === 0) {
            expHistoryTbody.innerHTML = '<tr><td colspan="4" style="text-align: center;">找不到符合條件的紀錄。</td></tr>';
            return;
        }
        records.forEach(record => {
            const row = expHistoryTbody.insertRow();
            const displayName = record.nickname || record.line_display_name || '未知使用者';
            const date = new Date(record.created_at).toLocaleString('sv-SE');
            const expClass = record.exp_added > 0 ? 'exp-gain' : 'exp-loss';
            const expSign = record.exp_added > 0 ? '+' : '';
            
            row.innerHTML = `
                <td class="compound-cell" style="text-align: left;">
                    <div class="main-info">${displayName}</div>
                    <div class="sub-info">${record.user_id}</div>
                </td>
                <td>${date}</td>
                <td>${record.reason}</td>
                <td class="${expClass}" style="font-weight: bold;">${expSign}${record.exp_added}</td>
            `;
        });
    }

    if (expUserFilterInput) {
        expUserFilterInput.addEventListener('input', () => {
            const searchTerm = expUserFilterInput.value.toLowerCase().trim();
            const filteredRecords = searchTerm
                ? allExpHistory.filter(record => 
                    (record.nickname || record.line_display_name || '').toLowerCase().includes(searchTerm) ||
                    (record.user_id || '').toLowerCase().includes(searchTerm)
                  )
                : allExpHistory;
            renderExpHistoryList(filteredRecords);
        });
    }
    
    // =================================================================
    // 系統設定模組 (System Settings)
    // =================================================================
    async function fetchAndRenderSettings() {
        if (!settingsContainer) return;
        try {
            settingsContainer.innerHTML = '<p>正在讀取設定...</p>';
            const response = await fetch('/api/admin/get-settings');
            if (!response.ok) throw new Error('無法獲取設定列表');
            allSettings = await response.json();
            renderSettingsForm(allSettings);
        } catch (error) {
            console.error('獲取設定失敗:', error);
            settingsContainer.innerHTML = `<p style="color:red;">讀取設定失敗: ${error.message}</p>`;
        }
    }

    function renderSettingsForm(settings) {
        if (!settingsContainer) return;
        settingsContainer.innerHTML = '';

        const groupedSettings = {
            FEATURES: { title: '功能開關', items: [] },
            TERMS: { title: '商業術語', items: [] },
            LOGIC: { title: '業務邏輯', items: [] }
        };

        settings.forEach(setting => {
            const groupKey = setting.key.split('_')[0];
            if (groupedSettings[groupKey]) {
                groupedSettings[groupKey].items.push(setting);
            }
        });

        for (const groupName in groupedSettings) {
            const group = groupedSettings[groupName];
            if (group.items.length === 0) continue;

            const groupDiv = document.createElement('div');
            groupDiv.className = 'setting-group';

            const header = document.createElement('div');
            header.className = 'setting-group-header';
            header.innerHTML = `<h4>${group.title}</h4>`;
            
            const body = document.createElement('div');
            body.className = 'setting-group-body';
            
            header.addEventListener('click', () => {
                body.classList.toggle('visible');
            });

            group.items.forEach(setting => {
                let formGroup;
                if (setting.type === 'boolean') {
                    formGroup = createToggleSwitch(setting);
                } else {
                    formGroup = createGenericInput(setting);
                }
                
                if (setting.key.startsWith('TERMS_') || setting.key.startsWith('LOGIC_')) {
                    const featureKey = findRelatedFeatureKey(setting.key);
                    if (featureKey) {
                        formGroup.dataset.dependency = featureKey;
                        const featureSetting = settings.find(s => s.key === featureKey);
                        if (featureSetting && featureSetting.value !== 'true') {
                            formGroup.style.display = 'none';
                        }
                    }
                }
                body.appendChild(formGroup);
            });
            
            groupDiv.appendChild(header);
            groupDiv.appendChild(body);
            settingsContainer.appendChild(groupDiv);
        }
        
        const firstGroupBody = settingsContainer.querySelector('.setting-group-body');
        if (firstGroupBody) {
            firstGroupBody.classList.add('visible');
        }
    }
    
    function createToggleSwitch(setting) {
        const formGroup = document.createElement('div');
        formGroup.className = 'form-group';
        formGroup.style.cssText = 'display: flex; align-items: center; justify-content: space-between;';
        
        const label = document.createElement('label');
        label.htmlFor = setting.key;
        label.textContent = setting.description;
        label.style.marginBottom = '0';

        const switchLabel = document.createElement('label');
        switchLabel.className = 'switch';
        const input = document.createElement('input');
        input.type = 'checkbox';
        input.id = setting.key;
        input.name = setting.key;
        input.checked = (setting.value === 'true');
        const slider = document.createElement('span');
        slider.className = 'slider';

        switchLabel.append(input, slider);
        formGroup.append(label, switchLabel);
        
        input.addEventListener('change', (e) => {
            const isEnabled = e.target.checked;
            document.querySelectorAll(`[data-dependency="${setting.key}"]`).forEach(el => {
                el.style.display = isEnabled ? 'block' : 'none';
            });
        });

        return formGroup;
    }

    function createGenericInput(setting) {
        const formGroup = document.createElement('div');
        formGroup.className = 'form-group';

        const label = document.createElement('label');
        label.htmlFor = setting.key;
        label.textContent = setting.description || setting.key;
        
        let inputElement;
        if (setting.type === 'json') {
            inputElement = document.createElement('textarea');
            inputElement.rows = 4;
            try {
                inputElement.value = JSON.stringify(JSON.parse(setting.value), null, 2);
            } catch (e) {
                inputElement.value = setting.value;
            }
        } else {
            inputElement = document.createElement('input');
            inputElement.type = setting.type === 'number' ? 'number' : 'text';
            inputElement.value = setting.value;
        }
        
        inputElement.id = setting.key;
        inputElement.name = setting.key;
        formGroup.append(label, inputElement);
        return formGroup;
    }

    function findRelatedFeatureKey(key) {
        if (key.includes('BOOKING')) return 'FEATURES_ENABLE_BOOKING_SYSTEM';
        if (key.includes('MEMBERSHIP') || key.includes('POINTS')) return 'FEATURES_ENABLE_MEMBERSHIP_SYSTEM';
        return null;
    }

    // =================================================================
    // 資訊管理模組 (News Management)
    // =================================================================
    async function fetchAllNews() {
        if (allNews.length > 0) {
            renderNewsList(allNews);
            return;
        }
        try {
            const response = await fetch('/api/admin/get-all-news');
            if (!response.ok) throw new Error('無法獲取資訊列表');
            allNews = await response.json();
            renderNewsList(allNews);
        } catch (error) { 
            console.error('獲取資訊列表失敗:', error);
            if (newsListTbody) newsListTbody.innerHTML = `<tr><td colspan="5" style="text-align: center;">讀取失敗</td></tr>`;
        }
    }

    function renderNewsList(newsItems) {
        if(!newsListTbody) return;
        newsListTbody.innerHTML = '';
        newsItems.forEach(news => {
            const row = newsListTbody.insertRow();
            row.innerHTML = `
                <td>${news.title}</td>
                <td>${news.category}</td>
                <td>${news.published_date}</td>
                <td>${news.is_published ? '已發布' : '草稿'}</td>
                <td class="actions-cell">
                    <button class="action-btn btn-edit-news" data-news-id="${news.id}" style="background-color: #ffc107; color: #000;">編輯</button>
                </td>
            `;
        });
    }

    if (newsListTbody) {
        newsListTbody.addEventListener('click', (e) => {
            const button = e.target.closest('.btn-edit-news');
            if (button) {
                const newsId = button.dataset.newsId;
                const newsItem = allNews.find(n => n.id == newsId);
                openEditNewsModal(newsItem);
            }
        });
    }

    function openEditNewsModal(news = null) {
        if (!editNewsModal || !editNewsForm) return;
        editNewsForm.reset();
        
        const modalTitle = editNewsModal.querySelector('#modal-news-title');
        const deleteBtn = editNewsModal.querySelector('#delete-news-btn');
        const newsIdInput = document.getElementById('edit-news-id');
        
        if (news) {
            modalTitle.textContent = '編輯資訊';
            deleteBtn.style.display = 'inline-block';
            newsIdInput.value = news.id;
            document.getElementById('edit-news-title').value = news.title;
            document.getElementById('edit-news-category').value = news.category;
            document.getElementById('edit-news-date').value = news.published_date;
            document.getElementById('edit-news-image').value = news.image_url || '';
            document.getElementById('edit-news-content').value = news.content || '';
            document.getElementById('edit-news-published').checked = !!news.is_published;
        } else {
            modalTitle.textContent = '新增資訊';
            deleteBtn.style.display = 'none';
            newsIdInput.value = '';
        }
        editNewsModal.style.display = 'flex';
    }

    if(addNewsBtn) addNewsBtn.addEventListener('click', () => openEditNewsModal());

    if(editNewsModal) {
        editNewsModal.querySelector('.modal-close').addEventListener('click', () => editNewsModal.style.display = 'none');
        editNewsModal.querySelector('.btn-cancel').addEventListener('click', () => editNewsModal.style.display = 'none');
        
        editNewsForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const newsId = document.getElementById('edit-news-id').value;
            const formData = {
                id: newsId ? Number(newsId) : null,
                title: document.getElementById('edit-news-title').value,
                category: document.getElementById('edit-news-category').value,
                published_date: document.getElementById('edit-news-date').value,
                image_url: document.getElementById('edit-news-image').value,
                content: document.getElementById('edit-news-content').value,
                is_published: document.getElementById('edit-news-published').checked
            };
            const url = newsId ? '/api/admin/update-news' : '/api/admin/create-news';
            try {
                const response = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(formData) });
                const result = await response.json();
                if (!response.ok) throw new Error(result.error || '儲存失敗');
                alert('儲存成功！');
                editNewsModal.style.display = 'none';
                allNews = [];
                await fetchAllNews();
            } catch (error) { alert(`錯誤：${error.message}`); }
        });

        editNewsModal.querySelector('#delete-news-btn').addEventListener('click', async () => {
            const newsId = Number(document.getElementById('edit-news-id').value);
            if (!newsId || !confirm('確定要刪除這則資訊嗎？此操作無法復原。')) return;
            try {
                const response = await fetch('/api/admin/delete-news', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: newsId }) });
                if (!response.ok) throw new Error('刪除失敗');
                alert('刪除成功！');
                editNewsModal.style.display = 'none';
                allNews = [];
                await fetchAllNews();
            } catch (error) { alert(`錯誤：${error.message}`); }
        });
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
            const response = await fetch('api/admin/message-drafts');
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
            const url = 'api/admin/message-drafts';
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
            // 【新增】處理快速上架開關
            if (target.classList.contains('visibility-toggle')) {
                const productId = target.dataset.productId;
                const isVisible = target.checked;
                try {
                    const response = await fetch('/api/admin/toggle-product-visibility', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ productId, isVisible })
                    });
                    if(!response.ok) throw new Error('更新失敗');
                    const product = allProducts.find(p => p.product_id === productId);
                    if(product) product.is_visible = isVisible ? 1 : 0;
                } catch(error) {
                    alert(`更新失敗: ${error.message}`);
                    target.checked = !isVisible; // 操作失敗時，還原 checkbox 狀態
                }
                return; // 結束，避免觸發 row click
            }
            const draftId = target.dataset.draftid;
            if (!draftId) return;

            if (target.classList.contains('btn-edit')) {
                const draft = allDrafts.find(d => d.draft_id == draftId);
                openEditDraftModal(draft);
            } else if (target.classList.contains('btn-delete-draft')) {
                if (confirm('確定要刪除這則草稿嗎？')) {
                    try {
                        const response = await fetch('api/admin/message-drafts', {
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
                const response = await fetch('api/send-message', {
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
    // 店家資訊模組 (Store Info)
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
                if (!response.ok) throw new Error('更新失敗');
                alert('更新成功！');
            } catch (error) { alert(`錯誤：${error.message}`); }
        });
    }

    // =================================================================
    // 點數發放中心模組 (改造後)
    // =================================================================
    function initializePointsPage() {
        if (!document.getElementById('page-points')) return;
        currentSelectedUserForPoints = null;
        userSearchInputPoints.value = '';
        userSearchResults.innerHTML = '';
        pointsEntryForm.style.display = 'none';
        selectedUserDisplay.textContent = '請先從上方搜尋或掃碼選取顧客';
        if(html5QrCode && html5QrCode.isScanning) html5QrCode.stop();
        qrReaderPoints.style.display = 'none';
        pointsStatusMessage.textContent = '';
    }

    async function handleUserSearchForPoints(query) {
        if (query.length < 1) {
            userSearchResults.innerHTML = '';
            return;
        }
        try {
            const response = await fetch(`/api/admin/user-search?q=${encodeURIComponent(query)}`);
            if (!response.ok) throw new Error('搜尋失敗');
            const users = await response.json();
            userSearchResults.innerHTML = '';
            if (users.length === 0) {
                userSearchResults.innerHTML = '<li>找不到符合的顧客</li>';
            } else {
                users.forEach(user => {
                    const li = document.createElement('li');
                    li.textContent = `${user.nickname || user.line_display_name} (${user.user_id.substring(0, 15)}...)`;
                    li.dataset.userId = user.user_id;
                    li.dataset.userName = user.nickname || user.line_display_name;
                    userSearchResults.appendChild(li);
                });
            }
        } catch (error) {
            console.error(error);
            userSearchResults.innerHTML = '<li>搜尋時發生錯誤</li>';
        }
    }

    if (userSearchInputPoints) {
        userSearchInputPoints.addEventListener('input', (e) => handleUserSearchForPoints(e.target.value));
    }

    if (userSearchResults) {
        userSearchResults.addEventListener('click', (e) => {
            const li = e.target.closest('li');
            if (li && li.dataset.userId) {
                currentSelectedUserForPoints = {
                    id: li.dataset.userId,
                    name: li.dataset.userName
                };
                selectedUserDisplay.textContent = `${currentSelectedUserForPoints.name} (${currentSelectedUserForPoints.id})`;
                pointsEntryForm.style.display = 'block';
                userSearchResults.innerHTML = '';
                userSearchInputPoints.value = '';
            }
        });
    }

    if(startScanBtn){
        startScanBtn.addEventListener('click', () => {
            qrReaderPoints.style.display = 'block';
            if (html5QrCode && html5QrCode.isScanning) return;
            html5QrCode = new Html5Qrcode("qr-reader");
            html5QrCode.start({ facingMode: "environment" }, { fps: 10, qrbox: 250 },
                async (decodedText, decodedResult) => {
                    await html5QrCode.stop();
                    qrReaderPoints.style.display = 'none';
                    const user = allUsers.find(u => u.user_id === decodedText);
                    if(user){
                         currentSelectedUserForPoints = { id: user.user_id, name: user.nickname || user.line_display_name };
                         selectedUserDisplay.textContent = `${currentSelectedUserForPoints.name} (${currentSelectedUserForPoints.id})`;
                         pointsEntryForm.style.display = 'block';
                    } else {
                        alert('在資料庫中找不到此使用者！');
                    }
                },
                (errorMessage) => { /* 掃描中... */ }
            ).catch(err => alert('無法啟動相機，請檢查權限。'));
        });
    }

if (submitExpBtn) {
        submitExpBtn.addEventListener('click', async () => {
            if (!currentSelectedUserForPoints || !currentSelectedUserForPoints.id) {
                alert('錯誤：尚未選取顧客！');
                return;
            }
            const userId = currentSelectedUserForPoints.id;
            const expValue = Number(expInput.value);
            let reason = reasonSelect.value;
            if (reason === 'other') {
                reason = customReasonInput.value.trim();
            }
            if (!expValue || expValue <= 0 || !reason) {
                pointsStatusMessage.textContent = '錯誤：點數和原因皆為必填。';
                pointsStatusMessage.style.color = 'var(--danger-color)';
                return;
            }
            pointsStatusMessage.textContent = '正在處理中...';
            submitExpBtn.disabled = true;
            try {
                const response = await fetch('/api/add-points', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ userId, expValue, reason }),
                });
                const result = await response.json();
                if (!response.ok) throw new Error(result.error || '未知錯誤');
                pointsStatusMessage.textContent = `成功為 ${currentSelectedUserForPoints.name} 新增 ${expValue} 點！`;
                pointsStatusMessage.style.color = 'var(--success-color)';
                expInput.value = '';
                // 清空自訂原因輸入框並還原下拉選單
                customReasonInput.value = '';
                reasonSelect.value = '消費回饋';
            } catch (error) {
                pointsStatusMessage.textContent = `新增失敗: ${error.message}`;
                pointsStatusMessage.style.color = 'var(--danger-color)';
            } finally {
                submitExpBtn.disabled = false;
            }
        });
    }


 
    // --- 初始化第一個頁面 ---
    showPage('dashboard'); 
}