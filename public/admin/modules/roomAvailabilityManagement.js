// public/admin/modules/roomAvailabilityManagement.js
import { api } from '../api.js';
import { ui } from '../ui.js';

let bulkEditDatePicker = null; // 批次修改日期選擇器實例
let currentProducts = []; // 存放房型資料 (只存 category='房型' 的)
let currentInventoryData = {}; // 存放讀取的庫存資料 { "房型ID": { "日期": { status, quantity, price } } }
let dateRangePicker = null; // 日期範圍選擇器實例
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
        // 標示週末
        const isWeekend = date.getDay() === 0 || date.getDay() === 6;
        tableHtml += `<th style="min-width: 100px; text-align: center; ${isWeekend ? 'color: var(--color-primary);' : ''}">${monthDay}<br>${dayOfWeek}</th>`;
    });
    tableHtml += '</tr></thead>';

    // 2. 表格內容 (每個房型一行)
    tableHtml += '<tbody>';
    productsToRender.forEach(product => {
        tableHtml += `<tr>`;
        // 固定房型名稱欄 + 批次修改按鈕 (待加入功能)
        tableHtml += `<td style="font-weight: bold; position: sticky; left: 0; background: var(--color-sidebar-bg); z-index: 1;">${product.name}</td>`;

        // 遍歷日期，產生每一天的格子
        displayedDates.forEach(dateStr => {
            const inventory = currentInventoryData[product.product_id]?.[dateStr];
            const status = inventory?.status || 'Closed'; // 預設 Closed
            const quantity = inventory?.quantity_available ?? 0; // 預設 0
            const price = inventory?.base_price; // 可能為 null

            // --- 判斷視覺提示 ---
            let cellStyle = '';
            let priceText = price !== null ? String(price) : ''; // 顯示空字串而非 'null'
            let statusText = status === 'Open' ? '開啟' : '關閉';
            let statusClass = status === 'Open' ? 'status-open' : 'status-closed';
            let tooltip = ''; // 滑鼠提示
            let icon = '';
            let isBookable = false; // 標記是否可預訂


        if (status === 'Open') {
            if (quantity > 0) {
                if (price === null || price === 0) { // 狀態開啟，數量>0，價格已定
                    icon = '<span style="color: red; font-weight: bold; margin-left: 5px;" title="價格未定或為零">!</span>';
                    isBookable = false;
                    tooltip += (tooltip ? ', ' : '') + (price === null ? '價格未定' : '價格為零');                    
                    cellStyle = ''; // 預設背景 (白色)
                if (status === 'Open' && cellStyle === '') { // 只有在原本是白色背景時才改為黃色
                 cellStyle = 'background-color: #fff3cd;'; // 黃色提示價格問題
                    }    
                } else { // 狀態開啟，數量>0，但價格未定
                    isBookable = false;
                    tooltip = `價格未定 (${quantity} 間可用)`;
                    icon = '<span style="color: red; font-weight: bold; margin-left: 5px;" title="價格未定">!</span>';
                    cellStyle = 'background-color: #fff3cd;'; // 黃色提示價格問題
                }
            } else { // 狀態開啟，但數量為 0
                isBookable = false;
                tooltip = '已售罄';
                cellStyle = 'background-color: #fff3cd;'; // 黃色表示數量問題
            }
        } else { // status === 'Closed'
            isBookable = false;
            tooltip = '房間關閉';
            cellStyle = 'background-color: #f8d7da;'; // 紅色表示關閉
        }


            // 組裝格子的 HTML
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

    // 表格渲染完畢後，綁定事件
    bindCellEvents();
}


// --- 綁定單元格事件 (處理狀態切換、數量和價格修改) ---
function bindCellEvents() {
    const grid = document.getElementById('rav-grid-container');
    if (!grid) return;

    // 使用事件委派
    grid.addEventListener('click', async (e) => {
        const target = e.target;
        // --- 處理狀態點擊 ---
        if (target.matches('.status-toggle')) {
            const cell = target.closest('td[data-product-id][data-date]');
            if (!cell) return;

            const productId = cell.dataset.productId;
            const date = cell.dataset.date;
            const currentStatus = target.dataset.status;
            const newStatus = currentStatus === 'Open' ? 'Closed' : 'Open';

            // 禁用按鈕防止重複點擊
            target.disabled = true;

            try {
                // **重要**: 呼叫 API 更新單筆資料
                await api.updateRoomInventory({ // 確保 api.js 有 updateRoomInventory
                    updates: [{ productId, date, status: newStatus }]
                });

                // 更新成功後，直接修改介面
                target.dataset.status = newStatus;
                target.textContent = newStatus === 'Open' ? '開啟' : '關閉';
                target.classList.toggle('status-open', newStatus === 'Open');
                target.classList.toggle('status-closed', newStatus === 'Closed');
                target.style.backgroundColor = newStatus === 'Open' ? 'var(--color-success)' : 'var(--color-danger)';

                // 同步禁用/啟用同格的 input
                const qtyInput = cell.querySelector('.quantity-input');
                const priceInput = cell.querySelector('.price-input');
                if (qtyInput) qtyInput.disabled = (newStatus === 'Closed');
                if (priceInput) priceInput.disabled = (newStatus === 'Closed');

            // 更新背景色 (如果需要)
            if (newStatus === 'Closed') {
                cell.style.backgroundColor = '#f8d7da'; // 紅色
            } else {
                 // 如果開啟後數量為 0 或 價格為空，則變黃色，否則變回預設 (白色)
                 const quantity = parseInt(qtyInput.value, 10);
                 const price = priceInput.value.trim() === '' ? null : parseInt(priceInput.value.trim()); // 檢查價格是否為空
                 cell.style.backgroundColor = (quantity === 0 || price === null) ? '#fff3cd' : ''; // 黃色或預設
            }


                ui.toast.success('狀態更新成功');
            } catch (error) {
                 ui.toast.error(`狀態更新失敗: ${error.message}`);
                 // 失敗時不改變介面
            } finally {
                 target.disabled = false; // 恢復按鈕
            }
        }
    });

    // --- 處理數量和價格輸入 (使用 blur 事件，在使用者離開輸入框時觸發) ---
    grid.addEventListener('blur', async (e) => {
        const target = e.target;
        const cell = target.closest('td[data-product-id][data-date]');
        // 只處理狀態為 Open 的格子的輸入
        if (!cell || !target.matches('.quantity-input, .price-input') || target.disabled) return;

        const productId = cell.dataset.productId;
        const date = cell.dataset.date;
        const updateData = { productId, date };
        let valueChanged = false; // 標記值是否真的改變

        if (target.matches('.quantity-input')) {
            const oldValue = target.dataset.originalValue || target.defaultValue; // 記錄原始值
            const newValueStr = target.value;
            const newValue = parseInt(newValueStr, 10);

            if (isNaN(newValue) || newValue < 0) {
                 ui.toast.error('數量必須是非負整數');
                 target.value = oldValue; // 恢復舊值
                 return;
            }
            if (String(newValue) !== oldValue) { // 比較字串避免型別問題
                 updateData.quantity = newValue;
             valueChanged = true;
             target.dataset.originalValue = newValueStr; // 更新原始值記錄
             console.log(`更新 ${productId} 在 ${date} 的價格為 ${newValue === null ? '預設' : newValue}`);
            // **加入**: 更新驚嘆號顯示
             const iconSpan = cell.querySelector('span'); // 假設驚嘆號是唯一的 span
             if (iconSpan) {
                 iconSpan.style.display = (newValue === null || newValue === 0) ? 'inline' : 'none';
                 iconSpan.title = (newValue === null) ? '價格未定' : (newValue === 0 ? '價格為零' : '');
             }
             // **加入**: 更新背景色 (如果價格變為空/零且狀態為 Open)
             if ((newValue === null || newValue === 0) && cell.querySelector('.status-toggle')?.dataset.status === 'Open') {
                  cell.style.backgroundColor = '#fff3cd'; // 黃色
             } else if (newValue !== null && newValue !== 0 && cell.querySelector('.status-toggle')?.dataset.status === 'Open' && parseInt(cell.querySelector('.quantity-input')?.value || '0') > 0) {
                  // 如果價格有效，狀態開啟，且數量>0，則恢復預設背景
            cell.style.backgroundColor = '';
             }
        }

        } 
            else if (target.matches('.price-input')) {
            const oldValue = target.dataset.originalValue || target.defaultValue;
            const newValueStr = target.value.trim();
            const newValue = newValueStr === '' ? null : parseInt(newValueStr, 10); // 允許空值=恢復預設

            if (newValueStr !== '' && (isNaN(newValue))) {
                 ui.toast.error('價格必須是數字或留空');
                 target.value = oldValue;
                 return;
            }

            if (newValueStr !== oldValue) {
                 updateData.price = newValue;
                 valueChanged = true;
                 target.dataset.originalValue = newValueStr; // 更新原始值記錄
                 console.log(`更新 ${productId} 在 ${date} 的價格為 ${newValue === null ? '預設' : newValue}`);
                 // 更新驚嘆號
                 const icon = cell.querySelector('span');
                 if (icon) icon.style.display = (newValue === null) ? 'inline' : 'none';
            }
        }

        // 如果值真的改變了，才呼叫 API
        if (valueChanged) {
            target.style.borderColor = 'orange'; // 提示正在儲存
            try {
                // **重要**: 呼叫 API 更新單筆資料
                await api.updateRoomInventory({ updates: [updateData] });
                // ui.toast.success('更新成功'); // 可以選擇是否顯示 toast
                target.style.borderColor = ''; // 恢復邊框
            } catch (error) {
                 ui.toast.error(`更新失敗: ${error.message}`);
                 target.style.borderColor = 'red'; // 提示錯誤
                 // 這裡可以選擇是否恢復舊值
                 // target.value = target.dataset.originalValue || target.defaultValue;
            }
        }
    }, true); // 使用捕獲階段，確保 blur 先觸發

     // --- 記錄原始值 (在 focus 時) ---
     grid.addEventListener('focus', (e) => {
          const target = e.target;
          if (target.matches('.quantity-input, .price-input')) {
               target.dataset.originalValue = target.value; // 記錄當前值
          }
     }, true); // 使用捕獲階段
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

    // 計算日期範圍並儲存
    displayedDates = [];
    let tempDate = new Date(dateRange[0]);
    const end = new Date(dateRange[1]);
    while(tempDate <= end) {
        displayedDates.push(flatpickr.formatDate(tempDate, "Y-m-d"));
        tempDate.setDate(tempDate.getDate() + 1);
    }
    // 限制最大天數，避免瀏覽器卡頓
    if (displayedDates.length > 60) {
         ui.toast.error('日期範圍過大，請選擇少於 60 天');
         displayedDates = []; // 清空
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
        // **確保 api.js 已加入 getRoomInventory**
        currentInventoryData = await api.getRoomInventory(params);
        renderAvailabilityGrid(); // 根據載入的資料渲染表格
    } catch (error) {
        ui.toast.error(`載入資料失敗: ${error.message}`);
        document.getElementById('rav-grid-container').innerHTML = `<p style="color:red;">載入失敗: ${error.message}</p>`;
    } finally {
         if(loadingBtn) loadingBtn.disabled = false;
    }
}

// --- 處理批次修改 ---
// --- 處理批次修改 (使用獨立日期選擇器) ---
function openBulkEditModal() {
    const productSelect = document.getElementById('rav-product-select');
    const selectedProductId = productSelect.value;
    // 不再需要讀取主日期範圍

    // 更新 Modal 中的資訊
    const infoEl = document.getElementById('bulk-edit-info');
    if (infoEl) {
        infoEl.textContent = selectedProductId === 'all'
            ? '所有已篩選房型'
            : currentProducts.find(p=>p.product_id === selectedProductId)?.name || '選定房型';
    }

    // 重設表單
    const form = document.getElementById('rav-bulk-edit-form');
    if(form) form.reset();
    document.querySelectorAll('#bulk-edit-weekdays input').forEach(cb => cb.checked = true); // 預設全選星期

    // **新增**: 初始化獨立的日期選擇器
    const dateInput = document.getElementById('bulk-edit-date-picker');
    if (dateInput) {
         // 先銷毀舊的實例 (如果存在)
         if (bulkEditDatePicker) {
              bulkEditDatePicker.destroy();
         }
         bulkEditDatePicker = flatpickr(dateInput, {
              mode: "range",
              dateFormat: "Y-m-d",
              locale: "zh_tw",
              // 可以設定預設值，例如主選擇器的範圍
              // defaultDate: dateRangePicker ? dateRangePicker.selectedDates : []
         });
    }

    ui.showModal('#rav-bulk-edit-modal');
}

async function handleBulkEditSubmit(event) {
    event.preventDefault();
    const form = event.target;
    const productSelect = document.getElementById('rav-product-select');
    const selectedProductId = productSelect.value; // 重新獲取一次
    const bulkDates = bulkEditDatePicker ? bulkEditDatePicker.selectedDates : [];
    if (bulkDates.length < 2) {
         ui.toast.error('請在批次修改視窗中選擇日期範圍');
         return;
    }
    const startDate = flatpickr.formatDate(bulkDates[0], "Y-m-d");
    const endDate = flatpickr.formatDate(bulkDates[1], "Y-m-d");
    const dateRange = dateRangePicker ? dateRangePicker.selectedDates : [];
    if (dateRange.length < 2) return; // 防禦



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
         const price = parseInt(priceInput.value); // 價格已改為 INTEGER
         if (isNaN(price)) { ui.toast.error('價格必須是數字'); return; }
          updateValues.price = price; // 傳送數字
    } else if (form.querySelector('#bulk-edit-price:placeholder-shown') === null && priceInput.value === '') {
         // **重要**: 只有當使用者明確清空價格欄時，才傳遞 null 以恢復預設價
         updateValues.price = null;
    }


    if (Object.keys(updateValues).length === 0) {
         ui.toast.error('請至少輸入一個要修改的項目 (房況、數量或價格)');
         return;
    }

    // --- 決定要修改哪些 Product ID ---
    const productIdsToUpdate = [];
    if (selectedProductId === 'all') {
         // 如果選 '所有房型'，則修改當前已載入的所有房型
         productIdsToUpdate.push(...currentProducts.map(p => p.product_id));
    } else {
         productIdsToUpdate.push(selectedProductId);
    }

    if (productIdsToUpdate.length === 0) {
         ui.toast.error('沒有選定要修改的房型');
         return;
    }


    const confirmMsg = `確定要將 ${productIdsToUpdate.length} 個房型 在 ${startDate} 到 ${endDate} 期間，每週 ${selectedWeekdays.map(d => ['日','一','二','三','四','五','六'][d]).join(',')} 的 ${Object.keys(updateValues).join('/')} 進行批次修改嗎？`;

    // 使用 ui.confirm 替代原生 confirm
    const confirmed = await ui.confirm(confirmMsg);
    if (!confirmed) return;


    const submitButton = form.querySelector('button[type="submit"]');
    submitButton.disabled = true;
    submitButton.textContent = '處理中...';

    try {
        // **重要**: 後端 API 需要能處理批次指令
        // 我們將為每個房型發送一個批次更新請求 (或者後端能一次處理多個 productId)
        const updatePromises = productIdsToUpdate.map(pid => {
             const payload = {
                 productId: pid, // 指定當前房型
                 startDate,
                 endDate,
                 weekdays: selectedWeekdays,
                 updateValues: { ...updateValues } // 複製一份，避免互相影響 (雖然在此例中影響不大)
             };
             // 確保 api.js 已加入 updateRoomInventory
             return api.updateRoomInventory(payload);
        });

        await Promise.all(updatePromises); // 等待所有房型的更新完成

        ui.toast.success('批次修改成功！');
        ui.hideModal('#rav-bulk-edit-modal');
        await loadInventoryData(); // 重新載入資料以顯示更新
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
    // 防止重複綁定
    if (page.dataset.initialized === 'true') {
        console.log("roomAvailabilityManagement: 事件已初始化，跳過。");
        return;
    }
    console.log("roomAvailabilityManagement: 初始化事件監聽器...");

    // 初始化日期範圍選擇器
    dateRangePicker = flatpickr("#rav-date-range", {
        mode: "range",
        dateFormat: "Y-m-d",
        locale: "zh_tw", // 確保語言包已載入
        // 可以在這裡設定預設日期，例如本月
        defaultDate: [
             new Date(new Date().getFullYear(), new Date().getMonth(), 1), // 本月第一天
             new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0) // 本月最後一天
        ],
        onChange: function(selectedDates, dateStr, instance) {
            if (selectedDates.length === 2) {
                 // 可以選擇日期改變時自動載入，或等待按鈕
                 // loadInventoryData();
            }
        }
    });

    document.getElementById('rav-apply-filter-btn')?.addEventListener('click', loadInventoryData);
    document.getElementById('rav-bulk-edit-all-btn')?.addEventListener('click', openBulkEditModal);
    document.getElementById('rav-bulk-edit-form')?.addEventListener('submit', handleBulkEditSubmit);

    // 初始化房型下拉選單 (只執行一次)
    const productSelect = document.getElementById('rav-product-select');
    if (productSelect && currentProducts.length > 0 && productSelect.options.length <= 1) { // 檢查是否已填入
         productSelect.innerHTML = '<option value="all">所有房型</option>'; // 清空並加入預設
         currentProducts.forEach(product => {
             // 不再需要檢查 category，因為 currentProducts 已篩選過
             productSelect.add(new Option(product.name, product.product_id));
         });
    }

    page.dataset.initialized = 'true';
     console.log("roomAvailabilityManagement: 事件監聽器設定完成。");
}

// --- 初始化函式 ---
export const init = async () => {
    console.log("roomAvailabilityManagement: init 開始...");
    const page = document.getElementById('page-room-availability');
    if (!page) {
         console.error("roomAvailabilityManagement init: 找不到頁面元素 #page-room-availability");
         return;
    }
    // 先顯示載入提示
    const gridContainer = document.getElementById('rav-grid-container');
    if (gridContainer) {
         gridContainer.innerHTML = '<p>請先選擇房型和日期範圍，然後點擊「載入資料」。</p>';
    }

    // 先讀取房型資料，用於下拉選單和渲染
    try {
        // 如果 currentProducts 是空的，才去呼叫 API
        if (currentProducts.length === 0) {
            console.log("roomAvailabilityManagement init: currentProducts 為空，呼叫 api.getProducts...");
            const allProds = await api.getProducts();
            // **篩選出民宿房型，假設 category 是 '房型'**
                currentProducts = allProds; // 直接使用所有產品
             if (currentProducts.length === 0) {
                 console.warn("在 Products 中找不到 category 為 '房型' 的項目，房型下拉選單將是空的。");
                 // 即使沒有房型，還是繼續執行 setupEventListeners
             }
        } else {
             console.log(`roomAvailabilityManagement init: 使用快取的 ${currentProducts.length} 個房型。`);
        }

        // 無論如何都執行 setupEventListeners 來確保日期選擇器和按鈕事件被綁定
        setupEventListeners();

        // 可以在這裡設定預設日期範圍並自動載入第一次資料
         if (dateRangePicker && dateRangePicker.selectedDates.length === 2) {
             console.log("roomAvailabilityManagement init: 觸發第一次 loadInventoryData...");
             await loadInventoryData(); // 等待第一次資料載入完成
         } else {
              console.log("roomAvailabilityManagement init: 日期選擇器未就緒或未選範圍，不載入初始資料。");
         }

    } catch (error) {
        console.error("初始化房量控管頁面失敗:", error);
        ui.toast.error(`初始化房量控管頁面失敗: ${error.message}`);
         if (page) page.innerHTML = `<p style="color:red;">頁面初始化失敗: ${error.message}</p>`;
    }
     console.log("roomAvailabilityManagement: init 結束。");
};