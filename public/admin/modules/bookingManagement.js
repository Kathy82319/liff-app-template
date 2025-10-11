// public/admin/modules/bookingManagement.js (v4 - 綜合優化版)
import { api } from '../api.js';
import { ui } from '../ui.js';

let allBookings = [];
let allProducts = []; // 【新增】快取所有產品
let currentCalendarDate = new Date();
let createBookingDatepicker = null;
let bookingDatepicker = null; // For settings modal
let enabledDates = [];

// --- 【新增】小計功能 ---
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
    if (totalAmountInput) totalAmountInput.value = subtotal;
}

// --- 手動建立預約 Modal 的核心邏輯 ---

function addAdminBookingItemRow(name = '', qty = 1, price = '') {
    const container = document.getElementById('admin-booking-items-container');
    if (!container || container.children.length >= 5) {
        if (container?.children.length >= 5) document.getElementById('admin-add-booking-item-btn').style.display = 'none';
        return;
    }

    const itemRow = document.createElement('div');
    itemRow.className = 'admin-booking-item-row';
    itemRow.style.cssText = 'display: grid; grid-template-columns: 1fr 80px 100px 40px; gap: 10px; margin-bottom: 10px; align-items: center;';
    
    const nameContainer = document.createElement('div');
    const select = document.createElement('select');
    select.className = 'booking-item-select';
    select.innerHTML = '<option value="">-- 選擇項目 --</option>';
    allProducts.filter(p => p.is_visible).forEach(p => {
        select.add(new Option(`${p.name} - $${p.price}`, p.name));
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
    qtyInput.placeholder = '數量';

    const priceInput = document.createElement('input');
    priceInput.type = 'number';
    priceInput.className = 'booking-item-price';
    priceInput.value = price;
    priceInput.min = 0;
    priceInput.placeholder = '金額';

    const removeBtn = document.createElement('button');
    removeBtn.type = 'button';
    removeBtn.textContent = '-';
    removeBtn.className = 'remove-booking-item-btn';
    removeBtn.style.cssText = 'background: var(--color-danger); padding: 5px 10px; border: none; color: white; border-radius: 4px; cursor: pointer; height: fit-content;';

    nameContainer.appendChild(select);
    nameContainer.appendChild(nameInput);
    itemRow.append(nameContainer, qtyInput, priceInput, removeBtn);
    container.appendChild(itemRow);

    qtyInput.addEventListener('input', updateItemsSubtotal);
    priceInput.addEventListener('input', updateItemsSubtotal);

    select.addEventListener('change', () => {
        nameInput.style.display = select.value === 'other' ? 'block' : 'none';
        if (select.value !== 'other' && select.value !== '') {
            const selectedProduct = allProducts.find(p => p.name === select.value);
            if (selectedProduct) priceInput.value = selectedProduct.price;
        }
        updateItemsSubtotal();
    });
    
    removeBtn.addEventListener('click', () => {
        itemRow.remove();
        if (container.children.length < 5) document.getElementById('admin-add-booking-item-btn').style.display = 'block';
        updateItemsSubtotal();
    });

    if (container.children.length >= 5) document.getElementById('admin-add-booking-item-btn').style.display = 'none';
    updateItemsSubtotal();
}

function setSelectedUser(userId, userName) {
    document.getElementById('selected-user-id').value = userId;
    document.getElementById('selected-user-display').textContent = userName;
    document.getElementById('user-selection-container').style.display = 'none';
    document.getElementById('selected-user-view').style.display = 'flex';
}

function resetCreateBookingModal() {
    const form = document.getElementById('create-booking-form');
    if (form) form.reset();

    const itemsContainer = document.getElementById('admin-booking-items-container');
    if (itemsContainer) {
        itemsContainer.innerHTML = '';
        addAdminBookingItemRow();
    }

    const selectedUserId = document.getElementById('selected-user-id');
    if (selectedUserId) selectedUserId.value = '';

    const selectedUserView = document.getElementById('selected-user-view');
    if (selectedUserView) selectedUserView.style.display = 'none';
    
    const userSelectionContainer = document.getElementById('user-selection-container');
    if (userSelectionContainer) userSelectionContainer.style.display = 'block';

    const userSelect = document.getElementById('booking-user-select');
    if (userSelect) {
        userSelect.style.display = 'none';
        userSelect.innerHTML = '';
    }
}


async function initializeCreateBookingModal() {
    if (document.getElementById('booking-user-search').dataset.initialized === 'true') return;
    try {
        if(allProducts.length === 0) allProducts = await api.getProducts();
    } catch(e) { console.error("無法載入產品列表供預約使用"); }
    createBookingDatepicker = flatpickr("#booking-date-input", { dateFormat: "Y-m-d" });
    const slotSelect = document.getElementById('booking-slot-select');
    slotSelect.innerHTML = '<option value="">-- 請選擇時段 --</option>';
    for (let hour = 8; hour <= 22; hour++) {
        ['00', '30'].forEach(minute => {
            const time = `${String(hour).padStart(2, '0')}:${minute}`;
            slotSelect.add(new Option(time, time));
        });
    }
    const userSearchInput = document.getElementById('booking-user-search');
    const userSelect = document.getElementById('booking-user-select');
    userSearchInput.addEventListener('input', async (e) => {
        const query = e.target.value;
        if (query.length < 1) {
            userSelect.style.display = 'none';
            return;
        }
        try {
            const users = await api.searchUsers(query);
            userSelect.innerHTML = '';
            if (users.length > 0) {
                users.forEach(u => {
                    const displayName = u.nickname || u.line_display_name;
                    const option = new Option(`${displayName} (${u.user_id.substring(0, 10)}...)`, u.user_id);
                    option.dataset.userName = displayName;
                    // ▼▼▼ 修改點：將會員電話存入 data attribute ▼▼▼
                    option.dataset.userPhone = u.phone || '';
                    userSelect.add(option);
                });
                userSelect.style.display = 'block';
            } else {
                userSelect.style.display = 'none';
            }
        } catch (error) { 
            console.error('搜尋使用者失敗:', error);
            userSelect.style.display = 'none';
        }
    });
    userSelect.addEventListener('change', () => {
        const selectedValue = userSelect.value;
        if (selectedValue) {
            const selectedOption = userSelect.options[userSelect.selectedIndex];
            setSelectedUser(selectedValue, selectedOption.dataset.userName);
            // ▼▼▼ 修改點：自動填入會員電話 ▼▼▼
            document.getElementById('booking-phone-input').value = selectedOption.dataset.userPhone || '';
            userSelect.style.display = 'none';
        }
    });
    userSearchInput.addEventListener('blur', () => {
        setTimeout(() => {
            const isUserSelected = document.getElementById('selected-user-view').style.display === 'flex';
            const inputText = userSearchInput.value.trim();
            if (userSelect.style.display === 'block' || isUserSelected || !inputText) {
                return;
            }
            const tempUserId = `walk-in-${Date.now()}`;
            setSelectedUser(tempUserId, inputText);
            // ▼▼▼ 修改點：清空電話欄位給臨時顧客 ▼▼▼
            document.getElementById('booking-phone-input').value = '';
        }, 200);
    });
    document.getElementById('change-user-btn').addEventListener('click', () => {
        document.getElementById('selected-user-id').value = '';
        document.getElementById('selected-user-view').style.display = 'none';
        document.getElementById('user-selection-container').style.display = 'block';
        userSearchInput.value = '';
        // ▼▼▼ 修改點：清空電話欄位 ▼▼▼
        document.getElementById('booking-phone-input').value = '';
        userSearchInput.focus();
    });
    document.getElementById('admin-add-booking-item-btn').addEventListener('click', () => addAdminBookingItemRow());
    userSearchInput.dataset.initialized = 'true';
}

async function handleCreateBookingSubmit(e) {
    e.preventDefault();
    let finalUserId = document.getElementById('selected-user-id').value;
    let finalContactName = '';
    const isUserSelected = document.getElementById('selected-user-view').style.display === 'flex';
    if (isUserSelected) {
        finalUserId = document.getElementById('selected-user-id').value;
        finalContactName = document.getElementById('selected-user-display').textContent;
    } else {
        const searchInputText = document.getElementById('booking-user-search').value.trim();
        if (searchInputText) {
            finalUserId = `walk-in-${Date.now()}`;
            finalContactName = searchInputText;
        }
    }
    const items = [];
    document.querySelectorAll('.admin-booking-item-row').forEach(row => {
        const select = row.querySelector('.booking-item-select');
        let name = select.value;
        if (name === 'other') {
            name = row.querySelector('.booking-item-name-other').value.trim();
        }
        const qty = row.querySelector('.booking-item-qty').value;
        const price = row.querySelector('.booking-item-price').value;
        if (name) items.push({ name, qty, price });
    });
    if (items.length === 0) {
        ui.toast.error('請至少填寫一個預約項目！');
        return;
    }
    const formData = {
        userId: finalUserId,
        bookingDate: document.getElementById('booking-date-input').value,
        timeSlot: document.getElementById('booking-slot-select').value,
        numOfPeople: document.getElementById('booking-people-input').value,
        // ▼▼▼ 修改點：收集電話號碼 ▼▼▼
        contactPhone: document.getElementById('booking-phone-input').value,
        totalAmount: document.getElementById('booking-total-amount-input').value,
        notes: document.getElementById('booking-notes-input').value,
        contactName: finalContactName, 
        items: items,
    };
    if (!formData.userId || !formData.bookingDate || !formData.timeSlot) {
        ui.toast.error('顧客、預約日期和時段為必填！');
        return;
    }
    try {
        await api.createBooking(formData);
        ui.toast.success('預約建立成功！');
        ui.hideModal('#create-booking-modal');
        await fetchDataAndRender(document.querySelector('#booking-status-filter .active')?.dataset.filter || 'today');
    } catch (error) {
        ui.toast.error(`建立失敗: ${error.message}`);
    }
}

async function handleSaveBookingSettings() {
    if (!bookingDatepicker) return;
    const saveButton = document.getElementById('save-booking-settings-btn');
    try {
        saveButton.disabled = true;
        saveButton.textContent = '儲存中...';
        const newEnabledDates = bookingDatepicker.selectedDates.map(d => bookingDatepicker.formatDate(d, "Y-m-d"));
        const originalDates = new Set(enabledDates);
        const newDates = new Set(newEnabledDates);
        const datesToAdd = newEnabledDates.filter(d => !originalDates.has(d));
        const datesToRemove = enabledDates.filter(d => !newDates.has(d));
        
        const promises = [];
        datesToAdd.forEach(date => promises.push(api.saveBookingSettings({ action: 'add', date: date })));
        datesToRemove.forEach(date => promises.push(api.saveBookingSettings({ action: 'remove', date: date })));
        await Promise.all(promises);

        ui.toast.success('可預約日期已成功儲存！');
        ui.hideModal('#booking-settings-modal');
        enabledDates = newEnabledDates;
    } catch (error) {
        ui.toast.error("儲存失敗: " + error.message);
    } finally {
        saveButton.disabled = false;
        saveButton.textContent = '儲存所有變更';
    }
}



// ▼▼▼ 請將此函式新增到檔案中 ▼▼▼
async function openBookingDetailsModal(bookingId) {
    const modal = document.getElementById('booking-details-modal');
    const contentEl = document.getElementById('booking-details-content');
    if (!modal || !contentEl) return;

    ui.showModal('#booking-details-modal');
    contentEl.innerHTML = '<p>正在載入預約資料...</p>';

    try {
        // 從快取的預約列表中找到對應的 booking 物件
        const booking = allBookings.find(b => b.booking_id == bookingId);
        if (!booking) {
            throw new Error('在 App 中找不到這筆預約資料。');
        }

        let userProfile = null;
        // 判斷是否為正式會員 (user_id 不是以 'walk-in-' 開頭)
        if (booking.user_id && !booking.user_id.startsWith('walk-in-')) {
            // 是會員，就去後端撈取完整的 CRM 資料
            const userDetails = await api.getUserDetails(booking.user_id);
            userProfile = userDetails.profile;
        }

        // --- 開始組合 HTML ---
        let html = `
            <h4>預約資訊</h4>
            <div class="details-grid-container">
                <div><strong>預約單號:</strong> ${booking.booking_id}</div>
                <div><strong>預約日期:</strong> ${booking.booking_date}</div>
                <div><strong>預約時段:</strong> ${booking.time_slot}</div>
                <div><strong>總人數:</strong> ${booking.num_of_people} 人</div>
                <div><strong>預估總金額:</strong> ${booking.total_amount || '未設定'}</div>
                <div><strong>聯絡電話:</strong> ${booking.contact_phone || '未提供'}</div>
            </div>
            <div class="details-notes"><strong>內部備註:</strong> <pre>${booking.notes || '無'}</pre></div>
            
            <h4>預約項目</h4>
            <table class="items-table">
                <thead><tr><th>項目名稱</th><th>數量</th><th>單價</th></tr></thead>
                <tbody>
        `;

        booking.items.forEach(item => {
            html += `<tr><td>${item.item_name}</td><td>${item.quantity}</td><td>${item.price || 'N/A'}</td></tr>`;
        });

        html += '</tbody></table>';

        // 如果是會員，才顯示 CRM 資訊區塊
        if (userProfile) {
            html += `
                <hr>
                <h4>顧客資訊 (會員)</h4>
                <div class="details-grid-container">
                    <div><strong>顧客姓名:</strong> ${userProfile.nickname || userProfile.line_display_name}</div>
                    <div><strong>會員等級:</strong> ${userProfile.level}</div>
                    <div><strong>會員方案:</strong> ${userProfile.class || '無'}</div>
                </div>
            `;
        } else {
            html += `
                <hr>
                <h4>顧客資訊 (臨時顧客)</h4>
                <p><strong>顧客姓名:</strong> ${booking.contact_name}</p>
            `;
        }

        contentEl.innerHTML = html;

    } catch (error) {
        contentEl.innerHTML = `<p style="color: red;">讀取資料失敗：${error.message}</p>`;
    }
}


// --- 列表與日曆渲染函式 (【Bug 修復】) ---

function renderBookingList(bookings) {
    const bookingListTbody = document.getElementById('booking-list-tbody');
    if (!bookingListTbody) return;
    bookingListTbody.innerHTML = '';
    if (!bookings || bookings.length === 0) {
        bookingListTbody.innerHTML = '<tr><td colspan="6" style="text-align: center;">找不到符合條件的預約。</td></tr>';
        return;
    }
    bookings.forEach(booking => {
        const row = bookingListTbody.insertRow();
        row.dataset.bookingId = booking.booking_id;
        row.style.cursor = 'pointer';

        let statusText = '未知', statusClass = '';
        if (booking.status === 'confirmed') { statusText = '預約成功'; statusClass = 'status-confirmed'; }
        if (booking.status === 'checked-in') { statusText = '已報到'; statusClass = 'status-checked-in'; }
        if (booking.status === 'cancelled') { statusText = '已取消'; statusClass = 'status-cancelled'; }

        const itemSummary = booking.items?.map(item => `${item.item_name} x${item.quantity}`).join(', ') || '無項目';

        // ▼▼▼ 修改點：在 actions-cell 中加入取消按鈕 ▼▼▼
        row.innerHTML = `
            <td class="compound-cell"><div class="main-info">${booking.booking_date}</div><div class="sub-info">${booking.time_slot}</div></td>
            <td class="compound-cell"><div class="main-info">${booking.contact_name}</div><div class="sub-info">${itemSummary}</div></td>
            <td>${booking.num_of_people}</td>
            <td>${booking.total_amount || 'N/A'}</td>
            <td><span class="status-tag ${statusClass}">${statusText}</span></td>
            <td class="actions-cell">
                <button class="action-btn btn-edit-booking" data-booking-id="${booking.booking_id}" style="background-color: var(--color-primary);">編輯</button>
                <button class="btn-quick-cancel" data-booking-id="${booking.booking_id}" ${booking.status === 'cancelled' ? 'disabled' : ''}>&times;</button>
            </td>
        `;
    });
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

    for (let i = 0; i < firstDayOfMonth; i++) calendarGrid.innerHTML += `<div></div>`;

    for (let day = 1; day <= daysInMonth; day++) {
        const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        const bookingsForDay = allBookings.filter(b => b.booking_date === dateStr && b.status !== 'cancelled');
        
        // ▼▼▼ 從這裡開始是修改重點 ▼▼▼
        let dayHtml = `<div class="calendar-day"><span class="day-number">${day}</span>`;
        bookingsForDay.forEach(b => {
            let statusClass = '';
            if (b.status === 'confirmed') statusClass = 'status-confirmed';
            if (b.status === 'checked-in') statusClass = 'status-checked-in';

            dayHtml += `
                <div class="calendar-booking ${statusClass}" data-booking-id="${b.booking_id}" style="cursor: pointer;">
                    <span>${b.time_slot} ${b.contact_name}</span>
                    <button class="btn-quick-cancel" data-booking-id="${b.booking_id}">&times;</button>
                </div>
            `;
        });
        dayHtml += `</div>`;
        calendarGrid.innerHTML += dayHtml;
        // ▲▲▲ 修改重點結束 ▲▲▲
    }
}


async function fetchDataAndRender(filter = 'today') {
    const bookingListTbody = document.getElementById('booking-list-tbody');
    const calendarView = document.getElementById('calendar-view-container');
    try {
        if (bookingListTbody) bookingListTbody.innerHTML = '<tr><td colspan="6" style="text-align: center;">載入中...</td></tr>';
        
        const isCalendarView = calendarView && getComputedStyle(calendarView).display !== 'none';
        const apiFilter = isCalendarView ? 'all_upcoming' : filter;
        
        allBookings = await api.getBookings(apiFilter);

        if (!isCalendarView) {
            renderBookingList(allBookings);
        } else {
            updateCalendar();
        }
    } catch (error) {
        console.error('獲取預約列表失敗:', error);
        if (bookingListTbody) bookingListTbody.innerHTML = `<tr><td colspan="6" style="color: red; text-align: center;">${error.message}</td></tr>`;
    }
}


// --- 綁定事件監聽器 (大幅修改) ---
function setupEventListeners() {
    const page = document.getElementById('page-bookings');
    if(!page || page.dataset.initialized) return;

    page.addEventListener('click', async e => {
        const target = e.target;
        
        // --- ▼▼▼ 修改點：將取消邏輯統一處理 ▼▼▼ ---
        const quickCancelBtn = target.closest('.btn-quick-cancel');
        if (quickCancelBtn) {
            e.stopPropagation(); // 防止觸發外層的 "看詳情" 事件
            const bookingId = quickCancelBtn.dataset.bookingId;
            const confirmed = await ui.confirm('確定要取消此預約嗎？');
            if (confirmed) {
                try {
                    // 禁用按鈕防止重複點擊
                    quickCancelBtn.disabled = true; 
                    await api.updateBookingStatus(Number(bookingId), 'cancelled');
                    ui.toast.success('預約已取消');
                    // 重新載入資料以更新畫面
                    await fetchDataAndRender(document.querySelector('#booking-status-filter .active')?.dataset.filter);
                } catch(err) {
                    ui.toast.error(`錯誤：${err.message}`);
                    quickCancelBtn.disabled = false; // 如果失敗，重新啟用按鈕
                }
            }
            return; // 結束後續判斷
        }

        if (calendarBooking) {
            const bookingId = calendarBooking.dataset.bookingId;
            openBookingDetailsModal(bookingId);
            return;
        }
        // --- ▲▲▲ 日曆事件處理結束 ▲▲▲ ---
        
        // --- 點擊看詳情 (日曆或列表) ---
        const calendarBooking = target.closest('.calendar-booking');
        const bookingRow = target.closest('tr[data-booking-id]');
        if (calendarBooking || bookingRow) {
            const bookingId = calendarBooking?.dataset.bookingId || bookingRow?.dataset.bookingId;
            openBookingDetailsModal(bookingId);
            return;
        }
        
        // 切換日曆/列表
        if(target.id === 'switch-to-calendar-view-btn') {
            const listView = document.getElementById('list-view-container');
            const calendarView = document.getElementById('calendar-view-container');
            const isListVisible = listView.style.display !== 'none';
            listView.style.display = isListVisible ? 'none' : 'block';
            calendarView.style.display = isListVisible ? 'block' : 'none';
            target.textContent = isListVisible ? '切換至列表' : '切換至行事曆';
            fetchDataAndRender();
        }
        
        // 篩選按鈕
        else if(target.closest('#booking-status-filter') && target.tagName === 'BUTTON') {
            document.querySelector('#booking-status-filter .active')?.classList.remove('active');
            target.classList.add('active');
            fetchDataAndRender(target.dataset.filter);
        }
      
        // 手動建立預約按鈕
        else if(target.id === 'create-booking-btn') {
            resetCreateBookingModal();
            ui.showModal('#create-booking-modal');
        } 
        
        // 管理公休日按鈕
        else if (target.id === 'manage-booking-dates-btn') {
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
        }
    });

    initializeCreateBookingModal(); 
    document.getElementById('create-booking-form')?.addEventListener('submit', handleCreateBookingSubmit);
    document.getElementById('save-booking-settings-btn')?.addEventListener('click', handleSaveBookingSettings);
    document.getElementById('calendar-prev-month-btn')?.addEventListener('click', () => { currentCalendarDate.setMonth(currentCalendarDate.getMonth() - 1); updateCalendar(); });
    document.getElementById('calendar-next-month-btn')?.addEventListener('click', () => { currentCalendarDate.setMonth(currentCalendarDate.getMonth() + 1); updateCalendar(); });

    page.dataset.initialized = 'true';
}

export const init = async () => {
    setupEventListeners();
    await fetchDataAndRender('today');
};
