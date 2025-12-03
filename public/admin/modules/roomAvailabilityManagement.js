// public/admin/modules/roomAvailabilityManagement.js
import { api } from '../api.js';
import { ui } from '../ui.js';

let currentProducts = []; 
let currentInventoryData = {}; 
let dateRangePicker = null; 
let bulkEditDatePicker = null; 
let displayedDates = []; 
let isDatePickerInitialized = false; 

const weekdayShort = ["日", "一", "二", "三", "四", "五", "六"];

// --- 核心渲染函式 (符合新設計 v5) ---
function renderAvailabilityGrid() {
    console.log("[RenderGrid] Starting grid rendering...");
    const container = document.getElementById('rav-grid-container');
    const productSelect = document.getElementById('rav-product-select');
    const soldOutSection = document.getElementById('rav-sold-out-section');
    const soldOutList = document.getElementById('rav-sold-out-list');

    if (!container || !productSelect) return;

    const selectedProductId = productSelect.value;
    const productsToRender = selectedProductId === 'all'
        ? currentProducts
        : currentProducts.filter(p => p.product_id === selectedProductId);

    if (productsToRender.length === 0) {
        container.innerHTML = '<p>沒有找到符合條件的房型。</p>';
        return;
    }
    if (displayedDates.length === 0) {
        container.innerHTML = '<p>請先選擇有效的日期範圍。</p>';
        return;
    }

    // --- 準備資料：判斷過往日期與收集售完資料 ---
    const today = new Date();
    today.setHours(0, 0, 0, 0); // 歸零時分秒以便比較
    const soldOutData = {}; // { date: [productName, ...] }

    // --- 表格 HTML 生成 ---
    let tableHtml = '<table class="rav-table" style="width: 100%; border-collapse: collapse;">';

    // 表頭
    tableHtml += '<thead><tr><th style="min-width: 150px; position: sticky; left: 0; background: var(--color-sidebar-bg, #FFF); z-index: 2;">房型</th>';
    displayedDates.forEach(dateStr => {
        const date = new Date(dateStr + 'T00:00:00');
        const monthDay = `${date.getMonth() + 1}/${date.getDate()}`;
        const dayOfWeek = weekdayShort[date.getDay()];
        const isWeekend = date.getDay() === 0 || date.getDay() === 6;
        
        // 判斷是否為過去日期 (用來標示表頭顏色，可選)
        const isPast = date < today;
        const headerStyle = isPast ? 'color: #999; background: #f0f0f0;' : (isWeekend ? 'color: var(--color-primary, blue);' : '');

        tableHtml += `<th style="min-width: 110px; text-align: center; ${headerStyle}">${monthDay}<br>${dayOfWeek}</th>`;
    });
    tableHtml += '</tr></thead>';

    // 表格內容
    tableHtml += '<tbody>';
    productsToRender.forEach(product => {
        tableHtml += `<tr>`;
        tableHtml += `<td style="font-weight: bold; position: sticky; left: 0; background: var(--color-sidebar-bg, #FFF); z-index: 1; border-right: 1px solid var(--color-border, #CCC);">${product.name}</td>`;

        displayedDates.forEach(dateStr => {
            const dateObj = new Date(dateStr + 'T00:00:00');
            const isPast = dateObj < today;

            const inventory = currentInventoryData[product.product_id]?.[dateStr];
            const status = inventory?.status || 'Closed';
            const quantity = inventory?.quantity_available ?? 0;
            const price = inventory?.base_price;
            const priceText = (price === null || price === undefined) ? '' : String(price);

            // 計算視覺樣式
            let visuals = calculateCellVisuals(status, quantity, price);

            // 【修改】如果是過去日期，強制覆蓋為「已過」樣式
            if (isPast) {
                visuals = {
                    bgColor: '#eeeeee',
                    tooltip: '日期已過',
                    iconHtml: '',
                    inputsDisabled: true,
                    buttonBgColor: '#ccc',
                    buttonText: '已過',
                    buttonTextColor: '#666'
                };
            } 
            // 【新增】如果是未來日期且售完，加入售完清單
            else if (quantity === 0 && status === 'Open') {
                if (!soldOutData[dateStr]) soldOutData[dateStr] = [];
                soldOutData[dateStr].push(product.name);
            }

            tableHtml += `
                <td style="border: 1px solid var(--color-border, #CCC); padding: 5px; text-align: center; vertical-align: top; background-color: ${visuals.bgColor};"
                    data-product-id="${product.product_id}" data-date="${dateStr}" title="${visuals.tooltip}">
                    <div style="margin-bottom: 3px;">
                        <button class="status-toggle action-btn" data-status="${status}"
                                style="width: 100%; font-size: 0.8em; padding: 2px 4px; background-color: ${visuals.buttonBgColor}; color: ${visuals.buttonTextColor};"
                                ${isPast ? 'disabled' : ''}>
                            ${visuals.buttonText}
                        </button>
                    </div>
                    <div style="margin-bottom: 3px;">
                        <input type="number" class="quantity-input" value="${quantity}" min="0" data-original-value="${quantity}"
                               style="width: 90%; text-align: center; font-size: 0.9em; padding: 2px;" ${visuals.inputsDisabled ? 'disabled' : ''}>
                    </div>
                    <div>
                        <input type="number" class="price-input" value="${priceText}" placeholder="預設" min="0" data-original-value="${priceText}"
                               style="width: 90%; text-align: center; font-size: 0.9em; padding: 2px;" ${visuals.inputsDisabled ? 'disabled' : ''}>
                        ${visuals.iconHtml}
                    </div>
                </td>`;
        });
        tableHtml += `</tr>`;
    });
    tableHtml += '</tbody></table>';

    container.innerHTML = tableHtml;
    console.log("[RenderGrid] Grid rendering finished.");

    // --- 渲染售完清單 ---
    renderSoldOutSummary(soldOutData, soldOutSection, soldOutList);
    
    // 綁定事件
    bindCellEvents(); 
}

