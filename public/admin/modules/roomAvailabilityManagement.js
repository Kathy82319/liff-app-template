// public/admin/modules/roomAvailabilityManagement.js
import { api } from '../api.js';
import { ui } from '../ui.js';

let currentProducts = []; // 存放房型資料 (不過濾 category)
let currentInventoryData = {}; // 存放讀取的庫存資料 { "房型ID": { "日期": { status, quantity, price } } }
let dateRangePicker = null; // 主日期範圍選擇器實例
let bulkEditDatePicker = null; // 批次修改日期選擇器實例
let displayedDates = []; // 當前表格顯示的日期陣列

// --- Helper: 取得某日期是星期幾的縮寫 ---
const weekdayShort = ["日", "一", "二", "三", "四", "五", "六"];

// --- 核心渲染函式 ---
function renderAvailabilityGrid() {
    const container = document.getElementById('rav-grid-container');
    const productSelect = document.getElementById('rav-product-select');
    if (!container || !productSelect) {
        console.error("renderAvailabilityGrid: 找不到容器或房型選擇器");
        return;
    }

    // 取得要顯示的房型 ID 列表
    const selectedProductId = productSelect.value;
    const productsToRender = selectedProductId === 'all'
        ? currentProducts // 顯示所有已載入的房型
        : currentProducts.filter(p => p.product_id === selectedProductId);

    if (productsToRender.length === 0) {
        container.innerHTML = '<p>沒有找到符合條件的房型。</p>';
        return;
    }
    if (displayedDates.length === 0) {
        container.innerHTML = '<p>請先選擇有效的日期範圍。</p>';
        return;
    }

    // --- 開始建立表格 HTML ---
    let tableHtml = '<table class="rav-table" style="width: 100%; border-collapse: collapse;">';

    // 1. 表頭 (日期 + 星期)
    tableHtml += '<thead><tr><th style="min-width: 150px; position: sticky; left: 0; background: var(--color-sidebar-bg); z-index: 1;">房型</th>'; // 固定房型欄
    displayedDates.forEach(dateStr => {
        const date = new Date(dateStr + 'T00:00:00');
        const monthDay = `${date.getMonth() + 1}/${date.getDate()}`;
        const dayOfWeek = weekdayShort[date.getDay()];
        const isWeekend = date.getDay() === 0 || date.getDay() === 6;
        tableHtml += `<th style="min-width: 100px; text-align: center; ${isWeekend ? 'color: var(--color-primary);' : ''}">${monthDay}<br>${dayOfWeek}</th>`;
    });
    tableHtml += '</tr></thead>';

    // 2. 表格內容 (每個房型一行)
    tableHtml += '<tbody>';
    productsToRender.forEach(product => {
        tableHtml += `<tr>`;
        tableHtml += `<td style="font-weight: bold; position: sticky; left: 0; background: var(--color-sidebar-bg); z-index: 1;">${product.name}</td>`;

        displayedDates.forEach(dateStr => {
            const inventory = currentInventoryData[product.product_id]?.[dateStr];
            const status = inventory?.status || 'Closed';
            const quantity = inventory?.quantity_available ?? 0;
            const price = inventory?.base_price; // 可能為 null 或 0

            // --- 判斷視覺提示 (v3 - 包含 price=0) ---
            let cellStyle = '';
            let priceText = price !== null ? String(price) : '';
            let statusText = status === 'Open' ? '開啟' : '關閉';
            let statusClass = status === 'Open' ? 'status-open' : 'status-closed';
            let tooltip = '';
            let icon = '';
            let isPotentiallyBookable = false; // 是否滿足基本可訂條件

            if (status === 'Open') {
                if (quantity > 0) {
                    // 價格為 null 或 0 視為不可訂
                    if (price !== null && price > 0) {
                        isPotentiallyBookable = true;
                        tooltip = `可預訂 (${quantity} 間, $${price})`;
                        cellStyle = ''; // 預設背景
                    } else { // 價格未定(null) 或 為零(0)
                        tooltip = `價格${price === null ? '未定' : '為零'} (${quantity} 間可用)`;
                        icon = `<span style="color: red; font-weight: bold; margin-left: 5px;" title="${price === null ? '價格未定' : '價格為零'}">!</span>`;
                        cellStyle = 'background-color: #fff3cd;'; // 黃色
                    }
                } else { // 數量為 0
                    tooltip = '已售罄';
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
    bindCellEvents();
}


// --- 綁定單元格事件 (v3 - 修正 API 呼叫和視覺更新) ---
function bindCellEvents() {
    const grid = document.getElementById('rav-grid-container');
    if (!grid) return;

    // --- Click 事件委派 ---
    grid.addEventListener('click', async (e) => {
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
                await api.updateRoomInventory({
                    updates: [{ productId, date, status: newStatus }]
                });

                target.dataset.status = newStatus;
                target.textContent = newStatus === 'Open' ? '開啟' : '關閉';
                target.classList.toggle('status-open', newStatus === 'Open');
                target.classList.toggle('status-closed', newStatus === 'Closed');
                target.style.backgroundColor = newStatus === 'Open' ? 'var(--color-success)' : 'var(--color-danger)';

                const qtyInput = cell.querySelector('.quantity-input');
                const priceInput = cell.querySelector('.price-input');
                if (qtyInput) qtyInput.disabled = (newStatus === 'Closed');
                if (priceInput) priceInput.disabled = (newStatus === 'Closed');

                // 更新背景色和驚嘆號
                updateCellVisuals(cell);

                ui.toast.success('狀態更新成功');
            } catch (error) {
                 ui.toast.error(`狀態更新失敗: ${error.message}`);
            } finally {
                 target.disabled = false;
            }
        }
    });

    // --- Blur 事件委派 ---
    grid.addEventListener('blur', async (e) => {
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
                 ui.toast.error('數量必須是非負整數');
                 target.value = oldValue;
                 return;
            }
            if (newValueStr !== oldValue) {
                 updateData.quantity = newValue; // 使用 quantity key
                 valueChanged = true;
                 target.dataset.originalValue = newValueStr;
                 console.log(`更新 ${productId} 在 ${date} 的 quantity 為 ${newValue}`);
            }

        } else if (target.matches('.price-input')) {
            const newValueStr = target.value.trim();
            const newValue = newValueStr === '' ? null : parseInt(newValueStr, 10);

            if (newValueStr !== '' && (isNaN(newValue) || newValue < 0)) {
                 ui.toast.error('價格必須是非負數字或留空');
                 target.value = oldValue;
                 return;
            }

            if (newValueStr !== oldValue) {
                 updateData.price = newValue; // 使用 price key, newValue 可能是數字或 null
                 valueChanged = true;
                 target.dataset.originalValue = newValueStr;
                 console.log(`更新 ${productId} 在 ${date} 的 price 為 ${newValue === null ? '預設(null)' : newValue}`);
            }
        }

        if (valueChanged) {
            target.style.borderColor = 'orange';
            console.log("準備發送單元格更新:", JSON.stringify({ updates: [updateData] })); // **除錯用**
            try {
                await api.updateRoomInventory({ updates: [updateData] });
                // 更新成功後，更新單元格視覺
                updateCellVisuals(cell);
                target.style.borderColor = '';
            } catch (error) {
                 console.error("單元格更新 API 錯誤:", error); // **除錯用**
                 ui.toast.error(`更新失敗: ${error.message}`);
                 target.style.borderColor = 'red';
                 target.value = oldValue; // 恢復舊值
                 // 可能需要恢復背景色和驚嘆號，但 updateCellVisuals 會處理一部分
                 updateCellVisuals(cell); // 嘗試恢復視覺
            }
        }
    }, true);

     // --- Focus 事件委派 ---
     grid.addEventListener('focus', (e) => {
          const target = e.target;
          if (target.matches('.quantity-input, .price-input')) {
               target.dataset.originalValue = target.value;
          }
     }, true);
}

// --- 【新增】輔助函式：更新單元格視覺狀態 ---
function updateCellVisuals(cell) {
    if (!cell) return;
    const statusBtn = cell.querySelector('.status-toggle');
    const qtyInput = cell.querySelector('.quantity-input');
    const priceInput = cell.querySelector('.price-input');
    const iconSpan = cell.querySelector('span'); // 假設驚嘆號是 span

    if (!statusBtn || !qtyInput || !priceInput) return;

    const status = statusBtn.dataset.status;
    const quantity = parseInt(qtyInput.value, 10);
    const priceStr = priceInput.value.trim();
    const price = (priceStr === '' || priceStr === priceInput.placeholder) ? null : parseInt(priceStr, 10);

    let cellStyle = '';
    let iconDisplay = 'none';
    let tooltip = '';

    if (status === 'Open') {
        if (quantity > 0) {
            if (price !== null && price > 0) { // 可訂
                tooltip = `可預訂 (${quantity} 間, $${price})`;
                cellStyle = ''; // 預設
            } else { // 價格未定或為零
                tooltip = `價格${price === null ? '未定' : '為零'} (${quantity} 間可用)`;
                iconDisplay = 'inline'; // 顯示驚嘆號
                cellStyle = 'background-color: #fff3cd;'; // 黃色
            }
        } else { // 已售罄
            tooltip = '已售罄';
            cellStyle = 'background-color: #fff3cd;'; // 黃色
        }
    } else { // Closed
        tooltip = '房間關閉';
        cellStyle = 'background-color: #f8d7da;'; // 紅色
    }

    cell.style.backgroundColor = cellStyle.split(': ')[1]?.replace(';', '') || ''; // 只更新背景色
    cell.title = tooltip; // 更新滑鼠提示
    if (iconSpan) {
        iconSpan.style.display = iconDisplay; // 更新驚嘆號顯示
        iconSpan.title = (price === null) ? '價格未定' : (price === 0 ? '價格為零' : '');
    }

    // 確保輸入框狀態同步
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

    const dateInput = document.getElementById('bulk-edit-date-picker');
    if (dateInput) {
         if (bulkEditDatePicker) {
              bulkEditDatePicker.destroy();
         }
         bulkEditDatePicker = flatpickr(dateInput, {
              mode: "range",
              dateFormat: "Y-m-d",
              locale: "zh_tw",
         });
         console.log("批次修改 Flatpickr 初始化完成"); // **除錯用**
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


// --- 事件綁定 ---
function setupEventListeners() {
    const page = document.getElementById('page-room-availability');
    if (page.dataset.initialized === 'true') {
        console.log("roomAvailabilityManagement: 事件已初始化，跳過。");
        return;
    }
    console.log("roomAvailabilityManagement: 初始化事件監聽器...");

    // 初始化主日期範圍選擇器
    if (!dateRangePicker) {
         dateRangePicker = flatpickr("#rav-date-range", {
             mode: "range",
             dateFormat: "Y-m-d",
             locale: "zh_tw",
             defaultDate: [
                  new Date(new Date().getFullYear(), new Date().getMonth(), 1),
                  new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0)
             ],
             // **修改**: 使用 onReady 觸發初始載入
             onReady: function(selectedDates, dateStr, instance) {
                  console.log("主日期選擇器 onReady");
                  if (selectedDates.length === 2) {
                       console.log("roomAvailabilityManagement setupEventListeners (onReady): 觸發初始 loadInventoryData...");
                       // 使用 setTimeout 確保 DOM 完全渲染
                       setTimeout(() => {
                           loadInventoryData();
                       }, 0);
                  } else {
                       console.log("roomAvailabilityManagement setupEventListeners (onReady): 初始日期範圍未選定。");
                  }
             },
             // onChange: function(selectedDates, dateStr, instance) {
             //     // onChange 中不再觸發 loadInventoryData
             // }
         });
         console.log("主日期選擇器 Flatpickr 初始化完成"); // **除錯用**
    }

    document.getElementById('rav-apply-filter-btn')?.addEventListener('click', loadInventoryData);
    document.getElementById('rav-bulk-edit-all-btn')?.addEventListener('click', openBulkEditModal);

    const bulkEditForm = document.getElementById('rav-bulk-edit-form');
    if (bulkEditForm && !bulkEditForm.dataset.submitListenerAttached) {
        bulkEditForm.addEventListener('submit', handleBulkEditSubmit);
        bulkEditForm.dataset.submitListenerAttached = 'true';
    }

    const productSelect = document.getElementById('rav-product-select');
    if (productSelect && currentProducts.length > 0 && productSelect.options.length <= 1) {
         productSelect.innerHTML = '<option value="all">所有房型</option>';
         currentProducts.forEach(product => {
             productSelect.add(new Option(product.name, product.product_id));
         });
    }

    // **移除**: 不再需要這段，移到 onReady 中
    // if (dateRangePicker && dateRangePicker.selectedDates.length === 2) { ... }

    page.dataset.initialized = 'true';
     console.log("roomAvailabilityManagement: 事件監聽器設定完成。");
} // setupEventListeners 函數結束

// --- 初始化函式 ---
export const init = async () => {
    console.log("roomAvailabilityManagement: init 開始...");
    const page = document.getElementById('page-room-availability');
    if (!page) {
         console.error("roomAvailabilityManagement init: 找不到頁面元素 #page-room-availability");
         return;
    }
    const gridContainer = document.getElementById('rav-grid-container');
    if (gridContainer) {
         gridContainer.innerHTML = '<p>請先選擇房型和日期範圍，然後點擊「載入資料」。</p>';
    }

    try {
        if (currentProducts.length === 0) {
            console.log("roomAvailabilityManagement init: currentProducts 為空，呼叫 api.getProducts...");
            const allProds = await api.getProducts();
            // **修正**: 直接載入所有產品
            currentProducts = allProds;
            console.log(`roomAvailabilityManagement init: 載入 ${currentProducts.length} 個房型/產品`);
        } else {
             console.log(`roomAvailabilityManagement init: 使用快取的 ${currentProducts.length} 個房型/產品。`);
        }

        // **重要**: 確保 setupEventListeners 在這裡被呼叫
        setupEventListeners();

    } catch (error) {
        console.error("初始化房量控管頁面失敗:", error);
        ui.toast.error(`初始化房量控管頁面失敗: ${error.message}`);
         if (page) page.innerHTML = `<p style="color:red;">頁面初始化失敗: ${error.message}</p>`;
    }
     console.log("roomAvailabilityManagement: init 結束。");
};