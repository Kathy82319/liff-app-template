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

// --- 根據藍圖生成表單欄位 ---
function createFormField(field) {
    const formGroup = document.createElement('div');
    formGroup.className = 'form-group';

    const label = document.createElement('label');
    label.htmlFor = `edit-product-${field.key}`;
    label.textContent = field.label;
    if (field.required) {
        label.textContent += ' (必填)';
    }
    formGroup.appendChild(label);

    let inputElement;
    switch (field.type) {
        case 'textarea':
            inputElement = document.createElement('textarea');
            inputElement.rows = 5;
            break;
        case 'boolean':
            // 為了樣式統一，布林值也用 div 包起來
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
        default: // 'text', 'number', 'url' 等
            inputElement = document.createElement('input');
            inputElement.type = field.type;
            if (field.placeholder) {
                inputElement.placeholder = field.placeholder;
            }
            break;
    }

    if (field.type !== 'boolean') {
        formGroup.appendChild(inputElement);
    }
    
    inputElement.id = `edit-product-${field.key}`;
    inputElement.name = field.key;

    return formGroup;
}

// --- 【全新】動態欄位輔助函式 ---
function addImageInputField(container, value = '') {
    const count = container.children.length;
    if (count >= 5) return;
    const newGroup = document.createElement('div');
    newGroup.className = 'dynamic-input-group';
    newGroup.innerHTML = `
        <input type="url" name="images" placeholder="${count + 1}. 請貼上圖片網址" value="${value}">
        <button type="button" class="btn-remove-input">⊖</button>
    `;
    container.appendChild(newGroup);
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
    const specContainer = document.getElementById('edit-product-spec-inputs');
    if (!imageContainer || !specContainer) return;
    document.getElementById('add-image-input-btn').style.display = (imageContainer.children.length < 5) ? 'block' : 'none';
    document.getElementById('add-spec-input-btn').style.display = (specContainer.children.length < 5) ? 'block' : 'none';
}


// --- 渲染與篩選函式 ---
// 【小幅修改】 renderProductList，以符合藍圖
function renderProductList(products) {
    const productListTbody = document.getElementById('product-list-tbody');
    const productListThead = document.querySelector('#page-inventory thead tr');
    if (!productListTbody || !productListThead) return;

    // 動態生成表頭
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

    // 生成內容
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
            rowHTML += `<td>${p[col.key] || 'N/A'}</td>`;
        });
        rowHTML += `
            <td><label class="switch"><input type="checkbox" class="visibility-toggle" data-product-id="${p.product_id}" ${p.is_visible ? 'checked' : ''}><span class="slider"></span></label></td>
            <td class="actions-cell"><button class="action-btn btn-edit-product" data-productid="${p.product_id}" style="background-color: var(--color-warning); color: #000;">編輯</button></td>
        `;
        row.innerHTML = rowHTML;
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

    // 【新增】套用「庫存狀態」篩選 (根據您的邏輯)
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

