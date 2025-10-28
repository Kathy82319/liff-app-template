// public/admin/modules/roomAvailabilityManagement.js
import { api } from '../api.js';
import { ui } from '../ui.js';

let currentProducts = []; // 存放房型資料 (不過濾 category)
let currentInventoryData = {}; // 存放讀取的庫存資料 { "房型ID": { "日期": { status, quantity_available, base_price } } }
let dateRangePicker = null; // 主日期範圍選擇器實例
let bulkEditDatePicker = null; // 批次修改日期選擇器實例
let displayedDates = []; // 當前表格顯示的日期陣列
let isDatePickerInitialized = false; // 日期選擇器初始化標記

// --- Helper: 取得某日期是星期幾的縮寫 ---
const weekdayShort = ["日", "一", "二", "三", "四", "五", "六"];

// --- 核心渲染函式 (符合新設計 v5) ---
function renderAvailabilityGrid() {
    console.log("[RenderGrid] Starting grid rendering...");
    const container = document.getElementById('rav-grid-container');
    const productSelect = document.getElementById('rav-product-select');
if (!container || !productSelect) {
        console.error("[RenderGrid] Error: Container or product select not found.");
        return;
    }

    const selectedProductId = productSelect.value;
    const productsToRender = selectedProductId === 'all'
        ? currentProducts
        : currentProducts.filter(p => p.product_id === selectedProductId);

    if (productsToRender.length === 0) {
        container.innerHTML = '<p>沒有找到符合條件的房型。</p>';
        console.log("[RenderGrid] No products to render.");
        return;
    }
    if (displayedDates.length === 0) {
        container.innerHTML = '<p>請先選擇有效的日期範圍。</p>';
        console.log("[RenderGrid] No dates selected.");
        return;
    }


    // --- 表格 HTML 生成 ---
    let tableHtml = '<table class="rav-table" style="width: 100%; border-collapse: collapse;">';

    // 表頭 (固定日期)
    tableHtml += '<thead><tr><th style="min-width: 150px; position: sticky; left: 0; background: var(--color-sidebar-bg, #FFF); z-index: 1;">房型</th>';
    displayedDates.forEach(dateStr => {
        const date = new Date(dateStr + 'T00:00:00');
        const monthDay = `${date.getMonth() + 1}/${date.getDate()}`;
        const dayOfWeek = weekdayShort[date.getDay()];
        const isWeekend = date.getDay() === 0 || date.getDay() === 6;
        tableHtml += `<th style="min-width: 110px; text-align: center; ${isWeekend ? 'color: var(--color-primary, blue);' : ''}">${monthDay}<br>${dayOfWeek}</th>`;
    });
    tableHtml += '</tr></thead>';

    // 表格內容
    tableHtml += '<tbody>';
    productsToRender.forEach(product => {
        tableHtml += `<tr>`;
        // 固定房型名稱列
        tableHtml += `<td style="font-weight: bold; position: sticky; left: 0; background: var(--color-sidebar-bg, #FFF); z-index: 1; border-right: 1px solid var(--color-border, #CCC);">${product.name}</td>`;

        displayedDates.forEach(dateStr => {
            const inventory = currentInventoryData[product.product_id]?.[dateStr];
            const status = inventory?.status || 'Closed';
            const quantity = inventory?.quantity_available ?? 0;
            const price = inventory?.base_price;
            const priceText = (price === null || price === undefined) ? '' : String(price);

            // --- 根據規則計算視覺樣式和提示 ---
            const visuals = calculateCellVisuals(status, quantity, price); // 使用更新後的 calculateCellVisuals

            // --- 生成單元格 HTML ---
            tableHtml += `
                <td style="border: 1px solid var(--color-border, #CCC); padding: 5px; text-align: center; vertical-align: top; background-color: ${visuals.bgColor};"
                    data-product-id="${product.product_id}" data-date="${dateStr}" title="${visuals.tooltip}">
                    <div style="margin-bottom: 3px;">
                        <button class="status-toggle action-btn ${status === 'Open' ? (quantity > 0 ? 'status-open' : 'status-soldout') : 'status-closed'}" data-status="${status}"
                                style="width: 100%; font-size: 0.8em; padding: 2px 4px; background-color: ${visuals.buttonBgColor}; color: ${visuals.buttonTextColor};">
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
    // bindCellEvents(); // 事件綁定移至 setupEventListeners 或 loadInventoryData 成功後
}

// --- 輔助：計算單元格視覺樣式 (v5 - 符合新設計) ---
// public/admin/modules/roomAvailabilityManagement.js

// --- 輔助：計算單元格視覺樣式 (v6 - "售完" 狀態) ---
function calculateCellVisuals(status, quantity, price) {
    let bgColor = 'var(--color-sidebar-bg, #FFF)'; // 預設白色
    let tooltip = '';
    let iconHtml = '';
    let inputsDisabled = false;
    // --- 新增：按鈕樣式 ---
    let buttonBgColor = '';
    let buttonText = '';
    let buttonTextColor = 'white'; // 預設按鈕文字顏色

    if (status === 'Open') {
        const isValidPrice = (price !== null && price !== undefined && price > 0);

        if (quantity > 0) { // --- 數量 > 0 ---
            if (isValidPrice) { // 價格有效 -> 可預訂
                tooltip = `可預訂 (${quantity} 間, $${price})`;
                buttonBgColor = 'var(--color-success, green)';
                buttonText = '開啟';
                // bgColor 保持預設白色
            } else { // 價格未定或為零 -> 價格問題
                const reason = (price === null || price === undefined) ? '價格未定' : '價格為零';
                tooltip = `${reason} (${quantity} 間可用)`;
                iconHtml = `<span class="price-warning-icon" style="color: red; font-weight: bold; margin-left: 2px; cursor: help;" title="${reason}">!</span>`;
                bgColor = '#fff3cd'; // 黃色背景
                buttonBgColor = 'var(--color-success, green)'; // 按鈕仍是綠色
                buttonText = '開啟';
            }
        } else { // --- 數量 = 0 -> 售完 ---
            tooltip = '已售罄';
            // bgColor 保持預設白色
            buttonBgColor = 'var(--color-warning, #ffc107)'; // 按鈕變黃色
            buttonText = '售完';
            buttonTextColor = 'var(--color-text-dark, #212529)'; // 黃色背景配深色文字較清楚

            // 如果同時價格也有問題，也要顯示驚嘆號
            if (!isValidPrice) {
                 const reason = (price === null || price === undefined) ? '價格未定' : '價格為零';
                 tooltip += ` (${reason})`; // 在售罄提示後追加原因
                 iconHtml = `<span class="price-warning-icon" style="color: red; font-weight: bold; margin-left: 2px; cursor: help;" title="${reason}">!</span>`;
                 // 背景也變黃色，因為價格問題優先級更高
                 bgColor = '#fff3cd';
            }
        }
    } else { // status === 'Closed' -> 房間關閉
        tooltip = '房間關閉';
        bgColor = '#f8d7da'; // 紅色背景
        inputsDisabled = true;
        buttonBgColor = 'var(--color-danger, red)';
        buttonText = '關閉';
    }

    return {
        bgColor,
        tooltip,
        iconHtml,
        inputsDisabled,
        buttonBgColor,
        buttonText,    
        buttonTextColor 
    };
}


// --- 綁定單元格事件 (v5 - 使用事件委派) ---
function bindCellEvents() {
    const grid = document.getElementById('rav-grid-container');
    if (!grid || grid.dataset.eventsBound === 'true') {
        if (grid && grid.dataset.eventsBound === 'true') {
            console.log("[BindEvents] Events already bound, skipping.");
        }
        return; // 防止重複綁定
    }
    console.log("[BindEvents] Binding cell event listeners...");

    // Click 事件委派 (只處理 status-toggle)
    grid.addEventListener('click', handleCellClick);

    // Blur 事件委派 (處理 quantity-input 和 price-input)
    grid.addEventListener('blur', handleCellBlur, true); // 使用捕獲模式確保觸發

    // Focus 事件委派 (記錄原始值)
    grid.addEventListener('focus', handleCellFocus, true); // 使用捕獲模式確保觸發

    grid.dataset.eventsBound = 'true'; // 標記已綁定
    console.log("[BindEvents] Cell event listeners bound.");
}

// --- Click 事件處理 (v5 - 只處理狀態按鈕) ---
async function handleCellClick(e) {
    const target = e.target;
    // 只處理狀態按鈕的點擊
    if (!target.matches('.status-toggle')) return;

    console.log("[HandleClick] Status toggle clicked.");
    const cell = target.closest('td[data-product-id][data-date]');
    if (!cell) {
        console.error("[HandleClick] Could not find parent cell.");
        return;
    }
    const productId = cell.dataset.productId;
    const date = cell.dataset.date;
    const currentStatus = target.dataset.status;
    const newStatus = currentStatus === 'Open' ? 'Closed' : 'Open';

    target.disabled = true; // 防止重複點擊
    target.textContent = '...'; // 提示處理中

    try {
        const payload = { updates: [{ productId, date, status: newStatus }] };
        console.log("[HandleClick] Sending API update:", JSON.stringify(payload));
        await api.updateRoomInventory(payload);

        // 更新按鈕狀態和文字
        target.dataset.status = newStatus;
        target.textContent = newStatus === 'Open' ? '開啟' : '關閉';
        target.classList.toggle('status-open', newStatus === 'Open');
        target.classList.toggle('status-closed', newStatus === 'Closed');
        target.style.backgroundColor = newStatus === 'Open' ? 'var(--color-success, green)' : 'var(--color-danger, red)';

        // 更新單元格視覺 (背景色、輸入框狀態、驚嘆號)
        updateCellVisuals(cell);
        ui.toast.success('狀態更新成功');
        console.log(`[HandleClick] Status updated successfully for ${productId} on ${date} to ${newStatus}.`);

    } catch (error) {
         console.error("[HandleClick] API update failed:", error);
         ui.toast.error(`狀態更新失敗: ${error.message}`);
         // API 失敗，恢復按鈕原始狀態
         target.textContent = currentStatus === 'Open' ? '開啟' : '關閉';
    } finally {
         target.disabled = false; // 無論成功或失敗都恢復按鈕
    }
}

// --- Blur 事件處理 (v5 - 驗證與 API 呼叫) ---
async function handleCellBlur(e) {
    const target = e.target;
    // 只處理數量和價格輸入框的 blur 事件，且輸入框未被禁用
    if (!target.matches('.quantity-input, .price-input') || target.disabled) return;

    const cell = target.closest('td[data-product-id][data-date]');
    if (!cell) {
        console.error("[HandleBlur] Could not find parent cell.");
        return;
    }

    const productId = cell.dataset.productId;
    const date = cell.dataset.date;
    const originalValueStr = target.dataset.originalValue || ''; // 獲取 focus 時記錄的值
    const currentValueStr = target.value.trim();

    // 檢查值是否有變更
    if (currentValueStr === originalValueStr) {
        // console.log("[HandleBlur] Value not changed, skipping API call.");
        return; // 值未變更，不執行任何動作
    }
    console.log(`[HandleBlur] Value changed from "${originalValueStr}" to "${currentValueStr}" for ${target.className}`);

    const updateData = { productId, date };
    let isValid = true;
    let newValue;

    // --- 驗證並準備 API 資料 ---
    if (target.matches('.quantity-input')) {
        newValue = parseInt(currentValueStr, 10);
        if (isNaN(newValue) || newValue < 0) {
             ui.toast.error('數量必須是非負整數');
             isValid = false;
        } else {
             updateData.quantity = newValue; // API 需要 quantity
        }
    } else if (target.matches('.price-input')) {
        if (currentValueStr === '') { // 允許清空價格，表示使用預設價
             newValue = null;
             updateData.price = null; // API 需要 price, null 表示預設
        } else {
             newValue = parseInt(currentValueStr, 10);
             if (isNaN(newValue) || newValue < 0) {
                  ui.toast.error('價格必須是非負數字或留空');
                  isValid = false;
             } else {
                  updateData.price = newValue; // API 需要 price
             }
        }
    }

    // --- 處理驗證失敗 ---
    if (!isValid) {
        target.value = originalValueStr; // 恢復原始值
        target.style.borderColor = 'red'; // 標示錯誤
        console.warn(`[HandleBlur] Invalid input for ${target.className}. Reverted to original value.`);
        // 短暫標紅後恢復
        setTimeout(() => { target.style.borderColor = ''; }, 1500);
        return;
    }

    // --- 呼叫 API ---
    target.style.borderColor = 'orange'; // 提示正在儲存
    console.log("[HandleBlur] Preparing to send API update:", JSON.stringify({ updates: [updateData] }));

    try {
        await api.updateRoomInventory({ updates: [updateData] });
        console.log(`[HandleBlur] API update successful for ${productId} on ${date}.`);
        target.dataset.originalValue = currentValueStr; // API 成功後，更新原始值記錄
        target.style.borderColor = ''; // 清除儲存提示
        updateCellVisuals(cell); // 更新單元格視覺 (可能影響背景色或驚嘆號)
        // 不需要 toast 成功訊息，避免過多干擾

    } catch (error) {
         console.error("[HandleBlur] API update failed:", error);
         ui.toast.error(`更新失敗: ${error.message}`);
         target.value = originalValueStr; // API 失敗，恢復原始值
         target.style.borderColor = 'red'; // 標示錯誤
         // 嘗試恢復視覺狀態 (可能因為 API 失敗導致狀態不一致)
         updateCellVisuals(cell);
         setTimeout(() => { target.style.borderColor = ''; }, 1500);
    }
}

// --- Focus 事件處理 (v5 - 記錄原始值) ---
function handleCellFocus(e) {
    const target = e.target;
    if (target.matches('.quantity-input, .price-input')) {
         // 記錄當前值，以便 blur 時比較
         target.dataset.originalValue = target.value.trim();
         // console.log(`[HandleFocus] Stored original value for ${target.className}: "${target.dataset.originalValue}"`);
    }
}


// --- 輔助函式：更新單元格視覺狀態 (v5 - 符合新設計) ---
function updateCellVisuals(cell) {
    if (!cell) return;
    const statusBtn = cell.querySelector('.status-toggle');
    const qtyInput = cell.querySelector('.quantity-input');
    const priceInput = cell.querySelector('.price-input');

    if (!statusBtn || !qtyInput || !priceInput) {
        console.warn("[UpdateVisuals] Cell is missing expected elements.");
        return;
    }

    const status = statusBtn.dataset.status;
    const quantity = parseInt(qtyInput.value, 10); // 從 input 讀取當前值
    const priceStr = priceInput.value.trim();
    const price = (priceStr === '') ? null : parseInt(priceStr, 10); // 從 input 讀取當前值

    // --- 重新計算視覺樣式 ---
    const visuals = calculateCellVisuals(status, quantity, price);

    // --- 應用樣式 ---
    cell.style.backgroundColor = visuals.bgColor; // 更新格子背景
    cell.title = visuals.tooltip;                 // 更新 tooltip

    // --- 更新按鈕 ---
    statusBtn.style.backgroundColor = visuals.buttonBgColor;
    statusBtn.style.color = visuals.buttonTextColor;
    statusBtn.textContent = visuals.buttonText;
    // 更新按鈕的 class (可選，用於 CSS)
    statusBtn.classList.remove('status-open', 'status-soldout', 'status-closed');
    if (status === 'Closed') {
        statusBtn.classList.add('status-closed');
    } else if (quantity > 0) {
        statusBtn.classList.add('status-open');
    } else {
        statusBtn.classList.add('status-soldout');
    }


    // 更新或移除驚嘆號 icon
    let iconSpan = cell.querySelector('.price-warning-icon');
    if (visuals.iconHtml) {
        if (!iconSpan) {
            iconSpan = document.createElement('span');
            iconSpan.className = 'price-warning-icon';
            priceInput.parentNode.insertBefore(iconSpan, priceInput.nextSibling);
        }
        // 直接設置 innerHTML，因為 visuals.iconHtml 包含完整的 span 元素
        iconSpan.outerHTML = visuals.iconHtml;
         // outerHTML 替換後需要重新獲取 iconSpan (雖然下面沒再用到，但以防萬一)
         // iconSpan = cell.querySelector('.price-warning-icon');
         // if(iconSpan) iconSpan.style.display = 'inline'; // 確保顯示 (如果 innerHTML 沒包含 style)

    } else if (iconSpan) {
        iconSpan.remove(); // 直接移除元素
    }

    // 更新輸入框禁用狀態
    qtyInput.disabled = visuals.inputsDisabled;
    priceInput.disabled = visuals.inputsDisabled;

    // console.log(`[UpdateVisuals] Updated visuals for cell ${cell.dataset.productId}/${cell.dataset.date}:`, visuals);
}


// --- 讀取資料 (v5 - 驗證日期範圍大小) ---
async function loadInventoryData() {
    console.log("[LoadData] Attempting to load inventory data...");
    const productSelect = document.getElementById('rav-product-select');
    // 使用主日期選擇器 dateRangePicker
    const dateRange = dateRangePicker ? dateRangePicker.selectedDates : [];

    if (!productSelect) {
         console.error("[LoadData] Error: Product select element not found.");
         ui.toast.error('發生錯誤：找不到房型選擇器');
         return;
    }
    if (dateRange.length < 2) {
        ui.toast.info('請先選擇有效的日期範圍'); // 改用 info 提示
        console.log("[LoadData] Date range not selected or invalid.");
        document.getElementById('rav-grid-container').innerHTML = '<p>請選擇有效的日期範圍以載入資料。</p>';
        return;
    }

    const selectedProductId = productSelect.value;
    const startDate = flatpickr.formatDate(dateRange[0], "Y-m-d");
    const endDate = flatpickr.formatDate(dateRange[1], "Y-m-d");
    console.log(`[LoadData] Selected range: ${startDate} to ${endDate}, Product ID: ${selectedProductId}`);

    // 計算日期範圍天數
    displayedDates = [];
    let tempDate = new Date(dateRange[0]);
    const end = new Date(dateRange[1]);
    while(tempDate <= end) {
        displayedDates.push(flatpickr.formatDate(tempDate, "Y-m-d"));
        tempDate.setDate(tempDate.getDate() + 1);
    }

    // 限制最大查詢範圍 (例如 90 天)
    const MAX_DAYS = 90;
    if (displayedDates.length > MAX_DAYS) {
         ui.toast.error(`日期範圍過大 (最多 ${MAX_DAYS} 天)，請縮小範圍`);
         console.warn(`[LoadData] Date range too large: ${displayedDates.length} days.`);
         displayedDates = []; // 清空日期
         document.getElementById('rav-grid-container').innerHTML = `<p style="color:red;">日期範圍過大 (最多 ${MAX_DAYS} 天)，請重新選擇。</p>`;
         return;
    }

    // --- 顯示載入狀態 ---
    const gridContainer = document.getElementById('rav-grid-container');
    gridContainer.innerHTML = '<p>正在載入資料...</p>';
    const loadingBtn = document.getElementById('rav-apply-filter-btn');
    if(loadingBtn) loadingBtn.disabled = true;

    // --- 呼叫 API ---
    try {
        const params = new URLSearchParams({ startDate, endDate });
        if (selectedProductId !== 'all') {
            params.append('productId', selectedProductId);
        }
        console.log(`[LoadData] Calling API: /api/admin/get-room-inventory?${params.toString()}`);
        currentInventoryData = await api.getRoomInventory(params);
        console.log("[LoadData] API call successful, rendering grid...");
        renderAvailabilityGrid(); // 渲染表格
        // API 成功後才綁定事件 (如果尚未綁定)
        bindCellEvents();
    } catch (error) {
        console.error("[LoadData] API call failed:", error);
        ui.toast.error(`載入資料失敗: ${error.message}`);
        gridContainer.innerHTML = `<p style="color:red;">載入失敗: ${error.message}</p>`;
        // 清空數據以防顯示舊資料
        currentInventoryData = {};
        displayedDates = [];
    } finally {
         if(loadingBtn) loadingBtn.disabled = false; // 恢復按鈕
         console.log("[LoadData] Loading process finished.");
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
    // 防止重複綁定
    if (!page || page.dataset.initialized === 'true') {
        if (page?.dataset.initialized === 'true') console.log("[SetupEvents] Listeners already initialized.");
        return;
    }
    console.log("[SetupEvents] Initializing event listeners...");

    // 綁定按鈕事件
    const applyBtn = document.getElementById('rav-apply-filter-btn');
    if (applyBtn) {
        applyBtn.addEventListener('click', loadInventoryData);
        console.log("[SetupEvents] Apply button listener attached.");
    } else console.warn("[SetupEvents] Apply button not found.");

    const bulkEditBtn = document.getElementById('rav-bulk-edit-all-btn');
    if (bulkEditBtn) {
        bulkEditBtn.addEventListener('click', openBulkEditModal);
        console.log("[SetupEvents] Bulk edit button listener attached.");
    } else console.warn("[SetupEvents] Bulk edit button not found.");

    const bulkEditForm = document.getElementById('rav-bulk-edit-form');
    if (bulkEditForm) {
        bulkEditForm.addEventListener('submit', handleBulkEditSubmit);
        console.log("[SetupEvents] Bulk edit form submit listener attached.");
    } else console.warn("[SetupEvents] Bulk edit form not found.");

    // 填充房型下拉選單 (如果尚未填充)
    const productSelect = document.getElementById('rav-product-select');
    if (productSelect && currentProducts.length > 0 && productSelect.options.length <= 1) {
         productSelect.innerHTML = '<option value="all">所有房型</option>'; // 清空並加回預設
         currentProducts.forEach(product => {
             // 確保 product 有 name 和 product_id
             if (product.name && product.product_id) {
                 productSelect.add(new Option(product.name, product.product_id));
             } else {
                 console.warn("[SetupEvents] Product missing name or id:", product);
             }
         });
         console.log("[SetupEvents] Product dropdown populated.");
    } else if (productSelect && currentProducts.length === 0) {
         console.warn("[SetupEvents] Product dropdown not populated: currentProducts is empty.");
    } else if (!productSelect) {
         console.warn("[SetupEvents] Product dropdown element not found.");
    }

    // 標記已初始化
    page.dataset.initialized = 'true';
    console.log("[SetupEvents] Event listeners setup complete.");
}

// --- 初始化日期選擇器的獨立函數 (v5 - 保持獨立) ---
export function initializeDatePickers() {
     if (isDatePickerInitialized) {
          console.log("[InitPickers] Date pickers already initialized, skipping.");
          return;
     }
     console.log("[InitPickers] Initializing date pickers...");
     const dateRangeInput = document.getElementById('rav-date-range');
     if (dateRangeInput) {
          console.log("[InitPickers] Found #rav-date-range, initializing main picker...");
          try {
              dateRangePicker = flatpickr(dateRangeInput, {
                  mode: "range",
                  dateFormat: "Y-m-d",
                  locale: "zh_tw",
                  // 預設選取當月第一天到最後一天
                  defaultDate: [
                       new Date(new Date().getFullYear(), new Date().getMonth(), 1),
                       new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0)
                  ],
                  onReady: function(selectedDates, dateStr, instance) {
                       console.log("[InitPickers] Main picker onReady.");
                       if (Array.isArray(selectedDates) && selectedDates.length === 2) {
                            console.log("[InitPickers] Main picker onReady: Dates selected, triggering loadInventoryData...");
                            loadInventoryData(); // 初始載入
                       } else {
                            console.warn("[InitPickers] Main picker onReady: Initial date range invalid.");
                       }
                  },
                  onError: function(error) { // 增加錯誤處理
                      console.error("[InitPickers] Main picker Flatpickr Error:", error);
                      ui.toast.error("初始化主日期選擇器失敗: " + error.message);
                  }
              });
              if(dateRangeInput._flatpickr) {
                  console.log("[InitPickers] Main picker initialized successfully.");
                  isDatePickerInitialized = true; // 標記成功
              } else {
                   console.error("[InitPickers] Main picker failed to attach instance!");
                   ui.toast.error("主日期選擇器實例附加失敗");
              }
          } catch(e) {
               console.error("[InitPickers] Error initializing main picker:", e);
               ui.toast.error(`初始化主日期選擇器異常: ${e.message}`);
          }
     } else {
          console.error("[InitPickers] Error: Main date range input #rav-date-range not found!");
          ui.toast.error("無法初始化主日期選擇器 (找不到元素)。");
     }
     // 批次修改的日期選擇器在 openBulkEditModal 中處理
     console.log("[InitPickers] Date picker initialization process finished.");
}


// --- 模組初始化函式 (init v5 - 載入產品並綁定事件) ---
export const init = async () => {
    console.log("[Init] Room Availability Management init started...");
    const page = document.getElementById('page-room-availability');
    if (!page) {
         console.error("[Init] Error: Page element #page-room-availability not found!");
         return;
    }
    const gridContainer = document.getElementById('rav-grid-container');
    if (gridContainer) {
         gridContainer.innerHTML = '<p>請先選擇房型和日期範圍，然後點擊「載入資料」。</p>';
    } else console.warn("[Init] Grid container not found.");

    isDatePickerInitialized = false; // 重置初始化標記

    try {
        // 確保房型資料已載入
        if (currentProducts.length === 0) {
            console.log("[Init] Products cache empty, fetching from API...");
            // 確保 getProducts API 正確
            const allProds = await api.getProducts();
            // 過濾掉沒有 product_id 或 name 的項目
            currentProducts = allProds.filter(p => p && p.product_id && p.name);
            console.log(`[Init] Loaded and filtered ${currentProducts.length} products.`);
            if (allProds.length !== currentProducts.length) {
                console.warn("[Init] Some products were filtered out due to missing id or name.");
            }
        } else {
             console.log(`[Init] Using cached ${currentProducts.length} products.`);
        }

        // 綁定非 Flatpickr 的事件
        setupEventListeners();

        // **重要**: init 函數不再負責初始化 Flatpickr 或載入初始數據
        // 這將由 app.js 在正確的時機觸發 initializeDatePickers 來完成

    } catch (error) {
        console.error("[Init] Error during initialization:", error);
        ui.toast.error(`初始化房量控管頁面失敗: ${error.message}`);
        if (page) page.innerHTML = `<p style="color:red;">頁面初始化失敗: ${error.message}</p>`;
    }
    console.log("[Init] Room Availability Management init finished.");
};