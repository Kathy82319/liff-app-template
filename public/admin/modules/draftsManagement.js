// public/admin/modules/draftsManagement.js (v2 - Handle Fixed Drafts & Policy JSON)
import { api } from '../api.js';
import { ui } from '../ui.js';

let allDrafts = []; // 快取所有草稿資料

// --- 固定草稿的 ID (與後端一致) ---
const FIXED_DRAFT_IDS = {
    POLICY: 1,
    AUTO_CONFIRMATION: 2
};

// 渲染草稿列表 (加入固定草稿的處理)
function renderDraftList(drafts) {
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
        const isFixed = draft.is_fixed || draft.draft_id === FIXED_DRAFT_IDS.POLICY || draft.draft_id === FIXED_DRAFT_IDS.AUTO_CONFIRMATION; // 雙重檢查

        // 特殊處理政策草稿的預覽
        if (draft.draft_id === FIXED_DRAFT_IDS.POLICY) {
            try {
                const policyData = JSON.parse(draft.content);
                contentPreview = `取消政策: ${policyData.cancellationPolicy.substring(0, 20)}... | 入住須知: ${policyData.checkInInstructions.substring(0, 20)}...`;
            } catch (e) {
                contentPreview = '[格式錯誤] 無法預覽政策內容';
            }
        } else {
            contentPreview = draft.content.substring(0, 50) + (draft.content.length > 50 ? '...' : '');
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

// 開啟編輯/新增草稿的 Modal (大幅修改以處理固定草稿)
// 開啟編輯/新增草稿的 Modal (v3 - 修正 JSON 解析邏輯)
function openEditDraftModal(draft = null) {
    const editDraftModal = document.getElementById('edit-draft-modal');
    const editDraftForm = document.getElementById('edit-draft-form');
    if (!editDraftModal || !editDraftForm) return;

    // --- 先隱藏所有欄位，再根據情況顯示 ---
    editDraftForm.reset();
    const allFormGroups = editDraftForm.querySelectorAll('.form-group');
    allFormGroups.forEach(group => group.style.display = 'none');
    const titleInput = document.getElementById('edit-draft-title');
    const contentTextarea = document.getElementById('edit-draft-content');
    const policyGroup = document.getElementById('policy-edit-group'); // 新增的政策編輯區塊 ID
    const cancellationPolicyTextarea = document.getElementById('edit-cancellation-policy');
    const checkInInstructionsTextarea = document.getElementById('edit-check-in-instructions');
    const modalTitle = editDraftModal.querySelector('#modal-draft-title');
    const draftIdInput = document.getElementById('edit-draft-id');

    // --- 顯示共用欄位 ---
    const draftId = draft ? Number(draft.draft_id) : null; // 將 ID 轉為數字
    draftIdInput.value = draftId || '';
    editDraftForm.querySelector('.form-actions').style.display = 'flex'; // 顯示按鈕區

    // --- 根據草稿類型顯示不同欄位 ---
    if (draftId === FIXED_DRAFT_IDS.POLICY) { // **<-- 嚴格判斷 ID 1**
        // --- 編輯政策草稿 ---
        modalTitle.textContent = '編輯 入住須知/取消政策';
        policyGroup.style.display = 'block'; // 顯示政策編輯區塊
        titleInput.closest('.form-group').style.display = 'none'; // 隱藏標題輸入
        contentTextarea.closest('.form-group').style.display = 'none'; // 隱藏一般內容輸入

        // 解析 JSON 填入 (只在此處解析)
        try {
            // 提供預設空物件，避免 draft.content 為空或 null 時 JSON.parse 報錯
            const policyData = JSON.parse(draft.content || '{}');
            cancellationPolicyTextarea.value = policyData.cancellationPolicy || '';
            checkInInstructionsTextarea.value = policyData.checkInInstructions || '';
        } catch (e) {
            console.error(`解析政策內容 (ID: ${draftId}) 失敗:`, e, "原始內容:", draft.content); // 加入 Log
            ui.toast.error("讀取政策內容時發生錯誤，將顯示原始文字。");
            // **錯誤處理**：如果解析失敗，顯示原始(可能錯誤的)文字，讓使用者修正
            cancellationPolicyTextarea.value = `[格式錯誤，請修正]\n${draft.content}`;
            checkInInstructionsTextarea.value = `[格式錯誤，請修正]\n${draft.content}`;
        }

    } else if (draftId === FIXED_DRAFT_IDS.AUTO_CONFIRMATION) { // **<-- 嚴格判斷 ID 2**
        // --- 編輯自動通知草稿 ---
        modalTitle.textContent = `編輯 ${FIXED_DRAFT_TITLES[FIXED_DRAFT_IDS.AUTO_CONFIRMATION]}`;
        titleInput.closest('.form-group').style.display = 'block'; // 顯示標題
        titleInput.value = FIXED_DRAFT_TITLES[FIXED_DRAFT_IDS.AUTO_CONFIRMATION];
        titleInput.readOnly = true; // 標題不可修改
        titleInput.style.backgroundColor = '#e9ecef'; // 灰底提示
        contentTextarea.closest('.form-group').style.display = 'block'; // 顯示內容編輯
        contentTextarea.value = draft.content; // 直接使用原始 content (字串)
        policyGroup.style.display = 'none'; // 隱藏政策編輯

    } else if (draft) { // **<-- 處理其他已存在的草稿 (ID 不是 1 或 2)**
        // --- 編輯一般草稿 ---
        modalTitle.textContent = '編輯訊息草稿';
        titleInput.closest('.form-group').style.display = 'block'; // 顯示標題
        titleInput.value = draft.title;
        titleInput.readOnly = false; // 允許修改
        titleInput.style.backgroundColor = '';
        contentTextarea.closest('.form-group').style.display = 'block'; // 顯示內容編輯
        contentTextarea.value = draft.content; // 直接使用原始 content (字串)
        policyGroup.style.display = 'none'; // 隱藏政策編輯

    } else { // **<-- 新增草稿 (draft 為 null)**
        // --- 新增一般草稿 ---
        modalTitle.textContent = '新增訊息草稿';
        titleInput.closest('.form-group').style.display = 'block'; // 顯示標題
        titleInput.value = '';
        titleInput.readOnly = false;
        titleInput.style.backgroundColor = '';
        contentTextarea.closest('.form-group').style.display = 'block'; // 顯示內容編輯
        contentTextarea.value = '';
        policyGroup.style.display = 'none'; // 隱藏政策編輯
    }

    ui.showModal('#edit-draft-modal');
}

// 綁定事件監聽器
function setupEventListeners() {
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

    // --- 根據 draftId 決定要提交的資料和 API ---
    if (draftId === FIXED_DRAFT_IDS.POLICY) {
        // --- 儲存政策草稿 ---
        draftData = {
            draft_id: draftId,
            // title 由後端固定
            cancellationPolicy: document.getElementById('edit-cancellation-policy').value,
            checkInInstructions: document.getElementById('edit-check-in-instructions').value,
        };
        apiAction = api.updateMessageDraft; // 使用更新 API
    } else {
        // --- 儲存一般草稿或自動通知草稿 ---
        draftData = {
            title: document.getElementById('edit-draft-title').value,
            content: document.getElementById('edit-draft-content').value,
        };
        if (draftId) { // 如果是編輯
            draftData.draft_id = draftId;
            apiAction = api.updateMessageDraft;
        } else { // 如果是新增
            apiAction = api.createMessageDraft;
        }
    }

    // 簡單前端驗證 (後端會做更嚴格驗證)
    if (draftId !== FIXED_DRAFT_IDS.POLICY && (!draftData.title || !draftData.content)) {
         ui.toast.error('標題和內容為必填！');
         return;
    }
    if (draftId === FIXED_DRAFT_IDS.POLICY && (!draftData.cancellationPolicy || !draftData.checkInInstructions)) {
         ui.toast.error('取消政策和入住須知為必填！');
         return;
    }


    try {
        await apiAction(draftData); // 呼叫對應的 API
        ui.toast.success('草稿儲存成功！');
        ui.hideModal('#edit-draft-modal');
        await init(); // 重新載入列表
    } catch (error) {
        ui.toast.error(`儲存失敗： ${error.message}`);
    }
}

// 模組初始化函式
export const init = async () => {
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