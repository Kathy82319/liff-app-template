// public/admin/modules/productManagement.js
import { api } from '../api.js';
import { ui } from '../ui.js';

let allProducts = [];
let sortableProducts = null;
let activeTemplate = null; //用來存放當前啟用的樣板藍圖

// 【新增】圖片上傳核心邏जिक
// 圖片上傳核心邏जिक (已修改為暫時停用狀態)
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

// 根據藍圖生成表單欄位 (新版)
function createFormField(field) {
    const formGroup = document.createElement('div');
    formGroup.className = 'form-group';
    const label = document.createElement('label');
    label.htmlFor = `edit-product-${field.key}`;
    label.textContent = field.label + (field.required ? ' (必填)' : '');
    formGroup.appendChild(label);

// --- 價格欄位處理 (保持不變) ---
    if (field.key === 'price') {
        return null;
    }
    if (field.key === 'price_weekday' || field.key === 'price_friday' || field.key === 'price_saturday') {
        const inputElement = document.createElement('input');
        inputElement.type = 'number';
        inputElement.step = 'any';
        inputElement.min = '0';
        inputElement.placeholder = field.placeholder || '請輸入金額';
        inputElement.id = `edit-product-${field.key}`;
        inputElement.name = field.key;
        formGroup.appendChild(inputElement);
        return formGroup; // <--- 直接返回
    }

// --- 圖片欄位處理 (保持不變) ---
    if (field.type === 'image_url') {
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
        // --- 注意：圖片欄位不需要後續的 inputElement 處理，直接返回 ---
        return formGroup; // <--- 直接返回
    }
// --- 其他欄位類型處理 (修正後) ---
    let inputElement; // 在這裡宣告

    switch (field.type) {
        case 'textarea':
            inputElement = document.createElement('textarea');
            inputElement.rows = 5;
            break; // <--- textarea 也要有 break

        case 'boolean':
            // boolean 比較特殊，input 在 label 裡面
            const switchWrapper = document.createElement('div');
            switchWrapper.style.marginTop = '10px';
            // inputElement 在這裡被賦值
            inputElement = document.createElement('input');
            inputElement.type = 'checkbox';
            inputElement.id = `edit-product-${field.key}`; // <--- ID 和 name 在這裡設定
            inputElement.name = field.key;
            const switchLabel = document.createElement('label');
            switchLabel.className = 'switch';
            const slider = document.createElement('span');
            slider.className = 'slider';
            switchLabel.append(inputElement, slider);
            switchWrapper.appendChild(switchLabel);
            formGroup.appendChild(switchWrapper); // 直接把 wrapper 加進去
            // --- boolean 處理完畢，直接返回，不走後面的 appendChild 和 id/name 設定 ---
             return formGroup; // <--- 直接返回

        case 'select': // 新增：處理下拉選單
             inputElement = document.createElement('select');
             if (Array.isArray(field.options)) {
                  field.options.forEach(opt => {
                      inputElement.add(new Option(opt, opt)); // 假設選項文字和值相同
                  });
             }
             if (field.defaultValue) {
                  inputElement.value = field.defaultValue;
             }
             break; // <--- select 也要有 break

        default: // 包含 text, number, email, tel 等
            inputElement = document.createElement('input');
            // 根據 field.type 設定 input 的 type
            inputElement.type = field.type === 'number' ? 'number' : (field.type || 'text'); // 如果沒給 type 預設 text
            if (inputElement.type === 'number') {
                inputElement.step = 'any'; // 允許小數
                inputElement.min = '0';    // 預設最小值
            }
            if (field.placeholder) inputElement.placeholder = field.placeholder;
            if (field.defaultValue) inputElement.value = field.defaultValue; // 加入預設值
            break; // <--- default 也要有 break
    }

    // --- 將創建好的 inputElement (非 boolean) 加入 formGroup ---
    // (這段現在只對 textarea, select, default 創建的 input 有效)
    if (inputElement) { // 確保 inputElement 被成功創建
        formGroup.appendChild(inputElement);
        // --- ID 和 Name 在這裡統一設定 (除了 boolean) ---
        inputElement.id = `edit-product-${field.key}`;
        inputElement.name = field.key;
    } else {
        console.error(`無法為欄位 ${field.key} (類型 ${field.type}) 創建輸入元素`);
    }

    return formGroup;
}

