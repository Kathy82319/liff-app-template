// public/admin/modules/userManagement.js
import { api } from '../api.js';
import { ui } from '../ui.js'; 

let allUsers = []; // 存放所有使用者資料的快取
let allSettings = []; // 存放系統設定的快取
let allDrafts = []; // 存放訊息草稿的快取
let allVoucherTemplates = []; // 存放優惠券樣板快取
let activeTemplate = null; // 存放當前啟用的樣板藍圖

/**
 * 安全地獲取物件的巢狀屬性
 * @param {object} obj - 來源物件
 * @param {string} path - 屬性路徑 (例如 "user.profile.name")
 * @param {*} defaultValue - 找不到時的回傳值
 * @returns {*}
 */
function getProperty(obj, path, defaultValue = 'N/A') {
    const value = path.split('.').reduce((acc, key) => (acc && acc[key] !== undefined && acc[key] !== null) ? acc[key] : undefined, obj);
    // 修改：如果值是空字串，也視為 defaultValue
    const result = (value !== undefined && value !== null && value !== '') ? value : defaultValue;
    
    // 自動截斷過長的字串
    if (typeof result === 'string' && result.length > 50 && defaultValue === 'N/A') {
        return result.substring(0, 47) + '...';
    }
    return result;
}


// 渲染使用者列表 (藍圖驅動版)
function renderUserList(users) {
    const userListTbody = document.getElementById('user-list-tbody');
    // --- 【修改】獲取 Thead 中的 tr 元素 ---
    const userListTheadTr = document.querySelector('#page-users thead tr'); 

    if (!userListTbody || !userListTheadTr) {
         console.error("renderUserList: 找不到 tbody 或 thead tr 元素。");
         return;
    }

    // --- 1. 檢查 activeTemplate 是否已載入 ---
    if (!activeTemplate || !activeTemplate.logic || !Array.isArray(activeTemplate.logic.adminUserColumns)) {
        console.error("renderUserList: activeTemplate 或 adminUserColumns 尚未準備就緒。");
        userListTheadTr.innerHTML = '<th>錯誤</th>';
        userListTbody.innerHTML = '<tr><td style="text-align: center; color: red;">錯誤：顧客列表欄位設定未載入。請檢查系統設定。</td></tr>';
        return;
    }

    // --- 2. 獲取啟用的欄位 ---
    const columns = activeTemplate.logic.adminUserColumns.filter(col => col.enabled);

    // --- 3. 動態渲染表頭 ---
    let headerHTML = '';
    columns.forEach(col => {
        headerHTML += `<th>${col.label}</th>`;
    });
    headerHTML += '<th>操作</th>'; // 操作欄位固定
    userListTheadTr.innerHTML = headerHTML;

    // --- 4. 渲染列表內容 ---
    userListTbody.innerHTML = ''; // 清空
    if (!users || users.length === 0) {
         userListTbody.innerHTML = `<tr><td colspan="${columns.length + 1}" style="text-align: center;">找不到符合條件的顧客。</td></tr>`;
         return;
    }
    
    users.forEach(user => {
        const row = userListTbody.insertRow();
        row.dataset.userId = user.user_id;
        row.style.cursor = 'pointer';
        
        // --- 5. 根據欄位設定動態插入儲存格 ---
        columns.forEach(col => {
            const cell = row.insertCell();
            let cellContent;

            if (col.key === 'line_display_name') {
                // 直接顯示 LINE 名稱
                cellContent = `<div class="main-info">${user.line_display_name || 'N/A'}</div><div class="sub-info">${user.user_id}</div>`;
            }
            // 特殊處理：等級/點數 (合併)
            else if (col.key === 'level_exp') {
                 cellContent = `${user.level} / ${user.current_exp}`;
            }
            // 特殊處理：標籤
            else if (col.key === 'tag') {
                 cellContent = `<span class="tag-display">${user.tag || '無'}</span>`;
            }
            // 預設：使用 getProperty 獲取 (支援 class, perk 等)
            else {
                cellContent = getProperty(user, col.key, '無'); // 使用 '無' 作為預設值
            }
            
            cell.innerHTML = cellContent; // 使用 innerHTML 以支援 HTML 標籤
        });

        // --- 6. 渲染固定的「操作」儲存格 ---
        // 確保 actions-cell 樣式被正確添加
        const actionCell = row.insertCell();
        actionCell.className = 'actions-cell';
        actionCell.innerHTML = `
            <button class="action-btn btn-edit-user" data-userid="${user.user_id}" style="background-color: var(--color-warning); color: #000;">編輯</button>
        `;
    });
}


