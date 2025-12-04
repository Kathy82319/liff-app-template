// public/admin/modules/productManagement.js
import { api } from '../api.js';
import { ui } from '../ui.js';
import { escapeHtml } from '../../utils.js';

let allProducts = [];
let sortableProducts = null;
let activeTemplate = null; 


// --- 圖片上傳 (保留空殼或實作) ---
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
    if (toolbar) toolbar.classList.remove('visible');
    const selectAllCheckbox = document.getElementById('select-all-products');
    if (selectAllCheckbox) { selectAllCheckbox.checked = false; selectAllCheckbox.indeterminate = false; }
}

// 2. 表單欄位生成器 (Dynamic Form Builder)
function createFormField(key, label, type = 'text', value = '', options = {}) {
    const formGroup = document.createElement('div');
    formGroup.className = 'form-group';
    
    // 標籤
    const labelEl = document.createElement('label');
    labelEl.textContent = label;
    labelEl.htmlFor = `edit-product-${key}`;
    formGroup.appendChild(labelEl);

    // 輸入控制項
    let inputEl;
    if (type === 'textarea') {
        inputEl = document.createElement('textarea');
        inputEl.rows = 4;
        inputEl.textContent = value || '';
    } else if (type === 'boolean') {
        // Toggle Switch
        const wrapper = document.createElement('div');
        wrapper.innerHTML = `<label class="switch"><input type="checkbox" id="edit-product-${key}" name="${key}" ${value ? 'checked' : ''}><span class="slider"></span></label>`;
        formGroup.appendChild(wrapper);
        return formGroup;
    } else {
        inputEl = document.createElement('input');
        inputEl.type = type;
        inputEl.value = (value === null || value === undefined) ? '' : value;
    }

    inputEl.id = `edit-product-${key}`;
    inputEl.name = key;
    if (options.placeholder) inputEl.placeholder = options.placeholder;
    if (options.required) inputEl.required = true;
    if (options.min !== undefined) inputEl.min = options.min;
    
    formGroup.appendChild(inputEl);
    return formGroup;
}

// --- 【核心修改】動態欄位生成 ---
function createFormField(field, mode) {
    // 1. 特殊欄位跳過
    if (['images', 'price'].includes(field.key)) return null;

    // 2. 價格欄位判斷
    const isPriceField = ['price_weekday', 'price_friday', 'price_saturday'].includes(field.key);
    if (isPriceField) {
        // 如果是 Single 模式，只顯示 price_weekday (作為單一價格)
        if (mode === 'single') {
            if (field.key !== 'price_weekday') return null; // 隱藏週五週六價
        }
        // 如果是 Range 模式，顯示所有 (除非欄位設定本身被停用，但在這裡我們假設藍圖有定義)
    }

    const formGroup = document.createElement('div');
    formGroup.className = 'form-group';
    
    // 標籤文字調整
    let labelText = field.label;
    if (mode === 'single' && field.key === 'price_weekday') {
        labelText = '價格'; // 單一模式下改名為「價格」
    }
    
    const label = document.createElement('label');
    label.htmlFor = `edit-product-${field.key}`;
    label.textContent = labelText + (field.required ? ' (必填)' : '');
    formGroup.appendChild(label);

    // 3. 輸入框生成
    if (field.type === 'image_url') {
        // ... (圖片上傳 UI 保持不變) ...
        const fileInputId = `image-upload-${field.key}-${Date.now()}`;
        formGroup.innerHTML += `
            <div class="dynamic-input-group" style="display:flex; gap:10px;">
                <input type="url" id="edit-product-${field.key}" name="${field.key}" placeholder="圖片網址" style="flex-grow:1;">
                <input type="file" id="${fileInputId}" accept="image/*" style="display:none;">
                <label for="${fileInputId}" class="action-btn" style="background:#17a2b8; cursor:pointer;">上傳</label>
            </div>`;
        const fileInput = formGroup.querySelector('input[type="file"]');
        fileInput.addEventListener('change', (e) => handleImageUpload(e.target.files[0], formGroup.querySelector('input[type="url"]'), formGroup.querySelector('label')));
        return formGroup;
    }

    let inputElement;
    if (field.type === 'textarea') {
        inputElement = document.createElement('textarea');
        inputElement.rows = 5;
    } else if (field.type === 'boolean') {
        inputElement = document.createElement('input');
        inputElement.type = 'checkbox';
        // boolean 的結構比較特殊 (Switch)
        formGroup.innerHTML = ''; // 清空
        formGroup.appendChild(label); // 加回 label
        const wrapper = document.createElement('div');
        wrapper.innerHTML = `<label class="switch"><input type="checkbox" id="edit-product-${field.key}" name="${field.key}"><span class="slider"></span></label>`;
        formGroup.appendChild(wrapper);
        return formGroup;
    } else if (field.type === 'select') {
        inputElement = document.createElement('select');
        (field.options || []).forEach(opt => inputElement.add(new Option(opt, opt)));
    } else {
        inputElement = document.createElement('input');
        inputElement.type = (field.type === 'number' || isPriceField) ? 'number' : 'text';
        if (inputElement.type === 'number') {
            inputElement.step = 'any'; inputElement.min = '0';
        }
    }

    inputElement.id = `edit-product-${field.key}`;
    inputElement.name = field.key;
    if (field.placeholder) inputElement.placeholder = field.placeholder;
    
    formGroup.appendChild(inputElement);
    return formGroup;
}

