// public/admin/modules/productManagement.js (最終完整版)
import { api } from '../api.js';
import { ui } from '../ui.js';

let allProducts = [];
let sortableProducts = null;

// --- 渲染與篩選函式 ---
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
        if (p.price_type === 'simple' && p.price != null) priceDisplay = `$${p.price}`;
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
            <td><label class="switch"><input type="checkbox" class="visibility-toggle" data-product-id="${p.product_id}" ${p.is_visible ? 'checked' : ''}><span class="slider"></span></label></td>
            <td class="actions-cell"><button class="action-btn btn-edit-product" data-productid="${p.product_id}" style="background-color: var(--color-warning); color: #000;">編輯</button></td>
        `;
    });
}

function applyProductFiltersAndRender() {
    const searchInput = document.getElementById('product-search-input');
    const searchTerm = searchInput ? searchInput.value.toLowerCase().trim() : '';
    const filtered = searchTerm ? allProducts.filter(p => (p.name || '').toLowerCase().includes(searchTerm)) : [...allProducts];
    renderProductList(filtered);
}

function initializeProductDragAndDrop() {
    const tbody = document.getElementById('product-list-tbody');
    if (sortableProducts) sortableProducts.destroy();
    if (tbody) {
        sortableProducts = new Sortable(tbody, {
            animation: 150, handle: '.drag-handle',
            onEnd: async (evt) => {
                const orderedIds = Array.from(tbody.children).map(row => row.dataset.productId);
                try {
                    await api.updateProductOrder(orderedIds);
                    orderedIds.forEach((id, index) => {
                       const product = allProducts.find(p => p.product_id === id);
                       if(product) product.display_order = index + 1;
                    });
                    allProducts.sort((a, b) => a.display_order - b.display_order);
                    applyProductFiltersAndRender();
                } catch (error) { alert(error.message); init(); }
            }
        });
    }
}

// --- CSV 相關功能 ---
function handleDownloadCsvTemplate() {
    const headers = ["產品名稱", "分類", "價格", "詳細介紹", "標籤(逗號分隔)", "是否上架(TRUE/FALSE)"];
    const csvContent = "data:text/csv;charset=utf-8,\uFEFF" + headers.join(",");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", "product_template.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

function handleCsvUpload(event) {
    const file = event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (e) => {
        const text = e.target.result;
        const lines = text.split(/\r\n|\n/).filter(line => line.trim() !== '');
        if (lines.length < 2) return alert('CSV 檔案中沒有可匯入的資料。');

        const headers = lines[0].split(',').map(h => h.trim().replace(/"/g, ''));
        const data = lines.slice(1).map(line => {
            const values = line.split(',');
            const obj = {};
            headers.forEach((header, index) => {
                obj[header] = values[index] ? values[index].trim().replace(/"/g, '') : "";
            });
            return obj;
        });

        if (!confirm(`您準備從 CSV 檔案匯入 ${data.length} 筆產品資料，確定嗎？`)) {
            event.target.value = '';
            return;
        }
        try {
            // 注意：這裡假設 api.js 中有名為 bulkCreateProducts 的 API 函式
            await api.bulkCreateProducts({ products: data });
            alert('匯入成功！');
            await init();
        } catch (error) {
            alert(`匯入失敗：${error.message}`);
        } finally {
             event.target.value = '';
        }
    };
    reader.readAsText(file, 'UTF-8');
}


// --- Modal (彈窗) 相關函式 ---
function openProductModal(product = null) {
    const form = document.getElementById('edit-product-form');
    form.reset();
    
    const modalTitle = document.getElementById('modal-product-title');
    const idInput = document.getElementById('edit-product-id');
    const idDisplay = document.getElementById('edit-product-id-display');
    const inventoryTypeSelect = document.getElementById('edit-product-inventory-type');

    if (product) { // 編輯模式
        modalTitle.textContent = `編輯產品：${product.name}`;
        idInput.value = product.product_id;
        idDisplay.value = product.product_id;
        document.getElementById('edit-product-name').value = product.name;
        document.getElementById('edit-product-description').value = product.description || '';
        document.getElementById('edit-product-category').value = product.category || '';
        document.getElementById('edit-product-tags').value = product.tags || '';
        document.getElementById('edit-product-is-visible').checked = !!product.is_visible;
        document.getElementById('edit-product-price').value = product.price || '';
        inventoryTypeSelect.value = product.inventory_management_type || 'none';
        document.getElementById('edit-product-stock-quantity').value = product.stock_quantity || 0;
        document.getElementById('edit-product-stock-status').value = product.stock_status || '';
        try {
            const images = JSON.parse(product.images || '[]');
            for(let i=1; i<=5; i++) document.getElementById(`edit-product-image-${i}`).value = images[i-1] || '';
        } catch(e) {}
        for(let i=1; i<=5; i++) {
            document.getElementById(`edit-spec-${i}-name`).value = product[`spec_${i}_name`] || '';
            document.getElementById(`edit-spec-${i}-value`).value = product[`spec_${i}_value`] || '';
        }
    } else { // 新增模式
        modalTitle.textContent = '新增產品/服務';
        idInput.value = '';
        idDisplay.value = '(儲存後將自動生成)';
        inventoryTypeSelect.value = 'none';
    }
    inventoryTypeSelect.dispatchEvent(new Event('change'));
    ui.showModal('#edit-product-modal');
}

// 【*** 核心修正 ***】
async function handleFormSubmit(event) {
    event.preventDefault();
    const id = document.getElementById('edit-product-id').value;
    const name = document.getElementById('edit-product-name').value;
    const isCreating = !id;

    // 檢查產品名稱是否為空
    if (!name || name.trim() === '') {
        alert('「產品/服務名稱」為必填欄位！');
        return; // 中斷函式執行
    }
    
    const images = [];
    for(let i = 1; i <= 5; i++) {
        const imgUrl = document.getElementById(`edit-product-image-${i}`).value.trim();
        if(imgUrl) images.push(imgUrl);
    }

    const data = {
        name: name.trim(), // 使用已驗證的 name
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
    for(let i = 1; i <= 5; i++) {
        data[`spec_${i}_name`] = document.getElementById(`edit-spec-${i}-name`).value;
        data[`spec_${i}_value`] = document.getElementById(`edit-spec-${i}-value`).value;
    }

    try {
        if (isCreating) {
            await api.createProduct(data);
        } else {
            data.product_id = id;
            await api.updateProductDetails(data);
        }
        ui.hideModal('#edit-product-modal');
        await init();
        alert('儲存成功！');
    } catch (error) {
        alert(`儲存失敗：${error.message}`);
    }
}


// --- 批次操作 ---
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

async function handleBatchUpdate(isVisible) {
    const selectedIds = Array.from(document.querySelectorAll('.product-checkbox:checked')).map(cb => cb.dataset.productId);
    if (selectedIds.length === 0) return alert('請至少選取一個項目！');
    try {
        await api.batchUpdateProducts(selectedIds, isVisible);
        alert(`成功更新 ${selectedIds.length} 個項目！`);
        await init();
    } catch (error) { alert(`錯誤：${error.message}`); }
}

async function handleBatchDelete() {
    const selectedIds = Array.from(document.querySelectorAll('.product-checkbox:checked')).map(cb => cb.dataset.productId);
    if (selectedIds.length === 0) return alert('請至少選取一個項目！');
    if (!confirm(`確定要刪除選取的 ${selectedIds.length} 個項目嗎？此操作無法復原。`)) return;
    try {
        await api.deleteProducts(selectedIds);
        alert('刪除成功！');
        await init();
    } catch (error) {
        alert(`錯誤：${error.message}`);
    }
}

// --- 事件監聽器 ---
function setupEventListeners() {
    const page = document.getElementById('page-inventory');
    if (!page) return;

    // 防止重複綁定
    if (page.dataset.initialized === 'true') return;

    page.addEventListener('click', e => {
        if (e.target.id === 'add-product-btn') openProductModal();
        if (e.target.id === 'download-csv-template-btn') handleDownloadCsvTemplate();
        if (e.target.id === 'batch-publish-btn') handleBatchUpdate(true);
        if (e.target.id === 'batch-unpublish-btn') handleBatchUpdate(false);
        if (e.target.id === 'batch-delete-btn') handleBatchDelete();
        const editButton = e.target.closest('.btn-edit-product');
        if (editButton) {
            const product = allProducts.find(p => p.product_id === editButton.dataset.productid);
            if(product) openProductModal(product);
        }
    });

    const tbody = document.getElementById('product-list-tbody');
    if (tbody) {
        tbody.addEventListener('change', async (e) => {
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
        });
    }
    
    document.getElementById('product-search-input')?.addEventListener('input', applyProductFiltersAndRender);
    document.getElementById('csv-upload-input')?.addEventListener('change', handleCsvUpload);
    document.getElementById('edit-product-form')?.addEventListener('submit', handleFormSubmit);

    const inventoryTypeSelect = document.getElementById('edit-product-inventory-type');
    if(inventoryTypeSelect) {
        inventoryTypeSelect.addEventListener('change', (e) => {
            document.getElementById('stock-quantity-group').style.display = (e.target.value === 'quantity') ? 'block' : 'none';
            document.getElementById('stock-status-group').style.display = (e.target.value === 'status') ? 'block' : 'none';
        });
    }

    page.dataset.initialized = 'true';
}

// --- 初始化 ---
export const init = async () => {
    const tbody = document.getElementById('product-list-tbody');
    if (!tbody) return;
    tbody.innerHTML = '<tr><td colspan="7" style="text-align: center;">正在載入...</td></tr>';
    try {
        allProducts = await api.getProducts();
        applyProductFiltersAndRender();
        initializeProductDragAndDrop();
        setupEventListeners(); // 每次初始化都確保事件監聽器是最新的
    } catch (error) {
        console.error('初始化產品頁失敗:', error);
        tbody.innerHTML = `<tr><td colspan="7" style="color: red; text-align:center;">讀取失敗: ${error.message}</td></tr>`;
    }
};