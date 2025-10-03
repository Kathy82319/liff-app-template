// public/admin/modules/userManagement.js
import { api } from '../api.js';
// import { ui } from '../ui.js'; // 未來若將 Modal 移至 ui.js 會需要

let allUsers = []; // 存放所有使用者資料的快取
let allSettings = []; // 存放系統設定的快取

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

    editUserModal.style.display = 'flex';
}

// 開啟使用者詳細資料 (CRM) Modal
async function openUserDetailsModal(userId) {
    const userDetailsModal = document.getElementById('user-details-modal');
    const contentContainer = userDetailsModal.querySelector('#user-details-content');
    if (!userDetailsModal || !contentContainer) return;
    
    contentContainer.innerHTML = '<p>讀取中...</p>';
    userDetailsModal.style.display = 'flex';

    try {
        const data = await api.getUserDetails(userId);
        // 此處省略 renderUserDetails 的詳細實作，因為它依賴更多函式
        // 我們先確保主流程正確
        const { profile } = data;
        const displayName = profile.nickname || profile.line_display_name;
        userDetailsModal.querySelector('#user-details-title').textContent = displayName;
        contentContainer.innerHTML = `<p>成功載入使用者 ${displayName} 的資料。</p><p>(詳細 CRM 介面將在後續步驟中遷移)</p>`;

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
            document.getElementById('edit-user-modal').style.display = 'none';
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