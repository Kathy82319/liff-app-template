// public/admin/modules/userManagement.js
import { api } from '../api.js';
// import { ui } from '../ui.js'; // 未來若將 Modal 移至 ui.js 會需要

let allUsers = []; // 存放所有使用者資料的快取
let allSettings = []; // 存放系統設定的快取
let allDrafts = []; // 【新增】存放訊息草稿的快取

// 渲染使用者列表
function renderUserList(users) {
    const userListTbody = document.getElementById('user-list-tbody');
    if (!userListTbody) return;
    
    userListTbody.innerHTML = '';
    users.forEach(user => {
        const row = userListTbody.insertRow();
        row.dataset.userId = user.user_id;
        row.style.cursor = 'pointer';
        const displayName = user.nickname ? `${user.line_display_name} (${user.nickname})` : user.line_display_name;
        
        row.innerHTML = `
            <td class="compound-cell" style="text-align: left;">
                <div class="main-info">${displayName || 'N/A'}</div>
                <div class="sub-info">${user.user_id}</div>
            </td>
            <td>${user.class || '無'}</td>
            <td>${user.level} / ${user.current_exp}</td>
            <td>${user.perk || '無'}</td>
            <td><span class="tag-display">${user.tag || '無'}</span></td>
            <td class="actions-cell">
                <button class="action-btn btn-edit-user" data-userid="${user.user_id}" style="background-color: #ffc107; color: #000;">編輯</button>
            </td>
        `;
    });
}

// 處理使用者搜尋
function handleUserSearch() {
    const userSearchInput = document.getElementById('user-search-input');
    const searchTerm = userSearchInput.value.toLowerCase().trim();
    const filteredUsers = searchTerm
        ? allUsers.filter(user =>
            (user.line_display_name || '').toLowerCase().includes(searchTerm) ||
            (user.nickname || '').toLowerCase().includes(searchTerm)
        )
        : allUsers;
    renderUserList(filteredUsers);
}

// 開啟編輯使用者 Modal
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



// 輔助函式：渲染歷史紀錄表格
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
                value = new Date(value).toLocaleDateString();
            }
            cell.textContent = value;
        });
    });
    
    fragment.appendChild(table);
    return fragment;
}

// 函式：載入並綁定訊息草稿
async function loadAndBindMessageDrafts(userId) {
    const select = document.querySelector('#message-draft-select');
    const content = document.querySelector('#direct-message-content');
    const sendBtn = document.querySelector('#send-direct-message-btn');
    if (!select || !content || !sendBtn) return;
    
    // 如果快取中沒有草稿資料，才從 API 獲取
    if (allDrafts.length === 0) {
        allDrafts = await api.getMessageDrafts();
    }

    select.innerHTML = '<option value="">-- 手動輸入或選擇草稿 --</option>';
    allDrafts.forEach(d => select.add(new Option(d.title, d.content)));
    
    select.onchange = () => { content.value = select.value; };

    // 使用 .onclick 確保每次打開 Modal 都綁定到正確的 userId
    sendBtn.onclick = async () => {
        const message = content.value.trim();
        if (!message) { alert('訊息內容不可為空！'); return; }
        if (!confirm(`確定要發送以下訊息給 ${userId} 嗎？\n\n${message}`)) return;
        try {
            sendBtn.textContent = '發送中...';
            sendBtn.disabled = true;
            await api.sendMessage(userId, message);
            alert('訊息發送成功！');
            content.value = '';
            select.value = '';
        } catch (error) {
            alert(`錯誤：${error.message}`);
        } finally {
            sendBtn.textContent = '確認發送';
            sendBtn.disabled = false;
        }
    };
}

