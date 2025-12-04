// public/modules/pages/product.js
import { api } from '../api.js';
import { state } from '../state.js';
import { router } from '../router.js';

let productView = { layout: 'grid', sort: 'default' };
let activeFilters = { keyword: '', filter_1: null, filter_2: null, filter_3: null };

export async function init() {
    // 1. 讀取設定
    const productConfig = state.activeTemplate?.client_config?.products || {};
    const terms = state.activeTemplate?.terms || {};
    
    // 2. 設定預設檢視模式 (LocalStorage 優先，其次是 Config)
    productView.layout = localStorage.getItem('product_layout_preference') || productConfig.view_mode || 'grid';
    productView.sort = localStorage.getItem('product_sort_preference') || 'default';

    const container = document.getElementById('product-list-container');
    if (!container) return;
    container.innerHTML = `<p>載入中...</p>`; 

    // 3. 設定頁面標題
    const pageTitle = document.querySelector('#page-products .page-main-title'); 
    if(pageTitle) { 
        // 優先使用 Config 設定的標題，若無則使用 Terms
        pageTitle.textContent = productConfig.title || terms.PRODUCT_CATALOG_TITLE || '產品型錄';
    }

    const features = state.activeTemplate?.features || {};
    setupUIControls(features, terms);

    try {
        if (state.allProducts.length === 0) {
            state.allProducts = await api.getProducts();
        }
        if (state.config?.LOGIC?.PRODUCT_FILTERS) {
             populateFilters(); 
        }
        renderProducts();
        
        const searchInput = document.getElementById('keyword-search');
        if (searchInput && !searchInput.dataset.bound) {
            searchInput.addEventListener('input', e => { 
                activeFilters.keyword = e.target.value; 
                renderProducts(); 
            });
            searchInput.dataset.bound = 'true';
        }
        
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
                if (current === 'default') productView.sort = 'price_desc';
                else if (current === 'price_desc') productView.sort = 'price_asc';
                else productView.sort = 'default';
                
                localStorage.setItem('product_sort_preference', productView.sort);
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
    const keyword = activeFilters.keyword.toLowerCase().trim();
    if (keyword) { 
        filtered = filtered.filter(p => p.name.toLowerCase().includes(keyword)); 
    }
    const filterDefinitions = state.config?.LOGIC?.PRODUCT_FILTERS || [];
    filterDefinitions.forEach(filterDef => {
        const key = filterDef.id;
        if (activeFilters[key]) {
            filtered = filtered.filter(p => p[key] === activeFilters[key]);
        }
    });

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
        const term = state.activeTemplate?.terms?.PRODUCT_NAME || '項目';
        container.innerHTML = `<p>找不到符合條件的${term}。</p>`;
        return;
    }

    // 1. 讀取 Config
    const productConfig = state.activeTemplate?.client_config?.products || {};
    const showPrice = productConfig.show_price !== false; 
    const showStock = productConfig.show_stock !== false; // 預設顯示庫存

    container.innerHTML = filtered.map(product => {
        let priceDisplay = '';
        if (showPrice) {
            priceDisplay = product.price_weekday != null ? `$${product.price_weekday}` : '洽詢';
        }

        // 2. 庫存顯示邏輯
        let stockHtml = '';
        if (showStock) {
            // 如果是 Quantity 模式，顯示數字
            if (product.inventory_management_type === 'quantity') {
                const qty = product.stock_quantity || 0;
                stockHtml = qty > 0 
                    ? `<span style="font-size:0.8rem; color: #28a745; background: #e6f4ea; padding: 2px 6px; border-radius: 4px;">剩餘 ${qty}</span>`
                    : `<span style="font-size:0.8rem; color: #dc3545; background: #ffebee; padding: 2px 6px; border-radius: 4px;">已售完</span>`;
            } 
            // 如果是 Status 模式，顯示文字
            else if (product.inventory_management_type === 'status') {
                stockHtml = `<span style="font-size:0.8rem; color: #17a2b8; background: #e0f7fa; padding: 2px 6px; border-radius: 4px;">${product.stock_status || '在庫'}</span>`;
            }
            // 如果是 DateBased 模式 (民宿)，通常不直接顯示庫存，因為要選日期
        }

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
                    
                    <div style="margin-top: 5px; display: flex; align-items: center; justify-content: space-between;">
                        ${isList ? `<p style="font-size:0.85rem; color:#888; margin:0;">${product.description ? product.description.substring(0, 40) + '...' : ''}</p>` : '<span></span>'}
                        ${stockHtml}
                    </div>
                </div>
            </div>
        `;
    }).join('');
    
    container.querySelectorAll('.product-card').forEach(card => {
        card.addEventListener('click', () => {
            const p = state.allProducts.find(x => x.product_id === card.dataset.productId);
            if (p) router.navigate('page-product-details', { product: p });
        });
    });
}

export function renderDetails(product) {
    if (!product) return;
    const contentContainer = document.querySelector('#product-details-content');
    const detailsTitle = document.querySelector('.details-title');
    const gallery = document.querySelector('.details-gallery');
    
    if (!contentContainer || !detailsTitle || !gallery) return;

    detailsTitle.textContent = product.name;
    contentContainer.innerHTML = '';

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

    // 1. 讀取 Config 決定價格顯示
    const productConfig = state.activeTemplate?.client_config?.products || {};
    const showPrice = productConfig.show_price !== false;

    if (showPrice) {
        const priceSection = document.createElement('div');
        priceSection.className = 'detail-field-section product-price-details';
        // 判斷是否為複雜價格 (Complex) - 用 price_weekday/friday/saturday 判斷
        const hasWeekendPrice = product.price_friday !== null || product.price_saturday !== null;
        
        let priceHtml = '';
        if (hasWeekendPrice) {
            priceHtml = `
                <p>
                    平日: ${product.price_weekday !== null ? '$' + product.price_weekday : '洽詢'}<br>
                    週五: ${product.price_friday !== null ? '$' + product.price_friday : '洽詢'}<br>
                    週六: ${product.price_saturday !== null ? '$' + product.price_saturday : '洽詢'}
                </p>`;
        } else {
            priceHtml = `<p class="product-price" style="font-size:1.5rem; color:var(--color-primary); font-weight:bold;">${product.price_weekday !== null ? '$' + product.price_weekday : '洽詢'}</p>`;
        }

        priceSection.innerHTML = `<h3>價格</h3>${priceHtml}`;
        contentContainer.appendChild(priceSection);
    }

    if (state.activeTemplate?.fields) {
        state.activeTemplate.fields.forEach(field => {
            if (['name', 'images', 'is_visible'].includes(field.key) || field.key.startsWith('price_')) return;
            
            const value = product[field.key];
            if (value && String(value).trim() !== '') {
                const section = document.createElement('div');
                section.className = 'detail-field-section';
                section.innerHTML = `<h3>${field.label}</h3><p>${String(value).replace(/\n/g, '<br>')}</p>`;
                contentContainer.appendChild(section);

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