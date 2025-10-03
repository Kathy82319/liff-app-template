
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
    const addProductBtn = document.getElementById('add-product-btn'); //產品頁面的"新增"
    const downloadCsvTemplateBtn = document.getElementById('download-csv-template-btn'); //產品頁面的"批量"
    const csvUploadInput = document.getElementById('csv-upload-input'); //產品頁面的"批量"
    const batchDeleteBtn = document.getElementById('batch-delete-btn');//產品頁面的"刪除"

    // =================================================================
    // 事件監聽器綁定 (Event Listeners Setup)
    // =================================================================

    // --- 全域狀態 ---
    let classPerks = {};

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


 
    // --- 初始化第一個頁面 ---
    showPage('dashboard'); 
    setupEventListeners();
    setupBatchActions(); // 【新增】呼叫安裝函式
}