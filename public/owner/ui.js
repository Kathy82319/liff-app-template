// public/owner/ui.js
import { state, setState } from './state.js';

function showModal(title, bodyHtml, actionsHtml = '') {
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

function hideAllModals() {
    const modals = ['details-modal', 'send-message-modal', 'quick-booking-modal', 'edit-customer-modal'];
    modals.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.style.display = 'none';
    });
    setState('currentHistoryState', { modal: null });
}

function closeModal() {
    if (state.currentHistoryState && state.currentHistoryState.modal) {
        history.back();
    } else {
        hideAllModals();
    }
}

function updateHistoryState(modalName, action = 'open') {
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

function handlePopState(event) {
    const targetState = event.state || { modal: null };
    setState('currentHistoryState', targetState);
    hideAllModals();
}

function displayInlineError(message, containerId = 'activity-list-content') {
    const container = document.getElementById(containerId);
    if (container && container.id !== 'loading-view') { 
        container.innerHTML = `<p style="color: var(--color-danger); text-align: center;">${message}</p>`;
    }
}

function translateStatus(status) {
    const isGuesthouse = state.currentTemplate === 'guesthouse_template';
    switch (status) {
        case 'confirmed': return '已確認';
        case 'checked-in': return isGuesthouse ? '已入住' : '已報到';
        case 'cancelled': return '已取消';
        case 'no-show': return '未如期入住';
        default: return status || '未知';
    }
}

function toast(message) {
    alert(message);
}

function confirmAction(message) {
    return new Promise((resolve) => {
        const result = confirm(message);
        resolve(result);
    });
}

// 【修正重點】包裝匯出
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

// 為了相容部分直接引用的寫法 (如 api.js 裡用到的)，同時保留具名匯出
export { displayInlineError, handlePopState, updateHistoryState };