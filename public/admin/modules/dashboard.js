// public/admin/modules/dashboard.js
import { api } from '../api.js';
import { ui } from '../ui.js';

// 渲染儀表板數據
const renderStats = (stats) => {
    // 1. 讀取設定
    let widgets = { today_orders: true, pending: true, revenue: true, hot_items: true };
    try {
        const activeKey = window.CONFIG?.LOGIC?.ACTIVE_INDUSTRY_TEMPLATE;
        const template = window.CONFIG?.LOGIC?.INDUSTRY_TEMPLATE_DEFINITIONS?.[activeKey];
        if (template?.admin_config?.dashboard?.widgets) {
            widgets = template.admin_config.dashboard.widgets;
        }
    } catch (e) { console.warn("Dashboard config read failed", e); }

    // 2. 輔助函式：更新內容並控制顯示
    const updateCard = (elementId, value, widgetKey, cardIndex) => {
        const el = document.getElementById(elementId);
        if (!el) return;
        
        el.textContent = value;
        
        // 找到外層的 card 容器
        const card = el.closest('.stat-card');
        if (card) {
            // 檢查設定是否啟用
            if (widgets[widgetKey] === false) {
                card.style.display = 'none';
            } else {
                card.style.display = '';
            }
        }
    };

    // 3. 更新各區塊
    updateCard('stat-today-guests', stats.today_total_guests || 0, 'today_orders');
    updateCard('stat-pending-bookings', stats.pending_bookings || 0, 'pending');
    
    const formattedRevenue = new Intl.NumberFormat('zh-TW', { style: 'currency', currency: 'TWD', minimumFractionDigits: 0 }).format(stats.monthly_revenue || 0);
    updateCard('stat-monthly-revenue', formattedRevenue, 'revenue');

    // 熱門服務列表 (對應 hot_items)
    const topServicesEl = document.getElementById('stat-top-services');
    if (topServicesEl) {
        const card = topServicesEl.closest('.stat-card');
        if (widgets.hot_items === false && card) {
            card.style.display = 'none';
        } else {
            if (card) card.style.display = '';
            if (stats.top_services && stats.top_services.length > 0) {
                topServicesEl.innerHTML = stats.top_services
                    .map(service => `<li>${service.item_name} (${service.total_quantity} 次)</li>`)
                    .join('');
            } else {
                topServicesEl.innerHTML = '<li>本月尚無服務紀錄</li>';
            }
        }
    }
};

async function loadAndRenderActivities() {
    const container = document.getElementById('activity-feed-container');
    const badge = document.getElementById('activity-count-badge');
    if (!container || !badge) return;

    try {
        const activities = await api.getActivities();

        if (activities.length > 0) {
            badge.textContent = `${activities.length} 則未讀`;
            badge.style.display = 'inline-block';
            container.innerHTML = activities.map(act => `
                <div class="activity-item" data-id="${act.activity_id}" style="padding: 0.8rem 0.5rem; border-bottom: 1px solid var(--color-border); display: flex; justify-content: flex-start; align-items: center; gap: 1rem; opacity: 1; transition: opacity 0.5s ease; text-align: left;">
                    <div class="activity-checkbox-wrapper" style="flex-shrink: 0;">
                        <input type="checkbox" class="mark-activity-read" title="標示為已讀">
                    </div>
                    <div class="activity-content" style="flex-grow: 1;">
                        <p style="margin: 0; font-weight: 500;">${act.message}</p>
                        <small style="color: var(--color-text-light);">${new Date(act.created_at).toLocaleString()}</small>
                    </div>
                </div>
            `).join('');

            container.querySelectorAll('.mark-activity-read').forEach(checkbox => {
                checkbox.addEventListener('change', async (e) => {
                    const item = e.target.closest('.activity-item');
                    const activityId = Number(item.dataset.id);
                    if (e.target.checked) {
                        try {
                            e.target.disabled = true;
                            await api.markActivityAsRead(activityId);
                            item.style.opacity = '0.3';
                            ui.toast.success('已標示為已讀');
                        } catch (error) {
                            ui.toast.error(`標示已讀失敗: ${error.message}`);
                            e.target.checked = false;
                            e.target.disabled = false;
                        }
                    }
                });
            });

        } else {
            badge.style.display = 'none';
            container.innerHTML = '<p style="text-align: center; color: var(--color-text-light);">沒有未讀的動態消息</p>';
        }
    } catch (error) {
        container.innerHTML = `<p style="color: var(--color-danger);">載入動態失敗: ${error.message}</p>`;
    }
}

const setupEventListeners = () => {
    const resetDemoDataBtn = document.getElementById('reset-demo-data-btn');
    if (resetDemoDataBtn && !resetDemoDataBtn.dataset.listenerAttached) {
        resetDemoDataBtn.addEventListener('click', async () => {
            const confirmed = await ui.confirm('【警告】您真的確定要清空所有展示資料嗎？\n\n此操作將會刪除所有預約和消費紀錄，且無法復原！');
            if (!confirmed) return;
            
            try {
                resetDemoDataBtn.textContent = '正在清空中...';
                resetDemoDataBtn.disabled = true;
                await api.resetDemoData();
                ui.toast.success('展示資料已成功清空！');
                await init(); 
            } catch (error) {
                ui.toast.error(`錯誤：${error.message}`);
            } finally {
                resetDemoDataBtn.textContent = '清空所有展示資料';
                resetDemoDataBtn.disabled = false;
            }
        });
        resetDemoDataBtn.dataset.listenerAttached = 'true';
    }

    const dashboardGrid = document.getElementById('dashboard-grid');
    if (dashboardGrid && !dashboardGrid.dataset.listenerAttached) {
        dashboardGrid.addEventListener('click', (e) => {
            const card = e.target.closest('.stat-card');
            if (!card || !card.dataset.target) return;
            const targetPage = card.dataset.target;
            if (targetPage === 'bookings') {
                window.location.hash = '#bookings';
            }
        });
        dashboardGrid.dataset.listenerAttached = 'true';
    }
};

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
        await loadAndRenderActivities(); 
    } catch (error) {
        console.error('獲取儀表板數據失敗:', error);
        if (guestsEl) {
            guestsEl.textContent = '讀取失敗';
            guestsEl.style.color = 'var(--color-danger)';
        }
    }
};