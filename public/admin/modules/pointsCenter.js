// public/admin/modules/pointsCenter.js
import { api } from '../api.js';
import { ui } from '../ui.js';

// --- 變數宣告：發放點數相關 ---
let html5QrCode = null;
let currentSelectedUserForPoints = null;

// --- 變數宣告：點數紀錄相關 ---
let allExpHistory = []; 
let activeTemplate = null; 

/**
 * 安全地獲取物件的巢狀屬性 (用於紀錄列表)
 */
function getProperty(obj, path, defaultValue = 'N/A') {
    const value = path.split('.').reduce((acc, key) => (acc && acc[key] !== undefined && acc[key] !== null) ? acc[key] : undefined, obj);
    const result = (value !== undefined && value !== null && value !== '') ? value : defaultValue;
    if (typeof result === 'string' && result.length > 50 && defaultValue === 'N/A') {
        return result.substring(0, 47) + '...';
    }
    return result;
}

// --- 功能區塊 1：頁面與 Tab 管理 ---

function setupTabs() {
    const tabsContainer = document.getElementById('points-sub-tabs');
    if (!tabsContainer) return;

    tabsContainer.addEventListener('click', (e) => {
        if (e.target.matches('.settings-tab')) {
            // 移除舊的 active
            tabsContainer.querySelector('.active')?.classList.remove('active');
            document.querySelectorAll('#page-points .settings-tab-content').forEach(el => el.classList.remove('active'));

            // 加上新的 active
            e.target.classList.add('active');
            const targetId = e.target.dataset.target;
            document.getElementById(targetId)?.classList.add('active');

            // 如果切換到紀錄 Tab，且尚未載入資料，則載入
            if (targetId === 'points-tab-history' && allExpHistory.length === 0) {
                loadExpHistory();
            }
        }
    });
}

// 重設發放頁面狀態
function resetPointsCenterPage() {
    currentSelectedUserForPoints = null;
    const userSearchInput = document.getElementById('user-search-input-points');
    const userSearchResults = document.getElementById('user-search-results');
    const pointsEntryForm = document.getElementById('points-entry-form');
    const selectedUserDisplay = document.getElementById('points-selected-user-display');
    const qrReader = document.getElementById('qr-reader');
    const pointsStatusMessage = document.getElementById('points-status-message');
    const pageStatusDisplay = document.getElementById('points-page-status-display');

    if (userSearchInput) userSearchInput.value = '';
    if (userSearchResults) userSearchResults.innerHTML = '';
    if (pointsEntryForm) pointsEntryForm.style.display = 'none';
    
    if (pageStatusDisplay) {
        pageStatusDisplay.textContent = '請先從上方搜尋或掃碼選取顧客';
        pageStatusDisplay.style.display = 'block';
    }
    if (selectedUserDisplay) selectedUserDisplay.textContent = ''; 
    if (pointsStatusMessage) pointsStatusMessage.textContent = '';
    
    if (html5QrCode && html5QrCode.isScanning) {
        html5QrCode.stop().catch(err => console.error("停止掃描器失敗", err));
    }
    if (qrReader) qrReader.style.display = 'none';
}


// --- 功能區塊 2：點數發放邏輯 ---

async function handleUserSearchForPoints(query) {
    const userSearchResults = document.getElementById('user-search-results');
    if (!userSearchResults) return;

    if (query.length < 1) {
        userSearchResults.innerHTML = '';
        return;
    }

    try {
        const users = await api.searchUsers(query);
        userSearchResults.innerHTML = '';
        if (users.length === 0) {
            userSearchResults.innerHTML = '<li>找不到符合的顧客</li>';
        } else {
            users.forEach(user => {
                const li = document.createElement('li');
                li.textContent = `${user.line_display_name} (${user.user_id.substring(0, 15)}...)`;
                li.dataset.userId = user.user_id;
                li.dataset.userName =  user.line_display_name;
                userSearchResults.appendChild(li);
            });
        }
    } catch (error) {
        console.error(error);
        userSearchResults.innerHTML = '<li>搜尋時發生錯誤</li>';
    }
}

function selectUserForPoints(user) {
    currentSelectedUserForPoints = user;
    const selectedUserDisplay = document.getElementById('points-selected-user-display');
    const pointsEntryForm = document.getElementById('points-entry-form');
    const userSearchResults = document.getElementById('user-search-results');
    const userSearchInput = document.getElementById('user-search-input-points');
    const pageStatusDisplay = document.getElementById('points-page-status-display');

    if (selectedUserDisplay) selectedUserDisplay.textContent = `${user.name} (${user.id})`;
    if (pointsEntryForm) pointsEntryForm.style.display = 'block';
    if (pageStatusDisplay) pageStatusDisplay.style.display = 'none';
    
    if (userSearchResults) userSearchResults.innerHTML = '';
    if (userSearchInput) userSearchInput.value = '';

    const form = document.getElementById('points-entry-form');
    if (form) {
        form.querySelector('#exp-input').value = '';
        form.querySelector('#reason-select').value = '消費回饋';
        form.querySelector('#custom-reason-input').value = '';
        form.querySelector('#custom-reason-input').style.display = 'none';
        form.querySelector('#points-status-message').textContent = '';
    }
}

