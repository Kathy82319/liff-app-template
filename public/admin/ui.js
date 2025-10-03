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
            // href 格式是 #pageId
            const linkTarget = link.getAttribute('href').substring(1);
            link.classList.toggle('active', linkTarget === pageId);
        });
    },

    // 我們未來會在這裡加入更多共用函式，例如 showModal, showNotification 等
};