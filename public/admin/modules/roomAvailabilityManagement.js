// public/admin/modules/roomAvailabilityManagement.js
import { api } from '../api.js';
import { ui } from '../ui.js';

let currentProducts = []; // 存放房型資料 (不過濾 category)
let currentInventoryData = {}; // 存放讀取的庫存資料 { "房型ID": { "日期": { status, quantity, price } } }
let dateRangePicker = null; // 主日期範圍選擇器實例
let bulkEditDatePicker = null; // 批次修改日期選擇器實例
let displayedDates = []; // 當前表格顯示的日期陣列
let isDatePickerInitialized = false;

// --- Helper: 取得某日期是星期幾的縮寫 ---
const weekdayShort = ["日", "一", "二", "三", "四", "五", "六"];

// --- 核心渲染函式 (v4 - 修正 price=0 顯示) ---
function renderAvailabilityGrid() {
    const container = document.getElementById('rav-grid-container');
    const productSelect = document.getElementById('rav-product-select');
    if (!container || !productSelect) {
        console.error("renderAvailabilityGrid: 找不到容器或房型選擇器");
        return;
    }

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

    let tableHtml = '<table class="rav-table" style="width: 100%; border-collapse: collapse;">';
    tableHtml += '<thead><tr><th style="min-width: 150px; position: sticky; left: 0; background: var(--color-sidebar-bg); z-index: 1;">房型</th>';
    displayedDates.forEach(dateStr => {
        const date = new Date(dateStr + 'T00:00:00');
        const monthDay = `${date.getMonth() + 1}/${date.getDate()}`;
        const dayOfWeek = weekdayShort[date.getDay()];
        const isWeekend = date.getDay() === 0 || date.getDay() === 6;
        tableHtml += `<th style="min-width: 100px; text-align: center; ${isWeekend ? 'color: var(--color-primary);' : ''}">${monthDay}<br>${dayOfWeek}</th>`;
    });
    tableHtml += '</tr></thead>';

    tableHtml += '<tbody>';
    productsToRender.forEach(product => {
        tableHtml += `<tr>`;
        tableHtml += `<td style="font-weight: bold; position: sticky; left: 0; background: var(--color-sidebar-bg); z-index: 1;">${product.name}</td>`;

        displayedDates.forEach(dateStr => {
            const inventory = currentInventoryData[product.product_id]?.[dateStr];
            const status = inventory?.status || 'Closed';
            const quantity = inventory?.quantity_available ?? 0;
            const price = inventory?.base_price; // 可能為 null 或 0

            // --- 判斷視覺提示 (v4 - 修正 price=0 判斷) ---
            let cellStyle = '';
            let priceText = price !== null ? String(price) : '';
            let statusText = status === 'Open' ? '開啟' : '關閉';
            let statusClass = status === 'Open' ? 'status-open' : 'status-closed';
            let tooltip = '';
            let icon = '';

            if (status === 'Open') {
                // **修正**: 價格為 0 也要檢查
                if (price !== null && price > 0) { // 價格有效(>0)
                     if (quantity > 0) { // 且數量 > 0
                        tooltip = `可預訂 (${quantity} 間, $${price})`;
                        cellStyle = ''; // 預設
                    } else { // 價格有效但數量為 0
                        tooltip = '已售罄';
                        cellStyle = 'background-color: #fff3cd;'; // 黃色
                    }
                } else { // 價格未定(null) 或 為零(0)
                    tooltip = `價格${price === null ? '未定' : '為零'}${quantity > 0 ? ' ('+quantity+' 間可用)' : ''}`;
                    icon = `<span style="color: red; font-weight: bold; margin-left: 5px;" title="${price === null ? '價格未定' : '價格為零'}">!</span>`;
                    cellStyle = 'background-color: #fff3cd;'; // 黃色
                }
            } else { // status === 'Closed'
                tooltip = '房間關閉';
                cellStyle = 'background-color: #f8d7da;'; // 紅色
            }

            tableHtml += `
                <td style="border: 1px solid var(--color-border); padding: 5px; text-align: center; vertical-align: top; ${cellStyle}"
                    data-product-id="${product.product_id}" data-date="${dateStr}" title="${tooltip}">
                    <div style="margin-bottom: 3px;">
                        <button class="status-toggle action-btn ${statusClass}" data-status="${status}"
                                style="width: 100%; font-size: 0.8em; padding: 2px 4px; background-color: ${status === 'Open' ? 'var(--color-success)' : 'var(--color-danger)'};">
                            ${statusText}
                        </button>
                    </div>
                    <div style="margin-bottom: 3px;">
                        <input type="number" class="quantity-input" value="${quantity}" min="0" data-original-value="${quantity}"
                               style="width: 90%; text-align: center; font-size: 0.9em; padding: 2px;" ${status === 'Closed' ? 'disabled' : ''}>
                    </div>
                    <div>
                        <input type="number" class="price-input" value="${priceText}" placeholder="預設" min="0" data-original-value="${priceText}"
                               style="width: 90%; text-align: center; font-size: 0.9em; padding: 2px;" ${status === 'Closed' ? 'disabled' : ''}>
                        ${icon}
                    </div>
                </td>`;
        });
        tableHtml += `</tr>`;
    });
    tableHtml += '</tbody></table>';

    container.innerHTML = tableHtml;
    // **重要**: 確保 bindCellEvents 只被呼叫一次，或在呼叫前移除舊監聽器
    // 為了簡單起見，我們可以在 setupEventListeners 中綁定一次即可
    // bindCellEvents(); // <--- 從這裡移除
}


