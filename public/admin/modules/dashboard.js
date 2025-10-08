// public/admin/modules/dashboard.js
import { api } from '../api.js';
import { ui } from '../ui.js';

// 渲染儀表板數據
const renderStats = (stats) => {
    console.log('[偵錯LOG] 11. renderStats() - 函式啟動，收到的數據:', stats);
    const guestsEl = document.getElementById('stat-today-guests');

    if (guestsEl) {
        console.log('[偵錯LOG] 12. 成功找到 #stat-today-guests 元素。');
        const guestsCount = stats.today_total_guests || 0;
        console.log(`[偵錯LOG] 13. 準備將內容更新為: ${guestsCount}`);
        guestsEl.textContent = guestsCount;
        console.log('[偵錯LOG] 14. 內容更新完畢。');
    } else {
        // 如果找不到元素，這會是一條非常關鍵的紅色錯誤訊息
        console.error('[偵錯LOG] 嚴重錯誤: 在 renderStats() 中找不到 ID 為 "stat-today-guests" 的 HTML 元素！');
    }
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

export const init = async () => {
    // 1. 確保頁面元素存在
    const page = document.getElementById('page-dashboard');
    if (!page) return;
    
    // 2. 顯示讀取中狀態
    const guestsEl = document.getElementById('stat-today-guests');
    if (guestsEl) guestsEl.textContent = '讀取中...';

    try {
        // 3. 呼叫 API 獲取數據
        const stats = await api.getDashboardStats();
        // 4. 渲染數據
        renderStats(stats);
        setupEventListeners();
    } catch (error) {
        // 5. 如果出錯，印出錯誤
        console.error('獲取儀表板數據失敗:', error);
        page.innerHTML = `<p style="color:red;">讀取儀表板數據失敗: ${error.message}</p>`;
    }
};