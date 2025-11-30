// public/modules/ui.js

export function showModal(modalId) {
    const modal = document.querySelector(modalId);
    if (modal) {
        modal.style.display = 'flex';
        // 嘗試聚焦第一個輸入框，提升體驗
        const firstInput = modal.querySelector('input, select, textarea');
        if (firstInput) firstInput.focus();
    }
}

export function hideModal(modalId) {
    const modal = document.querySelector(modalId);
    if (modal) modal.style.display = 'none';
}

export function toast(message, type = 'info') {
    // 簡單的 alert 封裝，未來可替換為 Toastify
    if (type === 'error') {
        console.error(message);
        alert(`❌ ${message}`);
    } else {
        console.log(message);
        alert(`✅ ${message}`);
    }
}

export function setupGlobalModalClosers() {
    document.addEventListener('click', (e) => {
        if (e.target.matches('.modal-close') || e.target.classList.contains('modal-overlay') || e.target.classList.contains('btn-cancel')) {
            const modal = e.target.closest('.modal-overlay');
            if (modal) modal.style.display = 'none';
        }
    });
}

// 【關鍵修正】匯出一個名為 ui 的物件，讓 import { ui } from ... 可以運作
export const ui = {
    showModal,
    hideModal,
    toast,
    setupGlobalModalClosers
};