// --- 綁定單元格事件 (v4 - 修正 API 呼叫格式) ---
function bindCellEvents() {
    const grid = document.getElementById('rav-grid-container');
    if (!grid) return;
    // **重要**: 如果已經綁定過，先移除舊的監聽器，避免重複觸發
    // 這是一個簡化的移除方式，更可靠的方式是用 AbortController
    grid.removeEventListener('click', handleCellClick);
    grid.removeEventListener('blur', handleCellBlur, true);
    grid.removeEventListener('focus', handleCellFocus, true);

    // --- Click 事件委派 ---
    grid.addEventListener('click', handleCellClick);
    // --- Blur 事件委派 ---
    grid.addEventListener('blur', handleCellBlur, true); // 使用捕獲
    // --- Focus 事件委派 ---
    grid.addEventListener('focus', handleCellFocus, true); // 使用捕獲
}

// --- 分離 Click 事件處理 ---
async function handleCellClick(e) {
    const target = e.target;
    if (target.matches('.status-toggle')) {
        const cell = target.closest('td[data-product-id][data-date]');
        if (!cell) return;
        const productId = cell.dataset.productId;
        const date = cell.dataset.date;
        const currentStatus = target.dataset.status;
        const newStatus = currentStatus === 'Open' ? 'Closed' : 'Open';
        target.disabled = true;
        try {
            console.log("[handleCellClick] Sending update:", JSON.stringify({ updates: [{ productId, date, status: newStatus }] })); // 除錯
            await api.updateRoomInventory({ updates: [{ productId, date, status: newStatus }] });
            target.dataset.status = newStatus;
            target.textContent = newStatus === 'Open' ? '開啟' : '關閉';
            target.classList.toggle('status-open', newStatus === 'Open');
            target.classList.toggle('status-closed', newStatus === 'Closed');
            target.style.backgroundColor = newStatus === 'Open' ? 'var(--color-success)' : 'var(--color-danger)';
            const qtyInput = cell.querySelector('.quantity-input');
            const priceInput = cell.querySelector('.price-input');
            if (qtyInput) qtyInput.disabled = (newStatus === 'Closed');
            if (priceInput) priceInput.disabled = (newStatus === 'Closed');
            updateCellVisuals(cell); // 更新背景和驚嘆號
            ui.toast.success('狀態更新成功');
        } catch (error) {
             ui.toast.error(`狀態更新失敗: ${error.message}`);
        } finally {
             target.disabled = false;
        }
    }
}

