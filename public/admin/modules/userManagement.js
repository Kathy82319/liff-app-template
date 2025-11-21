// public/admin/modules/userManagement.js
import { api } from '../api.js';
import { ui } from '../ui.js'; 

let allUsers = []; 
let allSettings = []; 
let allVoucherTemplates = []; 
let activeTemplate = null; 
let membershipPlans = []; 
let allDrafts = []; 

function getProperty(obj, path, defaultValue = 'N/A') {
    const value = path.split('.').reduce((acc, key) => (acc && acc[key] !== undefined && acc[key] !== null) ? acc[key] : undefined, obj);
    const result = (value !== undefined && value !== null && value !== '') ? value : defaultValue;
    if (typeof result === 'string' && result.length > 50 && defaultValue === 'N/A') {
        return result.substring(0, 47) + '...';
    }
    return result;
}

// --- 列表渲染：使用藍圖控制欄位 (包含 stored_value_balance) ---
function renderUserList(users) {
    const userListTbody = document.getElementById('user-list-tbody');
    const userListTheadTr = document.querySelector('#page-users thead tr'); 

    if (!userListTbody || !userListTheadTr) return;

    // 1. 使用藍圖定義的欄位 (支援排序與開關)
    if (!activeTemplate || !activeTemplate.logic || !Array.isArray(activeTemplate.logic.adminUserColumns)) {
         console.error("adminUserColumns 未定義");
         return;
    }
    const columns = activeTemplate.logic.adminUserColumns.filter(col => col.enabled);

    // 2. 渲染表頭
    let theadHTML = '';
    columns.forEach(col => {
        theadHTML += `<th>${col.label}</th>`;
    });
    theadHTML += `<th>標籤</th><th>操作</th>`; // 標籤和操作固定顯示
    userListTheadTr.innerHTML = theadHTML;

    userListTbody.innerHTML = '';
    if (!users || users.length === 0) {
         userListTbody.innerHTML = `<tr><td colspan="${columns.length + 2}" style="text-align: center;">找不到符合條件的顧客。</td></tr>`;
         return;
    }
    
    users.forEach(user => {
        const row = userListTbody.insertRow();
        row.dataset.userId = user.user_id;
        row.style.cursor = 'pointer';
        
        // 3. 渲染自訂欄位
        columns.forEach(col => {
            const cell = row.insertCell();
            if (col.key === 'stored_value_balance') {
                // 特殊處理儲值金顯示
                const balance = user.stored_value_balance || 0;
                cell.innerHTML = `<span style="font-weight:bold; color: var(--color-primary);">$${balance}</span>`;
            } else if (col.key === 'line_display_name') {
                // 特殊處理名稱
                const displayName = user.real_name ? `${user.real_name} (${user.line_display_name})` : user.line_display_name;
                const phoneDisplay = user.phone ? user.phone : '<span style="color:#ccc;">未設定電話</span>';
                cell.innerHTML = `<div class="main-info">${displayName}</div><div class="sub-info">${phoneDisplay}</div>`;
            } else {
                cell.textContent = getProperty(user, col.key, 'N/A');
            }
        });

        // 4. 渲染固定欄位
        row.insertCell().innerHTML = `<span class="tag-display">${user.tag || '無'}</span>`;
        const actionCell = row.insertCell();
        actionCell.className = 'actions-cell';
        actionCell.innerHTML = `<button class="action-btn btn-edit-user" data-userid="${user.user_id}" style="background-color: var(--color-warning); color: #000;">編輯</button>`;
    });
}

