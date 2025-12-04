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
    const cb = document.getElementById('select-all-products');
    if (cb) { cb.checked = false; cb.indeterminate = false; }
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
    div.innerHTML = `<input type="url" name="images" placeholder="圖片網址" value="${value}"><button type="button" class="btn-remove-input">⊖</button>`;
    container.appendChild(div);
    updateDynamicButtonsState();
}
function addSpecInputField(container, name = '', value = '') {
    if (container.children.length >= 5) return;
    const div = document.createElement('div');
    div.className = 'spec-input-group dynamic-input-group';
    div.innerHTML = `<input type="text" name="spec_name" placeholder="規格名" value="${name}"><textarea name="spec_value" placeholder="內容" rows="2">${value}</textarea><button type="button" class="btn-remove-input">⊖</button>`;
    container.appendChild(div);
    updateDynamicButtonsState();
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
    if (!formBody || !form) return;

    form.reset();
    formBody.innerHTML = '';

    const config = activeTemplate?.client_config?.booking || {};
    const mode = config.mode || 'range';
    const entityName = activeTemplate.logic.adminEntityName || "產品";
    
    document.getElementById('modal-product-title').textContent = product ? `編輯${entityName}` : `新增${entityName}`;

    // 生成欄位
    activeTemplate.fields.forEach(field => {
        // [關鍵] 傳入 mode，讓 createFormField 決定顯示與否
        const fieldEl = createFormField(field, mode);
        if (fieldEl) formBody.appendChild(fieldEl);
    });

    // 處理特殊區塊
    const imgSection = document.getElementById('edit-product-image-section');
    const specSection = document.getElementById('edit-product-spec-section');
    const imgInputs = document.getElementById('edit-product-image-inputs');
    const specInputs = document.getElementById('edit-product-spec-inputs');
    
    if(imgInputs) imgInputs.innerHTML = '';
    if(specInputs) specInputs.innerHTML = '';
    
    if (imgSection) imgSection.style.display = 'block'; 
    if (specSection) specSection.style.display = 'block';

    // 填值 (Edit Mode)
    if (product) {
        // ID
        let idInput = form.querySelector('input[name="product_id"]');
        if (!idInput) {
             idInput = document.createElement('input');
             idInput.type = 'hidden'; idInput.name = 'product_id';
             form.appendChild(idInput);
        }
        idInput.value = product.product_id;

        // 一般欄位
        activeTemplate.fields.forEach(field => {
            const input = document.getElementById(`edit-product-${field.key}`);
            if (input) {
                if (field.type === 'boolean') input.checked = !!product[field.key];
                else input.value = product[field.key] || '';
            }
        });

        // 圖片
        try {
            const images = JSON.parse(product.images || '[]');
            if (images.length === 0) addImageInputField(imgInputs);
            else images.forEach(url => addImageInputField(imgInputs, url));
        } catch(e) { addImageInputField(imgInputs); }

        // 規格
        let specAdded = false;
        for(let i=1; i<=5; i++) {
            if(product[`spec_${i}_name`] || product[`spec_${i}_value`]) {
                addSpecInputField(specInputs, product[`spec_${i}_name`], product[`spec_${i}_value`]);
                specAdded = true;
            }
        }
        if (!specAdded) addSpecInputField(specInputs);

    } else {
        // Create Mode
        const idInput = form.querySelector('input[name="product_id"]');
        if (idInput) idInput.remove();
        
        addImageInputField(imgInputs);
        addSpecInputField(specInputs);
    }

    updateDynamicButtonsState();
    ui.showModal('#edit-product-modal');
}

async function handleFormSubmit(event) {
    event.preventDefault();
    const form = event.target;
    const data = {};
    
    // 1. 收集動態欄位
    activeTemplate.fields.forEach(field => {
        const input = form.querySelector(`[name="${field.key}"]`);
        if (input) {
            if (field.type === 'boolean') data[field.key] = input.checked;
            else data[field.key] = (input.type === 'number' && input.value !== '') ? parseFloat(input.value) : input.value;
        }
    });

    // 2. 收集特殊欄位
    const images = Array.from(document.querySelectorAll('[name="images"]')).map(i => i.value.trim()).filter(Boolean);
    data.images = JSON.stringify(images);
    
    document.querySelectorAll('.spec-input-group').forEach((group, i) => {
        data[`spec_${i+1}_name`] = group.querySelector('[name="spec_name"]').value.trim();
        data[`spec_${i+1}_value`] = group.querySelector('[name="spec_value"]').value.trim();
    });

    const idInput = form.querySelector('input[name="product_id"]');
    if (idInput) data.product_id = idInput.value;

    // 3. 提交
    try {
        if (data.product_id) await api.updateProductDetails(data);
        else await api.createProduct(data);
        
        ui.toast.success('儲存成功');
        ui.hideModal('#edit-product-modal');
        await init(); // 重整列表
    } catch(e) {
        ui.toast.error(e.message);
    }
}

// ... (setupEventListeners, applyProductFiltersAndRender 保持原樣或微調) ...

export const init = async () => {
    try {
        if (!window.CONFIG) throw new Error("Config not loaded");
        const key = window.CONFIG.LOGIC.ACTIVE_INDUSTRY_TEMPLATE;
        activeTemplate = window.CONFIG.LOGIC.INDUSTRY_TEMPLATE_DEFINITIONS[key];
        
        allProducts = await api.getProducts();
        
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