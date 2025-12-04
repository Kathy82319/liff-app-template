// public/admin/modules/productManagement.js
import { api } from '../api.js';
import { ui } from '../ui.js';
import { escapeHtml } from '../../utils.js';

let allProducts = [];
let sortableProducts = null;
let activeTemplate = null; // 用來存放當前啟用的樣板藍圖

// 圖片上傳核心邏輯
async function handleImageUpload(file, inputElement, buttonElement) {
    // 檢查是否開啟圖片上傳功能 (預設開啟)
    const allowUpload = activeTemplate?.logic?.features?.allow_image_upload !== false;
    
    if (!allowUpload) {
        ui.toast.error('目前的樣板設定不允許上傳圖片。');
        return;
    }

    if (!file) return;

    const originalButtonText = buttonElement.textContent;
    buttonElement.textContent = '...';
    buttonElement.disabled = true;

    try {
        // 1. 取得上傳 URL
        const { uploadURL } = await api.generateImageUploadUrl();
        
        // 2. 上傳圖片
        const formData = new FormData();
        formData.append('file', file);
        
        const response = await fetch(uploadURL, { method: 'POST', body: formData });
        const result = await response.json();
        
        if (!result.success) {
            throw new Error(result.errors[0]?.message || '上傳至圖片服務失敗');
        }
        
        // 3. 填入 URL (使用 public variant)
        // Cloudflare Images 通常回傳 variants 陣列，取第一個或 public
        const publicUrl = result.result.variants[0];
        inputElement.value = publicUrl;
        ui.toast.success('圖片上傳成功！');

    } catch (error) {
        console.error("Upload failed:", error);
        ui.toast.error(`上傳失敗：請聯繫系統管理員 (${error.message})`);
    } finally {
        buttonElement.textContent = originalButtonText;
        buttonElement.disabled = false;
    }
}

// 隱藏批次工具列
export function hideBatchToolbar() {
    const toolbar = document.getElementById('batch-actions-toolbar');
    if (toolbar) {
        toolbar.classList.remove('visible');
    }
    const selectAllCheckbox = document.getElementById('select-all-products');
    if (selectAllCheckbox) {
        selectAllCheckbox.checked = false;
        selectAllCheckbox.indeterminate = false;
    }
}

// 根據藍圖生成表單欄位
function createFormField(field) {
    const formGroup = document.createElement('div');
    formGroup.className = 'form-group';
    
    const label = document.createElement('label');
    label.htmlFor = `edit-product-${field.key}`;
    label.textContent = field.label + (field.required ? ' (必填)' : '');
    formGroup.appendChild(label);

    // 排除由特殊區塊處理的欄位
    if (field.key === 'price' || field.key === 'images') {
        return null;
    }

    // 價格相關欄位 (number)
    if (['price_weekday', 'price_friday', 'price_saturday', 'stock_quantity'].includes(field.key)) {
        const input = document.createElement('input');
        input.type = 'number';
        input.step = 'any';
        input.min = '0';
        input.placeholder = field.placeholder || '請輸入數值';
        input.id = `edit-product-${field.key}`;
        input.name = field.key;
        if (field.key === 'stock_quantity') input.placeholder = '留空代表無限';
        formGroup.appendChild(input);
        return formGroup;
    }

    // 圖片網址欄位 (含上傳按鈕)
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
        return formGroup;
    }

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
            inputElement.id = `edit-product-${field.key}`;
            inputElement.name = field.key;
            
            const switchLabel = document.createElement('label');
            switchLabel.className = 'switch';
            const slider = document.createElement('span');
            slider.className = 'slider';
            
            switchLabel.append(inputElement, slider);
            switchWrapper.appendChild(switchLabel);
            formGroup.appendChild(switchWrapper);
            return formGroup; 

        case 'select':
             inputElement = document.createElement('select');
             if (Array.isArray(field.options)) {
                  // 支援字串陣列或物件陣列 {label, value}
                  field.options.forEach(opt => {
                      const val = typeof opt === 'object' ? opt.value : opt;
                      const txt = typeof opt === 'object' ? opt.label : opt;
                      inputElement.add(new Option(txt, val));
                  });
             }
             if (field.defaultValue) inputElement.value = field.defaultValue;
             break;

        default: // text, number, email, tel
            inputElement = document.createElement('input');
            inputElement.type = field.type === 'number' ? 'number' : (field.type || 'text');
            if (inputElement.type === 'number') {
                inputElement.step = 'any';
                inputElement.min = '0';
            }
            if (field.placeholder) inputElement.placeholder = field.placeholder;
            if (field.defaultValue) inputElement.value = field.defaultValue;
            break;
    }

    if (inputElement) {
        inputElement.id = `edit-product-${field.key}`;
        inputElement.name = field.key;
        formGroup.appendChild(inputElement);
    }

    return formGroup;
}

