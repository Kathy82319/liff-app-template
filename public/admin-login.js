
// =================================================================
// 全域 Modal 關閉事件監聽
// =================================================================

const App = {
    init: function() {
        if (document.getElementById('login-form')) this.handleLoginPage();
        else if (document.getElementById('admin-panel')) this.handleAdminPage();
    },
        handleLoginPage: function() {
        const loginForm = document.getElementById('login-form');
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
                if (!response.ok) {
                    throw new Error(result.error || '登入失敗，請檢查帳號或密碼。');
                }
                console.log('[DEBUG] Login successful, redirecting to admin panel...');
                window.location.href = '/admin-panel.html';
            } catch (error) {
                loginStatus.textContent = error.message;
                loginButton.disabled = false;
                loginButton.textContent = '登入';
            }
        });
    },
    handleAdminPage: async function() {
        try {
            const response = await fetch('/api/admin/auth/status');
            if (!response.ok) {
                window.location.href = '/admin-login.html';
                return;
            }
            document.getElementById('admin-panel').style.display = 'block';
            await initializeAdminPanel();
        } catch (error) {
            document.body.innerHTML = `<h2>後台啟動失敗: ${error.message}</h2>`;
        }
    }
};


// 當 DOM 載入完成後，只呼叫 App.init() 啟動程式
document.addEventListener('DOMContentLoaded', () => App.init());


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
    const addProductBtn = document.getElementById('add-product-btn'); //產品頁面的"新增"
    const downloadCsvTemplateBtn = document.getElementById('download-csv-template-btn'); //產品頁面的"批量"
    const csvUploadInput = document.getElementById('csv-upload-input'); //產品頁面的"批量"
    const batchDeleteBtn = document.getElementById('batch-delete-btn');//產品頁面的"刪除"

    // =================================================================
    // 事件監聽器綁定 (Event Listeners Setup)
    // =================================================================
    function setupEventListeners() {
        if (switchToCalendarViewBtn) {
            switchToCalendarViewBtn.addEventListener('click', () => {
                const isListVisible = listViewContainer.style.display !== 'none';
                if (isListVisible) {
                    listViewContainer.style.display = 'none';
                    calendarViewContainer.style.display = 'block';
                    switchToCalendarViewBtn.textContent = '切換至列表';
                    fetchAllBookings('all_upcoming'); // 載入日曆需要的數據
                } else {
                    listViewContainer.style.display = 'block';
                    calendarViewContainer.style.display = 'none';
                    switchToCalendarViewBtn.textContent = '切換至行事曆';
                    fetchAllBookings('today'); // 載入列表預設的數據
                }
            });
        }

        if (createBookingBtn) {
            createBookingBtn.addEventListener('click', openCreateBookingModal);
        }

        if (calendarPrevMonthBtn) {
            calendarPrevMonthBtn.addEventListener('click', () => {
                currentCalendarDate.setMonth(currentCalendarDate.getMonth() - 1);
                updateCalendar();
            });
        }

        if (calendarNextMonthBtn) {
            calendarNextMonthBtn.addEventListener('click', () => {
                currentCalendarDate.setMonth(currentCalendarDate.getMonth() + 1);
                updateCalendar();
            });
        }

    }

    // --- 全域狀態 ---
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
    // 【新增】批次處理相關函式
    // =================================================================
    function updateBatchToolbarState() {
        const toolbar = document.getElementById('batch-actions-toolbar');
        const countSpan = document.getElementById('batch-selected-count');
        const selectAllCheckbox = document.getElementById('select-all-products');
        const allCheckboxes = document.querySelectorAll('.product-checkbox');
        const selectedCheckboxes = document.querySelectorAll('.product-checkbox:checked');

        if (selectedCheckboxes.length > 0) {
            toolbar.classList.add('visible');
            countSpan.textContent = `已選取 ${selectedCheckboxes.length} 項`;
        } else {
            toolbar.classList.remove('visible');
        }

        // 更新「全選」按鈕的狀態
        if (allCheckboxes.length > 0 && selectedCheckboxes.length === allCheckboxes.length) {
            selectAllCheckbox.checked = true;
            selectAllCheckbox.indeterminate = false;
        } else if (selectedCheckboxes.length > 0) {
            selectAllCheckbox.checked = false;
            selectAllCheckbox.indeterminate = true; // 半選狀態
        } else {
            selectAllCheckbox.checked = false;
            selectAllCheckbox.indeterminate = false;
        }
    }

    function setupBatchActions() {
        const pageContainer = document.getElementById('page-inventory');
        if (!pageContainer) return; // 如果頁面不存在，就直接返回

        const selectAllCheckbox = pageContainer.querySelector('#select-all-products');
        const publishBtn = pageContainer.querySelector('#batch-publish-btn');
        const unpublishBtn = pageContainer.querySelector('#batch-unpublish-btn');
        const tBody = pageContainer.querySelector('#product-list-tbody');
        const deleteBtn = pageContainer.querySelector('#batch-delete-btn');

        // 監聽表格內容區域的 "change" 事件，處理每一行的 checkbox 變化
        tBody.addEventListener('change', (e) => {
            if (e.target.classList.contains('product-checkbox')) {
                updateBatchToolbarState();
            }
        });

        // 「全選」checkbox 的 "change" 事件邏輯
        selectAllCheckbox.addEventListener('change', (e) => {
            const isChecked = e.target.checked;
            // 將所有產品的 checkbox 狀態同步為「全選」的狀態
            tBody.querySelectorAll('.product-checkbox').forEach(checkbox => {
                checkbox.checked = isChecked;
            });
            // 更新工具列的顯示狀態
            updateBatchToolbarState();
        });


        // 批次處理函式
        const handleBatchUpdate = async (isVisible) => {
            const selectedIds = Array.from(tBody.querySelectorAll('.product-checkbox:checked')).map(cb => cb.dataset.productId);
            if (selectedIds.length === 0) {
                alert('請至少選取一個項目！');
                return;
            }

            const actionText = isVisible ? '上架' : '下架';
            if (!confirm(`確定要將選取的 ${selectedIds.length} 個項目全部${actionText}嗎？`)) {
                return;
            }

            // 禁用按鈕防止重複提交
            publishBtn.disabled = true;
            unpublishBtn.disabled = true;

            try {
                const response = await fetch('/api/admin/batch-update-products', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ productIds: selectedIds, isVisible: isVisible })
                });

                if (!response.ok) {
                    const error = await response.json();
                    throw new Error(error.error || '批次更新失敗');
                }

                alert(`成功${actionText} ${selectedIds.length} 個項目！`);
                await fetchAllProducts(); // 重新載入列表以顯示最新狀態

            } catch (error) {
                alert(`錯誤：${error.message}`);
            } finally {
                // 恢復按鈕
                publishBtn.disabled = false;
                unpublishBtn.disabled = false;
            }
        };

        // 綁定工具列按鈕事件
        publishBtn.addEventListener('click', () => handleBatchUpdate(true));
        unpublishBtn.addEventListener('click', () => handleBatchUpdate(false));

    