function startQrScanner() {
    const qrReader = document.getElementById('qr-reader');
    if (!qrReader) return;

    qrReader.style.display = 'block';
    if (html5QrCode && html5QrCode.isScanning) return;

    html5QrCode = new Html5Qrcode("qr-reader");
    const onScanSuccess = async (decodedText, decodedResult) => {
        await html5QrCode.stop();
        qrReader.style.display = 'none';
        
        try {
            const users = await api.searchUsers(decodedText);
            if (users && users.length > 0) {
                const user = users[0];
                selectUserForPoints({
                    id: user.user_id,
                    name: user.line_display_name
                });
            } else {
                ui.toast.error('在資料庫中找不到此使用者！');
            }
        } catch (error) {
            ui.toast.error(`查詢使用者時發生錯誤: ${error.message}`);
        }
    };

    html5QrCode.start({ facingMode: "environment" }, { fps: 10, qrbox: 250 }, onScanSuccess)
        .catch(err => ui.toast.error('無法啟動相機，請檢查權限設定。'));
}


// --- 功能區塊 3：點數紀錄邏輯 (從 expHistory.js 整合) ---

async function loadExpHistory() {
    const expHistoryTbody = document.getElementById('exp-history-tbody');
    if (!expHistoryTbody) return;

    expHistoryTbody.innerHTML = '<tr><td colspan="4" style="text-align: center;">正在載入點數紀錄...</td></tr>';

    try {
        // 1. 獲取設定 (如果尚未獲取)
        if (!activeTemplate) {
             if (!window.CONFIG || !window.CONFIG.LOGIC) {
                 throw new Error("核心設定尚未載入。");
             }
             const activeTemplateKey = window.CONFIG.LOGIC.ACTIVE_INDUSTRY_TEMPLATE;
             activeTemplate = window.CONFIG.LOGIC.INDUSTRY_TEMPLATE_DEFINITIONS[activeTemplateKey];
        }

        if (!activeTemplate || !activeTemplate.logic || !Array.isArray(activeTemplate.logic.adminExpHistoryColumns)) {
             throw new Error(`樣板缺少 'logic.adminExpHistoryColumns' 設定。`);
        }

        // 2. 獲取資料
        allExpHistory = await api.getExpHistory();
        
        // 3. 渲染
        renderExpHistoryList(allExpHistory);

    } catch (error) {
        console.error('獲取點數紀錄失敗:', error);
        expHistoryTbody.innerHTML = `<tr><td colspan="4" style="color: red; text-align: center;">讀取紀錄失敗: ${error.message}</td></tr>`;
    }
}

function renderExpHistoryList(records) {
    const expHistoryTbody = document.getElementById('exp-history-tbody');
    // 注意：這裡要找的是 #page-points 裡面的 table head
    const expHistoryTheadTr = document.querySelector('#points-tab-history thead tr');

    if (!expHistoryTbody || !expHistoryTheadTr) return;

    let columns = [];
    if (activeTemplate && Array.isArray(activeTemplate.logic.adminExpHistoryColumns)) {
        // 使用藍圖定義的欄位
        columns = activeTemplate.logic.adminExpHistoryColumns.filter(col => col.enabled);
    } else {
        // 如果沒有藍圖或載入失敗，使用一個包含使用者資訊的預設集
        columns = [
             { key: 'created_at', label: '日期', isDate: true },
             { key: 'user_info', label: '顧客 (姓名/電話)' }, // Custom key for combined info
             { key: 'reason', label: '原因' },
             { key: 'exp_added', label: '點數' },
        ];
        console.warn("使用預設的點數紀錄欄位，因為藍圖載入失敗或不存在。");
    }

    // 渲染表頭
    let headerHTML = '';
    columns.forEach(col => {
        headerHTML += `<th>${col.label}</th>`;
    });
    expHistoryTheadTr.innerHTML = headerHTML;

    // 渲染內容
    expHistoryTbody.innerHTML = '';
    if (!records || records.length === 0) {
        expHistoryTbody.innerHTML = `<tr><td colspan="${columns.length}" style="text-align: center;">找不到符合條件的紀錄。</td></tr>`;
        return;
    }

    records.forEach(record => {
        const row = expHistoryTbody.insertRow();
        columns.forEach(col => {
            const cell = row.insertCell();
            let cellContent;
            
            // 1. 特殊處理：日期 (顯示更完整的日期時間)
            if (col.key === 'created_at' || col.isDate) {
                // 使用 toLocaleString 以顯示更完整的日期時間
                cellContent = new Date(record.created_at).toLocaleString('zh-TW', { year: 'numeric', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });
            } 
            // 2. 特殊處理：點數 (exp_added)
            else if (col.key === 'exp_added') {
                const expSign = record.exp_added > 0 ? '+' : '';
                cell.style.fontWeight = 'bold';
                cell.style.color = record.exp_added > 0 ? 'var(--color-success)' : 'var(--color-danger)';
                cellContent = `${expSign}${record.exp_added}`;
            } 
            // 3. 特殊處理：顧客資訊 (新需求)
            else if (col.key === 'user_info') {
                 // 優先使用 real_name，其次是 line_display_name
                 const displayName = record.real_name || record.line_display_name || 'N/A';
                 const phoneDisplay = record.phone ? record.phone : '無電話';
                 // 使用 compound-cell 樣式 (已在 admin-panel.html 的 style 中定義)
                 cellContent = `<div class="main-info compound-cell">${displayName}</div><div class="sub-info compound-cell">${phoneDisplay}</div>`;
            }
            // 4. 預設：使用 getProperty
            else {
                cellContent = getProperty(record, col.key, 'N/A');
            }
            cell.innerHTML = cellContent;
        });
    });
}