// 動態欄位輔助函式 (多圖上傳)
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

// 動態欄位輔助函式 (規格)
function addSpecInputField(container, name = '', value = '') {
    const count = container.children.length;
    if (count >= 5) return;
    const newGroup = document.createElement('div');
    newGroup.className = 'spec-input-group dynamic-input-group';
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
        const btn = document.getElementById('add-image-input-btn');
        if(btn) btn.style.display = (imageContainer.children.length < 5) ? 'block' : 'none';
    }
    const specContainer = document.getElementById('edit-product-spec-inputs');
    if (specContainer) {
       const btn = document.getElementById('add-spec-input-btn');
       if(btn) btn.style.display = (specContainer.children.length < 5) ? 'block' : 'none';
    }
}

// 渲染列表函式
function renderProductList(products) {
     const productListTbody = document.getElementById('product-list-tbody');
     const productListThead = document.querySelector('#page-inventory thead tr');
     
     if (!productListTbody || !productListThead) return;
     
     // 修正：讀取 admin_config.inventory.columns
     const inventoryConfig = activeTemplate?.admin_config?.inventory;
     if (!inventoryConfig || !Array.isArray(inventoryConfig.columns)) {
          console.error("Admin columns definition missing.");
          return;
     }

     // 1. 過濾啟用的欄位
     const columns = inventoryConfig.columns.filter(col => col.enabled);

     // 2. 生成表頭
     let headerHTML = `
        <th style="width: 40px;"><input type="checkbox" id="select-all-products"></th>
        <th style="width: 50px;">順序</th>
    `;
     columns.forEach(col => {
         const label = (col.key === 'price') ? '價格' : col.label;
         headerHTML += `<th>${label}</th>`;
     });
     headerHTML += `
        <th style="width: 80px;">上架</th>
        <th style="width: 80px;">操作</th>
    `;
     productListThead.innerHTML = headerHTML;

    // 3. 生成列表內容
    productListTbody.innerHTML = '';
    if (products.length === 0) {
        productListTbody.innerHTML = `<tr><td colspan="${columns.length + 4}" style="text-align: center;">找不到資料。</td></tr>`;
        return;
    }

    products.forEach(p => {
        const row = productListTbody.insertRow();
        row.className = 'draggable-row';
        row.dataset.productId = p.product_id;
        let cells = []; 

        cells.push(`<td><input type="checkbox" class="product-checkbox" data-product-id="${p.product_id}"></td>`);
        cells.push(`<td class="drag-handle-cell"><span class="drag-handle">⠿</span> ${p.display_order}</td>`);

        columns.forEach(col => {
            let cellContent = 'N/A';
            
            // 特殊欄位處理
            if (col.key === 'price') {
                 const isComplex = (p.price_friday !== null || p.price_saturday !== null);
                 if (isComplex) {
                     cellContent = `<div style="font-size:0.85em;">平:$${p.price_weekday}<br>假:$${p.price_saturday}</div>`;
                 } else {
                     cellContent = `$${p.price_weekday}`;
                 }
            } 
            else if (col.key === 'images') {
                try {
                    const imgs = JSON.parse(p.images || '[]');
                    if (imgs.length > 0) {
                        cellContent = `<img src="${imgs[0]}" style="width: 50px; height: 50px; object-fit: cover; border-radius: 4px;">`;
                    } else {
                        cellContent = '<span style="color:#ccc; font-size:0.8em;">無圖</span>';
                    }
                } catch(e) { cellContent = 'Error'; }
            }
            else if (col.key === 'stock_status') {
                 if (p.inventory_management_type === 'quantity') {
                     const qty = p.stock_quantity !== null ? p.stock_quantity : '∞';
                     const color = qty > 0 || qty === '∞' ? 'green' : 'red';
                     cellContent = `<span style="color:${color}; font-weight:bold;">${qty}</span>`;
                 } else if (p.inventory_management_type === 'status') {
                     cellContent = p.stock_status || '在庫';
                 } else {
                     cellContent = '-';
                 }
            }
            else if (p.hasOwnProperty(col.key)) {
                 const rawValue = p[col.key] || '';
                 let safeValue = escapeHtml(String(rawValue));
                 if (safeValue.length > 50) safeValue = safeValue.substring(0, 47) + '...';
                 cellContent = safeValue;
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

    const visibilityFilter = document.querySelector('#inventory-visibility-filter .active')?.dataset.filter || 'all';
    const stockFilter = document.querySelector('#inventory-stock-filter .active')?.dataset.filter || 'all';

    let filtered = [...allProducts];

    // 狀態篩選
    if (visibilityFilter === 'visible') filtered = filtered.filter(p => p.is_visible);
    else if (visibilityFilter === 'hidden') filtered = filtered.filter(p => !p.is_visible);

    // 庫存篩選
    if (stockFilter === 'in_stock') filtered = filtered.filter(p => p.stock_quantity !== 0);
    else if (stockFilter === 'out_of_stock') filtered = filtered.filter(p => p.stock_quantity === 0);

    // 關鍵字搜尋
    if (searchTerm) {
        filtered = filtered.filter(p => (p.name || '').toLowerCase().includes(searchTerm) || (p.product_id || '').toLowerCase().includes(searchTerm));
    }

    renderProductList(filtered);
}

function initializeProductDragAndDrop() {
    const tbody = document.getElementById('product-list-tbody');
    if (sortableProducts) sortableProducts.destroy();
    if (tbody && typeof Sortable !== 'undefined') {
        sortableProducts = new Sortable(tbody, {
            animation: 150, handle: '.drag-handle',
            onEnd: async (evt) => {
                const orderedIds = Array.from(tbody.children).map(row => row.dataset.productId);
                try {
                    await api.updateProductOrder(orderedIds);
                    // 更新本地順序
                    orderedIds.forEach((id, index) => {
                       const product = allProducts.find(p => p.product_id === id);
                       if(product) product.display_order = index + 1;
                    });
                    allProducts.sort((a, b) => a.display_order - b.display_order);
                    applyProductFiltersAndRender(); // 重繪以確保正確
                } catch (error) { ui.toast.error(error.message); init(); }
            }
        });
    }
}

// --- CSV 功能 ---
function handleDownloadCsvTemplate() {
    const headers = ["產品名稱", "分類", "平日價格", "週五價格", "週六價格", "詳細介紹", "標籤(逗號分隔)", "是否上架(TRUE/FALSE)"];
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
                // 簡單映射，實務上可能需要更嚴謹的 Mapping
                const keyMap = {
                    "產品名稱": "name", "分類": "category", 
                    "平日價格": "price_weekday", "週五價格": "price_friday", "週六價格": "price_saturday",
                    "詳細介紹": "description", "標籤": "tags", "是否上架": "is_visible"
                };
                const key = keyMap[header] || header;
                obj[key] = values[index] ? values[index].trim().replace(/"/g, '') : "";
            });
            return obj;
        });

        if (!confirm(`您準備從 CSV 檔案匯入 ${data.length} 筆資料，確定嗎？`)) {
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

// --- Modal 操作 ---
function openProductModal(product = null) {
     const formBody = document.getElementById('edit-product-form-body');
     const form = document.getElementById('edit-product-form');
     // 修正：讀取 form_settings
     const formSettings = activeTemplate?.admin_config?.inventory?.form_settings || {};
     
     if (!formBody || !form) return;
     
     form.reset();
     formBody.innerHTML = '';

     const entityName = activeTemplate.terms?.PRODUCT_NAME || "產品";

    // --- 1. 建立基本欄位 (固定) ---
    formBody.appendChild(createFormField({ key: 'name', label: `${entityName}名稱`, required: true }));
    formBody.appendChild(createFormField({ key: 'category', label: '分類', required: true }));
    formBody.appendChild(createFormField({ key: 'description', label: '詳細介紹', type: 'textarea' }));

    // --- 2. 價格欄位 (依 price_mode 決定) ---
    if (formSettings.price_mode === 'complex') {
        formBody.appendChild(createFormField({ key: 'price_weekday', label: '平日價格', type: 'number', required: true }));
        formBody.appendChild(createFormField({ key: 'price_friday', label: '週五價格', type: 'number' }));
        formBody.appendChild(createFormField({ key: 'price_saturday', label: '週六/假日價格', type: 'number' }));
    } else {
        // simple mode
        formBody.appendChild(createFormField({ key: 'price_weekday', label: '價格', type: 'number', required: true }));
    }

    // --- 3. 庫存欄位 (依 stock_mode 決定) ---
    if (formSettings.stock_mode === 'quantity') {
        formBody.appendChild(createFormField({ key: 'stock_quantity', label: '庫存數量', type: 'number' }));
    } else if (formSettings.stock_mode === 'status') {
        // 簡單的狀態輸入
        formBody.appendChild(createFormField({ key: 'stock_status', label: '庫存狀態文字 (如: 有現貨)' }));
    }
    // date_based (民宿) 通常不在此設定庫存，而是在房況管理

     // --- 4. 處理圖片與規格區塊 ---
     const imageSection = document.getElementById('edit-product-image-section');
     const specSection = document.getElementById('edit-product-spec-section');
     const imageInputs = document.getElementById('edit-product-image-inputs');
     const specInputs = document.getElementById('edit-product-spec-inputs');
     
     if (imageInputs) imageInputs.innerHTML = '';
     if (specInputs) specInputs.innerHTML = '';
     
     // 圖片開關
     if (imageSection) imageSection.style.display = (formSettings.allow_image_upload !== false) ? 'block' : 'none';
     // 規格區塊
     if (specSection) specSection.style.display = 'block';

     const modalTitle = document.getElementById('modal-product-title');
     
    // --- 5. 填入資料 (編輯模式) ---
    if (product) {
        if (modalTitle) modalTitle.textContent = `編輯${entityName}：${product.name}`;

        // 填入基本欄位
        const setVal = (k) => {
            const el = document.getElementById(`edit-product-${k}`);
            if(el) el.value = product[k] || '';
        };
        setVal('name'); setVal('category'); setVal('description');
        setVal('stock_status');

        // 填入價格
        setVal('price_weekday'); setVal('price_friday'); setVal('price_saturday');
        
        // 填入庫存
        const stockEl = document.getElementById('edit-product-stock_quantity');
        if(stockEl) stockEl.value = product.stock_quantity !== null ? product.stock_quantity : '';

        // 填入圖片
         if (formSettings.allow_image_upload !== false && imageInputs) {
            try {
                const images = JSON.parse(product.images || '[]');
                if (images.length === 0) addImageInputField(imageInputs);
                else images.forEach(imgUrl => addImageInputField(imageInputs, imgUrl));
            } catch (e) { addImageInputField(imageInputs); }
        }
        
        // 填入規格 (依 specs_count 決定顯示數量，或動態)
         if (specInputs) {
            const count = formSettings.specs_count || 3; 
            for (let i = 1; i <= count; i++) {
                // 即使是空的也顯示欄位，方便編輯
                addSpecInputField(specInputs, product[`spec_${i}_name`] || '', product[`spec_${i}_value`] || '');
            }
        }
        
         let idInput = form.querySelector('input[name="product_id"]');
         if (!idInput) {
             idInput = document.createElement('input');
             idInput.type = 'hidden'; idInput.name = 'product_id';
             form.appendChild(idInput);
         }
         idInput.value = product.product_id;

    } else {
        // 新增模式
        if (modalTitle) modalTitle.textContent = `新增${entityName}`;
        if (formSettings.allow_image_upload !== false && imageInputs) addImageInputField(imageInputs);
        
        // 預設顯示 N 個規格欄位
        if (specInputs) {
            const count = formSettings.specs_count || 3;
            for(let i=0; i<count; i++) addSpecInputField(specInputs);
        }
         
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
    
    // 讀取設定
    const formSettings = activeTemplate?.admin_config?.inventory?.form_settings || {};

    // 1. 收集基本欄位
    const getVal = (name) => {
        const el = form.querySelector(`[name="${name}"]`);
        return el ? el.value : null;
    };

    data.name = getVal('name');
    data.category = getVal('category');
    data.description = getVal('description');
    
    // 2. 收集價格
    data.price_weekday = parseFloat(getVal('price_weekday')) || null;
    data.price_friday = parseFloat(getVal('price_friday')) || null;
    data.price_saturday = parseFloat(getVal('price_saturday')) || null;

    // 3. 收集庫存
    if (formSettings.stock_mode === 'quantity') {
        const qty = getVal('stock_quantity');
        data.stock_quantity = (qty === '' || qty === null) ? null : parseFloat(qty);
        data.inventory_management_type = 'quantity';
    } else if (formSettings.stock_mode === 'status') {
        data.stock_status = getVal('stock_status');
        data.inventory_management_type = 'status';
    } else {
        data.inventory_management_type = 'none'; // 或 date_based
    }
     
    // 4. 收集圖片與規格
     const images = Array.from(document.querySelectorAll('[name="images"]')).map(input => input.value.trim()).filter(Boolean);
     data.images = JSON.stringify(images);
     
     document.querySelectorAll('.spec-input-group').forEach((group, index) => {
         const i = index + 1;
         data[`spec_${i}_name`] = group.querySelector('[name="spec_name"]').value.trim() || '';
         data[`spec_${i}_value`] = group.querySelector('[name="spec_value"]').value.trim() || '';
     });

    // 5. 必填檢查
    if (!data.name) { ui.toast.error('名稱為必填！'); return; }
    if (data.price_weekday === null) { ui.toast.error('基本價格為必填！'); return; }

    // 6. 判斷新增或編輯
     const idInput = form.querySelector('input[name="product_id"]');
     if (idInput) { data.product_id = idInput.value; }
     const isCreating = !idInput;

    try {
        let responseData;
        if (isCreating) {
            responseData = await api.createProduct(data);
            if (responseData?.product) allProducts.push(responseData.product);
        } else {
            responseData = await api.updateProductDetails(data);
            const index = allProducts.findIndex(p => p.product_id === data.product_id);
            if (index > -1 && responseData?.readBack) {
                allProducts[index] = responseData.readBack;
            }
        }

        ui.hideModal('#edit-product-modal');
        allProducts.sort((a, b) => a.display_order - b.display_order);
        applyProductFiltersAndRender();
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
    if (statusText === null || statusText.trim() === '') return;

    if (!await ui.confirm(`確定要將 ${selectedIds.length} 個項目的庫存狀態設定為「${statusText}」嗎？`)) return;

    try {
        await api.batchUpdateStockStatus(selectedIds, statusText.trim());
        ui.toast.success(`成功更新 ${selectedIds.length} 個項目！`);
        await init();
    } catch (error) { ui.toast.error(`錯誤：${error.message}`); }
}

async function handleBatchDelete() {
    const selectedIds = Array.from(document.querySelectorAll('.product-checkbox:checked')).map(cb => cb.dataset.productId);
    if (selectedIds.length === 0) return ui.toast.error('請至少選取一個項目！');

    if (!await ui.confirm(`確定要刪除選取的 ${selectedIds.length} 個項目嗎？此操作無法復原。`)) return;

    try {
        await api.deleteProducts(selectedIds);
        ui.toast.success('刪除成功！');
        await init();
    } catch (error) { ui.toast.error(`錯誤：${error.message}`); }
}

function updateSelectAllCheckboxState() {
    const selectAllCheckbox = document.getElementById('select-all-products');
    const allProductCheckboxes = document.querySelectorAll('.product-checkbox');
    if (!selectAllCheckbox || allProductCheckboxes.length === 0) return;

    const allChecked = Array.from(allProductCheckboxes).every(checkbox => checkbox.checked);
    const someChecked = Array.from(allProductCheckboxes).some(checkbox => checkbox.checked);

    if (allChecked) { selectAllCheckbox.checked = true; selectAllCheckbox.indeterminate = false; }
    else if (someChecked) { selectAllCheckbox.checked = false; selectAllCheckbox.indeterminate = true; }
    else { selectAllCheckbox.checked = false; selectAllCheckbox.indeterminate = false; }
}

function setupEventListeners() {
     const page = document.getElementById('page-inventory');
     if (!page || page.dataset.initialized === 'true') return;

     document.addEventListener('click', e => {
        const modal = document.getElementById('edit-product-modal');
        if (modal && modal.contains(e.target)) {
            if (e.target.id === 'add-image-input-btn') { addImageInputField(document.getElementById('edit-product-image-inputs')); }
            else if (e.target.id === 'add-spec-input-btn') { addSpecInputField(document.getElementById('edit-product-spec-inputs')); }
            else if (e.target.classList.contains('btn-remove-input')) {
                e.target.closest('.dynamic-input-group')?.remove();
                updateDynamicButtonsState();
            }
        }
        
        if (page.contains(e.target)) {
             if (e.target.id === 'add-product-btn') { openProductModal(); } 
             else if (e.target.closest('.btn-edit-product')) {
                const button = e.target.closest('.btn-edit-product');
                if (button && button.dataset.productid) {
                     const product = allProducts.find(p => p.product_id === button.dataset.productid);
                     if (product) openProductModal(product);
                }
             }
             else if (e.target.id === 'download-csv-template-btn') { handleDownloadCsvTemplate(); }
        }
    });

    // 篩選器
    document.getElementById('inventory-stock-filter')?.addEventListener('click', e => {
        if (e.target.tagName === 'BUTTON') {
            e.target.parentElement.querySelector('.active')?.classList.remove('active');
            e.target.classList.add('active');
            applyProductFiltersAndRender();
        }
    });
    document.getElementById('inventory-visibility-filter')?.addEventListener('click', e => {
        if (e.target.tagName === 'BUTTON') {
            e.target.parentElement.querySelector('.active')?.classList.remove('active');
            e.target.classList.add('active');
            applyProductFiltersAndRender();
        }
    });

    // 批次按鈕
    document.getElementById('batch-publish-btn')?.addEventListener('click', () => handleBatchUpdate(true));
    document.getElementById('batch-unpublish-btn')?.addEventListener('click', () => handleBatchUpdate(false));
    document.getElementById('batch-set-stock-btn')?.addEventListener('click', handleBatchSetStock);
    document.getElementById('batch-delete-btn')?.addEventListener('click', handleBatchDelete);

    // 列表 checkbox
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


export const init = async () => {
    try {
        // 1. 取得樣板設定
        const activeTemplateKey = window.CONFIG.LOGIC.ACTIVE_INDUSTRY_TEMPLATE;
        activeTemplate = window.CONFIG.LOGIC.INDUSTRY_TEMPLATE_DEFINITIONS[activeTemplateKey];

        // 修正檢查路徑：改為檢查 admin_config.inventory
        if (!activeTemplate || !activeTemplate.admin_config || !activeTemplate.admin_config.inventory) {
            throw new Error(`樣板 "${activeTemplateKey}" 缺少 'admin_config.inventory' 設定。`); 
        }
        
        // 更新頁面標題
        // 從 terms 讀取名稱，例如 "房型管理" 或 "服務管理"
        const entityName = activeTemplate.terms?.PRODUCT_NAME || "產品";
        const pageTitle = document.querySelector('#page-inventory .page-header h2');
        if (pageTitle) pageTitle.textContent = `${entityName}管理`;

    } catch (e) {
        console.error("初始化失敗:", e);
        const tbody = document.getElementById('product-list-tbody');
        if (tbody) tbody.innerHTML = `<tr><td colspan="7" style="color: red; text-align: center;">${e.message}</td></tr>`;
        return;
    }

    const tbody = document.getElementById('product-list-tbody');
    if (tbody) tbody.innerHTML = `<tr><td colspan="7" style="text-align: center;">正在載入...</td></tr>`;

    try {
        allProducts = await api.getProducts();
        applyProductFiltersAndRender(); 
        initializeProductDragAndDrop();
        setupEventListeners(); 
    } catch (error) {
        console.error('載入失敗:', error);
        if (tbody) tbody.innerHTML = `<tr><td colspan="7" style="color: red; text-align:center;">${error.message}</td></tr>`;
    }
};