// ... (其他函式保持不變) ...
function renderMembershipPlans() {
    const container = document.getElementById('membership-plans-list');
    if (!container) return;

    if (!membershipPlans || membershipPlans.length === 0) {
        container.innerHTML = '<div style="text-align: center; padding: 2rem; color: var(--color-text-light); background: #fff; border-radius: 4px; border: 1px dashed var(--color-border);">尚未設定任何會員方案，請點擊右上角「新增方案」。</div>';
        return;
    }

    let html = '<div class="plans-grid" style="display: grid; gap: 1rem;">';
    membershipPlans.forEach((plan, index) => {
        html += `
            <div class="plan-card" style="background: #fff; padding: 1rem; border-radius: 6px; border: 1px solid var(--color-border); display: flex; justify-content: space-between; align-items: center;">
                <div style="flex-grow: 1;">
                    <h4 style="margin: 0 0 5px 0; color: var(--color-primary);">${plan.planName}</h4>
                    <p style="margin: 0; font-size: 0.9rem; color: var(--color-text-secondary);">
                        <span style="background: #f0f2f5; padding: 2px 6px; border-radius: 4px;">預設優惠</span> 
                        ${plan.perk || '無'}
                    </p>
                </div>
                <div class="actions" style="flex-shrink: 0; margin-left: 1rem;">
                    <button class="action-btn btn-edit-plan" data-index="${index}" style="background-color: var(--color-warning); color: #000; margin-right: 5px;">編輯</button>
                    <button class="action-btn btn-delete-plan" data-index="${index}" style="background-color: var(--color-danger);">刪除</button>
                </div>
            </div>
        `;
    });
    html += '</div>';
    container.innerHTML = html;
}

function openEditPlanModal(index = null) {
    const form = document.getElementById('edit-membership-plan-form');
    const title = document.getElementById('modal-plan-title');
    const nameInput = document.getElementById('edit-plan-name');
    const perkInput = document.getElementById('edit-plan-perk');
    const originalNameInput = document.getElementById('edit-plan-original-name');

    form.reset();
    
    if (index !== null) {
        const plan = membershipPlans[index];
        title.textContent = '編輯會員方案';
        nameInput.value = plan.planName;
        perkInput.value = plan.perk || '';
        originalNameInput.value = index;
    } else {
        title.textContent = '新增會員方案';
        originalNameInput.value = '';
    }
    ui.showModal('#edit-membership-plan-modal');
}

async function handlePlanSubmit(e) {
    e.preventDefault();
    const index = document.getElementById('edit-plan-original-name').value;
    const name = document.getElementById('edit-plan-name').value.trim();
    const perk = document.getElementById('edit-plan-perk').value.trim();
    const submitBtn = e.target.querySelector('button[type="submit"]');

    if (!name) return ui.toast.error('方案名稱為必填！');
    submitBtn.disabled = true;
    submitBtn.textContent = '儲存中...';

    try {
        const newPlan = { planName: name, perk: perk };
        if (index !== '') {
            membershipPlans[parseInt(index)] = newPlan;
        } else {
            membershipPlans.push(newPlan);
        }
        await api.updateSettings([{ key: 'LOGIC_MEMBERSHIP_PLANS', value: JSON.stringify(membershipPlans), type: 'json' }]);
        ui.toast.success('會員方案設定已儲存！');
        ui.hideModal('#edit-membership-plan-modal');
        renderMembershipPlans();
        
        const settingItem = allSettings.find(s => s.key === 'LOGIC_MEMBERSHIP_PLANS');
        if (settingItem) settingItem.value = JSON.stringify(membershipPlans);
        else allSettings.push({ key: 'LOGIC_MEMBERSHIP_PLANS', value: JSON.stringify(membershipPlans), type: 'json' });

    } catch (error) {
        ui.toast.error(`儲存失敗: ${error.message}`);
    } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = '儲存';
    }
}

async function handleDeletePlan(index) {
    const plan = membershipPlans[index];
    if (!confirm(`確定要刪除「${plan.planName}」方案嗎？\n\n注意：這只會從選單中移除此選項，已經被設為此方案的顧客資料不會受到影響。`)) return;
    try {
        membershipPlans.splice(index, 1);
        await api.updateSettings([{ key: 'LOGIC_MEMBERSHIP_PLANS', value: JSON.stringify(membershipPlans), type: 'json' }]);
        ui.toast.success('方案已刪除。');
        renderMembershipPlans();
        const settingItem = allSettings.find(s => s.key === 'LOGIC_MEMBERSHIP_PLANS');
        if (settingItem) settingItem.value = JSON.stringify(membershipPlans);
    } catch (error) {
        ui.toast.error(`刪除失敗: ${error.message}`);
    }
}

