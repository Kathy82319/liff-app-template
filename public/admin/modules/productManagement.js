// public/admin/modules/productManagement.js (加入檢查與日誌)
import { api } from '../api.js';
import { ui } from '../ui.js';

let allProducts = [];
let sortableProducts = null;
let activeTemplate = null; //用來存放當前啟用的樣板藍圖

// 【新增】圖片上傳核心邏輯
// 圖片上傳核心邏輯 (已修改為暫時停用狀態)
async function handleImageUpload(file, inputElement, buttonElement) {
    ui.toast.error('圖片上傳服務尚未設定，請聯繫系統管理員。');
    // 以下為未來啟用時的程式碼，暫時註解
    /*
    if (!file) return;
    const originalButtonText = buttonElement.textContent;
    buttonElement.textContent = '上傳中...';
    buttonElement.disabled = true;
    try {
        const { uploadURL } = await api.generateImageUploadUrl();
        const formData = new FormData();
        formData.append('file', file);
        const response = await fetch(uploadURL, { method: 'POST', body: formData });
        const result = await response.json();
        if (!result.success) {
            throw new Error(result.errors[0]?.message || '上傳至圖片服務失敗');
        }
        const publicUrl = result.result.variants[0];
        inputElement.value = publicUrl;
        ui.toast.success('圖片上傳成功！');
    } catch (error) {
        ui.toast.error(`上傳失敗：${error.message}`);
    } finally {
        buttonElement.textContent = originalButtonText;
        buttonElement.disabled = false;
    }
    */
}

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
function createFormField(field) {
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
function addImageInputField(container, value = '') {
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
function addSpecInputField(container, name = '', value = '') {
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
    const imageContainer = document.getElementById('edit-product-image-inputs');
    if (imageContainer) {
        document.getElementById('add-image-input-btn').style.display = (imageContainer.children.length < 5) ? 'block' : 'none';
    }
    const specContainer = document.getElementById('edit-product-spec-inputs');
    if (specContainer) {
       document.getElementById('add-spec-input-btn').style.display = (specContainer.children.length < 5) ? 'block' : 'none';
    }
}


// 渲染列表函式 (加入檢查)
function renderProductList(products) {
    const productListTbody = document.getElementById('product-list-tbody');
    const productListThead = document.querySelector('#page-inventory thead tr');
    if (!productListTbody || !productListThead) return;

    // 【關鍵檢查】確保 activeTemplate 和 adminColumns 有效
    if (!activeTemplate || !activeTemplate.adminColumns || !Array.isArray(activeTemplate.adminColumns)) {
        console.error("renderProductList 錯誤： 無效的 activeTemplate 或 adminColumns。", activeTemplate);
        productListTbody.innerHTML = `<tr><td colspan="7" style="color: red; text-align:center;">渲染列表失敗：樣板設定錯誤。</td></tr>`;
        return;
    }

    let headerHTML = `
        <th style="width: 40px;"><input type="checkbox" id="select-all-products"></th>
        <th style="width: 50px;">順序</th>
    `;
    // 現在可以安全地使用 forEach
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
            // 【健壯性】如果欄位鍵名不存在於產品資料中，顯示 'N/A'
            rowHTML += `<td>${p.hasOwnProperty(col.key) ? (p[col.key] || 'N/A') : 'N/A'}</td>`;
        });
        rowHTML += `
            <td><label class="switch"><input type="checkbox" class="visibility-toggle" data-product-id="${p.product_id}" ${p.is_visible ? 'checked' : ''}><span class="slider"></span></label></td>
            <td class="actions-cell"><button class="action-btn btn-edit-product" data-productid="${p.product_id}" style="background-color: var(--color-warning); color: #000;">編輯</button></td>
        `;
        row.innerHTML = rowHTML;
    });
}

