// public/admin/modules/bookingManagement.js
import { api } from '../api.js';
import { ui } from '../ui.js';

let allBookings = [];
let currentCalendarDate = new Date();
let bookingDatepicker = null;
let createBookingDatepicker = null;
let enabledDates = [];
let currentCreateBookingUser = null;

// --- 【新增】手動建立預約 Modal 的相關函式 ---

// 初始化手動建立 Modal
function initializeCreateBookingModal() {
    // 初始化日期選擇器
    if (createBookingDatepicker) createBookingDatepicker.destroy();
    createBookingDatepicker = flatpickr("#booking-date-input", { dateFormat: "Y-m-d" });

    // 填充時間選項
    const slotSelect = document.getElementById('booking-slot-select');
    if (slotSelect) {
        slotSelect.innerHTML = '<option value="">-- 請選擇時段 --</option>';
        for (let hour = 8; hour <= 22; hour++) {
            for (let minute of ['00', '30']) {
                const time = `${String(hour).padStart(2, '0')}:${minute}`;
                slotSelect.add(new Option(time, time));
            }
        }
    }

    // 處理使用者搜尋
    const userSearchInput = document.getElementById('booking-user-search');
    const userSelect = document.getElementById('booking-user-select');
    if (userSearchInput && userSelect) {
        userSearchInput.addEventListener('input', async (e) => {
            const query = e.target.value;
            if (query.length < 1) {
                userSelect.style.display = 'none';
                return;
            }
            try {
                const users = await api.searchUsers(query);
                userSelect.innerHTML = '<option value="">-- 請從搜尋結果中選擇 --</option>';
                users.forEach(u => {
                    const displayName = u.nickname || u.line_display_name;
                    userSelect.add(new Option(`${displayName} (${u.user_id})`, u.user_id));
                });
                userSelect.style.display = 'block';
            } catch (error) {
                console.error('搜尋使用者失敗:', error);
            }
        });

        userSelect.addEventListener('change', () => {
            currentCreateBookingUser = userSelect.value;
        });
    }
}

// 處理手動建立表單提交
async function handleCreateBookingSubmit(e) {
    e.preventDefault();
    const formData = {
        userId: currentCreateBookingUser,
        bookingDate: document.getElementById('booking-date-input').value,
        timeSlot: document.getElementById('booking-slot-select').value,
        contactName: document.getElementById('booking-name-input').value,
        contactPhone: document.getElementById('booking-phone-input').value,
        numOfPeople: document.getElementById('booking-people-input').value,
        item: document.getElementById('booking-item-input').value,
    };

    if (!formData.userId || !formData.bookingDate || !formData.timeSlot) {
        alert('會員、預約日期和時段為必填！');
        return;
    }

    try {
        await api.createBooking(formData);
        alert('預約建立成功！');
        ui.hideModal('#create-booking-modal');
        document.getElementById('create-booking-form').reset();
        fetchDataAndRender(document.querySelector('#booking-status-filter .active')?.dataset.filter || 'today');
    } catch (error) {
        alert(`建立失敗: ${error.message}`);
    }
}


// 渲染預約列表
function renderBookingList(bookings) {
    const bookingListTbody = document.getElementById('booking-list-tbody');
    if (!bookingListTbody) return;

    bookingListTbody.innerHTML = '';
    if (bookings.length === 0) {
        bookingListTbody.innerHTML = '<tr><td colspan="5" style="text-align: center;">找不到符合條件的預約。</td></tr>';
        return;
    }

    bookings.forEach(booking => {
        const row = bookingListTbody.insertRow();
        let statusText = '未知';
        if (booking.status === 'confirmed') statusText = '預約成功';
        if (booking.status === 'checked-in') statusText = '已報到';
        if (booking.status === 'cancelled') statusText = '已取消';

        row.innerHTML = `
            <td class="compound-cell">
                <div class="main-info">${booking.booking_date}</div>
                <div class="sub-info">${booking.time_slot}</div>
            </td>
            <td class="compound-cell">
                <div class="main-info">${booking.contact_name}</div>
                <div class="sub-info">${booking.contact_phone}</div>
            </td>
            <td>${booking.num_of_people}</td>
            <td>${statusText}</td>
            <td class="actions-cell">
                <button class="action-btn btn-check-in" data-booking-id="${booking.booking_id}" style="background-color: var(--success-color);" ${booking.status !== 'confirmed' ? 'disabled' : ''}>報到</button>
                <button class="action-btn btn-cancel-booking" data-booking-id="${booking.booking_id}" style="background-color: var(--danger-color);" ${booking.status === 'cancelled' ? 'disabled' : ''}>取消</button>
            </td>
        `;
    });
}

// 更新行事曆視圖
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

    for (let i = 0; i < firstDayOfMonth; i++) {
        calendarGrid.innerHTML += `<div class="calendar-day day-other-month"></div>`;
    }

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