function handleUserSearch() {
    const userSearchInput = document.getElementById('user-search-input');
    const searchTerm = userSearchInput.value.toLowerCase().trim();
    
    const filteredUsers = searchTerm
        ? allUsers.filter(user => {
            const matchLineName = (user.line_display_name || '').toLowerCase().includes(searchTerm);
            const matchRealName = (user.real_name || '').toLowerCase().includes(searchTerm);
            const matchPhone = (user.phone || '').includes(searchTerm);
            const matchClass = (user.class || '').toLowerCase().includes(searchTerm);
            const matchTag = (user.tag || '').toLowerCase().includes(searchTerm);
            return matchLineName || matchRealName || matchPhone || matchClass || matchTag;
        })
        : allUsers;
        
    renderUserList(filteredUsers);
}

function openEditUserModal(userId) {
    const user = allUsers.find(u => u.user_id === userId);
    const editUserModal = document.getElementById('edit-user-modal');
    if (!user || !editUserModal) return;

    const editUserForm = document.getElementById('edit-user-form');
    editUserForm.reset();
    editUserModal.querySelector('#modal-user-title').textContent = `編輯：${user.line_display_name}`;
    
    document.getElementById('edit-user-id').value = user.user_id;
    document.getElementById('edit-level-input').value = user.level;
    document.getElementById('edit-exp-input').value = user.current_exp;
    document.getElementById('edit-notes-textarea').value = user.notes || '';

    const classSelect = document.getElementById('edit-class-select');
    const otherClassInput = document.getElementById('edit-class-other-input');
    const perkInput = document.getElementById('edit-perk-input');
    
    classSelect.innerHTML = '<option value="">無方案</option>';
    membershipPlans.forEach(plan => {
        classSelect.add(new Option(plan.planName, plan.planName));
    });
    classSelect.add(new Option('其他 (自訂)', 'other'));
    
    const foundPlan = membershipPlans.find(p => p.planName === user.class);
    if (foundPlan) {
        classSelect.value = user.class;
        perkInput.value = foundPlan.perk || '';
        otherClassInput.style.display = 'none';
    } else if (user.class && user.class !== '無') {
        classSelect.value = 'other';
        otherClassInput.style.display = 'block';
        otherClassInput.value = user.class;
        perkInput.value = user.perk || '';
    } else {
        classSelect.value = '';
        otherClassInput.style.display = 'none';
        perkInput.value = '';
    }
    
    const tagSelect = document.getElementById('edit-tag-select');
    const otherTagInput = document.getElementById('edit-tag-other-input');
    const standardTags = ["", "會員", "員工", "黑名單"];
    if (user.tag && !standardTags.includes(user.tag)) {
        tagSelect.value = 'other';
        otherTagInput.style.display = 'block';
        otherTagInput.value = user.tag;
    } else {
        tagSelect.value = user.tag || '';
        otherTagInput.style.display = 'none';
    }

    ui.showModal('#edit-user-modal');
}

function renderHistoryTable(items, columns, headers) {
    const fragment = document.createDocumentFragment();
    if (!items || items.length === 0) {
        const p = document.createElement('p');
        p.textContent = '無相關紀錄';
        fragment.appendChild(p);
        return fragment;
    }
    const table = document.createElement('table');
    table.innerHTML = `<thead><tr>${Object.values(headers).map(h => `<th>${h}</th>`).join('')}</tr></thead>`;
    const tbody = table.createTBody();
    items.forEach(item => {
        const row = tbody.insertRow();
        columns.forEach(col => {
            const cell = row.insertCell();
            let value = item[col];
            if (col.includes('date') || col.includes('_at')) {
                value = new Date(value).toLocaleString('sv-SE');
            }
            cell.textContent = value;
        });
    });
    fragment.appendChild(table); return fragment;
}

