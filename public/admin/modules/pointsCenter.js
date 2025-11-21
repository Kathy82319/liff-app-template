// public/admin/modules/pointsCenter.js
import { api } from '../api.js';
import { ui } from '../ui.js';

let html5QrCode = null;
let currentSelectedUserForPoints = null;
let allExpHistory = []; 
let activeTemplate = null; 

const EXP_HISTORY_COLUMNS_DEFINITION = [
     { key: 'created_at', label: '日期', enabled: true },
     { key: 'user_info', label: '顧客 (姓名/電話)', enabled: true },
     { key: 'reason', label: '原因', enabled: true },
     { key: 'exp_added', label: '點數', enabled: true },
];

function getProperty(obj, path, defaultValue = 'N/A') {
    const value = path.split('.').reduce((acc, key) => (acc && acc[key] !== undefined && acc[key] !== null) ? acc[key] : undefined, obj);
    const result = (value !== undefined && value !== null && value !== '') ? value : defaultValue;
    if (typeof result === 'string' && result.length > 50 && defaultValue === 'N/A') {
        return result.substring(0, 47) + '...';
    }
    return result;
}

function setupTabs() {
    const tabsContainer = document.getElementById('points-sub-tabs');
    if (!tabsContainer) return;

    tabsContainer.addEventListener('click', (e) => {
        if (e.target.matches('.settings-tab')) {
            tabsContainer.querySelector('.active')?.classList.remove('active');
            document.querySelectorAll('#page-points .settings-tab-content').forEach(el => el.classList.remove('active'));

            e.target.classList.add('active');
            const targetId = e.target.dataset.target;
            document.getElementById(targetId)?.classList.add('active');

            if (targetId === 'points-tab-history' && allExpHistory.length === 0) {
                loadExpHistory();
            }
        }
    });
}

// --- 【新增】初始化原因輸入框與建議列表 ---
function initReasonInput() {
    const reasonInput = document.getElementById('reason-input');
    if (!reasonInput) return;

    // 1. 建立或獲取 datalist
    let dataList = document.getElementById('reason-suggestions');
    if (!dataList) {
        dataList = document.createElement('datalist');
        dataList.id = 'reason-suggestions';
        document.body.appendChild(dataList); // 必須加到 DOM 中
        reasonInput.setAttribute('list', 'reason-suggestions');
    }

    // 2. 定義預設選項
    const defaultReasons = ["消費回饋", "生日禮金", "活動獎勵", "會員升級禮", "補償"];
    
    // 3. 從 LocalStorage 讀取自訂選項
    let savedReasons = [];
    try {
        const stored = localStorage.getItem('admin_custom_point_reasons');
        if (stored) savedReasons = JSON.parse(stored);
    } catch (e) { console.warn("讀取儲存的原因失敗", e); }

    // 4. 合併並去重複
    const allReasons = Array.from(new Set([...defaultReasons, ...savedReasons]));

    // 5. 渲染選項
    dataList.innerHTML = allReasons.map(r => `<option value="${r}">`).join('');
}

// --- 【新增】儲存新的原因 ---
function saveNewReason(reason) {
    if (!reason) return;
    const defaultReasons = ["消費回饋", "生日禮金", "活動獎勵", "會員升級禮", "補償"];
    
    // 如果是預設的，不用存
    if (defaultReasons.includes(reason)) return;

    let savedReasons = [];
    try {
        const stored = localStorage.getItem('admin_custom_point_reasons');
        if (stored) savedReasons = JSON.parse(stored);
    } catch (e) { }

    // 如果已經存過，也不用存
    if (savedReasons.includes(reason)) return;

    // 加入並限制數量 (例如只存最近 20 個)
    savedReasons.unshift(reason);
    if (savedReasons.length > 20) savedReasons.pop();

    localStorage.setItem('admin_custom_point_reasons', JSON.stringify(savedReasons));
    
    // 重新整理列表
    initReasonInput(); 
}


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
    
    // 重置原因輸入框 (如果有)
    const reasonInput = document.getElementById('reason-input');
    if (reasonInput) reasonInput.value = '';
}

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
        // 重置原因
        const reasonInput = form.querySelector('#reason-input');
        if (reasonInput) reasonInput.value = '';
        
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

async function loadExpHistory() {
    const expHistoryTbody = document.getElementById('exp-history-tbody');
    if (!expHistoryTbody) return;

    expHistoryTbody.innerHTML = '<tr><td colspan="4" style="text-align: center;">正在載入點數紀錄...</td></tr>';

    try {
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

        allExpHistory = await api.getExpHistory();
        renderExpHistoryList(allExpHistory);

    } catch (error) {
        console.error('獲取點數紀錄失敗:', error);
        expHistoryTbody.innerHTML = `<tr><td colspan="4" style="color: red; text-align: center;">讀取紀錄失敗: ${error.message}</td></tr>`;
    }
}

