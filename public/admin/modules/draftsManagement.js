// public/admin/modules/draftsManagement.js
import { api } from '../api.js';
import { ui } from '../ui.js';

let allDrafts = []; // 快取所有草稿資料

// 渲染草稿列表
function renderDraftList(drafts) {
    const draftListTbody = document.getElementById('draft-list-tbody');
    if (!draftListTbody) return;

    draftListTbody.innerHTML = '';
    if (drafts.length === 0) {
        draftListTbody.innerHTML = '<tr><td colspan="3" style="text-align: center;">尚無任何訊息草稿。</td></tr>';
        return;
    }

    drafts.forEach(draft => {
        const row = draftListTbody.insertRow();
        const contentPreview = draft.content.substring(0, 50) + (draft.content.length > 50 ? '...' : '');

        row.innerHTML = `
            <td>${draft.title}</td>
            <td>${contentPreview}</td>
            <td class="actions-cell">
                <button class="action-btn btn-edit-draft" data-draft-id="${draft.draft_id}" style="background-color: var(--color-warning); color: #000;">編輯</button>
                <button class="action-btn btn-delete-draft" data-draft-id="${draft.draft_id}" style="background-color: var(--color-danger);">刪除</button>
            </td>
        `;
    });
}

// 開啟編輯/新增草稿的 Modal
function openEditDraftModal(draft = null) {
    const editDraftModal = document.getElementById('edit-draft-modal');
    const editDraftForm = document.getElementById('edit-draft-form');
    if (!editDraftModal || !editDraftForm) return;

    editDraftForm.reset();

    const modalTitle = editDraftModal.querySelector('#modal-draft-title');
    const draftIdInput = document.getElementById('edit-draft-id');

    if (draft) {
        // 編輯模式
        modalTitle.textContent = '編輯訊息草稿';
        draftIdInput.value = draft.draft_id;
        document.getElementById('edit-draft-title').value = draft.title;
        document.getElementById('edit-draft-content').value = draft.content;
    } else {
        // 新增模式
        modalTitle.textContent = '新增訊息草稿';
        draftIdInput.value = '';
    }

    ui.showModal('#edit-draft-modal');
}

// 綁定事件監聽器
function setupEventListeners() {
    const page = document.getElementById('page-drafts');
    if (!page) return;

    // 頁面級別的事件委派
    page.addEventListener('click', e => {
        const target = e.target;
        if (target.id === 'add-draft-btn') {
            openEditDraftModal();
        } else if (target.matches('.btn-edit-draft')) {
            const draftId = target.dataset.draftId;
            const draft = allDrafts.find(d => d.draft_id == draftId);
            if (draft) openEditDraftModal(draft);
        } else if (target.matches('.btn-delete-draft')) {
            handleDeleteDraft(target.dataset.draftId);
        }
    });

    // Modal 表單提交
    const editDraftForm = document.getElementById('edit-draft-form');
    if (editDraftForm) {
        editDraftForm.onsubmit = handleFormSubmit;
    }
}

// 處理刪除邏輯
async function handleDeleteDraft(draftId) {
    if (!draftId || !confirm('確定要刪除這則草稿嗎？')) return;

    try {
        await api.deleteMessageDraft(Number(draftId));
        ui.toast.success('刪除成功！');
        await init(); // 重新載入列表
    } catch (error) {
        ui.toast.error(`錯誤：${error.message}`);
    }
}

// 處理表單提交邏輯 (新增/編輯)
async function handleFormSubmit(event) {
    event.preventDefault();
    const draftId = document.getElementById('edit-draft-id').value;
    const draftData = {
        title: document.getElementById('edit-draft-title').value,
        content: document.getElementById('edit-draft-content').value,
    };

    try {
        if (draftId) {
            // 更新
            draftData.draft_id = Number(draftId);
            await api.updateMessageDraft(draftData);
        } else {
            // 新增
            await api.createMessageDraft(draftData);
        }
        ui.toast.success('草稿儲存成功！');
        ui.hideModal('#edit-draft-modal');
        await init(); // 重新載入列表
    } catch (error) {
        ui.toast.error(`錯誤： ${error.message}`);
    }
}

// 模組初始化函式
export const init = async () => {
    const draftListTbody = document.getElementById('draft-list-tbody');
    if (!draftListTbody) return;

    draftListTbody.innerHTML = '<tr><td colspan="3" style="text-align: center;">正在載入草稿...</td></tr>';

    try {
        allDrafts = await api.getMessageDrafts();
        renderDraftList(allDrafts);
        // 確保事件只綁定一次
        if (!document.getElementById('page-drafts').dataset.initialized) {
            setupEventListeners();
            document.getElementById('page-drafts').dataset.initialized = 'true';
        }
    } catch (error) {
        console.error('獲取訊息草稿失敗:', error);
        draftListTbody.innerHTML = `<tr><td colspan="3" style="color: red; text-align: center;">讀取失敗: ${error.message}</td></tr>`;
    }
};