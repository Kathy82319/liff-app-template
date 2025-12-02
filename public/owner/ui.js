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

// 隱藏所有 Modal (程式控制，不涉及歷史紀錄操作)
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

// 觸發瀏覽器「上一頁」來關閉 Modal
export function closeModal() {
    if (state.currentHistoryState && state.currentHistoryState.modal) {
        history.back();
    } else {
        hideAllModals();
    }
}

// --- 歷史紀錄管理 (讓手機按上一頁能關閉 Modal) ---

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
    hideAllModals(); // 當使用者按上一頁時，關閉所有彈窗
}

// --- 其他 UI 輔助函式 ---

export function displayInlineError(message, containerId = 'activity-list-content') {
    const container = document.getElementById(containerId);
    if (container && container.id !== 'loading-view') { 
        container.innerHTML = `<p style="color: var(--color-danger); text-align: center;">${message}</p>`;
    } else {
         console.error(`Inline error display failed for container '${containerId}'. Error: ${message}`);
    }
}

export function translateStatus(status) {
    // 判斷是否為民宿模式
    const isGuesthouse = state.currentTemplate === 'guesthouse_template';
    
    switch (status) {
        case 'confirmed': return '已確認';
        case 'checked-in': return isGuesthouse ? '已入住' : '已報到';
        case 'cancelled': return '已取消';
        case 'no-show': return '未如期入住';
        default: return status || '未知';
    }
}

// 簡單的 Toast 通知 (如果原本有使用)
export function toast(message) {
    alert(message);
}

// 確認對話框 (包裝 Promise 以便未來更換 UI)
export function confirmAction(message) {
    return new Promise((resolve) => {
        const result = confirm(message);
        resolve(result);
    });
}