// --- 分離 Blur 事件處理 ---
async function handleCellBlur(e) {
    const target = e.target;
    const cell = target.closest('td[data-product-id][data-date]');
    if (!cell || !target.matches('.quantity-input, .price-input') || target.disabled) return;

    const productId = cell.dataset.productId;
    const date = cell.dataset.date;
    const updateData = { productId, date };
    let valueChanged = false;
    const oldValue = target.dataset.originalValue || '';

    if (target.matches('.quantity-input')) {
        const newValueStr = target.value;
        const newValue = parseInt(newValueStr, 10);
        if (isNaN(newValue) || newValue < 0) {
             ui.toast.error('數量必須是非負整數'); target.value = oldValue; return;
        }
        if (newValueStr !== oldValue) {
             updateData.quantity = newValue; valueChanged = true;
             target.dataset.originalValue = newValueStr;
             console.log(`更新 ${productId} 在 ${date} 的 quantity 為 ${newValue}`);
        }
    } else if (target.matches('.price-input')) {
        const newValueStr = target.value.trim();
        const newValue = newValueStr === '' ? null : parseInt(newValueStr, 10);
        if (newValueStr !== '' && (isNaN(newValue) || newValue < 0)) {
             ui.toast.error('價格必須是非負數字或留空'); target.value = oldValue; return;
        }
        if (newValueStr !== oldValue) {
             updateData.price = newValue; valueChanged = true;
             target.dataset.originalValue = newValueStr;
             console.log(`更新 ${productId} 在 ${date} 的 price 為 ${newValue === null ? '預設(null)' : newValue}`);
        }
    }

    if (valueChanged) {
        target.style.borderColor = 'orange';
        console.log("Preparing to send update:", JSON.stringify({ updates: [updateData] })); // **除錯用**
        try {
            await api.updateRoomInventory({ updates: [updateData] });
            updateCellVisuals(cell); // 更新視覺
            target.style.borderColor = '';
        } catch (error) {
             console.error("單元格更新 API 錯誤:", error);
             ui.toast.error(`更新失敗: ${error.message}`);
             target.style.borderColor = 'red';
             target.value = oldValue; // 恢復舊值
             updateCellVisuals(cell); // 嘗試恢復視覺
        }
    }
}

// --- 分離 Focus 事件處理 ---
function handleCellFocus(e) {
    const target = e.target;
    if (target.matches('.quantity-input, .price-input')) {
         target.dataset.originalValue = target.value;
    }
}


// --- 輔助函式：更新單元格視覺狀態 (v4 - 修正 price=0 判斷) ---
function updateCellVisuals(cell) {
    if (!cell) return;
    const statusBtn = cell.querySelector('.status-toggle');
    const qtyInput = cell.querySelector('.quantity-input');
    const priceInput = cell.querySelector('.price-input');
    const iconSpan = cell.querySelector('span');

    if (!statusBtn || !qtyInput || !priceInput) return;

    const status = statusBtn.dataset.status;
    const quantity = parseInt(qtyInput.value, 10);
    const priceStr = priceInput.value.trim();
    const price = (priceStr === '' || priceStr === priceInput.placeholder) ? null : parseInt(priceStr, 10);

    let cellStyle = '';
    let iconDisplay = 'none';
    let tooltip = '';

    if (status === 'Open') {
        // **修正**: 價格為 0 也要檢查
        if (price !== null && price > 0) { // 價格有效(>0)
             if (quantity > 0) { // 且數量 > 0
                tooltip = `可預訂 (${quantity} 間, $${price})`;
                cellStyle = ''; // 預設
            } else { // 價格有效但數量為 0
                tooltip = '已售罄';
                cellStyle = 'background-color: #fff3cd;'; // 黃色
            }
        } else { // 價格未定(null) 或 為零(0)
            tooltip = `價格${price === null ? '未定' : '為零'}${quantity > 0 ? ' ('+quantity+' 間可用)' : ''}`;
            iconDisplay = 'inline'; // 顯示驚嘆號
            cellStyle = 'background-color: #fff3cd;'; // 黃色
        }
    } else { // Closed
        tooltip = '房間關閉';
        cellStyle = 'background-color: #f8d7da;'; // 紅色
    }

    cell.style.backgroundColor = cellStyle.split(': ')[1]?.replace(';', '') || '';
    cell.title = tooltip;
    if (iconSpan) {
        iconSpan.style.display = iconDisplay;
        iconSpan.title = (price === null) ? '價格未定' : (price === 0 ? '價格為零' : '');
    }

    qtyInput.disabled = (status === 'Closed');
    priceInput.disabled = (status === 'Closed');
}


