// public/owner/modules/detailsModal.js
import { api } from '../api.js';
import { state, setState } from '../state.js';
import { ui } from '../ui.js';

// --- 主入口：開啟詳細資料 ---
export async function openDetailsModal(type, id) {
    ui.showModal('載入中...', '<p>正在獲取詳細資料...</p>');
    try {
        let title = '', bodyHtml = '', actionsHtml = '';
        
        if (type === 'booking' || type === 'order') {
             // 1. 獲取預約基本資料
             const bookingResults = await api.fetchData(`/api/get-bookings?search=${id}`);
             const bookingData = bookingResults.find(b => b.booking_id == id || b.order_id == id);
             
             if (!bookingData) throw new Error(`找不到資料 (ID: ${id})`);
             
             // 2. 嘗試獲取顧客資料
             let userProfile = null;
             const userId = bookingData.user_id;
             if (userId) {
                 try {
                    const userRes = await api.fetchData(`/api/admin/user-details?userId=${userId}`, { skipGlobalError: true });
                    userProfile = userRes.profile;
                 } catch (e) { 
                     console.warn("無法獲取關聯顧客資料:", e); 
                 }
             }
             
             const details = { booking: bookingData, items: bookingData.items, user: userProfile };
             const idStr = String(id).padStart(5, '0');
             const name = bookingData.contact_name || bookingData.customer_name;
             
             title = `${state.currentTemplate === 'ecommerce_template' ? '訂單' : '預約'} #${idStr} (${name})`;
             bodyHtml = renderBookingDetailsBody(details);
             actionsHtml = renderBookingActions(bookingData, userProfile);

        } else if (type === 'user') {
             // 轉交給顧客模組處理 (避免循環依賴，這裡動態載入)
             const customerModule = await import('./customer.js');
             await customerModule.openCustomerDetailsModal(id);
             return; 
        } else if (type === 'activity') {
             title = `動態 #${id}`;
             bodyHtml = `<p>這是一則動態消息。</p>`;
        } else {
             throw new Error(`未知的詳細資料類型: ${type}`);
        }
        
        ui.showModal(title, bodyHtml, actionsHtml);
        bindModalActions();

    } catch (error) {
         console.error("[openDetailsModal Error]", error);
         ui.showModal('錯誤', `<p style="color: var(--color-danger);">載入詳細資料失敗：${error.message}</p>`);
    }
}

// --- 渲染內容 (HTML 生成) ---

export function renderBookingDetailsBody(details) {
     const { booking, items, user } = details;
     // 判斷欄位名稱 (相容電商與預約)
     const dateLabel = booking.booking_date ? '日期' : '建立日期';
     const dateValue = booking.booking_date ? `${booking.booking_date} ${booking.time_slot || ''}` : new Date(booking.created_at).toLocaleString();
     const status = ui.translateStatus(booking.status);
     
     let html = `
         <h4>資訊</h4>
         <p><strong>${dateLabel}:</strong> ${dateValue}</p>
         <p><strong>狀態:</strong> ${status}</p>
         <p><strong>總金額:</strong> $${booking.total_amount || 0}</p>
         <p><strong>備註:</strong> ${booking.notes || '無'}</p>
         <h4>項目</h4>
     `;
     
     // 項目列表
     const itemList = items || booking.order_items || [];
     if (itemList.length > 0) {
         itemList.forEach(item => {
             html += `<p>- ${item.item_name} x ${item.quantity} ($${item.price || 0})</p>`;
         });
     } else {
         html += '<p>無項目資料</p>';
     }

     html += `
         <h4>顧客資訊</h4>
         <p><strong>姓名:</strong> ${user?.line_display_name || booking.contact_name || booking.customer_name}</p>
         <p><strong>電話:</strong> ${user?.phone || booking.contact_phone || '未提供'}</p>
     `;
     return html;
}

