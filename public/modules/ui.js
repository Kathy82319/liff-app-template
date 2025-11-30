// public/modules/ui.js
export function showModal(modalId) {
    const modal = document.querySelector(modalId);
    if (modal) modal.style.display = 'flex';
}

export function hideModal(modalId) {
    const modal = document.querySelector(modalId);
    if (modal) modal.style.display = 'none';
}

export function toast(message) {
    alert(message); // 暫時使用 alert，可升級為 Toastify
}

export function setupGlobalModalClosers() {
    document.addEventListener('click', (e) => {
        if (e.target.matches('.modal-close') || e.target.classList.contains('modal-overlay')) {
            const modal = e.target.closest('.modal-overlay');
            if (modal) modal.style.display = 'none';
        }
    });
}