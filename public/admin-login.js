
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