export function renderCustomerDetailsBody(data) {
     const { profile, bookings, vouchers, rally_progress_summary } = data;
     const features = window.CONFIG?.LOGIC?.INDUSTRY_TEMPLATE_DEFINITIONS[state.currentTemplate]?.features || {};
     
     const showStoredValue = features.OWNER_CRM_SHOW_STORED_VALUE !== false;
     const showVouchers = features.OWNER_CRM_SHOW_VOUCHERS !== false;

     // 集點進度
     let rallyHtml = '<p style="color: var(--color-text-secondary);">無進行中的集點活動</p>';
     if (rally_progress_summary && rally_progress_summary.length > 0) {
         rallyHtml = rally_progress_summary.map(r => {
             const isCompleted = r.collected >= r.required;
             const statusStyle = isCompleted ? 'color: var(--color-success); font-weight: bold;' : 'color: var(--color-primary);';
             return `
                <div style="background: var(--color-bg); padding: 8px; border-radius: 4px; border: 1px solid var(--color-secondary); margin-bottom: 8px;">
                    <div style="display: flex; justify-content: space-between;">
                        <span style="font-weight: bold;">${r.title}</span>
                        <span style="${statusStyle}">${r.collected} / ${r.required} 點</span>
                    </div>
                </div>`;
         }).join('');
     }

     // 優惠券
     let vouchersHtml = '';
     if (showVouchers) {
         const activeVouchers = (vouchers || []).filter(v => !v.is_used);
         if (activeVouchers.length > 0) {
             vouchersHtml = activeVouchers.map(v => `
                <div style="background: var(--color-bg); padding: 8px; border-radius: 4px; margin-bottom: 5px; border: 1px solid var(--color-secondary);">
                    <span style="color: var(--color-success); font-weight: bold;">●</span> ${v.title}
                </div>`).join('');
         } else {
             vouchersHtml = '<p style="color:var(--color-text-secondary);">無可用優惠券</p>';
         }
     }

     // 近期預約
     let bookingsHtml = '<p style="color: var(--color-text-secondary);">尚無紀錄</p>';
     if (bookings && bookings.length > 0) {
         bookingsHtml = bookings.slice(0, 3).map(b => {
             const time = b.booking_date || new Date(b.created_at).toLocaleDateString();
             return `
                <div style="background: var(--color-bg); border: 1px solid var(--color-secondary); border-radius: 6px; padding: 10px; margin-bottom: 8px;">
                    <div style="display: flex; justify-content: space-between;">
                        <span style="font-weight: bold;">${time}</span>
                        <span>${ui.translateStatus(b.status)}</span>
                    </div>
                </div>`;
         }).join('');
     }

     return `
         <h4>基本資料</h4>
         <p><strong>名稱:</strong> ${profile.line_display_name}</p>
         <p><strong>電話:</strong> ${profile.phone || '未設定'}</p>
         
         <div style="display: grid; grid-template-columns: 1fr ${showStoredValue ? '1fr' : ''}; gap: 10px; margin-top: 10px; background: var(--color-bg); padding: 10px; border-radius: 8px; border: 1px solid var(--color-secondary);">
             <div><strong style="color: var(--color-primary);">等級/點數</strong><br>${profile.level} / ${profile.current_exp}</div>
             ${showStoredValue ? `<div><strong style="color: var(--color-success);">儲值金</strong><br>$${profile.stored_value_balance || 0}</div>` : ''}
         </div>
         <p style="margin-top: 10px;"><strong>備註:</strong> ${profile.notes || '無'}</p>
         
         <h4>集點進度</h4><div style="max-height: 150px; overflow-y: auto;">${rallyHtml}</div>
         ${showVouchers ? `<h4>持有優惠券</h4><div style="max-height: 150px; overflow-y: auto;">${vouchersHtml}</div>` : ''}
         <h4>近期紀錄</h4><div>${bookingsHtml}</div>
     `;
}

// --- 按鈕渲染 ---

function renderBookingActions(booking, user) {
     let actions = [];
     
     const targetName = user?.line_display_name || booking.contact_name || booking.customer_name;
     const targetId = user?.user_id || booking.user_id;
     
     // 1. 【交換順序】先加入「發送訊息」按鈕 (會在上面)
     if (targetId) {
        actions.push(`<button class="cta-button" data-action="send-message" data-user-id="${targetId}" data-target-name="${targetName}" style="background-color: var(--color-secondary);">發送訊息</button>`);
     }

     // 2. 【交換順序】再加入「取消訂單」按鈕 (會在下面)，並修正文字
     if (booking.status !== 'cancelled' && booking.status !== 'no-show') {
          actions.push(`<button class="cta-button" data-action="cancel" data-id="${booking.booking_id || booking.order_id}" style="background-color: var(--color-danger);">取消該筆訂單</button>`);
     }
     
     return actions.join('');
}

export function renderCustomerActions(profile) {
      const targetName = profile.line_display_name;
      const features = window.CONFIG?.LOGIC?.INDUSTRY_TEMPLATE_DEFINITIONS[state.currentTemplate]?.features || {};
      
      let buttons = [];
      if (features.OWNER_CRM_SHOW_STORED_VALUE !== false) {
          buttons.push(`<button class="cta-button" data-action="adjust-stored-value" data-user-id="${profile.user_id}" data-target-name="${targetName}" style="background-color: var(--color-success);">儲值/扣款</button>`);
      }
      if (features.OWNER_CRM_SHOW_VOUCHERS !== false) {
          buttons.push(`<button class="cta-button" data-action="issue-voucher" data-user-id="${profile.user_id}" data-target-name="${targetName}" style="background-color: var(--color-info);">發送優惠券</button>`);
      }
      buttons.push(`<button class="cta-button" data-action="edit-customer" data-user-id="${profile.user_id}" style="background-color: var(--color-primary);">編輯</button>`);
      buttons.push(`<button class="cta-button" data-action="send-message" data-user-id="${profile.user_id}" data-target-name="${targetName}" style="background-color: var(--color-secondary);">發訊息</button>`);

      return buttons.join('');
}

