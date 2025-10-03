
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
    const editProductModal = document.getElementById('edit-product-modal');
    const editProductForm = document.getElementById('edit-product-form');
    const manageBookingDatesBtn = document.getElementById('manage-booking-dates-btn');
    const bookingSettingsModal = document.getElementById('booking-settings-modal');
    const createBookingBtn = document.getElementById('create-booking-btn');
    const createBookingModal = document.getElementById('create-booking-modal');
    const createBookingForm = document.getElementById('create-booking-form');
    const calendarViewContainer = document.getElementById('calendar-view-container');
    const listViewContainer = document.getElementById('list-view-container');
    const calendarGrid = document.getElementById('calendar-grid');
    const calendarMonthYear = document.getElementById('calendar-month-year');
    const calendarPrevMonthBtn = document.getElementById('calendar-prev-month-btn');
    const calendarNextMonthBtn = document.getElementById('calendar-next-month-btn');
    const cancelBookingModal = document.getElementById('cancel-booking-modal');
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
    const addProductBtn = document.getElementById('add-product-btn'); //產品頁面的"新增"
    const downloadCsvTemplateBtn = document.getElementById('download-csv-template-btn'); //產品頁面的"批量"
    const csvUploadInput = document.getElementById('csv-upload-input'); //產品頁面的"批量"
    const batchDeleteBtn = document.getElementById('batch-delete-btn');//產品頁面的"刪除"

    // =================================================================
    // 事件監聽器綁定 (Event Listeners Setup)
    // =================================================================

    // --- 全域狀態 ---
    let classPerks = {};
    let html5QrCode = null;
    let allSettings = [];
    let currentSelectedUserForPoints = null;

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