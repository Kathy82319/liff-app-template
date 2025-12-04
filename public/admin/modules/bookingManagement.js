// public/admin/modules/bookingManagement.js
import { api } from '../api.js';
import { ui } from '../ui.js';
import { escapeHtml } from '../../utils.js';

// 防抖動函式
function debounce(func, delay) {
    let timer;
    return function(...args) {
        clearTimeout(timer);
        timer = setTimeout(() => func.apply(this, args), delay);
    };
}

// --- 變數宣告 ---
let allBookings = [];
let allProducts = [];
let currentCalendarDate = new Date();
let createBookingDatepicker = null;
let bookingDatepicker = null; 
let enabledDates = [];
let currentBookingInModal = null;
let currentStatusMenu = null;
let bookingListDateRangePicker = null; 
let activeTemplate = null;

function getProperty(obj, path, defaultValue = 'N/A') {
    const value = path.split('.').reduce((acc, key) => (acc && acc[key] !== undefined && acc[key] !== null) ? acc[key] : undefined, obj);
    return (value !== undefined && value !== null && value !== '') ? value : defaultValue;
}

function translateStatus(status) {
    // 讀取全域設定來決定用語 (例如：民宿用"已入住"，工作室用"已完成")
    // 這裡先保持通用翻譯
    switch (status) {
        case 'confirmed': return '已確認'; // 或 "待處理"
        case 'checked-in': return '已報到'; // 民宿可顯示 "已入住"
        case 'cancelled': return '已取消';
        case 'no-show': return '未到';
        case 'completed': return '已完成';
        default: return status || '未知';
    }
}

// 綁定 Tbody 點擊事件
function bindTbodyClickListener(tbodyElement) {
     if (!tbodyElement) return;
     const oldListener = tbodyElement.handler;
     if (oldListener) tbodyElement.removeEventListener('click', oldListener);

     const tbodyClickListener = async (e) => {
         const target = e.target;
         const markStatusBtn = target.closest('.btn-mark-status');
         if (markStatusBtn && !markStatusBtn.disabled) {
             e.stopPropagation();
             createStatusMenu(markStatusBtn); 
              if (currentStatusMenu) currentStatusMenu.dataset.originatingBookingId = markStatusBtn.dataset.bookingId;
             return;
         }
         const quickCancelBtn = target.closest('.btn-quick-cancel');
         if (quickCancelBtn) {
             e.stopPropagation();
             const bookingId = quickCancelBtn.dataset.bookingId;
             if (!bookingId) return;
             if (await ui.confirm('確定要取消此預約嗎？')) {
                 try {
                     quickCancelBtn.disabled = true;
                     await api.updateBookingStatus(Number(bookingId), 'cancelled');
                     ui.toast.success('預約已取消');
                     const activeFilter = document.querySelector('#booking-status-filter .active')?.dataset.filter || 'today';
                     await fetchDataAndRender(activeFilter);
                 } catch(err) {
                     ui.toast.error(`錯誤：${err.message}`);
                     quickCancelBtn.disabled = false;
                 }
             }
             return;
         }
         const bookingRow = target.closest('tr[data-booking-id]');
         if (bookingRow && !target.closest('.action-btn')) {
             const bookingId = bookingRow.dataset.bookingId;
             if (bookingId) openBookingDetailsModal(bookingId);
             return;
         }
     };
     tbodyElement.addEventListener('click', tbodyClickListener);
     tbodyElement.handler = tbodyClickListener;
}

function getPriceForDate(dateString, product) {
    if (!product) return null;
    if (product.price_weekday === null) return null; 
    if (!dateString) return product.price_weekday;
    try {
        const date = new Date(dateString + 'T00:00:00');
        if (isNaN(date.getTime())) return product.price_weekday;
        const dayOfWeek = date.getDay();
        if (dayOfWeek === 5) return product.price_friday !== null ? product.price_friday : product.price_weekday;
        else if (dayOfWeek === 6) return product.price_saturday !== null ? product.price_saturday : product.price_weekday;
        else return product.price_weekday !== null ? product.price_weekday : null;
    } catch (e) { return product.price_weekday; }
}