// 處理使用者搜尋 (保持不變)
function handleUserSearch() {
    const userSearchInput = document.getElementById('user-search-input');
    const searchTerm = userSearchInput.value.toLowerCase().trim();
    const filteredUsers = searchTerm
        ? allUsers.filter(user =>
            (user.line_display_name || '').toLowerCase().includes(searchTerm)
        )
        : allUsers;
    renderUserList(filteredUsers);
}

// 開啟編輯使用者 Modal (保持不變)
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

    // 從系統設定動態產生會員方案下拉選單
    const classSelect = document.getElementById('edit-class-select');
    const otherClassInput = document.getElementById('edit-class-other-input');
    const perkInput = document.getElementById('edit-perk-input');
    
    classSelect.innerHTML = '<option value="">無方案</option>';
    let membershipPlans = [];
    const plansSetting = allSettings.find(s => s.key === 'LOGIC_MEMBERSHIP_PLANS');
    
    if (plansSetting && plansSetting.value) {
        try {
            membershipPlans = JSON.parse(plansSetting.value);
            membershipPlans.forEach(plan => {
                classSelect.add(new Option(plan.planName, plan.planName));
            });
        } catch(e) {
            console.error("解析會員方案設定失敗:", e);
        }
    }
    classSelect.add(new Option('其他 (自訂)', 'other'));
    
    // 設定預設值
    const foundPlan = membershipPlans.find(p => p.planName === user.class);
    if (foundPlan) {
        classSelect.value = user.class;
        perkInput.value = foundPlan.perk;
        otherClassInput.style.display = 'none';
    } else {
        classSelect.value = 'other';
        otherClassInput.style.display = 'block';
        otherClassInput.value = user.class || '';
        perkInput.value = user.perk || '';
    }
    
    // 標籤部分
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



// 輔助函式：渲染歷史紀錄表格 (保持不變)
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
                value = new Date(value).toLocaleString('sv-SE'); // 改用 toLocaleString 顯示時間
            }
            cell.textContent = value;
        });
    });
    
    fragment.appendChild(table);
    return fragment;
}

// 函式：載入並綁定訊息草稿 (保持不變)
async function loadAndBindMessageDrafts(userId) {
    const select = document.querySelector('#message-draft-select');
    const content = document.querySelector('#direct-message-content');
    const sendBtn = document.querySelector('#send-direct-message-btn');

    select.innerHTML = '<option value="">-- 手動輸入或選擇草稿 --</option>';
    // 篩選掉固定草稿
    allDrafts.filter(d => d.draft_id > 2).forEach(d => select.add(new Option(d.title, d.content)));    
    select.onchange = () => { content.value = select.value; };

    // 使用 .onclick 確保每次打開 Modal 都綁定到正確的 userId
        sendBtn.onclick = async () => {
        const message = content.value.trim();
        if (!message) { ui.toast.error('訊息內容不可為空！'); return; }
        if (!confirm(`確定要發送以下訊息給 ${userId} 嗎？\n\n${message}`)) return;
        try {
            sendBtn.textContent = '發送中...';
            sendBtn.disabled = true;
            // 這裡呼叫的 api.sendMessage() 現在會使用 api.js 中的正確路徑
            await api.sendMessage(userId, message); 
            ui.toast.success('訊息發送成功！');
            content.value = '';
            select.value = '';
        } catch (error) {
            ui.toast.error(`錯誤：${error.message}`);
        } finally {
            sendBtn.textContent = '確認發送';
            sendBtn.disabled = false;
        }
    };
}

