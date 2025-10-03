// public/admin/modules/bookingManagement.js
import { api } from '../api.js';
import { ui } from '../ui.js';

let allBookings = []; // 快取所有預約資料
let currentCalendarDate = new Date(); // 用於行事曆月份導航
let bookingDatepicker = null; // 用於公休日設定的 flatpickr 實例
let enabledDates = []; // 快取可預約日期

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
    // 視圖切換按鈕
    const switchToCalendarViewBtn = document.getElementById('switch-to-calendar-view-btn');
    if (switchToCalendarViewBtn) {
        switchToCalendarViewBtn.onclick = () => {
            const listViewContainer = document.getElementById('list-view-container');
            const calendarViewContainer = document.getElementById('calendar-view-container');
            const isListVisible = listViewContainer.style.display !== 'none';
            
            listViewContainer.style.display = isListVisible ? 'none' : 'block';
            calendarViewContainer.style.display = isListVisible ? 'block' : 'none';
            switchToCalendarViewBtn.textContent = isListVisible ? '切換至列表' : '切換至行事曆';
            
            fetchDataAndRender(document.querySelector('#booking-status-filter .active')?.dataset.filter || 'today');
        };
    }
    
    // 列表篩選按鈕
    const statusFilter = document.getElementById('booking-status-filter');
    if (statusFilter) {
        statusFilter.onclick = (e) => {
            if (e.target.tagName === 'BUTTON') {
                statusFilter.querySelector('.active')?.classList.remove('active');
                e.target.classList.add('active');
                fetchDataAndRender(e.target.dataset.filter);
            }
        };
    }
    
    // 列表操作按鈕 (報到/取消)
    const bookingListTbody = document.getElementById('booking-list-tbody');
    if(bookingListTbody) {
        bookingListTbody.onclick = async (e) => {
            const bookingId = e.target.dataset.bookingId;
            if (!bookingId) return;

            if (e.target.classList.contains('btn-check-in')) {
                if (confirm('確定要將此預約標示為「已報到」嗎？')) {
                    try {
                        await api.updateBookingStatus(Number(bookingId), 'checked-in');
                        fetchDataAndRender(document.querySelector('#booking-status-filter .active')?.dataset.filter);
                    } catch (error) {
                        alert(`錯誤：${error.message}`);
                    }
                }
            } else if (e.target.classList.contains('btn-cancel-booking')) {
                // 此處未來可以加入更複雜的取消彈窗邏輯
                if (confirm('確定要取消此預約嗎？')) {
                    try {
                        await api.updateBookingStatus(Number(bookingId), 'cancelled');
                        fetchDataAndRender(document.querySelector('#booking-status-filter .active')?.dataset.filter);
                    } catch (error) {
                        alert(`錯誤：${error.message}`);
                    }
                }
            }
        };
    }

    // 行事曆月份切換
    const calendarPrevMonthBtn = document.getElementById('calendar-prev-month-btn');
    const calendarNextMonthBtn = document.getElementById('calendar-next-month-btn');
    if (calendarPrevMonthBtn) {
        calendarPrevMonthBtn.onclick = () => {
            currentCalendarDate.setMonth(currentCalendarDate.getMonth() - 1);
            updateCalendar();
        };
    }
    if (calendarNextMonthBtn) {
        calendarNextMonthBtn.onclick = () => {
            currentCalendarDate.setMonth(currentCalendarDate.getMonth() + 1);
            updateCalendar();
        };
    }
    
    // 手動建立預約按鈕
    const createBookingBtn = document.getElementById('create-booking-btn');
    if (createBookingBtn) {
        createBookingBtn.onclick = () => {
            // 此處省略了打開和處理建立預約 Modal 的詳細邏輯
            // 我們會在下個步驟中將其遷移
            ui.showModal('#create-booking-modal');
        };
    }

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

// 模組初始化函式
export const init = async () => {
    // 預設載入今日預約
    fetchDataAndRender('today');
    setupEventListeners();
};