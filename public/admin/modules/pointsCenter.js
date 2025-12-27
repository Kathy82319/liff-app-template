// public/admin/modules/pointsCenter.js
import { api } from '../api.js';
import { ui } from '../ui.js';

let html5QrCode = null;
let currentSelectedUserForPoints = null;
let allExpHistory = []; 
let activeTemplate = null; 

// 定義預設欄位 (若藍圖未定義時使用)
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

// --- 【核心功能】初始化下拉選單 ---
function initReasonSelect(historyData = []) {
    const reasonSelect = document.getElementById('reason-select');
    if (!reasonSelect) return;

    // 1. 保留目前選中的值 (如果有的話，避免重刷時跳掉)
    const currentValue = reasonSelect.value;

    // 2. 清空選項
    reasonSelect.innerHTML = '';

    // 3. 定義系統預設選項
    const defaultReasons = ["消費回饋", "活動獎勵", "生日禮金", "補償", "會員升級禮"];
    
    // 4. 從歷史紀錄提取不重複的原因
    const historyReasons = historyData
        .map(r => r.reason)
        .filter(r => r && typeof r === 'string' && !defaultReasons.includes(r)); // 排除空值和已存在的預設值

    // 5. 合併所有選項 (預設 + 歷史)
    const allReasons = [...defaultReasons, ...new Set(historyReasons)];

    // 6. 渲染選項
    allReasons.forEach(r => {
        reasonSelect.add(new Option(r, r));
    });

    // 7. 加入「其他」選項
    reasonSelect.add(new Option("其他 (手動輸入)", "other"));

    // 8. 恢復選取狀態 (如果之前選的值還在列表裡)
    if (currentValue && (allReasons.includes(currentValue) || currentValue === 'other')) {
        reasonSelect.value = currentValue;
    } else {
        reasonSelect.value = defaultReasons[0]; // 預設選第一個
    }
    
    // 觸發一次 change 事件以控制 custom input 的顯示
    reasonSelect.dispatchEvent(new Event('change'));
}

// --- DOM 復原函式 ---
// 確保 HTML 結構符合 Select 模式 (如果之前被改成 Input 模式)
function restoreReasonSelectStructure() {
    const container = document.getElementById('reason-input-container');
    if (!container) return;

    // 如果已經是 Select，就不做任何事
    if (document.getElementById('reason-select')) return;

    container.innerHTML = '';
    
    const label = document.createElement('label');
    label.htmlFor = 'reason-select';
    label.textContent = '點數名稱 (原因):';
    container.appendChild(label);

    const select = document.createElement('select');
    select.id = 'reason-select';
    container.appendChild(select);

    const customInput = document.createElement('input');
    customInput.type = 'text';
    customInput.id = 'custom-reason-input';
    customInput.placeholder = '請輸入自訂原因';
    customInput.style.display = 'none';
    customInput.style.marginTop = '10px';
    container.appendChild(customInput);
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
    
    // 重置表單
    const form = document.getElementById('points-entry-form');
    if (form) {
        form.querySelector('#exp-input').value = '';
        const reasonSelect = form.querySelector('#reason-select');
        if (reasonSelect) {
            reasonSelect.selectedIndex = 0;
            reasonSelect.dispatchEvent(new Event('change'));
        }
        const customInput = form.querySelector('#custom-reason-input');
        if (customInput) customInput.value = '';
    }
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

        allExpHistory = await api.getExpHistory();
        renderExpHistoryList(allExpHistory);
        
        // 【關鍵修改】載入紀錄後，更新選單的歷史選項
        initReasonSelect(allExpHistory);

    } catch (error) {
        console.error('獲取點數紀錄失敗:', error);
        expHistoryTbody.innerHTML = `<tr><td colspan="4" style="color: red; text-align: center;">讀取紀錄失敗: ${error.message}</td></tr>`;
    }
}

function renderExpHistoryList(records) {
    const expHistoryTbody = document.getElementById('exp-history-tbody');
    const expHistoryTheadTr = document.querySelector('#points-tab-history thead tr');

    if (!expHistoryTbody || !expHistoryTheadTr) return;

    // --- 修正開始：安全讀取欄位設定 (優先使用預設值) ---
    let columns = [];

    // 1. 先載入預設值
    columns = EXP_HISTORY_COLUMNS_DEFINITION.slice();

    // 2. 嘗試讀取新版設定 (admin_config) - 目前 systemSettings 還沒實作 points columns，這裡預留未來擴充
    if (activeTemplate && activeTemplate.admin_config && activeTemplate.admin_config.points && Array.isArray(activeTemplate.admin_config.points.columns)) {
         columns = activeTemplate.admin_config.points.columns.filter(col => col.enabled);
    } 
    // 3. 嘗試讀取舊版設定 (logic) - 加入安全檢查避免 undefined 錯誤
    else if (activeTemplate && activeTemplate.logic && Array.isArray(activeTemplate.logic.adminExpHistoryColumns)) {
         columns = activeTemplate.logic.adminExpHistoryColumns.filter(col => col.enabled);
    }
    // --- 修正結束 ---
    
    // 4. 渲染表頭
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

    // 5. 渲染內容
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
                 // 使用 class 控制樣式，不依賴 inline style
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
    
    // 控制自訂原因輸入框顯示
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
            
            // 取得原因
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
                
                // 成功後重新載入紀錄，這會自動更新原因選單
                loadExpHistory(); 

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

export const init = () => {
    restoreReasonSelectStructure();
    resetPointsCenterPage();
    const page = document.getElementById('page-points');
    if (page && !page.dataset.initialized) {
        setupEventListeners();
        page.dataset.initialized = 'true';
    }
    // 初始化時先載入一次選項
    initReasonSelect(allExpHistory);
    
    // 如果還沒載入過歷史紀錄，則載入
    if(allExpHistory.length === 0) {
        loadExpHistory();
    }
};