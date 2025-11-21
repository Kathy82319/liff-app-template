// public/admin/modules/draftsManagement.js
import { api } from '../api.js';
import { ui } from '../ui.js';

let allDrafts = []; 
let activeTemplate = null; 

// 固定草稿 ID (只剩自動通知，入住須知已移至店家資訊)
const FIXED_DRAFT_IDS = {
    AUTO_CONFIRMATION: 2
};

const FIXED_DRAFT_TITLES = {
    [FIXED_DRAFT_IDS.AUTO_CONFIRMATION]: "預約自動發送的通知"
};

/**
 * 安全地獲取物件的巢狀屬性
 * @param {object} obj - 來源物件
 * @param {string} path - 屬性路徑 (例如 "user.profile.name")
 * @param {*} defaultValue - 找不到時的回傳值
 * @returns {*}
 */
function getProperty(obj, path, defaultValue = 'N/A') {
    const value = path.split('.').reduce((acc, key) => (acc && acc[key] !== undefined && acc[key] !== null) ? acc[key] : undefined, obj);
    const result = (value !== undefined && value !== null && value !== '') ? value : defaultValue;
    
    if (typeof result === 'string' && result.length > 50 && defaultValue === 'N/A') {
        return result.substring(0, 47) + '...';
    }
    return result;
}

// 渲染草稿列表
function renderDraftList(drafts) {
    const draftListTbody = document.getElementById('draft-list-tbody');
    const draftListTheadTr = document.querySelector('#page-drafts thead tr');

    if (!draftListTbody || !draftListTheadTr) {
        console.error("renderDraftList: 找不到 tbody 或 thead tr 元素。");
        return;
    }
    
    // 1. 檢查 activeTemplate 是否已載入
    if (!activeTemplate || !activeTemplate.logic || !Array.isArray(activeTemplate.logic.adminDraftColumns)) {
        console.error("renderDraftList: activeTemplate 或 adminDraftColumns 尚未準備就緒。");
        draftListTheadTr.innerHTML = '<th>錯誤</th>';
        draftListTbody.innerHTML = '<tr><td style="text-align: center; color: red;">錯誤：草稿列表欄位設定未載入。請檢查系統設定。</td></tr>';
        return;
    }

    // 2. 獲取啟用的欄位
    const columns = activeTemplate.logic.adminDraftColumns.filter(col => col.enabled);

    // 3. 動態渲染表頭
    let headerHTML = '';
    columns.forEach(col => {
        headerHTML += `<th>${col.label}</th>`;
    });
    headerHTML += '<th>內容預覽</th>'; // 內容預覽欄位固定
    headerHTML += '<th>操作</th>'; // 操作欄位固定
    draftListTheadTr.innerHTML = headerHTML;
    
    // 4. 渲染列表內容
    draftListTbody.innerHTML = '';
    if (!drafts || drafts.length === 0) {
        draftListTbody.innerHTML = `<tr><td colspan="${columns.length + 2}" style="text-align: center;">尚無任何訊息草稿。</td></tr>`;
        return;
    }

    drafts.forEach(draft => {
        const row = draftListTbody.insertRow();
        // 檢查是否為固定草稿
        const isFixed = draft.is_fixed || draft.draft_id === FIXED_DRAFT_IDS.AUTO_CONFIRMATION;

        // 5. 根據欄位設定動態插入儲存格
        columns.forEach(col => {
            const cell = row.insertCell();
            let cellContent = getProperty(draft, col.key, 'N/A');
            // 特殊處理：為固定草稿加上標記
            if (col.key === 'title') {
                 cellContent += isFixed ? ' <span style="font-size: 0.8em; color: var(--color-secondary); margin-left: 5px;">(系統保留)</span>' : '';
            }
            cell.innerHTML = cellContent;
        });

        // 6. 渲染固定的「內容預覽」和「操作」儲存格
        
        // 插入「內容預覽」
        let contentPreview = String(draft.content || '').substring(0, 50) + (String(draft.content || '').length > 50 ? '...' : '');
        row.insertCell().innerHTML = contentPreview;

        // 插入「操作」
        const actionCell = row.insertCell();
        actionCell.className = 'actions-cell';
        actionCell.innerHTML = `
            <button class="action-btn btn-edit-draft" data-draft-id="${draft.draft_id}" style="background-color: var(--color-warning); color: #000;">編輯</button>
            <button class="action-btn btn-delete-draft" data-draft-id="${draft.draft_id}" style="background-color: var(--color-danger);" ${isFixed ? 'disabled title="系統保留草稿無法刪除"' : ''}>刪除</button>
        `;
    });
}