// 綁定刪除按鈕事件
deleteBtn.addEventListener('click', async () => {
    const tBody = pageContainer.querySelector('#product-list-tbody');
    const selectedIds = Array.from(tBody.querySelectorAll('.product-checkbox:checked')).map(cb => cb.dataset.productId);
    
    if (selectedIds.length === 0) {
        alert('請至少選取一個要刪除的項目！');
        return;
    }

    // 【** 防呆提醒 **】
    if (!confirm(`確定要永久刪除選取的 ${selectedIds.length} 個項目嗎？\n\n【警告】此操作無法復原！`)) {
        return;
    }

    // 禁用所有批次按鈕
    publishBtn.disabled = true;
    unpublishBtn.disabled = true;
    deleteBtn.disabled = true;

    try {
        const response = await fetch('/api/admin/delete-products', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ productIds: selectedIds })
        });

        const result = await response.json();
        if (!response.ok) {
            throw new Error(result.error || '刪除失敗');
        }

        alert(result.message);
        await fetchAllProducts(); // 重新載入列表以顯示最新狀態

    } catch (error) {
        alert(`錯誤：${error.message}`);
    } finally {
        // 無論成功或失敗，都恢復按鈕狀態
        publishBtn.disabled = false;
        unpublishBtn.disabled = false;
        deleteBtn.disabled = false;
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
        row.className = 'draggable-row';
        row.dataset.productId = p.product_id;

        // 定義庫存和價格的顯示文字
        let stockDisplay = '無管理';
        if (p.inventory_management_type === 'quantity') stockDisplay = `數量: ${p.stock_quantity ?? 'N/A'}`;
        else if (p.inventory_management_type === 'status') stockDisplay = `狀態: ${p.stock_status ?? 'N/A'}`;

        let priceDisplay = '未設定';
        if (p.price_type === 'simple' && p.price) {
            priceDisplay = `$${p.price}`;
        } else if (p.price_type === 'multiple' && p.price_options) {
            try {
                const options = JSON.parse(p.price_options);
                priceDisplay = options.map(opt => `${opt.name}: $${opt.price}`).join('<br>');
            } catch (e) { priceDisplay = '價格格式錯誤'; }
        }

        // 【核心修正】依照新的 a順序建立儲存格
        const cellCheckbox = row.insertCell();
        const cellOrder = row.insertCell();
        const cellProduct = row.insertCell();
        const cellStock = row.insertCell();
        const cellPrice = row.insertCell();
        const cellVisible = row.insertCell(); // 上架狀態格
        const cellActions = row.insertCell(); // 操作格

        // 填入內容
        cellCheckbox.innerHTML = `<input type="checkbox" class="product-checkbox" data-product-id="${p.product_id}">`;
        cellOrder.className = 'drag-handle-cell';
        cellOrder.innerHTML = `<span class="drag-handle">⠿</span> ${p.display_order}`;

        cellProduct.className = 'compound-cell';
        cellProduct.style.textAlign = 'left';
        cellProduct.innerHTML = `<div class="main-info">${p.name}</div><div class="sub-info">ID: ${p.product_id}</div><div class="sub-info">分類: ${p.category || '未分類'}</div>`;

        cellStock.innerHTML = stockDisplay;
        cellPrice.innerHTML = priceDisplay;

        // 【核心修正】上架欄位改為滑動開關
        cellVisible.innerHTML = `
            <label class="switch">
                <input type="checkbox" class="visibility-toggle" data-product-id="${p.product_id}" ${p.is_visible ? 'checked' : ''}>
                <span class="slider"></span>
            </label>`;

        // 【核心修正】編輯按鈕現在放在正確的「操作」欄位
        cellActions.innerHTML = `<button class="action-btn btn-edit-product" data-productid="${p.product_id}" style="background-color: var(--warning-color); color: #000;">編輯</button>`;
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
    productListTbody.addEventListener('click', async (e) => {
        const target = e.target;

        // 【新增這一段】處理「上架」開關的點擊
        if (target.classList.contains('visibility-toggle')) {
            const productId = target.dataset.productId;
            const isVisible = target.checked;

            // 暫時禁用開關，防止重複點擊
            target.disabled = true;

            try {
                const response = await fetch('/api/admin/toggle-product-visibility', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ productId, isVisible })
                });
                if(!response.ok) throw new Error('更新失敗');

                // API 更新成功後，直接修改記憶體中的資料狀態
                const product = allProducts.find(p => p.product_id === productId);
                if(product) product.is_visible = isVisible ? 1 : 0;

            } catch(error) {
                alert(`更新可見性失敗: ${error.message}`);
                target.checked = !isVisible; // 操作失敗時，還原 checkbox 狀態
            } finally {
                // 無論成功或失敗，最後都重新啟用開關
                target.disabled = false;
            }
            return; // 結束執行，避免觸發其他事件
        }

        // 處理「編輯」按鈕的點擊 (這段邏輯不變)
        const editButton = target.closest('.btn-edit-product');
        if (editButton) {
            const productId = editButton.dataset.productid;
            openEditProductModal(productId);
            return;
        }
    });
}
   
