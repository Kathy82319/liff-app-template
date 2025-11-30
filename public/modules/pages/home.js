// public/modules/pages/home.js
import { api } from '../api.js';
import { state } from '../state.js';
import { router } from '../router.js';

export async function init() {
    const terms = state.activeTemplate?.terms || {};
    const pageTitle = document.querySelector('#page-home .page-main-title');
    if (pageTitle) pageTitle.textContent = terms.NEWS_PAGE_TITLE || '最新情報';

    // FAB Button
    const rallyFab = document.getElementById('rally-fab-btn');
    if (rallyFab && !rallyFab.dataset.bound) {
        rallyFab.addEventListener('click', () => router.navigate('page-rally'));
        rallyFab.dataset.bound = 'true';
    }

    const container = document.getElementById('news-list-container');
    if (!container) return;
    
    container.innerHTML = `<p style="padding: 10px; color: var(--color-text-secondary);">載入中...</p>`;

    try {
        state.allNews = await api.getNews();
        setupFilters();
        renderNews();
    } catch (error) {
        container.innerHTML = `<p style="padding: 10px; color:var(--color-danger);">載入失敗: ${error.message}</p>`;
    }
}

function renderNews(filterCategory = 'ALL') {
    const container = document.getElementById('news-list-container');
    if (!container) return;
    
    const filtered = (filterCategory === 'ALL') 
        ? state.allNews 
        : state.allNews.filter(n => n.category === filterCategory);

    if (filtered.length === 0) {
        container.innerHTML = `<p>此分類目前沒有情報。</p>`;
        return;
    }

    container.innerHTML = filtered.map(news => {
        const imageHTML = news.image_url ? `<img src="${news.image_url}" alt="${news.title}" class="news-card-image">` : '';
        const snippet = news.content ? news.content.substring(0, 50) + '...' : '';
        return `
        <div class="news-card" data-news-id="${news.id}">
            <div class="news-card-header">
                <span class="news-card-category">${news.category}</span>
                <span class="news-card-date">${news.published_date}</span>
            </div>
            ${imageHTML}
            <h3 class="news-card-title">${news.title}</h3>
            <p class="news-card-snippet">${snippet}</p>
        </div>`;
    }).join('');
    
    // 綁定點擊
    container.querySelectorAll('.news-card').forEach(card => {
        card.addEventListener('click', () => {
            const news = state.allNews.find(n => n.id == card.dataset.newsId);
            if (news) router.navigate('page-news-details', { news });
        });
    });
}

function setupFilters() {
    const container = document.getElementById('news-filter-container');
    if (!container) return;
    
    const categories = ['ALL', ...new Set(state.allNews.map(n => n.category))];
    container.innerHTML = categories.map(cat => 
        `<button class="news-filter-btn ${cat === 'ALL' ? 'active' : ''}" data-category="${cat}">${cat === 'ALL' ? '全部' : cat}</button>`
    ).join('');

    container.addEventListener('click', (e) => {
        if (e.target.matches('.news-filter-btn')) {
            container.querySelector('.active')?.classList.remove('active');
            e.target.classList.add('active');
            renderNews(e.target.dataset.category);
        }
    });
}

export function renderDetails(newsItem) {
    if (!newsItem) return;
    document.getElementById('news-details-title').textContent = newsItem.title;        
    document.getElementById('news-details-category').textContent = newsItem.category;
    document.getElementById('news-details-date').textContent = newsItem.published_date;
    
    const contentEl = document.getElementById('news-details-content');
    contentEl.innerHTML = newsItem.content ? newsItem.content.replace(/\n/g, '<br>') : '';
    
    const imageEl = document.getElementById('news-details-image');
    if (newsItem.image_url) {
        imageEl.src = newsItem.image_url;
        imageEl.style.display = 'block';
    } else {
        imageEl.style.display = 'none';
    }
}