async function loadAndBindMessageDrafts(userId) {
    const select = document.querySelector('#message-draft-select');
    const content = document.querySelector('#direct-message-content');
    const sendBtn = document.querySelector('#send-direct-message-btn');
    select.innerHTML = '<option value="">-- 手動輸入或選擇草稿 --</option>';
    
    if(allDrafts.length === 0) {
         try {
             allDrafts = await api.getMessageDrafts();
         } catch(e) { console.warn("載入草稿失敗", e); }
    }

    allDrafts.filter(d => d.draft_id > 2).forEach(d => select.add(new Option(d.title, d.content)));    
    select.onchange = () => { content.value = select.value; };
}

// --- 【核心修改】CRM 詳情渲染：分流控制 ---
function renderUserDetails(data) {
    const userDetailsModal = document.getElementById('user-details-modal');
    const contentContainer = userDetailsModal.querySelector('#user-details-content');
    if (!contentContainer) return;

    const { profile, bookings, exp_history, stored_value_history, vouchers } = data;
    
    // 1. 讀取【Admin CRM】專屬開關
    const showStoredValue = activeTemplate?.features?.ADMIN_CRM_SHOW_STORED_VALUE !== false;
    const showVouchers = activeTemplate?.features?.ADMIN_CRM_SHOW_VOUCHERS !== false;

    // 2. 動態生成 Tab 按鈕
    let tabsHTML = `
        <button class="details-tab active" data-target="tab-bookings">預約紀錄</button>
        <button class="details-tab" data-target="tab-exp">點數紀錄</button>
    `;
    if (showStoredValue) tabsHTML += `<button class="details-tab" data-target="tab-stored-value">儲值金紀錄</button>`;
    if (showVouchers) tabsHTML += `<button class="details-tab" data-target="tab-vouchers">持有優惠券</button>`;

    // 3. 動態生成操作按鈕
    let actionsHTML = '';
    if (showStoredValue) {
        actionsHTML += `<button type="button" class="action-btn" data-action="adjust-stored-value" data-user-id="${profile.user_id}" data-target-name="${profile.line_display_name}" style="background-color: var(--color-success);">儲值/扣款</button>`;
    }
    if (showVouchers) {
        actionsHTML += `<button type="button" class="action-btn" data-action="issue-voucher" data-user-id="${profile.user_id}" data-target-name="${profile.line_display_name}" style="background-color: var(--color-info);">發送優惠券</button>`;
    }
    // 編輯與發訊息永遠顯示
    actionsHTML += `
        <button type="button" class="action-btn" data-action="edit-customer" data-user-id="${profile.user_id}" style="background-color: var(--color-primary);">編輯資料</button>
        <button type="button" id="send-direct-message-btn" class="action-btn" data-action="send-message" data-user-id="${profile.user_id}" data-target-name="${profile.line_display_name}" style="background-color: var(--color-secondary);">確認發送</button>
    `;

    contentContainer.innerHTML = `
        <div class="details-grid">
            <div class="profile-summary">
                <img src="/api/admin/get-avatar?userId=${profile.user_id}" alt="Avatar">
                <h4>${profile.real_name || profile.line_display_name}</h4>
                <p><strong>電話:</strong> ${profile.phone || '未設定'}</p>
                <hr>
                ${showStoredValue ? `<p><strong>儲值金:</strong> <span style="font-size: 1.2em; font-weight: bold; color: var(--color-primary);">$${profile.stored_value_balance || 0}</span></p>` : ''}
                <p><strong>等級:</strong> ${profile.level} (點數：${profile.current_exp})</p>
                <p><strong>方案:</strong> ${profile.class || '無'}</p>
            </div>
            <div class="profile-details">
                ${profile.notes ? `<div class="crm-notes-section"><h4>顧客備註</h4><p>${profile.notes}</p></div>` : ''}
                <div class="details-tabs">
                    ${tabsHTML}
                </div>
                <div class="details-tab-content active" id="tab-bookings"></div>
                <div class="details-tab-content" id="tab-exp"></div>
                ${showStoredValue ? `<div class="details-tab-content" id="tab-stored-value"></div>` : ''}
                ${showVouchers ? `<div class="details-tab-content" id="tab-vouchers"></div>` : ''}
            </div>
        </div>
        <div class="message-sender">
            <h4>操作</h4>
            <div class="form-group">
                <label>選擇訊息草稿</label>
                <select id="message-draft-select"><option value="">-- 手動輸入或選擇草稿 --</option></select>
            </div>
            <div class="form-group">
                <textarea id="direct-message-content" rows="4" placeholder="訊息內容..."></textarea>
            </div>
            <div class="form-actions" id="details-modal-actions" style="flex-wrap: wrap;">
                ${actionsHTML}
            </div>
        </div>
    `;

    contentContainer.querySelector('#tab-bookings').appendChild(renderHistoryTable(bookings, ['booking_date', 'num_of_people', 'status'], { booking_date: '預約日', num_of_people: '人數', status: '狀態' }));
    contentContainer.querySelector('#tab-exp').appendChild(renderHistoryTable(exp_history, ['created_at', 'reason', 'exp_added'], { created_at: '日期', reason: '原因', exp_added: '點數' }));

    if (showStoredValue) {
        const typeMap = { 'admin_topup': '店家儲值', 'admin_deduct': '店家扣款', 'booking_payment': '訂房扣款' };
        const formattedHistory = (stored_value_history || []).map(r => ({ ...r, type_display: typeMap[r.type] || r.type }));
        contentContainer.querySelector('#tab-stored-value').appendChild(renderHistoryTable(
            formattedHistory, ['created_at', 'type_display', 'amount_changed', 'current_balance'], 
            { created_at: '日期', type_display: '類型', amount_changed: '變動', current_balance: '餘額' }
        ));
    }

    if (showVouchers) {
        const safeDateStr = (d) => d ? new Date(d.replace(/-/g, '/')).toLocaleDateString() : '-';
        const formattedVouchers = (vouchers || []).map(v => ({
            ...v, title: v.title, status: v.is_used ? `已用(${safeDateStr(v.used_at)})` : '未使用'
        }));
        contentContainer.querySelector('#tab-vouchers').appendChild(renderHistoryTable(
            formattedVouchers, ['title', 'status', 'valid_to'], { title: '名稱', status: '狀態', valid_to: '效期' }
        ));
    }

    contentContainer.querySelector('.details-tabs').addEventListener('click', e => {
        if (e.target.tagName === 'BUTTON') {
            contentContainer.querySelector('.details-tab.active')?.classList.remove('active');
            e.target.classList.add('active');
            contentContainer.querySelector('.details-tab-content.active')?.classList.remove('active');
            contentContainer.querySelector(`#${e.target.dataset.target}`)?.classList.add('active');
        }
    });
    
    loadAndBindMessageDrafts(profile.user_id);
    const actionsContainer = contentContainer.querySelector('#details-modal-actions');
    if (actionsContainer) actionsContainer.addEventListener('click', handleModalAction);
}

