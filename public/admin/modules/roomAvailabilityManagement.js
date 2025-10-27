// public/admin/modules/roomAvailabilityManagement.js
import { api } from '../api.js';
import { ui } from '../ui.js';

let currentProducts = []; // 存放房型資料
let currentInventoryData = {}; // 存放讀取的庫存資料
let dateRangePicker = null; // 日期選擇器實例

// --- 主要渲染函式 (待實作) ---
function renderAvailabilityGrid() {
    const container = document.getElementById('rav-grid-container');
    if (!container) return;
    container.innerHTML = '<p>正在生成表格...</p>'; // 替換為實際表格 HTML
    console.log("需要根據 currentInventoryData 和 currentProducts 來渲染表格");

    // 在這裡加入生成 HTML 表格的複雜邏輯
    // 包含狀態按鈕、數量輸入框、價格輸入框
    // 需綁定事件監聽器以處理修改

    // 綁定單元格修改事件 (範例)
    bindCellEvents();
}

// --- 綁定單元格事件 (待實作) ---
function bindCellEvents() {
    const grid = document.getElementById('rav-grid-container');
    if (!grid) return;

    grid.addEventListener('click', async (e) => {
        const target = e.target;
        const cell = target.closest('[data-product-id][data-date]');
        if (!cell) return;

        const productId = cell.dataset.productId;
        const date = cell.dataset.date;

        // 範例：處理狀態點擊
        if (target.matches('.status-toggle')) {
             const currentStatus = target.dataset.status;
             const newStatus = currentStatus === 'Open' ? 'Closed' : 'Open';
             console.log(`切換 ${productId} 在 ${date} 的狀態為 ${newStatus}`);
             // 呼叫 API 更新單筆資料
             try {
                 await api.updateRoomInventory({ // 注意: api.js 還沒加入這個函式
                     updates: [{ productId, date, status: newStatus }]
                 });
                 // 更新成功後，重新讀取或直接修改介面
                 target.dataset.status = newStatus;
                 target.textContent = newStatus;
                 target.style.backgroundColor = newStatus === 'Open' ? 'var(--color-success)' : 'var(--color-danger)';
                 ui.toast.success('狀態更新成功');
             } catch (error) {
                  ui.toast.error(`狀態更新失敗: ${error.message}`);
             }
        }
    });

    // 範例：處理數量/價格輸入 (可能用 'change' 或 'blur' 事件)
    grid.addEventListener('change', async (e) => {
         const target = e.target;
         const cell = target.closest('[data-product-id][data-date]');
         if (!cell || !target.matches('.quantity-input, .price-input')) return;

         const productId = cell.dataset.productId;
         const date = cell.dataset.date;
         const updateData = { productId, date };
         let value;

         if (target.matches('.quantity-input')) {
              value = parseInt(target.value, 10);
              if (isNaN(value) || value < 0) {
                   ui.toast.error('數量必須是非負整數');
                   // 可能需要恢復舊值
                   return;
              }
              updateData.quantity = value;
              console.log(`更新 ${productId} 在 ${date} 的數量為 ${value}`);
         } else if (target.matches('.price-input')) {
              value = target.value.trim() === '' ? null : parseInt(target.value, 10); // 允許空值=恢復預設
              if (target.value.trim() !== '' && (isNaN(value))) {
                  ui.toast.error('價格必須是數字或留空');
                   return;
              }
               updateData.price = value;
               console.log(`更新 ${productId} 在 ${date} 的價格為 ${value === null ? '預設' : value}`);
         }

         // 呼叫 API 更新單筆資料
          try {
              await api.updateRoomInventory({ updates: [updateData] });
              ui.toast.success('更新成功');
              // 可能需要更新相關的視覺提示 (例如價格空值的驚嘆號)
          } catch (error) {
               ui.toast.error(`更新失敗: ${error.message}`);
               // 可能需要恢復舊值
          }
    });
}

// --- 讀取資料 (待實作) ---
async function loadInventoryData() {
    const selectedProductId = document.getElementById('rav-product-select').value;
    const dateRange = dateRangePicker ? dateRangePicker.selectedDates : [];
    if (dateRange.length < 2) {
        ui.toast.error('請先選擇日期範圍');
        return;
    }
    const startDate = flatpickr.formatDate(dateRange[0], "Y-m-d");
    const endDate = flatpickr.formatDate(dateRange[1], "Y-m-d");

    document.getElementById('rav-grid-container').innerHTML = '<p>正在載入資料...</p>';

    try {
        const params = new URLSearchParams({ startDate, endDate });
        if (selectedProductId !== 'all') {
            params.append('productId', selectedProductId);
        }
        // **重要**: 需要在 api.js 中加入 getRoomInventory 函式
        currentInventoryData = await api.getRoomInventory(params);
        renderAvailabilityGrid();
    } catch (error) {
        ui.toast.error(`載入資料失敗: ${error.message}`);
        document.getElementById('rav-grid-container').innerHTML = `<p style="color:red;">載入失敗: ${error.message}</p>`;
    }
}

