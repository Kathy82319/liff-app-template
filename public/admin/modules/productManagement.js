// public/admin/modules/productManagement.js (修正後)
import { api } from '../api.js';
import { ui } from '../ui.js';

let allProducts = [];
let sortableProducts = null;

// 渲染產品列表
function renderProductList(products) {
    const productListTbody = document.getElementById('product-list-tbody');
    if (!productListTbody) return;

    productListTbody.innerHTML = '';
    products.forEach(p => {
        const row = productListTbody.insertRow();
        row.className = 'draggable-row';
        row.dataset.productId = p.product_id;

        let stockDisplay = '無管理';
        if (p.inventory_management_type === 'quantity') stockDisplay = `數量: ${p.stock_quantity ?? 'N/A'}`;
        else if (p.inventory_management_type === 'status') stockDisplay = `狀態: ${p.stock_status ?? 'N/A'}`;

        let priceDisplay = '未設定';
        if (p.price_type === 'simple' && p.price != null) {
            priceDisplay = `$${p.price}`;
        }

        row.innerHTML = `
            <td><input type="checkbox" class="product-checkbox" data-product-id="${p.product_id}"></td>
            <td class="drag-handle-cell"><span class="drag-handle">⠿</span> ${p.display_order}</td>
            <td class="compound-cell" style="text-align: left;">
                <div class="main-info">${p.name}</div>
                <div class="sub-info">ID: ${p.product_id}</div>
                <div class="sub-info">分類: ${p.category || '未分類'}</div>
            </td>
            <td>${stockDisplay}</td>
            <td>${priceDisplay}</td>
            <td>
                <label class="switch">
                    <input type="checkbox" class="visibility-toggle" data-product-id="${p.product_id}" ${p.is_visible ? 'checked' : ''}>
                    <span class="slider"></span>
                </label>
            </td>
            <td class="actions-cell">
                <button class="action-btn btn-edit-product" data-productid="${p.product_id}" style="background-color: var(--color-warning); color: #000;">編輯</button>
            </td>
        `;
    });
}

function applyProductFiltersAndRender() {
    const productSearchInput = document.getElementById('product-search-input');
    const searchTerm = productSearchInput ? productSearchInput.value.toLowerCase().trim() : '';
    let filtered = searchTerm
        ? allProducts.filter(p => (p.name || '').toLowerCase().includes(searchTerm))
        : [...allProducts];
    renderProductList(filtered);
}

function initializeProductDragAndDrop() {
    const productListTbody = document.getElementById('product-list-tbody');
    if (sortableProducts) sortableProducts.destroy();
    if (productListTbody) {
        sortableProducts = new Sortable(productListTbody, {
            animation: 150,
            handle: '.drag-handle',
            onEnd: async (evt) => {
                const orderedIds = Array.from(productListTbody.children).map(row => row.dataset.productId);
                try {
                    await api.updateProductOrder(orderedIds);
                    orderedIds.forEach((id, index) => {
                       const product = allProducts.find(p => p.product_id === id);
                       if(product) product.display_order = index + 1;
                    });
                    allProducts.sort((a, b) => a.display_order - b.display_order);
                    applyProductFiltersAndRender();
                } catch (error) {
                    alert(error.message);
                    init();
                }
            }
        });
    }
}

function openEditProductModal(productId) {
    const product = allProducts.find(p => p.product_id == productId);
    if (!product) return;

    const form = document.getElementById('edit-product-form');
    form.reset();
    
    document.getElementById('modal-product-title').textContent = `編輯產品：${product.name}`;
    
    document.getElementById('edit-product-id').value = product.product_id;
    document.getElementById('edit-product-id-display').value = product.product_id;
    document.getElementById('edit-product-name').value = product.name;
    document.getElementById('edit-product-description').value = product.description || '';
    document.getElementById('edit-product-category').value = product.category || '';
    document.getElementById('edit-product-tags').value = product.tags || '';
    document.getElementById('edit-product-is-visible').checked = !!product.is_visible;
    document.getElementById('edit-product-price').value = product.price || '';

    const inventoryTypeSelect = document.getElementById('edit-product-inventory-type');
    const quantityGroup = document.getElementById('stock-quantity-group');
    const statusGroup = document.getElementById('stock-status-group');
    inventoryTypeSelect.value = product.inventory_management_type || 'none';
    quantityGroup.style.display = (inventoryTypeSelect.value === 'quantity') ? 'block' : 'none';
    statusGroup.style.display = (inventoryTypeSelect.value === 'status') ? 'block' : 'none';
    document.getElementById('edit-product-stock-quantity').value = product.stock_quantity || 0;
    document.getElementById('edit-product-stock-status').value = product.stock_status || '';

    try {
        const images = JSON.parse(product.images || '[]');
        for(let i = 1; i <= 5; i++){
            document.getElementById(`edit-product-image-${i}`).value = images[i-1] || '';
        }
    } catch(e) { console.error("解析圖片JSON失敗:", e); }

    for (let i = 1; i <= 5; i++) {
        document.getElementById(`edit-spec-${i}-name`).value = product[`spec_${i}_name`] || '';
        document.getElementById(`edit-spec-${i}-value`).value = product[`spec_${i}_value`] || '';
    }

    ui.showModal('#edit-product-modal');
}