// --- 渲染詳細資料 Modal ---
async function renderBookingDetails(booking, userProfile, isEditing = false) {
    const contentEl = document.getElementById('booking-details-content');
    if (!contentEl) return;

    // 讀取設定
    const activeKey = window.CONFIG?.LOGIC?.ACTIVE_INDUSTRY_TEMPLATE;
    const config = window.CONFIG?.LOGIC?.INDUSTRY_TEMPLATE_DEFINITIONS[activeKey]?.client_config?.booking || {};
    const isGuesthouse = (config.mode === 'range');
    const enableTimeSlot = (config.enable_time_slots !== false);
    const enablePeople = (config.enable_people_count !== false);

    if (!isEditing) { // --- VIEW MODE ---
        let html = `<h4>顧客資訊</h4>`;
        // ... (顧客資訊 HTML 生成，保持不變) ...
        if (userProfile) {
            const safeName = escapeHtml(userProfile.line_display_name);
            const safeRealName = escapeHtml(userProfile.real_name);
            const displayName = userProfile.real_name ? `${safeRealName} (${safeName})` : safeName;
            html += `
                <div class="details-grid-container">
                    <div><strong>姓名:</strong> ${displayName}</div>
                    <div><strong>電話:</strong> ${escapeHtml(userProfile.phone) || escapeHtml(booking.contact_phone) || '未提供'}</div>
                    <div><strong>等級:</strong> ${userProfile.level || '-'}</div>
                </div>`;
        } else {
            html += `<p><strong>姓名:</strong> ${escapeHtml(booking.contact_name)}</p>`;
            html += `<p><strong>電話:</strong> ${escapeHtml(booking.contact_phone) || '未提供'}</p>`;
        }

        html += `<h4>預約資訊</h4>`;
        const bookingIdDisplay = `#${String(booking.booking_id).padStart(5, '0')}`;
        
        html += `<div class="details-grid-container">`;
        html += `<div><strong>預約單號:</strong> ${bookingIdDisplay}</div>`;
        
        if (isGuesthouse) {
            html += `<div><strong>入住日期:</strong> ${booking.booking_date}</div>`;
            html += `<div><strong>退房日期:</strong> ${booking.check_out_date || '-'}</div>`;
        } else {
            html += `<div><strong>預約日期:</strong> ${booking.booking_date}</div>`;
            if (enableTimeSlot) {
                html += `<div><strong>預約時段:</strong> ${escapeHtml(booking.time_slot)}</div>`;
            }
        }
        
        if (enablePeople) {
            html += `<div><strong>總人數:</strong> ${booking.num_of_people} 人</div>`;
        }
        html += `<div><strong>預估金額:</strong> ${booking.total_amount !== null ? '$' + booking.total_amount : '未設定'}</div>`;
        html += `<div><strong>狀態:</strong> ${translateStatus(booking.status)}</div>`;
        html += `</div>`;
        
        html += `<div class="details-notes"><strong>內部備註:</strong> <pre>${escapeHtml(booking.notes) || '無'}</pre></div>`;
        
        // ... (預約項目列表渲染，保持不變) ...
        html += `<h4>預約項目</h4>`;
        if (booking.items && booking.items.length > 0) {
            html += `<table class="items-table"><thead><tr><th>項目</th><th>數量</th><th>單價</th><th>小計</th></tr></thead><tbody>`;
            let calcTotal = 0;
            booking.items.forEach(item => {
                const sub = (item.price||0) * (item.quantity||1);
                calcTotal += sub;
                html += `<tr><td>${escapeHtml(item.item_name)}</td><td>${item.quantity}</td><td>$${item.price}</td><td>$${sub}</td></tr>`;
            });
            html += `</tbody><tfoot><tr><td colspan="3" style="text-align:right">總計:</td><td>$${calcTotal}</td></tr></tfoot></table>`;
        } else {
            html += `<p>無項目</p>`;
        }

        contentEl.innerHTML = html;

    } else { 
        // --- EDIT MODE (編輯表單) ---
        // 這裡也要根據 config 決定顯示哪些輸入框
        
        let dateInputsHtml = '';
        if (isGuesthouse) {
            dateInputsHtml = `
                <div style="grid-column: span 2;">
                    <label>入住/退房日期:</label>
                    <input type="text" id="edit-booking-date-range" value="${booking.booking_date} to ${booking.check_out_date || ''}" placeholder="請選擇日期範圍">
                    <input type="hidden" id="edit-booking-date" value="${booking.booking_date}">
                    <input type="hidden" id="edit-checkout-date" value="${booking.check_out_date || ''}">
                </div>
            `;
        } else {
            dateInputsHtml = `<div><label>預約日期:</label><input type="text" id="edit-booking-date" value="${booking.booking_date}"></div>`;
            if (enableTimeSlot) {
                dateInputsHtml += `<div><label>預約時段:</label><input type="text" id="edit-booking-slot" value="${escapeHtml(booking.time_slot)}"></div>`;
            } else {
                dateInputsHtml += `<input type="hidden" id="edit-booking-slot" value="">`;
            }
        }

        let peopleInputHtml = '';
        if (enablePeople) {
            peopleInputHtml = `<div><label>總人數:</label><input type="number" id="edit-booking-people" value="${booking.num_of_people || 1}" min="1"></div>`;
        } else {
            peopleInputHtml = `<input type="hidden" id="edit-booking-people" value="1">`;
        }

        contentEl.innerHTML = `
            <h4>編輯預約</h4>
            <div id="booking-edit-form" class="details-grid-container">
                 <div><strong>單號:</strong> #${String(booking.booking_id).padStart(5,'0')}</div>
                 ${dateInputsHtml}
                 ${peopleInputHtml}
                 <div><label>金額:</label><input type="number" id="edit-booking-amount" value="${booking.total_amount || ''}" min="0"></div>
                 <div><label>電話:</label><input type="tel" id="edit-booking-phone" value="${escapeHtml(booking.contact_phone) || ''}"></div>
            </div>
            <div><label>備註:</label><textarea id="edit-booking-notes" rows="3">${escapeHtml(booking.notes) || ''}</textarea></div>
            
            <h4 style="display:flex; justify-content:space-between; align-items:center;">
                項目 (編輯中) <button type="button" id="btn-add-edit-item" class="action-btn" style="background-color: var(--color-success); font-size: 0.8rem;">＋</button>
            </h4>
            <div id="edit-items-container"></div>
        `;
        
        // 綁定編輯器的 JS 邏輯 (日曆初始化、項目增刪)
        initEditModeLogic(booking, isGuesthouse);
    }
}