// ... (renderCustomerActions, openAdjustStoredValueModal, openIssueVoucherModal, handleModalAction 保持不變) ...
function renderCustomerActions(profile) {
    const targetName = profile.real_name || profile.line_display_name;
    return `
        <button type="button" class="action-btn" data-action="adjust-stored-value" data-user-id="${profile.user_id}" data-target-name="${targetName}" style="background-color: var(--color-success);">儲值/扣款</button>
        <button type="button" class="action-btn" data-action="issue-voucher" data-user-id="${profile.user_id}" data-target-name="${targetName}" style="background-color: var(--color-info);">發送優惠券</button>
        <button type="button" class="action-btn" data-action="edit-customer" data-user-id="${profile.user_id}" style="background-color: var(--color-primary);">編輯資料</button>
        <button type="button" id="send-direct-message-btn" class="action-btn" data-action="send-message" data-user-id="${profile.user_id}" data-target-name="${targetName}" style="background-color: var(--color-secondary);">確認發送</button>
    `;
}

function openAdjustStoredValueModal(userId, userName) {
    const modal = document.getElementById('stored-value-modal');
    if (!modal) return;
    document.getElementById('stored-value-form').reset();
    document.getElementById('stored-value-user-id').value = userId;
    document.getElementById('stored-value-user-name').textContent = userName;
    const submitBtn = document.getElementById('stored-value-submit-btn');
    submitBtn.disabled = false;
    submitBtn.textContent = '確認變更';
    ui.showModal('#stored-value-modal');
}

