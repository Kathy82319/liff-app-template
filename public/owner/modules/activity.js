// public/owner/modules/activity.js
import { api } from '../api.js';
import { ui } from '../ui.js';
import { openDetailsModal } from './detailsModal.js';

export async function init() {
    loadActivities();
    
    const container = document.getElementById('activity-list-content');
    if (container && !container.dataset.bound) {
        container.addEventListener('click', (e) => {
            const card = e.target.closest('.activity-card');
            if (card && card.dataset.id && card.dataset.type) {
                 const type = card.dataset.type;
                 const id = card.dataset.id;
                 if (id === 'unknown' || id === 'null') {
                     ui.toast("此為舊資料或無關聯連結。");
                     return;
                 }
                 openDetailsModal(type, id);
            }
        });
        container.dataset.bound = 'true';
    }
}

// 輔助函式：將純文字訊息格式化為好讀的 HTML
function formatActivityMessage(message) {
    // 嘗試解析標準格式： "顧客 [Name] 預訂了 [Date] 的服務"
    // Regex: 匹配 "顧客" 或 "管理者為" 開頭，中間抓取名字，後面接日期
    const bookingRegex = /(顧客|管理者為)\s+(.+?)\s+(?:預訂了|建立了)\s+(.+?)\s+(?:的服務|的預約|的民宿預約)(.*)/;
    const match = message.match(bookingRegex);

    if (match) {
        const name = match[2];
        const dateRange = match[3];
        const extraInfo = match[4] || ''; // 可能包含 "(儲值金付款)" 等

        return `
            <div class="activity-formatted-row">
                <span class="activity-label">顧客</span>
                <span class="activity-value">${name}</span>
            </div>
            <div class="activity-formatted-row">
                <span class="activity-label">預訂</span>
                <span class="activity-value">${dateRange}</span>
            </div>
            <div class="activity-formatted-row">
                <span class="activity-label">狀態</span>
                <span class="activity-value" style="color: var(--color-primary);">新增預約 ${extraInfo}</span>
            </div>
        `;
    }

    // 嘗試解析取消格式 (如果您的系統有記錄取消動態)
    if (message.includes('取消')) {
        return `<div style="color: var(--color-danger); font-weight: bold;">${message}</div>`;
    }

    // 如果都不符合，回傳原始訊息 (例如系統公告)
    return `<div class="activity-value">${message}</div>`;
}

async function loadActivities() {
    const container = document.getElementById('activity-list-content');
    if (!container) return;
    
    container.innerHTML = '<p style="text-align:center; color:#999; margin-top:20px;">正在載入動態...</p>';
    try {
        const activities = await api.fetchData('/api/admin/activities');
        if (activities.length === 0) {
            container.innerHTML = '<p style="text-align:center; color:#999; margin-top:20px;">目前沒有最新動態。</p>';
            return;
        }
        
        container.innerHTML = activities.map(act => {
             let statusClass = '', relatedId = null, type = '';
             
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
             
             // 使用新的格式化函式
             const formattedContent = formatActivityMessage(act.message);
             const timeStr = new Date(act.created_at).toLocaleString('zh-TW', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });

             return `
                <div class="activity-card ${statusClass}" data-id="${relatedId || act.activity_id}" data-type="${type || 'activity'}" style="padding: 12px 15px;">
                    ${formattedContent}
                    <div style="text-align: right; margin-top: 5px; font-size: 0.8rem; color: #aaa;">
                        ${timeStr}
                    </div>
                </div>
             `;
        }).join('');
        
    } catch (error) {
        container.innerHTML = `<p style="color:red; text-align:center;">載入失敗: ${error.message}</p>`;
    }
}