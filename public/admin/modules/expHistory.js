// public/admin/modules/expHistory.js
import { api } from '../api.js';

let allExpHistory = []; // 用於快取所有點數紀錄
let activeTemplate = null; // 【新增】存放當前啟用的樣板藍圖

/**
 * 安全地獲取物件的巢狀屬性
 * @param {object} obj - 來源物件
 * @param {string} path - 屬性路徑 (例如 "user.profile.name")
 * @param {*} defaultValue - 找不到時的回傳值
 * @returns {*}
 */
function getProperty(obj, path, defaultValue = 'N/A') {
    const value = path.split('.').reduce((acc, key) => (acc && acc[key] !== undefined && acc[key] !== null) ? acc[key] : undefined, obj);
    // 修改：如果值是空字串，也視為 defaultValue
    const result = (value !== undefined && value !== null && value !== '') ? value : defaultValue;
    
    // 自動截斷過長的字串
    if (typeof result === 'string' && result.length > 50 && defaultValue === 'N/A') {
        return result.substring(0, 47) + '...';
    }
    return result;
}

// 渲染點數紀錄列表 (藍圖驅動版)
function renderExpHistoryList(records) {
    const expHistoryTbody = document.getElementById('exp-history-tbody');
    // --- 【修改】獲取 Thead 中的 tr 元素 ---
    const expHistoryTheadTr = document.querySelector('#page-exp-history thead tr');

    if (!expHistoryTbody || !expHistoryTheadTr) {
        console.error("renderExpHistoryList: 找不到 tbody 或 thead tr 元素。");
        return;
    }

    // --- 1. 檢查 activeTemplate 是否已載入 ---
    if (!activeTemplate || !activeTemplate.logic || !Array.isArray(activeTemplate.logic.adminExpHistoryColumns)) {
        console.error("renderExpHistoryList: activeTemplate 或 adminExpHistoryColumns 尚未準備就緒。");
        expHistoryTheadTr.innerHTML = '<th>錯誤</th>';
        expHistoryTbody.innerHTML = '<tr><td style="text-align: center; color: red;">錯誤：點數紀錄列表欄位設定未載入。請檢查系統設定。</td></tr>';
        return;
    }
    
    // --- 2. 獲取啟用的欄位 ---
    const columns = activeTemplate.logic.adminExpHistoryColumns.filter(col => col.enabled);

    // --- 3. 動態渲染表頭 ---
    let headerHTML = '';
    columns.forEach(col => {
        headerHTML += `<th>${col.label}</th>`;
    });
    // (此頁面沒有固定的操作欄位)
    expHistoryTheadTr.innerHTML = headerHTML;

    // --- 4. 渲染列表內容 ---
    expHistoryTbody.innerHTML = ''; // 清空
    if (!records || records.length === 0) {
        expHistoryTbody.innerHTML = `<tr><td colspan="${columns.length}" style="text-align: center;">找不到符合條件的紀錄。</td></tr>`;
        return;
    }

    records.forEach(record => {
        const row = expHistoryTbody.insertRow();
        
        // --- 5. 根據欄位設定動態插入儲存格 ---
        columns.forEach(col => {
            const cell = row.insertCell();
            let cellContent;

            // 特殊處理：使用者 (合併 nickname)
            // (我們在 systemSettings.js 中定義的 key 是 'nickname')
            if (col.key === 'nickname') {
                const displayName = record.nickname || record.line_display_name || '未知使用者';
                cellContent = `<div class="main-info">${displayName}</div><div class="sub-info">${record.user_id}</div>`;
            }
            // 特殊處理：日期
            else if (col.key === 'created_at') {
                cellContent = new Date(record.created_at).toLocaleString('sv-SE'); // YYYY-MM-DD HH:MM:SS
            }
            // 特殊處理：點數 (加顏色)
            else if (col.key === 'exp_added') {
                const expClass = record.exp_added > 0 ? 'exp-gain' : 'exp-loss';
                const expSign = record.exp_added > 0 ? '+' : '';
                cell.style.fontWeight = 'bold';
                cell.style.color = record.exp_added > 0 ? 'var(--color-success)' : 'var(--color-danger)';
                cellContent = `${expSign}${record.exp_added}`;
            }
            // 預設：使用 getProperty 獲取 (支援 reason 等)
            else {
                cellContent = getProperty(record, col.key, 'N/A');
            }
            
            cell.innerHTML = cellContent; // 使用 innerHTML 以支援 HTML 標籤
        });
    });
}