// --- 編輯模式初始化邏輯 ---
function initEditModeLogic(booking, isGuesthouse) {
    const container = document.getElementById('edit-items-container');
    // 匯入之前的 addEditItemRow 邏輯
    if (booking.items && booking.items.length > 0) {
        booking.items.forEach(item => addEditItemRow(container, item));
    } else {
        addEditItemRow(container);
    }
    const addBtn = document.getElementById('btn-add-edit-item');
    if(addBtn) addBtn.onclick = () => addEditItemRow(container);

    // 初始化 Flatpickr
    if (isGuesthouse) {
        flatpickr("#edit-booking-date-range", { 
            mode: "range", dateFormat: "Y-m-d",
            defaultDate: [booking.booking_date, booking.check_out_date],
            onChange: (selectedDates) => {
                if (selectedDates.length === 2) {
                    document.getElementById('edit-booking-date').value = flatpickr.formatDate(selectedDates[0], "Y-m-d");
                    document.getElementById('edit-checkout-date').value = flatpickr.formatDate(selectedDates[1], "Y-m-d");
                }
            }
        });
    } else {
        flatpickr("#edit-booking-date", { dateFormat: "Y-m-d" });
    }
}

// --- 編輯項目列邏輯 ---
function addEditItemRow(container, item = null) {
    const row = document.createElement('div');
    row.className = 'edit-item-row';
    row.style.cssText = 'display: grid; grid-template-columns: 1fr 80px 100px 40px; gap: 10px; margin-bottom: 10px; align-items: center; padding: 10px; border: 1px solid #eee; border-radius: 4px; background: #fafafa;';

    const select = document.createElement('select');
    select.className = 'edit-item-select';
    select.innerHTML = '<option value="">-- 選擇 --</option>';
    allProducts.filter(p => p.is_visible).forEach(p => {
        const priceText = p.price_weekday !== null ? `$${p.price_weekday} 起` : '洽詢';
        select.add(new Option(`${p.name} (${priceText})`, p.name));
    });
    select.add(new Option('其他 (手動)', 'other'));

    const nameInput = document.createElement('input');
    nameInput.type = 'text';
    nameInput.className = 'edit-item-name-manual';
    nameInput.placeholder = '名稱';
    nameInput.style.display = 'none';

    const qtyInput = document.createElement('input');
    qtyInput.type = 'number';
    qtyInput.className = 'edit-item-qty';
    qtyInput.value = item ? item.quantity : 1;
    qtyInput.min = 1;

    const priceInput = document.createElement('input');
    priceInput.type = 'number';
    priceInput.className = 'edit-item-price';
    priceInput.value = item ? (item.price !== null ? item.price : '') : '';
    priceInput.min = 0;

    const removeBtn = document.createElement('button');
    removeBtn.type = 'button';
    removeBtn.textContent = '-';
    removeBtn.className = 'action-btn';
    removeBtn.style.backgroundColor = 'var(--color-danger)';
    removeBtn.onclick = () => { row.remove(); updateEditTotalAmount(); };

    if (item) {
        const matched = Array.from(select.options).find(opt => opt.value === item.item_name);
        if (matched) select.value = item.item_name;
        else { select.value = 'other'; nameInput.style.display = 'block'; nameInput.value = item.item_name; }
    }

    select.addEventListener('change', () => {
        if (select.value === 'other') {
            nameInput.style.display = 'block'; priceInput.value = '';
        } else {
            nameInput.style.display = 'none';
            updateEditItemPrice(row, document.getElementById('edit-booking-date').value);
        }
        updateEditTotalAmount();
    });
    qtyInput.addEventListener('input', updateEditTotalAmount);
    priceInput.addEventListener('input', updateEditTotalAmount);

    const nameWrapper = document.createElement('div');
    nameWrapper.appendChild(select);
    nameWrapper.appendChild(nameInput);
    row.append(nameWrapper, qtyInput, priceInput, removeBtn);
    container.appendChild(row);
}

