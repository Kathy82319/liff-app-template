// public/admin/modules/expHistory.js
import { api } from '../api.js';

let allExpHistory = []; // 用於快取所有點數紀錄

// 渲染點數紀錄列表
function renderExpHistoryList(records) {
    const expHistoryTbody = document.getElementById('exp-history-tbody');
    if (!expHistoryTbody) return;

    expHistoryTbody.innerHTML = '';
    if (records.length === 0) {
        expHistoryTbody.innerHTML = '<tr><td colspan="4" style="text-align: center;">找不到符合條件的紀錄。</td></tr>';
        return;
    }

    records.forEach(record => {
        const row = expHistoryTbody.insertRow();
        const displayName = record.nickname || record.line_display_name || '未知使用者';
        const date = new Date(record.created_at).toLocaleString('sv-SE'); // 使用 'sv-SE' 格式化為 YYYY-MM-DD HH:MM:SS
        const expClass = record.exp_added > 0 ? 'exp-gain' : 'exp-loss';
        const expSign = record.exp_added > 0 ? '+' : '';
        
        row.innerHTML = `
            <td class="compound-cell">
                <div class="main-info">${displayName}</div>
                <div class="sub-info">${record.user_id}</div>
            </td>
            <td>${date}</td>
            <td>${record.reason}</td>
            <td class="${expClass}" style="font-weight: bold; color: ${record.exp_added > 0 ? 'var(--color-success)' : 'var(--color-danger)'};">
                ${expSign}${record.exp_added}
            </td>
        `;
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
        expUserFilterInput.addEventListener('input', handleHistoryFilter);
    }
}

// 模組初始化函式
export const init = async () => {
    const expHistoryTbody = document.getElementById('exp-history-tbody');
    if (!expHistoryTbody) return;
    
    expHistoryTbody.innerHTML = '<tr><td colspan="4" style="text-align: center;">正在載入點數紀錄...</td></tr>';
    
    try {
        allExpHistory = await api.getExpHistory();
        renderExpHistoryList(allExpHistory);
        
        // 確保事件只被綁定一次
        if (!document.getElementById('page-exp-history').dataset.initialized) {
            setupEventListeners();
            document.getElementById('page-exp-history').dataset.initialized = 'true';
        }
    } catch (error) {
        console.error('獲取點數紀錄失敗:', error);
        expHistoryTbody.innerHTML = `<tr><td colspan="4" style="color: red; text-align: center;">讀取紀錄失敗: ${error.message}</td></tr>`;
    }
};