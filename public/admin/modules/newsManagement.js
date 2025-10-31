// public/admin/modules/newsManagement.js
import { api } from '../api.js';
import { ui } from '../ui.js';

let allNews = []; // 快取所有情報資料
let flatpickrInstance = null; // flatpickr 的實例
let activeTemplate = null; // 【新增】存放當前啟用的樣板藍圖

/**
 * 安全地獲取物件的巢狀屬性
 * @param {object} obj - 來源物件
 * @param {string} path - 屬性路徑 (例如 "user.profile.name")
 * @param {*} defaultValue - 找不到時的回傳值
 * @returns {*}
 */
function getProperty(obj, path, defaultValue = 'N/A') {
    const value = path.split('.').reduce((acc, key) => (acc && acc[key] !== undefined && acc[key] !== null) ? acc[key] : undefined, obj);
    // 修改：如果值是空字串，也視為 defaultValue
    const result = (value !== undefined && value !== null && value !== '') ? value : defaultValue;
    
    // 自動截斷過長的字串
    if (typeof result === 'string' && result.length > 50 && defaultValue === 'N/A') {
        return result.substring(0, 47) + '...';
    }
    return result;
}

// 渲染情報列表 (藍圖驅動版)
function renderNewsList(newsItems) {
    const newsListTbody = document.getElementById('news-list-tbody');
    // --- 【修改】獲取 Thead 中的 tr 元素 ---
    const newsListTheadTr = document.querySelector('#page-news thead tr');

    if (!newsListTbody || !newsListTheadTr) {
        console.error("renderNewsList: 找不到 tbody 或 thead tr 元素。");
        return;
    }

    // --- 1. 檢查 activeTemplate 是否已載入 ---
    if (!activeTemplate || !activeTemplate.logic || !Array.isArray(activeTemplate.logic.adminNewsColumns)) {
        console.error("renderNewsList: activeTemplate 或 adminNewsColumns 尚未準備就緒。");
        newsListTheadTr.innerHTML = '<th>錯誤</th>';
        newsListTbody.innerHTML = '<tr><td style="text-align: center; color: red;">錯誤：情報列表欄位設定未載入。請檢查系統設定。</td></tr>';
        return;
    }

    // --- 2. 獲取啟用的欄位 ---
    const columns = activeTemplate.logic.adminNewsColumns.filter(col => col.enabled);

    // --- 3. 動態渲染表頭 ---
    let headerHTML = '';
    columns.forEach(col => {
        headerHTML += `<th>${col.label}</th>`;
    });
    headerHTML += '<th>狀態</th>'; // 狀態欄位固定
    headerHTML += '<th>操作</th>'; // 操作欄位固定
    newsListTheadTr.innerHTML = headerHTML;

    // --- 4. 渲染列表內容 ---
    newsListTbody.innerHTML = '';
    if (!newsItems || newsItems.length === 0) {
        newsListTbody.innerHTML = `<tr><td colspan="${columns.length + 2}" style="text-align: center;">尚無任何情報。</td></tr>`;
        return;
    }

    newsItems.forEach(news => {
        const row = newsListTbody.insertRow();
        
        // --- 5. 根據欄位設定動態插入儲存格 ---
        columns.forEach(col => {
            const cell = row.insertCell();
            let cellContent = getProperty(news, col.key, 'N/A');
            cell.innerHTML = cellContent;
        });

        // --- 6. 渲染固定的「狀態」和「操作」儲存格 ---
        // 插入「狀態」
        row.insertCell().innerHTML = news.is_published ? '<span style="color: var(--color-success);">已發布</span>' : '草稿';
        
        // 插入「操作」
        const actionCell = row.insertCell();
        actionCell.className = 'actions-cell';
        actionCell.innerHTML = `
            <button class="action-btn btn-edit-news" data-news-id="${news.id}" style="background-color: var(--color-warning); color: #000;">編輯</button>
        `;
    });
}

// 開啟編輯/新增情報的 Modal (保持不變)
function openEditNewsModal(news = null) {
    const editNewsModal = document.getElementById('edit-news-modal');
    const editNewsForm = document.getElementById('edit-news-form');
    if (!editNewsModal || !editNewsForm) return;

    editNewsForm.reset();
    
    const modalTitle = editNewsModal.querySelector('#modal-news-title');
    const deleteBtn = editNewsModal.querySelector('#delete-news-btn');
    const newsIdInput = document.getElementById('edit-news-id');
    
    if (news) {
        // 編輯模式
        modalTitle.textContent = '編輯情報';
        deleteBtn.style.display = 'inline-block';
        newsIdInput.value = news.id;
        document.getElementById('edit-news-title').value = news.title;
        document.getElementById('edit-news-category').value = news.category;
        document.getElementById('edit-news-date').value = news.published_date;
        document.getElementById('edit-news-image').value = news.image_url || '';
        document.getElementById('edit-news-content').value = news.content || '';
        document.getElementById('edit-news-published').checked = !!news.is_published;
    } else {
        // 新增模式
        modalTitle.textContent = '新增情報';
        deleteBtn.style.display = 'none';
        newsIdInput.value = '';
        // 給予發布日期的預設值
        document.getElementById('edit-news-date').value = new Date().toISOString().split('T')[0];
    }

    // 初始化日期選擇器
    if (flatpickrInstance) flatpickrInstance.destroy();
    flatpickrInstance = flatpickr("#edit-news-date", {
        dateFormat: "Y-m-d",
        defaultDate: document.getElementById('edit-news-date').value
    });

    ui.showModal('#edit-news-modal');
}