// 函式：渲染 CRM 彈窗的完整內容 (【修改】)
function renderUserDetails(data) {
    const userDetailsModal = document.getElementById('user-details-modal');
    const contentContainer = userDetailsModal.querySelector('#user-details-content');
    if (!contentContainer) return;

const { profile, bookings, exp_history, stored_value_history } = data;
const displayName = profile.real_name || profile.line_display_name;
    userDetailsModal.querySelector('#user-details-title').textContent = displayName;

    const storedValueBalance = profile.stored_value_balance || 0;

    contentContainer.innerHTML = `
        <div class="details-grid">
            <div class="profile-summary">
                <img src="/api/admin/get-avatar?userId=${profile.user_id}" alt="Avatar">
                <h4>${displayName}</h4>
                <p><strong>姓名:</strong> ${profile.real_name || '未設定'}</p>
                <p><strong>電話:</strong> ${profile.phone || '未設定'}</p>
                <hr>
                <p><strong>儲值金:</strong> <span style="font-size: 1.2em; font-weight: bold; color: var(--color-primary);">$${storedValueBalance}</span></p>
                <p><strong>等級:</strong> ${profile.level} (點數：${profile.current_exp})</p>
                <p><strong>會員方案:</strong> ${profile.class}</p>
                <p><strong>標籤:</strong> ${profile.tag}</p>
            </div>
            <div class="profile-details">
                ${profile.notes ? `<div class="crm-notes-section" style="margin-bottom: 1rem; padding: 0.8rem; background-color: #fffbe6; border-radius: 6px; border: 1px solid #ffe58f; max-height: 5em; overflow-y: auto;"><h4>顧客備註</h4><p style="white-space: pre-wrap; margin: 0;">${profile.notes}</p></div>` : ''}
                <div class="details-tabs">
                    <button class="details-tab active" data-target="tab-bookings">預約紀錄</button>
                    <button class="details-tab" data-target="tab-exp">點數紀錄</button>
                    <button class="details-tab" data-target="tab-stored-value">儲值金紀錄</button>
                    <button class="details-tab" data-target="tab-vouchers">持有優惠券</button>
                </div>
                <div class="details-tab-content active" id="tab-bookings"></div>
                <div class="details-tab-content" id="tab-exp"></div>
                <div class="details-tab-content" id="tab-stored-value"></div>
                <div class="details-tab-content" id="tab-vouchers"><p>載入中...</p></div>
            </div>
        </div>
        <div class="message-sender">
            <h4>操作</h4>
            <div class="form-group">
                <label for="message-draft-select">選擇訊息草稿 (發送訊息用)</label>
                <select id="message-draft-select"><option value="">-- 手動輸入或選擇草稿 --</option></select>
            </div>
            <div class="form-group">
                <label for="direct-message-content">訊息內容</label>
                <textarea id="direct-message-content" rows="4"></textarea>
            </div>
            <div class="form-actions" id="details-modal-actions" style="flex-wrap: wrap;">
                </div>
        </div>
    `;

    // 渲染三個歷史紀錄表格
    contentContainer.querySelector('#tab-bookings').appendChild(renderHistoryTable(bookings, ['booking_date', 'num_of_people', 'status'], { booking_date: '預約日', num_of_people: '人數', status: '狀態' }));
    contentContainer.querySelector('#tab-exp').appendChild(renderHistoryTable(exp_history, ['created_at', 'reason', 'exp_added'], { created_at: '日期', reason: '原因', exp_added: '點數' }));
    
    // --- 【修改】渲染儲值金紀錄 ---
    const storedValueTab = contentContainer.querySelector('#tab-stored-value');
    
    const typeMap = {
        'admin_topup': '店家儲值',
        'admin_deduct': '店家扣款',
        'booking_payment': '訂房扣款'
    };

    const formattedHistory = (stored_value_history || []).map(record => ({
        ...record,
        created_at: new Date(record.created_at).toLocaleString('sv-SE'), 
        type_display: typeMap[record.type] || record.type 
    }));

    storedValueTab.appendChild(renderHistoryTable(
        formattedHistory, 
        ['created_at', 'type_display', 'amount_changed', 'current_balance', 'notes'], 
        { 
            created_at: '日期', 
            type_display: '類型', 
            amount_changed: '變動金額', 
            current_balance: '餘額',
            notes: '備註'
        }
    ));

    // --- ▼▼▼ 新增：渲染優惠券紀錄 ▼▼▼ ---
    // (目前 User Details API 尚未回傳優惠券，我們先放一個預留位置)
    const voucherTab = contentContainer.querySelector('#tab-vouchers');
    voucherTab.innerHTML = '<p>優惠券紀錄功能待開發 (API: get /api/my-vouchers?userId=...)</p>';


    // 綁定頁籤切換事件
    contentContainer.querySelector('.details-tabs').addEventListener('click', e => {
        if (e.target.tagName === 'BUTTON') {
            contentContainer.querySelector('.details-tab.active')?.classList.remove('active');
            e.target.classList.add('active');
            contentContainer.querySelector('.details-tab-content.active')?.classList.remove('active');
            contentContainer.querySelector(`#${e.target.dataset.target}`)?.classList.add('active');
        }
    });
    
    // 呼叫函式來載入訊息草稿
    loadAndBindMessageDrafts(profile.user_id);

    // 動態渲染操作按鈕
    const actionsContainer = contentContainer.querySelector('#details-modal-actions');
    if (actionsContainer) {
        actionsContainer.innerHTML = renderCustomerActions(profile);
    }
}

