// public/admin/modules/productManagement.js
import { api } from '../api.js';
import { ui } from '../ui.js';

let allProducts = [];
let sortableProducts = null;
let activeTemplate = null; //用來存放當前啟用的樣板藍圖

// 【新增】圖片上傳核心邏輯 (目前為停用狀態)
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

    // --- 【修正】排除 images 欄位，它由動態區塊處理 ---
    if (field.key === 'images') {
         // 這個欄位由 #edit-product-image-section 動態區塊處理
         // 我們不應該在這裡為它建立一個單獨的輸入框
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

// --- 【修改】規格欄位改用 textarea ---
function addSpecInputField(container, name = '', value = '') {
    const count = container.children.length;
    if (count >= 5) return;
    const newGroup = document.createElement('div');
    newGroup.className = 'spec-input-group dynamic-input-group';
    // --- 【修改】將 spec_value 改為 textarea ---
    newGroup.innerHTML = `
        <input type="text" name="spec_name" placeholder="規格${count + 1}名稱" value="${name}">
        <textarea name="spec_value" placeholder="規格${count + 1}內容" rows="3">${value}</textarea>
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
    // ========== ▼▼▼ 【關鍵修正 1】讀取 logic 中的名稱 ▼▼▼ ==========
    const entityName = activeTemplate.logic.adminEntityName || "產品";
    const entityNamePlural = activeTemplate.logic.adminEntityNamePlural || "產品";
    // ========== ▲▲▲ 修正結束 ▲▲▲ ==========

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
        // --- 【修正】排除 images 欄位 ---
        if (field.key === 'images') return; 
        
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
     
     // --- 【修正】hasImages 檢查方式 ---
     const hasImages = activeTemplate.fields.some(f => f.key === 'images');
     if (imageSection) imageSection.style.display = hasImages ? 'block' : 'none';
     
     // --- 【修正】不再檢查 hasSpecs，永遠顯示規格區塊 ---
     if (specSection) { specSection.style.display = 'block'; }  
     
     const modalTitle = document.getElementById('modal-product-title');
     const pageTitle = document.querySelector('#page-inventory .page-header h2');
     
     // --- 【修改】使用新的 entityNamePlural 變數 ---
     if (pageTitle) pageTitle.textContent = `${entityNamePlural}管理`;


    // 4. Populate data (Edit mode)
    if (product) {
        // --- 【修改】使用新的 entityName 變數 ---
        if (modalTitle && activeTemplate) { 
            modalTitle.textContent = `編輯${entityName}：${product.name}`; 
        }

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


        // ... (rest of the logic for populating images, product_id remains the same) ...
         if (hasImages && imageInputs) {
            try {
                const images = JSON.parse(product.images || '[]');
                if (images.length === 0) { addImageInputField(imageInputs); }
                else { images.forEach(imgUrl => addImageInputField(imageInputs, imgUrl)); }
            } catch (e) { addImageInputField(imageInputs); }
        }
        
        // --- 【修正】移除 hasSpecs 檢查，永遠填入規格 ---
         if (specInputs) {
            let specAdded = false;
            for (let i = 1; i <= 5; i++) {
                if (product[`spec_${i}_name`] || product[`spec_${i}_value`]) {
                    // --- 【修改】傳入空字串而不是 null ---
                    addSpecInputField(specInputs, product[`spec_${i}_name`] || '', product[`spec_${i}_value`] || '');
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
        // --- 【修改】使用新的 entityName 變數 ---
        if (modalTitle && activeTemplate) { 
            modalTitle.textContent = `新增${entityName}`; 
        }
         if (hasImages && imageInputs) addImageInputField(imageInputs);
         // --- 【修正】移除 hasSpecs 檢查 ---
         if (specInputs) addSpecInputField(specInputs);
         
        const idInput = form.querySelector('input[name="product_id"]');
        if (idInput) idInput.remove();
    }

    updateDynamicButtonsState();
    ui.showModal('#edit-product-modal');
}

// 【大幅修改】處理表單提交 (前端直接更新版本)
async function handleFormSubmit(event) {
    event.preventDefault();
    const form = event.target;
    const data = {};

    // 1. 讀取表單資料 (這部分邏輯不變)
    activeTemplate.fields.forEach(field => {
        // --- Skip special fields ---
        if (field.key === 'price' || field.key === 'images' || field.key.startsWith('spec_') || field.key.startsWith('price_')) return;

        const input = form.querySelector(`[name="${field.key}"]`);
        if (input) {
            if (field.type === 'boolean') {
                data[field.key] = input.checked;
            } else {
                 data[field.key] = (input.type === 'number')
                    ? (input.value === '' ? null : parseFloat(input.value))
                    : input.value;
            }
        }
    });
     data.price_weekday = parseFloat(form.querySelector('[name="price_weekday"]').value) || null;
     data.price_friday = parseFloat(form.querySelector('[name="price_friday"]').value) || null;
     data.price_saturday = parseFloat(form.querySelector('[name="price_saturday"]').value) || null;
     const images = Array.from(document.querySelectorAll('[name="images"]')).map(input => input.value.trim()).filter(Boolean);
     data.images = JSON.stringify(images);
     
     // --- 【修改】讀取 textarea 並儲存空字串 '' ---
     document.querySelectorAll('.spec-input-group').forEach((group, index) => {
         const i = index + 1;
         data[`spec_${i}_name`] = group.querySelector('[name="spec_name"]').value.trim() || ''; // 存 ''
         data[`spec_${i}_value`] = group.querySelector('[name="spec_value"]').value.trim() || ''; // 存 ''
     });

    // 2. 檢查必填欄位 (這部分邏輯不變)
     for (const field of activeTemplate.fields) {
          if (field.key === 'price') continue;
          if ( (field.key === 'price_weekday' || field.key === 'price_friday' || field.key === 'price_saturday') && field.required && data[field.key] === null) {
              ui.toast.error(`「${field.label}」為必填欄位！`); return;
          }
          if (field.required && (!data.hasOwnProperty(field.key) || (typeof data[field.key] === 'string' && data[field.key].trim() === '') || data[field.key] === null) && !field.key.startsWith('price_')) {
             ui.toast.error(`「${field.label}」為必填欄位！`); return;
         }
     }

    // 3. 判斷是新增還是編輯 (這部分邏輯不變)
     const idInput = form.querySelector('input[name="product_id"]');
     const isCreating = !idInput;
     if (!isCreating) { data.product_id = idInput.value; }


    // 4. 呼叫 API 並處理回應
    try {
        let responseData; // 用來接收 API 回應
        if (isCreating) {
            // 假設 createProduct API 會回傳 { success: true, product: newProductData }
            responseData = await api.createProduct(data);
            if (!responseData || !responseData.product) {
                 throw new Error("API 未回傳新增的產品資料。");
            }
            // 將新產品加入 allProducts 陣列
            allProducts.push(responseData.product);
            console.log("新增產品成功，已加入 allProducts:", responseData.product);
        } else {
            // 假設 updateProductDetails API 會回傳 { success: true, readBack: updatedProductData }
            responseData = await api.updateProductDetails(data);
            if (!responseData || !responseData.readBack) {
                 throw new Error("API 未回傳更新後的產品資料 (readBack)。");
            }
            // 更新 allProducts 陣列中對應的產品
            const index = allProducts.findIndex(p => p.product_id === data.product_id);
            if (index > -1) {
                // 直接用 API 回傳的 readBack 資料覆蓋舊資料
                allProducts[index] = responseData.readBack;
                console.log("更新產品成功，已更新 allProducts:", allProducts[index]);
            } else {
                 console.warn(`找不到要更新的產品 ID (${data.product_id})，可能列表已過期，建議重新載入。`);
                 // 或者可以選擇將 readBack 資料加入 allProducts，雖然理論上不該發生
                 // allProducts.push(responseData.readBack);
            }
        }

        ui.hideModal('#edit-product-modal');

        // --- 取代 await init(); ---
        // 5. 根據目前的篩選條件，使用更新後的 allProducts 重新渲染列表
        allProducts.sort((a, b) => a.display_order - b.display_order); // 保持排序
        applyProductFiltersAndRender();
        // --- 修改結束 ---

        ui.toast.success('儲存成功！');

    } catch (error) {
        ui.toast.error(`儲存失敗：${error.message}`);
        console.error("處理表單提交失敗:", error); // 保留錯誤日誌
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

通用商業APP製作
自訂 Gem
您好，感謝您提供這麼詳細的 F12 錯誤日誌！

您遇到的這個問題是一個「競態條件 (Race Condition)」造成的，這個錯誤日誌非常關鍵： [ProductManagement Internal Wait] window.CONFIG still not ready after waiting. Aborting init.

這表示 productManagement.js（產品管理頁）在嘗試執行時，app.js（主程式）還沒有成功從後端 API (get-app-config) 取得並載入 window.CONFIG（全域設定檔），導致 productManagement.js 讀不到樣板設定，因此中止執行並顯示錯誤。

這個問題的根源在於 public/admin/app.js 中的邏輯：

app.js 在開始載入設定檔的同時，就去嘗試載入第一個頁面（handleRouteChange）。

handleRouteChange 函式雖然會等待設定檔載入 (await this.configPromise)，但在某些情況下（例如使用者快速切換分頁），isConfigReady 這個旗標會被錯誤地提前設為 true。

導致 productManagement.js 被載入時，window.CONFIG 其實還沒準備好，因此 productManagement.js 內部的等待迴圈 (Internal Wait Loop) 就失敗了。

解決方案
我們需要修改 2 個檔案：

public/admin/app.js：移除有問題的 isConfigReady 旗標，強制每一次切換頁面都必須真正等待設定檔載入完成。

public/admin/modules/productManagement.js：移除它內部的「等待迴圈」，因為 app.js 修正後會提供 100% 的保證，不再需要這個迴圈。

步驟 1：替換 public/admin/app.js
請將 public/admin/app.js 的完整內容替換為以下程式碼。 （這個版本移除了 isConfigReady 旗標，並修改了 handleRouteChange 和 init 函式來修復競態條件）：

JavaScript
// public/admin/app.js (FIX for Race Condition)

import { api } from './api.js';
import { ui } from './ui.js';
import { hideBatchToolbar } from './modules/productManagement.js';

const App = {
    router: {
        'dashboard': './modules/dashboard.js',
        'users': './modules/userManagement.js',
        'inventory': './modules/productManagement.js',
        'bookings': './modules/bookingManagement.js',
        'room-availability': './modules/roomAvailabilityManagement.js',
        'exp-history': './modules/expHistory.js',
        'news': './modules/newsManagement.js',
        'drafts': './modules/draftsManagement.js',
        'store-info': './modules/storeInfo.js',
        'points': './modules/pointsCenter.js',
        'settings': './modules/systemSettings.js',
    },
    configPromise: null, // 保留 Promise
    // isConfigReady: false, // <-- 【修正】移除此旗標

    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    },

async handleRouteChange() {
    console.log(`[App.js HandleRouteChange] Hash changed to: ${window.location.hash}`);
    
    // ========== ▼▼▼ 【關鍵修正 1】▼▼▼ ==========
    // 移除 "if (!this.isConfigReady)" 檢查
    // 強制*永遠*等待 configPromise。這很安全，因為等待一個
    // 已經解析 (resolved) 的 Promise 是立即完成的。
    console.log("[App.js HandleRouteChange] Awaiting config promise...");
    try {
        await this.configPromise; // <--- 強制等待
        console.log("[App.js HandleRouteChange] Config promise resolved.");
    } catch (error) {
        console.error("[App.js HandleRouteChange] Config promise failed:", error);
        ui.showPage('error');
        const errorPage = document.getElementById('page-error');
        if(errorPage) errorPage.innerHTML = `<p style="color:red;">系統設定檔載入失敗，無法繼續。</p>`;
        return; 
    }
    // ========== ▲▲▲ 【修正結束 1】▲▲▲ ==========


    const pageId = window.location.hash.substring(1) || 'dashboard';
    console.log(`[App.js HandleRouteChange] Determined pageId: ${pageId}`);

    // --- (檢查 adminPagesConfig 的邏輯保持不變，現在 window.CONFIG 必定存在) ---
    let adminPagesConfig = {}; 
    try {
        const activeTemplateKey = window.CONFIG?.LOGIC?.ACTIVE_INDUSTRY_TEMPLATE;
        const activeTemplate = window.CONFIG?.LOGIC?.INDUSTRY_TEMPLATE_DEFINITIONS?.[activeTemplateKey];
        
        if (activeTemplate && activeTemplate.logic && activeTemplate.logic.adminPagesEnabled) {
            adminPagesConfig = activeTemplate.logic.adminPagesEnabled;
            console.log(`[App.js] Loaded adminPagesEnabled from template '${activeTemplateKey}'`);
        } else {
            console.warn(`[App.js] Could not find adminPagesEnabled in active template '${activeTemplateKey}'. Using default (all enabled).`);
        }
        
        const navTabs = document.querySelector('.nav-tabs');
        if (navTabs) {
             navTabs.querySelectorAll('a').forEach(tabLink => {
                 const targetPage = tabLink.getAttribute('href')?.substring(1);
                 if (targetPage) {
                     if (adminPagesConfig.hasOwnProperty(targetPage) && adminPagesConfig[targetPage] === false) {
                         tabLink.style.display = 'none';
                     } else {
                         tabLink.style.display = ''; 
                     }
                 }
             });
             console.log("[App.js HandleRouteChange] Applied adminPagesEnabled config to nav tabs.");
        } else {
            console.warn("[App.js HandleRouteChange] Could not find .nav-tabs to apply enablement config.");
        }
    } catch (e) {
         console.error("[App.js HandleRouteChange] Error applying adminPagesEnabled config:", e);
    }
    // --- (檢查結束) ---


    try {
        console.log("[App.js HandleRouteChange] Attempting to hide batch toolbar...");
        hideBatchToolbar();
    } catch(e) {
        console.warn("[App.js HandleRouteChange] Error hiding batch toolbar:", e);
    }

    console.log(`[App.js HandleRouteChange] Setting active nav for: ${pageId}`);
    ui.setActiveNav(pageId);

    console.log(`[App.js HandleRouteChange] About to call ui.showPage('${pageId}')`);
    ui.showPage(pageId);
    console.log(`[App.js HandleRouteChange] ui.showPage('${pageId}') finished.`);

    const modulePath = this.router[pageId];
    console.log(`[App.js HandleRouteChange] Module path for ${pageId}: ${modulePath || 'None'}`);

    if (modulePath) {
        try {
            // --- (檢查頁面是否被禁用的邏輯保持不變) ---
            if (adminPagesConfig.hasOwnProperty(pageId) && adminPagesConfig[pageId] === false) {
                 console.warn(`[App.js HandleRouteChange] Access denied: Page '${pageId}' is disabled in template settings.`);
                 const pageElement = document.getElementById(`page-${pageId}`);
                 if(pageElement) pageElement.innerHTML = `<p style="color:orange; text-align: center;">此頁面 (${pageId}) 在目前的樣板設定中已被停用。</p>`;
                 return; 
            }
            // --- (檢查結束) ---

            console.log(`[App.js HandleRouteChange] Importing module: ${modulePath}`);
            const pageModule = await import(modulePath);
            console.log(`[App.js HandleRouteChange] Module ${modulePath} imported successfully.`);

            if (pageModule.init) {
                // ========== ▼▼▼ 【關鍵修正 2】▼▼▼ ==========
                // 移除 "if (!window.CONFIG)" 檢查，因為
                // 函式開頭的 await this.configPromise 已保證 window.CONFIG 存在。
                // ========== ▲▲▲ 【修正結束 2】▲▲▲ ==========

                console.log(`[App.js HandleRouteChange] Calling init() for ${modulePath}`);
                await pageModule.init();
                console.log(`[App.js HandleRouteChange] init() for ${modulePath} finished.`);

                // (room-availability 的 RAF 邏輯保持不變)
                if (pageId === 'room-availability' && pageModule.initializeDatePickers) {
                    console.log(`[App.js HandleRouteChange] Page is room-availability, scheduling initializeDatePickers via RAF...`);
                    requestAnimationFrame(() => {
                         requestAnimationFrame(() => {
                            console.log("%c[App.js HandleRouteChange] Inside RAF, calling initializeDatePickers NOW...", "color: orange;");
                            try {
                                pageModule.initializeDatePickers();
                            } catch (pickerError) {
                                console.error("[App.js HandleRouteChange] Error calling initializeDatePickers from RAF:", pickerError);
                                ui.toast.error(`初始化日期選擇器失敗: ${pickerError.message}`);
                            }
                        });
                    });
                } else {
                     console.log(`[App.js HandleRouteChange] Not calling initializeDatePickers for ${pageId}.`);
                }
            } else {
                 console.warn(`[App.js HandleRouteChange] Module ${modulePath} has no init function.`);
            }
        } catch (error) {
             console.error(`載入或初始化模組 ${modulePath} 失敗:`, error);
             const pageElement = document.getElementById(`page-${pageId}`);
             if (pageElement) {
                  pageElement.innerHTML = `<p style="color:red;">載入頁面功能 (${pageId}) 時發生錯誤: ${error.message}</p>`;
             }
        }
    } else {
         console.warn(`[App.js HandleRouteChange] No module found for pageId: ${pageId}`);
    }
    console.log(`[App.js HandleRouteChange] Finished handling route for ${pageId}.`);
},

    async init() {
        console.log("[App Init] Starting initialization...");
        ui.initSharedEventListeners();

        // ========== ▼▼▼ 【關鍵修正 3】▼▼▼ ==========
        this.configPromise = (async () => {
            console.log("[App Init] Starting config fetch...");
            try {
                window.CONFIG = await api.getAppConfig();
                // (驗證 config 結構的邏輯保持不變)
                if (!window.CONFIG || typeof window.CONFIG !== 'object' ||
                    !window.CONFIG.LOGIC || typeof window.CONFIG.LOGIC !== 'object' ||
                    !window.CONFIG.LOGIC.ACTIVE_INDUSTRY_TEMPLATE ||
                    !window.CONFIG.LOGIC.INDUSTRY_TEMPLATE_DEFINITIONS || typeof window.CONFIG.LOGIC.INDUSTRY_TEMPLATE_DEFINITIONS !== 'object') {
                    console.error("[App Init] Invalid config structure received:", window.CONFIG);
                    throw new Error('獲取到的設定檔格式不正確或缺少必要內容。');
                }
                console.log("[App Init] Config fetched and seems valid:", window.CONFIG);
                // this.isConfigReady = true; // <--- 【修正】移除此行
            } catch (error) {
                console.error("[App Init] Config fetch failed:", error);
                // this.isConfigReady = false; // <--- 【修正】移除此行
                const loadingView = document.getElementById('loading-view');
G                if (loadingView) loadingView.innerHTML = `<p style="color:red;">讀取核心設定失敗: ${error.message}</p>`;
                throw error; // 
            }
        })();
        // ========== ▲▲▲ 【修正結束 3】▲▲▲ ==========

        window.addEventListener('hashchange', () => this.handleRouteChange());

        // (navTabsElement 監聽器保持不變)
        const navTabsElement = document.querySelector('.nav-tabs');
        if (navTabsElement) {
            navTabsElement.addEventListener('click', (event) => {
                if (event.target.tagName === 'A') {
                    event.preventDefault();
                    const newHash = event.target.getAttribute('href');
                    if (window.location.hash !== newHash) {
                        window.location.hash = newHash; // This will trigger the 'hashchange' listener
                    }
                }
            });
        } else {
            console.error("[App Init] '.nav-tabs' element not found. Navigation might not work.");
        }


        // (Initial route handling 保持不變)
        console.log("[App Init] Triggering initial handleRouteChange...");
        try {
             await this.handleRouteChange();
             console.log("[App Init] Initial route handled.");
        } catch (initialRouteError) {
             console.error("[App Init] Error during initial route handling:", initialRouteError);
        }
        console.log("[App Init] Initialization finished.");
    }
};

// (DOMContentLoaded 監聽器保持不變)
document.addEventListener('DOMContentLoaded', () => {
     console.log('[DOMContentLoaded] Skipping frontend cookie check. Initializing App...');
     App.init(); 
});
步驟 2：修改 public/admin/modules/productManagement.js
現在 app.js 會保證 window.CONFIG 已經載入，我們必須移除 productManagement.js 內部的「等待迴圈」，否則它會因為找不到 window.CONFIG（在它被呼叫的那一刻）而立刻報錯。

開啟 public/admin/modules/productManagement.js。

找到 export const init = async () => { 函式。

刪除或註解掉內部的「Internal Wait Loop」區塊，如下所示：

JavaScript
// public/admin/modules/productManagement.js

// ... (所有其他函式) ...

export const init = async () => {
    console.log("[ProductManagement Init] Init called."); // <-- 保留這一行

    // ========== ▼▼▼ 請刪除或註解掉以下這整段迴圈 ▼▼▼ ==========
    /*
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

    if (!window.CONFIG || !window.CONFIG.LOGIC || !window.CONFIG.ACTIVE_INDUSTRY_TEMPLATE || !window.CONFIG.LOGIC.INDUSTRY_TEMPLATE_DEFINITIONS) {
        console.error("[ProductManagement Internal Wait] window.CONFIG still not ready after waiting. Aborting init.");
        const inventoryPage = document.getElementById('page-inventory');
        if (inventoryPage) {
            inventoryPage.innerHTML = `<p style="color:red;">讀取核心設定失敗，請重新整理頁面或檢查系統設定。</p>`;
        }
        return; // Stop execution
    }
    // ========== ▲▲▲ 迴圈刪除結束 ▲▲▲ ==========
    */

    console.log("[ProductManagement Init] window.CONFIG is guaranteed by app.js. Proceeding..."); // <-- 您可以加上這行 log

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
    // ========== ▼▼▼ 【關鍵修正 2】讀取 logic 中的名稱 ▼▼▼ ==========
    const entityName = activeTemplate.logic.adminEntityName || "產品";
    const entityNamePlural = activeTemplate.logic.adminEntityNamePlural || "產品";
    // ========== ▲▲▲ 修正結束 ▲▲▲ ==========

    tbody.innerHTML = `<tr><td colspan="7" style="text-align: center;">正在載入${entityNamePlural}...</td></tr>`;

    const pageTitle = document.querySelector('#page-inventory .page-header h2');
    if (pageTitle && activeTemplate) { 
            // --- 【修改】使用新的 entityNamePlural 變數 ---
            pageTitle.textContent = `${entityNamePlural}管理`; 
        }
    if (pageTitle) {
        // --- 【修改】使用新的 entityNamePlural 變數 ---
        pageTitle.textContent = `${entityNamePlural}管理`;
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