function updateEditItemPrice(row, dateStr) {
    const select = row.querySelector('.edit-item-select');
    const priceInput = row.querySelector('.edit-item-price');
    if (select.value && select.value !== 'other') {
        const product = allProducts.find(p => p.name === select.value);
        const price = getPriceForDate(dateStr, product);
        if (price !== null) priceInput.value = price;
    }
}

function updateEditTotalAmount() {
    let total = 0;
    document.querySelectorAll('.edit-item-row').forEach(row => {
        const qty = parseFloat(row.querySelector('.edit-item-qty').value) || 0;
        const price = parseFloat(row.querySelector('.edit-item-price').value) || 0;
        total += qty * price;
    });
    const input = document.getElementById('edit-booking-amount');
    if (input) input.value = total;
}

// --- 儲存編輯 ---
async function handleSaveBookingChanges(bookingId) {
    const config = activeTemplate?.client_config?.booking || {};
    const mode = config.mode || 'range';
    
    const payload = {
        bookingId: bookingId,
        bookingDate: document.getElementById('edit-booking-date').value,
        contactPhone: document.getElementById('edit-booking-phone').value.trim() || null,
        notes: document.getElementById('edit-booking-notes').value.trim() || null,
        totalAmount: parseFloat(document.getElementById('edit-booking-amount').value) || null,
        numOfPeople: parseInt(document.getElementById('edit-booking-people').value, 10) || 1,
        items: []
    };

    if (mode === 'range') {
        payload.check_out_date = document.getElementById('edit-checkout-date').value || null;
        payload.timeSlot = ''; 
    } else {
        payload.timeSlot = document.getElementById('edit-booking-slot')?.value.trim() || '';
        payload.check_out_date = null; 
    }

    const itemRows = document.querySelectorAll('.edit-item-row');
    if (itemRows.length === 0) return ui.toast.error('請至少保留一個項目！');

    for (const row of itemRows) {
        const select = row.querySelector('.edit-item-select');
        let name = select.value === 'other' ? row.querySelector('.edit-item-name-manual').value.trim() : select.value;
        const qty = parseInt(row.querySelector('.edit-item-qty').value, 10);
        const price = parseFloat(row.querySelector('.edit-item-price').value);

        if (!name) return ui.toast.error('請輸入項目名稱');
        if (isNaN(qty) || qty <= 0) return ui.toast.error('數量必須大於 0');
        
        payload.items.push({ name, qty, price: isNaN(price) ? null : price });
    }

    try {
        await api.updateBookingDetails(payload);
        ui.toast.success('預約更新成功！');
        ui.hideModal('#booking-details-modal');
        const activeFilter = document.querySelector('#booking-status-filter .active')?.dataset.filter || 'today';
        await fetchDataAndRender(activeFilter);
    } catch (error) {
        ui.toast.error(`儲存失敗：${error.message}`);
    }
}

// --- 手動建立預約相關 ---
function openCreateBookingModal() {
    const modal = document.getElementById('create-booking-modal');
    if(!modal) return;
    
    // 重置表單
    document.getElementById('create-booking-form').reset();
    document.getElementById('admin-booking-items-container').innerHTML = '';
    
    // 重置使用者選擇
    document.getElementById('booking-selected-user-id').value = '';
    document.getElementById('selected-user-view').style.display = 'none';
    document.getElementById('user-selection-container').style.display = 'block';
    const userSelect = document.getElementById('booking-user-select');
    if(userSelect) userSelect.style.display = 'none';
    
    // 預設增加一個項目
    addAdminBookingItemRow();

    // 根據模式設定介面
    const config = activeTemplate?.client_config?.booking || {};
    const mode = config.mode || 'range';
    const showTimeSlot = (mode === 'single' && config.time_slots?.enabled !== false);
    
    // 日期選擇器
    if (createBookingDatepicker) createBookingDatepicker.destroy();
    createBookingDatepicker = flatpickr("#booking-date-input", {
        mode: mode === 'range' ? 'range' : 'single',
        dateFormat: "Y-m-d",
        locale: "zh_tw",
        onChange: (selectedDates) => {
            // 如果是 Range，取第一天計算價格；如果是 Single，取當天
            const startDateStr = selectedDates.length > 0 ? flatpickr.formatDate(selectedDates[0], "Y-m-d") : null;
            document.querySelectorAll('.admin-booking-item-row').forEach(row => updateItemPrice(row, startDateStr));
            updateItemsSubtotal();
        }
    });
    
    // 時段欄位
    const slotGroup = document.getElementById('booking-slot-group');
    if (slotGroup) slotGroup.style.display = showTimeSlot ? 'block' : 'none';
    
    // 總人數預設
    document.getElementById('booking-people-input').value = 1;

    ui.showModal('#create-booking-modal');
}

