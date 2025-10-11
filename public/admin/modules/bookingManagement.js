import { api } from '../api.js';
import { ui } from '../ui.js';

let allBookings = [];
let allProducts = []; // 【新增】快取所有產品
let currentCalendarDate = new Date();
let createBookingDatepicker = null;
let enabledDates = [];

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
    
    // 【修改】建立下拉選單
    const select = document.createElement('select');
    select.className = 'booking-item-select';
    select.innerHTML = '<option value="">-- 選擇項目 --</option>';
    allProducts.filter(p => p.is_visible).forEach(p => {
        select.add(new Option(`${p.name} - $${p.price}`, p.name));
    });
    select.add(new Option('其他 (手動輸入)', 'other'));
    
    // 建立其他輸入框
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

    // 將下拉選單和手動輸入框都放進一個容器
    const nameContainer = document.createElement('div');
    nameContainer.appendChild(select);
    nameContainer.appendChild(nameInput);
    itemRow.append(nameContainer, qtyInput, priceInput, removeBtn);
    container.appendChild(itemRow);

    // 監聽下拉選單變化
    select.addEventListener('change', () => {
        nameInput.style.display = select.value === 'other' ? 'block' : 'none';
        if (select.value !== 'other' && select.value !== '') {
            const selectedProduct = allProducts.find(p => p.name === select.value);
            if (selectedProduct) priceInput.value = selectedProduct.price;
        }
    });
    
    removeBtn.addEventListener('click', () => {
        itemRow.remove();
        if (container.children.length < 5) document.getElementById('admin-add-booking-item-btn').style.display = 'block';
    });

    if (container.children.length >= 5) document.getElementById('admin-add-booking-item-btn').style.display = 'none';
}

function setSelectedUser(userId, userName) {
    document.getElementById('selected-user-id').value = userId;
    document.getElementById('selected-user-display').textContent = userName;
    document.getElementById('user-selection-container').style.display = 'none';
    document.getElementById('selected-user-view').style.display = 'flex';
}

function resetCreateBookingModal() {
    document.getElementById('create-booking-form').reset();
    document.getElementById('admin-booking-items-container').innerHTML = '';
    addAdminBookingItemRow();

    document.getElementById('selected-user-id').value = '';
    document.getElementById('selected-user-view').style.display = 'none';
    document.getElementById('user-selection-container').style.display = 'block';
    document.getElementById('booking-user-select').style.display = 'none';
    document.getElementById('booking-user-select').innerHTML = '';
}

async function handleCreateNewUser() {
    const newUserName = prompt('請輸入新顧客的 LINE 名稱或暱稱：');
    if (!newUserName || newUserName.trim() === '') return;

    try {
        const tempUserId = 'U' + Date.now(); 
        // 【錯誤修正】呼叫 API 時補上預設值
        await api.updateUserDetails({
            userId: tempUserId,
            nickname: newUserName.trim(),
            level: 1,
            current_exp: 0,
            user_class: '無',
            isNewUser: true
        });
        setSelectedUser(tempUserId, newUserName.trim());
        ui.toast.success(`已建立新顧客：${newUserName.trim()}`);
    } catch(error) {
        ui.toast.error(`建立新顧客失敗：${error.message}`);
    }
}

async function initializeCreateBookingModal() {
    if (createBookingDatepicker) return;

    // 預先載入產品列表
    try {
        if(allProducts.length === 0) allProducts = await api.getProducts();
    } catch(e) { console.error("無法載入產品列表供預約使用"); }

    createBookingDatepicker = flatpickr("#booking-date-input", { dateFormat: "Y-m-d" });

    const slotSelect = document.getElementById('booking-slot-select');
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
        userSelect.style.display = 'none';
        if (query.length < 1) return;

        try {
            const users = await api.searchUsers(query);
            userSelect.innerHTML = '';
            users.forEach(u => {
                const displayName = u.nickname || u.line_display_name;
                const option = new Option(`${displayName} (${u.user_id.substring(0, 10)}...)`, u.user_id);
                option.dataset.userName = displayName;
                userSelect.add(option);
            });
            userSelect.add(new Option('+ 新增顧客...', 'new_user'));
            userSelect.style.display = 'block';
        } catch (error) { console.error('搜尋使用者失敗:', error); }
    });

    userSelect.addEventListener('change', async () => {
        if (userSelect.value === 'new_user') {
            await handleCreateNewUser();
        } else if (userSelect.value) {
            const selectedOption = userSelect.options[userSelect.selectedIndex];
            setSelectedUser(userSelect.value, selectedOption.dataset.userName);
        }
    });
    
    document.getElementById('change-user-btn').addEventListener('click', () => {
        document.getElementById('selected-user-id').value = '';
        document.getElementById('selected-user-view').style.display = 'none';
        document.getElementById('user-selection-container').style.display = 'block';
        userSearchInput.value = '';
        userSearchInput.focus();
    });

    document.getElementById('admin-add-booking-item-btn').addEventListener('click', () => addAdminBookingItemRow());
}