// --- 輔助：渲染售完清單 ---
function renderSoldOutSummary(data, sectionEl, listEl) {
    if (!sectionEl || !listEl) return;
    
    listEl.innerHTML = '';
    const sortedDates = Object.keys(data).sort();

    if (sortedDates.length === 0) {
        sectionEl.style.display = 'none';
        return;
    }

    sectionEl.style.display = 'block';
    
    sortedDates.forEach(dateStr => {
        const items = data[dateStr];
        const dateObj = new Date(dateStr + 'T00:00:00');
        const dayOfWeek = weekdayShort[dateObj.getDay()];
        
        const groupDiv = document.createElement('div');
        groupDiv.className = 'sold-out-group';
        
        const header = `<div class="sold-out-date-header"><span>📅 ${dateStr} (${dayOfWeek})</span></div>`;
        const tags = items.map(name => `<span class="sold-out-item">${name}</span>`).join('');
        
        groupDiv.innerHTML = header + '<div style="display: flex; flex-wrap: wrap;">' + tags + '</div>';
        listEl.appendChild(groupDiv);
    });
}

function calculateCellVisuals(status, quantity, price) {
    let bgColor = 'var(--color-sidebar-bg, #FFF)'; 
    let tooltip = '';
    let iconHtml = '';
    let inputsDisabled = false;
    let buttonBgColor = '';
    let buttonText = '';
    let buttonTextColor = 'white';

    if (status === 'Open') {
        const isValidPrice = (price !== null && price !== undefined && price > 0);

        if (quantity > 0) { 
            if (isValidPrice) { 
                tooltip = `可預訂 (${quantity} 間, $${price})`;
                buttonBgColor = 'var(--color-success, green)';
                buttonText = '開啟';
            } else { 
                const reason = (price === null || price === undefined) ? '價格未定' : '價格為零';
                tooltip = `${reason} (${quantity} 間可用)`;
                iconHtml = `<span class="price-warning-icon" style="color: red; font-weight: bold; margin-left: 2px; cursor: help;" title="${reason}">!</span>`;
                bgColor = '#fff3cd'; 
                buttonBgColor = 'var(--color-success, green)'; 
                buttonText = '開啟';
            }
        } else { // 售完
            tooltip = '已售罄';
            buttonBgColor = 'var(--color-warning, #ffc107)'; 
            buttonText = '售完';
            buttonTextColor = 'var(--color-text-dark, #212529)';
            if (!isValidPrice) {
                 const reason = (price === null || price === undefined) ? '價格未定' : '價格為零';
                 tooltip += ` (${reason})`;
                 iconHtml = `<span class="price-warning-icon" style="color: red; font-weight: bold; margin-left: 2px; cursor: help;" title="${reason}">!</span>`;
                 bgColor = '#fff3cd';
            }
        }
    } else { // Closed
        tooltip = '房間關閉';
        bgColor = '#f8d7da'; // 紅色背景
        inputsDisabled = true;
        buttonBgColor = 'var(--color-danger, red)';
        buttonText = '關閉';
    }

    return { bgColor, tooltip, iconHtml, inputsDisabled, buttonBgColor, buttonText, buttonTextColor };
}


