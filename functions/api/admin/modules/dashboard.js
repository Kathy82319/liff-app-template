// public/admin/modules/dashboard.js
import { api } from '../api.js';
import { ui } from '../ui.js';

// 渲染儀表板數據
const renderStats = (stats) => {
    const guestsEl = document.getElementById('stat-today-guests');
    if (guestsEl) {
        guestsEl.textContent = stats.today_total_guests || 0;
    }
    // 未來可以在此處渲染更多統計數據
};

// 綁定儀表板頁面上的事件監聽器
const setupEventListeners = () => {
    const resetDemoDataBtn = document.getElementById('reset-demo-data-btn');
    if (resetDemoDataBtn) {
        // 確保只綁定一次事件，避免重複觸發
        resetDemoDataBtn.onclick = async () => {
            if (!confirm('【警告】您真的確定要清空所有展示資料嗎？\n\n此操作將會刪除所有預約和消費紀錄，且無法復原！')) {
                return;
            }
            try {
                resetDemoDataBtn.textContent = '正在清空中...';
                resetDemoDataBtn.disabled = true;
                await api.resetDemoData();
                alert('展示資料已成功清空！');
                // 重新載入數據
                init(); 
            } catch (error) {
                alert(`錯誤：${error.message}`);
            } finally {
                resetDemoDataBtn.textContent = '清空所有展示資料';
                resetDemoDataBtn.disabled = false;
            }
        };
    }
};

// 模組的初始化函式，由 app.js 呼叫
export const init = async () => {
    // 確保頁面元素存在
    const page = document.getElementById('page-dashboard');
    if (!page) return;
    
    // 顯示讀取中狀態
    const guestsEl = document.getElementById('stat-today-guests');
    if (guestsEl) guestsEl.textContent = '讀取中...';

    try {
        const stats = await api.getDashboardStats();
        renderStats(stats);
        setupEventListeners();
    } catch (error) {
        console.error('獲取儀表板數據失敗:', error);
        page.innerHTML = `<p style="color:red;">讀取儀表板數據失敗: ${error.message}</p>`;
    }
};