// 動態欄位輔助函式 (升級版)
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

// 渲染列表函式 (保持不變)
// 範例：確保 renderProductList 使用模組級 activeTemplate (若您的舊版是這樣寫)
function renderProductList(products) {
    // ... (existing code for thead, tbody checks) ...
     const productListTbody = document.getElementById('product-list-tbody');
     const productListThead = document.querySelector('#page-inventory thead tr');
     if (!productListTbody || !productListThead || !activeTemplate || !activeTemplate.logic || !activeTemplate.logic.adminColumns) {
         // ... (error handling remains the same) ...
          return;
     }

     // --- Dynamically find the index for the 'price' column if it exists ---
     let priceColumnIndex = -1;
     const headers = [ // Rebuild headers array for index finding
         { key: '__checkbox__' }, // Placeholder
         { key: '__order__' },    // Placeholder
         ...activeTemplate.logic.adminColumns,
         { key: '__visible__' },  // Placeholder
         { key: '__actions__' }   // Placeholder
     ];
     priceColumnIndex = headers.findIndex(col => col.key === 'price'); // Find the old price column definition

     // --- Generate Header ---
     let headerHTML = `
        <th style="width: 40px;"><input type="checkbox" id="select-all-products"></th>
        <th style="width: 50px;">順序</th>
    `;
     activeTemplate.logic.adminColumns.forEach(col => {
         // --- Replace 'price' header label ---
         const label = (col.key === 'price') ? '價格(平日/五/六)' : col.label;
         headerHTML += `<th>${label}</th>`;
     });
     headerHTML += `
        <th style="width: 80px;">上架</th>
        <th style="width: 80px;">操作</th>
    `;
     productListThead.innerHTML = headerHTML;

    // --- Generate Rows ---
    productListTbody.innerHTML = '';
    products.forEach(p => {
        const row = productListTbody.insertRow();
        row.className = 'draggable-row';
        row.dataset.productId = p.product_id;
        let cells = []; // Store cell HTML temporarily

        cells.push(`<td><input type="checkbox" class="product-checkbox" data-product-id="${p.product_id}"></td>`);
        cells.push(`<td class="drag-handle-cell"><span class="drag-handle">⠿</span> ${p.display_order}</td>`);

        activeTemplate.logic.adminColumns.forEach(col => {
            let cellContent = 'N/A';
            if (col.key === 'price') {
                 // --- Display all three prices ---
                 cellContent = `${p.price_weekday || '-'}/${p.price_friday || '-'}/${p.price_saturday || '-'}`;
            } else if (p.hasOwnProperty(col.key)) {
                 cellContent = p[col.key] || 'N/A';
                 // Simple truncation for potentially long text like description
                 if (typeof cellContent === 'string' && cellContent.length > 50) {
                      cellContent = cellContent.substring(0, 47) + '...';
                 }
            }
            cells.push(`<td>${cellContent}</td>`);
        });

        cells.push(`<td><label class="switch"><input type="checkbox" class="visibility-toggle" data-product-id="${p.product_id}" ${p.is_visible ? 'checked' : ''}><span class="slider"></span></label></td>`);
        cells.push(`<td class="actions-cell"><button class="action-btn btn-edit-product" data-productid="${p.product_id}" style="background-color: var(--color-warning); color: #000;">編輯</button></td>`);

        row.innerHTML = cells.join('');
    });
}