// --- 綁定單元格事件 (v5 - 使用事件委派) ---
function bindCellEvents() {
    const grid = document.getElementById('rav-grid-container');
    if (!grid || grid.dataset.eventsBound === 'true') return;

    grid.addEventListener('click', handleCellClick);
    grid.addEventListener('blur', handleCellBlur, true); 
    grid.addEventListener('focus', handleCellFocus, true); 

    grid.dataset.eventsBound = 'true';
}

// --- Click 事件處理 (v5 - 只處理狀態按鈕) ---
async function handleCellClick(e) {
    const target = e.target;
    if (!target.matches('.status-toggle') || target.disabled) return; // 確保 disabled 的按鈕不觸發

    const cell = target.closest('td[data-product-id][data-date]');
    if (!cell) return;
    const productId = cell.dataset.productId;
    const date = cell.dataset.date;
    const currentStatus = target.dataset.status;
    const newStatus = currentStatus === 'Open' ? 'Closed' : 'Open';

    target.disabled = true; 
    target.textContent = '...'; 

    try {
        const payload = { updates: [{ productId, date, status: newStatus }] };
        await api.updateRoomInventory(payload);

        // 更新本地快取
        if (!currentInventoryData[productId]) currentInventoryData[productId] = {};
        if (!currentInventoryData[productId][date]) currentInventoryData[productId][date] = {};
        currentInventoryData[productId][date].status = newStatus;

        // 重新渲染該單元格 (不重繪整個表格)
        updateCellVisuals(cell);
        ui.toast.success('狀態更新成功');
    } catch (error) {
         console.error("API update failed:", error);
         ui.toast.error(`更新失敗: ${error.message}`);
         target.textContent = currentStatus === 'Open' ? '開啟' : '關閉';
    } finally {
         target.disabled = false; 
    }
}

// --- Blur 事件處理 (v5 - 驗證與 API 呼叫) ---
async function handleCellBlur(e) {
    const target = e.target;
    if (!target.matches('.quantity-input, .price-input') || target.disabled) return;

    const cell = target.closest('td[data-product-id][data-date]');
    if (!cell) return;

    const productId = cell.dataset.productId;
    const date = cell.dataset.date;
    const originalValueStr = target.dataset.originalValue || ''; 
    const currentValueStr = target.value.trim();

    if (currentValueStr === originalValueStr) return;

    const updateData = { productId, date };
    let isValid = true;
    let newValue;

    if (target.matches('.quantity-input')) {
        newValue = parseInt(currentValueStr, 10);
        if (isNaN(newValue) || newValue < 0) {
             ui.toast.error('數量必須是非負整數');
             isValid = false;
        } else {
             updateData.quantity = newValue;
        }
    } else if (target.matches('.price-input')) {
        if (currentValueStr === '') { 
             newValue = null;
             updateData.price = null; 
        } else {
             newValue = parseInt(currentValueStr, 10);
             if (isNaN(newValue) || newValue < 0) {
                  ui.toast.error('價格必須是非負數字或留空');
                  isValid = false;
             } else {
                  updateData.price = newValue; 
             }
        }
    }

    if (!isValid) {
        target.value = originalValueStr; 
        target.style.borderColor = 'red'; 
        setTimeout(() => { target.style.borderColor = ''; }, 1500);
        return;
    }

    target.style.borderColor = 'orange'; 

    try {
        await api.updateRoomInventory({ updates: [updateData] });
        target.dataset.originalValue = currentValueStr; 
        target.style.borderColor = ''; 
        
        // 更新本地快取
        if (!currentInventoryData[productId]) currentInventoryData[productId] = {};
        if (!currentInventoryData[productId][date]) currentInventoryData[productId][date] = {};
        if (updateData.quantity !== undefined) currentInventoryData[productId][date].quantity_available = updateData.quantity;
        if (updateData.price !== undefined) currentInventoryData[productId][date].base_price = updateData.price;

        updateCellVisuals(cell); 

    } catch (error) {
         console.error("API update failed:", error);
         ui.toast.error(`更新失敗: ${error.message}`);
         target.value = originalValueStr; 
         target.style.borderColor = 'red'; 
         updateCellVisuals(cell);
         setTimeout(() => { target.style.borderColor = ''; }, 1500);
    }
}

