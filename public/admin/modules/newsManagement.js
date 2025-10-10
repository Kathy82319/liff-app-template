// public/admin/modules/newsManagement.js
import { api } from '../api.js';
import { ui } from '../ui.js';

let allNews = []; // 快取所有情報資料
let flatpickrInstance = null; // flatpickr 的實例

// 渲染情報列表
function renderNewsList(newsItems) {
    const newsListTbody = document.getElementById('news-list-tbody');
    if (!newsListTbody) return;

    newsListTbody.innerHTML = '';
    newsItems.forEach(news => {
        const row = newsListTbody.insertRow();
        row.innerHTML = `
            <td>${news.title}</td>
            <td>${news.category}</td>
            <td>${news.published_date}</td>
            <td>${news.is_published ? '<span style="color: var(--success-color);">已發布</span>' : '草稿'}</td>
            <td class="actions-cell">
                <button class="action-btn btn-edit-news" data-news-id="${news.id}" style="background-color: var(--warning-color); color: #000;">編輯</button>
            </td>
        `;
    });
}

// 開啟編輯/新增情報的 Modal
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

// 綁定此模組專屬的事件監聽器
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
        editNewsForm.onsubmit = async (e) => {
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
        };
    }

    if (deleteNewsBtn) {
        deleteNewsBtn.onclick = async () => {
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
        };
    }
}

// 模組初始化函式 (修正後)
export const init = async () => {
    const newsListTbody = document.getElementById('news-list-tbody');
    if (!newsListTbody) return;
    
    newsListTbody.innerHTML = '<tr><td colspan="5" style="text-align: center;">正在載入情報...</td></tr>';
    
    try {
        allNews = await api.getAllNews();
        renderNewsList(allNews);
        // 第一次初始化時才綁定靜態事件，避免重複綁定
        if (!document.getElementById('page-news').dataset.initialized) {
            setupEventListeners();
            document.getElementById('page-news').dataset.initialized = 'true';
        }
    } catch (error) {
        console.error('獲取情報列表失敗:', error);
        // 【修正】移除多餘的反斜線
        newsListTbody.innerHTML = `<tr><td colspan="5" style="color: red; text-align: center;">讀取情報失敗: ${error.message}</td></tr>`;
    }
};