// ... (addImageInputField, addSpecInputField, updateDynamicButtonsState 保持不變) ...
function addImageInputField(container, value = '') {
    if (container.children.length >= 5) return;
    const div = document.createElement('div');
    div.className = 'dynamic-input-group';
    div.innerHTML = `
        <input type="url" name="images" placeholder="圖片網址" value="${value}" style="flex-grow:1;">
        <button type="button" class="btn-remove-input">⊖</button>
    `;
    div.querySelector('button').onclick = () => div.remove();
    container.appendChild(div);
}

function setupSpecSection(product) {
    const container = document.getElementById('edit-product-spec-inputs');
    if (!container) return;
    container.innerHTML = '';
    
    // 總是產生 1 個空的或填入現有的
    let hasSpec = false;
    for (let i = 1; i <= 5; i++) {
        const name = product ? product[`spec_${i}_name`] : '';
        const val = product ? product[`spec_${i}_value`] : '';
        if (name || val) {
            addSpecInputField(container, name, val);
            hasSpec = true;
        }
    }
    if (!hasSpec) addSpecInputField(container);
}
function addSpecInputField(container, name = '', value = '') {
    if (container.children.length >= 5) return;
    const div = document.createElement('div');
    div.className = 'spec-input-group dynamic-input-group';
    div.innerHTML = `
        <input type="text" name="spec_name" placeholder="規格名稱" value="${name}">
        <textarea name="spec_value" placeholder="內容" rows="1">${value}</textarea>
        <button type="button" class="btn-remove-input">⊖</button>
    `;
    div.querySelector('button').onclick = () => div.remove();
    container.appendChild(div);
}
function updateDynamicButtonsState() {
    const img = document.getElementById('edit-product-image-inputs');
    const spec = document.getElementById('edit-product-spec-inputs');
    if(img) document.getElementById('add-image-input-btn').style.display = (img.children.length < 5) ? 'block' : 'none';
    if(spec) document.getElementById('add-spec-input-btn').style.display = (spec.children.length < 5) ? 'block' : 'none';
}

function renderProductList(products) {
    const tbody = document.getElementById('product-list-tbody');
    const theadTr = document.querySelector('#page-inventory thead tr');
    if (!tbody || !theadTr || !activeTemplate) return;

    // 1. 處理表頭
    let headerHTML = `<th style="width:40px;"><input type="checkbox" id="select-all-products"></th><th style="width:50px;">順序</th>`;
    
    // 根據 booking mode 決定價格欄位顯示
    const config = activeTemplate?.client_config?.booking || {};
    const mode = config.mode || 'range'; // default range (guesthouse)

    activeTemplate.logic.adminColumns.forEach(col => {
        if (!col.enabled) return;
        // 如果是 price，根據模式調整標題
        if (col.key === 'price') {
            headerHTML += `<th>${mode === 'single' ? '價格' : '價格(平日/五/六)'}</th>`;
        } else {
            headerHTML += `<th>${col.label}</th>`;
        }
    });
    headerHTML += `<th style="width:80px;">上架</th><th style="width:80px;">操作</th>`;
    theadTr.innerHTML = headerHTML;

    // 2. 處理內容
    tbody.innerHTML = '';
    products.forEach(p => {
        const row = tbody.insertRow();
        row.dataset.productId = p.product_id;
        row.className = 'draggable-row'; // 支援拖曳

        let html = `<td><input type="checkbox" class="product-checkbox" data-product-id="${p.product_id}"></td>
                    <td class="drag-handle-cell"><span class="drag-handle">⠿</span> ${p.display_order}</td>`;
        
        activeTemplate.logic.adminColumns.forEach(col => {
            if (!col.enabled) return;
            
            let val = 'N/A';
            if (col.key === 'price') {
                if (mode === 'single') {
                    val = `$${p.price_weekday || '-'}`;
                } else {
                    val = `${p.price_weekday||'-'}/${p.price_friday||'-'}/${p.price_saturday||'-'}`;
                }
            } else {
                val = escapeHtml(p[col.key] || '');
                if (val.length > 50) val = val.substring(0, 47) + '...';
            }
            html += `<td>${val}</td>`;
        });

        html += `<td><label class="switch"><input type="checkbox" class="visibility-toggle" data-product-id="${p.product_id}" ${p.is_visible ? 'checked' : ''}><span class="slider"></span></label></td>`;
        html += `<td class="actions-cell"><button class="action-btn btn-edit-product" data-productid="${p.product_id}" style="background-color: var(--color-warning); color: #000;">編輯</button></td>`;
        
        row.innerHTML = html;
    });
}