function addAdminBookingItemRow(name = '', qty = 1, price = '') {
    const container = document.getElementById('admin-booking-items-container');
    if (!container || container.children.length >= 5) return;

    const itemRow = document.createElement('div');
    itemRow.className = 'admin-booking-item-row';
    itemRow.style.cssText = 'display: grid; grid-template-columns: 1fr 80px 100px 40px; gap: 10px; margin-bottom: 10px; align-items: center;';
    
    const nameContainer = document.createElement('div');
    const select = document.createElement('select');
    select.className = 'booking-item-select';
    select.innerHTML = '<option value="">-- 選擇項目 --</option>';
    
    allProducts.filter(p => p.is_visible).forEach(p => {
        const priceText = p.price_weekday !== null ? `$${p.price_weekday} 起` : '洽詢';
        const option = new Option(`${p.name} - ${priceText}`, p.name);
        option.dataset.productId = p.product_id; 
        select.add(option);
    });
    select.add(new Option('其他 (手動)', 'other'));

    const nameInput = document.createElement('input');
    nameInput.type = 'text';
    nameInput.className = 'booking-item-name-other';
    nameInput.placeholder = '品項名稱';
    nameInput.style.display = 'none';

    const qtyInput = document.createElement('input');
    qtyInput.type = 'number';
    qtyInput.className = 'booking-item-qty';
    qtyInput.value = qty;
    qtyInput.min = 1;

    const priceInput = document.createElement('input');
    priceInput.type = 'number';
    priceInput.className = 'booking-item-price';
    priceInput.value = price;
    priceInput.min = 0;

    const removeBtn = document.createElement('button');
    removeBtn.type = 'button';
    removeBtn.textContent = '-';
    removeBtn.className = 'action-btn';
    removeBtn.style.cssText = 'background: var(--color-danger);';
    removeBtn.onclick = () => { itemRow.remove(); updateItemsSubtotal(); checkAddBtn(); };

    nameContainer.append(select, nameInput);
    itemRow.append(nameContainer, qtyInput, priceInput, removeBtn);
    container.appendChild(itemRow);

    qtyInput.addEventListener('input', updateItemsSubtotal);
    priceInput.addEventListener('input', updateItemsSubtotal);

    select.addEventListener('change', () => {
        nameInput.style.display = select.value === 'other' ? 'block' : 'none';
        const dateInput = document.getElementById('booking-date-input');
        // 嘗試取得已選日期
        let dateStr = null;
        if(dateInput._flatpickr && dateInput._flatpickr.selectedDates.length > 0) {
            dateStr = flatpickr.formatDate(dateInput._flatpickr.selectedDates[0], "Y-m-d");
        }
        updateItemPrice(itemRow, dateStr);
        updateItemsSubtotal();
    });

    updateItemsSubtotal();
    checkAddBtn();
}

function checkAddBtn() {
    const container = document.getElementById('admin-booking-items-container');
    const btn = document.getElementById('admin-add-booking-item-btn');
    if(btn) btn.style.display = (container.children.length >= 5) ? 'none' : 'block';
}

function updateItemPrice(row, dateStr) {
    const select = row.querySelector('.booking-item-select');
    const priceInput = row.querySelector('.booking-item-price');
    if (select.value && select.value !== 'other') {
        const product = allProducts.find(p => p.name === select.value);
        const price = getPriceForDate(dateStr, product);
        if (price !== null) priceInput.value = price;
    }
}

function updateItemsSubtotal() {
    let subtotal = 0;
    document.querySelectorAll('.admin-booking-item-row').forEach(row => {
        const qty = parseFloat(row.querySelector('.booking-item-qty').value) || 0;
        const price = parseFloat(row.querySelector('.booking-item-price').value) || 0;
        subtotal += qty * price;
    });
    const totalInput = document.getElementById('booking-total-amount-input');
    if (totalInput) totalInput.value = subtotal > 0 ? subtotal : ''; 
}