function renderExpHistoryList(records) {
    const expHistoryTbody = document.getElementById('exp-history-tbody');
    const expHistoryTheadTr = document.querySelector('#points-tab-history thead tr');

    if (!expHistoryTbody || !expHistoryTheadTr) return;

    let columns = [];
    
    if (activeTemplate && Array.isArray(activeTemplate.logic.adminExpHistoryColumns)) {
        if (!activeTemplate.logic.adminExpHistoryColumns.some(col => col.key === 'user_info')) {
             columns = EXP_HISTORY_COLUMNS_DEFINITION.slice(); 
        } else {
             columns = activeTemplate.logic.adminExpHistoryColumns.filter(col => col.enabled);
        }
    } else {
        columns = EXP_HISTORY_COLUMNS_DEFINITION.slice();
    }
    
    let headerHTML = '';
    columns.forEach(col => {
        headerHTML += `<th>${col.label}</th>`;
    });
    expHistoryTheadTr.innerHTML = headerHTML;

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
            
            if (col.key === 'created_at') {
                cellContent = new Date(record.created_at).toLocaleString('zh-TW', { year: 'numeric', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });
            } 
            else if (col.key === 'exp_added') {
                const expSign = record.exp_added > 0 ? '+' : '';
                cell.style.fontWeight = 'bold';
                cell.style.color = record.exp_added > 0 ? 'var(--color-success)' : 'var(--color-danger)';
                cellContent = `${expSign}${record.exp_added}`;
            } 
            else if (col.key === 'user_info') { 
                 const displayName = record.real_name || record.line_display_name || 'N/A';
                 const phoneDisplay = record.phone ? record.phone : '無電話';
                 cellContent = `<div class="main-info compound-cell">${displayName}</div><div class="sub-info compound-cell">${phoneDisplay}</div>`;
            }
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
            (record.line_display_name || '').toLowerCase().includes(searchTerm) ||
            (record.real_name || '').toLowerCase().includes(searchTerm) ||
            (record.phone || '').includes(searchTerm) ||
            (record.user_id || '').toLowerCase().includes(searchTerm) ||
            (record.reason || '').toLowerCase().includes(searchTerm)
          )
        : allExpHistory;
    renderExpHistoryList(filteredRecords);
}

function setupEventListeners() {
    setupTabs();

    const userSearchInput = document.getElementById('user-search-input-points');
    const userSearchResults = document.getElementById('user-search-results');
    const startScanBtn = document.getElementById('start-scan-btn');
    const submitExpBtn = document.getElementById('submit-exp-btn');
    // 移除 reasonSelect 相關
    // const reasonSelect = document.getElementById('reason-select');
    // const customReasonInput = document.getElementById('custom-reason-input');

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
    
    // 【修改】提交按鈕邏輯：讀取新的 input
    if (submitExpBtn) {
        submitExpBtn.addEventListener('click', async () => {
            if (!currentSelectedUserForPoints || !currentSelectedUserForPoints.id) {
                ui.toast.error('錯誤：尚未選取顧客！');
                return;
            }
            const pointsStatusMessage = document.getElementById('points-status-message');
            const expInput = document.getElementById('exp-input');
            const expValue = Number(expInput.value);
            
            // 讀取智慧輸入框
            const reasonInput = document.getElementById('reason-input');
            const reason = reasonInput ? reasonInput.value.trim() : '';

            if (!expValue || expValue <= 0 || !reason) {
                pointsStatusMessage.textContent = '錯誤：點數和原因皆為必填。';
                pointsStatusMessage.style.color = 'var(--color-danger)';
                return;
            }

            pointsStatusMessage.textContent = '正在處理中...';
            submitExpBtn.disabled = true;

            try {
                await api.addPoints({ userId: currentSelectedUserForPoints.id, expValue, reason });
                
                // 成功後，儲存這個原因
                saveNewReason(reason);

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

    const expUserFilterInput = document.getElementById('exp-user-filter-input');
    if (expUserFilterInput) {
         expUserFilterInput.addEventListener('input', handleHistoryFilter);
    }
}

// --- 【新增】DOM 修改函式：動態替換 HTML ---
function transformReasonInput() {
    const container = document.getElementById('reason-input-container');
    if (!container) return;

    // 檢查是否已經轉換過
    if (document.getElementById('reason-input')) return;

    // 清空舊的 select
    container.innerHTML = '';

    // 建立 Label
    const label = document.createElement('label');
    label.htmlFor = 'reason-input';
    label.textContent = '點數名稱 (原因):';
    container.appendChild(label);

    // 建立 Input
    const input = document.createElement('input');
    input.type = 'text';
    input.id = 'reason-input';
    input.placeholder = '選擇或輸入原因...';
    input.setAttribute('list', 'reason-suggestions'); // 綁定 datalist
    container.appendChild(input);

    // 初始化列表
    initReasonInput();
}


export const init = () => {
    // 先執行 DOM 轉換，把 Select 換成 Input
    transformReasonInput();

    resetPointsCenterPage();
    
    const page = document.getElementById('page-points');
    if (page && !page.dataset.initialized) {
        setupEventListeners();
        page.dataset.initialized = 'true';
    }
    
    // 每次進入頁面都重新整理列表 (讀取 localStorage)
    initReasonInput();
};