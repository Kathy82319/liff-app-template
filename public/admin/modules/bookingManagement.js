// public/admin/modules/bookingManagement.js (v12.4 - 狀態中文化 & 項目編輯優化版)
import { api } from '../api.js';
import { ui } from '../ui.js';

// XSS 防護函式：將特殊符號轉義
function escapeHtml(text) {
    if (!text) return text;
    return String(text)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

// --- 變數宣告 ---
let allBookings = [];
let allProducts = [];
let currentCalendarDate = new Date();
let createBookingDatepicker = null;
let bookingDatepicker = null; // For settings modal
let enabledDates = [];
let currentBookingInModal = null;
let currentStatusMenu = null;
let bookingListDateRangePicker = null; 
let activeTemplate = null; 

/**
 * 安全地獲取物件的巢狀屬性
 */
function getProperty(obj, path, defaultValue = 'N/A') {
    const value = path.split('.').reduce((acc, key) => (acc && acc[key] !== undefined && acc[key] !== null) ? acc[key] : undefined, obj);
    const result = (value !== undefined && value !== null && value !== '') ? value : defaultValue;
    
    if (typeof result === 'string' && result.length > 50 && defaultValue === 'N/A') {
        return result.substring(0, 47) + '...';
    }
    return result;
}

// --- [v12.4 新增] 狀態翻譯輔助函式 ---
function translateStatus(status) {
    const isGuesthouse = window.CONFIG?.LOGIC?.ACTIVE_INDUSTRY_TEMPLATE === 'guesthouse_template';
    const checkInText = isGuesthouse ? '已入住' : '已報到';

    switch (status) {
        case 'confirmed': return '已確認';
        case 'cancelled': return '已取消';
        case 'no-show': return '未到';
        default: return status || '未知';
    }
}

// 綁定 Tbody 點擊事件
function bindTbodyClickListener(tbodyElement) {
     if (!tbodyElement) return;
     const oldListener = tbodyElement.handler;
     if (oldListener) {
         tbodyElement.removeEventListener('click', oldListener);
     }

     const tbodyClickListener = async (e) => {
         const target = e.target;

         // --- 處理 "標記" 按鈕 ---
         const markStatusBtn = target.closest('.btn-mark-status');
         if (markStatusBtn && !markStatusBtn.disabled) {
             e.stopPropagation();
             createStatusMenu(markStatusBtn); 
              if (currentStatusMenu) currentStatusMenu.dataset.originatingBookingId = markStatusBtn.dataset.bookingId;
             return;
         }

         // --- 處理 "快速取消" 按鈕 ---
         const quickCancelBtn = target.closest('.btn-quick-cancel');
         if (quickCancelBtn) {
             e.stopPropagation();
             const bookingId = quickCancelBtn.dataset.bookingId;
             if (!bookingId) return;
             const confirmed = await ui.confirm('確定要取消此預約嗎？');
             if (confirmed) {
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

         // --- 處理點擊 "行" (開啟 Modal) ---
         const bookingRow = target.closest('tr[data-booking-id]');
         if (bookingRow && !target.closest('.action-btn')) {
             const bookingId = bookingRow.dataset.bookingId;
             if (bookingId) {
                 openBookingDetailsModal(bookingId);
             }
             return;
         }
     };

     tbodyElement.addEventListener('click', tbodyClickListener);
     tbodyElement.handler = tbodyClickListener;
}

function getPriceForDate(dateString, product) {
    if (!product) return null;
    if (!dateString) return product.price_weekday !== null ? product.price_weekday : null;

    try {
        const date = new Date(dateString + 'T00:00:00');
        if (isNaN(date.getTime())) {
             return product.price_weekday !== null ? product.price_weekday : null;
        }
        const dayOfWeek = date.getDay();

        if (dayOfWeek === 5) { // 週五
            return product.price_friday !== null ? product.price_friday : product.price_weekday;
        } else if (dayOfWeek === 6) { // 週六
            return product.price_saturday !== null ? product.price_saturday : product.price_weekday;
        } else { // 平日
            return product.price_weekday !== null ? product.price_weekday : null;
        }
    } catch (e) {
         return product.price_weekday !== null ? product.price_weekday : null;
    }
}

async function renderBookingDetails(booking, userProfile, isEditing = false) {
    const contentEl = document.getElementById('booking-details-content');
    const modalContent = document.getElementById('booking-details-modal')?.querySelector('.modal-content');
    if (!contentEl || !modalContent) return;

    modalContent.style.maxHeight = '';
    modalContent.style.overflowY = '';
    let html = '';
    const isGuesthouse = window.CONFIG?.LOGIC?.ACTIVE_INDUSTRY_TEMPLATE === 'guesthouse_template';

    if (!isEditing) { // --- VIEW MODE ---
        html = `<h4>顧客資訊</h4>`;
        if (userProfile) {
            html += `
                <div class="details-grid-container">
                    <div><strong>姓名:</strong> ${userProfile.real_name  || userProfile.line_display_name || booking.contact_name}</div>
                    <div><strong>電話:</strong> ${userProfile.phone || booking.contact_phone || '未提供'}</div>
                    <div><strong>等級:</strong> ${userProfile.level || '-'}</div>
                    <div><strong>會員方案:</strong> ${userProfile.class || '無'}</div>
                    <div><strong>標籤:</strong> ${userProfile.tag || '無'}</div>
                </div>
                ${userProfile.notes ? `<div class="crm-notes-section"><h5>顧客備註</h5><p style="white-space: pre-wrap; margin: 0;">${userProfile.notes}</p></div>` : ''}
            `;
        } else {
            html += `<p><strong>姓名:</strong> ${booking.contact_name}</p>`;
            html += `<p><strong>電話:</strong> ${booking.contact_phone || '未提供'}</p>`;
            html += `<p>(臨時顧客)</p>`;
        }
        // --- 2. 預約資訊 ---
        const bookingIdDisplay = `#${String(booking.booking_id).padStart(5, '0')}`;
        
        html += `<h4>預約資訊</h4>`;
        if (isGuesthouse) { // 民宿樣板
            const startDate = booking.booking_date || '';
            const endDate = booking.check_out_date || '';
            let nights = '-';
            if (startDate && endDate) {
                try {
                    const start = new Date(startDate + 'T00:00:00');
                    const end = new Date(endDate + 'T00:00:00');
                    nights = Math.round((end - start) / (1000 * 60 * 60 * 24));
                } catch(e) { /* ignore */ }
            }
            html += `
                <div class="details-grid-container">
                    <div><strong>預約單號:</strong> ${bookingIdDisplay}</div>
                    <div><strong>入住日期:</strong> ${startDate}</div>
                    <div><strong>退房日期:</strong> ${endDate}</div>
                    <div><strong>住宿晚數:</strong> ${nights} 晚</div>
                    <div><strong>訂單狀態:</strong> ${translateStatus(booking.status)}</div>
                </div>
            `;
        } else { // 工作室或其他樣板
            html += `
                <div class="details-grid-container">
                    <div><strong>預約單號:</strong> ${bookingIdDisplay}</div>
                    <div><strong>預約日期:</strong> ${booking.booking_date}</div>
                    <div><strong>預約時段:</strong> ${booking.time_slot}</div>
                    <div><strong>總人數:</strong> ${booking.num_of_people} 人</div>
                    <div><strong>預估總金額:</strong> ${booking.total_amount !== null ? '$' + booking.total_amount : '未設定'}</div>
                    <div><strong>聯絡電話:</strong> ${booking.contact_phone || '未提供'}</div>
                    <div><strong>訂單狀態:</strong> ${translateStatus(booking.status)}</div>
                </div>
            `;
        }
        html += `<div class="details-notes"><strong>內部備註:</strong> <pre>${booking.notes || '無'}</pre></div>`;
        // --- 3. 預約項目 ---
        html += `<h4>預約項目</h4>`;
        if (booking.items && booking.items.length > 0) {
            html += `<table class="items-table"><thead><tr>`;
            html += `<th>項目名稱</th><th>數量</th><th>單價</th><th>小計</th>`;
            html += `</tr></thead><tbody>`;
            let calculatedTotal = 0;
            booking.items.forEach(item => {
                const price = item.price !== null ? Number(item.price) : 0;
                const quantity = Number(item.quantity) || 0;
                const subtotal = price * quantity;
                calculatedTotal += subtotal;
                html += `<tr>`;
                html += `<td>${item.item_name}</td>`;
                html += `<td>${quantity}</td>`;
                html += `<td>$${price}</td>`; 
                html += `<td>$${subtotal}</td>`;
                html += `</tr>`;
            });
            html += `</tbody>`;
            html += `<tfoot><tr><td colspan="3" style="text-align: right; font-weight: bold;">訂單總金額:</td><td style="font-weight: bold;">$${calculatedTotal}</td></tr></tfoot>`;
            html += `</table>`;
        } else {
            html += `<p>無預約項目資訊</p>`;
        }
        contentEl.innerHTML = html;

    } else { // --- EDIT MODE ---
        // 單號補零
        const bookingIdDisplay = `#${String(booking.booking_id).padStart(5, '0')}`;
        
        // --- 優化：根據樣板顯示不同的編輯欄位 ---
        let dateInputsHtml = '';
        if (isGuesthouse) {
            // 民宿：使用一個日期選擇器 (Range Mode)
            dateInputsHtml = `
                <div style="grid-column: span 2;">
                    <label>入住/退房日期:</label>
                    <input type="text" id="edit-booking-date-range" value="${booking.booking_date} to ${booking.check_out_date || ''}" placeholder="請選擇日期範圍">
                    <input type="hidden" id="edit-booking-date" value="${booking.booking_date}">
                    <input type="hidden" id="edit-checkout-date" value="${booking.check_out_date || ''}">
                </div>
            `;
        } else {
            // 工作室：日期 + 時段
            dateInputsHtml = `
                <div><label>預約日期:</label><input type="text" id="edit-booking-date" value="${booking.booking_date}"></div>
                <div><label>預約時段:</label><input type="text" id="edit-booking-slot" value="${booking.time_slot}"></div>
            `;
        }

        contentEl.innerHTML = `
            <h4>預約資訊 (編輯中)</h4>
            <div id="booking-edit-form" class="details-grid-container">
                 <div><strong>預約單號:</strong> ${bookingIdDisplay}</div>
                 ${dateInputsHtml}
                 <div><label>總人數:</label><input type="number" id="edit-booking-people" value="${booking.num_of_people || ''}" min="1" ${isGuesthouse ? 'readonly title="民宿人數由房型數量決定"' : ''}></div>
                 <div><label>預估總金額:</label><input type="number" id="edit-booking-amount" value="${booking.total_amount || ''}" min="0"></div>
                 <div><label>聯絡電話:</label><input type="tel" id="edit-booking-phone" value="${booking.contact_phone || ''}"></div>
            </div>
            <div><label>內部備註:</label><textarea id="edit-booking-notes" rows="3">${booking.notes || ''}</textarea></div>
            
            <h4 style="display:flex; justify-content:space-between; align-items:center;">
                預約項目 (編輯中)
                <button type="button" id="btn-add-edit-item" class="action-btn" style="background-color: var(--color-success); font-size: 0.8rem;">＋ 新增項目</button>
            </h4>
            <div id="edit-items-container"></div>
        `;

        // [v12.4] 填充現有項目
        const container = document.getElementById('edit-items-container');
        if (booking.items && booking.items.length > 0) {
            booking.items.forEach(item => addEditItemRow(container, item));
        } else {
            // 如果沒有項目，預設加一行空的
            addEditItemRow(container);
        }

        // [v12.4] 綁定新增按鈕
        document.getElementById('btn-add-edit-item').addEventListener('click', () => {
            addEditItemRow(container);
        });

        // 初始化 Flatpickr
        if (isGuesthouse) {
            flatpickr("#edit-booking-date-range", { 
                mode: "range", 
                dateFormat: "Y-m-d",
                defaultDate: [booking.booking_date, booking.check_out_date],
                onChange: (selectedDates) => {
                    if (selectedDates.length === 2) {
                        const startStr = flatpickr.formatDate(selectedDates[0], "Y-m-d");
                        document.getElementById('edit-booking-date').value = startStr;
                        document.getElementById('edit-checkout-date').value = flatpickr.formatDate(selectedDates[1], "Y-m-d");
                        
                        // [v12.4] 日期改變時，嘗試更新所有項目的價格 (如果是民宿)
                        document.querySelectorAll('.edit-item-row').forEach(row => {
                            updateEditItemPrice(row, startStr);
                        });
                        updateEditTotalAmount();
                    }
                }
            });
        } else {
            flatpickr("#edit-booking-date", { 
                dateFormat: "Y-m-d",
                onChange: (selectedDates, dateStr) => {
                    // [v12.4] 日期改變時，更新價格
                    document.querySelectorAll('.edit-item-row').forEach(row => {
                        updateEditItemPrice(row, dateStr);
                    });
                    updateEditTotalAmount();
                }
            });
        }
    }
}

// --- [v12.4 新增] 動態新增編輯項目列 ---
function addEditItemRow(container, item = null) {
    const row = document.createElement('div');
    row.className = 'edit-item-row';
    row.style.cssText = 'display: grid; grid-template-columns: 1fr 80px 100px 40px; gap: 10px; margin-bottom: 10px; align-items: center; padding: 10px; border: 1px solid #eee; border-radius: 4px; background: #fafafa;';

    // 產品選單
    const select = document.createElement('select');
    select.className = 'edit-item-select';
    select.innerHTML = '<option value="">-- 選擇項目 --</option>';
    
    allProducts.filter(p => p.is_visible).forEach(p => {
        const priceText = p.price_weekday !== null ? `$${p.price_weekday} 起` : '洽詢';
        const option = new Option(`${p.name} - ${priceText}`, p.name);
        option.dataset.productId = p.product_id;
        select.add(option);
    });
    select.add(new Option('其他 (手動輸入)', 'other'));

    // 手動輸入名稱欄位
    const nameInput = document.createElement('input');
    nameInput.type = 'text';
    nameInput.className = 'edit-item-name-manual';
    nameInput.placeholder = '品項名稱';
    nameInput.style.display = 'none';

    // 數量
    const qtyInput = document.createElement('input');
    qtyInput.type = 'number';
    qtyInput.className = 'edit-item-qty';
    qtyInput.value = item ? item.quantity : 1;
    qtyInput.min = 1;
    qtyInput.placeholder = '數量';

    // 價格
    const priceInput = document.createElement('input');
    priceInput.type = 'number';
    priceInput.className = 'edit-item-price';
    priceInput.value = item ? (item.price !== null ? item.price : '') : '';
    priceInput.min = 0;
    priceInput.placeholder = '單價';

    // 刪除按鈕
    const removeBtn = document.createElement('button');
    removeBtn.type = 'button';
    removeBtn.textContent = '-';
    removeBtn.className = 'action-btn';
    removeBtn.style.backgroundColor = 'var(--color-danger)';
    removeBtn.onclick = () => {
        row.remove();
        updateEditTotalAmount();
    };

    // --- 邏輯綁定 ---
    // 1. 預填資料
    if (item) {
        // 嘗試在選單中找到對應項目
        const matchedOption = Array.from(select.options).find(opt => opt.value === item.item_name);
        if (matchedOption) {
            select.value = item.item_name;
        } else {
            // 找不到 (可能是手動輸入的或已下架)，切換到 Other
            select.value = 'other';
            nameInput.style.display = 'block';
            nameInput.value = item.item_name;
        }
    }

    // 2. 選單變更事件
    select.addEventListener('change', () => {
        if (select.value === 'other') {
            nameInput.style.display = 'block';
            priceInput.value = ''; // 手動輸入不清空，讓使用者自己填
        } else {
            nameInput.style.display = 'none';
            // 自動帶入價格
            const dateStr = document.getElementById('edit-booking-date').value;
            updateEditItemPrice(row, dateStr);
        }
        updateEditTotalAmount();
    });

    qtyInput.addEventListener('input', updateEditTotalAmount);
    priceInput.addEventListener('input', updateEditTotalAmount);

    const nameWrapper = document.createElement('div');
    nameWrapper.appendChild(select);
    nameWrapper.appendChild(nameInput);

    row.appendChild(nameWrapper);
    row.appendChild(qtyInput);
    row.appendChild(priceInput);
    row.appendChild(removeBtn);

    container.appendChild(row);
}

// --- [v12.4 新增] 更新編輯項目的價格 ---
function updateEditItemPrice(row, dateStr) {
    const select = row.querySelector('.edit-item-select');
    const priceInput = row.querySelector('.edit-item-price');
    
    if (select.value && select.value !== 'other') {
        const product = allProducts.find(p => p.name === select.value);
        const price = getPriceForDate(dateStr, product);
        if (price !== null) {
            priceInput.value = price;
        }
    }
}

// --- [v12.4 新增] 更新總金額 ---
function updateEditTotalAmount() {
    let total = 0;
    document.querySelectorAll('.edit-item-row').forEach(row => {
        const qty = parseFloat(row.querySelector('.edit-item-qty').value) || 0;
        const price = parseFloat(row.querySelector('.edit-item-price').value) || 0;
        total += qty * price;
    });
    const totalInput = document.getElementById('edit-booking-amount');
    if (totalInput) totalInput.value = total;
}

async function handleSaveBookingChanges(bookingId) {
    const isGuesthouse = window.CONFIG?.LOGIC?.ACTIVE_INDUSTRY_TEMPLATE === 'guesthouse_template';
    const originalNumOfPeople = currentBookingInModal ? currentBookingInModal.num_of_people : 1; 

    const payload = {
        bookingId: bookingId,
        bookingDate: document.getElementById('edit-booking-date').value,
        contactPhone: document.getElementById('edit-booking-phone').value.trim() || null,
        notes: document.getElementById('edit-booking-notes').value.trim() || null,
        items: []
    };

    if (isGuesthouse) {
        payload.check_out_date = document.getElementById('edit-checkout-date').value || null;
        payload.timeSlot = ''; 
        payload.numOfPeople = originalNumOfPeople; 
        payload.totalAmount = parseFloat(document.getElementById('edit-booking-amount').value) || null; 
    } else {
        payload.timeSlot = document.getElementById('edit-booking-slot').value.trim() || '';
        payload.numOfPeople = parseInt(document.getElementById('edit-booking-people').value, 10) || originalNumOfPeople; 
        payload.totalAmount = parseFloat(document.getElementById('edit-booking-amount').value) || null;
        payload.check_out_date = null; 
    }

    // [v12.4] 修改：從新的動態項目列讀取資料
    const itemRows = document.querySelectorAll('.edit-item-row');
    if (itemRows.length === 0) {
        ui.toast.error('請至少保留一個預約項目！');
        return;
    }

    for (const row of itemRows) {
        const select = row.querySelector('.edit-item-select');
        let name = select.value;
        if (name === 'other') {
            name = row.querySelector('.edit-item-name-manual').value.trim();
        }
        const qty = parseInt(row.querySelector('.edit-item-qty').value, 10);
        const price = parseFloat(row.querySelector('.edit-item-price').value);

        if (!name) { ui.toast.error('請輸入項目名稱'); return; }
        if (isNaN(qty) || qty <= 0) { ui.toast.error('數量必須大於 0'); return; }
        
        payload.items.push({
            name: name,
            qty: qty,
            price: isNaN(price) ? null : price,
            // 編輯模式下暫不支援 productId 的更新 (因涉及複雜庫存回補)，先傳 name 即可
            // 若後端需要 productId 來扣庫存，則需在此處抓取 dataset.productId
        });
    }

    if (!payload.bookingDate) { ui.toast.error('預約/入住日期為必填！'); return; }
    if (isGuesthouse && !payload.check_out_date) { ui.toast.error('退房日期為必填！'); return; }
    
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

function updateItemsSubtotal() {
    let subtotal = 0;
    document.querySelectorAll('.admin-booking-item-row').forEach(row => {
        const qty = parseFloat(row.querySelector('.booking-item-qty').value) || 0;
        const price = parseFloat(row.querySelector('.booking-item-price').value) || 0;
        subtotal += qty * price;
    });
    const subtotalEl = document.getElementById('items-subtotal');
    const totalAmountInput = document.getElementById('booking-total-amount-input');
    if (subtotalEl) subtotalEl.textContent = `項目小計: $${subtotal}`;
    if (totalAmountInput) totalAmountInput.value = subtotal > 0 ? subtotal : ''; 
}

// --- 新增項目列 (修改：加入 productId) ---
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
        // 【關鍵】將 productId 存入 dataset
        option.dataset.productId = p.product_id; 
        select.add(option);
    });
    select.add(new Option('其他 (手動輸入)', 'other'));

    const nameInput = document.createElement('input');
    nameInput.type = 'text';
    nameInput.className = 'booking-item-name-other';
    nameInput.placeholder = '請輸入品項名稱';
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
    removeBtn.className = 'remove-booking-item-btn';
    removeBtn.style.cssText = 'background: var(--color-danger); padding: 5px 10px; border: none; color: white; border-radius: 4px; cursor: pointer;';

    nameContainer.appendChild(select);
    nameContainer.appendChild(nameInput);
    itemRow.append(nameContainer, qtyInput, priceInput, removeBtn);
    container.appendChild(itemRow);

    qtyInput.addEventListener('input', updateItemsSubtotal);
    priceInput.addEventListener('input', updateItemsSubtotal);

    select.addEventListener('change', () => {
        nameInput.style.display = select.value === 'other' ? 'block' : 'none';
        // 處理 guesthouse 的日期範圍
        const bookingDateInput = document.getElementById('booking-date-input');
        let bookingDate = null;
        if (bookingDateInput && bookingDateInput._flatpickr && bookingDateInput._flatpickr.selectedDates.length > 0) {
             bookingDate = flatpickr.formatDate(bookingDateInput._flatpickr.selectedDates[0], "Y-m-d");
        } else if (bookingDateInput) {
             bookingDate = bookingDateInput.value;
        }
        updateItemPrice(itemRow, bookingDate); 
        updateItemsSubtotal();
    });

    select.value = name;
    if (name && name !== 'other') {
        // 嘗試獲取初始日期
        const bookingDateInput = document.getElementById('booking-date-input');
        let initialDate = null;
        if (bookingDateInput && bookingDateInput._flatpickr && bookingDateInput._flatpickr.selectedDates.length > 0) {
             initialDate = flatpickr.formatDate(bookingDateInput._flatpickr.selectedDates[0], "Y-m-d");
        }
        updateItemPrice(itemRow, initialDate);
    }

    removeBtn.addEventListener('click', () => {
        itemRow.remove();
        document.getElementById('admin-add-booking-item-btn').style.display = 'block';
        updateItemsSubtotal();
    });

    if (container.children.length >= 5) document.getElementById('admin-add-booking-item-btn').style.display = 'none';
    updateItemsSubtotal();
}

function setSelectedUser(userId, userName) {
    const selectedUserIdInput = document.getElementById('booking-selected-user-id');
    const selectedUserDisplay = document.getElementById('booking-selected-user-display');
    const userSelectionContainer = document.getElementById('user-selection-container');
    const selectedUserView = document.getElementById('selected-user-view');

    if (!selectedUserIdInput || !selectedUserDisplay) return;

    selectedUserIdInput.value = userId;
    userSelectionContainer.style.display = 'none';
    selectedUserView.style.display = 'flex';

    setTimeout(() => {
        if(selectedUserDisplay) selectedUserDisplay.textContent = userName || '名稱錯誤';
    }, 0);
}

function resetCreateBookingModal() {
    const form = document.getElementById('create-booking-form');
    if (form) form.reset();

    const itemsContainer = document.getElementById('admin-booking-items-container');
    if (itemsContainer) itemsContainer.innerHTML = '';

    document.getElementById('booking-selected-user-id').value = '';
    document.getElementById('selected-user-view').style.display = 'none';
    document.getElementById('user-selection-container').style.display = 'block';
    const userSelect = document.getElementById('booking-user-select');
    if (userSelect) {
        userSelect.style.display = 'none';
        userSelect.innerHTML = '';
    }

    const submitButton = form?.querySelector('button[type="submit"]');
    if (submitButton) {
        submitButton.disabled = false;
        submitButton.textContent = '確認建立';
    }
    
    // 清除 Flatpickr 選擇
    if (createBookingDatepicker) createBookingDatepicker.clear();
}

async function initializeCreateBookingModal() {
    const userSearchInput = document.getElementById('booking-user-search');
    if (!userSearchInput) return;

    if (allProducts.length === 0) {
        try {
            allProducts = await api.getProducts(); 
        } catch (e) {
            console.error("強制獲取產品失敗", e);
        }
    }

    // --- 步驟 2: 初始化日期選擇器 (修正版) ---
    if (createBookingDatepicker) createBookingDatepicker.destroy();
    
    const isGuesthouse = window.CONFIG?.LOGIC?.ACTIVE_INDUSTRY_TEMPLATE === 'guesthouse_template';
    const mode = isGuesthouse ? 'range' : 'single';
    
    createBookingDatepicker = flatpickr("#booking-date-input", {
        dateFormat: "Y-m-d",
        mode: mode, // 根據樣板決定模式
        onChange: function(selectedDates, dateStr, instance) {
            // 如果是 range mode，我們取開始日期來計算單價
            const startDateStr = selectedDates.length > 0 ? flatpickr.formatDate(selectedDates[0], "Y-m-d") : null;
            document.querySelectorAll('.admin-booking-item-row').forEach(row => {
                updateItemPrice(row, startDateStr);
            });
            updateItemsSubtotal();
        }
    });

    // --- 步驟 3: 初始化時段下拉選單 ---
    const slotSelect = document.getElementById('booking-slot-select');
    if (slotSelect && slotSelect.options.length <= 1) {
        slotSelect.innerHTML = '<option value="">-- 請選擇時段 --</option>';
        for (let hour = 8; hour <= 22; hour++) {
            ['00', '30'].forEach(minute => {
                const time = `${String(hour).padStart(2, '0')}:${minute}`;
                slotSelect.add(new Option(time, time));
            });
        }
    }

    // --- 步驟 4: 處理使用者搜尋 (顯示優化) ---
    const userSelect = document.getElementById('booking-user-select');
    if (!userSearchInput.dataset.inputListenerAttached) {
        userSearchInput.addEventListener('input', async (e) => {
            const query = e.target.value.trim();
            const userSelectElement = document.getElementById('booking-user-select');
            if (!userSelectElement) return;

            if (query.length < 1) {
                userSelectElement.style.display = 'none';
                userSelectElement.innerHTML = '';
                return;
            }
            try {
                const users = await api.searchUsers(query);
                userSelectElement.innerHTML = '';
                if (users.length > 0) {
                    userSelectElement.add(new Option('-- 請選擇顧客 --', ''));
                    users.forEach(user => {
                        // 【優化】顯示格式：LINE名稱 (真實姓名) | 電話
                        const realNameStr = user.real_name ? `(${user.real_name})` : '';
                        const phoneStr = user.phone ? ` | ${user.phone}` : '';
                        const displayLabel = `${user.line_display_name} ${realNameStr}${phoneStr}`;
                        
                        const option = new Option(displayLabel, user.user_id);
                        option.dataset.userName = user.line_display_name; // 簡短名稱用於顯示
                        userSelectElement.add(option);
                    });
                    userSelectElement.style.display = 'block';
                } else {
                    userSelectElement.style.display = 'none';
                }
            } catch (error) {
                console.error("搜尋顧客失敗:", error);
                userSelectElement.style.display = 'none';
            }
        });
        userSearchInput.dataset.inputListenerAttached = 'true';
    }

    if (userSelect && !userSelect.dataset.changeListenerAttached) {
        userSelect.addEventListener('change', async () => { 
            const selectedOption = userSelect.options[userSelect.selectedIndex];
            if (selectedOption && selectedOption.value) {
                const userId = selectedOption.value;
                const userName = selectedOption.dataset.userName;
                setSelectedUser(userId, userName);

                try {
                    const userDetails = await api.getUserDetails(userId);
                    if (userDetails && userDetails.profile) {
                        const phoneInput = document.getElementById('booking-phone-input');
                        if (phoneInput && userDetails.profile.phone) {
                            phoneInput.value = userDetails.profile.phone;
                        }
                    }
                } catch (error) { console.error('Auto-fill phone error', error); }
            }
        });
        userSelect.dataset.changeListenerAttached = 'true';
    }

     if (!userSearchInput.dataset.blurListenerAttached) {
          userSearchInput.addEventListener('blur', () => {
            setTimeout(() => {
                const userSelectElement = document.getElementById('booking-user-select');
                const isUserSelected = document.getElementById('selected-user-view').style.display === 'flex';
                if (userSelectElement && !isUserSelected) {
                     // console.log("Blur event, hiding select."); 
                }
            }, 200);
          });
          userSearchInput.dataset.blurListenerAttached = 'true';
     }
     const changeUserBtn = document.getElementById('change-user-btn');
     if (changeUserBtn && !changeUserBtn.dataset.clickListenerAttached) {
          changeUserBtn.addEventListener('click', () => {
            document.getElementById('booking-selected-user-id').value = '';
            document.getElementById('booking-selected-user-display').textContent = '';
            document.getElementById('selected-user-view').style.display = 'none';
            const searchInput = document.getElementById('booking-user-search');
            searchInput.value = '';
            document.getElementById('user-selection-container').style.display = 'block';
            const selectElement = document.getElementById('booking-user-select');
            selectElement.innerHTML = '';
            selectElement.style.display = 'none';
            const phoneInput = document.getElementById('booking-phone-input');
            if(phoneInput) phoneInput.value = '';
            searchInput.focus();
          });
          changeUserBtn.dataset.clickListenerAttached = 'true';
     }

    // --- 步驟 5: 清空並新增第一行 ---
    const itemsContainer = document.getElementById('admin-booking-items-container');
    if (itemsContainer) {
        itemsContainer.innerHTML = '';
        addAdminBookingItemRow();
        const addBtn = document.getElementById('admin-add-booking-item-btn');
        if (addBtn) addBtn.style.display = 'block';
    }

    // --- 步驟 6: 綁定 "+新增項目" ---
    const addBtn = document.getElementById('admin-add-booking-item-btn');
    if (addBtn && !addBtn.dataset.listenerAttached) {
        addBtn.addEventListener('click', () => addAdminBookingItemRow());
        addBtn.dataset.listenerAttached = 'true';
    }
}

function updateItemPrice(itemRowElement, selectedDateString) {
     if (!itemRowElement) return;
     const select = itemRowElement.querySelector('.booking-item-select');
     const priceInput = itemRowElement.querySelector('.booking-item-price');
     if (!select || !priceInput) return;

     const selectedProductName = select.value;
     
     if (selectedProductName && selectedProductName !== 'other') {
         const selectedProduct = allProducts.find(p => p.name === selectedProductName);
         const actualPrice = selectedProduct ? getPriceForDate(selectedDateString, selectedProduct) : null;
         priceInput.value = actualPrice !== null ? actualPrice : '';
     } else {
          priceInput.value = '';
     }
}

async function handleCreateBookingSubmit(e) {
    e.preventDefault();
    const isGuesthouse = window.CONFIG?.LOGIC?.ACTIVE_INDUSTRY_TEMPLATE === 'guesthouse_template';

    let finalUserId = document.getElementById('booking-selected-user-id').value;
    let finalContactName = '';
    const isUserSelected = document.getElementById('selected-user-view').style.display === 'flex';

    if (isUserSelected) {
        finalUserId = document.getElementById('booking-selected-user-id').value;
        finalContactName = document.getElementById('booking-selected-user-display').textContent;
    } else {
        const searchInputText = document.getElementById('booking-user-search').value.trim();
        if (searchInputText) {
            finalUserId = `walk-in-${Date.now()}`;
            finalContactName = searchInputText;
        } else {
             ui.toast.error('請選擇或輸入顧客名稱！');
             return;
        }
    }

    const items = [];
    let calculatedTotalAmount = 0;
    let itemsValid = true;

    document.querySelectorAll('.admin-booking-item-row').forEach(row => {
         if (!itemsValid) return;

        const select = row.querySelector('.booking-item-select');
        let name = select.value;
        // 【關鍵】獲取 productId
        let productId = select.options[select.selectedIndex]?.dataset.productId || null;

        if (name === 'other') {
            name = row.querySelector('.booking-item-name-other').value.trim();
            productId = null; // 手動輸入沒有 productId
        }
        const qtyInput = row.querySelector('.booking-item-qty');
        const priceInput = row.querySelector('.booking-item-price');

        const qty = parseInt(qtyInput.value, 10);
        const price = parseFloat(priceInput.value);

        if (name && !isNaN(qty) && qty > 0) {
            if (isNaN(price) || price < 0) {
                ui.toast.error(`項目 "${name}" 缺少有效的價格！`);
                itemsValid = false;
                return;
            }
            // 【關鍵】傳送 productId 給後端
            items.push({ name, qty, price, productId });
            calculatedTotalAmount += qty * price;
        } else if (name && (isNaN(qty) || qty <= 0)) {
             ui.toast.error(`項目 "${name}" 的數量無效。`);
             itemsValid = false;
        }
    });

    if (!itemsValid || items.length === 0) {
        if (items.length === 0 && itemsValid) ui.toast.error('請至少填寫一個有效的預約項目！');
        return;
    }

    // --- 日期處理 ---
    let bookingDate = '';
    let checkOutDate = null;
    
    if (isGuesthouse && createBookingDatepicker) {
        const dates = createBookingDatepicker.selectedDates;
        if (dates.length !== 2) {
            ui.toast.error('請選擇入住和退房日期 (需選擇兩個日期)');
            return;
        }
        bookingDate = flatpickr.formatDate(dates[0], "Y-m-d");
        // 暫時解法：將 range 的第二個日期放入 checkOutDate
        checkOutDate = flatpickr.formatDate(dates[1], "Y-m-d");
    } else {
        bookingDate = document.getElementById('booking-date-input').value;
    }

    const timeSlot = document.getElementById('booking-slot-select').value || null;
    const numOfPeople = document.getElementById('booking-people-input').value;
    const contactPhone = document.getElementById('booking-phone-input').value.trim();
    const notes = document.getElementById('booking-notes-input').value;
    let totalAmount = calculatedTotalAmount;

    const manualTotalAmountInput = document.getElementById('booking-total-amount-input');
    const manualTotalAmount = parseFloat(manualTotalAmountInput.value);
    if (!isNaN(manualTotalAmount) && manualTotalAmount >= 0 && manualTotalAmount !== calculatedTotalAmount) {
        totalAmount = manualTotalAmount;
    } else if (isNaN(manualTotalAmount) && manualTotalAmountInput.value.trim() !== '') {
         ui.toast.error('預估總金額必須是有效的數字。');
         return;
    }

    if (!finalUserId || !bookingDate) {
        ui.toast.error('顧客和預約日期為必填！');
        return;
    }
    
    // --- 【修改】電話防呆確認 (非阻擋) ---
    if (!contactPhone) {
        const confirmed = await ui.confirm("尚未填寫連絡電話，確定要繼續嗎？");
        if (!confirmed) return; // 使用者取消
    } else if (!/^09\d{8}$/.test(contactPhone)) {
         ui.toast.error('請輸入正確的 10 位手機號碼 (09開頭)，或留空。');
         return;
    }

    // --- [v12.2 新增] 庫存不足防呆檢查 ---
    if (isGuesthouse && bookingDate && checkOutDate && items.length > 0) {
        try {
            // 1. 呼叫 API 查詢該區間庫存
            const params = new URLSearchParams({ startDate: bookingDate, endDate: checkOutDate });
            const inventoryData = await api.getRoomInventory(params);
            
            const warnings = [];

            // 2. 遍歷預約項目與日期進行檢查
            for (const item of items) {
                if (!item.productId) continue;
                const productInv = inventoryData[item.productId];
                const safeItemName = escapeHtml(item.name); 
                
                let curr = new Date(bookingDate);
                const end = new Date(checkOutDate);
                
                while (curr < end) {
                    const dateStr = curr.toISOString().split('T')[0];
                    const dayInv = productInv ? productInv[dateStr] : null;
                    const currentQty = (dayInv && dayInv.quantity_available !== null) ? dayInv.quantity_available : 0;
                    
                    // 檢查：若 (現有庫存 - 預訂量) < 0 則警告
                    if (currentQty - item.qty < 0) {
                        const newQty = currentQty - item.qty;
                        const newQtyHtml = `<span style="color: var(--color-danger, red); font-weight: bold;">${newQty}</span>`;
                        warnings.push(`${dateStr}: ${safeItemName} (庫存 ${currentQty} → ${newQtyHtml})`);
                    }
                    curr.setDate(curr.getDate() + 1);
                }
            }

            // 3. 若有警告，彈出確認視窗
            if (warnings.length > 0) {
                const warningListHtml = warnings.slice(0, 5).join('<br>');
                const moreHtml = warnings.length > 5 ? '<br>...' : '';
                
                const msgHtml = `
                    <strong style="color: var(--color-warning, orange); font-size: 1.1em;">⚠️ 庫存不足警告！</strong><br><br>
                    此操作將導致以下房型超賣 (變成負數)：<br><br>
                    <div style="text-align: left; display: inline-block;">${warningListHtml}${moreHtml}</div>
                    <br><br>確定要繼續嗎？
                `;
                
                const confirmed = await ui.confirm(msgHtml);
                if (!confirmed) return; 
            }

        } catch (e) {
            console.warn("[Inventory Check] 庫存檢查失敗，跳過防呆:", e);
        }
    }

    const submitButton = e.target.querySelector('button[type="submit"]');
    
    const formData = {
        userId: finalUserId,
        bookingDate: bookingDate,
        endDate: checkOutDate, 
        bookingType: isGuesthouse ? 'guesthouse' : 'studio',
        
        timeSlot: timeSlot,
        numOfPeople: numOfPeople,
        contactPhone: contactPhone || null,
        totalAmount: totalAmount,
        notes: notes,
        contactName: finalContactName,
        items: items,
    };

    try {
         if (submitButton) {
             submitButton.disabled = true;
             submitButton.textContent = '建立中...';
         }

        await api.createBooking(formData);
        ui.toast.success('預約建立成功！');
        ui.hideModal('#create-booking-modal');
        
        const activeFilter = document.querySelector('#booking-status-filter .active')?.dataset.filter || 'today';
        await fetchDataAndRender(activeFilter);

    } catch (error) {
        console.error("建立預約 API 失敗:", error);
        ui.toast.error(`建立失敗: ${error.message}`);
    } finally {
          if (submitButton) {
              submitButton.disabled = false;
              submitButton.textContent = '確認建立';
          }
    }
}

async function handleSaveBookingSettings() {
    if (!bookingDatepicker) return;
    const saveButton = document.getElementById('save-booking-settings-btn');
    try {
        saveButton.disabled = true;
        saveButton.textContent = '儲存中...';

        const selectedDates = bookingDatepicker.selectedDates;
        const newEnabledDates = selectedDates.map(d => bookingDatepicker.formatDate(d, "Y-m-d"));
        const originalDates = new Set(enabledDates);
        const newDates = new Set(newEnabledDates);

        const datesToAdd = newEnabledDates.filter(d => !originalDates.has(d));
        const datesToRemove = enabledDates.filter(d => !newDates.has(d));

        const promises = [];
        if (datesToAdd.length > 0) {
             datesToAdd.forEach(date => promises.push(api.saveBookingSettings({ action: 'add', date: date })));
        }
        if (datesToRemove.length > 0) {
             datesToRemove.forEach(date => promises.push(api.saveBookingSettings({ action: 'remove', date: date })));
        }

        if (promises.length === 0) {
             ui.toast.info("沒有任何日期變更需要儲存。");
        } else {
             await Promise.all(promises);
             ui.toast.success('可預約日期已成功儲存！');
             enabledDates = newEnabledDates;
        }
        ui.hideModal('#booking-settings-modal');

    } catch (error) {
        ui.toast.error("儲存失敗: " + error.message);
    } finally {
        saveButton.disabled = false;
        saveButton.textContent = '儲存所有變更';
    }
}

async function openBookingDetailsModal(bookingId) {
    const modal = document.getElementById('booking-details-modal');
    const contentEl = document.getElementById('booking-details-content');
    const actionsContainer = document.getElementById('booking-details-actions');
    if (!modal || !contentEl || !actionsContainer) return;

    ui.showModal('#booking-details-modal');
    contentEl.innerHTML = '<p>正在載入預約資料...</p>';
    actionsContainer.innerHTML = '';

    try {
        currentBookingInModal = allBookings.find(b => b.booking_id == bookingId);
        if (!currentBookingInModal) throw new Error('找不到預約資料');

        let userProfile = null;
        if (currentBookingInModal.user_id && !currentBookingInModal.user_id.startsWith('walk-in-')) {
            try {
                 const userDetails = await api.getUserDetails(currentBookingInModal.user_id);
                 userProfile = userDetails.profile;
            } catch (userError) {
                 console.warn("無法載入顧客詳細資料:", userError);
            }
        }

        await renderBookingDetails(currentBookingInModal, userProfile, false);

        const editButton = document.createElement('button');
        editButton.type = 'button';
        editButton.className = 'action-btn btn-save';
        editButton.textContent = '編輯';
        editButton.onclick = () => {
            const isCurrentlyEditing = editButton.textContent === '儲存變更';
            if (isCurrentlyEditing) {
                handleSaveBookingChanges(currentBookingInModal.booking_id);
            } else {
                renderBookingDetails(currentBookingInModal, userProfile, true);
                editButton.textContent = '儲存變更';
                actionsContainer.querySelectorAll('.action-btn:not(:first-child)').forEach(btn => btn.style.display = 'none');
            }
        };
        actionsContainer.appendChild(editButton);

        const today = new Date().toISOString().split('T')[0];
        if (currentBookingInModal.status === 'confirmed' && currentBookingInModal.booking_date < today) {
              const noShowButton = document.createElement('button');
              noShowButton.type = 'button';
              noShowButton.className = 'action-btn';
              noShowButton.style.backgroundColor = 'var(--color-warning)';
              noShowButton.style.color = 'var(--color-text-dark)';
              noShowButton.textContent = '標記未入住';
              noShowButton.onclick = async () => {
                  const confirmed = await ui.confirm('確定要將此預約標記為「未如期入住」嗎？');
                  if (confirmed) {
                      await handleStatusUpdate(noShowButton, currentBookingInModal.booking_id, 'no-show', '已標記為未入住');
                  }
              };
              actionsContainer.appendChild(noShowButton);
        }

        if (currentBookingInModal.status !== 'cancelled' && currentBookingInModal.status !== 'no-show') {
               const cancelButton = document.createElement('button');
               cancelButton.type = 'button';
               cancelButton.className = 'action-btn';
               cancelButton.style.backgroundColor = 'var(--color-danger)';
               cancelButton.textContent = '取消預約';
               cancelButton.onclick = async () => {
                   const confirmed = await ui.confirm('確定要取消此預約嗎？');
                   if (confirmed) {
                      await handleStatusUpdate(cancelButton, currentBookingInModal.booking_id, 'cancelled', '預約已取消');
                   }
               };
               actionsContainer.appendChild(cancelButton);
        }

    } catch (error) {
        contentEl.innerHTML = `<p style="color: red;">讀取資料失敗：${error.message}</p>`;
    }
}

async function handleStatusUpdate(buttonElement, bookingId, newStatus, successMessage) {
    if (!buttonElement) return;
    const originalText = buttonElement.textContent;
    buttonElement.disabled = true;
    buttonElement.textContent = '處理中...';
    try {
        await api.updateBookingStatus(Number(bookingId), newStatus);
        ui.toast.success(successMessage);
        ui.hideModal('#booking-details-modal');
        const activeFilter = document.querySelector('#booking-status-filter .active')?.dataset.filter || 'today';
        await fetchDataAndRender(activeFilter);
    } catch (err) {
        ui.toast.error(`更新失敗: ${err.message}`);
        buttonElement.disabled = false;
        buttonElement.textContent = originalText;
    }
}

function renderBookingList(bookings) {
    const bookingListTbody = document.getElementById('booking-list-tbody');
    const bookingListTheadTr = document.querySelector('#list-view-container thead tr'); 
    if (!bookingListTbody || !bookingListTheadTr) return;
    
    if (!activeTemplate || !activeTemplate.logic || !Array.isArray(activeTemplate.logic.adminBookingColumns)) {
        bookingListTheadTr.innerHTML = '<th>錯誤</th>';
        bookingListTbody.innerHTML = '<tr><td style="text-align: center; color: red;">錯誤：訂單列表欄位設定未載入。</td></tr>';
        return;
    }
    
    const columns = activeTemplate.logic.adminBookingColumns.filter(col => col.enabled);
    const isGuesthouse = window.CONFIG?.LOGIC?.ACTIVE_INDUSTRY_TEMPLATE === 'guesthouse_template';

    let headerHTML = '';
    columns.forEach(col => {
        headerHTML += `<th>${col.label}</th>`;
    });
    headerHTML += '<th>狀態</th><th>操作</th>';
    bookingListTheadTr.innerHTML = headerHTML;

    bookingListTbody.innerHTML = '';
    if (!bookings || bookings.length === 0) {
        bookingListTbody.innerHTML = `<tr><td colspan="${columns.length + 2}" style="text-align: center;">找不到符合條件的預約。</td></tr>`;
        return;
    }

    bookings.forEach(booking => {
        const row = bookingListTbody.insertRow();
        row.dataset.bookingId = booking.booking_id;
        row.style.cursor = 'pointer';

        columns.forEach(col => {
            const cell = row.insertCell();
            let cellContent;
            
            if (col.key === 'booking_date' && isGuesthouse) {
                 cellContent = booking.booking_date;
            } else if (col.key === 'check_out_date' && isGuesthouse) {
                 cellContent = booking.check_out_date || '-';
            } else if (col.key === 'item_summary') {
                cellContent = booking.items?.map(item => `${item.item_name} x${item.quantity}`).join(', ') || '無項目';
            } else if (col.key === 'datetime_summary') {
                 cellContent = `<div class="main-info">${booking.booking_date}</div><div class="sub-info">${booking.time_slot || booking.check_out_date || ''}</div>`;
            } else if (col.key === 'total_amount') {
                 cellContent = booking.total_amount !== null ? '$' + booking.total_amount : 'N/A';
            } else {
                cellContent = getProperty(booking, col.key, 'N/A');
            }
            cell.innerHTML = cellContent;
        });

        // [v12.5] 狀態顯示邏輯簡化
        let statusClass = '';
        const translatedStatus = translateStatus(booking.status);

        if (booking.status === 'confirmed') { statusClass = 'status-confirmed'; }
        if (booking.status === 'cancelled') { statusClass = 'status-cancelled'; }
        if (booking.status === 'no-show') { statusClass = 'status-noshow'; }
        
        // [v12.5] 移除 isMarkDisabled，讓所有狀態都可以點擊「標記」進行修改
        row.insertCell().innerHTML = `<span class="status-tag ${statusClass}">${translatedStatus}</span>`;
        row.insertCell().innerHTML = `<td class="actions-cell">
            <button class="action-btn btn-mark-status" data-booking-id="${booking.booking_id}" style="background-color: var(--color-info);">標記</button>
        </td>`;
    });

    bindTbodyClickListener(bookingListTbody);
}

function createStatusMenu(targetButton) {
    closeStatusMenu();
    const bookingId = targetButton.dataset.bookingId;
    if (!bookingId) return;

    const menu = document.createElement('div');
    menu.className = 'status-menu'; 
    menu.style.cssText = `position: absolute; background-color: #FFF; border: 1px solid #CCC; border-radius: 4px; box-shadow: 0 2px 5px rgba(0,0,0,0.2); z-index: 1001; min-width: 100px; padding: 5px 0;`;

    // [v12.5] 更新選單：移除入住，加入已確認
    const options = [
        { text: '已確認', value: 'confirmed', style: 'color: var(--color-success);' },
        { text: '未到', value: 'no-show', style: 'color: var(--color-warning);' },
        { text: '取消預約', value: 'cancelled', style: 'color: var(--color-danger);' }
    ];

    options.forEach(opt => {
        const optionEl = document.createElement('div');
        optionEl.className = 'status-menu-option';
        optionEl.textContent = opt.text;
        optionEl.dataset.status = opt.value;
        optionEl.style.cssText = `padding: 8px 12px; cursor: pointer; ${opt.style} white-space: nowrap;`;
        optionEl.addEventListener('mouseenter', () => optionEl.style.backgroundColor = '#f0f0f0');
        optionEl.addEventListener('mouseleave', () => optionEl.style.backgroundColor = '');

        optionEl.addEventListener('click', async (e) => {
            e.stopPropagation(); 
            closeStatusMenu();
            // [v12.5] 修改提示文字
            const confirmed = await ui.confirm(`確定要將此預約標記為「${opt.text}」嗎？`);
            if (confirmed) {
                const feedbackTarget = { textContent: targetButton.textContent, disabled: false };
                 await handleStatusUpdate(feedbackTarget, bookingId, opt.value, `已標記為 ${opt.text}`);
            }
        });
        menu.appendChild(optionEl);
    });

    const rect = targetButton.getBoundingClientRect();
    menu.style.top = `${rect.bottom + window.scrollY + 2}px`;
    menu.style.left = `${rect.left + window.scrollX}px`;

    document.body.appendChild(menu);
    currentStatusMenu = menu;

    setTimeout(() => {
        document.addEventListener('click', closeStatusMenuOnClickOutside, { capture: true, once: true });
    }, 0);
}

function closeStatusMenu() {
    if (currentStatusMenu) {
        currentStatusMenu.remove();
        currentStatusMenu = null;
        document.removeEventListener('click', closeStatusMenuOnClickOutside, { capture: true });
    }
}

function closeStatusMenuOnClickOutside(event) {
    const originatingButton = document.querySelector(`.btn-mark-status[data-booking-id="${currentStatusMenu?.dataset.originatingBookingId}"]`);
    if (currentStatusMenu && !currentStatusMenu.contains(event.target) && (!originatingButton || !originatingButton.contains(event.target))) {
        closeStatusMenu();
    } else if (currentStatusMenu) {
        setTimeout(() => {
             document.addEventListener('click', closeStatusMenuOnClickOutside, { capture: true, once: true });
         }, 0);
    }
}

function updateCalendar() {
    const calendarGrid = document.getElementById('calendar-grid');
    const calendarMonthYear = document.getElementById('calendar-month-year');
    if (!calendarGrid || !calendarMonthYear) return;

    const year = currentCalendarDate.getFullYear();
    const month = currentCalendarDate.getMonth();
    calendarMonthYear.textContent = `${year} 年 ${month + 1} 月`;
    calendarGrid.innerHTML = ''; 

    const days = ['日', '一', '二', '三', '四', '五', '六'];
    days.forEach(day => {
        calendarGrid.innerHTML += `<div class="calendar-weekday">${day}</div>`;
    });

    const firstDayOfMonth = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();

    const bookingsByDate = new Map();
    allBookings.filter(b => b.status !== 'cancelled').forEach(booking => {
        if (booking.check_out_date && booking.booking_date !== booking.check_out_date) {
            try {
                const startDate = new Date(booking.booking_date + 'T00:00:00');
                const endDate = new Date(booking.check_out_date + 'T00:00:00'); 
                let currentDate = new Date(startDate);

                while (currentDate < endDate) {
                    if (currentDate.getFullYear() === year && currentDate.getMonth() === month) {
                         const dateStr = currentDate.toISOString().split('T')[0];
                         if (!bookingsByDate.has(dateStr)) bookingsByDate.set(dateStr, []);
                         bookingsByDate.get(dateStr).push(booking);
                    }
                    currentDate.setDate(currentDate.getDate() + 1);
                }
            } catch (e) { /* ignore */ }
        } else {
             const dateStr = booking.booking_date;
             try {
                const bookingDateObj = new Date(dateStr + 'T00:00:00');
                if (bookingDateObj.getFullYear() === year && bookingDateObj.getMonth() === month) {
                    if (!bookingsByDate.has(dateStr)) bookingsByDate.set(dateStr, []);
                    bookingsByDate.get(dateStr).push(booking);
                }
             } catch(e){ /* ignore */ }
        }
    });

    for (let i = 0; i < firstDayOfMonth; i++) calendarGrid.innerHTML += `<div></div>`;

    for (let day = 1; day <= daysInMonth; day++) {
        const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        const bookingsForDay = bookingsByDate.get(dateStr) || [];

        let bookingsHtml = '<div class="calendar-bookings-container">';
        bookingsForDay.forEach(b => {
            let statusClass = '';
            if (b.status === 'confirmed') statusClass = 'status-confirmed';
            if (b.status === 'checked-in') statusClass = 'status-checked-in';
            if (b.status === 'no-show') statusClass = 'status-noshow';
            const timeDisplay = b.time_slot ? `${b.time_slot} ` : '';
             bookingsHtml += `
                <div class="calendar-booking ${statusClass}" data-booking-id="${b.booking_id}" style="cursor: pointer;">
                    <span>${timeDisplay}${b.contact_name}</span>
                    <button class="btn-quick-cancel" data-booking-id="${b.booking_id}">&times;</button>
                </div>
             `;
        });
        bookingsHtml += '</div>';

        let dayHtml = `<div class="calendar-day"><span class="day-number">${day}</span>${bookingsHtml}</div>`;
        calendarGrid.innerHTML += dayHtml;
    }
}

async function fetchDataAndRender(filter = null) {
    const bookingListTbody = document.getElementById('booking-list-tbody');
    const calendarView = document.getElementById('calendar-view-container');
    const searchInput = document.getElementById('booking-search-input');
    const dateRange = bookingListDateRangePicker ? bookingListDateRangePicker.selectedDates : [];
    let startDate = '', endDate = '';
    
    if (dateRange.length === 2) {
        startDate = flatpickr.formatDate(dateRange[0], "Y-m-d");
        endDate = flatpickr.formatDate(dateRange[1], "Y-m-d");
    }

    try {
        if (bookingListTbody) bookingListTbody.innerHTML = '<tr><td colspan="6" style="text-align: center;">載入中...</td></tr>';

        const isCalendarView = calendarView && getComputedStyle(calendarView).display !== 'none';
        let activeFilterValue = filter;
        if (activeFilterValue === null) {
            activeFilterValue = document.querySelector('#booking-status-filter .active')?.dataset.filter || 'today';
        }

        const params = new URLSearchParams();

        if (!isCalendarView) { 
            if (activeFilterValue && activeFilterValue !== 'all') params.append('status', activeFilterValue);
             if (searchInput && searchInput.value.trim()) params.append('search', searchInput.value.trim());
             if (startDate && endDate) {
                 params.append('startDate', startDate);
                 params.append('endDate', endDate);
             }
        } else {
             params.append('status', 'all_upcoming');
        }

        const queryString = params.toString();
        try {
            allBookings = await api.getBookings(queryString); 
        } catch (apiError) {
             const response = await fetch(`/api/get-bookings?${queryString}`);
             if (!response.ok) throw new Error(`API Error ${response.status}`);
             allBookings = await response.json();
        }

        if (!isCalendarView) {
            renderBookingList(allBookings);
        } else {
            updateCalendar();
        }
    } catch (error) {
        if (bookingListTbody) bookingListTbody.innerHTML = `<tr><td colspan="6" style="color: red; text-align: center;">讀取失敗: ${error.message}</td></tr>`;
    }
}

function setupEventListeners() {
    const page = document.getElementById('page-bookings');
    if (!page || page.dataset.staticListenersAttached === 'true') return;

    page.addEventListener('click', async e => {
        const target = e.target;
        if (target.id === 'switch-to-calendar-view-btn') {
           const listView = document.getElementById('list-view-container');
           const calendarView = document.getElementById('calendar-view-container');
            if (!listView || !calendarView) return;
           const isListVisible = listView.style.display !== 'none';
           listView.style.display = isListVisible ? 'none' : 'block';
           calendarView.style.display = isListVisible ? 'block' : 'none';
           target.textContent = isListVisible ? '切換至列表' : '切換至行事曆';
           fetchDataAndRender(); 
            return;
        }

        const filterButton = target.closest('#booking-status-filter button');
        if (filterButton) {
            document.querySelector('#booking-status-filter .active')?.classList.remove('active');
            filterButton.classList.add('active');
            fetchDataAndRender(filterButton.dataset.filter); 
            return;
        }

        if (target.id === 'apply-advanced-filters-btn') {
            fetchDataAndRender(); 
            return;
        }

        if (target.id === 'clear-advanced-filters-btn') {
            clearAdvancedFilters();
            fetchDataAndRender(); 
            return;
        }

        if (target.id === 'create-booking-btn') {
            resetCreateBookingModal();
            initializeCreateBookingModal();
            ui.showModal('#create-booking-modal');
            return;
        }

        if (target.id === 'manage-booking-dates-btn') {
            try {
                enabledDates = await api.getBookingSettings();
                if (bookingDatepicker) bookingDatepicker.destroy();
                bookingDatepicker = flatpickr("#booking-datepicker-admin-container", {
                    inline: true, mode: "multiple", dateFormat: "Y-m-d", defaultDate: enabledDates,
                });
                ui.showModal('#booking-settings-modal');
            } catch (error) {
                 ui.toast.error("初始化公休日設定失敗: " + error.message);
            }
            return;
        }

        if (target.id === 'calendar-prev-month-btn') {
            currentCalendarDate.setMonth(currentCalendarDate.getMonth() - 1);
            updateCalendar(); 
            return;
        }
        if (target.id === 'calendar-next-month-btn') {
            currentCalendarDate.setMonth(currentCalendarDate.getMonth() + 1);
            updateCalendar(); 
            return;
        }

         const quickCancelBtnCalendar = target.closest('.calendar-booking .btn-quick-cancel');
         if (quickCancelBtnCalendar) {
             e.stopPropagation();
             const bookingId = quickCancelBtnCalendar.dataset.bookingId;
             if (!bookingId) return;
             const confirmed = await ui.confirm('確定要取消此預約嗎？');
             if (confirmed) {
                 try {
                     quickCancelBtnCalendar.disabled = true;
                     await api.updateBookingStatus(Number(bookingId), 'cancelled');
                     ui.toast.success('預約已取消');
                     const index = allBookings.findIndex(b => b.booking_id == bookingId);
                     if (index > -1) allBookings[index].status = 'cancelled';
                     updateCalendar(); 
                 } catch(err) {
                     ui.toast.error(`錯誤：${err.message}`);
                     quickCancelBtnCalendar.disabled = false;
                 }
             }
             return;
         }

         const calendarBookingItem = target.closest('.calendar-booking');
         if (calendarBookingItem && !target.closest('.btn-quick-cancel')) {
             const bookingId = calendarBookingItem.dataset.bookingId;
             if (bookingId) {
                 openBookingDetailsModal(bookingId);
             }
             return;
         }
    });
    page.dataset.staticListenersAttached = 'true';

    const createBookingForm = document.getElementById('create-booking-form');
    if (createBookingForm && !createBookingForm.dataset.submitListenerAttached) {
        createBookingForm.addEventListener('submit', handleCreateBookingSubmit);
        createBookingForm.dataset.submitListenerAttached = 'true';
    }

    const saveSettingsBtn = document.getElementById('save-booking-settings-btn');
    if (saveSettingsBtn && !saveSettingsBtn.dataset.clickListenerAttached) {
        saveSettingsBtn.addEventListener('click', handleSaveBookingSettings);
        saveSettingsBtn.dataset.clickListenerAttached = 'true';
    }

    const dateRangeInput = document.getElementById('booking-date-range-filter');
    if (dateRangeInput && !dateRangeInput.dataset.flatpickrInstance) {
        try {
            bookingListDateRangePicker = flatpickr(dateRangeInput, {
                mode: "range",
                dateFormat: "Y-m-d",
                locale: "zh_tw"
            });
            dateRangeInput.dataset.flatpickrInstance = 'true';
        } catch(e) {
            ui.toast.error("日期篩選器初始化失敗");
        }
    }
}

function clearAdvancedFilters() {
    const searchInput = document.getElementById('booking-search-input');
    if (searchInput) searchInput.value = '';
    if (bookingListDateRangePicker) bookingListDateRangePicker.clear();
}

export const init = async () => {
    try {
        if (!window.CONFIG || !window.CONFIG.LOGIC || !window.CONFIG.LOGIC.ACTIVE_INDUSTRY_TEMPLATE || !window.CONFIG.LOGIC.INDUSTRY_TEMPLATE_DEFINITIONS) {
             throw new Error("核心設定尚未載入。");
        }
        
        const activeTemplateKey = window.CONFIG.LOGIC.ACTIVE_INDUSTRY_TEMPLATE;
        activeTemplate = window.CONFIG.LOGIC.INDUSTRY_TEMPLATE_DEFINITIONS[activeTemplateKey];

        if (!activeTemplate) {
            throw new Error(`在設定中找不到名為 "${activeTemplateKey}" 的商業樣板。`);
        }
        if (!activeTemplate.logic || !Array.isArray(activeTemplate.logic.adminBookingColumns)) {
             throw new Error(`樣板 "${activeTemplateKey}" 缺少 'logic.adminBookingColumns' 陣列設定。`);
        }
        
        if (allProducts.length === 0) {
             allProducts = await api.getProducts();
        }

    } catch (e) {
         const page = document.getElementById('page-bookings');
         const bookingListTbody = document.getElementById('booking-list-tbody');
         if (bookingListTbody) {
              bookingListTbody.innerHTML = `<tr><td colspan="6" style="text-align: center; color: red;">讀取樣板設定失敗: ${e.message}</td></tr>`;
         } else if (page) {
             page.innerHTML = `<p style="color:red;">讀取樣板設定失敗: ${e.message}</p>`;
         }
         return; 
    }

    setupEventListeners(); 
    await fetchDataAndRender('today');
};