function updateBatchToolbarState() {
    const toolbar = document.getElementById('batch-actions-toolbar');
    const countSpan = document.getElementById('batch-selected-count');
    const selectedCheckboxes = document.querySelectorAll('.product-checkbox:checked');

    if (toolbar && countSpan) {
        if (selectedCheckboxes.length > 0) {
            toolbar.classList.add('visible');
            countSpan.textContent = `已選取 ${selectedCheckboxes.length} 項`;
        } else {
            toolbar.classList.remove('visible');
        }
    }
}

function setupEventListeners() {
    const productSearchInput = document.getElementById('product-search-input');
    if (productSearchInput) productSearchInput.oninput = applyProductFiltersAndRender;

    const productListTbody = document.getElementById('product-list-tbody');
    if (productListTbody) {
        productListTbody.onchange = async (e) => {
            if (e.target.classList.contains('product-checkbox')) {
                updateBatchToolbarState();
                return;
            }
            if (e.target.classList.contains('visibility-toggle')) {
                const productId = e.target.dataset.productId;
                const isVisible = e.target.checked;
                e.target.disabled = true;
                try {
                    await api.toggleProductVisibility(productId, isVisible);
                    const product = allProducts.find(p => p.product_id === productId);
                    if(product) product.is_visible = isVisible ? 1 : 0;
                } catch(error) {
                    alert(`更新失敗: ${error.message}`);
                    e.target.checked = !isVisible;
                } finally {
                    e.target.disabled = false;
                }
            }
        };

        productListTbody.onclick = (e) => {
            const editButton = e.target.closest('.btn-edit-product');
            if (editButton) {
                openEditProductModal(editButton.dataset.productid);
            }
        };
    }

    const editProductForm = document.getElementById('edit-product-form');
    if (editProductForm) {
        editProductForm.onsubmit = async (e) => {
            e.preventDefault();
            
            const images = [];
            for(let i = 1; i <= 5; i++){
                const imgUrl = document.getElementById(`edit-product-image-${i}`).value.trim();
                if(imgUrl) images.push(imgUrl);
            }
            
            // 【關鍵修正】將 'productId' 改為 'product_id'
            const updatedData = {
                product_id: document.getElementById('edit-product-id').value,
                name: document.getElementById('edit-product-name').value,
                description: document.getElementById('edit-product-description').value,
                category: document.getElementById('edit-product-category').value,
                tags: document.getElementById('edit-product-tags').value,
                is_visible: document.getElementById('edit-product-is-visible').checked,
                inventory_management_type: document.getElementById('edit-product-inventory-type').value,
                stock_quantity: document.getElementById('edit-product-stock-quantity').value,
                stock_status: document.getElementById('edit-product-stock-status').value,
                price: document.getElementById('edit-product-price').value,
                images: JSON.stringify(images),
            };

            for(let i = 1; i <= 5; i++){
                updatedData[`spec_${i}_name`] = document.getElementById(`edit-spec-${i}-name`).value;
                updatedData[`spec_${i}_value`] = document.getElementById(`edit-spec-${i}-value`).value;
            }

            try {
                await api.updateProductDetails(updatedData);
                ui.hideModal('#edit-product-modal');
                await init(); // 重新載入以顯示更新後的資料
            } catch (error) {
                alert(`錯誤：${error.message}`);
            }
        };
    }

    const inventoryTypeSelect = document.getElementById('edit-product-inventory-type');
    if(inventoryTypeSelect) {
        inventoryTypeSelect.onchange = (e) => {
            document.getElementById('stock-quantity-group').style.display = (e.target.value === 'quantity') ? 'block' : 'none';
            document.getElementById('stock-status-group').style.display = (e.target.value === 'status') ? 'block' : 'none';
        };
    }
    
    const handleBatchUpdate = async (isVisible) => {
        const selectedIds = Array.from(document.querySelectorAll('.product-checkbox:checked')).map(cb => cb.dataset.productId);
        if (selectedIds.length === 0) return alert('請至少選取一個項目！');
        
        try {
            await api.batchUpdateProducts(selectedIds, isVisible);
            alert(`成功更新 ${selectedIds.length} 個項目！`);
            await init(); // 重新載入
        } catch (error) {
            alert(`錯誤：${error.message}`);
        }
    };
    const publishBtn = document.getElementById('batch-publish-btn');
    const unpublishBtn = document.getElementById('batch-unpublish-btn');
    if (publishBtn) publishBtn.onclick = () => handleBatchUpdate(true);
    if (unpublishBtn) unpublishBtn.onclick = () => handleBatchUpdate(false);
}

export const init = async () => {
    const productListTbody = document.getElementById('product-list-tbody');
    if (!productListTbody) return;

    productListTbody.innerHTML = '<tr><td colspan="7" style="text-align: center;">正在載入產品資料...</td></tr>';
    
    try {
        allProducts = await api.getProducts();
        applyProductFiltersAndRender();
        initializeProductDragAndDrop();
        // 確保事件只綁定一次
        if (!document.getElementById('page-inventory').dataset.initialized) {
            setupEventListeners();
            document.getElementById('page-inventory').dataset.initialized = 'true';
        }
    } catch (error) {
        console.error('獲取產品列表失敗:', error);
        productListTbody.innerHTML = `<tr><td colspan="7" style="color: red; text-align: center;">讀取產品資料失敗: ${error.message}</td></tr>`;
    }
};