// --- 讀取資料 ---
async function loadInventoryData() {
    const productSelect = document.getElementById('rav-product-select');
    const dateRange = dateRangePicker ? dateRangePicker.selectedDates : [];

    if (!productSelect || dateRange.length < 2) {
        ui.toast.error('請先選擇房型和日期範圍');
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
    if (displayedDates.length > 60) {
         ui.toast.error('日期範圍過大，請選擇少於 60 天');
         displayedDates = [];
         document.getElementById('rav-grid-container').innerHTML = '<p style="color:red;">日期範圍過大，請重新選擇。</p>';
         return;
    }

    document.getElementById('rav-grid-container').innerHTML = '<p>正在載入資料...</p>';
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
        ui.toast.error(`載入資料失敗: ${error.message}`);
        document.getElementById('rav-grid-container').innerHTML = `<p style="color:red;">載入失敗: ${error.message}</p>`;
    } finally {
         if(loadingBtn) loadingBtn.disabled = false;
    }
}

// --- 處理批次修改 (使用獨立日期選擇器) ---
// --- 處理批次修改 (移除 Flatpickr 初始化) ---
function openBulkEditModal() {
    const productSelect = document.getElementById('rav-product-select');
    const selectedProductId = productSelect.value;

    const infoEl = document.getElementById('bulk-edit-info');
    if (infoEl) {
        infoEl.textContent = selectedProductId === 'all'
            ? '所有已篩選房型'
            : currentProducts.find(p=>p.product_id === selectedProductId)?.name || '選定房型';
    }

    const form = document.getElementById('rav-bulk-edit-form');
    if(form) form.reset();
    document.querySelectorAll('#bulk-edit-weekdays input').forEach(cb => cb.checked = true);

    // **移除**: 不在此處初始化 bulkEditDatePicker

    // **新增**: 清空日期輸入框，讓用戶重新選擇
    const dateInput = document.getElementById('bulk-edit-date-picker');
    if (dateInput) {
        dateInput.value = ''; // 清空顯示
         // 如果之前的實例存在，銷毀它
         if (bulkEditDatePicker) {
              bulkEditDatePicker.destroy();
              bulkEditDatePicker = null; // 清除引用
         }
         // **重要**: 在顯示 Modal 後才初始化
         setTimeout(() => {
              if (document.getElementById('rav-bulk-edit-modal').style.display !== 'none') { // 確保 Modal 真的顯示了
                   console.log("Initializing bulkEditDatePicker...");
                   bulkEditDatePicker = flatpickr(dateInput, {
                        mode: "range",
                        dateFormat: "Y-m-d",
                        locale: "zh_tw",
                   });
                   console.log("BulkEditDatePicker instance:", bulkEditDatePicker);
              }
         }, 50); // 稍微延遲一點點
    } else {
         console.error("找不到批次修改的日期輸入框 #bulk-edit-date-picker");
    }


    ui.showModal('#rav-bulk-edit-modal');
}
async function handleBulkEditSubmit(event) {
    event.preventDefault();
    const form = event.target;
    const productSelect = document.getElementById('rav-product-select');
    const selectedProductId = productSelect.value;

    const bulkDates = bulkEditDatePicker ? bulkEditDatePicker.selectedDates : [];
    if (bulkDates.length < 2) {
         ui.toast.error('請在批次修改視窗中選擇日期範圍');
         return;
    }
    const startDate = flatpickr.formatDate(bulkDates[0], "Y-m-d");
    const endDate = flatpickr.formatDate(bulkDates[1], "Y-m-d");

    const selectedWeekdays = Array.from(form.querySelectorAll('[name="weekday"]:checked')).map(cb => parseInt(cb.value));
    const status = form.querySelector('#bulk-edit-status').value;
    const quantityInput = form.querySelector('#bulk-edit-quantity');
    const priceInput = form.querySelector('#bulk-edit-price');

    if (selectedWeekdays.length === 0) {
         ui.toast.error('請至少選擇一個星期');
         return;
    }

    const updateValues = {};
    if (status) updateValues.status = status;
    if (quantityInput.value !== '') {
         const quantity = parseInt(quantityInput.value);
         if (isNaN(quantity) || quantity < 0) { ui.toast.error('數量必須是非負整數'); return; }
         updateValues.quantity = quantity;
    }
    if (priceInput.value !== '') {
         const price = parseInt(priceInput.value);
         if (isNaN(price) || price < 0) { ui.toast.error('價格必須是非負數字'); return; }
          updateValues.price = price;
    } else if (form.querySelector('#bulk-edit-price:placeholder-shown') === null && priceInput.value === '') {
         updateValues.price = null;
    }

    if (Object.keys(updateValues).length === 0) {
         ui.toast.error('請至少輸入一個要修改的項目 (房況、數量或價格)');
         return;
    }

    const productIdsToUpdate = [];
    if (selectedProductId === 'all') {
         productIdsToUpdate.push(...currentProducts.map(p => p.product_id));
    } else {
         productIdsToUpdate.push(selectedProductId);
    }

    if (productIdsToUpdate.length === 0) {
         ui.toast.error('沒有選定要修改的房型');
         return;
    }

    const confirmMsg = `確定要將 ${productIdsToUpdate.length} 個房型 在 ${startDate} 到 ${endDate} 期間，每週 ${selectedWeekdays.map(d => ['日','一','二','三','四','五','六'][d]).join(',')} 的 ${Object.keys(updateValues).join('/')} 進行批次修改嗎？`;

    const confirmed = await ui.confirm(confirmMsg);
    if (!confirmed) return;

    const submitButton = form.querySelector('button[type="submit"]');
    submitButton.disabled = true;
    submitButton.textContent = '處理中...';

    try {
        const updatePromises = productIdsToUpdate.map(pid => {
             const payload = {
                 productId: pid,
                 startDate,
                 endDate,
                 weekdays: selectedWeekdays,
                 updateValues: { ...updateValues }
             };
             // **修改**: 傳送 updateValues 給後端
             return api.updateRoomInventory(payload);
        });

        await Promise.all(updatePromises);

        ui.toast.success('批次修改成功！');
        ui.hideModal('#rav-bulk-edit-modal');
        await loadInventoryData();
    } catch (error) {
        ui.toast.error(`批次修改失敗: ${error.message}`);
    } finally {
        submitButton.disabled = false;
        submitButton.textContent = '確認修改';
    }
}


