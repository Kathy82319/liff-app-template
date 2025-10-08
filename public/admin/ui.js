// public/admin/ui.js

// 存放所有與 UI 操作相關的函式
export const ui = {
    /**
     * 顯示指定的頁面，並隱藏其他頁面
     * @param {string} pageId - 頁面 ID (例如 'dashboard', 'users')
     */
    showPage(pageId) {
        document.querySelectorAll('.page').forEach(page => {
            page.classList.toggle('active', page.id === `page-${pageId}`);
        });
    },

    /**
     * 設定導覽列的啟用狀態
     * @param {string} pageId - 頁面 ID
     */
    setActiveNav(pageId) {
        document.querySelectorAll('.nav-tabs a').forEach(link => {
            const linkTarget = link.getAttribute('href').substring(1);
            link.classList.toggle('active', linkTarget === pageId);
        });
    },

    // --- 【** 以下為本次新增功能 **】 ---

    /**
     * 顯示指定的 Modal 彈窗
     * @param {string} modalId - Modal 的 ID (例如 '#edit-user-modal')
     */
    showModal(modalId) {
        const modal = document.querySelector(modalId);
        if (modal) {
            modal.style.display = 'flex';
        }
    },

    /**
     * 隱藏指定的 Modal 彈窗
     * @param {string} modalId - Modal 的 ID
     */
    hideModal(modalId) {
        const modal = document.querySelector(modalId);
        if (modal) {
            modal.style.display = 'none';
        }
    },

    /**
     * 初始化全域共享的事件監聽器 (例如：所有 Modal 的關閉按鈕)
     */
    initSharedEventListeners() {
        // 監聽所有 class 為 .modal-close 或 .btn-cancel 的點擊事件
        document.addEventListener('click', (e) => {
            if (e.target.matches('.modal-close') || e.target.matches('.btn-cancel')) {
                // 找到被點擊按鈕所在的最近的一個 Modal
                const modal = e.target.closest('.modal-overlay');
                if (modal) {
                    modal.style.display = 'none';
                }
            }
        });
    }
};