// --- 【關鍵補完】送出建立預約 ---
async function handleCreateBookingSubmit(e) {
    e.preventDefault();
    const btn = e.target.querySelector('button[type="submit"]');
    if (btn) { btn.disabled = true; btn.textContent = '建立中...'; }

    const config = activeTemplate?.client_config?.booking || {};
    const mode = config.mode || 'range';

    // 1. 收集使用者
    let userId = document.getElementById('booking-selected-user-id').value;
    let contactName = '';
    const isUserSelected = document.getElementById('selected-user-view').style.display === 'flex';
    
    if (isUserSelected) {
        contactName = document.getElementById('booking-selected-user-display').textContent;
    } else {
        const searchInput = document.getElementById('booking-user-search');
        if (searchInput && searchInput.value.trim()) {
            userId = `walk-in-${Date.now()}`;
            contactName = searchInput.value.trim();
        } else {
            ui.toast.error('請選擇或輸入顧客名稱');
            if (btn) { btn.disabled = false; btn.textContent = '確認建立'; }
            return;
        }
    }

    // 2. 收集日期
    let bookingDate = '', checkOutDate = null;
    if (mode === 'range' && createBookingDatepicker) {
        const dates = createBookingDatepicker.selectedDates;
        if (dates.length !== 2) {
            ui.toast.error('請選擇入住與退房日期');
            if (btn) { btn.disabled = false; btn.textContent = '確認建立'; }
            return;
        }
        bookingDate = flatpickr.formatDate(dates[0], "Y-m-d");
        checkOutDate = flatpickr.formatDate(dates[1], "Y-m-d");
    } else {
        bookingDate = document.getElementById('booking-date-input').value;
        if (!bookingDate) {
            ui.toast.error('請選擇預約日期');
            if (btn) { btn.disabled = false; btn.textContent = '確認建立'; }
            return;
        }
    }

    // 3. 收集項目
    const items = [];
    const itemRows = document.querySelectorAll('.admin-booking-item-row');
    for (const row of itemRows) {
        const select = row.querySelector('.booking-item-select');
        let name = select.value;
        let productId = select.options[select.selectedIndex]?.dataset.productId || null;
        if (name === 'other') {
            name = row.querySelector('.booking-item-name-other').value.trim();
            productId = null;
        }
        const qty = parseInt(row.querySelector('.booking-item-qty').value, 10);
        const price = parseFloat(row.querySelector('.booking-item-price').value);

        if (name && qty > 0) {
            items.push({ name, qty, price: isNaN(price) ? null : price, productId });
        }
    }
    if (items.length === 0) {
        ui.toast.error('請至少輸入一個有效項目');
        if (btn) { btn.disabled = false; btn.textContent = '確認建立'; }
        return;
    }

    // 4. 組裝 Payload
    const payload = {
        userId, contactName,
        contactPhone: document.getElementById('booking-phone-input').value.trim() || null,
        bookingDate,
        endDate: checkOutDate, // 民宿用
        bookingType: mode === 'range' ? 'guesthouse' : 'studio',
        timeSlot: document.getElementById('booking-slot-select')?.value || null,
        numOfPeople: parseInt(document.getElementById('booking-people-input').value) || 1,
        totalAmount: parseFloat(document.getElementById('booking-total-amount-input').value) || 0,
        notes: document.getElementById('booking-notes-input').value.trim() || null,
        items
    };

    try {
        await api.createBooking(payload);
        ui.toast.success('預約建立成功！');
        ui.hideModal('#create-booking-modal');
        await fetchDataAndRender();
    } catch (err) {
        ui.toast.error(`建立失敗: ${err.message}`);
    } finally {
        if (btn) { btn.disabled = false; btn.textContent = '確認建立'; }
    }
}

// --- 初始化 (綁定搜尋與建立預約按鈕) ---
function setupCreateBookingListeners() {
    const searchInput = document.getElementById('booking-user-search');
    if (searchInput && !searchInput.dataset.bound) {
        searchInput.addEventListener('input', debounce(async (e) => {
            const query = e.target.value.trim();
            const select = document.getElementById('booking-user-select');
            if(!select) return;
            if(!query) { select.style.display = 'none'; return; }
            
            try {
                const users = await api.searchUsers(query);
                select.innerHTML = '<option value="">-- 請選擇 --</option>';
                users.forEach(u => {
                    const opt = new Option(`${u.line_display_name} (${u.real_name||'-'})`, u.user_id);
                    opt.dataset.userName = u.line_display_name;
                    select.add(opt);
                });
                select.style.display = users.length ? 'block' : 'none';
            } catch(e) { console.error(e); }
        }, 500));
        
        const select = document.getElementById('booking-user-select');
        select.addEventListener('change', async () => {
            const opt = select.options[select.selectedIndex];
            if(opt.value) {
                document.getElementById('booking-selected-user-id').value = opt.value;
                document.getElementById('booking-selected-user-display').textContent = opt.dataset.userName;
                document.getElementById('user-selection-container').style.display = 'none';
                document.getElementById('selected-user-view').style.display = 'flex';
                // 自動帶入電話
                try {
                    const detail = await api.getUserDetails(opt.value);
                    if(detail.profile.phone) document.getElementById('booking-phone-input').value = detail.profile.phone;
                } catch(e) {}
            }
        });
        
        document.getElementById('change-user-btn').addEventListener('click', () => {
            document.getElementById('user-selection-container').style.display = 'block';
            document.getElementById('selected-user-view').style.display = 'none';
            document.getElementById('booking-selected-user-id').value = '';
            searchInput.value = '';
            select.style.display = 'none';
        });
        
        // 綁定表單提交
        document.getElementById('create-booking-form').addEventListener('submit', handleCreateBookingSubmit);
        
        // 綁定新增項目按鈕
        document.getElementById('admin-add-booking-item-btn').addEventListener('click', () => addAdminBookingItemRow());
        
        searchInput.dataset.bound = 'true';
    }
}

