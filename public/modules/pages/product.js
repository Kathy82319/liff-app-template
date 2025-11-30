// public/modules/pages/product.js
import { api } from '../api.js';
import { state } from '../state.js';
import { router } from '../router.js';

// 頁面內部狀態
let productView = { layout: 'grid', sort: 'default' };
let activeFilters = { keyword: '', filter_1: null, filter_2: null, filter_3: null };

export async function init() {
    // 從 LocalStorage 恢復偏好
    productView.layout = localStorage.getItem('product_layout_preference') || 'grid';
    productView.sort = 'default';

    const container = document.getElementById('product-list-container');
    if (!container) return;
    container.innerHTML = `<p>載入中...</p>`; 

    // 設定標題
    const terms = state.activeTemplate?.terms || {};
    const features = state.activeTemplate?.features || {};
    const pageTitle = document.querySelector('#page-products .page-main-title'); 
    if(pageTitle && terms.PRODUCT_CATALOG_TITLE) { 
        pageTitle.textContent = terms.PRODUCT_CATALOG_TITLE;
    }

    // UI 控制項顯示邏輯
    setupUIControls(features, terms);

    try {
        // 如果還沒載入產品，則載入
        if (state.allProducts.length === 0) {
            state.allProducts = await api.getProducts();
        }
        
        // 產生動態篩選器
        if (state.config?.LOGIC?.PRODUCT_FILTERS) {
             populateFilters(); 
        }
        
        renderProducts();
        
        // 綁定搜尋框
        const searchInput = document.getElementById('keyword-search');
        if (searchInput && !searchInput.dataset.bound) {
            searchInput.addEventListener('input', e => { 
                activeFilters.keyword = e.target.value; 
                renderProducts(); 
            });
            searchInput.dataset.bound = 'true';
        }
        
        // 綁定清除按鈕
        const clearBtn = document.getElementById('clear-filters');
        if (clearBtn && !clearBtn.dataset.bound) {
            clearBtn.addEventListener('click', () => {
                activeFilters = { keyword: '', filter_1: null, filter_2: null, filter_3: null };
                if(searchInput) searchInput.value = '';
                document.querySelectorAll('#dynamic-filter-container select').forEach(select => {
                    select.selectedIndex = 0;
                });
                renderProducts();
            });
            clearBtn.dataset.bound = 'true';
        }

    } catch (error) {
        console.error('初始化產品型錄失敗:', error);
        container.innerHTML = `<p style="color: var(--color-danger);">讀取資料失敗。</p>`;
    }
}

function setupUIControls(features, terms) {
    const filterControls = document.getElementById('filter-controls');
    const searchInput = document.getElementById('keyword-search');
    const dynamicFilters = document.getElementById('dynamic-filter-container'); 
    const clearBtn = document.getElementById('clear-filters');
    const viewControls = document.getElementById('product-view-controls');
    const layoutSwitcher = document.querySelector('.layout-switcher');
    const gridBtn = document.getElementById('view-grid-btn');
    const listBtn = document.getElementById('view-list-btn');
    const sortButton = document.getElementById('price-sort-btn');

    if (filterControls) {
        const showFilters = features.PRODUCT_SHOW_FILTERS !== false;
        const showSearch = features.PRODUCT_SHOW_SEARCH !== false;

        if (showFilters || showSearch) {
            filterControls.style.display = 'block';
            if (searchInput) {
                searchInput.style.display = showSearch ? 'block' : 'none';
                if (terms.PRODUCT_NAME) searchInput.placeholder = `搜尋${terms.PRODUCT_NAME}關鍵字...`;
            }
            if (dynamicFilters) dynamicFilters.style.display = showFilters ? 'block' : 'none';
            if (clearBtn) clearBtn.style.display = showFilters ? 'block' : 'none';
        } else {
            filterControls.style.display = 'none';
        }
    }

    if (viewControls) {
        viewControls.style.display = 'flex'; 
        if (layoutSwitcher) layoutSwitcher.style.display = features.ENABLE_PRODUCT_LAYOUT_SWITCH ? 'block' : 'none';
        if (sortButton) sortButton.style.display = features.PRODUCT_SHOW_SORTING !== false ? 'flex' : 'none';
        
        // 綁定切換按鈕 (只綁一次)
        if (gridBtn && !gridBtn.dataset.bound) {
            gridBtn.addEventListener('click', () => {
                productView.layout = 'grid';
                localStorage.setItem('product_layout_preference', 'grid');
                renderProducts();
            });
            gridBtn.dataset.bound = 'true';
        }
        if (listBtn && !listBtn.dataset.bound) {
            listBtn.addEventListener('click', () => {
                productView.layout = 'list';
                localStorage.setItem('product_layout_preference', 'list');
                renderProducts();
            });
            listBtn.dataset.bound = 'true';
        }
        if (sortButton && !sortButton.dataset.bound) {
            sortButton.addEventListener('click', () => {
                const current = productView.sort;
                productView.sort = (current === 'default') ? 'price_desc' : (current === 'price_desc' ? 'price_asc' : 'default');
                renderProducts();
            });
            sortButton.dataset.bound = 'true';
        }
    }
}

function populateFilters() {
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
            renderProducts();
        });
        container.appendChild(select);
    });
}