// --- 處理批次修改 (待實作) ---
function openBulkEditModal() {
    const selectedProductId = document.getElementById('rav-product-select').value;
    const dateRange = dateRangePicker ? dateRangePicker.selectedDates : [];

    if (dateRange.length < 2) {
         ui.toast.error('請先選擇日期範圍');
         return;
    }
     const startDate = flatpickr.formatDate(dateRange[0], "Y-m-d");
     const endDate = flatpickr.formatDate(dateRange[1], "Y-m-d");

    // 更新 Modal 中的資訊
     document.getElementById('bulk-edit-info').textContent = selectedProductId === 'all' ? '所有顯示房型' : currentProducts.find(p=>p.product_id === selectedProductId)?.name;
     document.getElementById('bulk-edit-date-range').value = `${startDate} 至 ${endDate}`;

    // 重設表單
     document.getElementById('rav-bulk-edit-form').reset();
     document.querySelectorAll('#bulk-edit-weekdays input').forEach(cb => cb.checked = false); // 清除星期選擇

    ui.showModal('#rav-bulk-edit-modal');
}

async function handleBulkEditSubmit(event) {
    event.preventDefault();
    const form = event.target;
    const selectedProductId = document.getElementById('rav-product-select').value; // 重新獲取一次
    const dateRange = dateRangePicker ? dateRangePicker.selectedDates : [];
    const startDate = flatpickr.formatDate(dateRange[0], "Y-m-d");
    const endDate = flatpickr.formatDate(dateRange[1], "Y-m-d");

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
         if (isNaN(price)) { ui.toast.error('價格必須是數字'); return; }
          updateValues.price = price; // 傳送數字
    } else if (priceInput.value === '') {
         // 如果使用者清空價格欄，我們傳遞 null 以表示恢復預設價
         updateValues.price = null;
    }


    if (Object.keys(updateValues).length === 0) {
         ui.toast.error('請至少輸入一個要修改的項目 (房況、數量或價格)');
         return;
    }

    const payload = {
        startDate,
        endDate,
        weekdays: selectedWeekdays,
        updateValues
    };

    // 如果只修改特定房型
    if (selectedProductId !== 'all') {
        payload.productId = selectedProductId;
    }
    // 如果修改所有房型，後端 API 需要知道如何處理 (需要後端支援或前端分開多次呼叫)
    // **目前假設後端 API 能處理 productId 不存在=修改所有** (或者需要調整)

    const confirmMsg = `確定要將 ${selectedProductId === 'all' ? '所有房型' : '選定房型'} 在 ${startDate} 到 ${endDate} 期間，每週 ${selectedWeekdays.map(d => ['日','一','二','三','四','五','六'][d]).join(',')} 的 ${Object.keys(updateValues).join('/')} 進行批次修改嗎？`;

    if (!confirm(confirmMsg)) return;

    const submitButton = form.querySelector('button[type="submit"]');
    submitButton.disabled = true;
    submitButton.textContent = '處理中...';

    try {
        // **重要**: 需要在 api.js 中加入 updateRoomInventory 函式
        await api.updateRoomInventory(payload); // 傳送批次更新指令
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
    if (page.dataset.initialized) return;

    // 初始化日期範圍選擇器
    dateRangePicker = flatpickr("#rav-date-range", {
        mode: "range",
        dateFormat: "Y-m-d",
        locale: "zh_tw", // 如果您有引入語言包
        onChange: function(selectedDates, dateStr, instance) {
            // 當日期改變時，可以選擇是否自動載入，或等待按鈕
        }
    });

    document.getElementById('rav-apply-filter-btn')?.addEventListener('click', loadInventoryData);
    document.getElementById('rav-bulk-edit-all-btn')?.addEventListener('click', openBulkEditModal);
    document.getElementById('rav-bulk-edit-form')?.addEventListener('submit', handleBulkEditSubmit);

    // 初始化房型下拉選單 (只執行一次)
    const productSelect = document.getElementById('rav-product-select');
    if (productSelect && currentProducts.length > 0 && productSelect.options.length <= 1) {
         currentProducts.forEach(product => {
             // 這裡假設房型都在 Products 表裡，且有一個可識別的分類或方式
             // 如果沒有，您可能需要調整 api.getProducts 或在這裡篩選
             if (product.category === '房型') { // **假設您的房型分類叫 '房型'**
                 productSelect.add(new Option(product.name, product.product_id));
             }
         });
    }


    page.dataset.initialized = 'true';
}

// --- 初始化函式 ---
export const init = async () => {
    // 先讀取房型資料，用於下拉選單和渲染
    try {
        if (currentProducts.length === 0) {
            // 讀取所有產品，稍後篩選房型
            const allProds = await api.getProducts();
            // **篩選出民宿房型，假設 category 是 '房型'**
            currentProducts = allProds.filter(p => p.category === '房型');
             if (currentProducts.length === 0) {
                 console.warn("在 Products 中找不到 category 為 '房型' 的項目，房型下拉選單將是空的。");
             }
        }
        setupEventListeners();
         // 可以在這裡設定預設日期範圍，例如本月
         const today = new Date();
         const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);
         const lastDay = new Date(today.getFullYear(), today.getMonth() + 1, 0);
         if (dateRangePicker) {
             dateRangePicker.setDate([firstDay, lastDay]);
             // 可以選擇是否自動觸發第一次載入
             // loadInventoryData();
         }

    } catch (error) {
        ui.toast.error(`初始化房量控管頁面失敗: ${error.message}`);
         document.getElementById('page-room-availability').innerHTML = `<p style="color:red;">頁面初始化失敗: ${error.message}</p>`;
    }
};