// --- 列表渲染 ---
function renderBookingList(bookings) {
    const bookingListTbody = document.getElementById('booking-list-tbody');
    const bookingListTheadTr = document.querySelector('#list-view-container thead tr'); 
    if (!bookingListTbody || !bookingListTheadTr) return;
    
    // 1. 取得當前樣板與設定
    if (!window.CONFIG || !window.CONFIG.LOGIC) return;
    const activeKey = window.CONFIG.LOGIC.ACTIVE_INDUSTRY_TEMPLATE;
    const template = window.CONFIG.LOGIC.INDUSTRY_TEMPLATE_DEFINITIONS[activeKey];
    
    if (!template || !template.logic || !Array.isArray(template.logic.adminBookingColumns)) {
        bookingListTheadTr.innerHTML = '<th>錯誤</th>';
        bookingListTbody.innerHTML = '<tr><td style="text-align: center; color: red;">錯誤：訂單列表欄位設定未載入。</td></tr>';
        return;
    }

    // 2. 讀取「原子化」的功能開關
    const bookingConfig = template.client_config?.booking || {};
    const mode = bookingConfig.mode || 'range'; // range | single
    const enableTimeSlot = bookingConfig.enable_time_slots !== false;
    const enablePeople = bookingConfig.enable_people_count !== false;

    // 3. 【智慧過濾】根據功能開關，剔除不需要顯示的欄位
    // 即使後台欄位設定有勾選，如果邏輯上不合理，也強制隱藏
    const columns = template.logic.adminBookingColumns.filter(col => {
        if (!col.enabled) return false; // 使用者手動關閉的

        // 智慧隱藏邏輯：
        if (col.key === 'check_out_date' && mode === 'single') return false; // 單日模式不顯示退房日
        if (col.key === 'time_slot' && !enableTimeSlot) return false;        // 沒開時段功能就不顯示時段
        if (col.key === 'num_of_people' && !enablePeople) return false;      // 沒開人數功能就不顯示人數
        
        return true;
    });

    const isGuesthouse = (mode === 'range');

    // 4. 渲染表頭
    let headerHTML = '';
    columns.forEach(col => { headerHTML += `<th>${col.label}</th>`; });
    headerHTML += '<th>操作</th>';
    bookingListTheadTr.innerHTML = headerHTML;

    // 5. 渲染內容
    bookingListTbody.innerHTML = '';
    if (!bookings || bookings.length === 0) {
        bookingListTbody.innerHTML = `<tr><td colspan="${columns.length + 1}" style="text-align: center;">找不到符合條件的預約。</td></tr>`;
        return;
    }

    bookings.forEach(booking => {
        const row = bookingListTbody.insertRow();
        row.dataset.bookingId = booking.booking_id;
        row.style.cursor = 'pointer';

        columns.forEach(col => {
            const cell = row.insertCell();
            let cellContent;
            
            // --- 特殊欄位渲染邏輯 ---
            if (col.key === 'item_summary' || col.key === 'items' || col.key === 'product_name') {
                if (booking.items && booking.items.length > 0) {
                    cellContent = booking.items.map(item => `${escapeHtml(item.item_name)} x${item.quantity}`).join(', ');
                } else {
                    cellContent = '<span style="color:#ccc">無項目</span>';
                }
            } 
            else if (col.key === 'contact_name') {
                 const safeContact = escapeHtml(booking.contact_name);
                 const safeRealName = escapeHtml(booking.real_name);
                 const safePhone = escapeHtml(booking.contact_phone);
                 
                 const realNamePart = safeRealName ? ` <span style="color:#666">(${safeRealName})</span>` : '';
                 cellContent = `<div>${safeContact}${realNamePart}</div>`;
                 if (safePhone) {
                     cellContent += `<div style="font-size:0.85em; color:#888;">${safePhone}</div>`;
                 }
            }
            else if (col.key === 'booking_id') {
                 cellContent = `#${String(booking.booking_id).padStart(5, '0')}`;
            }
            else if (col.key === 'booking_date') {
                 // 這裡只顯示日期
                 cellContent = booking.booking_date;
            }
            else if (col.key === 'check_out_date') {
                 cellContent = booking.check_out_date || '-';
            }
            else if (col.key === 'datetime_summary') {
                 // 智慧顯示日期時間
                 const datePart = booking.booking_date;
                 let timePart = '';
                 
                 if (isGuesthouse) {
                     // 民宿模式：顯示退房日
                     if (booking.check_out_date) timePart = `<span style="color:#666;">~ ${booking.check_out_date}</span>`;
                 } else {
                     // 工作室模式：顯示時段
                     if (booking.time_slot) timePart = `<span style="color:#28a745; font-weight:bold;">${escapeHtml(booking.time_slot)}</span>`;
                 }
                 cellContent = `<div class="main-info">${datePart}</div><div class="sub-info">${timePart}</div>`;
            }
            else if (col.key === 'total_amount') {
                 cellContent = booking.total_amount !== null ? '$' + booking.total_amount : 'N/A';
            }
            else if (col.key === 'status') {
                const translatedStatus = translateStatus(booking.status);
                let statusClass = '';
                if (booking.status === 'confirmed') statusClass = 'status-confirmed';
                if (booking.status === 'checked-in') statusClass = 'status-checked-in';
                if (booking.status === 'cancelled') statusClass = 'status-cancelled';
                if (booking.status === 'no-show') statusClass = 'status-noshow';
                cellContent = `<span class="status-tag ${statusClass}">${translatedStatus}</span>`;
            } else {
                // 預設渲染
                const rawValue = getProperty(booking, col.key, 'N/A');
                cellContent = escapeHtml(rawValue);
            }
            cell.innerHTML = cellContent;
        });

        // 固定操作欄位
        row.insertCell().innerHTML = `<td class="actions-cell">
            <button class="action-btn btn-mark-status" data-booking-id="${booking.booking_id}" style="background-color: var(--color-info);">標記</button>
        </td>`;
    });

    bindTbodyClickListener(bookingListTbody);
}

