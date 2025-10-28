// public/admin/modules/draftsManagement.js (v4 - Define FIXED_DRAFT_TITLES, Keep Error Handling)
import { api } from '../api.js';
import { ui } from '../ui.js';

let allDrafts = []; // 快取所有草稿資料

// --- 固定草稿的 ID (與後端一致) ---
const FIXED_DRAFT_IDS = {
    POLICY: 1,
    AUTO_CONFIRMATION: 2
};

// --- 【新增】固定草稿的標題 (與後端一致) ---
const FIXED_DRAFT_TITLES = {
    [FIXED_DRAFT_IDS.POLICY]: "入住須知編輯欄",
    [FIXED_DRAFT_IDS.AUTO_CONFIRMATION]: "入住自動發送的通知"
};


// 渲染草稿列表 (加入固定草稿的處理)
function renderDraftList(drafts) {
    // ... (此函式內容不變，省略以節省篇幅) ...
    const draftListTbody = document.getElementById('draft-list-tbody');
    if (!draftListTbody) return;

    draftListTbody.innerHTML = '';
    if (!drafts || drafts.length === 0) {
        draftListTbody.innerHTML = '<tr><td colspan="3" style="text-align: center;">尚無任何訊息草稿。</td></tr>';
        return;
    }

    drafts.forEach(draft => {
        const row = draftListTbody.insertRow();
        let contentPreview = '';
        // 修正 isFixed 判斷，確保即使後端沒傳 is_fixed 也能判斷
        const isFixed = draft.is_fixed || draft.draft_id === FIXED_DRAFT_IDS.POLICY || draft.draft_id === FIXED_DRAFT_IDS.AUTO_CONFIRMATION;

        // 特殊處理政策草稿的預覽
        if (draft.draft_id === FIXED_DRAFT_IDS.POLICY) {
            try {
                // 嘗試解析，如果內容不是JSON，提供提示
                const policyData = JSON.parse(draft.content || '{}');
                contentPreview = `取消政策: ${String(policyData.cancellationPolicy || '').substring(0, 20)}... | 入住須知: ${String(policyData.checkInInstructions || '').substring(0, 20)}...`;
            } catch (e) {
                contentPreview = '[內容非標準格式] 無法預覽';
            }
        } else {
            contentPreview = String(draft.content || '').substring(0, 50) + (String(draft.content || '').length > 50 ? '...' : '');
        }

        row.innerHTML = `
            <td>
                ${draft.title}
                ${isFixed ? '<span style="font-size: 0.8em; color: var(--color-secondary); margin-left: 5px;">(系統保留)</span>' : ''}
            </td>
            <td>${contentPreview}</td>
            <td class="actions-cell">
                <button class="action-btn btn-edit-draft" data-draft-id="${draft.draft_id}" style="background-color: var(--color-warning); color: #000;">編輯</button>
                <button class="action-btn btn-delete-draft" data-draft-id="${draft.draft_id}" style="background-color: var(--color-danger);" ${isFixed ? 'disabled title="系統保留草稿無法刪除"' : ''}>刪除</button>
            </td>
        `;
    });
}