// ... (applyProductFiltersAndRender, initializeProductDragAndDrop, CSV 相關, Modal 相關, 批次操作相關 函數保持不變) ...
function applyProductFiltersAndRender() {
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

    renderProductList(filtered); // 呼叫更新後的渲染函數
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
                } catch (error) { ui.toast.error(error.message); init(); }
            }
        });
    }
}
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
        if (lines.length < 2) return ui.toast.error('CSV 檔案中沒有可匯入的資料。');

        const headers = lines[0].split(',').map(h => h.trim().replace(/"/g, ''));
        const data = lines.slice(1).map(line => {
            // Improved CSV parsing to handle commas within quoted fields
            const values = [];
            let currentVal = '';
            let inQuotes = false;
            for (let i = 0; i < line.length; i++) {
                const char = line[i];
                if (char === '"') {
                    inQuotes = !inQuotes;
                } else if (char === ',' && !inQuotes) {
                    values.push(currentVal.trim().replace(/^"|"$/g, '')); // Remove surrounding quotes
                    currentVal = '';
                } else {
                    currentVal += char;
                }
            }
            values.push(currentVal.trim().replace(/^"|"$/g, '')); // Add the last value

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
    reader.readAsText(file, 'UTF-8'); // Ensure correct encoding
}
function openProductModal(product = null) {
    const formBody = document.getElementById('edit-product-form-body');
    const form = document.getElementById('edit-product-form');
    if (!formBody || !form || !activeTemplate) { // Check activeTemplate
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
                     // Check if the property exists before assigning
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
async function handleFormSubmit(event) {
    event.preventDefault();
    const form = event.target;
    const data = {};

    if (!activeTemplate) { // Add check
         ui.toast.error("儲存失敗：樣板設定未載入。");
         return;
    }


    activeTemplate.fields.forEach(field => {
        const input = form.querySelector(`[name="${field.key}"]`);
        // Ensure input exists before accessing properties
        if (input && field.key !== 'images' && !field.key.startsWith('spec_')) {
            if (field.type === 'boolean') {
                data[field.key] = input.checked;
            } else {
                data[field.key] = input.value;
            }
        } else if (field.required && field.key !== 'images' && !field.key.startsWith('spec_')) {
             // Handle case where required field's input might be missing (shouldn't happen with createFormField)
             console.warn(`Required field input missing: ${field.key}`);
             data[field.key] = null; // Or some default
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
        // Check data[field.key] exists and is not just whitespace
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
    if (selectedIds.length === 0) return ui.toast.error('請至少選取一個項目！');
    try {
        await api.batchUpdateProducts(selectedIds, isVisible);
        ui.toast.success(`成功更新 ${selectedIds.length} 個項目！`);
        await init();
    } catch (error) { ui.toast.error(`錯誤：${error.message}`); }
}
async function handleBatchSetStock() {
    const selectedIds = Array.from(document.querySelectorAll('.product-checkbox:checked')).map(cb => cb.dataset.productId);
    if (selectedIds.length === 0) return ui.toast.error('請至少選取一個項目！');

    const statusText = prompt('請輸入要為所有選取項目設定的庫存狀態文字：\n(例如：可預約、熱銷中、已售罄)', '可預約');

    if (statusText === null || statusText.trim() === '') {
        return;
    }

    // Use ui.confirm which returns a Promise
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
async function handleBatchDelete() {
    // 【修正】確保 selectedIds 在此 scope 可用
    const selectedIds = Array.from(document.querySelectorAll('.product-checkbox:checked')).map(cb => cb.dataset.productId);
    if (selectedIds.length === 0) return ui.toast.error('請至少選取一個項目！'); // Check again here

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
function setupEventListeners() {
    const page = document.getElementById('page-inventory');
    if (!page || page.dataset.initialized === 'true') return;

    // Use event delegation on a static parent (document or page itself)
    document.addEventListener('click', e => {
        const editModal = document.getElementById('edit-product-modal');

        // Handle clicks within the modal
        if (editModal && editModal.contains(e.target)) {
            if (e.target.id === 'add-image-input-btn') {
                addImageInputField(document.getElementById('edit-product-image-inputs'));
            } else if (e.target.id === 'add-spec-input-btn') {
                addSpecInputField(document.getElementById('edit-product-spec-inputs'));
            } else if (e.target.classList.contains('btn-remove-input')) {
                e.target.closest('.dynamic-input-group')?.remove(); // Use optional chaining
                updateDynamicButtonsState();
            }
        }

        // Handle clicks within the main page content area
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

    // 其他不涉及點擊的事件監聽器 (保持原樣)
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
                     // Optional: You might want to re-apply filters if visibility changed
                    // applyProductFiltersAndRender();
                } catch (error) {
                    ui.toast.error(`更新失敗: ${error.message}`);
                    e.target.checked = !isVisible; // Revert checkbox on error
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

    // Attach submit listener to the form itself
    const editForm = document.getElementById('edit-product-form');
     if (editForm && !editForm.dataset.listenerAttached) { // Prevent multiple attachments
         editForm.addEventListener('submit', handleFormSubmit);
         editForm.dataset.listenerAttached = 'true';
     }


    page.dataset.initialized = 'true';
}


// --- 初始化 ---
export const init = async () => {
    // ========== ▼▼▼ 加入偵錯碼 ▼▼▼ ==========
    console.log("[ProductManagement DEBUG] Init function started.");
    console.log("[ProductManagement DEBUG] Checking window.CONFIG:", window.CONFIG);
    // ========== ▲▲▲ 加入偵錯碼 ▲▲▲ ==========

    console.log("[ProductManagement] Init started."); // 原有的 log
    try {
        // ========== ▼▼▼ 加入偵錯碼 ▼▼▼ ==========
        if (!window.CONFIG || !window.CONFIG.LOGIC || !window.CONFIG.LOGIC.ACTIVE_INDUSTRY_TEMPLATE || !window.CONFIG.LOGIC.INDUSTRY_TEMPLATE_DEFINITIONS) {
            console.error("[ProductManagement DEBUG] window.CONFIG is incomplete or missing!", window.CONFIG); // 更詳細的錯誤 log
            throw new Error("全域設定 window.CONFIG 未完整載入。");
        }
        console.log("[ProductManagement DEBUG] window.CONFIG seems ok. Active template key:", window.CONFIG.LOGIC.ACTIVE_INDUSTRY_TEMPLATE);
        // ========== ▲▲▲ 加入偵錯碼 ▲▲▲ ==========

        console.log("[ProductManagement] window.CONFIG seems loaded."); // 原有的 log

        const activeTemplateKey = window.CONFIG.LOGIC.ACTIVE_INDUSTRY_TEMPLATE;
        activeTemplate = window.CONFIG.LOGIC.INDUSTRY_TEMPLATE_DEFINITIONS[activeTemplateKey];

        // ========== ▼▼▼ 加入偵錯碼 ▼▼▼ ==========
        console.log(`[ProductManagement DEBUG] Attempting to use template key: ${activeTemplateKey}`);
        console.log("[ProductManagement DEBUG] Resolved activeTemplate:", activeTemplate);
        // ========== ▲▲▲ 加入偵錯碼 ▲▲▲ ==========


        if (!activeTemplate) {
            // ========== ▼▼▼ 加入偵錯碼 ▼▼▼ ==========
            console.error(`[ProductManagement DEBUG] Failed to get activeTemplate for key: ${activeTemplateKey}`);
            // ========== ▲▲▲ 加入偵錯碼 ▲▲▲ ==========
            throw new Error(`在設定中找不到名為 "${activeTemplateKey}" 的商業樣板。`);
        }
        // 【關鍵檢查】在讀取 adminColumns 之前確保它是有效的陣列
        if (!activeTemplate.adminColumns || !Array.isArray(activeTemplate.adminColumns)) {
             // ========== ▼▼▼ 加入偵錯碼 ▼▼▼ ==========
             console.error("[ProductManagement DEBUG] activeTemplate is missing or has invalid adminColumns!", activeTemplate);
             // ========== ▲▲▲ 加入偵錯碼 ▲▲▲ ==========
             throw new Error(`樣板 "${activeTemplateKey}" 缺少有效的 'adminColumns' 設定。`); // 錯誤發生點
        }
        console.log(`[ProductManagement] Active template '${activeTemplateKey}' loaded successfully.`); // 原有的 log

        // ... init 函式剩下的程式碼 ...

    } catch (e) {
        console.error("讀取商業樣板失敗:", e); // 原有的 log
        document.getElementById('page-inventory').innerHTML = `<p style="color:red;">讀取商業樣板設定失敗: ${e.message}，請檢查系統設定。</p>`;
        return;
    }

    const tbody = document.getElementById('product-list-tbody');
    if (!tbody) {
         console.error("[ProductManagement] Cannot find tbody element.");
         return;
    }
    tbody.innerHTML = `<tr><td colspan="7" style="text-align: center;">正在載入${activeTemplate.entityNamePlural}...</td></tr>`;

    const pageTitle = document.querySelector('#page-inventory .page-header h2');
    if (pageTitle) pageTitle.textContent = `${activeTemplate.entityNamePlural}管理`;

    try {
        console.log("[ProductManagement] Fetching products...");
        // Reset allProducts before fetching
        allProducts = [];
        allProducts = await api.getProducts();
        console.log(`[ProductManagement] Fetched ${allProducts.length} products.`);

        // 再次檢查 activeTemplate
        if (activeTemplate && activeTemplate.adminColumns) {
            applyProductFiltersAndRender();
            initializeProductDragAndDrop();
             // Ensure event listeners are set up only once or can handle re-initialization
             if (!document.getElementById('page-inventory').dataset.initialized) {
                 setupEventListeners();
             }
            console.log("[ProductManagement] Init finished successfully.");
        } else {
             throw new Error("activeTemplate 在準備渲染時無效。");
        }
    } catch (error) {
        console.error('初始化產品頁失敗:', error);
        tbody.innerHTML = `<tr><td colspan="7" style="color: red; text-align:center;">讀取失敗: ${error.message}</td></tr>`;
    }
};