// --- 事件綁定 (v4 - 移除 Flatpickr 初始化) ---
function setupEventListeners() {
    const page = document.getElementById('page-room-availability');
    if (!page || page.dataset.initialized === 'true') {
        return;
    }
    console.log("roomAvailabilityManagement: 初始化事件監聽器 (不含 Flatpickr)...");

    // **移除**: dateRangePicker 初始化代碼已移除

    // 綁定按鈕事件 (如果尚未綁定)
    const applyBtn = document.getElementById('rav-apply-filter-btn');
    if (applyBtn && !applyBtn.dataset.listenerAttached) {
        applyBtn.addEventListener('click', loadInventoryData);
        applyBtn.dataset.listenerAttached = 'true';
    }
    const bulkEditBtn = document.getElementById('rav-bulk-edit-all-btn');
    if (bulkEditBtn && !bulkEditBtn.dataset.listenerAttached) {
        bulkEditBtn.addEventListener('click', openBulkEditModal);
        bulkEditBtn.dataset.listenerAttached = 'true';
    }
    const bulkEditForm = document.getElementById('rav-bulk-edit-form');
    if (bulkEditForm && !bulkEditForm.dataset.submitListenerAttached) {
        bulkEditForm.addEventListener('submit', handleBulkEditSubmit);
        bulkEditForm.dataset.submitListenerAttached = 'true';
    }

    // 填充房型下拉選單 (如果尚未填充)
    const productSelect = document.getElementById('rav-product-select');
    if (productSelect && currentProducts.length > 0 && productSelect.options.length <= 1) {
         productSelect.innerHTML = '<option value="all">所有房型</option>';
         currentProducts.forEach(product => {
             productSelect.add(new Option(product.name, product.product_id));
         });
         console.log("roomAvailabilityManagement setupEventListeners: 房型下拉選單已填充。");
    }

    // 綁定表格事件 (移到 renderAvailabilityGrid 後)
    // bindCellEvents(); // <--- 確保這行已移除或註解

    page.dataset.initialized = 'true';
    console.log("roomAvailabilityManagement: 事件監聽器設定完成 (不含 Flatpickr)。");
}