// 開啟編輯/新增草稿的 Modal (v3 - 修正 JSON 解析邏輯)
// 開啟編輯/新增草稿的 Modal (v5 - 精確顯示/隱藏)
function openEditDraftModal(draft = null) {
    const editDraftModal = document.getElementById('edit-draft-modal');
    const editDraftForm = document.getElementById('edit-draft-form');
    if (!editDraftModal || !editDraftForm) return;

    editDraftForm.reset(); // 重置表單值

    // --- 獲取所有需要控制顯隱的元素 ---
    const titleGroup = document.getElementById('edit-draft-title').closest('.form-group');
    const contentGroup = document.getElementById('edit-draft-content').closest('.form-group');
    const policyGroup = document.getElementById('policy-edit-group');
    const cancellationPolicyTextarea = document.getElementById('edit-cancellation-policy');
    const checkInInstructionsTextarea = document.getElementById('edit-check-in-instructions');
    const modalTitle = editDraftModal.querySelector('#modal-draft-title');
    const draftIdInput = document.getElementById('edit-draft-id');
    const titleInput = document.getElementById('edit-draft-title');
    const contentTextarea = document.getElementById('edit-draft-content');
    const placeholderButtonsContainer = document.getElementById('placeholder-buttons-container');
    
    // --- 預設全部隱藏 (除了按鈕區) ---
    if (titleGroup) titleGroup.style.display = 'none';
    if (contentGroup) contentGroup.style.display = 'none';
    if (policyGroup) policyGroup.style.display = 'none';
    editDraftForm.querySelector('.form-actions').style.display = 'flex'; 
    if (placeholderButtonsContainer) placeholderButtonsContainer.style.display = 'none';
    editDraftForm.querySelector('.form-actions').style.display = 'flex'; //

    // --- 獲取草稿 ID ---
    const draftId = draft ? Number(draft.draft_id) : null;
    draftIdInput.value = draftId || '';

    // --- 根據草稿類型顯示對應欄位 ---
    if (draftId === FIXED_DRAFT_IDS.POLICY) {
        // --- 編輯政策草稿 (ID 1) ---
        modalTitle.textContent = `編輯 ${FIXED_DRAFT_TITLES[FIXED_DRAFT_IDS.POLICY]}`;
        if (policyGroup) policyGroup.style.display = 'block'; // **顯示政策區塊**

        // 解析 JSON 填入
        try {
            const policyData = JSON.parse(draft.content || '{}');
            if (cancellationPolicyTextarea) cancellationPolicyTextarea.value = policyData.cancellationPolicy || '';
            if (checkInInstructionsTextarea) checkInInstructionsTextarea.value = policyData.checkInInstructions || '';
        } catch (e) {
            console.error(`解析政策內容 (ID: ${draftId}) 失敗:`, e, "原始內容:", draft.content);
            ui.toast.error("讀取政策內容時發生錯誤，將顯示原始文字。");
            if (cancellationPolicyTextarea) cancellationPolicyTextarea.value = `[內容非標準JSON格式，請修正或覆蓋]\n${draft.content || ''}`;
            if (checkInInstructionsTextarea) checkInInstructionsTextarea.value = ''; // 第二個 Textarea 清空或顯示相同錯誤
        }

    } else if (draftId === FIXED_DRAFT_IDS.AUTO_CONFIRMATION) {
        // --- 編輯自動通知草稿 (ID 2) ---
        modalTitle.textContent = `編輯 ${FIXED_DRAFT_TITLES[FIXED_DRAFT_IDS.AUTO_CONFIRMATION]}`;
        if (titleGroup) titleGroup.style.display = 'block'; // **顯示標題**
        if (contentGroup) contentGroup.style.display = 'block'; // **顯示內容**
        if (titleInput) {
            titleInput.value = FIXED_DRAFT_TITLES[FIXED_DRAFT_IDS.AUTO_CONFIRMATION];
            titleInput.readOnly = true;
            titleInput.style.backgroundColor = '#e9ecef';
        }
        if (contentTextarea) contentTextarea.value = draft.content || '';

        // --- 【修改】顯示並生成預留位置按鈕 (使用中文標籤) ---
        if (placeholderButtonsContainer && contentTextarea) {
            placeholderButtonsContainer.innerHTML = '<small style="width: 100%; margin-bottom: 5px; color: var(--color-text-light);">點擊下方按鈕插入預留位置：</small>'; // Reset content
            
            // --- 使用物件陣列定義標籤和值 ---
            const placeholders = [
                { label: '入住日期', value: '{{startDate}}' },
                { label: '退房日期', value: '{{endDate}}' },
                { label: '房型摘要', value: '{{roomSummary}}' },
                { label: '總金額', value: '{{totalAmount}}' }
                // 您可以根據需要為工作室樣板定義不同的 placeholders
            ];
            
            placeholders.forEach(placeholder => {
                const button = document.createElement('button');
                button.type = 'button';
                button.textContent = placeholder.label; // 顯示中文標籤
                button.style.cssText = 'padding: 4px 8px; font-size: 0.8em; border: 1px solid var(--color-secondary); background: transparent; color: var(--color-secondary); border-radius: 4px; cursor: pointer;';
                button.onclick = () => {
                    insertPlaceholder(contentTextarea, placeholder.value); // 插入英文值
                };
                placeholderButtonsContainer.appendChild(button);
            });
            placeholderButtonsContainer.style.display = 'flex'; // 顯示容器
        }
        // --- 【修改結束】 ---


    } else if (draft) {
        // --- 編輯一般草稿 (ID > 2) ---
        modalTitle.textContent = '編輯訊息草稿';
        if (titleGroup) titleGroup.style.display = 'block'; // **顯示標題**
        if (contentGroup) contentGroup.style.display = 'block'; // **顯示內容**
        if (titleInput) {
            titleInput.value = draft.title || '';
            titleInput.readOnly = false;
            titleInput.style.backgroundColor = '';
        }
        if (contentTextarea) contentTextarea.value = draft.content || '';

    } else {
        // --- 新增一般草稿 ---
        modalTitle.textContent = '新增訊息草稿';
        if (titleGroup) titleGroup.style.display = 'block'; // **顯示標題**
        if (contentGroup) contentGroup.style.display = 'block'; // **顯示內容**
        if (titleInput) {
             titleInput.value = '';
             titleInput.readOnly = false;
             titleInput.style.backgroundColor = '';
        }
        if (contentTextarea) contentTextarea.value = '';
    }

    ui.showModal('#edit-draft-modal');
}

