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
     * 顯示一個非阻塞的確認對話框
     * @param {string} message - 要顯示的訊息
     * @returns {Promise<boolean>} - 如果使用者點擊確定則 resolve(true)，否則 resolve(false)
     */
    confirm: function(message) {
        return new Promise(resolve => {
            const modal = document.getElementById('confirmation-modal');
            const messageEl = document.getElementById('confirmation-message');
            const confirmBtn = document.getElementById('confirmation-confirm-btn');
            const cancelBtn = document.getElementById('confirmation-cancel-btn');
            const closeBtn = modal.querySelector('.modal-close');

            messageEl.textContent = message;

            const close = (result) => {
                ui.hideModal('#confirmation-modal');
                // 移除事件監聽器以避免重複觸發
                confirmBtn.onclick = null;
                cancelBtn.onclick = null;
                closeBtn.onclick = null;
                resolve(result);
            };

            confirmBtn.onclick = () => close(true);
            cancelBtn.onclick = () => close(false);
            closeBtn.onclick = () => close(false);

            ui.showModal('#confirmation-modal');
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

    /**
     * 【新增】Toast 訊息中心
     * 提供三種常用狀態：success, error, info
     */    
    toast: {
        _show: function(message, type = 'info') {
            let backgroundColor;
            switch(type) {
                case 'success':
                    backgroundColor = "linear-gradient(to right, #00b09b, #96c93d)";
                    break;
                case 'error':
                    backgroundColor = "linear-gradient(to right, #ff5f6d, #ffc371)";
                    break;
                default: // info
                    backgroundColor = "linear-gradient(to right, #4facfe, #00f2fe)";
                    break;
            }

            Toastify({
                text: message,
                duration: 3000,
                close: true,
                gravity: "top", // `top` or `bottom`
                position: "right", // `left`, `center` or `right`
                stopOnFocus: true, // Prevents dismissing of toast on hover
                style: {
                    background: backgroundColor,
                },
            }).showToast();
        },
        success: function(message) {
            this._show(message, 'success');
        },
        error: function(message) {
            this._show(message, 'error');
        },
        info: function(message) {
            this._show(message, 'info');
        }
    },

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