// 開啟編輯/新增草稿的 Modal
function openEditDraftModal(draft = null) {
    const editDraftModal = document.getElementById('edit-draft-modal');
    const editDraftForm = document.getElementById('edit-draft-form');
    if (!editDraftModal || !editDraftForm) return;

    editDraftForm.reset(); // 重置表單值

    // 獲取元素
    const titleGroup = document.getElementById('edit-draft-title').closest('.form-group');
    const contentGroup = document.getElementById('edit-draft-content').closest('.form-group');
    const modalTitle = editDraftModal.querySelector('#modal-draft-title');
    const draftIdInput = document.getElementById('edit-draft-id');
    const titleInput = document.getElementById('edit-draft-title');
    const contentTextarea = document.getElementById('edit-draft-content');
    const placeholderButtonsContainer = document.getElementById('placeholder-buttons-container');
    
    // 預設顯示標準欄位
    if (titleGroup) titleGroup.style.display = 'block';
    if (contentGroup) contentGroup.style.display = 'block';
    editDraftForm.querySelector('.form-actions').style.display = 'flex'; 
    if (placeholderButtonsContainer) placeholderButtonsContainer.style.display = 'none';

    // 獲取草稿 ID
    const draftId = draft ? Number(draft.draft_id) : null;
    draftIdInput.value = draftId || '';

    if (draftId === FIXED_DRAFT_IDS.AUTO_CONFIRMATION) {
        // --- 編輯自動通知草稿 (ID 2) ---
        modalTitle.textContent = `編輯 ${FIXED_DRAFT_TITLES[FIXED_DRAFT_IDS.AUTO_CONFIRMATION]}`;
        
        if (titleInput) {
            titleInput.value = FIXED_DRAFT_TITLES[FIXED_DRAFT_IDS.AUTO_CONFIRMATION];
            titleInput.readOnly = true;
            titleInput.style.backgroundColor = '#e9ecef';
        }
        if (contentTextarea) contentTextarea.value = draft.content || '';

        // 顯示並生成預留位置按鈕
        if (placeholderButtonsContainer && contentTextarea) {
            placeholderButtonsContainer.innerHTML = '<small style="width: 100%; margin-bottom: 5px; color: var(--color-text-light);">點擊下方按鈕插入預留位置：</small>';
            
            const placeholders = [
                { label: '入住日期', value: '{{startDate}}' },
                { label: '退房日期', value: '{{endDate}}' },
                { label: '房型摘要', value: '{{roomSummary}}' },
                { label: '總金額', value: '{{totalAmount}}' }
            ];
            
            placeholders.forEach(placeholder => {
                const button = document.createElement('button');
                button.type = 'button';
                button.textContent = placeholder.label;
                button.style.cssText = 'padding: 4px 8px; font-size: 0.8em; border: 1px solid var(--color-secondary); background: transparent; color: var(--color-secondary); border-radius: 4px; cursor: pointer;';
                button.onclick = () => {
                    insertPlaceholder(contentTextarea, placeholder.value);
                };
                placeholderButtonsContainer.appendChild(button);
            });
            placeholderButtonsContainer.style.display = 'flex';
        }

    } else if (draft) {
        // --- 編輯一般草稿 ---
        modalTitle.textContent = '編輯訊息草稿';
        if (titleInput) {
            titleInput.value = draft.title || '';
            titleInput.readOnly = false;
            titleInput.style.backgroundColor = '';
        }
        if (contentTextarea) contentTextarea.value = draft.content || '';

    } else {
        // --- 新增一般草稿 ---
        modalTitle.textContent = '新增訊息草稿';
        if (titleInput) {
             titleInput.value = '';
             titleInput.readOnly = false;
             titleInput.style.backgroundColor = '';
        }
        if (contentTextarea) contentTextarea.value = '';
    }

    ui.showModal('#edit-draft-modal');
}

// 輔助函式：在 textarea 插入文字
function insertPlaceholder(textarea, text) {
    if (!textarea) return;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const currentText = textarea.value;
    textarea.value = currentText.substring(0, start) + text + currentText.substring(end);
    textarea.focus();
    textarea.selectionStart = textarea.selectionEnd = start + text.length;
}