// 函式：渲染 CRM 彈窗的完整內容
function renderUserDetails(data) {
    const userDetailsModal = document.getElementById('user-details-modal');
    const contentContainer = userDetailsModal.querySelector('#user-details-content');
    if (!contentContainer) return;

    const { profile, bookings, exp_history } = data;
    const displayName = profile.nickname || profile.line_display_name;
    userDetailsModal.querySelector('#user-details-title').textContent = displayName;

    contentContainer.innerHTML = `
        <div class="details-grid">
            <div class="profile-summary">
                <img src="/api/admin/get-avatar?userId=${profile.user_id}" alt="Avatar">
                <h4>${displayName}</h4>
                <p><strong>姓名:</strong> ${profile.real_name || '未設定'}</p>
                <p><strong>電話:</strong> ${profile.phone || '未設定'}</p>
                <hr>
                <p><strong>等級:</strong> ${profile.level} (${profile.current_exp}/10 EXP)</p>
                <p><strong>會員方案:</strong> ${profile.class}</p>
                <p><strong>標籤:</strong> ${profile.tag}</p>
            </div>
            <div class="profile-details">
                ${profile.notes ? `<div class="crm-notes-section" style="margin-bottom: 1rem; padding: 0.8rem; background-color: #fffbe6; border-radius: 6px; border: 1px solid #ffe58f; max-height: 5em; overflow-y: auto;"><h4>顧客備註</h4><p style="white-space: pre-wrap; margin: 0;">${profile.notes}</p></div>` : ''}
                <div class="details-tabs">
                    <button class="details-tab active" data-target="tab-bookings">預約紀錄</button>
                    <button class="details-tab" data-target="tab-exp">點數紀錄</button>
                </div>
                <div class="details-tab-content active" id="tab-bookings"></div>
                <div class="details-tab-content" id="tab-exp"></div>
            </div>
        </div>
        <div class="message-sender">
            <h4>發送 LINE 訊息</h4>
            <div class="form-group">
                <label for="message-draft-select">選擇訊息草稿</label>
                <select id="message-draft-select"><option value="">-- 手動輸入或選擇草稿 --</option></select>
            </div>
            <div class="form-group">
                <label for="direct-message-content">訊息內容</label>
                <textarea id="direct-message-content" rows="4"></textarea>
            </div>
            <div class="form-actions">
                <button id="send-direct-message-btn" class="action-btn btn-save" data-userid="${profile.user_id}">確認發送</button>
            </div>
        </div>
    `;

    // 渲染兩個歷史紀錄表格
    contentContainer.querySelector('#tab-bookings').appendChild(renderHistoryTable(bookings, ['booking_date', 'num_of_people', 'status'], { booking_date: '預約日', num_of_people: '人數', status: '狀態' }));
    contentContainer.querySelector('#tab-exp').appendChild(renderHistoryTable(exp_history, ['created_at', 'reason', 'exp_added'], { created_at: '日期', reason: '原因', exp_added: '點數' }));

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
}

// 【升級】開啟使用者詳細資料 (CRM) Modal
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


// 綁定此頁面所有事件監聽器
function setupEventListeners() {
    // 搜尋框
    const userSearchInput = document.getElementById('user-search-input');
    userSearchInput.oninput = handleUserSearch;

    // 同步按鈕
    const syncD1ToSheetBtn = document.getElementById('sync-d1-to-sheet-btn');
    syncD1ToSheetBtn.onclick = async () => {
        if (!confirm('確定要將所有 D1 使用者資料完整同步至 Google Sheet 嗎？\n這將會覆蓋 Sheet 上的現有資料。')) return;
        try {
            syncD1ToSheetBtn.textContent = '同步中...';
            syncD1ToSheetBtn.disabled = true;
            const result = await api.syncD1ToSheet();
            alert(result.message);
        } catch (error) {
            alert(`錯誤：${error.message}`);
        } finally {
            syncD1ToSheetBtn.textContent = '同步至 Google Sheet';
            syncD1ToSheetBtn.disabled = false;
        }
    };

    // 事件委派：監聽整個 tbody 的點擊
    const userListTbody = document.getElementById('user-list-tbody');
    userListTbody.onclick = (event) => {
        const target = event.target;
        const row = target.closest('tr');
        if (!row || !row.dataset.userId) return;
        const userId = row.dataset.userId;
        
        if (target.classList.contains('btn-edit-user')) {
            openEditUserModal(userId);
        } else {
            openUserDetailsModal(userId);
        }
    };
    
    // 編輯使用者表單提交
    const editUserForm = document.getElementById('edit-user-form');
    editUserForm.onsubmit = async (e) => {
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
            notes: document.getElementById('edit-notes-textarea').value
        };

        try {
            await api.updateUserDetails(updatedData);
            ui.hideModal('#edit-user-modal');
            // 重新載入列表以顯示更新後的資料
            init(); 
        } catch (error) {
            alert(`錯誤：${error.message}`);
        }
    };
}

// 模組初始化函式
export const init = async () => {
    const userListTbody = document.getElementById('user-list-tbody');
    if (!userListTbody) return;
    
    userListTbody.innerHTML = '<tr><td colspan="6" style="text-align: center;">正在載入顧客資料...</td></tr>';
    
    try {
        // 優化：如果快取中沒有資料，才重新從 API 獲取
        if (allSettings.length === 0) {
            allSettings = await api.getSettings();
        }
        // 使用者資料通常需要保持最新，所以每次都重新獲取
        allUsers = await api.getUsers();
        
        renderUserList(allUsers);
        setupEventListeners();
    } catch (error) {
        console.error('獲取使用者列表失敗:', error);
        userListTbody.innerHTML = `<tr><td colspan="6" style="color: red; text-align: center;">讀取使用者資料失敗: ${error.message}</td></tr>`;
    }
};