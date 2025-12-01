// public/admin/modules/draftsManagement.js
import { api } from '../api.js';
import { ui } from '../ui.js';
import { escapeHtml } from '../../utils.js';

let allDrafts = []; 
let activeTemplate = null; 

// 固定草稿 ID
const FIXED_DRAFT_IDS = {
    AUTO_CONFIRMATION: 2
};

// 【修正重點】這裡的文字必須與後端 (functions/api/admin/message-drafts.js) 完全一致
const FIXED_DRAFT_TITLES = {
    [FIXED_DRAFT_IDS.AUTO_CONFIRMATION]: "預訂完成自動發送通知" 
};

/**
 * 安全地獲取物件的巢狀屬性
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

    if (!draftListTbody || !draftListTheadTr) return;
    
    if (!activeTemplate || !activeTemplate.logic || !Array.isArray(activeTemplate.logic.adminDraftColumns)) {
        draftListTheadTr.innerHTML = '<th>錯誤</th>';
        draftListTbody.innerHTML = '<tr><td style="text-align: center; color: red;">錯誤：草稿列表欄位設定未載入。</td></tr>';
        return;
    }

    const columns = activeTemplate.logic.adminDraftColumns.filter(col => col.enabled);

    let headerHTML = '';
    columns.forEach(col => { headerHTML += `<th>${col.label}</th>`; });
    headerHTML += '<th>內容預覽</th><th>操作</th>';
    draftListTheadTr.innerHTML = headerHTML;
    
    draftListTbody.innerHTML = '';
    if (!drafts || drafts.length === 0) {
        draftListTbody.innerHTML = `<tr><td colspan="${columns.length + 2}" style="text-align: center;">尚無任何訊息草稿。</td></tr>`;
        return;
    }

    drafts.forEach(draft => {
        const row = draftListTbody.insertRow();
        const isFixed = draft.is_fixed || draft.draft_id === FIXED_DRAFT_IDS.AUTO_CONFIRMATION;

        columns.forEach(col => {
            const cell = row.insertCell();
            let rawValue = getProperty(draft, col.key, 'N/A');
            let cellContent = escapeHtml(rawValue);

            if (col.key === 'title') {
                 // 顯示正確的標題名稱 (如果是固定草稿，強制顯示系統定義的名稱)
                 if (isFixed && FIXED_DRAFT_TITLES[draft.draft_id]) {
                     cellContent = FIXED_DRAFT_TITLES[draft.draft_id];
                 }
                 cellContent += isFixed ? ' <span style="font-size: 0.8em; color: var(--color-secondary); margin-left: 5px;">(系統保留)</span>' : '';
            }
            cell.innerHTML = cellContent;
        });

        let safeContent = escapeHtml(draft.content || '');
        let contentPreview = String(safeContent).substring(0, 50) + (String(safeContent).length > 50 ? '...' : '');
        row.insertCell().innerHTML = contentPreview;

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

    editDraftForm.reset(); 

    const titleGroup = document.getElementById('edit-draft-title').closest('.form-group');
    const contentGroup = document.getElementById('edit-draft-content').closest('.form-group');
    const modalTitle = editDraftModal.querySelector('#modal-draft-title');
    const draftIdInput = document.getElementById('edit-draft-id');
    const titleInput = document.getElementById('edit-draft-title');
    const contentTextarea = document.getElementById('edit-draft-content');
    const placeholderButtonsContainer = document.getElementById('placeholder-buttons-container');
    
    if (titleGroup) titleGroup.style.display = 'block';
    if (contentGroup) contentGroup.style.display = 'block';
    editDraftForm.querySelector('.form-actions').style.display = 'flex'; 
    if (placeholderButtonsContainer) placeholderButtonsContainer.style.display = 'none';

    const draftId = draft ? Number(draft.draft_id) : null;
    draftIdInput.value = draftId || '';

    if (draftId === FIXED_DRAFT_IDS.AUTO_CONFIRMATION) {
        // --- 編輯自動通知草稿 ---
        modalTitle.textContent = `編輯 ${FIXED_DRAFT_TITLES[FIXED_DRAFT_IDS.AUTO_CONFIRMATION]}`;
        
        if (titleInput) {
            // 【關鍵修正】這裡填入的值必須與後端一致
            titleInput.value = FIXED_DRAFT_TITLES[FIXED_DRAFT_IDS.AUTO_CONFIRMATION];
            titleInput.readOnly = true;
            titleInput.style.backgroundColor = '#e9ecef';
        }
        if (contentTextarea) contentTextarea.value = draft.content || '';

        if (placeholderButtonsContainer && contentTextarea) {
            placeholderButtonsContainer.innerHTML = '<small style="width: 100%; margin-bottom: 5px; color: var(--color-text-light);">點擊下方按鈕插入預留位置：</small>';
            
            const placeholders = [
                { label: '入住日期', value: '{{startDate}}' },
                { label: '退房日期', value: '{{endDate}}' },
                { label: '預約日期', value: '{{bookingDate}}' }, // 補上 bookingDate 支援工作室模式
                { label: '時段', value: '{{timeSlot}}' },         // 補上 timeSlot 支援工作室模式
                { label: '房型/項目摘要', value: '{{roomSummary}}' }, // 民宿用 roomSummary, 工作室用 itemSummary (後端會處理相容性，或統一變數名)
                { label: '項目摘要(工作室)', value: '{{itemSummary}}' },
                { label: '總金額', value: '{{totalAmount}}' }
            ];
            
            placeholders.forEach(placeholder => {
                const button = document.createElement('button');
                button.type = 'button';
                button.textContent = placeholder.label;
                button.style.cssText = 'padding: 4px 8px; font-size: 0.8em; border: 1px solid var(--color-secondary); background: transparent; color: var(--color-secondary); border-radius: 4px; cursor: pointer; margin-right: 5px; margin-bottom: 5px;';
                button.onclick = () => {
                    insertPlaceholder(contentTextarea, placeholder.value);
                };
                placeholderButtonsContainer.appendChild(button);
            });
            placeholderButtonsContainer.style.display = 'flex';
        }

    } else if (draft) {
        modalTitle.textContent = '編輯訊息草稿';
        if (titleInput) {
            titleInput.value = draft.title || '';
            titleInput.readOnly = false;
            titleInput.style.backgroundColor = '';
        }
        if (contentTextarea) contentTextarea.value = draft.content || '';

    } else {
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

function insertPlaceholder(textarea, text) {
    if (!textarea) return;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const currentText = textarea.value;
    textarea.value = currentText.substring(0, start) + text + currentText.substring(end);
    textarea.focus();
    textarea.selectionStart = textarea.selectionEnd = start + text.length;
}

function setupEventListeners() {
    const page = document.getElementById('page-drafts');
    if (!page || page.dataset.initialized === 'true') return;

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

    const editDraftForm = document.getElementById('edit-draft-form');
    if (editDraftForm && !editDraftForm.dataset.submitListenerAttached) {
        editDraftForm.addEventListener('submit', handleFormSubmit);
        editDraftForm.dataset.submitListenerAttached = 'true';
    }

    page.dataset.initialized = 'true';
}

async function handleDeleteDraft(draftId) {
     const id = Number(draftId);
    if (id === FIXED_DRAFT_IDS.AUTO_CONFIRMATION) {
        ui.toast.error('無法刪除系統保留的草稿！');
        return;
    }

    if (!id || !await ui.confirm('確定要刪除這則草稿嗎？此操作無法復原。')) return;

    try {
        await api.deleteMessageDraft(id);
        ui.toast.success('刪除成功！');
        await init(); 
    } catch (error) {
        ui.toast.error(`刪除失敗：${error.message}`);
    }
}

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
        await init(); 
    } catch (error) {
        ui.toast.error(`儲存失敗： ${error.message}`);
    } finally {
        if(saveButton) {
             saveButton.disabled = false;
             saveButton.textContent = '儲存草稿';
        }
    }
}

export const init = async () => {
     console.log("[DraftsManagement Init] Starting...");
     const draftListTbody = document.getElementById('draft-list-tbody');
     const page = document.getElementById('page-drafts');
     if (!draftListTbody || !page) return;

    draftListTbody.innerHTML = '<tr><td colspan="3" style="text-align: center;">正在載入草稿...</td></tr>';
    
    const draftListTheadTr = document.querySelector('#page-drafts thead tr');
    if(draftListTheadTr) draftListTheadTr.innerHTML = '<th>載入中...</th>';

    try {
        if (!window.CONFIG || !window.CONFIG.LOGIC) {
             throw new Error("核心設定尚未載入。");
        }
        
        const activeTemplateKey = window.CONFIG.LOGIC.ACTIVE_INDUSTRY_TEMPLATE;
        activeTemplate = window.CONFIG.LOGIC.INDUSTRY_TEMPLATE_DEFINITIONS[activeTemplateKey];

        if (!activeTemplate) {
            throw new Error(`在設定中找不到名為 "${activeTemplateKey}" 的商業樣板。`);
        }
        
        allDrafts = await api.getMessageDrafts();
        
        renderDraftList(allDrafts);
        
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