// --- 【新增】輔助函式：在 textarea 插入文字 ---
function insertPlaceholder(textarea, text) {
    if (!textarea) return;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const currentText = textarea.value;
    textarea.value = currentText.substring(0, start) + text + currentText.substring(end);
    // 將光標移到插入文字之後
    textarea.focus();
    textarea.selectionStart = textarea.selectionEnd = start + text.length;
}


// 綁定事件監聽器
function setupEventListeners() {
    // ... (此函式內容不變，省略) ...
    const page = document.getElementById('page-drafts');
    // 防止重複綁定
    if (!page || page.dataset.initialized === 'true') {
        if (page?.dataset.initialized === 'true') console.log("Drafts listeners already initialized.");
        return;
    }
    console.log("Initializing Drafts event listeners...");

    // 頁面級別的事件委派
    page.addEventListener('click', e => {
        const target = e.target;
        if (target.id === 'add-draft-btn') {
            openEditDraftModal(); // 開啟新增 Modal
        } else if (target.matches('.btn-edit-draft')) {
            const draftId = target.dataset.draftId;
            // 從 allDrafts 快取中找到對應的草稿物件
            const draft = allDrafts.find(d => d.draft_id == draftId);
            if (draft) {
                 openEditDraftModal(draft); // 開啟編輯 Modal 並傳入草稿資料
            } else {
                 console.error("找不到要編輯的草稿, ID:", draftId);
                 ui.toast.error("找不到要編輯的草稿資料");
            }
        } else if (target.matches('.btn-delete-draft') && !target.disabled) { // 確保按鈕未被禁用
            handleDeleteDraft(target.dataset.draftId); // 處理刪除
        }
    });

    // Modal 表單提交
    const editDraftForm = document.getElementById('edit-draft-form');
    if (editDraftForm && !editDraftForm.dataset.submitListenerAttached) { // 檢查是否已綁定
        editDraftForm.addEventListener('submit', handleFormSubmit);
        editDraftForm.dataset.submitListenerAttached = 'true'; // 標記已綁定
        console.log("Drafts form submit listener attached.");
    }

    page.dataset.initialized = 'true'; // 標記事件已初始化
    console.log("Drafts event listeners setup complete.");
}

