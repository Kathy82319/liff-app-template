// public/admin/modules/dashboard.js
import { api } from '../api.js';
import { ui } from '../ui.js';

// 渲染儀表板數據
const renderStats = (stats) => {
    // 輔助函式，用於安全地更新 DOM 內容
    const updateText = (id, text) => {
        const el = document.getElementById(id);
        if (el) el.textContent = text;
    };

    updateText('stat-today-guests', stats.today_total_guests || 0);
    updateText('stat-pending-bookings', stats.pending_bookings || 0);
    
    // 格式化為貨幣
    const formattedRevenue = new Intl.NumberFormat('zh-TW', { style: 'currency', currency: 'TWD', minimumFractionDigits: 0 }).format(stats.monthly_revenue || 0);
    updateText('stat-monthly-revenue', formattedRevenue);

    // 渲染熱門服務列表
    const topServicesEl = document.getElementById('stat-top-services');
    if (topServicesEl) {
        if (stats.top_services && stats.top_services.length > 0) {
            topServicesEl.innerHTML = stats.top_services
                .map(service => `<li>${service.item_name} (${service.total_quantity} 次)</li>`)
                .join('');
        } else {
            topServicesEl.innerHTML = '<li>本月尚無服務紀錄</li>';
        }
    }
};

// 綁定儀表板頁面上的事件監聽器
const setupEventListeners = () => {
    // 重設展示資料按鈕的監聽
    const resetDemoDataBtn = document.getElementById('reset-demo-data-btn');
    if (resetDemoDataBtn) {
        if (!resetDemoDataBtn.dataset.listenerAttached) {
            resetDemoDataBtn.addEventListener('click', async () => {
                const confirmed = await ui.confirm('【警告】您真的確定要清空所有展示資料嗎？\n\n此操作將會刪除所有預約和消費紀錄，且無法復原！');
                if (!confirmed) return;
                
                try {
                    resetDemoDataBtn.textContent = '正在清空中...';
                    resetDemoDataBtn.disabled = true;
                    await api.resetDemoData();
                    ui.toast.success('展示資料已成功清空！');
                    await init(); // 重新載入數據
                } catch (error) {
                    ui.toast.error(`錯誤：${error.message}`);
                } finally {
                    resetDemoDataBtn.textContent = '清空所有展示資料';
                    resetDemoDataBtn.disabled = false;
                }
            });
            resetDemoDataBtn.dataset.listenerAttached = 'true';
        }
    }

    // 【新】為儀表板卡片新增點擊事件
    const dashboardGrid = document.getElementById('dashboard-grid');
    if (dashboardGrid && !dashboardGrid.dataset.listenerAttached) {
        dashboardGrid.addEventListener('click', (e) => {
            const card = e.target.closest('.stat-card');
            if (!card || !card.dataset.target) return;

            const targetPage = card.dataset.target;
            if (targetPage === 'bookings') {
                // 模擬點擊導覽列，跳轉到訂位管理頁面
                window.location.hash = '#bookings';
            }
            // 未來可以為其他卡片增加跳轉目標
        });
        dashboardGrid.dataset.listenerAttached = 'true';
    }
};

// 模組的初始化函式，由 app.js 呼叫
export const init = async () => {
    const page = document.getElementById('page-dashboard');
    if (!page) return;

    const guestsEl = document.getElementById('stat-today-guests');
    if (guestsEl) {
        guestsEl.textContent = '讀取中...';
    }

    try {
        const stats = await api.getDashboardStats();
        renderStats(stats);
        setupEventListeners();
    } catch (error) {
        console.error('獲取儀表板數據失敗:', error);
        if (guestsEl) {
            guestsEl.textContent = '讀取失敗';
            guestsEl.style.color = 'var(--color-danger)';
        }
    }
};