// --- Focus 事件處理 (v5 - 記錄原始值) ---
function handleCellFocus(e) {
    const target = e.target;
    if (target.matches('.quantity-input, .price-input')) {
         target.dataset.originalValue = target.value.trim();
    }
}


// --- 輔助函式：更新單元格視覺狀態 (v5 - 符合新設計) ---
function updateCellVisuals(cell) {
    if (!cell) return;
    const statusBtn = cell.querySelector('.status-toggle');
    const qtyInput = cell.querySelector('.quantity-input');
    const priceInput = cell.querySelector('.price-input');

    if (!statusBtn || !qtyInput || !priceInput) return;

    // 從快取讀取最新狀態 (因為 handleCellClick 已經更新了快取)
    const productId = cell.dataset.productId;
    const dateStr = cell.dataset.date;
    const inventory = currentInventoryData[productId]?.[dateStr];
    
    // 再次檢查是否過期 (因為可能在頁面停留很久)
    const today = new Date();
    today.setHours(0,0,0,0);
    const dateObj = new Date(dateStr + 'T00:00:00');
    const isPast = dateObj < today;

    if (isPast) return; // 過去日期不需更新視覺，保持 disabled

    const status = inventory?.status || 'Closed'; // 使用 inventory 的狀態，而不是 DOM 的
    const quantity = inventory?.quantity_available !== undefined ? inventory.quantity_available : parseInt(qtyInput.value, 10);
    const price = inventory?.base_price !== undefined ? inventory.base_price : (priceInput.value.trim() === '' ? null : parseInt(priceInput.value, 10));

    const visuals = calculateCellVisuals(status, quantity, price);

    cell.style.backgroundColor = visuals.bgColor; 
    cell.title = visuals.tooltip;                 

    statusBtn.style.backgroundColor = visuals.buttonBgColor;
    statusBtn.style.color = visuals.buttonTextColor;
    statusBtn.textContent = visuals.buttonText;
    statusBtn.dataset.status = status; // 確保 dataset 同步

    let iconSpan = cell.querySelector('.price-warning-icon');
    if (visuals.iconHtml) {
        if (!iconSpan) {
            iconSpan = document.createElement('span');
            iconSpan.className = 'price-warning-icon';
            priceInput.parentNode.insertBefore(iconSpan, priceInput.nextSibling);
        }
        iconSpan.outerHTML = visuals.iconHtml;
    } else if (iconSpan) {
        iconSpan.remove(); 
    }

    qtyInput.disabled = visuals.inputsDisabled;
    priceInput.disabled = visuals.inputsDisabled;
}