function handleHistoryFilter() {
    const expUserFilterInput = document.getElementById('exp-user-filter-input');
    if (!expUserFilterInput) return;

    const searchTerm = expUserFilterInput.value.toLowerCase().trim();
    const filteredRecords = searchTerm
        ? allExpHistory.filter(record => 
            // 擴增搜尋範圍：line_display_name, real_name, phone, user_id, reason
            (record.line_display_name || '').toLowerCase().includes(searchTerm) ||
            (record.real_name || '').toLowerCase().includes(searchTerm) ||
            (record.phone || '').includes(searchTerm) ||
            (record.user_id || '').toLowerCase().includes(searchTerm) ||
            (record.reason || '').toLowerCase().includes(searchTerm)
          )
        : allExpHistory;
    renderExpHistoryList(filteredRecords);
}

// --- 初始化與事件綁定 ---

function setupEventListeners() {
    // 綁定 Tab
    setupTabs();

    // 綁定發放相關事件
    const userSearchInput = document.getElementById('user-search-input-points');
    const userSearchResults = document.getElementById('user-search-results');
    const startScanBtn = document.getElementById('start-scan-btn');
    const submitExpBtn = document.getElementById('submit-exp-btn');
    const reasonSelect = document.getElementById('reason-select');
    const customReasonInput = document.getElementById('custom-reason-input');

    if (userSearchInput) {
        userSearchInput.addEventListener('input', (e) => handleUserSearchForPoints(e.target.value));
    }
    if (userSearchResults) {
        userSearchResults.addEventListener('click', (e) => {
            const li = e.target.closest('li');
            if (li && li.dataset.userId) {
                selectUserForPoints({
                    id: li.dataset.userId,
                    name: li.dataset.userName
                });
            }
        });
    }
    if (startScanBtn) {
        startScanBtn.addEventListener('click', startQrScanner);
    }
    if (reasonSelect && customReasonInput) {
        reasonSelect.addEventListener('change', () => {
            customReasonInput.style.display = (reasonSelect.value === 'other') ? 'block' : 'none';
        });
    }
    if (submitExpBtn) {
        submitExpBtn.addEventListener('click', async () => {
            if (!currentSelectedUserForPoints || !currentSelectedUserForPoints.id) {
                ui.toast.error('錯誤：尚未選取顧客！');
                return;
            }
            const pointsStatusMessage = document.getElementById('points-status-message');
            const expInput = document.getElementById('exp-input');
            const expValue = Number(expInput.value);
            let reason = reasonSelect.value;
            if (reason === 'other') {
                reason = customReasonInput.value.trim();
            }

            if (!expValue || expValue <= 0 || !reason) {
                pointsStatusMessage.textContent = '錯誤：點數和原因皆為必填。';
                pointsStatusMessage.style.color = 'var(--color-danger)';
                return;
            }

            pointsStatusMessage.textContent = '正在處理中...';
            submitExpBtn.disabled = true;

            try {
                await api.addPoints({ userId: currentSelectedUserForPoints.id, expValue, reason });
                pointsStatusMessage.textContent = `成功為 ${currentSelectedUserForPoints.name} 新增 ${expValue} 點！`;
                pointsStatusMessage.style.color = 'var(--color-success)';
                expInput.value = '';
                // 發放成功後，如果有載入過紀錄，就重新載入一次以顯示最新資料
                if (allExpHistory.length > 0) {
                    loadExpHistory();
                }
            } catch (error) {
                pointsStatusMessage.textContent = `新增失敗: ${error.message}`;
                pointsStatusMessage.style.color = 'var(--color-danger)';
            } finally {
                submitExpBtn.disabled = false;
            }
        });
    }

    // 綁定紀錄相關事件
    const expUserFilterInput = document.getElementById('exp-user-filter-input');
    if (expUserFilterInput) {
         expUserFilterInput.addEventListener('input', handleHistoryFilter);
    }
}

// 模組初始化函式
export const init = () => {
    resetPointsCenterPage();
    
    // 確保事件只被綁定一次
    const page = document.getElementById('page-points');
    if (page && !page.dataset.initialized) {
        setupEventListeners();
        page.dataset.initialized = 'true';
    }
};