// 處理篩選邏輯
function handleHistoryFilter() {
    const expUserFilterInput = document.getElementById('exp-user-filter-input');
    if (!expUserFilterInput) return;

    const searchTerm = expUserFilterInput.value.toLowerCase().trim();
    const filteredRecords = searchTerm
        ? allExpHistory.filter(record => 
            (record.nickname || record.line_display_name || '').toLowerCase().includes(searchTerm) ||
            (record.user_id || '').toLowerCase().includes(searchTerm)
          )
        : allExpHistory;
    renderExpHistoryList(filteredRecords);
}

// 綁定事件監聽器
function setupEventListeners() {
    const expUserFilterInput = document.getElementById('exp-user-filter-input');
    if (expUserFilterInput) {
        // 確保監聽器只綁定一次 (如果 input 元素是靜態的)
        if (!expUserFilterInput.dataset.listenerAttached) {
             expUserFilterInput.addEventListener('input', handleHistoryFilter);
             expUserFilterInput.dataset.listenerAttached = 'true';
        }
    }
}

// 模組初始化函式
export const init = async () => {
    console.log("[ExpHistory Init] Starting...");
    const expHistoryTbody = document.getElementById('exp-history-tbody');
    const page = document.getElementById('page-exp-history');
    if (!expHistoryTbody || !page) {
        console.error("[ExpHistory Init] Missing essential elements (tbody or page).");
        return;
    }
    
    expHistoryTbody.innerHTML = '<tr><td colspan="4" style="text-align: center;">正在載入點數紀錄...</td></tr>';
    // 同時清除/設定表頭
    const expHistoryTheadTr = document.querySelector('#page-exp-history thead tr');
    if(expHistoryTheadTr) expHistoryTheadTr.innerHTML = '<th>載入中...</th>';

    try {
        // --- 1. 獲取當前啟用的樣板 (關鍵步驟) ---
        if (!window.CONFIG || !window.CONFIG.LOGIC || !window.CONFIG.LOGIC.ACTIVE_INDUSTRY_TEMPLATE || !window.CONFIG.LOGIC.INDUSTRY_TEMPLATE_DEFINITIONS) {
             console.error("[ExpHistory Init] window.CONFIG is not ready!");
             throw new Error("核心設定尚未載入。");
        }
        
        const activeTemplateKey = window.CONFIG.LOGIC.ACTIVE_INDUSTRY_TEMPLATE;
        activeTemplate = window.CONFIG.LOGIC.INDUSTRY_TEMPLATE_DEFINITIONS[activeTemplateKey]; // 存到模組變數

        if (!activeTemplate) {
            throw new Error(`在設定中找不到名為 "${activeTemplateKey}" 的商業樣板。`);
        }
        // 驗證此頁面需要的設定
        if (!activeTemplate.logic || !Array.isArray(activeTemplate.logic.adminExpHistoryColumns)) {
             throw new Error(`樣板 "${activeTemplateKey}" 缺少 'logic.adminExpHistoryColumns' 陣列設定。`);
        }
        console.log("[ExpHistory Init] Active template loaded:", activeTemplateKey);


        // --- 2. 獲取點數紀錄 ---
        allExpHistory = await api.getExpHistory();
        
        // --- 3. 渲染列表 (現在會動態生成表頭) ---
        renderExpHistoryList(allExpHistory);
        
        // --- 4. 綁定靜態事件 (確保只綁定一次) ---
        if (page.dataset.initialized !== 'true') {
            setupEventListeners();
            page.dataset.initialized = 'true';
            console.log("[ExpHistory Init] Event listeners attached.");
        }
    } catch (error) {
        console.error('獲取點數紀錄失敗:', error);
        if(expHistoryTheadTr) expHistoryTheadTr.innerHTML = '<th>錯誤</th>';
        expHistoryTbody.innerHTML = `<tr><td colspan="4" style="color: red; text-align: center;">讀取紀錄失敗: ${error.message}</td></tr>`;
    }
};