// --- 事件綁定與處理 ---

function bindModalActions() {
     const container = document.getElementById('details-modal-actions');
     if (!container) return;
     // 移除舊監聽器 (Clone Node)
     const newContainer = container.cloneNode(true);
     container.parentNode.replaceChild(newContainer, container);
     
     newContainer.addEventListener('click', handleModalAction);
}

async function handleModalAction(event) {
     const button = event.target.closest('button[data-action]');
     if (!button) return;

     const action = button.dataset.action;
     const id = button.dataset.id;
     const targetUserId = button.dataset.userId;
     const targetName = button.dataset.targetName;
     
     // 保存原始文字以便復原
     const originalText = button.textContent;
     
     button.disabled = true;
     button.textContent = '...';

     try {
         switch (action) {
             case 'cancel':
                 // 【修正重點】處理確認框的結果
                 const confirmed = await ui.confirmAction('確定要取消此筆訂單嗎？此操作無法復原。');
                 if (confirmed) {
                     // 使用者點擊「確定」
                     await api.fetchData('/api/update-booking-status', { 
                         method: 'POST', 
                         headers: { 'Content-Type': 'application/json' }, 
                         body: JSON.stringify({ bookingId: Number(id), status: 'cancelled' }) 
                     });
                     ui.toast('訂單已取消！'); 
                     ui.closeModal();
                     
                     // 重新載入當前頁面資料
                     const activeModule = await import('./booking.js');
                     activeModule.reload();
                 } else {
                     // 使用者點擊「取消」-> 恢復按鈕狀態
                     button.disabled = false;
                     button.textContent = originalText;
                 }
                 break;
                 
             case 'send-message':
                  // 開啟訊息視窗不需要鎖定按鈕太久，開啟後即可恢復
                  await openSendMessageModal(targetUserId, targetName);
                  button.disabled = false;
                  button.textContent = originalText;
                  break;
                  
             case 'edit-customer':
                 const customerModule = await import('./customer.js');
                 await customerModule.openEditCustomerModal(targetUserId);
                 // 編輯視窗開啟後，原按鈕可以恢復
                 button.disabled = false;
                 button.textContent = originalText;
                 break;
             
             case 'adjust-stored-value':
             case 'issue-voucher':
                 const opModule = await import('./operation.js');
                 opModule.openQuickAction(action, targetUserId, targetName);
                 button.disabled = false;
                 button.textContent = originalText;
                 break;
         }
     } catch (error) {
         ui.toast(`操作失敗：${error.message}`);
         // 發生錯誤時，也要恢復按鈕
         button.disabled = false;
         button.textContent = originalText;
     }
}

// 訊息發送 Modal 邏輯 (放在這裡因為它是通用功能)
async function openSendMessageModal(targetUserId, targetName) {
    const modal = document.getElementById('send-message-modal');
    if (!modal) return;
    
    document.getElementById('send-message-modal-title').textContent = `發送給 ${targetName}`;
    const contentTextarea = document.getElementById('direct-message-content'); // 取得文字框
    contentTextarea.value = '';
    
    const select = document.getElementById('message-draft-select');
    select.innerHTML = '<option value="">-- 載入中... --</option>';
    
    // 【新增】綁定草稿選擇事件 (修正問題 2)
    // 為了避免重複綁定，先移除舊的 (如果有的話)，或是直接用 onchange 屬性
    select.onchange = (e) => {
        if (e.target.value) {
            contentTextarea.value = e.target.value;
        }
    };

    // 綁定送出按鈕
    const btn = document.getElementById('send-message-submit-btn');
    const newBtn = btn.cloneNode(true);
    btn.parentNode.replaceChild(newBtn, btn);
    
    newBtn.onclick = async () => {
        const msg = contentTextarea.value.trim(); // 使用變數
        if(!msg) return ui.toast('請輸入內容');
        newBtn.disabled = true;
        try {
            await api.fetchData('/api/send-message', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userId: targetUserId, message: msg })
            });
            ui.toast('發送成功');
            ui.updateHistoryState('send-message', 'close'); // 關閉 Modal
            modal.style.display = 'none';
        } catch(e) {
            ui.toast('發送失敗: ' + e.message);
        } finally {
            newBtn.disabled = false;
        }
    };

    modal.style.display = 'flex';
    ui.updateHistoryState('send-message', 'open');

    // 載入草稿
    if (state.allMessageDrafts.length === 0) {
        try {
            state.allMessageDrafts = await api.fetchData('/api/admin/message-drafts');
        } catch(e) {}
    }
    select.innerHTML = '<option value="">-- 選擇草稿 --</option>';
    state.allMessageDrafts.forEach(d => {
        if(d.draft_id > 2) select.add(new Option(d.title, d.content));
    });
}