// --- 【大幅修改】Modal (彈窗) 相關函式 ---
function openProductModal(product = null) {
    const formBody = document.getElementById('edit-product-form-body');
    const form = document.getElementById('edit-product-form');
    if (!formBody || !form) return;

    form.reset();
    formBody.innerHTML = ''; 

    // 1. 根據藍圖動態生成主要表單
    activeTemplate.fields.forEach(field => {
        const formField = createFormField(field);
        formBody.appendChild(formField);
    });

    // 2. 【新增】根據藍圖決定是否顯示特殊欄位區塊
    const imageSection = document.getElementById('edit-product-image-section');
    const specSection = document.getElementById('edit-product-spec-section');
    const imageInputs = document.getElementById('edit-product-image-inputs');
    const specInputs = document.getElementById('edit-product-spec-inputs');

    // 清空舊的動態欄位
    imageInputs.innerHTML = '';
    specInputs.innerHTML = '';

    // 判斷藍圖中是否有 'images' 欄位，來決定是否顯示圖片區塊
    const hasImages = activeTemplate.fields.some(f => f.key === 'images');
    imageSection.style.display = hasImages ? 'block' : 'none';

    // 判斷藍圖中是否有 'spec' 相關欄位，來決定是否顯示規格區塊
    const hasSpecs = activeTemplate.fields.some(f => f.key.startsWith('spec_'));
    specSection.style.display = hasSpecs ? 'block' : 'none';

    // 3. 處理 Modal 標題
    const modalTitle = document.getElementById('modal-product-title');
    const pageTitle = document.querySelector('#page-inventory .page-header h2');
    pageTitle.textContent = `${activeTemplate.entityNamePlural}管理`;

    // 4. 填入資料 (編輯模式)
    if (product) {
        modalTitle.textContent = `編輯${activeTemplate.entityName}：${product.name}`;
        
        // 填入主要欄位資料
        activeTemplate.fields.forEach(field => {
            const input = document.getElementById(`edit-product-${field.key}`);
            if (input && field.key !== 'images' && !field.key.startsWith('spec_')) {
                if (field.type === 'boolean') {
                    input.checked = !!product[field.key];
                } else {
                    input.value = product[field.key] || '';
                }
            }
        });
        
        // 【新增】填入圖片和規格資料
        if (hasImages) {
            try {
                const images = JSON.parse(product.images || '[]');
                if (images.length === 0) {
                    addImageInputField(imageInputs); // 如果沒有圖片，至少顯示一個空欄位
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
            if (!specAdded) addSpecInputField(specInputs); // 如果沒有規格，至少顯示一組空欄位
        }

        // 處理 product_id (隱藏欄位)
        let idInput = form.querySelector('input[name="product_id"]');
        if (!idInput) {
            idInput = document.createElement('input');
            idInput.type = 'hidden';
            idInput.name = 'product_id';
            form.appendChild(idInput);
        }
        idInput.value = product.product_id;

    } else {
        // --- 新增模式 ---
        modalTitle.textContent = `新增${activeTemplate.entityName}`;
        if (hasImages) addImageInputField(imageInputs);
        if (hasSpecs) addSpecInputField(specInputs);
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

    // 1. 讀取主要欄位資料
    activeTemplate.fields.forEach(field => {
        const input = form.querySelector(`[name="${field.key}"]`);
        if (input && field.key !== 'images' && !field.key.startsWith('spec_')) {
            if (field.type === 'boolean') {
                data[field.key] = input.checked;
            } else {
                data[field.key] = input.value;
            }
        }
    });

    // 2. 【新增】讀取特殊欄位資料 (圖片和規格)
    const images = Array.from(document.querySelectorAll('[name="images"]')).map(input => input.value.trim()).filter(Boolean);
    data.images = JSON.stringify(images);

    document.querySelectorAll('.spec-input-group').forEach((group, index) => {
        const i = index + 1;
        data[`spec_${i}_name`] = group.querySelector('[name="spec_name"]').value.trim() || null;
        data[`spec_${i}_value`] = group.querySelector('[name="spec_value"]').value.trim() || null;
    });
    
    // 3. 檢查必填
    for (const field of activeTemplate.fields) {
        if (field.required && !data[field.key]) {
            ui.toast.error(`「${field.label}」為必填欄位！`);
            return;
        }
    }
    
    // 4. 處理 ID
    const idInput = form.querySelector('input[name="product_id"]');
    const isCreating = !idInput;
    if (!isCreating) {
        data.product_id = idInput.value;
    }

    // 5. 提交 API
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

    if (!confirm(`確定要將 ${selectedIds.length} 個項目的庫存狀態設定為「${statusText}」嗎？`)) return;

    try {
        await api.batchUpdateStockStatus(selectedIds, statusText.trim());
        ui.toast.success(`成功更新 ${selectedIds.length} 個項目！`);
        await init();
    } catch (error) {
        ui.toast.error(`錯誤：${error.message}`);
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
        if (target.id === 'add-product-btn') {
            openProductModal();
        }
        if (target.id === 'download-csv-template-btn') { /* ... */ }
        
        const editButton = target.closest('.btn-edit-product');
        if (editButton) {
            const product = allProducts.find(p => p.product_id === editButton.dataset.productid);
            if (product) openProductModal(product);
        }

        // 【新增】處理動態新增/移除按鈕的邏輯
        if (target.id === 'add-image-input-btn') {
            addImageInputField(document.getElementById('edit-product-image-inputs'));
        }
        if (target.id === 'add-spec-input-btn') {
            addSpecInputField(document.getElementById('edit-product-spec-inputs'));
        }
        if (target.classList.contains('btn-remove-input')) {
            target.closest('.dynamic-input-group').remove();
            updateDynamicButtonsState();
        }
    });

    // 監聽篩選器按鈕的點擊事件
    function addFilterGroupListener(groupId) {
        const filterGroup = document.getElementById(groupId);
        if (filterGroup) {
            filterGroup.addEventListener('click', (e) => {
                if (e.target.tagName === 'BUTTON') {
                    // 移除同組按鈕的 active 狀態
                    filterGroup.querySelector('.active')?.classList.remove('active');
                    // 為被點擊的按鈕加上 active 狀態
                    e.target.classList.add('active');
                    // 重新套用所有篩選並渲染列表
                    applyProductFiltersAndRender();
                }
            });
        }
    }

    addFilterGroupListener('inventory-stock-filter');
    addFilterGroupListener('inventory-visibility-filter');

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
                    ui.toast.error(`更新失敗: ${error.message}`);
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
    // 【新增】在初始化時，先決定要用哪個樣板
    try {
        const activeTemplateKey = window.CONFIG.LOGIC.ACTIVE_INDUSTRY_TEMPLATE;
        activeTemplate = window.CONFIG.LOGIC.INDUSTRY_TEMPLATE_DEFINITIONS[activeTemplateKey];
        if (!activeTemplate) {
            throw new Error(`在設定中找不到名為 "${activeTemplateKey}" 的商業樣板。`);
        }
    } catch (e) {
        console.error("讀取商業樣板失敗:", e);
        document.getElementById('page-inventory').innerHTML = `<p style="color:red;">讀取商業樣板設定失敗，請檢查系統設定。</p>`;
        return;
    }

    const tbody = document.getElementById('product-list-tbody');
    if (!tbody) return;
    tbody.innerHTML = `<tr><td colspan="7" style="text-align: center;">正在載入${activeTemplate.entityNamePlural}...</td></tr>`;
    
    // 【新增】更新頁面標題
    const pageTitle = document.querySelector('#page-inventory .page-header h2');
    if (pageTitle) pageTitle.textContent = `${activeTemplate.entityNamePlural}管理`;

    try {
        allProducts = await api.getProducts();
        applyProductFiltersAndRender();
        initializeProductDragAndDrop();
        setupEventListeners(); // 確保事件監聽器在此之後設定
    } catch (error) {
        console.error('初始化產品頁失敗:', error);
        tbody.innerHTML = `<tr><td colspan="7" style="color: red; text-align:center;">讀取失敗: ${error.message}</td></tr>`;
    }
};