// 處理刪除邏輯 (加入固定草稿檢查)
async function handleDeleteDraft(draftId) {
    // ... (此函式內容不變，省略) ...
     const id = Number(draftId);
    // --- 檢查是否為固定草稿 ---
    if (id === FIXED_DRAFT_IDS.POLICY || id === FIXED_DRAFT_IDS.AUTO_CONFIRMATION) {
        ui.toast.error('無法刪除系統保留的草稿！');
        return;
    }

    if (!id || !confirm('確定要刪除這則草稿嗎？此操作無法復原。')) return;

    try {
        await api.deleteMessageDraft(id); // 後端 API 會做最終檢查
        ui.toast.success('刪除成功！');
        await init(); // 重新載入列表
    } catch (error) {
        ui.toast.error(`刪除失敗：${error.message}`);
    }
}

// 處理表單提交邏輯 (新增/編輯，包含特殊處理)
async function handleFormSubmit(event) {
    event.preventDefault();
    const draftIdInput = document.getElementById('edit-draft-id');
    const draftId = draftIdInput ? Number(draftIdInput.value) : null;
    let draftData = {};
    let apiAction;
    const saveButton = event.target.querySelector('button[type="submit"]'); // 獲取提交按鈕

    // --- 根據 draftId 決定要提交的資料和 API ---
    if (draftId === FIXED_DRAFT_IDS.POLICY) {
        draftData = {
            draft_id: draftId,
            cancellationPolicy: document.getElementById('edit-cancellation-policy').value,
            checkInInstructions: document.getElementById('edit-check-in-instructions').value,
        };
        apiAction = api.updateMessageDraft;
    } else {
        draftData = {
            title: document.getElementById('edit-draft-title').value,
            content: document.getElementById('edit-draft-content').value,
        };
        if (draftId) {
            draftData.draft_id = draftId;
            apiAction = api.updateMessageDraft;
        } else {
            apiAction = api.createMessageDraft;
        }
    }

    // 簡單前端驗證
    if (draftId !== FIXED_DRAFT_IDS.POLICY && (!draftData.title || !draftData.content)) {
         ui.toast.error('標題和內容為必填！');
         return;
    }
    if (draftId === FIXED_DRAFT_IDS.POLICY && (!draftData.cancellationPolicy || !draftData.checkInInstructions)) {
         ui.toast.error('取消政策和入住須知為必填！');
         return;
    }

    // --- 禁用按鈕 ---
    if(saveButton) {
        saveButton.disabled = true;
        saveButton.textContent = '儲存中...';
    }

    try {
        await apiAction(draftData); // 呼叫 API
        ui.toast.success('草稿儲存成功！');
        ui.hideModal('#edit-draft-modal'); // 關閉 Modal

        // --- **新增：手動設置焦點** ---
        const addDraftButton = document.getElementById('add-draft-btn');
        if (addDraftButton) {
            addDraftButton.focus(); // 將焦點移回 "新增草稿" 按鈕
        } else {
             document.body.focus(); // 備用方案：移除表單焦點
        }
        // --- **焦點設置結束** ---

        await init(); // 重新載入列表 (在焦點設置之後)

    } catch (error) {
        ui.toast.error(`儲存失敗： ${error.message}`);
        // --- 錯誤時恢復按鈕 ---
        if(saveButton) {
             saveButton.disabled = false;
             saveButton.textContent = '儲存草稿';
        }
    }
    // 注意：成功時不需要恢復按鈕，因為 Modal 已關閉
}

// 模組初始化函式
export const init = async () => {
    // ... (此函式內容不變，省略) ...
     const draftListTbody = document.getElementById('draft-list-tbody');
    if (!draftListTbody) return;

    draftListTbody.innerHTML = '<tr><td colspan="3" style="text-align: center;">正在載入草稿...</td></tr>';

    try {
        // 從 API 獲取草稿列表 (後端 API 會包含 is_fixed 標記)
        allDrafts = await api.getMessageDrafts();
        renderDraftList(allDrafts); // 渲染列表
        setupEventListeners(); // 綁定事件 (內部有防重複機制)
    } catch (error) {
        console.error('獲取訊息草稿失敗:', error);
        draftListTbody.innerHTML = `<tr><td colspan="3" style="color: red; text-align: center;">讀取失敗: ${error.message}</td></tr>`;
    }
};