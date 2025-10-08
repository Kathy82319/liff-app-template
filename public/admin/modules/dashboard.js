// public/admin/modules/dashboard.js
import { api } from '../api.js';
import { ui } from '../ui.js';

// 渲染儀表板數據
const renderStats = (stats) => {
    // 填充所有數據卡片
    document.getElementById('stat-today-guests').textContent = stats.today_total_guests || 0;
    document.getElementById('stat-today-new-bookings').textContent = stats.today_new_bookings || 0;
    document.getElementById('stat-this-week-bookings').textContent = stats.this_week_bookings || 0;
    document.getElementById('stat-today-new-users').textContent = stats.today_new_users || 0;
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
    console.log('[偵錯LOG] 7. Dashboard init() - 函式啟動');
    const page = document.getElementById('page-dashboard');
    if (!page) {
        console.error('[偵錯LOG] 嚴重錯誤: 找不到 #page-dashboard 元素！');
        return;
    }
    
    // 為了確認 init 真的有執行，我們先手動改變一下頁面背景色
    page.style.backgroundColor = 'lightblue';
    console.log('[偵錯LOG] 8. 已將儀表板背景設為淺藍色');

    const guestsEl = document.getElementById('stat-today-guests');
    if (guestsEl) guestsEl.textContent = '讀取中...';

    try {
        console.log('[偵錯LOG] 9. 準備呼叫 api.getDashboardStats()');
        const stats = await api.getDashboardStats();
        console.log('[偵錯LOG] 10. api.getDashboardStats() 成功，取得數據:', stats);
        
        renderStats(stats);
        setupEventListeners();
        
        // 成功後把背景色改回來
        page.style.backgroundColor = ''; 

    } catch (error) {
        console.error('【錯誤捕獲】獲取儀表板數據失敗:', error);
        page.innerHTML = `<p style="color:red; font-size: 1.2rem;">讀取儀表板數據失敗: ${error.message}</p>`;
        // 即使出錯，也把背景色改回來
        page.style.backgroundColor = '';
    }
};