// public/admin/modules/roomAvailabilityManagement.js

// **全域變數 isDatePickerInitialized 保持不變**
// let isDatePickerInitialized = false;

export function initializeDatePickers() {
     console.log("%c[roomAvailabilityManagement] initializeDatePickers CALLED", "color: blue; font-weight: bold;");

     // 防止重複初始化 (保持)
     if (isDatePickerInitialized) {
          console.log("[roomAvailabilityManagement] initializeDatePickers: Already initialized, skipping.");
          return;
     }

     // ***** 顯式檢查頁面容器是否存在且可見 *****
     const pageContainer = document.getElementById('page-room-availability');
     if (!pageContainer) {
         console.error("%c[roomAvailabilityManagement] initializeDatePickers: CRITICAL - Page container #page-room-availability NOT FOUND!", "color: red; font-weight: bold;");
         ui.toast.error("房量控管頁面容器不存在！");
         return; // 頁面容器不存在，無法繼續
     }
     const isPageVisible = window.getComputedStyle(pageContainer).display !== 'none';
     console.log(`[roomAvailabilityManagement] initializeDatePickers: Is #page-room-availability visible? ${isPageVisible}`);
     if (!isPageVisible) {
         console.warn("[roomAvailabilityManagement] initializeDatePickers: Page container #page-room-availability is not visible yet. Aborting initialization attempt.");
         // 理論上 app.js 的 RAF 應該能避免這種情況，但多一層保險
         // return; // 可以選擇在這裡中止，或者繼續嘗試查找元素
     }

     // ***** 顯式查找元素 *****
     console.log("[roomAvailabilityManagement] initializeDatePickers: Attempting to find #rav-date-range using getElementById...");
     const dateRangeInput = document.getElementById('rav-date-range');

     // ***** 關鍵偵錯點 *****
     if (dateRangeInput) {
          console.log("%c[roomAvailabilityManagement] initializeDatePickers: FOUND #rav-date-range via getElementById!", "color: green;");
          console.log("[roomAvailabilityManagement] Element details:", dateRangeInput);

          console.log("%c[roomAvailabilityManagement] === PAUSING EXECUTION ===", "background: yellow; color: black; font-weight: bold;");
          console.log("1. Go to the 'Elements' tab in DevTools.");
          console.log("2. Verify that the element with ID 'rav-date-range' exists and is an <input> tag.");
          console.log("3. Check its computed styles, especially 'display'. It should not be 'none'.");
          console.log("4. Resume execution in the 'Sources' tab (F8 or Play button).");
          debugger; // <--- 在這裡暫停執行

          try {
                console.log("[roomAvailabilityManagement] initializeDatePickers: Initializing main date picker (dateRangePicker)...");
                // *** 增加 onOpen 和 onClose 日誌 ***
                dateRangePicker = flatpickr(dateRangeInput, {
                    mode: "range",
                    dateFormat: "Y-m-d",
                    locale: "zh_tw",
                    defaultDate: [
                         new Date(new Date().getFullYear(), new Date().getMonth(), 1),
                         new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0)
                    ],
                    onOpen: function(selectedDates, dateStr, instance) {
                        console.log("[Flatpickr] Main date picker opened.");
                    },
                    onClose: function(selectedDates, dateStr, instance) {
                        console.log("[Flatpickr] Main date picker closed.");
                    },
                    onReady: function(selectedDates, dateStr, instance) {
                         console.log("[roomAvailabilityManagement] Main date picker (dateRangePicker) onReady triggered.");
                         if (Array.isArray(selectedDates) && selectedDates.length === 2) {
                              console.log("[roomAvailabilityManagement] Main date picker onReady: Dates selected, triggering loadInventoryData...");
                              loadInventoryData(); // 觸發初始資料載入
                         } else {
                              console.warn("[roomAvailabilityManagement] Main date picker onReady: Initial date range invalid or not selected.");
                         }
                    },
                    onError: function(error) {
                        console.error("[roomAvailabilityManagement] Main date picker Flatpickr Error:", error);
                        ui.toast.error("初始化主日期選擇器失敗: " + error.message);
                    }
                });
                console.log("[roomAvailabilityManagement] initializeDatePickers: Main date picker initialization attempted.");
                // *** 稍微延遲後檢查 Flatpickr 實例是否成功附加 ***
                setTimeout(() => {
                     if (dateRangeInput._flatpickr) {
                          console.log("%c[roomAvailabilityManagement] Flatpickr instance successfully attached to #rav-date-range.", "color: green;");
                          isDatePickerInitialized = true; // 標記初始化成功
                     } else {
                          console.error("%c[roomAvailabilityManagement] Flatpickr instance FAILED to attach to #rav-date-range after initialization attempt.", "color: red;");
                          ui.toast.error("Flatpickr 初始化後未能附加到元素！");
                     }
                }, 100); // 延遲 100ms 檢查

          } catch (initError) {
              console.error("[roomAvailabilityManagement] initializeDatePickers: Error DURING Flatpickr initialization:", initError);
              ui.toast.error(`Flatpickr 初始化錯誤: ${initError.message}`);
          }

     } else {
          console.error("%c[roomAvailabilityManagement] initializeDatePickers: FAILED to find #rav-date-range element via getElementById!", "color: red; font-weight: bold;");
          ui.toast.error("無法初始化主日期選擇器 (找不到元素)。");
          // *** 增加更多上下文日誌 ***
          console.log("[roomAvailabilityManagement] initializeDatePickers: Searching within page container...");
          const foundViaQuerySelector = pageContainer.querySelector('#rav-date-range');
          console.log("[roomAvailabilityManagement] initializeDatePickers: Found via querySelector inside page container?", !!foundViaQuerySelector);
          console.log("[roomAvailabilityManagement] initializeDatePickers: Inner HTML of #page-room-availability at time of error:\n", pageContainer.innerHTML.substring(0, 800) + "..."); // 記錄更多 HTML 內容
     }

     // 批次修改的日期選擇器初始化保持在 openBulkEditModal 中
     console.log("[roomAvailabilityManagement] initializeDatePickers finished execution.");
}