function applyProductFiltersAndRender() {
    const searchInput = document.getElementById('product-search-input');
    const searchTerm = searchInput ? searchInput.value.toLowerCase().trim() : '';

    // 【新增】獲取當前啟用的篩選器狀態
    const visibilityFilter = document.querySelector('#inventory-visibility-filter .active')?.dataset.filter || 'all';
    const stockFilter = document.querySelector('#inventory-stock-filter .active')?.dataset.filter || 'all';

    let filtered = [...allProducts]; // 從所有產品開始篩選

    // 【新增】套用「上架狀態」篩選
    if (visibilityFilter === 'visible') {
        filtered = filtered.filter(p => p.is_visible);
    } else if (visibilityFilter === 'hidden') {
        filtered = filtered.filter(p => !p.is_visible);
    }

    // 【新增】套用「庫存狀態」篩選 (根據您的邏जिक)
    if (stockFilter === 'in_stock') {
        // 庫存數量不是 0 的所有項目 (包含 null 或 > 0)
        filtered = filtered.filter(p => p.stock_quantity !== 0);
    } else if (stockFilter === 'out_of_stock') {
        // 庫存數量明確為 0 的項目
        filtered = filtered.filter(p => p.stock_quantity === 0);
    }

    // 【修改】最後才套用「關鍵字搜尋」
    if (searchTerm) {
        filtered = filtered.filter(p => (p.name || '').toLowerCase().includes(searchTerm));
    }

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
                } catch (error) { ui.toast.error(error.message); init(); }
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

// --- 【大幅修改】Modal (彈窗) 相關函式 ---
function openProductModal(product = null) {
    // ... (existing code for formBody, form checks) ...
     const formBody = document.getElementById('edit-product-form-body');
     const form = document.getElementById('edit-product-form');
     if (!formBody || !form || !activeTemplate || !Array.isArray(activeTemplate.fields)) {
        // ... (error handling remains the same) ...
         return;
     }
     form.reset();
     formBody.innerHTML = '';

    // 1. Generate main form based on blueprint
    activeTemplate.fields.forEach(field => {
        // --- Skip old 'price' field ---
        if (field.key === 'price') return;
        // --- Generate fields for new prices ---
        if (field.key === 'price_weekday' || field.key === 'price_friday' || field.key === 'price_saturday') {
             const priceField = createFormField({ // Create definitions on the fly
                 key: field.key,
                 label: field.label || `價格 (${field.key.split('_')[1]})`, // Auto-generate label
                 type: 'number',
                 required: false, // Assuming prices might not always be required
                 placeholder: '請輸入金額'
             });
              if (priceField) formBody.appendChild(priceField);
        } else {
             // --- Render other fields as before ---
             const formField = createFormField(field);
             if (formField) formBody.appendChild(formField); // Check if field was created (e.g., old price is null)
        }
    });

    // ... (rest of the logic for imageSection, specSection, modalTitle remains the same) ...
     const imageSection = document.getElementById('edit-product-image-section');
     const specSection = document.getElementById('edit-product-spec-section');
     const imageInputs = document.getElementById('edit-product-image-inputs');
     const specInputs = document.getElementById('edit-product-spec-inputs');
     if (imageInputs) imageInputs.innerHTML = '';
     if (specInputs) specInputs.innerHTML = '';
     const hasImages = activeTemplate.fields.some(f => f.key === 'images');
     if (imageSection) imageSection.style.display = hasImages ? 'block' : 'none';
     const hasSpecs = activeTemplate.fields.some(f => f.key.startsWith('spec_'));
     if (specSection) specSection.style.display = hasSpecs ? 'block' : 'none';
     const modalTitle = document.getElementById('modal-product-title');
     const pageTitle = document.querySelector('#page-inventory .page-header h2');
     if (pageTitle) pageTitle.textContent = `${activeTemplate.entityNamePlural}管理`;


    // 4. Populate data (Edit mode)
    if (product) {
        if (modalTitle) modalTitle.textContent = `編輯${activeTemplate.entityName}：${product.name}`;

        // Populate main fields (excluding special ones)
        activeTemplate.fields.forEach(field => {
            // --- Skip special fields handled separately ---
            if (field.key === 'price' || field.key === 'images' || field.key.startsWith('spec_') || field.key.startsWith('price_')) return;

            const input = document.getElementById(`edit-product-${field.key}`);
            if (input) {
                if (field.type === 'boolean') {
                    input.checked = !!product[field.key];
                } else {
                    input.value = product[field.key] || '';
                }
            }
        });

        // --- Populate NEW price fields ---
        document.getElementById('edit-product-price_weekday').value = product.price_weekday || '';
        document.getElementById('edit-product-price_friday').value = product.price_friday || '';
        document.getElementById('edit-product-price_saturday').value = product.price_saturday || '';


        // ... (rest of the logic for populating images, specs, product_id remains the same) ...
         if (hasImages && imageInputs) {
            try {
                const images = JSON.parse(product.images || '[]');
                if (images.length === 0) { addImageInputField(imageInputs); }
                else { images.forEach(imgUrl => addImageInputField(imageInputs, imgUrl)); }
            } catch (e) { addImageInputField(imageInputs); }
        }
         if (hasSpecs && specInputs) {
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
             idInput.type = 'hidden'; idInput.name = 'product_id';
             form.appendChild(idInput);
         }
         idInput.value = product.product_id;

    } else {
        // --- Add mode ---
        if (modalTitle) modalTitle.textContent = `新增${activeTemplate.entityName}`;
         if (hasImages && imageInputs) addImageInputField(imageInputs);
         if (hasSpecs && specInputs) addSpecInputField(specInputs);
        const idInput = form.querySelector('input[name="product_id"]');
        if (idInput) idInput.remove();
    }

    updateDynamicButtonsState();
    ui.showModal('#edit-product-modal');
}