// --- ▼▼▼ 修改：渲染 CRM 視窗中的操作按鈕 ▼▼▼ ---
function renderCustomerActions(profile) {
    const targetName = profile.real_name || profile.line_display_name;
    // 儲值按鈕、編輯按鈕、發送訊息按鈕
    return `
        <button type="button" class="action-btn" data-action="adjust-stored-value" data-user-id="${profile.user_id}" data-target-name="${targetName}" style="background-color: var(--color-success);">儲值/扣款</button>
        <button type="button" class="action-btn" data-action="issue-voucher" data-user-id="${profile.user_id}" data-target-name="${targetName}" style="background-color: var(--color-info);">發送優惠券</button>
        <button type="button" class="action-btn" data-action="edit-customer" data-user-id="${profile.user_id}" style="background-color: var(--color-primary);">編輯資料</button>
        <button type="button" id="send-direct-message-btn" class="action-btn" data-action="send-message" data-user-id="${profile.user_id}" data-target-name="${targetName}" style="background-color: var(--color-secondary);">確認發送</button>
    `;
}

// 【新增】開啟儲值/扣款 Modal 的輔助函式 (保持不變)
function openAdjustStoredValueModal(userId, userName) {
    const modal = document.getElementById('stored-value-modal');
    if (!modal) return;
    
    // 重置表單
    document.getElementById('stored-value-form').reset();
    
    // 填入使用者資訊
    document.getElementById('stored-value-user-id').value = userId;
    document.getElementById('stored-value-user-name').textContent = userName;
    
    // 恢復按鈕狀態
    const submitBtn = document.getElementById('stored-value-submit-btn');
    submitBtn.disabled = false;
    submitBtn.textContent = '確認變更';
    
    ui.showModal('#stored-value-modal');
}

// --- ▼▼▼ 新增：開啟「發送優惠券」Modal 的輔助函式 ▼▼▼ ---
function openIssueVoucherModal(userId, userName) {
    const modal = document.getElementById('issue-voucher-modal');
    if (!modal) return;
    
    // 重置表單
    document.getElementById('issue-voucher-form').reset();
    
    // 填入使用者資訊
    document.getElementById('issue-voucher-user-id').value = userId;
    document.getElementById('issue-voucher-user-name').textContent = userName;
    
    // 填充優惠券樣板下拉選單
    const select = document.getElementById('issue-voucher-template-select');
    select.innerHTML = '<option value="">-- 請選擇要發送的樣板 --</option>';
    
    // 使用快取的 allVoucherTemplates
    const activeTemplates = allVoucherTemplates.filter(t => t.is_active);
    if (activeTemplates.length === 0) {
        select.innerHTML = '<option value="">-- 沒有已啟用的優惠券樣板 --</option>';
    } else {
        activeTemplates.forEach(t => {
            select.add(new Option(`${t.title} (${t.internal_name})`, t.template_id));
        });
    }

    // 恢復按鈕狀態
    const submitBtn = document.getElementById('issue-voucher-submit-btn');
    submitBtn.disabled = false;
    submitBtn.textContent = '確認發送';
    
    ui.showModal('#issue-voucher-modal');
}
// --- ▲▲▲ 新增結束 ▲▲▲ ---