// --- 讀取資料 (v5 - 驗證日期範圍大小) ---
async function loadInventoryData() {
    console.log("[LoadData] Attempting to load inventory data...");
    const productSelect = document.getElementById('rav-product-select');
    const dateRange = dateRangePicker ? dateRangePicker.selectedDates : [];

    if (!productSelect || dateRange.length < 2) {
        ui.toast.info('請先選擇有效的日期範圍');
        return;
    }

    const selectedProductId = productSelect.value;
    const startDate = flatpickr.formatDate(dateRange[0], "Y-m-d");
    const endDate = flatpickr.formatDate(dateRange[1], "Y-m-d");

    displayedDates = [];
    let tempDate = new Date(dateRange[0]);
    const end = new Date(dateRange[1]);
    while(tempDate <= end) {
        displayedDates.push(flatpickr.formatDate(tempDate, "Y-m-d"));
        tempDate.setDate(tempDate.getDate() + 1);
    }

    const MAX_DAYS = 90;
    if (displayedDates.length > MAX_DAYS) {
         ui.toast.error(`日期範圍過大 (最多 ${MAX_DAYS} 天)，請縮小範圍`);
         return;
    }

    const gridContainer = document.getElementById('rav-grid-container');
    gridContainer.innerHTML = '<p>正在載入資料...</p>';
    const loadingBtn = document.getElementById('rav-apply-filter-btn');
    if(loadingBtn) loadingBtn.disabled = true;

    try {
        const params = new URLSearchParams({ startDate, endDate });
        if (selectedProductId !== 'all') {
            params.append('productId', selectedProductId);
        }
        currentInventoryData = await api.getRoomInventory(params);
        renderAvailabilityGrid(); 
    } catch (error) {
        console.error("API call failed:", error);
        ui.toast.error(`載入資料失敗: ${error.message}`);
        gridContainer.innerHTML = `<p style="color:red;">載入失敗: ${error.message}</p>`;
        currentInventoryData = {};
    } finally {
         if(loadingBtn) loadingBtn.disabled = false; 
    }
}

// --- 處理批次修改 (v5 - 使用批次日期選擇器) ---
function openBulkEditModal() {
    console.log("[BulkEdit] Opening bulk edit modal...");
    const productSelect = document.getElementById('rav-product-select');
    const selectedProductId = productSelect.value;
    const selectedProductName = selectedProductId === 'all'
        ? '所有已篩選房型'
        : currentProducts.find(p => p.product_id === selectedProductId)?.name || '選定房型';

    const infoEl = document.getElementById('bulk-edit-info');
    if (infoEl) infoEl.textContent = selectedProductName;

    const form = document.getElementById('rav-bulk-edit-form');
    if (form) form.reset(); // 重置表單輸入
    document.querySelectorAll('#bulk-edit-weekdays input').forEach(cb => cb.checked = true); // 預設全選星期

    const dateInput = document.getElementById('bulk-edit-date-picker');
    if (!dateInput) {
         console.error("[BulkEdit] Error: Bulk edit date picker input not found!");
         ui.toast.error("無法開啟批次修改：缺少日期選擇器");
         return;
    }

    // 在顯示 Modal 後初始化日期選擇器
    ui.showModal('#rav-bulk-edit-modal');

    // 延遲初始化以確保元素可見
    setTimeout(() => {
        // 檢查 Modal 是否仍然可見
        const modal = document.getElementById('rav-bulk-edit-modal');
        if (modal && modal.style.display !== 'none') {
             console.log("[BulkEdit] Initializing bulkEditDatePicker inside modal...");
             // 先銷毀舊實例 (如果存在)
             if (bulkEditDatePicker) {
                  bulkEditDatePicker.destroy();
                  console.log("[BulkEdit] Destroyed previous bulkEditDatePicker instance.");
             }
             bulkEditDatePicker = flatpickr(dateInput, {
                  mode: "range",
                  dateFormat: "Y-m-d",
                  locale: "zh_tw",
                  onOpen: () => console.log("[BulkEdit Flatpickr] Opened."), // Debug
                  onError: (err) => console.error("[BulkEdit Flatpickr] Error:", err) // Debug
             });
             if (dateInput._flatpickr) {
                  console.log("[BulkEdit] bulkEditDatePicker initialized successfully.");
             } else {
                  console.error("[BulkEdit] Failed to initialize bulkEditDatePicker!");
                  ui.toast.error("初始化批次修改日期選擇器失敗");
             }
        } else {
             console.warn("[BulkEdit] Modal closed before Flatpickr initialization.");
        }
    }, 100); // 稍微延遲

    console.log("[BulkEdit] Modal opened.");
}

