// public/owner/modules/roomControl.js
import { api } from '../api.js';
import { state, setState } from '../state.js';
import { ui } from '../ui.js';

export async function init() {
    const dateInput = document.getElementById('rc-date-range-picker');
    const loadBtn = document.getElementById('rc-load-grid-btn');
    const productFilterSelect = document.getElementById('rc-product-filter');
    const gridContainer = document.getElementById('rc-grid-container');

    if (!dateInput || !loadBtn || !gridContainer) return;

    // 填充房型選單
    if (productFilterSelect && productFilterSelect.options.length <= 1) {
        try {
            const templateKey = state.currentTemplate;
            const templateDef = window.CONFIG?.LOGIC?.INDUSTRY_TEMPLATE_DEFINITIONS[templateKey];
            const roomCategory = templateDef?.logic?.roomCategoryName || '房型';
            const roomProducts = (state.allProducts || []).filter(p => p.category === roomCategory);
            
            productFilterSelect.innerHTML = '<option value="all">所有房型</option>'; 
            roomProducts.forEach(p => {
                productFilterSelect.add(new Option(p.name, p.product_id));
            });
        } catch (e) {
            console.error("填充控房房型篩選器失敗:", e);
        }
    }

    // 初始化日期選擇器
    if (!state.rcDateRangePicker) {
        state.rcDateRangePicker = flatpickr(dateInput, {
            mode: "range",
            dateFormat: "Y-m-d",
            locale: "zh_tw",
            defaultDate: [new Date(), new Date(new Date().setDate(new Date().getDate() + 14))] 
        });
        
        loadBtn.addEventListener('click', loadRoomControlGrid);
        
        // 綁定表格內的操作 (使用事件委派)
        gridContainer.addEventListener('click', (e) => handleRoomGridEvent(e, 'click'));
        gridContainer.addEventListener('change', (e) => handleRoomGridEvent(e, 'change'));
        
        // 初次載入
        loadRoomControlGrid();
    }
}

async function loadRoomControlGrid() {
    const gridContainer = document.getElementById('rc-grid-container');
    const loadBtn = document.getElementById('rc-load-grid-btn');
    
    const dateRange = state.rcDateRangePicker.selectedDates;
    if (dateRange.length < 2) {
        alert("請選擇一個有效的日期範圍");
        return;
    }

    const startDate = flatpickr.formatDate(dateRange[0], "Y-m-d");
    const endDate = flatpickr.formatDate(dateRange[1], "Y-m-d");

    state.rcDisplayedDates = getRcDateRange(startDate, endDate);
    
    if (state.rcDisplayedDates.length > 90) { 
        alert("日期範圍過大，請選擇 90 天以內的範圍");
        return;
    }

    gridContainer.innerHTML = '<p>正在載入房況資料...</p>';
    loadBtn.disabled = true;

    try {
        const params = new URLSearchParams({ startDate, endDate });
        state.currentRoomInventoryData = await api.fetchData(`/api/admin/get-room-inventory?${params.toString()}`);
        renderRoomControlGrid();
    } catch (error) {
        gridContainer.innerHTML = `<p style="color:red;">載入房況失敗: ${error.message}</p>`;
    } finally {
        loadBtn.disabled = false;
    }
}

function renderRoomControlGrid() {
    const container = document.getElementById('rc-grid-container');
    const productFilterSelect = document.getElementById('rc-product-filter');
    const selectedProductId = productFilterSelect ? productFilterSelect.value : 'all';
    
    const templateKey = state.currentTemplate;
    const templateDef = window.CONFIG?.LOGIC?.INDUSTRY_TEMPLATE_DEFINITIONS[templateKey];
    const roomCategory = templateDef?.logic?.roomCategoryName || '房型';
    const baseProductsToRender = (state.allProducts || []).filter(p => p.category === roomCategory);

    const productsToRender = (selectedProductId === 'all')
        ? baseProductsToRender
        : baseProductsToRender.filter(p => p.product_id === selectedProductId);

    if (productsToRender.length === 0 || state.rcDisplayedDates.length === 0) {
        container.innerHTML = '<p>沒有找到符合條件的房型或日期。</p>'; 
        return;
    }

    const weekdayShort = ["日", "一", "二", "三", "四", "五", "六"];
    let tableHtml = '<table class="rc-table"><thead><tr><th>房型</th>';
    
    state.rcDisplayedDates.forEach(dateStr => {
        const date = new Date(dateStr + 'T00:00:00');
        const monthDay = `${date.getMonth() + 1}/${date.getDate()}`;
        const dayOfWeek = weekdayShort[date.getDay()];
        tableHtml += `<th>${monthDay}<br>${dayOfWeek}</th>`;
    });
    tableHtml += '</tr></thead><tbody>';

    productsToRender.forEach(product => {
        tableHtml += `<tr><td>${product.name}</td>`;
        state.rcDisplayedDates.forEach(dateStr => {
            const inventory = state.currentRoomInventoryData[product.product_id]?.[dateStr];
            const status = inventory?.status || 'Closed';
            const quantity = inventory?.quantity_available ?? 0;
            const price = inventory?.base_price;
            const priceText = (price === null || price === undefined) ? '' : String(price);

            const visuals = calculateCellVisuals(status, quantity, price);

            tableHtml += `
                <td style="background-color: ${visuals.bgColor};" data-product-id="${product.product_id}" data-date="${dateStr}" title="${visuals.tooltip}">
                    <button class="rc-status-btn ${status === 'Open' ? (quantity > 0 ? 'status-open' : 'status-soldout') : 'status-closed'}" 
                            data-status="${status}"
                            style="background-color: ${visuals.buttonBgColor}; color: ${visuals.buttonTextColor};">
                        ${visuals.buttonText}
                    </button>
                    <input type="number" class="rc-quantity-input" value="${quantity}" min="0" ${status === 'Closed' ? 'disabled' : ''}>
                    <input type="number" class="rc-price-input" value="${priceText}" placeholder="預設" min="0" ${status === 'Closed' ? 'disabled' : ''}>
                    ${visuals.iconHtml}
                </td>`;
        });
        tableHtml += `</tr>`;
    });
    tableHtml += '</tbody></table>';
    container.innerHTML = tableHtml;
}