// --- ▼▼▼ 修改：處理 CRM Modal 中所有按鈕點擊的函式 ▼▼▼ ---
async function handleModalAction(event) {
    const button = event.target.closest('button[data-action]');
    if (!button) return;

    const action = button.dataset.action;
    const targetUserId = button.dataset.userId;
    const targetName = button.dataset.targetName;
    
    if (action === 'adjust-stored-value') {
        openAdjustStoredValueModal(targetUserId, targetName);
        return; 
    }
    
    // --- ▼▼▼ 新增：處理發送優惠券按鈕點擊 ▼▼▼ ---
    if (action === 'issue-voucher') {
        openIssueVoucherModal(targetUserId, targetName);
        return; 
    }
    // --- ▲▲▲ 新增結束 ▲▲▲ ---

    if (action === 'edit-customer') {
        openEditUserModal(targetUserId); 
        ui.hideModal('#user-details-modal'); 
        return;
    }
    
    if (action === 'send-message') {
        // ... (發送訊息的邏輯保持不變) ...
        const content = document.querySelector('#direct-message-content');
        const message = content.value.trim();
        if (!message) { ui.toast.error('訊息內容不可為空！'); return; }
        if (!confirm(`確定要發送以下訊息給 ${targetUserId} 嗎？\n\n${message}`)) return;
        
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
    
    console.warn('未知的 Modal 操作:', action);
}
// --- ▲▲▲ 修改結束 ▲▲▲ ---


// 函式：開啟使用者詳細資料 (CRM) Modal (保持不變)
async function openUserDetailsModal(userId) {
    const userDetailsModal = document.getElementById('user-details-modal');
    const contentContainer = userDetailsModal.querySelector('#user-details-content');
    if (!userDetailsModal || !contentContainer) return;
    
    contentContainer.innerHTML = '<p>讀取中...</p>';
    ui.showModal('#user-details-modal');

    try {
        const data = await api.getUserDetails(userId);
        // 現在呼叫功能完整的渲染函式
        renderUserDetails(data);
    } catch (error) {
        console.error("CRM 執行錯誤:", error);
        contentContainer.innerHTML = `<p style="color:red;">載入資料時發生錯誤：${error.message}</p>`;
    }
}


// 綁定此頁面所有事件監聽器 (【修改】)
function setupEventListeners() {
    const page = document.getElementById('page-users');
    if (!page) return;
    
    // --- 綁定靜態元素 ---
    const userSearchInput = document.getElementById('user-search-input');
    // 確保監聽器只綁定一次
    if (userSearchInput && !userSearchInput.dataset.listenerAttached) {
        userSearchInput.addEventListener('input', handleUserSearch); 
        userSearchInput.dataset.listenerAttached = 'true';
    }

    // 事件委派：監聽整個 tbody 的點擊
    const userListTbody = document.getElementById('user-list-tbody');
    // 確保移除舊的監聽器 (如果有的話)
    const oldHandler = userListTbody.handler;
    if (oldHandler) userListTbody.removeEventListener('click', oldHandler);

    const newHandler = (event) => {
        const target = event.target;
        
        // 檢查是否點擊了「編輯」按鈕
        const editButton = target.closest('.btn-edit-user');
        if (editButton) {
            event.stopPropagation(); // 阻止事件冒泡觸發點擊行
            const userId = editButton.dataset.userid;
            if (userId) openEditUserModal(userId);
            return;
        }

        // 檢查是否點擊了「行」本身 (開啟 CRM Modal)
        const row = target.closest('tr[data-user-id]');
        if (row) {
            const userId = row.dataset.userId;
            if (userId) openUserDetailsModal(userId);
            return;
        }
    };
    userListTbody.addEventListener('click', newHandler);
    userListTbody.handler = newHandler; // 儲存參照以便移除
    
    // --- ▼▼▼ 關鍵更新：綁定「會員方案」和「標籤」的 change 事件 ▼▼▼ ---
    // 這部分是修復您問題的關鍵
    
    // 1. 會員方案 (Class)
    const classSelect = document.getElementById('edit-class-select');
    const otherClassInput = document.getElementById('edit-class-other-input');
    const perkInput = document.getElementById('edit-perk-input');
    
    if (classSelect && !classSelect.dataset.listenerAttached) {
        classSelect.addEventListener('change', () => {
            if (classSelect.value === 'other') {
                otherClassInput.style.display = 'block';
                perkInput.value = ''; // 自訂方案時清空優惠內容，讓用戶自己填
                otherClassInput.focus();
            } else {
                otherClassInput.style.display = 'none';
                // 自動帶入預設方案的優惠內容
                const plansSetting = allSettings.find(s => s.key === 'LOGIC_MEMBERSHIP_PLANS');
                let membershipPlans = [];
                if (plansSetting && plansSetting.value) {
                    try { membershipPlans = JSON.parse(plansSetting.value); } catch(e) {}
                }
                const selectedPlan = membershipPlans.find(p => p.planName === classSelect.value);
                if (selectedPlan) {
                    perkInput.value = selectedPlan.perk || '';
                }
            }
        });
        classSelect.dataset.listenerAttached = 'true';
    }

    // 2. 標籤 (Tag)
    const tagSelect = document.getElementById('edit-tag-select');
    const otherTagInput = document.getElementById('edit-tag-other-input');
    
    if (tagSelect && !tagSelect.dataset.listenerAttached) {
        tagSelect.addEventListener('change', () => {
            if (tagSelect.value === 'other') {
                otherTagInput.style.display = 'block';
                otherTagInput.focus();
            } else {
                otherTagInput.style.display = 'none';
            }
        });
        tagSelect.dataset.listenerAttached = 'true';
    }
    // --- ▲▲▲ 更新結束 ▲▲▲ ---

    
    // 編輯使用者表單提交 (確保只綁定一次)
    const editUserForm = document.getElementById('edit-user-form');
    if (editUserForm && !editUserForm.dataset.listenerAttached) {
        editUserForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const userId = document.getElementById('edit-user-id').value;
            
            let newClass = document.getElementById('edit-class-select').value;
            if (newClass === 'other') newClass = document.getElementById('edit-class-other-input').value.trim();
            let newTag = document.getElementById('edit-tag-select').value;
            if (newTag === 'other') newTag = document.getElementById('edit-tag-other-input').value.trim();

            const updatedData = {
                userId: userId,
                level: document.getElementById('edit-level-input').value,
                current_exp: document.getElementById('edit-exp-input').value,
                tag: newTag,
                user_class: newClass,
                perk: document.getElementById('edit-perk-input').value.trim(),
                notes: document.getElementById('edit-notes-textarea').value,
                phone: document.getElementById('edit-phone-input')?.value // 確保 phone 欄位存在
            };

            try {
                // 使用 admin API 來更新
                await api.updateUserDetails(updatedData); 
                ui.hideModal('#edit-user-modal');
                ui.toast.success('顧客資料更新成功！');
                await init(); // 呼叫 init 重新獲取並渲染
            } catch (error) {
                ui.toast.error(`錯誤：${error.message}`);
            }
        });
        editUserForm.dataset.listenerAttached = 'true';
    }

    // --- 綁定儲值 Modal 的提交事件 --- (保持不變)
    const storedValueForm = document.getElementById('stored-value-form');
    if (storedValueForm && !storedValueForm.dataset.listenerAttached) {
        storedValueForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const userId = document.getElementById('stored-value-user-id').value;
            const amountInput = document.getElementById('stored-value-amount');
            const notes = document.getElementById('stored-value-notes').value.trim();
            const submitBtn = document.getElementById('stored-value-submit-btn');

            const amount = Number(amountInput.value);

            if (!userId || !amount || amount === 0) {
                ui.toast.error('金額必須是一個非零的數字！');
                return;
            }

            submitBtn.disabled = true;
            submitBtn.textContent = '處理中...';

            try {
                const result = await api.adjustStoredValue({
                    userId: userId,
                    amount_to_add: amount,
                    notes: notes
                });
                
                ui.toast.success(`儲值金更新成功！新餘額: $${result.newBalance}`);
                ui.hideModal('#stored-value-modal');
                
                await init(); 
                await openUserDetailsModal(userId); 

            } catch (error) {
                ui.toast.error(`更新失敗：${error.message}`);
                submitBtn.disabled = false;
                submitBtn.textContent = '確認變更';
            }
        });
        storedValueForm.dataset.listenerAttached = 'true';
    }

    // --- 綁定 CRM 視窗中所有按鈕的點擊事件 --- (保持不變)
    const userDetailsModal = document.getElementById('user-details-modal');
    if (userDetailsModal && !userDetailsModal.dataset.actionListenerAttached) {
        // 我們需要監聽 modal-content 或更高層級，因為 contentContainer 會被重繪
        const modalContent = userDetailsModal.querySelector('.modal-content');
        modalContent.addEventListener('click', (e) => {
            const button = e.target.closest('button[data-action]');
            if (button) {
                handleModalAction(e);
            }
        });
        userDetailsModal.dataset.actionListenerAttached = 'true'; 
    }
    
    // --- ▼▼▼ 新增：綁定「發送優惠券」Modal 的提交事件 ▼▼▼ ---
    const issueVoucherForm = document.getElementById('issue-voucher-form');
    if (issueVoucherForm && !issueVoucherForm.dataset.listenerAttached) {
        issueVoucherForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const userId = document.getElementById('issue-voucher-user-id').value;
            const templateId = document.getElementById('issue-voucher-template-select').value;
            const submitBtn = document.getElementById('issue-voucher-submit-btn');

            if (!templateId) {
                ui.toast.error('請選擇一個優惠券樣板！');
                return;
            }
            
            submitBtn.disabled = true;
            submitBtn.textContent = '發送中...';

            try {
                // 使用我們在 api.js 中定義的 issueVoucher
                await api.issueVoucher({ userId, templateId: Number(templateId) }); 
                ui.toast.success('優惠券發送成功！');
                ui.hideModal('#issue-voucher-modal');
                
                // 重新開啟 CRM 視窗 (未來會更新 CRM 內的優惠券列表)
                await openUserDetailsModal(userId);

            } catch (error) {
                ui.toast.error(`發送失敗：${error.message}`);
                submitBtn.disabled = false;
                submitBtn.textContent = '確認發送';
            }
        });
        issueVoucherForm.dataset.listenerAttached = 'true';
    }
    // --- ▲▲▲ 新增結束 ▲▲▲ ---
}


