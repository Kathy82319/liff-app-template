// public/admin/modules/productManagement.js

import { api } from '../api.js';
import { ui } from '../ui.js';

let allProducts = [];
let sortableProducts = null;
let activeTemplate = null; //用來存放當前啟用的樣板藍圖



// 建立一個可以從外部呼叫的函式來隱藏工具列
export function hideBatchToolbar() {
    const toolbar = document.getElementById('batch-actions-toolbar');
    if (toolbar) {
        toolbar.classList.remove('visible');
    }
    // 同時取消全選的勾選狀態
    const selectAllCheckbox = document.getElementById('select-all-products');
    if (selectAllCheckbox) {
        selectAllCheckbox.checked = false;
        selectAllCheckbox.indeterminate = false;
    }
}
async function handleImageUpload(file, inputElement, buttonElement) {
    ui.toast.error('圖片上傳服務尚未設定，請聯繫系統管理員。');
    /* ... (上傳邏輯註解) ... */
}
function createFormField(field) { /* ... (此函式內容不變) ... */
    const formGroup = document.createElement('div');
    formGroup.className = 'form-group';
    const label = document.createElement('label');
    label.htmlFor = `edit-product-${field.key}`;
    label.textContent = field.label + (field.required ? ' (必填)' : '');
    formGroup.appendChild(label);

    if (field.type === 'image_url') { // 處理代表圖片
        const fileInputId = `image-upload-${field.key}-${Date.now()}`;
        const imageGroup = document.createElement('div');
        imageGroup.className = 'dynamic-input-group';
        imageGroup.style.cssText = 'display: flex; align-items: center; gap: 10px;';
        imageGroup.innerHTML = `
            <input type="url" id="edit-product-${field.key}" name="${field.key}" placeholder="請貼上網址或點擊右側上傳" style="flex-grow: 1;">
            <input type="file" id="${fileInputId}" accept="image/*" style="display: none;">
            <label for="${fileInputId}" class="action-btn btn-upload-image" style="background-color: var(--color-info); cursor: pointer; flex-shrink: 0;">上傳</label>
        `;
        const fileInput = imageGroup.querySelector('input[type="file"]');
        const urlInput = imageGroup.querySelector('input[type="url"]');
        const uploadButton = imageGroup.querySelector('.btn-upload-image');
        fileInput.addEventListener('change', (e) => {
            if (e.target.files[0]) handleImageUpload(e.target.files[0], urlInput, uploadButton);
        });
        formGroup.appendChild(imageGroup);
    } else { // 其他欄位類型
        let inputElement;
        switch (field.type) {
            case 'textarea':
                inputElement = document.createElement('textarea');
                inputElement.rows = 5;
                break;
            case 'boolean':
                const switchWrapper = document.createElement('div');
                switchWrapper.style.marginTop = '10px';
                inputElement = document.createElement('input');
                inputElement.type = 'checkbox';
                const switchLabel = document.createElement('label');
                switchLabel.className = 'switch';
                const slider = document.createElement('span');
                slider.className = 'slider';
                switchLabel.append(inputElement, slider);
                switchWrapper.appendChild(switchLabel);
                formGroup.appendChild(switchWrapper);
                break;
            default:
                inputElement = document.createElement('input');
                inputElement.type = field.type;
                if (field.placeholder) inputElement.placeholder = field.placeholder;
                break;
        }
        if (field.type !== 'boolean') {
            formGroup.appendChild(inputElement);
        }
        inputElement.id = `edit-product-${field.key}`;
        inputElement.name = field.key;
    }
    return formGroup;
}
function addImageInputField(container, value = '') { /* ... (此函式內容不變) ... */
    const count = container.children.length;
    if (count >= 5) return;
    const newGroup = document.createElement('div');
    newGroup.className = 'dynamic-input-group';
    newGroup.style.cssText = 'display: flex; align-items: center; gap: 10px; margin-bottom: 8px;';
    const fileInputId = `image-upload-input-${Date.now()}`;
    newGroup.innerHTML = `
        <input type="url" name="images" placeholder="${count + 1}. 請貼上網址或點擊右側上傳" value="${value}" style="flex-grow: 1;">
        <input type="file" id="${fileInputId}" class="image-upload-input" accept="image/*" style="display: none;">
        <label for="${fileInputId}" class="action-btn btn-upload-image" style="background-color: var(--color-info); cursor: pointer; flex-shrink: 0;">上傳</label>
        <button type="button" class="btn-remove-input" style="flex-shrink: 0;">⊖</button>
    `;
    container.appendChild(newGroup);
    const fileInput = newGroup.querySelector('.image-upload-input');
    const urlInput = newGroup.querySelector('input[name="images"]');
    const uploadButton = newGroup.querySelector('.btn-upload-image');
    fileInput.addEventListener('change', (e) => {
        if (e.target.files[0]) handleImageUpload(e.target.files[0], urlInput, uploadButton);
    });
    updateDynamicButtonsState();
}
function addSpecInputField(container, name = '', value = '') { /* ... (此函式內容不變) ... */
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
function updateDynamicButtonsState() { /* ... (此函式內容不變) ... */
    const imageContainer = document.getElementById('edit-product-image-inputs');
    if (imageContainer) {
        document.getElementById('add-image-input-btn').style.display = (imageContainer.children.length < 5) ? 'block' : 'none';
    }
    const specContainer = document.getElementById('edit-product-spec-inputs');
    if (specContainer) {
       document.getElementById('add-spec-input-btn').style.display = (specContainer.children.length < 5) ? 'block' : 'none';
    }
}
function renderProductList(products) { /* ... (此函式內容不變) ... */
    const productListTbody = document.getElementById('product-list-tbody');
    const productListThead = document.querySelector('#page-inventory thead tr');
    if (!productListTbody || !productListThead) return;

    if (!activeTemplate || !activeTemplate.adminColumns || !Array.isArray(activeTemplate.adminColumns)) {
        console.error("renderProductList 錯誤： 無效的 activeTemplate 或 adminColumns。", activeTemplate);
        productListTbody.innerHTML = `<tr><td colspan="7" style="color: red; text-align:center;">渲染列表失敗：樣板設定錯誤。</td></tr>`;
        return;
    }

    let headerHTML = `
        <th style="width: 40px;"><input type="checkbox" id="select-all-products"></th>
        <th style="width: 50px;">順序</th>
    `;
    activeTemplate.adminColumns.forEach(col => {
        headerHTML += `<th>${col.label}</th>`;
    });
    headerHTML += `
        <th style="width: 80px;">上架</th>
        <th style="width: 80px;">操作</th>
    `;
    productListThead.innerHTML = headerHTML;

    productListTbody.innerHTML = '';
    products.forEach(p => {
        const row = productListTbody.insertRow();
        row.className = 'draggable-row';
        row.dataset.productId = p.product_id;
        let rowHTML = `
            <td><input type="checkbox" class="product-checkbox" data-product-id="${p.product_id}"></td>
            <td class="drag-handle-cell"><span class="drag-handle">⠿</span> ${p.display_order}</td>
        `;
        activeTemplate.adminColumns.forEach(col => {
            rowHTML += `<td>${p.hasOwnProperty(col.key) ? (p[col.key] || 'N/A') : 'N/A'}</td>`;
        });
        rowHTML += `
            <td><label class="switch"><input type="checkbox" class="visibility-toggle" data-product-id="${p.product_id}" ${p.is_visible ? 'checked' : ''}><span class="slider"></span></label></td>
            <td class="actions-cell"><button class="action-btn btn-edit-product" data-productid="${p.product_id}" style="background-color: var(--color-warning); color: #000;">編輯</button></td>
        `;
        row.innerHTML = rowHTML;
    });
}
function applyProductFiltersAndRender() { /* ... (此函式內容不變) ... */
    const searchInput = document.getElementById('product-search-input');
    const searchTerm = searchInput ? searchInput.value.toLowerCase().trim() : '';
    const visibilityFilter = document.querySelector('#inventory-visibility-filter .active')?.dataset.filter || 'all';
    const stockFilter = document.querySelector('#inventory-stock-filter .active')?.dataset.filter || 'all';

    let filtered = [...allProducts];

    if (visibilityFilter === 'visible') {
        filtered = filtered.filter(p => p.is_visible);
    } else if (visibilityFilter === 'hidden') {
        filtered = filtered.filter(p => !p.is_visible);
    }

    if (stockFilter === 'in_stock') {
        filtered = filtered.filter(p => p.stock_quantity !== 0);
    } else if (stockFilter === 'out_of_stock') {
        filtered = filtered.filter(p => p.stock_quantity === 0);
    }

    if (searchTerm) {
        filtered = filtered.filter(p => (p.name || '').toLowerCase().includes(searchTerm));
    }

    renderProductList(filtered);
}
function initializeProductDragAndDrop() { /* ... (此函式內容不變) ... */
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
                } catch (error) { ui.toast.error(error.message); init(); }
            }
        });
    }
}
function handleDownloadCsvTemplate() { /* ... (此函式內容不變) ... */
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
function handleCsvUpload(event) { /* ... (此函式內容不變) ... */
    const file = event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (e) => {
        const text = e.target.result;
        const lines = text.split(/\r\n|\n/).filter(line => line.trim() !== '');
        if (lines.length < 2) return ui.toast.error('CSV 檔案中沒有可匯入的資料。');

        const headers = lines[0].split(',').map(h => h.trim().replace(/"/g, ''));
        const data = lines.slice(1).map(line => {
            const values = [];
            let currentVal = '';
            let inQuotes = false;
            for (let i = 0; i < line.length; i++) {
                const char = line[i];
                if (char === '"') {
                    inQuotes = !inQuotes;
                } else if (char === ',' && !inQuotes) {
                    values.push(currentVal.trim().replace(/^"|"$/g, ''));
                    currentVal = '';
                } else {
                    currentVal += char;
                }
            }
            values.push(currentVal.trim().replace(/^"|"$/g, ''));

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
            ui.toast.success('匯入成功！');
            await init();
        } catch (error) {
            ui.toast.error(`匯入失敗：${error.message}`);
        } finally {
             event.target.value = '';
        }
    };
    reader.readAsText(file, 'UTF-8');
}
function openProductModal(product = null) { /* ... (此函式內容不變) ... */
    const formBody = document.getElementById('edit-product-form-body');
    const form = document.getElementById('edit-product-form');
    if (!formBody || !form || !activeTemplate) {
         console.error("無法開啟 Modal: 表單元素或樣板未就緒。");
         return;
    }


    form.reset();
    formBody.innerHTML = '';

    activeTemplate.fields.forEach(field => {
        const formField = createFormField(field);
        formBody.appendChild(formField);
    });

    const imageSection = document.getElementById('edit-product-image-section');
    const specSection = document.getElementById('edit-product-spec-section');
    const imageInputs = document.getElementById('edit-product-image-inputs');
    const specInputs = document.getElementById('edit-product-spec-inputs');

    imageInputs.innerHTML = '';
    specInputs.innerHTML = '';

    const hasImages = activeTemplate.fields.some(f => f.key === 'images');
    imageSection.style.display = hasImages ? 'block' : 'none';

    const hasSpecs = activeTemplate.fields.some(f => f.key.startsWith('spec_'));
    specSection.style.display = hasSpecs ? 'block' : 'none';

    const modalTitle = document.getElementById('modal-product-title');
    const pageTitle = document.querySelector('#page-inventory .page-header h2');
    pageTitle.textContent = `${activeTemplate.entityNamePlural}管理`;

    if (product) {
        modalTitle.textContent = `編輯${activeTemplate.entityName}：${product.name}`;

        activeTemplate.fields.forEach(field => {
            const input = document.getElementById(`edit-product-${field.key}`);
            if (input && field.key !== 'images' && !field.key.startsWith('spec_')) {
                if (field.type === 'boolean') {
                    input.checked = !!product[field.key];
                } else {
                    input.value = product.hasOwnProperty(field.key) ? (product[field.key] || '') : '';
                }
            }
        });

        if (hasImages) {
            try {
                const images = JSON.parse(product.images || '[]');
                if (images.length === 0) {
                    addImageInputField(imageInputs);
                } else {
                    images.forEach(imgUrl => addImageInputField(imageInputs, imgUrl));
                }
            } catch (e) { addImageInputField(imageInputs); }
        }
        if (hasSpecs) {
            let specAdded = false;
            for (let i = 1; i <= 5; i++) {
                if (product[`spec_${i}_name`] || product[`spec_${i}_value`]) {
                    addSpecInputField(specInputs, product[`spec_${i}_name`], product[`spec_${i}_value`]);
                    specAdded = true;
                }
            }
            if (!specAdded) addSpecInputField(specInputs);
        }

        let idInput = form.querySelector('input[name="product_id"]');
        if (!idInput) {
            idInput = document.createElement('input');
            idInput.type = 'hidden';
            idInput.name = 'product_id';
            form.appendChild(idInput);
        }
        idInput.value = product.product_id;

    } else {
        modalTitle.textContent = `新增${activeTemplate.entityName}`;
        if (hasImages) addImageInputField(imageInputs);
        if (hasSpecs) addSpecInputField(specInputs);
        const idInput = form.querySelector('input[name="product_id"]');
        if (idInput) idInput.remove();
    }

    updateDynamicButtonsState();
    ui.showModal('#edit-product-modal');
}
async function handleFormSubmit(event) { /* ... (此函式內容不變) ... */
    event.preventDefault();
    const form = event.target;
    const data = {};

    if (!activeTemplate) {
         ui.toast.error("儲存失敗：樣板設定未載入。");
         return;
    }


    activeTemplate.fields.forEach(field => {
        const input = form.querySelector(`[name="${field.key}"]`);
        if (input && field.key !== 'images' && !field.key.startsWith('spec_')) {
            if (field.type === 'boolean') {
                data[field.key] = input.checked;
            } else {
                data[field.key] = input.value;
            }
        } else if (field.required && field.key !== 'images' && !field.key.startsWith('spec_')) {
             console.warn(`Required field input missing: ${field.key}`);
             data[field.key] = null;
        }

    });

    const images = Array.from(document.querySelectorAll('[name="images"]')).map(input => input.value.trim()).filter(Boolean);
    data.images = JSON.stringify(images);

    document.querySelectorAll('.spec-input-group').forEach((group, index) => {
        const i = index + 1;
        data[`spec_${i}_name`] = group.querySelector('[name="spec_name"]').value.trim() || null;
        data[`spec_${i}_value`] = group.querySelector('[name="spec_value"]').value.trim() || null;
    });

    for (const field of activeTemplate.fields) {
        if (field.required && (!data.hasOwnProperty(field.key) || (typeof data[field.key] === 'string' && data[field.key].trim() === '') || data[field.key] === null)) {
            ui.toast.error(`「${field.label}」為必填欄位！`);
            return;
        }
    }


    const idInput = form.querySelector('input[name="product_id"]');
    const isCreating = !idInput;
    if (!isCreating) {
        data.product_id = idInput.value;
    }

    try {
        if (isCreating) {
            await api.createProduct(data);
        } else {
            await api.updateProductDetails(data);
        }
        ui.hideModal('#edit-product-modal');
        await init();
        ui.toast.success('儲存成功！');
    } catch (error) {
        ui.toast.error(`儲存失敗：${error.message}`);
    }
}
function updateBatchToolbarState() { /* ... (此函式內容不變) ... */
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
async function handleBatchUpdate(isVisible) { /* ... (此函式內容不變) ... */
    const selectedIds = Array.from(document.querySelectorAll('.product-checkbox:checked')).map(cb => cb.dataset.productId);
    if (selectedIds.length === 0) return ui.toast.error('請至少選取一個項目！');
    try {
        await api.batchUpdateProducts(selectedIds, isVisible);
        ui.toast.success(`成功更新 ${selectedIds.length} 個項目！`);
        await init();
    } catch (error) { ui.toast.error(`錯誤：${error.message}`); }
}
async function handleBatchSetStock() { /* ... (此函式內容不變) ... */
    const selectedIds = Array.from(document.querySelectorAll('.product-checkbox:checked')).map(cb => cb.dataset.productId);
    if (selectedIds.length === 0) return ui.toast.error('請至少選取一個項目！');

    const statusText = prompt('請輸入要為所有選取項目設定的庫存狀態文字：\n(例如：可預約、熱銷中、已售罄)', '可預約');

    if (statusText === null || statusText.trim() === '') {
        return;
    }

    const confirmed = await ui.confirm(`確定要將 ${selectedIds.length} 個項目的庫存狀態設定為「${statusText}」嗎？`);
    if (!confirmed) return;


    try {
        await api.batchUpdateStockStatus(selectedIds, statusText.trim());
        ui.toast.success(`成功更新 ${selectedIds.length} 個項目！`);
        await init();
    } catch (error) {
        ui.toast.error(`錯誤：${error.message}`);
    }
}
async function handleBatchDelete() { /* ... (此函式內容不變) ... */
    const selectedIds = Array.from(document.querySelectorAll('.product-checkbox:checked')).map(cb => cb.dataset.productId);
    if (selectedIds.length === 0) return ui.toast.error('請至少選取一個項目！');

    const confirmed = await ui.confirm(`確定要刪除選取的 ${selectedIds.length} 個項目嗎？此操作無法復原。`);
    if (!confirmed) return;

    try {
        await api.deleteProducts(selectedIds);
        ui.toast.success('刪除成功！');
        await init();
    } catch (error) {
        ui.toast.error(`錯誤：${error.message}`);
    }
}
function updateSelectAllCheckboxState() { /* ... (此函式內容不變) ... */
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
function setupEventListeners() { /* ... (此函式內容不變) ... */
    const page = document.getElementById('page-inventory');
    if (!page || page.dataset.initialized === 'true') return;

    document.addEventListener('click', e => {
        const editModal = document.getElementById('edit-product-modal');
        if (editModal && editModal.contains(e.target)) {
            if (e.target.id === 'add-image-input-btn') {
                addImageInputField(document.getElementById('edit-product-image-inputs'));
            } else if (e.target.id === 'add-spec-input-btn') {
                addSpecInputField(document.getElementById('edit-product-spec-inputs'));
            } else if (e.target.classList.contains('btn-remove-input')) {
                e.target.closest('.dynamic-input-group')?.remove();
                updateDynamicButtonsState();
            }
        }
        if (page.contains(e.target)) {
            if (e.target.id === 'add-product-btn') {
                openProductModal();
            } else if (e.target.id === 'download-csv-template-btn') {
                handleDownloadCsvTemplate();
            } else if (e.target.closest('.btn-edit-product')) {
                const button = e.target.closest('.btn-edit-product');
                const product = allProducts.find(p => p.product_id === button.dataset.productid);
                if (product) openProductModal(product);
            }
        }
    });

    function addFilterGroupListener(groupId) {
        const filterGroup = document.getElementById(groupId);
        if (filterGroup) {
            filterGroup.addEventListener('click', (e) => {
                if (e.target.tagName === 'BUTTON') {
                    filterGroup.querySelector('.active')?.classList.remove('active');
                    e.target.classList.add('active');
                    applyProductFiltersAndRender();
                }
            });
        }
    }
    addFilterGroupListener('inventory-stock-filter');
    addFilterGroupListener('inventory-visibility-filter');

    document.getElementById('batch-publish-btn')?.addEventListener('click', () => handleBatchUpdate(true));
    document.getElementById('batch-unpublish-btn')?.addEventListener('click', () => handleBatchUpdate(false));
    document.getElementById('batch-set-stock-btn')?.addEventListener('click', handleBatchSetStock);
    document.getElementById('batch-delete-btn')?.addEventListener('click', handleBatchDelete);

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
                    ui.toast.error(`更新失敗: ${error.message}`);
                    e.target.checked = !isVisible;
                } finally {
                    e.target.disabled = false;
                }
            }
        });
    }

    document.getElementById('select-all-products')?.addEventListener('change', (e) => {
        document.querySelectorAll('.product-checkbox').forEach(checkbox => checkbox.checked = e.target.checked);
        updateBatchToolbarState();
    });

    document.getElementById('product-search-input')?.addEventListener('input', applyProductFiltersAndRender);
    document.getElementById('csv-upload-input')?.addEventListener('change', handleCsvUpload);

    const editForm = document.getElementById('edit-product-form');
     if (editForm && !editForm.dataset.listenerAttached) {
         editForm.addEventListener('submit', handleFormSubmit);
         editForm.dataset.listenerAttached = 'true';
     }

    page.dataset.initialized = 'true';
}


// --- 初始化 (包含修正後的 try...catch 結構) ---
export const init = async () => {
    console.log("[ProductManagement] Init started.");
    let currentActiveTemplate = null; // 使用局部變數

    // ========== ▼▼▼ 外層 try 開始 ▼▼▼ ==========
    try {
        // ========== ▼▼▼ 修改點：直接使用參數 ▼▼▼ ==========
        if (!activeTemplateKey || !definitions || typeof definitions !== 'object') {
             console.error("[ProductManagement DEBUG] Received invalid parameters!", { activeTemplateKey, definitions });
             throw new Error("必要的樣板設定未被傳遞。");
        }
        console.log("[ProductManagement DEBUG] Received active template key:", activeTemplateKey);

        currentActiveTemplate = definitions[activeTemplateKey]; // 從傳入的 definitions 取得
        console.log(`[ProductManagement DEBUG] Resolved activeTemplate for key '${activeTemplateKey}':`, currentActiveTemplate);
        // ========== ▲▲▲ 修改點 ▲▲▲ ==========

        if (!currentActiveTemplate) {
            console.error(`[ProductManagement DEBUG] Failed to get activeTemplate from definitions for key: ${activeTemplateKey}`);
            throw new Error(`在傳遞的設定中找不到名為 "${activeTemplateKey}" 的商業樣板。`);
        }

        const adminColumnsValue = currentActiveTemplate.adminColumns;
        const isAdminColumnsArray = Array.isArray(adminColumnsValue);

        console.log(`[ProductManagement DEBUG **PRE-CHECK**] Value of currentActiveTemplate.adminColumns:`, adminColumnsValue);
        console.log(`[ProductManagement DEBUG **PRE-CHECK**] Result of Array.isArray(currentActiveTemplate.adminColumns):`, isAdminColumnsArray);

        if (!adminColumnsValue || !isAdminColumnsArray) {
             console.error("[ProductManagement DEBUG] Check failed! currentActiveTemplate object state at failure:", currentActiveTemplate);
             throw new Error(`樣板 "${activeTemplateKey}" 缺少有效的 'adminColumns' 設定。 [Debug Info: Value=${JSON.stringify(adminColumnsValue)}, IsArray=${isAdminColumnsArray}]`);
        }
        console.log(`[ProductManagement] Active template '${activeTemplateKey}' loaded successfully and adminColumns check passed.`);

        // --- 頁面元素設定 ---
        const tbody = document.getElementById('product-list-tbody');
        if (!tbody) {
             console.error("[ProductManagement] Cannot find tbody element inside init.");
             // 即使找不到 tbody，也嘗試繼續執行，避免完全卡住，但後續會出錯
        } else {
             tbody.innerHTML = `<tr><td colspan="7" style="text-align: center;">正在載入${currentActiveTemplate.entityNamePlural}...</td></tr>`;
        }
        const pageTitle = document.querySelector('#page-inventory .page-header h2');
        if (pageTitle) {
            pageTitle.textContent = `${currentActiveTemplate.entityNamePlural}管理`;
        } else {
            console.warn("[ProductManagement] Cannot find page title element.");
        }
        // --- 頁面元素設定結束 ---

        // ========== ▼▼▼ 內層 try 開始 ▼▼▼ ==========
        try {
            console.log("[ProductManagement] Fetching products...");
            allProducts = []; // Reset before fetching
            allProducts = await api.getProducts();
            console.log(`[ProductManagement] Fetched ${allProducts.length} products.`);

            // 使用 currentActiveTemplate 進行檢查和渲染
            if (currentActiveTemplate && currentActiveTemplate.adminColumns) {
                // ========== ▼▼▼ 修改點：將 currentActiveTemplate 傳遞給需要它的函式 ▼▼▼ ==========
                // 注意：如果其他函式也需要樣板設定，需要修改它們以接收參數
                applyProductFiltersAndRender(currentActiveTemplate); // 假設 render 需要樣板
                initializeProductDragAndDrop(); // 這個可能不需要
                if (!document.getElementById('page-inventory').dataset.initialized) {
                    setupEventListeners(currentActiveTemplate); // 事件監聽器可能也需要
                }
                // ========== ▲▲▲ 修改點 ▲▲▲ ==========
                console.log("[ProductManagement] Init finished successfully.");
            } else {
                 console.error("[ProductManagement DEBUG] currentActiveTemplate became invalid before rendering!");
                 throw new Error("activeTemplate 在準備渲染時無效 (二次檢查)。");
            }
        } catch (error) { // 內層 catch
            console.error('初始化產品頁面的產品列表失敗:', error);
            const tbody = document.getElementById('product-list-tbody');
            if(tbody) tbody.innerHTML = `<tr><td colspan="7" style="color: red; text-align:center;">讀取產品資料失敗: ${error.message}</td></tr>`;
        }
        // ========== ▲▲▲ 內層 try...catch 結束 ▲▲▲ ==========

    } catch (e) { // 外層 catch
        console.error("讀取商業樣板失敗 (outer catch):", e);
        const inventoryPage = document.getElementById('page-inventory');
        if(inventoryPage) inventoryPage.innerHTML = `<p style="color:red;">讀取商業樣板設定失敗: ${e.message}，請檢查系統設定。</p>`;
        return;
    }
    // ========== ▲▲▲ 外層 try...catch 結束 ▲▲▲ ==========
}; // init 函式結束

// ========== ▼▼▼ 修改點：更新需要樣板設定的函式 ▼▼▼ ==========
// 例如，如果 renderProductList 需要樣板：
function renderProductList(products, template) { // 接收 template 參數
    const productListTbody = document.getElementById('product-list-tbody');
    const productListThead = document.querySelector('#page-inventory thead tr');
    if (!productListTbody || !productListThead) return;

    // 使用傳入的 template 進行檢查
    if (!template || !template.adminColumns || !Array.isArray(template.adminColumns)) {
        console.error("renderProductList 錯誤： 無效的 template 或 adminColumns。", template);
        productListTbody.innerHTML = `<tr><td colspan="7" style="color: red; text-align:center;">渲染列表失敗：樣板設定錯誤。</td></tr>`;
        return;
    }

    let headerHTML = `...`; // (保持不變)
    // 使用 template.adminColumns
    template.adminColumns.forEach(col => {
        headerHTML += `<th>${col.label}</th>`;
    });
    headerHTML += `...`; // (保持不變)
    productListThead.innerHTML = headerHTML;

    productListTbody.innerHTML = '';
    products.forEach(p => {
        // ... (保持不變) ...
        template.adminColumns.forEach(col => { // 使用 template.adminColumns
            rowHTML += `<td>${p.hasOwnProperty(col.key) ? (p[col.key] || 'N/A') : 'N/A'}</td>`;
        });
        // ... (保持不變) ...
        row.innerHTML = rowHTML;
    });
}

// 修改 applyProductFiltersAndRender 以傳遞樣板
function applyProductFiltersAndRender(template) { // 接收 template
    // ... (篩選邏輯保持不變) ...
    renderProductList(filtered, template); // 將 template 傳遞下去
}

// 修改 openProductModal 和 handleFormSubmit，確保它們使用正確的樣板
// (這兩個函式原本就在 productManagement.js 內部，可以繼續使用局部的 currentActiveTemplate)
// 但為了安全起見，可以也修改它們接收 template 參數

// 修改 setupEventListeners 以接收樣板
function setupEventListeners(template) { // 接收 template
    const page = document.getElementById('page-inventory');
    // 注意： dataset.initialized 檢查邏輯可能需要調整，確保只綁定一次
    // 或者在 app.js 傳遞時就判斷是否已初始化
    // if (!page || page.dataset.initialized === 'true') return;

    // ... (事件委派邏輯) ...

        // 例如，編輯按鈕需要 template
        // else if (e.target.closest('.btn-edit-product')) {
        //     const button = e.target.closest('.btn-edit-product');
        //     const product = allProducts.find(p => p.product_id === button.dataset.productid);
        //     if (product) openProductModal(product, template); // <--- 傳遞 template
        // }

    // ... (其他事件綁定) ...

    // 將篩選按鈕觸發的渲染也改為傳遞 template
    function addFilterGroupListener(groupId) {
        const filterGroup = document.getElementById(groupId);
        if (filterGroup) {
            filterGroup.addEventListener('click', (e) => {
                if (e.target.tagName === 'BUTTON') {
                    filterGroup.querySelector('.active')?.classList.remove('active');
                    e.target.classList.add('active');
                    applyProductFiltersAndRender(template); // <--- 傳遞 template
                }
            });
        }
    }
    // ...

    document.getElementById('product-search-input')?.addEventListener('input', () => applyProductFiltersAndRender(template)); // <--- 傳遞 template

    // ... (其他事件綁定) ...

    // page.dataset.initialized = 'true'; // 標記初始化可能需要更精確的控制
}

// ========== ▲▲▲ 修改點 ▲▲▲ ==========

// ... (其他 productManagement.js 的函式保持不變) ...