function openProductModal(product = null) {
    const formBody = document.getElementById('edit-product-form-body');
    const form = document.getElementById('edit-product-form');
    const modalTitle = document.getElementById('modal-product-title');
    
    if (!formBody || !form) return;
    
    // A. 讀取設定
    const activeKey = window.CONFIG?.LOGIC?.ACTIVE_INDUSTRY_TEMPLATE;
    const config = window.CONFIG?.LOGIC?.INDUSTRY_TEMPLATE_DEFINITIONS[activeKey]?.admin_config?.products || {};
    const priceMode = config.price_mode || 'simple'; // simple | complex
    const inventoryMode = config.inventory_mode || 'quantity'; // quantity | date_based | none
    const enableImage = config.enable_image_upload !== false;

    // B. 清空並重置表單
    form.reset();
    formBody.innerHTML = '';
    
    // C. 動態生成欄位
    // C-1. 基本資訊
    formBody.appendChild(createFormField('name', '名稱', 'text', product?.name, { required: true }));
    formBody.appendChild(createFormField('category', '分類', 'text', product?.category));
    formBody.appendChild(createFormField('description', '詳細介紹', 'textarea', product?.description));
    
    // C-2. 價格欄位 (根據模式)
    if (priceMode === 'complex') {
        const row = document.createElement('div');
        row.style.cssText = 'display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 10px;';
        row.appendChild(createFormField('price_weekday', '平日價格', 'number', product?.price_weekday, { min: 0 }));
        row.appendChild(createFormField('price_friday', '週五價格', 'number', product?.price_friday, { min: 0 }));
        row.appendChild(createFormField('price_saturday', '週六價格', 'number', product?.price_saturday, { min: 0 }));
        formBody.appendChild(row);
    } else {
        // Simple Mode: 只顯示一個「價格」欄位，對應後端的 price_weekday
        formBody.appendChild(createFormField('price_weekday', '價格', 'number', product?.price_weekday, { min: 0, required: true }));
    }

    // C-3. 庫存欄位 (根據模式)
    if (inventoryMode === 'quantity') {
        formBody.appendChild(createFormField('stock_quantity', '庫存數量', 'number', product?.stock_quantity, { min: 0 }));
    } else if (inventoryMode === 'date_based') {
        const hint = document.createElement('p');
        hint.style.cssText = 'color: #666; font-size: 0.9em; background: #f0f0f0; padding: 8px; border-radius: 4px;';
        hint.textContent = '此模式採用「日期制房況」，請至「房量控管」頁面設定每日庫存。';
        formBody.appendChild(hint);
    }
    // none 模式則不顯示任何庫存欄位

    // C-4. 狀態開關
    formBody.appendChild(createFormField('is_visible', '是否上架', 'boolean', product?.is_visible));

    // C-5. 圖片 (固定顯示，但根據設定決定是否允許上傳)
    // 這裡我們沿用舊的動態圖片欄位邏輯，但放在 formBody 之外的 dedicated section
    setupImageSection(product, enableImage);

    // C-6. 規格 (固定顯示 5 組)
    setupSpecSection(product);

    // 設定 ID 與標題
    let idInput = form.querySelector('input[name="product_id"]');
    if (!idInput) {
        idInput = document.createElement('input');
        idInput.type = 'hidden'; idInput.name = 'product_id';
        form.appendChild(idInput);
    }
    
    if (product) {
        modalTitle.textContent = `編輯：${product.name}`;
        idInput.value = product.product_id;
    } else {
        modalTitle.textContent = '新增產品/服務';
        idInput.value = '';
    }

    ui.showModal('#edit-product-modal');
}