// 【大幅修改】處理表單提交
async function handleFormSubmit(event) {
    event.preventDefault();
    const form = event.target;
    const data = {};

    // 1. Read main fields (excluding special ones)
    activeTemplate.fields.forEach(field => {
        // --- Skip special fields ---
        if (field.key === 'price' || field.key === 'images' || field.key.startsWith('spec_') || field.key.startsWith('price_')) return;

        const input = form.querySelector(`[name="${field.key}"]`);
        if (input) {
            if (field.type === 'boolean') {
                data[field.key] = input.checked;
            } else {
                // For number inputs, parse them correctly, handle empty strings as null
                 data[field.key] = (input.type === 'number')
                    ? (input.value === '' ? null : parseFloat(input.value))
                    : input.value;
            }
        }
    });

     // --- Read NEW price fields ---
     data.price_weekday = parseFloat(form.querySelector('[name="price_weekday"]').value) || null;
     data.price_friday = parseFloat(form.querySelector('[name="price_friday"]').value) || null;
     data.price_saturday = parseFloat(form.querySelector('[name="price_saturday"]').value) || null;

    // ... (rest of the logic for reading images, specs, checking required fields, handling ID remains the same) ...
     const images = Array.from(document.querySelectorAll('[name="images"]')).map(input => input.value.trim()).filter(Boolean);
     data.images = JSON.stringify(images);
     document.querySelectorAll('.spec-input-group').forEach((group, index) => {
         const i = index + 1;
         data[`spec_${i}_name`] = group.querySelector('[name="spec_name"]').value.trim() || null;
         data[`spec_${i}_value`] = group.querySelector('[name="spec_value"]').value.trim() || null;
     });
     for (const field of activeTemplate.fields) {
         // --- Adjust required check if 'price' was required before ---
          if (field.key === 'price') continue; // Skip old price field check
         // --- Check new price fields if they are required (assuming they might be) ---
          if ( (field.key === 'price_weekday' || field.key === 'price_friday' || field.key === 'price_saturday') && field.required && data[field.key] === null) {
              ui.toast.error(`「${field.label}」為必填欄位！`); return;
          }
         // --- Original required check for other fields ---
          if (field.required && (!data.hasOwnProperty(field.key) || (typeof data[field.key] === 'string' && data[field.key].trim() === '') || data[field.key] === null) && !field.key.startsWith('price_')) {
             ui.toast.error(`「${field.label}」為必填欄位！`); return;
         }
     }
     const idInput = form.querySelector('input[name="product_id"]');
     const isCreating = !idInput;
     if (!isCreating) { data.product_id = idInput.value; }


    // 5. Submit API (logic remains the same)
    try {
        if (isCreating) {
            await api.createProduct(data);
        } else {
            await api.updateProductDetails(data);
        }
        ui.hideModal('#edit-product-modal');
        await init(); // Reload data
        ui.toast.success('儲存成功！');
    } catch (error) {
        ui.toast.error(`儲存失敗：${error.message}`);
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

// 事件監聽器 (最終修正版)
// --- 事件監聽器 ---
function setupEventListeners() {
     const page = document.getElementById('page-inventory');
     if (!page || page.dataset.initialized === 'true') {
         // console.log("[ProductManagement setupEventListeners - Reverted] Skipping, already initialized or page not found.");
         return;
     }
     console.log("[ProductManagement setupEventListeners - Reverted] Binding listeners...");

     document.addEventListener('click', e => {
        // ... Modal 內點擊事件 ...
        const modal = document.getElementById('edit-product-modal');
        if (modal && modal.contains(e.target)) {
            if (e.target.id === 'add-image-input-btn') { addImageInputField(document.getElementById('edit-product-image-inputs')); }
            else if (e.target.id === 'add-spec-input-btn') { addSpecInputField(document.getElementById('edit-product-spec-inputs')); }
            else if (e.target.classList.contains('btn-remove-input')) {
                e.target.closest('.dynamic-input-group')?.remove();
                updateDynamicButtonsState();
            }
        }
        // 頁面點擊事件
        if (page.contains(e.target)) {
             if (e.target.id === 'add-product-btn') {
                 openProductModal(); // 隱式使用模組級 activeTemplate
             } else if (e.target.closest('.btn-edit-product')) {
                const button = e.target.closest('.btn-edit-product');
                if (button && button.dataset.productid) {
                     const product = allProducts.find(p => p.product_id === button.dataset.productid);
                     if (product) openProductModal(product); // 隱式使用模組級 activeTemplate
                }
             }
             // ... 其他頁面點擊處理 ...
             else if (e.target.id === 'download-csv-template-btn') { handleDownloadCsvTemplate(); }
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
                     // Optional: Re-apply filters if visibility changed
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
     // Prevent multiple attachments using a dataset attribute
     if (editForm && !editForm.dataset.listenerAttached) {
         editForm.addEventListener('submit', handleFormSubmit);
         editForm.dataset.listenerAttached = 'true';
     }


    page.dataset.initialized = 'true';
}

// public/admin/modules/productManagement.js

export const init = async () => {
    console.log("[ProductManagement Internal Wait] Init called.");

    // Helper function for delay
    const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

    let attempts = 0;
    const maxAttempts = 15; // Wait up to 1.5 seconds

    // ========== ▼▼▼ Internal Wait Loop ▼▼▼ ==========
    while (
        (!window.CONFIG || !window.CONFIG.LOGIC || !window.CONFIG.LOGIC.ACTIVE_INDUSTRY_TEMPLATE || !window.CONFIG.LOGIC.INDUSTRY_TEMPLATE_DEFINITIONS) &&
        attempts < maxAttempts
    ) {
        attempts++;
        console.warn(`[ProductManagement Internal Wait] window.CONFIG not fully ready (Attempt ${attempts}). Waiting 100ms...`);
        await delay(100);
    }

    if (!window.CONFIG || !window.CONFIG.LOGIC || !window.CONFIG.LOGIC.ACTIVE_INDUSTRY_TEMPLATE || !window.CONFIG.LOGIC.INDUSTRY_TEMPLATE_DEFINITIONS) {
        console.error("[ProductManagement Internal Wait] window.CONFIG still not ready after waiting. Aborting init.");
        const inventoryPage = document.getElementById('page-inventory');
        if (inventoryPage) {
            inventoryPage.innerHTML = `<p style="color:red;">讀取核心設定失敗，請重新整理頁面或檢查系統設定。</p>`;
        }
        return; // Stop execution
    }
    // ========== ▲▲▲ Internal Wait Loop End ▲▲▲ ==========

    console.log("[ProductManagement Internal Wait] window.CONFIG seems ready now.");

    // Now proceed with the original logic
    try {
        const activeTemplateKey = window.CONFIG.LOGIC.ACTIVE_INDUSTRY_TEMPLATE;
        // Assign to the module-level variable
        const currentActiveTemplate = window.CONFIG.LOGIC.INDUSTRY_TEMPLATE_DEFINITIONS[activeTemplateKey];
        activeTemplate = currentActiveTemplate; // Assign to module-level variable

        if (!currentActiveTemplate) {
            throw new Error(`在設定中找不到名為 "${activeTemplateKey}" 的商業樣板。`);
        }

        // --- Start Enhanced Debugging (Corrected Paths) ---
        // Log the object structure clearly
        console.log("DEBUG: Full currentActiveTemplate object:", JSON.stringify(currentActiveTemplate, null, 2)); // Use stringify for better structure view
        console.log("DEBUG: Checking currentActiveTemplate.logic:", currentActiveTemplate.logic); // Check logic object
        // Check adminColumns *inside* logic, handle if logic is missing
        console.log("DEBUG: Checking currentActiveTemplate.logic.adminColumns:", currentActiveTemplate.logic ? currentActiveTemplate.logic.adminColumns : 'logic is missing');
        console.log("DEBUG: Checking typeof currentActiveTemplate.logic.adminColumns:", typeof (currentActiveTemplate.logic ? currentActiveTemplate.logic.adminColumns : undefined));
        console.log("DEBUG: Checking Array.isArray(currentActiveTemplate.logic.adminColumns):", Array.isArray(currentActiveTemplate.logic ? currentActiveTemplate.logic.adminColumns : undefined));
        // Check fields at top level
        console.log("DEBUG: Checking currentActiveTemplate.fields:", currentActiveTemplate.fields);
        console.log("DEBUG: Checking Array.isArray(currentActiveTemplate.fields):", Array.isArray(currentActiveTemplate.fields));
        // --- End Enhanced Debugging ---

        // --- Corrected Check for adminColumns with added log inside ---
        // Checks if 'logic' exists AND 'adminColumns' inside it is an array
        if (!currentActiveTemplate.logic || !Array.isArray(currentActiveTemplate.logic.adminColumns)) {
            // *** ADD THIS LOG ***
            console.error("!!!! Entering the IF block for adminColumns check !!!!"); // Log if the check fails
            console.error("[ProductManagement Internal Wait] logic object or adminColumns check failed!", currentActiveTemplate);
            throw new Error(`樣板 "${activeTemplateKey}" 缺少有效的 'logic.adminColumns' 陣列設定。`); // More specific error
        }
        // --- Check End ---

        // *** ADDED CHECK FOR FIELDS ***
        // Checks if 'fields' exists at the top level AND is an array
        if (!Array.isArray(currentActiveTemplate.fields)) {
             console.error("!!!! Check for fields failed !!!!"); // Log if the check fails
             console.error("[ProductManagement Internal Wait] fields check failed!", currentActiveTemplate);
             throw new Error(`樣板 "${activeTemplateKey}" 缺少有效的 'fields' 陣列設定。`); // Specific error for fields
        }
        // *** FIELDS CHECK END ***


        console.log("[ProductManagement Internal Wait] Template, fields, and adminColumns checks passed."); // Updated log message if both checks succeed

    } catch (e) {
        console.error("讀取商業樣板失敗:", e);
        const inventoryPage = document.getElementById('page-inventory');
        if (inventoryPage) {
            inventoryPage.innerHTML = `<p style="color:red;">讀取商業樣板設定失敗: ${e.message}，請檢查系統設定。</p>`;
        }
        return; // Stop if template reading fails
    }

    // --- The rest of the init function ---
    const tbody = document.getElementById('product-list-tbody');
    if (!tbody) {
        console.error("初始化產品頁失敗: 無法找到 'product-list-tbody' 元素。");
        return;
    }
    // Use the module-level activeTemplate (assigned above)
    tbody.innerHTML = `<tr><td colspan="7" style="text-align: center;">正在載入${activeTemplate.entityNamePlural}...</td></tr>`;

    const pageTitle = document.querySelector('#page-inventory .page-header h2');
    if (pageTitle) {
        pageTitle.textContent = `${activeTemplate.entityNamePlural}管理`;
    }

    try {
        allProducts = await api.getProducts();
        applyProductFiltersAndRender(); // Uses module-level activeTemplate implicitly
        initializeProductDragAndDrop();
        setupEventListeners(); // Uses module-level activeTemplate implicitly
        console.log("[ProductManagement Internal Wait] Init completed successfully.");
    } catch (error) {
        console.error('初始化產品頁面的產品列表失敗:', error);
        if (tbody) {
            tbody.innerHTML = `<tr><td colspan="7" style="color: red; text-align:center;">讀取產品資料失敗: ${error.message}</td></tr>`;
        }
    }
};