function openEditProductModal(productId) {
        const product = allProducts.find(p => p.product_id == productId); // 使用 == 進行寬鬆比較
        if (!product || !editProductModal || !editProductForm) return;

        editProductForm.reset();
        
        const modalTitle = editProductModal.querySelector('#modal-product-title');
        if (modalTitle) modalTitle.textContent = `編輯產品：${product.name}`;
        
        // --- 【核心修正】在設定 value 前，先檢查元素是否存在 ---
        const productIdInput = document.getElementById('edit-product-id');
        const productIdDisplayInput = document.getElementById('edit-product-id-display');
        const productNameInput = document.getElementById('edit-product-name');

        if (productIdInput) productIdInput.value = product.product_id;
        if (productIdDisplayInput) productIdDisplayInput.value = product.product_id;
        if (productNameInput) productNameInput.value = product.name;
        
        // 對其他所有欄位也做同樣的檢查
        const descriptionInput = document.getElementById('edit-product-description');
        if (descriptionInput) descriptionInput.value = product.description || '';

        const categoryInput = document.getElementById('edit-product-category');
        if (categoryInput) categoryInput.value = product.category || '';

        const tagsInput = document.getElementById('edit-product-tags');
        if (tagsInput) tagsInput.value = product.tags || '';

        const isVisibleCheckbox = document.getElementById('edit-product-is-visible');
        if (isVisibleCheckbox) isVisibleCheckbox.checked = !!product.is_visible;

        const inventoryTypeSelect = document.getElementById('edit-product-inventory-type');
        const quantityGroup = document.getElementById('stock-quantity-group');
        const statusGroup = document.getElementById('stock-status-group');
        
        if(inventoryTypeSelect) {
            inventoryTypeSelect.value = product.inventory_management_type || 'none';
            if(quantityGroup) quantityGroup.style.display = (inventoryTypeSelect.value === 'quantity') ? 'block' : 'none';
            if(statusGroup) statusGroup.style.display = (inventoryTypeSelect.value === 'status') ? 'block' : 'none';
        }

        const stockQuantityInput = document.getElementById('edit-product-stock-quantity');
        if (stockQuantityInput) stockQuantityInput.value = product.stock_quantity || 0;

        const stockStatusInput = document.getElementById('edit-product-stock-status');
        if (stockStatusInput) stockStatusInput.value = product.stock_status || '';
        
        const priceInput = document.getElementById('edit-product-price');
        if(priceInput) priceInput.value = product.price || '';

        try {
            const images = JSON.parse(product.images || '[]');
            for(let i=1; i<=5; i++){
                const imgInput = document.getElementById(`edit-product-image-${i}`);
                if (imgInput) imgInput.value = images[i-1] || '';
            }
        } catch(e) { console.error("解析圖片JSON失敗:", e); }

        for (let i = 1; i <= 5; i++) {
            const specNameInput = document.getElementById(`edit-spec-${i}-name`);
            if (specNameInput) specNameInput.value = product[`spec_${i}_name`] || '';
            const specValueInput = document.getElementById(`edit-spec-${i}-value`);
            if (specValueInput) specValueInput.value = product[`spec_${i}_value`] || '';
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
        
        const submitButton = editProductForm.querySelector('button[type="submit"]');
        submitButton.disabled = true;
        submitButton.textContent = '儲存中...';

        // 透過隱藏的 ID 欄位是否有值，來判斷是「更新」還是「新增」
        const productId = document.getElementById('edit-product-id').value;
        const isUpdating = !!productId;

        const images = [];
        for(let i=1; i<=5; i++){
            const imgUrl = document.getElementById(`edit-product-image-${i}`).value.trim();
            if(imgUrl) images.push(imgUrl);
        }

        const formData = {
            productId: isUpdating ? productId : undefined,
            name: document.getElementById('edit-product-name').value,
            description: document.getElementById('edit-product-description').value,
            category: document.getElementById('edit-product-category').value,
            tags: document.getElementById('edit-product-tags').value,
            images: JSON.stringify(images),
            is_visible: document.getElementById('edit-product-is-visible').checked,
            inventory_management_type: document.getElementById('edit-product-inventory-type').value,
            stock_quantity: document.getElementById('edit-product-stock-quantity').value || null,
            stock_status: document.getElementById('edit-product-stock-status').value || null,
            price_type: 'simple', 
            price: document.getElementById('edit-product-price').value || null,
            price_options: null,
        };
        for(let i=1; i<=5; i++){
            formData[`spec_${i}_name`] = document.getElementById(`edit-spec-${i}-name`).value || null;
            formData[`spec_${i}_value`] = document.getElementById(`edit-spec-${i}-value`).value || null;
        }

        const apiUrl = isUpdating ? '/api/admin/update-product-details' : '/api/admin/create-product';
        
        try {
            const response = await fetch(apiUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(formData)
            });
            if (!response.ok) {
                const err = await response.json();
                throw new Error(err.error || '儲存失敗');
            }
            
            await fetchAllProducts();
            editProductModal.style.display = 'none';
            alert(`產品${isUpdating ? '更新' : '新增'}成功！`);

        } catch (error) {
            alert(`錯誤：${error.message}`);
        } finally {
            // 無論成功或失敗，都恢復按鈕狀態
            submitButton.disabled = false;
            submitButton.textContent = '儲存變更';
        }
    });
}

    if(editProductModal) {
      editProductModal.querySelector('.modal-close').addEventListener('click', () => editProductModal.style.display = 'none');
      editProductModal.querySelector('.btn-cancel').addEventListener('click', () => editProductModal.style.display = 'none');
    }