function openIssueVoucherModal(userId, userName) {
    const modal = document.getElementById('issue-voucher-modal');
    if (!modal) return;
    document.getElementById('issue-voucher-form').reset();
    document.getElementById('issue-voucher-user-id').value = userId;
    document.getElementById('issue-voucher-user-name').textContent = userName;
    
    const select = document.getElementById('issue-voucher-template-select');
    select.innerHTML = '<option value="">-- 請選擇要發送的樣板 --</option>';
    
    const activeTemplates = allVoucherTemplates.filter(t => t.is_active);
    if (activeTemplates.length === 0) {
        select.innerHTML = '<option value="">-- 沒有已啟用的優惠券樣板 --</option>';
    } else {
        activeTemplates.forEach(t => {
            select.add(new Option(`${t.title} (${t.internal_name})`, t.template_id));
        });
    }
    const submitBtn = document.getElementById('issue-voucher-submit-btn');
    submitBtn.disabled = false;
    submitBtn.textContent = '確認發送';
    ui.showModal('#issue-voucher-modal');
}

async function handleModalAction(event) {
    const button = event.target.closest('button[data-action]');
    if (!button) return;

    const action = button.dataset.action;
    const targetUserId = button.dataset.userId;
    const targetName = button.dataset.targetName;

    if (action === 'edit-customer') {
        openEditUserModal(targetUserId); 
        return;
    }
    
    if (action === 'send-message') {
        const content = document.querySelector('#direct-message-content');
        const message = content.value.trim();
        if (!message) { ui.toast.error('訊息內容不可為空！'); return; }
        if (!confirm(`確定要發送以下訊息給 ${targetName} 嗎？\n\n${message}`)) return;
        
        button.disabled = true;
        button.textContent = '發送中...';
        try {
            await api.sendMessage(targetUserId, message);
            ui.toast.success('訊息發送成功！');
            content.value = '';
            document.querySelector('#message-draft-select').value = '';
        } catch (error) {
            ui.toast.error(`錯誤：${error.message}`);
        } finally {
            button.disabled = false;
            button.textContent = '確認發送';
        }
        return;
    }

    if (action === 'issue-voucher') {
        openIssueVoucherModal(targetUserId, targetName);
        return;
    }

    if (action === 'adjust-stored-value') {
        openAdjustStoredValueModal(targetUserId, targetName);
        return;
    }
}

async function openUserDetailsModal(userId) {
    const userDetailsModal = document.getElementById('user-details-modal');
    const contentContainer = userDetailsModal.querySelector('#user-details-content');
    if (!userDetailsModal || !contentContainer) return;
    
    if (userDetailsModal.style.display === 'flex' && contentContainer.innerHTML !== '') {
        // loading
    } else {
        contentContainer.innerHTML = '<p>讀取中...</p>';
        ui.showModal('#user-details-modal');
    }

    try {
        const data = await api.getUserDetails(userId);
        renderUserDetails(data);
    } catch (error) {
        console.error("CRM 執行錯誤:", error);
        contentContainer.innerHTML = `<p style="color:red;">載入資料時發生錯誤：${error.message}</p>`;
    }
}

async function handleIssueVoucherSubmit(e) {
    e.preventDefault();
    const userId = document.getElementById('issue-voucher-user-id').value;
    const templateId = document.getElementById('issue-voucher-template-select').value;
    const submitBtn = document.getElementById('issue-voucher-submit-btn');

    if (!templateId) return ui.toast.error('請選擇優惠券樣板');

    submitBtn.disabled = true;
    submitBtn.textContent = '發送中...';

    try {
        await api.issueVoucher({ userId, templateId });
        ui.toast.success('優惠券發送成功！');
        ui.hideModal('#issue-voucher-modal');
        openUserDetailsModal(userId); // 刷新 CRM 資料
    } catch (error) {
        ui.toast.error(`發送失敗: ${error.message}`);
    } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = '確認發送';
    }
}