// 綁定事件監聽器
function setupEventListeners() {
    const page = document.getElementById('page-drafts');
    if (!page || page.dataset.initialized === 'true') {
        return;
    }

    // 頁面級別的事件委派
    page.addEventListener('click', e => {
        const target = e.target;
        if (target.id === 'add-draft-btn') {
            openEditDraftModal();
        } else if (target.matches('.btn-edit-draft')) {
            const draftId = target.dataset.draftId;
            const draft = allDrafts.find(d => d.draft_id == draftId);
            if (draft) {
                 openEditDraftModal(draft);
            } else {
                 ui.toast.error("找不到要編輯的草稿資料");
            }
        } else if (target.matches('.btn-delete-draft') && !target.disabled) {
            handleDeleteDraft(target.dataset.draftId);
        }
    });

    // Modal 表單提交
    const editDraftForm = document.getElementById('edit-draft-form');
    if (editDraftForm && !editDraftForm.dataset.submitListenerAttached) {
        editDraftForm.addEventListener('submit', handleFormSubmit);
        editDraftForm.dataset.submitListenerAttached = 'true';
    }

    page.dataset.initialized = 'true';
}

// 處理刪除邏輯
async function handleDeleteDraft(draftId) {
     const id = Number(draftId);
    // 檢查是否為固定草稿
    if (id === FIXED_DRAFT_IDS.AUTO_CONFIRMATION) {
        ui.toast.error('無法刪除系統保留的草稿！');
        return;
    }

    if (!id || !confirm('確定要刪除這則草稿嗎？此操作無法復原。')) return;

    try {
        await api.deleteMessageDraft(id);
        ui.toast.success('刪除成功！');
        await init(); // 重新載入列表
    } catch (error) {
        ui.toast.error(`刪除失敗：${error.message}`);
    }
}

// 處理表單提交邏輯
async function handleFormSubmit(event) {
    event.preventDefault();
    const draftIdInput = document.getElementById('edit-draft-id');
    const draftId = draftIdInput ? Number(draftIdInput.value) : null;
    let draftData = {};
    let apiAction;
    const saveButton = event.target.querySelector('button[type="submit"]');

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

    // 驗證
    if (!draftData.title || !draftData.content) {
         ui.toast.error('標題和內容為必填！');
         return;
    }

    if(saveButton) {
        saveButton.disabled = true;
        saveButton.textContent = '儲存中...';
    }

    try {
        await apiAction(draftData);
        ui.toast.success('草稿儲存成功！');
        ui.hideModal('#edit-draft-modal');

        const addDraftButton = document.getElementById('add-draft-btn');
        if (addDraftButton) {
            addDraftButton.focus();
        } else {
             document.body.focus();
        }

        await init(); // 重新載入列表

    } catch (error) {
        ui.toast.error(`儲存失敗： ${error.message}`);
        if(saveButton) {
             saveButton.disabled = false;
             saveButton.textContent = '儲存草稿';
        }
    }
}

// 模組初始化函式
export const init = async () => {
     console.log("[DraftsManagement Init] Starting...");
     const draftListTbody = document.getElementById('draft-list-tbody');
     const page = document.getElementById('page-drafts');
     if (!draftListTbody || !page) {
         console.error("[DraftsManagement Init] Missing essential elements.");
         return;
     }

    draftListTbody.innerHTML = '<tr><td colspan="3" style="text-align: center;">正在載入草稿...</td></tr>';
    
    // 清除/設定表頭
    const draftListTheadTr = document.querySelector('#page-drafts thead tr');
    if(draftListTheadTr) draftListTheadTr.innerHTML = '<th>載入中...</th>';

    try {
        // 1. 獲取當前啟用的樣板
        if (!window.CONFIG || !window.CONFIG.LOGIC) {
             throw new Error("核心設定尚未載入。");
        }
        
        const activeTemplateKey = window.CONFIG.LOGIC.ACTIVE_INDUSTRY_TEMPLATE;
        activeTemplate = window.CONFIG.LOGIC.INDUSTRY_TEMPLATE_DEFINITIONS[activeTemplateKey];

        if (!activeTemplate) {
            throw new Error(`在設定中找不到名為 "${activeTemplateKey}" 的商業樣板。`);
        }
        
        // 2. 獲取草稿資料
        allDrafts = await api.getMessageDrafts();
        
        // 3. 渲染列表
        renderDraftList(allDrafts);
        
        // 4. 綁定事件
        if (!page.dataset.initialized) {
            setupEventListeners();
            page.dataset.initialized = 'true';
        }
    } catch (error) {
        console.error('獲取訊息草稿失敗:', error);
        if(draftListTheadTr) draftListTheadTr.innerHTML = '<th>錯誤</th>';
        draftListTbody.innerHTML = `<tr><td colspan="3" style="color: red; text-align: center;">讀取失敗: ${error.message}</td></tr>`;
    }
};