// --- 處理批次修改提交 (v5 - 驗證與 API 呼叫) ---
async function handleBulkEditSubmit(event) {
    event.preventDefault();
    console.log("[BulkSubmit] Handling bulk edit submission...");
    const form = event.target;
    const productSelect = document.getElementById('rav-product-select');
    const selectedProductId = productSelect.value;

    // --- 獲取批次修改日期範圍 ---
    const bulkDates = bulkEditDatePicker ? bulkEditDatePicker.selectedDates : [];
    if (bulkDates.length < 2) {
         ui.toast.error('請在批次修改視窗中選擇有效的日期範圍');
         console.warn("[BulkSubmit] Invalid date range selected in modal.");
         return;
    }
    const startDate = flatpickr.formatDate(bulkDates[0], "Y-m-d");
    const endDate = flatpickr.formatDate(bulkDates[1], "Y-m-d");
    console.log(`[BulkSubmit] Modal Date Range: ${startDate} to ${endDate}`);

    // --- 獲取其他參數 ---
    const selectedWeekdays = Array.from(form.querySelectorAll('[name="weekday"]:checked')).map(cb => parseInt(cb.value));
    const status = form.querySelector('#bulk-edit-status').value; // 可能為 "" (不變更)
    const quantityInput = form.querySelector('#bulk-edit-quantity');
    const priceInput = form.querySelector('#bulk-edit-price');

    // --- 驗證 ---
    if (selectedWeekdays.length === 0) {
         ui.toast.error('請至少選擇一個星期');
         return;
    }

    const updateValues = {}; // 要傳給 API 的更新值
    if (status) {
        updateValues.status = status;
    }
    if (quantityInput.value.trim() !== '') { // 檢查是否為空字串
         const quantity = parseInt(quantityInput.value);
         if (isNaN(quantity) || quantity < 0) {
             ui.toast.error('數量必須是非負整數');
             return;
         }
         updateValues.quantity = quantity; // API 需要 quantity
    }
    if (priceInput.value.trim() !== '') { // 檢查是否為空字串
         const price = parseInt(priceInput.value);
         if (isNaN(price) || price < 0) {
             ui.toast.error('價格必須是非負數字');
             return;
         }
          updateValues.price = price; // API 需要 price
    } else {
         // 如果價格輸入框明確為空，則傳遞 null 表示使用預設價
         updateValues.price = null;
    }


    if (Object.keys(updateValues).length === 0) {
         ui.toast.info('沒有指定任何要修改的項目 (房況、數量或價格)'); // 改用 info
         return;
    }
    console.log("[BulkSubmit] Update values:", updateValues);

    // --- 確定要更新的房型 ID ---
    const productIdsToUpdate = [];
    if (selectedProductId === 'all') {
         // 如果主下拉選單選 "所有房型"，則更新所有房型
         productIdsToUpdate.push(...currentProducts.map(p => p.product_id));
    } else {
         // 否則只更新選定的那一個
         productIdsToUpdate.push(selectedProductId);
    }

    if (productIdsToUpdate.length === 0) {
         ui.toast.error('沒有選定要修改的房型');
         return;
    }
    console.log(`[BulkSubmit] Products to update (${productIdsToUpdate.length}):`, productIdsToUpdate);

    // --- 確認對話框 ---
    const confirmMsg = `確定要將 ${productIdsToUpdate.length} 個房型 在 ${startDate} 到 ${endDate} 期間，每週 ${selectedWeekdays.map(d => weekdayShort[d]).join(',')} 的 ${Object.keys(updateValues).join('/')} 進行批次修改嗎？`;
    const confirmed = await ui.confirm(confirmMsg);
    if (!confirmed) {
        console.log("[BulkSubmit] User cancelled.");
        return;
    }

    // --- 執行 API ---
    const submitButton = form.querySelector('button[type="submit"]');
    submitButton.disabled = true;
    submitButton.textContent = '處理中...';

    try {
        // 為每個房型建立一個 API 請求 payload
        const updatePromises = productIdsToUpdate.map(pid => {
             const payload = {
                 productId: pid,
                 startDate,
                 endDate,
                 weekdays: selectedWeekdays,
                 updateValues: { ...updateValues } // 複製 updateValues
             };
             console.log("[BulkSubmit] Sending API payload for product " + pid + ":", JSON.stringify(payload));
             return api.updateRoomInventory(payload); // API 處理批次模式
        });

        // 等待所有房型的更新完成
        await Promise.all(updatePromises);

        ui.toast.success('批次修改成功！');
        ui.hideModal('#rav-bulk-edit-modal');
        await loadInventoryData(); // 重新載入主表格資料
        console.log("[BulkSubmit] Bulk update successful.");

    } catch (error) {
        console.error("[BulkSubmit] API update failed:", error);
        ui.toast.error(`批次修改失敗: ${error.message}`);
    } finally {
        submitButton.disabled = false;
        submitButton.textContent = '確認修改';
    }
}