export const init = async () => {
    console.log("roomAvailabilityManagement: init 開始 (v5)...");
    const page = document.getElementById('page-room-availability');
    if (!page) {
         console.error("roomAvailabilityManagement init: 找不到頁面元素 #page-room-availability");
         return;
    }
    const gridContainer = document.getElementById('rav-grid-container');
    if (gridContainer) {
         gridContainer.innerHTML = '<p>請先選擇房型和日期範圍，然後點擊「載入資料」。</p>';
    }
     isDatePickerInitialized = false; // 重置初始化標記

    try {
        if (currentProducts.length === 0) {
            const allProds = await api.getProducts();
            currentProducts = allProds; // <--- 修正：這裡應該是 currentProducts = allProds
            console.log(`roomAvailabilityManagement init: 載入 ${currentProducts.length} 個房型/產品`);
        } else {
             console.log(`roomAvailabilityManagement init: 使用快取的 ${currentProducts.length} 個房型/產品。`);
        }

        // 先綁定非 Flatpickr 的事件
        setupEventListeners();

        // **確保這裡沒有呼叫 initializeDatePickers()**

    } catch (error) {
        console.error("初始化房量控管頁面失敗:", error);
        ui.toast.error(`初始化房量控管頁面失敗: ${error.message}`);
         if (page) page.innerHTML = `<p style="color:red;">頁面初始化失敗: ${error.message}</p>`;
    }
     console.log("roomAvailabilityManagement: init 結束 (v5)。");
};