// --- ▼▼▼ 修改：模組初始化函式 (init) ▼▼▼ ---
export const init = async () => {
    console.log("[UserManagement Init] Starting...");
    const userListTbody = document.getElementById('user-list-tbody');
    const page = document.getElementById('page-users');
    if (!userListTbody || !page) {
        console.error("[UserManagement Init] Missing essential elements (tbody or page).");
        return;
    }
    
    userListTbody.innerHTML = '<tr><td colspan="6" style="text-align: center;">正在載入顧客資料...</td></tr>';
    const userListTheadTr = document.querySelector('#page-users thead tr');
    if (userListTheadTr) userListTheadTr.innerHTML = '<th>載入中...</th>';

    try {
        // ... (獲取 activeTemplate 的邏K輯保持不變) ...
        if (!window.CONFIG || !window.CONFIG.LOGIC || !window.CONFIG.LOGIC.ACTIVE_INDUSTRY_TEMPLATE || !window.CONFIG.LOGIC.INDUSTRY_TEMPLATE_DEFINITIONS) {
             console.error("[UserManagement Init] window.CONFIG is not ready!");
             throw new Error("核心設定尚未載入。");
        }
        
        const activeTemplateKey = window.CONFIG.LOGIC.ACTIVE_INDUSTRY_TEMPLATE;
        activeTemplate = window.CONFIG.LOGIC.INDUSTRY_TEMPLATE_DEFINITIONS[activeTemplateKey]; 

        if (!activeTemplate) {
            throw new Error(`在設定中找不到名為 "${activeTemplateKey}" 的商業樣板。`);
        }
        if (!activeTemplate.logic || !Array.isArray(activeTemplate.logic.adminUserColumns)) {
             throw new Error(`樣板 "${activeTemplateKey}" 缺少 'logic.adminUserColumns' 陣列設定。`);
        }
        console.log("[UserManagement Init] Active template loaded:", activeTemplateKey);

        // --- [MODIFY THIS PART] ---
        // 併發執行所有 API 請求
        const [users, settings, templates] = await Promise.all([
            api.getUsers(),
            allSettings.length > 0 ? Promise.resolve(allSettings) : api.getSettings(),
            // allDrafts.length > 0 ? Promise.resolve(allDrafts) : api.getMessageDrafts(), // <-- 移除此行
            api.getVoucherTemplates()
        ]);

        allUsers = users;
        allSettings = settings;
        allVoucherTemplates = templates || []; // <-- 儲存快取
        console.log(`[UserManagement Init] Fetched ${allVoucherTemplates.length} voucher templates.`);
        // --- [END OF MODIFICATION] ---

        renderUserList(allUsers); 
        
        if (page.dataset.initialized !== 'true') {
            setupEventListeners();
            page.dataset.initialized = 'true';
            console.log("[UserManagement Init] Event listeners attached.");
        }

    } catch (error) {
        console.error('獲取使用者列表失敗:', error);
        userListTbody.innerHTML = `<tr><td colspan="6" style="color: red; text-align: center;">讀取使用者資料失敗: ${error.message}</td></tr>`;
        if (userListTheadTr) userListTheadTr.innerHTML = '<th>錯誤</th>';
    }
};
// --- ▲▲▲ 修改結束 ▲▲▲ ---