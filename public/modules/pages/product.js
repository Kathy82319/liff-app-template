// public/modules/pages/product.js (v12.0 - Config Driven)
import { api } from '../api.js';
import { state } from '../state.js';
import { router } from '../router.js';

let productView = { layout: 'grid', sort: 'default' };
let activeFilters = { keyword: '', filter_1: null, filter_2: null, filter_3: null };

export async function init() {
    const prodConfig = state.activeTemplate?.client_config?.products || {};
    
    // 1. 讀取預設檢視模式
    productView.layout = localStorage.getItem('product_layout_preference') || prodConfig.view_mode || 'grid';
    productView.sort = localStorage.getItem('product_sort_preference') || 'default';

    const container = document.getElementById('product-list-container');
    if (!container) return;
    container.innerHTML = `<p>載入中...</p>`; 

    // 2. 設定標題
    const pageTitle = document.querySelector('#page-products .page-main-title'); 
    if(pageTitle) pageTitle.textContent = prodConfig.title || '產品/服務';

    setupUIControls();

    try {
        if (state.allProducts.length === 0) {
            state.allProducts = await api.getProducts();
        }
        if (state.config?.LOGIC?.PRODUCT_FILTERS) {
             populateFilters(); 
        }
        renderProducts(prodConfig); // 傳入 config
        
        const searchInput = document.getElementById('keyword-search');
        if (searchInput && !searchInput.dataset.bound) {
            searchInput.addEventListener('input', e => { 
                activeFilters.keyword = e.target.value; 
                renderProducts(prodConfig); 
            });
            searchInput.dataset.bound = 'true';
        }
        
        // ... (clearBtn 邏輯保持不變)
        const clearBtn = document.getElementById('clear-filters');
        if (clearBtn && !clearBtn.dataset.bound) {
            clearBtn.addEventListener('click', () => {
                activeFilters = { keyword: '', filter_1: null, filter_2: null, filter_3: null };
                if(searchInput) searchInput.value = '';
                document.querySelectorAll('#dynamic-filter-container select').forEach(select => {
                    select.selectedIndex = 0;
                });
                renderProducts(prodConfig);
            });
            clearBtn.dataset.bound = 'true';
        }

    } catch (error) {
        console.error('初始化產品型錄失敗:', error);
        container.innerHTML = `<p style="color: var(--color-danger);">讀取資料失敗。</p>`;
    }
}

function setupUIControls() {
    // 簡化邏輯：目前假設都顯示搜尋與排序，可視需求再從 config 讀取
    const filterControls = document.getElementById('filter-controls');
    const viewControls = document.getElementById('product-view-controls');
    if (filterControls) filterControls.style.display = 'block';
    if (viewControls) viewControls.style.display = 'flex';
    
    // 綁定切換與排序按鈕 (保持不變)
    const gridBtn = document.getElementById('view-grid-btn');
    const listBtn = document.getElementById('view-list-btn');
    const sortButton = document.getElementById('price-sort-btn');
    
    if (gridBtn && !gridBtn.dataset.bound) {
        gridBtn.addEventListener('click', () => {
            productView.layout = 'grid'; localStorage.setItem('product_layout_preference', 'grid');
            renderProducts(state.activeTemplate?.client_config?.products);
        });
        gridBtn.dataset.bound = 'true';
    }
    if (listBtn && !listBtn.dataset.bound) {
        listBtn.addEventListener('click', () => {
            productView.layout = 'list'; localStorage.setItem('product_layout_preference', 'list');
            renderProducts(state.activeTemplate?.client_config?.products);
        });
        listBtn.dataset.bound = 'true';
    }
    if (sortButton && !sortButton.dataset.bound) {
        sortButton.addEventListener('click', () => {
            const current = productView.sort;
            if (current === 'default') productView.sort = 'price_desc';
            else if (current === 'price_desc') productView.sort = 'price_asc';
            else productView.sort = 'default';
            localStorage.setItem('product_sort_preference', productView.sort);
            renderProducts(state.activeTemplate?.client_config?.products);
        });
        sortButton.dataset.bound = 'true';
    }
}