function renderProducts() {
    const container = document.getElementById('product-list-container');
    const sortButton = document.getElementById('price-sort-btn');
    if(!container) return;

    let filtered = state.allProducts.filter(p => p.is_visible === 1);

    // 關鍵字搜尋
    const keyword = activeFilters.keyword.toLowerCase().trim();
    if (keyword) { 
        filtered = filtered.filter(p => p.name.toLowerCase().includes(keyword)); 
    }

    // 動態篩選
    const filterDefinitions = state.config?.LOGIC?.PRODUCT_FILTERS || [];
    filterDefinitions.forEach(filterDef => {
        const key = filterDef.id;
        if (activeFilters[key]) {
            filtered = filtered.filter(p => p[key] === activeFilters[key]);
        }
    });

    // 排序
    switch (productView.sort) {
        case 'price_desc':
            filtered.sort((a, b) => (b.price_weekday || 0) - (a.price_weekday || 0));
            break;
        case 'price_asc':
            filtered.sort((a, b) => (a.price_weekday || 0) - (b.price_weekday || 0));
            break;
        default:
            filtered.sort((a, b) => a.display_order - b.display_order);
            break;
    }

    // 更新 UI 狀態
    container.className = productView.layout === 'grid' ? 'view-grid' : 'view-list';
    document.getElementById('view-grid-btn')?.classList.toggle('active', productView.layout === 'grid');
    document.getElementById('view-list-btn')?.classList.toggle('active', productView.layout === 'list');
    if(sortButton) sortButton.dataset.sort = productView.sort;

    if (filtered.length === 0) {
        const term = state.activeTemplate?.terms?.PRODUCT_NAME || '項目';
        container.innerHTML = `<p>找不到符合條件的${term}。</p>`;
        return;
    }

    // 渲染卡片
    container.innerHTML = filtered.map(product => {
        let priceDisplay = product.price_weekday != null ? `$${product.price_weekday}` : '洽詢';
        const isList = productView.layout === 'list';
        const images = JSON.parse(product.images || '[]');
        const imageUrl = images.length > 0 ? images[0] : 'https://placehold.co/400x300/F5F5F5/CCCCCC?text=No+Image';

        return `
            <div class="product-card" data-product-id="${product.product_id}">
                <img src="${imageUrl}" alt="${product.name}" class="product-image">
                <div class="product-info">
                    <div style="display:flex; justify-content:space-between; align-items:flex-start;">
                        <h3 class="product-title" style="margin:0;">${product.name}</h3>
                        <span style="color:var(--color-primary); font-weight:bold; font-size:1rem;">${priceDisplay}</span>
                    </div>
                    ${isList ? `<p style="font-size:0.85rem; color:#888; margin:5px 0 0 0;">${product.description ? product.description.substring(0, 40) + '...' : ''}</p>` : ''}
                </div>
            </div>
        `;
    }).join('');
    
    // 綁定點擊事件
    container.querySelectorAll('.product-card').forEach(card => {
        card.addEventListener('click', () => {
            const p = state.allProducts.find(x => x.product_id === card.dataset.productId);
            if (p) router.navigate('page-product-details', { product: p });
        });
    });
}

// 產品詳細頁渲染
export function renderDetails(product) {
    if (!product) return;
    const contentContainer = document.querySelector('#product-details-content');
    const detailsTitle = document.querySelector('.details-title');
    const gallery = document.querySelector('.details-gallery');
    
    if (!contentContainer || !detailsTitle || !gallery) return;

    detailsTitle.textContent = product.name;
    contentContainer.innerHTML = '';

    // 圖片處理
    const mainImage = gallery.querySelector('.details-image-main');
    const thumbnails = gallery.querySelector('.details-image-thumbnails');
    try {
        const images = JSON.parse(product.images || '[]');
        if (images.length > 0) {
            mainImage.src = images[0];
            thumbnails.innerHTML = images.map((img, i) => `<img src="${img}" class="${i===0?'active':''}" data-src="${img}">`).join('');
            gallery.style.display = 'block';
            
            // 縮圖點擊
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

    // 價格區塊
    const priceSection = document.createElement('div');
    priceSection.className = 'detail-field-section product-price-details';
    priceSection.innerHTML = `
        <h3>價格</h3>
        <p>
            平日: ${product.price_weekday !== null ? '$' + product.price_weekday : '洽詢'}<br>
            週五: ${product.price_friday !== null ? '$' + product.price_friday : '洽詢'}<br>
            週六: ${product.price_saturday !== null ? '$' + product.price_saturday : '洽詢'}
        </p>`;
    contentContainer.appendChild(priceSection);

    // 動態欄位與規格
    if (state.activeTemplate?.fields) {
        state.activeTemplate.fields.forEach(field => {
            if (['name', 'images', 'is_visible'].includes(field.key) || field.key.startsWith('price_')) return;
            
            const value = product[field.key];
            if (value && String(value).trim() !== '') {
                const section = document.createElement('div');
                section.className = 'detail-field-section';
                section.innerHTML = `<h3>${field.label}</h3><p>${String(value).replace(/\n/g, '<br>')}</p>`;
                contentContainer.appendChild(section);

                // 描述後插入規格
                if (field.key === 'description') {
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
            }
        });
    }
}