async function handleRoomGridEvent(e, eventType) {
    const target = e.target;
    const cell = target.closest('td[data-product-id][data-date]');
    if (!cell) return;

    const productId = cell.dataset.productId;
    const date = cell.dataset.date;
    let payload = { updates: [] };
    let updateType = '';

    if (eventType === 'click' && target.classList.contains('rc-status-btn')) {
        target.disabled = true;
        target.textContent = '...';
        const currentStatus = target.dataset.status;
        const newStatus = currentStatus === 'Open' ? 'Closed' : 'Open';
        payload.updates.push({ productId, date, status: newStatus });
        updateType = 'status';

    } else if (eventType === 'change' && (target.classList.contains('rc-quantity-input') || target.classList.contains('rc-price-input'))) {
        const qtyInput = cell.querySelector('.rc-quantity-input');
        const priceInput = cell.querySelector('.rc-price-input');
        
        const quantity = parseInt(qtyInput.value, 10);
        const priceStr = priceInput.value.trim();
        const price = (priceStr === '') ? null : parseInt(priceStr, 10);

        if (isNaN(quantity) || quantity < 0) {
            alert('數量必須是有效的非負整數');
            return;
        }
        
        payload.updates.push({ productId, date, quantity: quantity, price: price });
        updateType = 'inputs';
    } else {
        return; 
    }

    try {
        await api.fetchData('/api/admin/update-room-inventory', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        // 更新本地快取
        const updatedData = payload.updates[0];
        if (!state.currentRoomInventoryData[productId]) state.currentRoomInventoryData[productId] = {};
        if (!state.currentRoomInventoryData[productId][date]) state.currentRoomInventoryData[productId][date] = {};
        
        if (updatedData.status) state.currentRoomInventoryData[productId][date].status = updatedData.status;
        if (updatedData.quantity !== undefined) state.currentRoomInventoryData[productId][date].quantity_available = updatedData.quantity;
        if (updatedData.price !== undefined) state.currentRoomInventoryData[productId][date].base_price = updatedData.price;

        // 重新渲染該單元格
        // 為了簡化，直接重繪整個表格 (或您可以實作 updateCellVisuals 來優化)
        renderRoomControlGrid(); 

    } catch (error) {
        alert(`更新失敗: ${error.message}`);
        if(updateType === 'status') target.disabled = false;
    }
}

function calculateCellVisuals(status, quantity, price) {
    // 簡單的視覺邏輯
    if (status === 'Closed') {
        return { 
            bgColor: 'rgba(220, 53, 69, 0.1)', 
            tooltip: '已關閉', 
            iconHtml: '', 
            buttonBgColor: 'var(--color-danger)', 
            buttonText: '關閉',
            buttonTextColor: 'white'
        };
    }
    const isValidPrice = (price !== null && price !== undefined && price > 0);
    if (quantity > 0) {
        if (isValidPrice) {
            return { 
                bgColor: 'white', tooltip: '可預訂', iconHtml: '', 
                buttonBgColor: 'var(--color-success)', buttonText: '開啟', buttonTextColor: 'white'
            };
        } else {
            return { 
                bgColor: 'rgba(255, 193, 7, 0.2)', tooltip: '價格未定', iconHtml: '!', 
                buttonBgColor: 'var(--color-success)', buttonText: '開啟', buttonTextColor: 'white'
            };
        }
    } else {
        return { 
            bgColor: 'white', tooltip: '已售完', iconHtml: '', 
            buttonBgColor: 'var(--color-warning)', buttonText: '售完', buttonTextColor: 'black'
        };
    }
}

function getRcDateRange(startDateStr, endDateStr) {
    const dates = [];
    let currentDate = new Date(startDateStr + 'T00:00:00');
    const endDate = new Date(endDateStr + 'T00:00:00');
    while (currentDate <= endDate) {
        dates.push(currentDate.toISOString().split('T')[0]);
        currentDate.setDate(currentDate.getDate() + 1);
    }
    return dates;
}