function populateFilters() {
    // ... (Filter 生成邏輯保持不變)
    const container = document.getElementById('dynamic-filter-container');
    if (!container) return;
    container.innerHTML = '';
    const filterDefinitions = state.config?.LOGIC?.PRODUCT_FILTERS;
    if (!Array.isArray(filterDefinitions)) return;
    filterDefinitions.forEach(filterDef => {
        const select = document.createElement('select');
        select.id = `liff-${filterDef.id}`;
        select.dataset.filterKey = filterDef.id;
        select.add(new Option(`-- ${filterDef.name} --`, ''));
        const options = [...new Set(state.allProducts.map(p => p[filterDef.id]).filter(Boolean))];
        options.sort(); 
        options.forEach(option => select.add(new Option(option, option)));
        select.addEventListener('change', (e) => {
            activeFilters[e.target.dataset.filterKey] = e.target.value || null;
            renderProducts(state.activeTemplate?.client_config?.products);
        });
        container.appendChild(select);
    });
}

function renderProducts(config = {}) {
    const container = document.getElementById('product-list-container');
    const sortButton = document.getElementById('price-sort-btn');
    if(!container) return;

    let filtered = state.allProducts.filter(p => p.is_visible === 1);
    const keyword = activeFilters.keyword.toLowerCase().trim();
    if (keyword) { filtered = filtered.filter(p => p.name.toLowerCase().includes(keyword)); }
    const filterDefinitions = state.config?.LOGIC?.PRODUCT_FILTERS || [];
    filterDefinitions.forEach(filterDef => {
        const key = filterDef.id;
        if (activeFilters[key]) { filtered = filtered.filter(p => p[key] === activeFilters[key]); }
    });

    switch (productView.sort) {
        case 'price_desc': filtered.sort((a, b) => (b.price_weekday || 0) - (a.price_weekday || 0)); break;
        case 'price_asc': filtered.sort((a, b) => (a.price_weekday || 0) - (b.price_weekday || 0)); break;
        default: filtered.sort((a, b) => a.display_order - b.display_order); break;
    }

    container.className = productView.layout === 'grid' ? 'view-grid' : 'view-list';
    document.getElementById('view-grid-btn')?.classList.toggle('active', productView.layout === 'grid');
    document.getElementById('view-list-btn')?.classList.toggle('active', productView.layout === 'list');
    
    if(sortButton) {
        sortButton.dataset.sort = productView.sort;
        const arrow = sortButton.querySelector('.sort-arrow');
        if(arrow) {
            if (productView.sort === 'price_desc') arrow.textContent = '↓';
            else if (productView.sort === 'price_asc') arrow.textContent = '↑';
            else arrow.textContent = '';
        }
    }

    if (filtered.length === 0) {
        container.innerHTML = `<p>找不到符合條件的項目。</p>`;
        return;
    }

    const showPrice = config.show_price !== false;
    const showStock = config.show_stock !== false; // 只有在 Grid 模式或特定設計下才顯示

    container.innerHTML = filtered.map(product => {
        let priceDisplay = showPrice ? (product.price_weekday != null ? `$${product.price_weekday}` : '洽詢') : '';
        const isList = productView.layout === 'list';
        const images = JSON.parse(product.images || '[]');
        const imageUrl = images.length > 0 ? images[0] : 'https://placehold.co/400x300/F5F5F5/CCCCCC?text=No+Image';

        return `
            <div class="product-card" data-product-id="${product.product_id}">
                <img src="${imageUrl}" alt="${product.name}" class="product-image">
                <div class="product-info">
                    <div style="display:flex; justify-content:space-between; align-items:flex-start;">
                        <h3 class="product-title" style="margin:0;">${product.name}</h3>
                        ${showPrice ? `<span style="color:var(--color-primary); font-weight:bold; font-size:1rem;">${priceDisplay}</span>` : ''}
                    </div>
                    ${isList ? `<p style="font-size:0.85rem; color:#888; margin:5px 0 0 0;">${product.description ? product.description.substring(0, 40) + '...' : ''}</p>` : ''}
                </div>
            </div>
        `;
    }).join('');
    
    container.querySelectorAll('.product-card').forEach(card => {
        card.addEventListener('click', () => {
            const p = state.allProducts.find(x => x.product_id === card.dataset.productId);
            // 注意：這裡引用原本的 renderDetails，若不在同一檔案需處理匯出
            // 這裡簡單假設 router 會處理 render
            if (p) router.navigate('page-product-details', { product: p });
        });
    });
}