// 在 openEditProductModal 函式下方，新增一個開啟「新增模式」的函式
function openCreateProductModal() {
    if (!editProductModal || !editProductForm) return;

    // 1. 重設表單所有欄位
    editProductForm.reset();
    
    // 2. 將彈窗標題改為「新增」
    editProductModal.querySelector('#modal-product-title').textContent = '新增產品/服務';
    
    // 3. 清空隱藏的 product ID，這是判斷「新增/編輯」模式的關鍵
    document.getElementById('edit-product-id').value = '';
    
    // 4. 讓使用者知道 ID 會自動生成
    const productIdDisplay = document.getElementById('edit-product-id-display');
    productIdDisplay.value = '(儲存後將自動生成)';
    productIdDisplay.closest('.form-group').style.display = 'block'; // 確保欄位可見

    // 5. 將庫存管理模式重設為預設值
    const inventoryTypeSelect = document.getElementById('edit-product-inventory-type');
    inventoryTypeSelect.value = 'none';
    // 手動觸發 change 事件，以確保相關欄位正確顯示/隱藏
    inventoryTypeSelect.dispatchEvent(new Event('change'));

    // 6. 顯示彈窗
    editProductModal.style.display = 'flex';
}


// 找到 editProductForm 的 'submit' 事件監聽器，並用以下新邏輯完整取代它
if (editProductForm) {
    editProductForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        // 透過隱藏的 ID 欄位是否有值，來判斷是「更新」還是「新增」
        const productId = document.getElementById('edit-product-id').value;
        const isUpdating = !!productId;

        const images = [];
        for(let i=1; i<=5; i++){
            const imgUrl = document.getElementById(`edit-product-image-${i}`).value.trim();
            if(imgUrl) images.push(imgUrl);
        }

        const formData = {
            // 如果是更新模式，才帶入 productId
            productId: isUpdating ? productId : undefined,
            name: document.getElementById('edit-product-name').value,
            description: document.getElementById('edit-product-description').value,
            category: document.getElementById('edit-product-category').value,
            tags: document.getElementById('edit-product-tags').value,
            images: JSON.stringify(images),
            is_visible: document.getElementById('edit-product-is-visible').checked,
            inventory_management_type: document.getElementById('edit-product-inventory-type').value,
            stock_quantity: document.getElementById('edit-product-stock-quantity').value || null,
            stock_status: document.getElementById('edit-product-stock-status').value || null,
            price_type: 'simple', // 暫時寫死，未來可擴充
            price: document.getElementById('edit-product-price').value || null,
            price_options: null, // 暫時寫死
        };
        for(let i=1; i<=5; i++){
            formData[`spec_${i}_name`] = document.getElementById(`edit-spec-${i}-name`).value || null;
            formData[`spec_${i}_value`] = document.getElementById(`edit-spec-${i}-value`).value || null;
        }

        // 根據模式決定要呼叫的 API 端點與方法
        const apiUrl = isUpdating ? '/api/admin/update-product-details' : '/api/admin/create-product';
        
        try {
            const response = await fetch(apiUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(formData)
            });
            if (!response.ok) {
                const err = await response.json();
                throw new Error(err.error || '儲存失敗');
            }
            
            await fetchAllProducts(); // 重新載入產品列表
            editProductModal.style.display = 'none'; // 關閉彈窗
            alert(`產品${isUpdating ? '更新' : '新增'}成功！`);

        } catch (error) {
            alert(`錯誤：${error.message}`);
        }
    });
}