// --- 事件綁定 (v5 - 確保只綁定一次) ---
function setupEventListeners() {
    const page = document.getElementById('page-room-availability');
    if (!page || page.dataset.initialized === 'true') return;

    const applyBtn = document.getElementById('rav-apply-filter-btn');
    if (applyBtn) applyBtn.addEventListener('click', loadInventoryData);

    const bulkEditBtn = document.getElementById('rav-bulk-edit-all-btn');
    if (bulkEditBtn) bulkEditBtn.addEventListener('click', openBulkEditModal); // 這裡需要上面的 openBulkEditModal

    const bulkEditForm = document.getElementById('rav-bulk-edit-form');
    if (bulkEditForm) bulkEditForm.addEventListener('submit', handleBulkEditSubmit); // 這裡需要上面的 handleBulkEditSubmit

    // 填充房型選單
    const productSelect = document.getElementById('rav-product-select');
    if (productSelect && currentProducts.length > 0 && productSelect.options.length <= 1) {
         productSelect.innerHTML = '<option value="all">所有房型</option>';
         currentProducts.forEach(product => {
             if (product.name && product.product_id) {
                 productSelect.add(new Option(product.name, product.product_id));
             }
         });
    }

    page.dataset.initialized = 'true';
}

// --- 初始化日期選擇器 (修正：解決自動載入失效問題) ---
export function initializeDatePickers() {
     if (isDatePickerInitialized) return;
     console.log("[InitPickers] Initializing date pickers...");
     const dateRangeInput = document.getElementById('rav-date-range');
     
     if (dateRangeInput) {
          try {
              const today = new Date();
              const nextMonth = new Date();
              nextMonth.setDate(today.getDate() + 30);

              dateRangePicker = flatpickr(dateRangeInput, {
                  mode: "range",
                  dateFormat: "Y-m-d",
                  locale: "zh_tw",
                  defaultDate: [ today, nextMonth ],
                  onReady: function(selectedDates, dateStr, instance) {
                       // 【關鍵修正】
                       // Flatpickr 的 onReady 有時會比外部變數賦值更早執行。
                       // 所以我們在這裡強制把 instance 指派給全域變數 dateRangePicker，
                       // 確保 loadInventoryData() 讀取時不會是 null。
                       dateRangePicker = instance; 
                       
                       if (Array.isArray(selectedDates) && selectedDates.length === 2) {
                            console.log("[InitPickers] Triggering auto-load...");
                            loadInventoryData(); // 這時候呼叫就安全了
                       }
                  }
              });
              isDatePickerInitialized = true;
          } catch(e) {
               console.error("Error initializing picker:", e);
          }
     }
}

// --- 模組初始化函式 (init v5 - 載入產品並綁定事件) ---
export const init = async () => {
    const page = document.getElementById('page-room-availability');
    if (!page) return;
    const gridContainer = document.getElementById('rav-grid-container');
    if (gridContainer) gridContainer.innerHTML = '<p>請先選擇房型和日期範圍，然後點擊「載入資料」。</p>';

    isDatePickerInitialized = false; 

    try {
        if (currentProducts.length === 0) {
            const allProds = await api.getProducts();
            currentProducts = allProds.filter(p => p && p.product_id && p.name);
        }
        setupEventListeners();
        // 請注意：initializeDatePickers 會在 app.js 中透過 RAF 呼叫
    } catch (error) {
        console.error("Error during initialization:", error);
        ui.toast.error(`初始化失敗: ${error.message}`);
    }
};