// 渲染詳情 (需在 router.js 中被引用)
export function renderDetails(product) {
    if (!product) return;
    const contentContainer = document.querySelector('#product-details-content');
    const detailsTitle = document.querySelector('.details-title');
    const gallery = document.querySelector('.details-gallery');
    
    if (!contentContainer || !detailsTitle || !gallery) return;

    detailsTitle.textContent = product.name;
    contentContainer.innerHTML = '';

    // ... (圖片與相簿邏輯保持不變) ...
    const mainImage = gallery.querySelector('.details-image-main');
    const thumbnails = gallery.querySelector('.details-image-thumbnails');
    try {
        const images = JSON.parse(product.images || '[]');
        if (images.length > 0) {
            mainImage.src = images[0];
            thumbnails.innerHTML = images.map((img, i) => `<img src="${img}" class="${i===0?'active':''}" data-src="${img}">`).join('');
            gallery.style.display = 'block';
            thumbnails.onclick = (e) => {
                if (e.target.tagName === 'IMG') {
                    mainImage.src = e.target.dataset.src;
                    thumbnails.querySelector('.active')?.classList.remove('active');
                    e.target.classList.add('active');
                }
            };
        } else {
            gallery.style.display = 'none';
        }
    } catch(e) { gallery.style.display = 'none'; }

    const prodConfig = state.activeTemplate?.client_config?.products || {};
    if (prodConfig.show_price !== false) {
        const priceSection = document.createElement('div');
        priceSection.className = 'detail-field-section product-price-details';
        priceSection.innerHTML = `
            <h3>價格</h3>
            <p>
                平日: ${product.price_weekday !== null ? '$' + product.price_weekday : '洽詢'}<br>
                ${product.price_friday ? `週五: $${product.price_friday}<br>` : ''}
                ${product.price_saturday ? `週六: $${product.price_saturday}` : ''}
            </p>`;
        contentContainer.appendChild(priceSection);
    }

    // 顯示其他欄位
    if (state.activeTemplate?.fields) {
        state.activeTemplate.fields.forEach(field => {
            if (['name', 'images', 'is_visible'].includes(field.key) || field.key.startsWith('price_')) return;
            const value = product[field.key];
            if (value && String(value).trim() !== '') {
                const section = document.createElement('div');
                section.className = 'detail-field-section';
                section.innerHTML = `<h3>${field.label}</h3><p>${String(value).replace(/\n/g, '<br>')}</p>`;
                contentContainer.appendChild(section);
            }
        });
    }
    
    // 規格欄位 (spec_1 ~ spec_5)
    for (let i = 1; i <= 5; i++) {
        const sName = product[`spec_${i}_name`];
        const sVal = product[`spec_${i}_value`];
        if (sName || sVal) {
            const specDiv = document.createElement('div');
            specDiv.className = 'detail-field-section';
            if (sName) specDiv.innerHTML += `<h3>${sName}</h3>`;
            specDiv.innerHTML += `<p>${(sVal || '').replace(/\n/g, '<br>')}</p>`;
            contentContainer.appendChild(specDiv);
        }
    }
}