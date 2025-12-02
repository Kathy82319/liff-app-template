// public/owner/modules/activity.js
import { api } from '../api.js';
import { ui } from '../ui.js';
import { openDetailsModal } from './detailsModal.js';

// 初始化函式
export async function init() {
    loadActivities();
    
    // 綁定列表點擊事件 (只綁定一次)
    const container = document.getElementById('activity-list-content');
    if (container && !container.dataset.bound) {
        container.addEventListener('click', (e) => {
            const card = e.target.closest('.activity-card');
            if (card && card.dataset.id && card.dataset.type) {
                 const type = card.dataset.type;
                 const id = card.dataset.id;
                 if (id === 'unknown' || id === 'null') {
                     ui.toast("這是一筆較舊的動態紀錄，無法開啟詳細資料。");
                     return;
                 }
                 openDetailsModal(type, id);
            }
        });
        container.dataset.bound = 'true';
    }
}

async function loadActivities() {
    const container = document.getElementById('activity-list-content');
    if (!container) return;
    
    container.innerHTML = '<p>正在載入動態...</p>';
    try {
        const activities = await api.fetchData('/api/admin/activities');
        if (activities.length === 0) {
            container.innerHTML = '<p>目前沒有最新動態。</p>';
            return;
        }
        
        container.innerHTML = activities.map(act => {
             let statusClass = '', relatedId = null, type = '';
             
             // 解析連結
             if (act.link) {
                 if (act.link.startsWith('#users-')) {
                     type = 'user'; relatedId = act.link.substring(7);
                 } else if (act.link.startsWith('#bookings-')) {
                     type = 'booking'; relatedId = act.link.substring(10);
                 } else if (act.link === '#bookings') {
                     type = 'booking'; relatedId = 'unknown';
                 }
             }
             
             if (type === 'booking') {
                if (act.message.includes('取消')) { statusClass = 'status-cancelled'; }
             } else if (type === 'user') {
                 statusClass = 'status-new-user';
             }
             
             return `
                <div class="activity-card ${statusClass}" data-id="${relatedId || act.activity_id}" data-type="${type || 'activity'}">
                    <p>${act.message}</p>
                    <small>${new Date(act.created_at).toLocaleString()}</small>
                </div>
             `;
        }).join('');
        
    } catch (error) {
        container.innerHTML = `<p style="color:red">載入失敗: ${error.message}</p>`;
    }
}