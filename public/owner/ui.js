// public/owner/ui.js
import { state, setState } from './state.js';

// --- 顯示/隱藏 Modal 的核心邏輯 ---

export function showModal(title, bodyHtml, actionsHtml = '') {
    const detailsModal = document.getElementById('details-modal');
    const detailsModalTitle = document.getElementById('details-modal-title');
    const detailsModalBody = document.getElementById('details-modal-body');
    const detailsModalActions = document.getElementById('details-modal-actions');

    if (detailsModalTitle) detailsModalTitle.textContent = title;
    if (detailsModalBody) detailsModalBody.innerHTML = bodyHtml;
    if (detailsModalActions) detailsModalActions.innerHTML = actionsHtml;
    
    if (detailsModal) {
        detailsModal.style.display = 'flex';
        updateHistoryState('details', 'open');
    }
}

// 隱藏所有 Modal
export function hideAllModals() {
    const modals = [
        'details-modal', 
        'send-message-modal', 
        'quick-booking-modal', 
        'edit-customer-modal'
    ];
    modals.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.style.display = 'none';
    });
    setState('currentHistoryState', { modal: null });
}

// 觸發瀏覽器「上一頁」來關閉 Modal (或是直接關閉)
export function closeModal() {
    if (state.currentHistoryState && state.currentHistoryState.modal) {
        history.back();
    } else {
        hideAllModals();
    }
}

// --- 歷史紀錄管理 ---

export function updateHistoryState(modalName, action = 'open') {
    if (action === 'open') {
        const newState = { modal: modalName };
        history.pushState(newState, '');
        setState('currentHistoryState', newState);
    } else {
        if (state.currentHistoryState.modal === modalName) {
             history.back();
        }
    }
}

export function handlePopState(event) {
    const targetState = event.state || { modal: null };
    setState('currentHistoryState', targetState);
    hideAllModals(); 
}

// --- 其他 UI 輔助函式 ---

export function displayInlineError(message, containerId = 'activity-list-content') {
    const container = document.getElementById(containerId);
    if (container && container.id !== 'loading-view') { 
        container.innerHTML = `<p style="color: var(--color-danger); text-align: center;">${message}</p>`;
    }
}

export function translateStatus(status) {
    const isGuesthouse = state.currentTemplate === 'guesthouse_template';
    switch (status) {
        case 'confirmed': return '已確認';
        case 'checked-in': return isGuesthouse ? '已入住' : '已報到';
        case 'cancelled': return '已取消';
        case 'no-show': return '未如期入住';
        default: return status || '未知';
    }
}

export function toast(message) {
    alert(message);
}

export function confirmAction(message) {
    return new Promise((resolve) => {
        const result = confirm(message);
        resolve(result);
    });
}

// 預設匯出物件 (相容舊寫法)
export const ui = {
    showModal,
    hideAllModals,
    closeModal,
    updateHistoryState,
    handlePopState,
    displayInlineError,
    translateStatus,
    toast,
    confirmAction
};