async function handleCreateBookingSubmit(e) {
    e.preventDefault();

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
        userId: document.getElementById('selected-user-id').value,
        bookingDate: document.getElementById('booking-date-input').value,
        timeSlot: document.getElementById('booking-slot-select').value,
        numOfPeople: document.getElementById('booking-people-input').value,
        totalAmount: document.getElementById('booking-total-amount-input').value,
        notes: document.getElementById('booking-notes-input').value,
        contactName: document.getElementById('selected-user-display').textContent,
        contactPhone: 'N/A', // 後續可擴充
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

// --- 列表與日曆渲染函式 (【Bug 修復】) ---

function renderBookingList(bookings) {
    const bookingListTbody = document.getElementById('booking-list-tbody');
    if (!bookingListTbody) return;

    bookingListTbody.innerHTML = '';
    if (!bookings || bookings.length === 0) {
        bookingListTbody.innerHTML = '<tr><td colspan="5" style="text-align: center;">找不到符合條件的預約。</td></tr>';
        return;
    }

    bookings.forEach(booking => {
        const row = bookingListTbody.insertRow();
        let statusText = '未知';
        if (booking.status === 'confirmed') statusText = '預約成功';
        if (booking.status === 'checked-in') statusText = '已報到';
        if (booking.status === 'cancelled') statusText = '已取消';

        // 產生項目摘要
        const itemSummary = booking.items?.map(item => `${item.item_name} x${item.quantity}`).join(', ') || '無項目';

        row.innerHTML = `
            <td class="compound-cell">
                <div class="main-info">${booking.booking_date}</div>
                <div class="sub-info">${booking.time_slot}</div>
            </td>
            <td class="compound-cell">
                <div class="main-info">${booking.contact_name}</div>
                <div class="sub-info">${itemSummary}</div>
            </td>
            <td>${booking.num_of_people}</td>
            <td>${booking.total_amount || 'N/A'}</td>
            <td>${statusText}</td>
            <td class="actions-cell">
                <button class="action-btn btn-cancel-booking" data-booking-id="${booking.booking_id}" style="background-color: var(--danger-color);" ${booking.status === 'cancelled' ? 'disabled' : ''}>取消</button>
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
        let dayHtml = `<div class="calendar-day"><span class="day-number">${day}</span>`;
        bookingsForDay.forEach(b => {
            dayHtml += `<div class="calendar-booking status-${b.status}">${b.time_slot} ${b.contact_name}</div>`;
        });
        dayHtml += `</div>`;
        calendarGrid.innerHTML += dayHtml;
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

    // 頁面級別的點擊事件委派
    page.addEventListener('click', async e => {
        const target = e.target;
        
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

        // 取消按鈕
        else if (target.closest('.actions-cell')?.querySelector('.btn-cancel-booking')) {
            const bookingId = target.dataset.bookingId;
            if (!bookingId) return;
            const confirmed = await ui.confirm('確定要取消此預約嗎？');
            if (confirmed) {
                try {
                    await api.updateBookingStatus(Number(bookingId), 'cancelled');
                    ui.toast.success('預約已取消');
                    await fetchDataAndRender(document.querySelector('#booking-status-filter .active')?.dataset.filter);
                } catch(err) {
                    ui.toast.error(`錯誤：${err.message}`);
                }
            }
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
                alert("初始化公休日設定失敗: " + error.message);
            }
        }
    });

    // 只需初始化一次的 Modal 內部事件
    initializeCreateBookingModal(); 

    // Modal 內的儲存/提交按鈕
    document.getElementById('save-booking-settings-btn')?.addEventListener('click', handleSaveBookingSettings);
    document.getElementById('create-booking-form')?.addEventListener('submit', handleCreateBookingSubmit);

    // 日曆月份切換
    document.getElementById('calendar-prev-month-btn')?.addEventListener('click', () => { currentCalendarDate.setMonth(currentCalendarDate.getMonth() - 1); updateCalendar(); });
    document.getElementById('calendar-next-month-btn')?.addEventListener('click', () => { currentCalendarDate.setMonth(currentCalendarDate.getMonth() + 1); updateCalendar(); });

    page.dataset.initialized = 'true';
}

// 模組初始化函式
export const init = async () => {
    setupEventListeners();
    fetchDataAndRender('today');
};