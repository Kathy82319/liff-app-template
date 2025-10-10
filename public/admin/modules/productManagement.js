// public/admin/modules/productManagement.js
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

    document.querySelectorAll('#edit-product-image-inputs .dynamic-input-group:not(:first-child)').forEach(el => el.remove());
    document.querySelectorAll('#edit-product-spec-inputs .dynamic-input-group:not(:first-child)').forEach(el => el.remove());

    const modalTitle = document.getElementById('modal-product-title');
    const idInput = document.getElementById('edit-product-id');
    const idDisplay = document.getElementById('edit-product-id-display');

    const filtersContainer = document.getElementById('edit-product-filters-container');
    filtersContainer.innerHTML = '';
    const filterDefinitions = window.CONFIG?.LOGIC?.PRODUCT_FILTERS || [];

    filterDefinitions.forEach(filterDef => {
        const formGroup = document.createElement('div');
        formGroup.className = 'form-group';
        const label = document.createElement('label');
        label.htmlFor = `edit-product-${filterDef.id}`;
        label.textContent = filterDef.name;
        const select = document.createElement('select');
        select.id = `edit-product-${filterDef.id}`;
        select.name = filterDef.id;
        select.add(new Option(`-- 請選擇${filterDef.name} --`, ''));
        filterDef.options.forEach(option => {
            select.add(new Option(option, option));
        });
        formGroup.append(label, select);
        filtersContainer.appendChild(formGroup);
    });

    if (product) {
        modalTitle.textContent = `編輯產品：${product.name}`;
        idInput.value = product.product_id;
        idDisplay.value = product.product_id;
        document.getElementById('edit-product-name').value = product.name;
        document.getElementById('edit-product-description').value = product.description || '';
        document.getElementById('edit-product-category').value = product.category || '';
        document.getElementById('edit-product-is-visible').checked = !!product.is_visible;
        document.getElementById('edit-product-price').value = product.price ?? '';
        document.getElementById('edit-product-stock-quantity').value = product.stock_quantity ?? '';
        document.getElementById('edit-product-stock-status').value = product.stock_status || '';

        filterDefinitions.forEach(filterDef => {
            const select = document.getElementById(`edit-product-${filterDef.id}`);
            if (select) {
                // 【錯誤修正】這裡使用 `product` 變數，而不是 `data`
                select.value = product[filterDef.id] || '';
            }
        });

        try {
            const images = JSON.parse(product.images || '[]');
            const imageInputsContainer = document.getElementById('edit-product-image-inputs');
            const firstImageInput = imageInputsContainer.querySelector('input');
            if (images.length > 0) firstImageInput.value = images[0];
            for (let i = 1; i < images.length; i++) {
                addImageInputField(images[i]);
            }
        } catch (e) { console.error("解析圖片JSON失敗:", e); }

        const specInputsContainer = document.getElementById('edit-product-spec-inputs');
        const firstSpecGroup = specInputsContainer.querySelector('.spec-input-group');
        let specCount = 0;
        for (let i = 1; i <= 5; i++) {
            const specName = product[`spec_${i}_name`];
            const specValue = product[`spec_${i}_value`];
            if (specName || specValue) {
                specCount++;
                if (specCount === 1) {
                    firstSpecGroup.querySelector('[name="spec_name"]').value = specName || '';
                    firstSpecGroup.querySelector('[name="spec_value"]').value = specValue || '';
                } else {
                    addSpecInputField(specName, specValue);
                }
            }
        }
    } else {
        modalTitle.textContent = '新增產品/服務';
        idInput.value = '';
        idDisplay.value = '(儲存後將自動生成)';
    }

    updateDynamicButtonsState();
    ui.showModal('#edit-product-modal');
}