// 綁定此模組專屬的事件監聽器 (保持不變)
function setupEventListeners() {
    const page = document.getElementById('page-news');
    if (!page) return;

    // 使用事件委派來處理整個頁面的點擊事件
    page.addEventListener('click', (e) => {
        const target = e.target;
        if (target.id === 'add-news-btn') {
            openEditNewsModal();
        } else if (target.matches('.btn-edit-news')) {
            const newsId = target.dataset.newsId;
            const newsItem = allNews.find(n => n.id == newsId);
            if (newsItem) {
                openEditNewsModal(newsItem);
            }
        }
    });

    // 處理 Modal 內的表單提交與刪除
    const editNewsForm = document.getElementById('edit-news-form');
    const deleteNewsBtn = document.getElementById('delete-news-btn');

    if (editNewsForm) {
        // 確保只綁定一次
        if (!editNewsForm.dataset.listenerAttached) {
            editNewsForm.addEventListener('submit', async (e) => {
                e.preventDefault();
                const newsId = document.getElementById('edit-news-id').value;
                const formData = {
                    id: newsId ? Number(newsId) : null,
                    title: document.getElementById('edit-news-title').value,
                    category: document.getElementById('edit-news-category').value,
                    published_date: document.getElementById('edit-news-date').value,
                    image_url: document.getElementById('edit-news-image').value,
                    content: document.getElementById('edit-news-content').value,
                    is_published: document.getElementById('edit-news-published').checked
                };

                try {
                    if (newsId) {
                        await api.updateNews(formData);
                    } else {
                        await api.createNews(formData);
                    }
                    ui.toast.success('儲存成功！');
                    ui.hideModal('#edit-news-modal');
                    await init(); // 重新載入列表
                } catch (error) {
                    ui.toast.error(`建立失敗: ${error.message}`);
                }
            });
            editNewsForm.dataset.listenerAttached = 'true';
        }
    }

    if (deleteNewsBtn) {
        // 確保只綁定一次
        if (!deleteNewsBtn.dataset.listenerAttached) {
            deleteNewsBtn.addEventListener('click', async () => {
                const newsId = Number(document.getElementById('edit-news-id').value);
                if (!newsId || !confirm('確定要刪除這則情報嗎？此操作無法復原。')) return;
                try {
                    await api.deleteNews(newsId);
                    ui.toast.success('刪除成功！');
                    ui.hideModal('#edit-news-modal');
                    await init(); // 重新載入列表
                } catch (error) {
                    ui.toast.error(`錯誤：${error.message}`);
                }
            });
            deleteNewsBtn.dataset.listenerAttached = 'true';
        }
    }
}

// 模組初始化函式 (修正後)
export const init = async () => {
    console.log("[NewsManagement Init] Starting...");
    const newsListTbody = document.getElementById('news-list-tbody');
    const page = document.getElementById('page-news');
    if (!newsListTbody || !page) {
        console.error("[NewsManagement Init] Missing essential elements (tbody or page).");
        return;
    }
    
    newsListTbody.innerHTML = '<tr><td colspan="5" style="text-align: center;">正在載入情報...</td></tr>';
    // 同時清除/設定表頭
    const newsListTheadTr = document.querySelector('#page-news thead tr');
    if (newsListTheadTr) newsListTheadTr.innerHTML = '<th>載入中...</th>';

    try {
        // --- 1. 獲取當前啟用的樣板 (關鍵步驟) ---
        if (!window.CONFIG || !window.CONFIG.LOGIC || !window.CONFIG.LOGIC.ACTIVE_INDUSTRY_TEMPLATE || !window.CONFIG.LOGIC.INDUSTRY_TEMPLATE_DEFINITIONS) {
             console.error("[NewsManagement Init] window.CONFIG is not ready!");
             throw new Error("核心設定尚未載入。");
        }
        
        const activeTemplateKey = window.CONFIG.LOGIC.ACTIVE_INDUSTRY_TEMPLATE;
        activeTemplate = window.CONFIG.LOGIC.INDUSTRY_TEMPLATE_DEFINITIONS[activeTemplateKey]; // 存到模組變數

        if (!activeTemplate) {
            throw new Error(`在設定中找不到名為 "${activeTemplateKey}" 的商業樣板。`);
        }
        // 驗證此頁面需要的設定
        if (!activeTemplate.logic || !Array.isArray(activeTemplate.logic.adminNewsColumns)) {
             throw new Error(`樣板 "${activeTemplateKey}" 缺少 'logic.adminNewsColumns' 陣列設定。`);
        }
        console.log("[NewsManagement Init] Active template loaded:", activeTemplateKey);

        // --- 2. 獲取情報資料 ---
        allNews = await api.getAllNews();

        // --- 3. 渲染列表 (動態表頭) ---
        renderNewsList(allNews);
        
        // --- 4. 綁定靜態事件 (確保只綁定一次) ---
        if (!page.dataset.initialized) {
            setupEventListeners();
            page.dataset.initialized = 'true';
            console.log("[NewsManagement Init] Event listeners attached.");
        }
    } catch (error) {
        console.error('獲取情報列表失敗:', error);
        if (newsListTheadTr) newsListTheadTr.innerHTML = '<th>錯誤</th>';
        newsListTbody.innerHTML = `<tr><td colspan="5" style="color: red; text-align: center;">讀取情報失敗: ${error.message}</td></tr>`;
    }
};