// ... (fetchDataAndRender, setupEventListeners, openBookingDetailsModal, handleStatusUpdate 保持原樣或微調) ...
async function fetchDataAndRender(filter = null) {
    const tbody = document.getElementById('booking-list-tbody');
    if (tbody) tbody.innerHTML = '<tr><td colspan="10" style="text-align: center;">載入中...</td></tr>';

    const params = new URLSearchParams();
    const activeFilter = filter || document.querySelector('#booking-status-filter .active')?.dataset.filter || 'today';
    if (activeFilter !== 'all') params.append('status', activeFilter);
    
    // 簡單實作：搜尋與日期篩選略過，與之前相同
    
    try {
        allBookings = await api.getBookings(params.toString());
        renderBookingList(allBookings);
    } catch (e) {
        if (tbody) tbody.innerHTML = `<tr><td colspan="10" style="color: red; text-align: center;">載入失敗: ${e.message}</td></tr>`;
    }
}

async function openBookingDetailsModal(bookingId) {
    const modal = document.getElementById('booking-details-modal');
    const contentEl = document.getElementById('booking-details-content');
    const actionsContainer = document.getElementById('booking-details-actions');
    if (!modal) return;

    ui.showModal('#booking-details-modal');
    contentEl.innerHTML = '<p>載入中...</p>';
    actionsContainer.innerHTML = '';

    try {
        currentBookingInModal = allBookings.find(b => b.booking_id == bookingId);
        if (!currentBookingInModal) throw new Error('找不到資料');
        
        let userProfile = null;
        if(currentBookingInModal.user_id && !currentBookingInModal.user_id.startsWith('walk-in-')) {
            try {
                const res = await api.getUserDetails(currentBookingInModal.user_id);
                userProfile = res.profile;
            } catch(e) {}
        }

        await renderBookingDetails(currentBookingInModal, userProfile, false);

        // 編輯按鈕
        const editBtn = document.createElement('button');
        editBtn.className = 'action-btn btn-save';
        editBtn.textContent = '編輯';
        editBtn.onclick = () => {
            if (editBtn.textContent === '編輯') {
                renderBookingDetails(currentBookingInModal, userProfile, true);
                editBtn.textContent = '儲存變更';
            } else {
                handleSaveBookingChanges(currentBookingInModal.booking_id);
            }
        };
        actionsContainer.appendChild(editBtn);
        // ... (取消/未入住按鈕省略，保持原樣) ...

    } catch (e) { contentEl.innerHTML = `<p style="color:red">${e.message}</p>`; }
}

async function handleStatusUpdate(btn, bookingId, status, msg) {
    if(btn.disabled) return;
    btn.disabled = true;
    try {
        await api.updateBookingStatus(Number(bookingId), status);
        ui.toast.success(msg);
        ui.hideModal('#booking-details-modal');
        await fetchDataAndRender();
    } catch(e) { ui.toast.error(e.message); btn.disabled = false; }
}

function setupEventListeners() {
    const page = document.getElementById('page-bookings');
    if (!page || page.dataset.listeners === 'true') return;

    page.addEventListener('click', e => {
        const btn = e.target.closest('#booking-status-filter button');
        if (btn) {
            page.querySelectorAll('#booking-status-filter button').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            fetchDataAndRender(btn.dataset.filter);
        }
        if (e.target.id === 'create-booking-btn') {
            openCreateBookingModal();
        }
    });
    
    setupCreateBookingListeners();
    page.dataset.listeners = 'true';
}

export const init = async () => {
    try {
        if (!window.CONFIG) throw new Error("設定未載入");
        const key = window.CONFIG.LOGIC.ACTIVE_INDUSTRY_TEMPLATE;
        activeTemplate = window.CONFIG.LOGIC.INDUSTRY_TEMPLATE_DEFINITIONS[key];
        
        if (allProducts.length === 0) allProducts = await api.getProducts();
        
        await fetchDataAndRender();
        setupEventListeners();
    } catch (e) {
        console.error("Booking Init Error", e);
    }
};