if (addProductBtn) {
    addProductBtn.addEventListener('click', openCreateProductModal);
}    


//處理 CSV 模板下載 (優化版：提供簡化版欄位)
function handleDownloadCsvTemplate() {
    // 【** 核心修改：只提供最常用、最重要的欄位給使用者 **】//必須跟後端API名稱相符bulk-create-products.js
    const userFriendlyHeaders = [
        "產品名稱",       // 必填
        "分類",
        "價格",
        "詳細介紹",
        "標籤(逗號分隔)",
        "是否上架(TRUE/FALSE)"
    ];
    
    const csvContent = "data:text/csv;charset=utf-8,\uFEFF" + userFriendlyHeaders.join(",");
    
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", "product_template_simple.csv"); // 修改檔名
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

/**
 * 處理 CSV 檔案上傳與解析
 */
/**
 * 處理 CSV 檔案上傳與解析 (最終修正版)
 */
function handleCsvUpload(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();

    // 1. 定義 onload 事件：當檔案讀取完成後執行
    reader.onload = async (e) => {
        const text = e.target.result; // 在這裡才能正確獲取到檔案內容
        const lines = text.split(/\r\n|\n/);
        
        if (lines.length < 2 || !lines[1]) {
            alert('CSV 檔案中沒有可匯入的資料。');
            return;
        }

        const headers = lines[0].split(',').map(h => h.trim().replace(/"/g, ''));
        const data = [];

        // 使用強健的正規表示式來解析每一行，正確處理被引號包住的逗號
        const csvRegex = /(?:,|^)(?:"([^"]*(?:""[^"]*)*)"|([^",]*))/g;

        for (let i = 1; i < lines.length; i++) {
            if (!lines[i]) continue;
            
            let values = [];
            let match;
            while (match = csvRegex.exec(lines[i])) {
                values.push(match[1] ? match[1].replace(/""/g, '"') : match[2]);
            }

            // 確保解析出的欄位數與標頭數一致，避免錯位
            if (values.length === headers.length) {
                const obj = {};
                for (let j = 0; j < headers.length; j++) {
                    obj[headers[j]] = values[j] ? values[j].trim() : "";
                }
                data.push(obj);
            }
        }

        if (data.length === 0) {
            alert('CSV 檔案解析後無有效資料。');
            return;
        }

        if (!confirm(`您準備從 CSV 檔案匯入 ${data.length} 筆產品資料，確定要繼續嗎？`)) {
            event.target.value = '';
            return;
        }

        try {
            const response = await fetch('/api/admin/bulk-create-products', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ products: data })
            });

            const result = await response.json();
            if (!response.ok) {
                throw new Error(result.error || '匯入過程中發生未知錯誤。');
            }

            alert(result.message);
            await fetchAllProducts();

        } catch (error) {
            alert(`匯入失敗：${error.message}`);
        } finally {
            event.target.value = '';
        }
    };

    // 2. 啟動檔案讀取：這是非同步的，執行後會等待 onload 事件被觸發
    reader.readAsText(file, 'UTF-8'); // 直接在這裡指定編碼
}

if (downloadCsvTemplateBtn) {
    downloadCsvTemplateBtn.addEventListener('click', handleDownloadCsvTemplate);
}
if (csvUploadInput) {
    csvUploadInput.addEventListener('change', handleCsvUpload);
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

        // 1. 產生星期標題
        ['日', '一', '二', '三', '四', '五', '六'].forEach(day => {
            const weekdayEl = document.createElement('div');
            weekdayEl.className = 'calendar-weekday';
            weekdayEl.textContent = day;
            calendarGrid.appendChild(weekdayEl);
        });

        const firstDayOfMonth = new Date(year, month, 1);
        const lastDayOfMonth = new Date(year, month + 1, 0);
        const startingDayOfWeek = firstDayOfMonth.getDay(); // 0 (Sun) to 6 (Sat)

        // 2. 補上個月的空白
        for (let i = 0; i < startingDayOfWeek; i++) {
            const emptyDay = document.createElement('div');
            emptyDay.className = 'calendar-day day-other-month';
            calendarGrid.appendChild(emptyDay);
        }

        // 3. 產生當月所有日期
        for (let day = 1; day <= lastDayOfMonth.getDate(); day++) {
            const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
            const bookingsForDay = allBookings.filter(b => b.booking_date === dateStr);
            const isPast = new Date(dateStr) < new Date(new Date().toDateString());

            const dayEl = document.createElement('div');
            dayEl.className = `calendar-day ${isPast ? 'is-past' : ''}`;
            dayEl.innerHTML = `<span class="day-number">${day}</span>`;
            
            bookingsForDay.forEach(b => {
                const bookingEl = document.createElement('div');
                bookingEl.className = `calendar-booking status-${b.status}`;
                bookingEl.textContent = `${b.time_slot} ${b.contact_name}`;
                dayEl.appendChild(bookingEl);
            });
            calendarGrid.appendChild(dayEl);
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
            const checkInButton = event.target.closest('.btn-check-in');
            const cancelButton = event.target.closest('.btn-cancel-booking');
            
            if (checkInButton) {
                const bookingId = checkInButton.dataset.bookingId;
                const booking = allBookings.find(b => b.booking_id == bookingId);
                if (booking && confirm(`確定要將 ${booking.booking_date} ${booking.contact_name} 的預約標示為「已報到」嗎？`)) {
                    await updateBookingStatus(Number(bookingId), 'checked-in');
                }
                return;
            }

            if (cancelButton) {
                const bookingId = cancelButton.dataset.bookingId;
                const booking = allBookings.find(b => b.booking_id == bookingId);
                if (booking) {
                    openCancelBookingModal(booking);
                }
                return;
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
    // 【核心修正】將所有一次性事件綁定集中管理
    // =================================================================
    function setupStaticEventListeners() {
        // --- 訊息草稿表格的事件委派 ---
        if (draftListTbody) {
            draftListTbody.addEventListener('click', async (e) => {
                const editButton = e.target.closest('.btn-edit-draft');
                if (editButton) {
                    const draftId = editButton.dataset.draftid;
                    const draft = allDrafts.find(d => d.draft_id == draftId);
                    if (draft) openEditDraftModal(draft);
                    return;
                }
                
                const deleteButton = e.target.closest('.btn-delete-draft');
                if (deleteButton) {
                    const draftId = Number(deleteButton.dataset.draftid);
                    if (confirm('確定要刪除這則草稿嗎？')) {
                        try {
                            const response = await fetch('/api/admin/message-drafts', {
                                method: 'DELETE',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ draft_id: draftId })
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
            cellContent.textContent = draft.content.substring(0, 50) + (draft.content.length > 50 ? '...' : '');
            cellActions.className = 'actions-cell';
            
            const editBtn = document.createElement('button');
            editBtn.className = 'action-btn btn-edit-draft'; // 使用 btn-edit-draft class
            editBtn.dataset.draftid = draft.draft_id;
            editBtn.textContent = '編輯';
            editBtn.style.backgroundColor = 'var(--warning-color)'; // 【核心修正】設定背景為黃色
            editBtn.style.color = '#000'; // 黃色背景搭配黑色文字
            
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
    setupEventListeners();
    setupBatchActions(); // 【新增】呼叫安裝函式
}