async function handleStoredValueSubmit(e) {
    e.preventDefault();
    const userId = document.getElementById('stored-value-user-id').value;
    const amount = document.getElementById('stored-value-amount').value;
    const notes = document.getElementById('stored-value-notes').value;
    const submitBtn = document.getElementById('stored-value-submit-btn');

    if (!amount || amount == 0) return ui.toast.error('請輸入有效的金額');

    submitBtn.disabled = true;
    submitBtn.textContent = '處理中...';

    try {
        await api.adjustStoredValue({ userId, amount_to_add: parseInt(amount), notes });
        ui.toast.success('儲值金變更成功！');
        ui.hideModal('#stored-value-modal');
        openUserDetailsModal(userId); // 刷新 CRM 資料
        handleUserSearch(); // 更新列表
    } catch (error) {
        ui.toast.error(`變更失敗: ${error.message}`);
    } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = '確認變更';
    }
}

function setupEventListeners() {
    const page = document.getElementById('page-users');
    if (!page) return;
    
    const tabsContainer = document.getElementById('user-sub-tabs');
    if (tabsContainer) {
        tabsContainer.addEventListener('click', (e) => {
            if (e.target.classList.contains('settings-tab')) {
                tabsContainer.querySelector('.active')?.classList.remove('active');
                e.target.classList.add('active');
                page.querySelectorAll('.settings-tab-content').forEach(el => el.classList.remove('active'));
                document.getElementById(e.target.dataset.target)?.classList.add('active');
            }
        });
    }

    const userSearchInput = document.getElementById('user-search-input');
    if (userSearchInput && !userSearchInput.dataset.listenerAttached) {
        userSearchInput.addEventListener('input', handleUserSearch); 
        userSearchInput.dataset.listenerAttached = 'true';
    }

    const userListTbody = document.getElementById('user-list-tbody');
    if (userListTbody) {
        const newListHandler = (event) => {
            const target = event.target;
            const editButton = target.closest('.btn-edit-user');
            if (editButton) {
                event.stopPropagation();
                openEditUserModal(editButton.dataset.userid);
                return;
            }
            const row = target.closest('tr[data-user-id]');
            if (row) {
                openUserDetailsModal(row.dataset.userId);
            }
        };
        if (userListTbody.handler) userListTbody.removeEventListener('click', userListTbody.handler);
        userListTbody.addEventListener('click', newListHandler);
        userListTbody.handler = newListHandler;
    }

    const addPlanBtn = document.getElementById('add-membership-plan-btn');
    if (addPlanBtn) addPlanBtn.addEventListener('click', () => openEditPlanModal());

    const plansList = document.getElementById('membership-plans-list');
    if (plansList) {
        plansList.addEventListener('click', (e) => {
            const editBtn = e.target.closest('.btn-edit-plan');
            const deleteBtn = e.target.closest('.btn-delete-plan');
            if (editBtn) openEditPlanModal(editBtn.dataset.index);
            if (deleteBtn) handleDeletePlan(deleteBtn.dataset.index);
        });
    }

    document.getElementById('edit-membership-plan-form')?.addEventListener('submit', handlePlanSubmit);
    
    const issueVoucherForm = document.getElementById('issue-voucher-form');
    if(issueVoucherForm && !issueVoucherForm.dataset.listenerAttached) {
        issueVoucherForm.addEventListener('submit', handleIssueVoucherSubmit);
        issueVoucherForm.dataset.listenerAttached = 'true';
    }

    const storedValueForm = document.getElementById('stored-value-form');
    if(storedValueForm && !storedValueForm.dataset.listenerAttached) {
        storedValueForm.addEventListener('submit', handleStoredValueSubmit);
        storedValueForm.dataset.listenerAttached = 'true';
    }

    const classSelect = document.getElementById('edit-class-select');
    const otherClassInput = document.getElementById('edit-class-other-input');
    const perkInput = document.getElementById('edit-perk-input');
    if (classSelect && !classSelect.dataset.listenerAttached) {
        classSelect.addEventListener('change', () => {
            if (classSelect.value === 'other') {
                otherClassInput.style.display = 'block'; perkInput.value = ''; otherClassInput.focus();
            } else {
                otherClassInput.style.display = 'none';
                const selectedPlan = membershipPlans.find(p => p.planName === classSelect.value);
                if (selectedPlan) perkInput.value = selectedPlan.perk || '';
            }
        });
        classSelect.dataset.listenerAttached = 'true';
    }

    const editUserForm = document.getElementById('edit-user-form');
    if (editUserForm && !editUserForm.dataset.listenerAttached) {
        editUserForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const userId = document.getElementById('edit-user-id').value;
            let newClass = document.getElementById('edit-class-select').value;
            if (newClass === 'other') newClass = document.getElementById('edit-class-other-input').value.trim();
            
            const tagSelect = document.getElementById('edit-tag-select');
            const otherTagInput = document.getElementById('edit-tag-other-input');
            let tagValue = tagSelect.value === 'other' ? otherTagInput.value : tagSelect.value;

            const updatedData = {
                userId: userId,
                level: document.getElementById('edit-level-input').value,
                current_exp: document.getElementById('edit-exp-input').value,
                tag: tagValue,
                user_class: newClass,
                perk: document.getElementById('edit-perk-input').value.trim(),
                notes: document.getElementById('edit-notes-textarea').value,
            };
            try {
                const result = await api.updateUserDetails(updatedData);
                const userIndex = allUsers.findIndex(u => u.user_id === userId);
                if (userIndex !== -1 && result.updatedUser) {
                    allUsers[userIndex] = { ...allUsers[userIndex], ...result.updatedUser };
                }
                ui.hideModal('#edit-user-modal');
                ui.toast.success('顧客資料更新成功！');
                handleUserSearch();
            } catch (error) {
                ui.toast.error(`錯誤：${error.message}`);
            }
        });
        editUserForm.dataset.listenerAttached = 'true';
    }
}