async function handleFormSubmit(event) {
    event.preventDefault();
    const id = document.getElementById('edit-product-id').value;
    const name = document.getElementById('edit-product-name').value;
    const isCreating = !id;

    if (!name || name.trim() === '') {
        alert('「產品/服務名稱」為必填欄位！');
        return;
    }

    const images = Array.from(document.querySelectorAll('#edit-product-image-inputs input'))
        .map(input => input.value.trim())
        .filter(url => url);

    const stockQuantityValue = document.getElementById('edit-product-stock-quantity').value.trim();
    const stockStatusValue = document.getElementById('edit-product-stock-status').value.trim();
    const priceValue = document.getElementById('edit-product-price').value;

    let inventoryManagementType = 'none';
    if (stockQuantityValue !== '') {
        inventoryManagementType = 'quantity';
    } else if (stockStatusValue !== '') {
        inventoryManagementType = 'status';
    }

    const data = {
        name: name.trim(),
        description: document.getElementById('edit-product-description').value,
        category: document.getElementById('edit-product-category').value,
        is_visible: document.getElementById('edit-product-is-visible').checked,
        inventory_management_type: inventoryManagementType,
        stock_quantity: stockQuantityValue === '' ? null : Number(stockQuantityValue),
        stock_status: stockStatusValue === '' ? null : stockStatusValue,
        price: priceValue === '' ? null : Number(priceValue),
        images: JSON.stringify(images),
        price_type: 'simple',
        price_options: null
    };

    const filterDefinitions = window.CONFIG?.LOGIC?.PRODUCT_FILTERS || [];
    filterDefinitions.forEach(filterDef => {
        const select = document.getElementById(`edit-product-${filterDef.id}`);
        if (select) {
            data[filterDef.id] = select.value || null;
        }
    });
    for (let i = filterDefinitions.length + 1; i <= 3; i++) {
        data[`filter_${i}`] = null;
    }

    const specGroups = document.querySelectorAll('#edit-product-spec-inputs .spec-input-group');
    specGroups.forEach((group, index) => {
        if (index < 5) {
            const specIndex = index + 1;
            data[`spec_${specIndex}_name`] = group.querySelector('[name="spec_name"]').value.trim() || null;
            data[`spec_${specIndex}_value`] = group.querySelector('[name="spec_value"]').value.trim() || null;
        }
    });
    for (let i = specGroups.length + 1; i <= 5; i++) {
        data[`spec_${i}_name`] = null;
        data[`spec_${i}_value`] = null;
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

// --- 動態欄位輔助函式 ---
function addImageInputField(value = '') {
    const container = document.getElementById('edit-product-image-inputs');
    const count = container.children.length;
    if (count >= 5) return;

    const newGroup = document.createElement('div');
    newGroup.className = 'dynamic-input-group';
    newGroup.innerHTML = `
        <input type="url" placeholder="${count + 1}. 請貼上圖片網址" value="${value}">
        <button type="button" class="btn-remove-input">⊖</button>
    `;
    container.appendChild(newGroup);
    updateDynamicButtonsState();
}

function addSpecInputField(name = '', value = '') {
    const container = document.getElementById('edit-product-spec-inputs');
    const count = container.children.length;
    if (count >= 5) return;

    const newGroup = document.createElement('div');
    newGroup.className = 'spec-input-group dynamic-input-group';
    newGroup.innerHTML = `
        <input type="text" name="spec_name" placeholder="規格${count + 1}名稱" value="${name}">
        <input type="text" name="spec_value" placeholder="規格${count + 1}內容" value="${value}">
        <button type="button" class="btn-remove-input">⊖</button>
    `;
    container.appendChild(newGroup);
    updateDynamicButtonsState();
}

function updateDynamicButtonsState() {
    const imageCount = document.getElementById('edit-product-image-inputs').children.length;
    const specCount = document.getElementById('edit-product-spec-inputs').children.length;
    
    document.getElementById('add-image-input-btn').style.display = (imageCount < 5) ? 'block' : 'none';
    document.getElementById('add-spec-input-btn').style.display = (specCount < 5) ? 'block' : 'none';
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

async function handleBatchSetStock() {
    const selectedIds = Array.from(document.querySelectorAll('.product-checkbox:checked')).map(cb => cb.dataset.productId);
    if (selectedIds.length === 0) return alert('請至少選取一個項目！');

    const statusText = prompt('請輸入要為所有選取項目設定的庫存狀態文字：\n(例如：可預約、熱銷中、已售罄)', '可預約');

    if (statusText === null || statusText.trim() === '') {
        return;
    }

    if (!confirm(`確定要將 ${selectedIds.length} 個項目的庫存狀態設定為「${statusText}」嗎？`)) return;

    try {
        await api.batchUpdateStockStatus(selectedIds, statusText.trim());
        alert(`成功更新 ${selectedIds.length} 個項目！`);
        await init();
    } catch (error) {
        alert(`錯誤：${error.message}`);
    }
}

async function handleBatchDelete() {
const confirmed = await ui.confirm(`確定要刪除選取的 ${selectedIds.length} 個項目嗎？此操作無法復原。`);
if (!confirmed) return; // 如果使用者按了取消，就結束函式

try {
    await api.deleteProducts(selectedIds);
    ui.toast.success('刪除成功！'); // 同時換成 toast
    await init();
} catch (error) {
    ui.toast.error(`錯誤：${error.message}`); // 同時換成 toast
}
}

function updateSelectAllCheckboxState() {
    const selectAllCheckbox = document.getElementById('select-all-products');
    const allProductCheckboxes = document.querySelectorAll('.product-checkbox');
    if (!selectAllCheckbox || allProductCheckboxes.length === 0) return;

    const allChecked = Array.from(allProductCheckboxes).every(checkbox => checkbox.checked);
    const someChecked = Array.from(allProductCheckboxes).some(checkbox => checkbox.checked);

    if (allChecked) {
        selectAllCheckbox.checked = true;
        selectAllCheckbox.indeterminate = false;
    } else if (someChecked) {
        selectAllCheckbox.checked = false;
        selectAllCheckbox.indeterminate = true;
    } else {
        selectAllCheckbox.checked = false;
        selectAllCheckbox.indeterminate = false;
    }
}

// --- 事件監聽器 ---
function setupEventListeners() {
    const page = document.getElementById('page-inventory');
    if (!page || page.dataset.initialized === 'true') return;

    page.addEventListener('click', e => {
        const target = e.target;
        if (target.id === 'add-product-btn') openProductModal();
        if (target.id === 'download-csv-template-btn') handleDownloadCsvTemplate();
        
        const editButton = target.closest('.btn-edit-product');
        if (editButton) {
            const product = allProducts.find(p => p.product_id === editButton.dataset.productid);
            if (product) openProductModal(product);
        }
    });

    document.addEventListener('click', e => {
        const target = e.target;
        if (!document.getElementById('page-inventory').classList.contains('active')) return;

        if (target.id === 'batch-publish-btn') handleBatchUpdate(true);
        if (target.id === 'batch-unpublish-btn') handleBatchUpdate(false);
        if (target.id === 'batch-set-stock-btn') handleBatchSetStock();
        if (target.id === 'batch-delete-btn') handleBatchDelete();

        if (target.id === 'add-image-input-btn') addImageInputField();
        if (target.id === 'add-spec-input-btn') addSpecInputField();
        if (target.classList.contains('btn-remove-input')) {
            const groupToRemove = target.closest('.dynamic-input-group');
            if (groupToRemove) {
                groupToRemove.remove();
                updateDynamicButtonsState();
            }
        }
    });

    const tbody = document.getElementById('product-list-tbody');
    if (tbody) {
        tbody.addEventListener('change', async (e) => {
            if (e.target.classList.contains('product-checkbox')) {
                updateBatchToolbarState();
                updateSelectAllCheckboxState();
            } else if (e.target.classList.contains('visibility-toggle')) {
                const productId = e.target.dataset.productId;
                const isVisible = e.target.checked;
                e.target.disabled = true;
                try {
                    await api.toggleProductVisibility(productId, isVisible);
                    const product = allProducts.find(p => p.product_id === productId);
                    if (product) product.is_visible = isVisible ? 1 : 0;
                } catch (error) {
                    alert(`更新失敗: ${error.message}`);
                    e.target.checked = !isVisible;
                } finally {
                    e.target.disabled = false;
                }
            }
        });
    }
    
    const selectAllCheckbox = document.getElementById('select-all-products');
    if (selectAllCheckbox) {
        selectAllCheckbox.addEventListener('change', (e) => {
            const isChecked = e.target.checked;
            document.querySelectorAll('.product-checkbox').forEach(checkbox => {
                checkbox.checked = isChecked;
            });
            updateBatchToolbarState();
        });
    }

    document.getElementById('product-search-input')?.addEventListener('input', applyProductFiltersAndRender);
    document.getElementById('csv-upload-input')?.addEventListener('change', handleCsvUpload);
    document.getElementById('edit-product-form')?.addEventListener('submit', handleFormSubmit);

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
        setupEventListeners();
    } catch (error) {
        console.error('初始化產品頁失敗:', error);
        tbody.innerHTML = `<tr><td colspan="7" style="color: red; text-align:center;">讀取失敗: ${error.message}</td></tr>`;
    }
};