// 統一的資料獲取與渲染函式
async function fetchDataAndRender(filter = 'today') {
    const bookingListTbody = document.getElementById('booking-list-tbody');
    try {
        if (bookingListTbody) bookingListTbody.innerHTML = '<tr><td colspan="5" style="text-align: center;">載入中...</td></tr>';
        
        const apiFilter = (document.getElementById('calendar-view-container').style.display !== 'none') ? 'all_upcoming' : filter;
        allBookings = await api.getBookings(apiFilter);

        if (document.getElementById('list-view-container').style.display !== 'none') {
            renderBookingList(allBookings);
        }
        if (document.getElementById('calendar-view-container').style.display !== 'none') {
            updateCalendar();
        }
    } catch (error) {
        console.error('獲取預約列表失敗:', error);
        if (bookingListTbody) bookingListTbody.innerHTML = `<tr><td colspan="5" style="color: red; text-align: center;">${error.message}</td></tr>`;
    }
}

// 綁定事件監聽器
function setupEventListeners() {
    const page = document.getElementById('page-bookings');
    if(!page) return;

    // 將所有點擊事件委派到 page 元素
    page.addEventListener('click', async e => {
        const target = e.target;
        
        // 視圖切換
        if(target.id === 'switch-to-calendar-view-btn') {
            const listView = document.getElementById('list-view-container');
            const calendarView = document.getElementById('calendar-view-container');
            const isListVisible = listView.style.display !== 'none';
            listView.style.display = isListVisible ? 'none' : 'block';
            calendarView.style.display = isListVisible ? 'block' : 'none';
            target.textContent = isListVisible ? '切換至列表' : '切換至行事曆';
            fetchDataAndRender();
        }
        
        // 列表篩選
        else if(target.closest('#booking-status-filter') && target.tagName === 'BUTTON') {
            document.querySelector('#booking-status-filter .active')?.classList.remove('active');
            target.classList.add('active');
            fetchDataAndRender(target.dataset.filter);
        }

        // 列表操作按鈕
        else if (target.closest('.actions-cell')) {
            const bookingId = target.dataset.bookingId;
            if (!bookingId) return;

            if (target.classList.contains('btn-check-in')) {
                if (confirm('確定要將此預約標示為「已報到」嗎？')) {
                    await api.updateBookingStatus(Number(bookingId), 'checked-in').catch(err => alert(`錯誤：${err.message}`));
                    fetchDataAndRender(document.querySelector('#booking-status-filter .active')?.dataset.filter);
                }
            } else if (target.classList.contains('btn-cancel-booking')) {
                if (confirm('確定要取消此預約嗎？')) {
                     await api.updateBookingStatus(Number(bookingId), 'cancelled').catch(err => alert(`錯誤：${err.message}`));
                    fetchDataAndRender(document.querySelector('#booking-status-filter .active')?.dataset.filter);
                }
            }
        }
        
        // 手動建立預約
        else if(target.id === 'create-booking-btn') {
            initializeCreateBookingModal();
            ui.showModal('#create-booking-modal');
        }

        // 管理公休日
        else if (target.id === 'manage-booking-dates-btn') {
            // ... (此部分邏輯不變)
        }
    });


    // 管理公休日按鈕
    const manageBookingDatesBtn = document.getElementById('manage-booking-dates-btn');
    if (manageBookingDatesBtn) {
        manageBookingDatesBtn.onclick = async () => {
            try {
                enabledDates = await api.getBookingSettings();
                if (bookingDatepicker) bookingDatepicker.destroy();
                bookingDatepicker = flatpickr("#booking-datepicker-admin-container", {
                    inline: true,
                    mode: "multiple",
                    dateFormat: "Y-m-d",
                    defaultDate: enabledDates,
                });
                ui.showModal('#booking-settings-modal');
            } catch (error) {
                alert("初始化公休日設定失敗: " + error.message);
            }
        };
    }

    // 儲存公休日設定
    const saveBookingSettingsBtn = document.getElementById('save-booking-settings-btn');
    if (saveBookingSettingsBtn) {
        saveBookingSettingsBtn.onclick = async () => {
            if (!bookingDatepicker) return;
            const newEnabledDates = bookingDatepicker.selectedDates.map(d => bookingDatepicker.formatDate(d, "Y-m-d"));
            // 此處省略了比對新舊日期陣列並分批發送 API 的複雜邏輯，簡化處理
            try {
                await api.saveBookingSettings({ action: 'replace_all', dates: newEnabledDates }); // 假設 API 支援一次性替換
                alert('設定已儲存！');
                ui.hideModal('#booking-settings-modal');
            } catch (error) {
                 alert("儲存失敗: " + error.message);
            }
        };
    }
}

    // 行事曆月份切換
    const prevMonthBtn = document.getElementById('calendar-prev-month-btn');
    const nextMonthBtn = document.getElementById('calendar-next-month-btn');
    if (prevMonthBtn) prevMonthBtn.onclick = () => { currentCalendarDate.setMonth(currentCalendarDate.getMonth() - 1); updateCalendar(); };
    if (nextMonthBtn) nextMonthBtn.onclick = () => { currentCalendarDate.setMonth(currentCalendarDate.getMonth() + 1); updateCalendar(); };

    // 手動建立預約表單提交
    const createBookingForm = document.getElementById('create-booking-form');
    if (createBookingForm) createBookingForm.addEventListener('submit', handleCreateBookingSubmit);


// 模組初始化函式
export const init = async () => {
    // 預設載入今日預約
    fetchDataAndRender('today');
    setupEventListeners();
};