export const init = async () => {
    console.log("[UserManagement Init] Starting...");
    const userListTbody = document.getElementById('user-list-tbody');
    const page = document.getElementById('page-users');
    if (!userListTbody || !page) return;
    
    userListTbody.innerHTML = '<tr><td colspan="6" style="text-align: center;">正在載入顧客資料...</td></tr>';

    try {
        if (!window.CONFIG || !window.CONFIG.LOGIC) {
             throw new Error("核心設定尚未載入。");
        }
        
        const activeTemplateKey = window.CONFIG.LOGIC.ACTIVE_INDUSTRY_TEMPLATE;
        activeTemplate = window.CONFIG.LOGIC.INDUSTRY_TEMPLATE_DEFINITIONS[activeTemplateKey]; 

        const [users, settings, templates] = await Promise.all([
            api.getUsers(),
            allSettings.length > 0 ? Promise.resolve(allSettings) : api.getSettings(),
            api.getVoucherTemplates()
        ]);

        allUsers = users;
        allSettings = settings;
        allVoucherTemplates = templates || [];

        const plansSetting = allSettings.find(s => s.key === 'LOGIC_MEMBERSHIP_PLANS');
        try {
            membershipPlans = plansSetting && plansSetting.value ? JSON.parse(plansSetting.value) : [];
        } catch { membershipPlans = []; }

        renderUserList(allUsers);
        renderMembershipPlans();
        
        if (page.dataset.initialized !== 'true') {
            setupEventListeners();
            page.dataset.initialized = 'true';
        }
    } catch (error) {
        console.error('User page init error:', error);
        userListTbody.innerHTML = `<tr><td colspan="6" style="color: red; text-align: center;">讀取資料失敗: ${error.message}</td></tr>`;
    }
};