// 4. 輔助區塊渲染 (圖片與規格)
function setupImageSection(product, enableUpload) {
    const container = document.getElementById('edit-product-image-inputs');
    if (!container) return;
    container.innerHTML = '';
    
    // 如果 config 關閉上傳，隱藏按鈕 (這裡簡單處理，實際可隱藏整個區塊)
    const addBtn = document.getElementById('add-image-input-btn');
    if (addBtn) addBtn.style.display = enableUpload ? 'block' : 'none';

    // 填入現有圖片
    try {
        const images = JSON.parse(product?.images || '[]');
        if (images.length === 0) addImageInputField(container, '');
        else images.forEach(url => addImageInputField(container, url));
    } catch { addImageInputField(container, ''); }
}

async function handleFormSubmit(event) {
    event.preventDefault();
    const form = event.target;
    const formData = new FormData(form);
    const data = Object.fromEntries(formData.entries());

    // 處理特殊欄位
    data.is_visible = form.querySelector('[name="is_visible"]').checked;
    
    // 處理圖片 JSON
    const images = Array.from(document.querySelectorAll('[name="images"]')).map(i => i.value.trim()).filter(Boolean);
    data.images = JSON.stringify(images);

    // 處理規格
    document.querySelectorAll('.spec-input-group').forEach((group, index) => {
        const i = index + 1;
        data[`spec_${i}_name`] = group.querySelector('[name="spec_name"]').value.trim();
        data[`spec_${i}_value`] = group.querySelector('[name="spec_value"]').value.trim();
    });

    // 處理價格與庫存的空值 (轉為 null 以符合 DB)
    ['price_weekday', 'price_friday', 'price_saturday', 'stock_quantity'].forEach(k => {
        if (data[k] === '') data[k] = null;
        else data[k] = Number(data[k]);
    });

    // 如果是 Simple 模式，將 weekday 價格視為主要價格 (後端邏輯相容)
    // 這裡不做額外轉換，直接送出即可，因為 create-product API 會接收所有欄位

    const submitBtn = form.querySelector('button[type="submit"]');
    submitBtn.disabled = true; submitBtn.textContent = '儲存中...';

    try {
        if (data.product_id) {
            await api.updateProductDetails(data);
        } else {
            await api.createProduct(data);
        }
        ui.toast.success('儲存成功！');
        ui.hideModal('#edit-product-modal');
        await init(); // 重新載入列表
    } catch (e) {
        ui.toast.error(`儲存失敗: ${e.message}`);
    } finally {
        submitBtn.disabled = false; submitBtn.textContent = '儲存';
    }
}

function setupEventListeners() {
    const page = document.getElementById('page-inventory');
    if (!page || page.dataset.initialized === 'true') return;

    document.addEventListener('click', e => {
        if (e.target.id === 'add-product-btn') openProductModal();
        if (e.target.closest('.btn-edit-product')) {
            const pid = e.target.closest('.btn-edit-product').dataset.productid;
            const p = allProducts.find(x => x.product_id === pid);
            if (p) openProductModal(p);
        }
        if (e.target.id === 'add-image-input-btn') addImageInputField(document.getElementById('edit-product-image-inputs'));
        if (e.target.id === 'add-spec-input-btn') addSpecInputField(document.getElementById('edit-product-spec-inputs'));
    });

    const form = document.getElementById('edit-product-form');
    if (form) form.addEventListener('submit', handleFormSubmit);

    // ... (保留原有的列表拖曳、篩選等監聽器) ...
    page.dataset.initialized = 'true';
}


export const init = async () => {
    try {
        if (!window.CONFIG) throw new Error("Config not loaded");
        const key = window.CONFIG.LOGIC.ACTIVE_INDUSTRY_TEMPLATE;
        activeTemplate = window.CONFIG.LOGIC.INDUSTRY_TEMPLATE_DEFINITIONS[key];
        
        allProducts = await api.getProducts();
        setupEventListeners();
        
        // 渲染列表
        renderProductList(allProducts);
        
        // 綁定事件 (只綁一次)
        const page = document.getElementById('page-inventory');
        if (page && !page.dataset.initialized) {
            document.addEventListener('click', e => {
                if (e.target.id === 'add-product-btn') openProductModal();
                if (e.target.matches('.btn-edit-product')) {
                    const p = allProducts.find(x => x.product_id === e.target.dataset.productid);
                    if (p) openProductModal(p);
                }
                // ... 其他事件
            });
            document.getElementById('edit-product-form')?.addEventListener('submit', handleFormSubmit);
            page.dataset.initialized = 'true';
        }

    } catch (e) {
        console.error("Product Init Error", e);
    }
};