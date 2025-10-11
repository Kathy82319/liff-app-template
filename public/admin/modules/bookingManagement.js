// public/admin/modules/bookingManagement.js (v2 - 升級手動建立功能版)
import { api } from '../api.js';
import { ui } from '../ui.js';

let allBookings = [];
let currentCalendarDate = new Date();
let bookingDatepicker = null;
let createBookingDatepicker = null;
let enabledDates = [];

// --- 【全新】手動建立預約 Modal 的核心邏輯 ---

// 輔助函式：新增一列預約項目
function addAdminBookingItemRow(name = '', qty = 1, price = '') {
    const container = document.getElementById('admin-booking-items-container');
    if (!container || container.children.length >= 5) {
        if (container && container.children.length >= 5) {
            document.getElementById('admin-add-booking-item-btn').style.display = 'none';
        }
        return;
    }

    const itemRow = document.createElement('div');
    itemRow.className = 'admin-booking-item-row';
    itemRow.style.cssText = 'display: grid; grid-template-columns: 1fr 80px 100px 40px; gap: 10px; margin-bottom: 10px; align-items: center;';
    
    itemRow.innerHTML = `
        <input type="text" class="booking-item-name" placeholder="項目名稱" value="${name}">
        <input type="number" class="booking-item-qty" value="${qty}" min="1" placeholder="數量">
        <input type="number" class="booking-item-price" value="${price}" min="0" placeholder="金額">
        <button type="button" class="remove-booking-item-btn" style="background: var(--color-danger); padding: 5px 10px; border: none; color: white; border-radius: 4px; cursor: pointer; height: fit-content;">-</button>
    `;

    container.appendChild(itemRow);
    
    itemRow.querySelector('.remove-booking-item-btn').addEventListener('click', () => {
        itemRow.remove();
        if (container.children.length < 5) {
            document.getElementById('admin-add-booking-item-btn').style.display = 'block';
        }
    });

    if (container.children.length >= 5) {
        document.getElementById('admin-add-booking-item-btn').style.display = 'none';
    }
}

// 輔助函式：設定當前選擇的預約顧客
function setSelectedUser(userId, userName) {
    document.getElementById('selected-user-id').value = userId;
    document.getElementById('selected-user-display').textContent = `已選定顧客：${userName}`;
    document.getElementById('booking-details-section').style.display = 'block';
    document.getElementById('booking-user-search').style.display = 'none';
    document.getElementById('booking-user-select').style.display = 'none';
    document.getElementById('create-new-user-btn').style.display = 'none';
}

// 輔助函式：重設手動建立 Modal 的狀態
function resetCreateBookingModal() {
    document.getElementById('create-booking-form').reset();
    document.getElementById('admin-booking-items-container').innerHTML = '';
    addAdminBookingItemRow();

    document.getElementById('selected-user-id').value = '';
    document.getElementById('selected-user-display').textContent = '';
    document.getElementById('booking-details-section').style.display = 'none';
    
    document.getElementById('booking-user-search').style.display = 'block';
    document.getElementById('booking-user-select').style.display = 'none';
    document.getElementById('create-new-user-btn').style.display = 'none';
}


// 初始化手動建立 Modal (只在第一次打開時執行)
function initializeCreateBookingModal() {
    if (createBookingDatepicker) return; // 如果已初始化，則不再執行

    createBookingDatepicker = flatpickr("#booking-date-input", { dateFormat: "Y-m-d" });

    const slotSelect = document.getElementById('booking-slot-select');
    if (slotSelect) {
        slotSelect.innerHTML = '<option value="">-- 請選擇時段 --</option>';
        for (let hour = 8; hour <= 22; hour++) {
            ['00', '30'].forEach(minute => {
                const time = `${String(hour).padStart(2, '0')}:${minute}`;
                slotSelect.add(new Option(time, time));
            });
        }
    }

    const userSearchInput = document.getElementById('booking-user-search');
    const userSelect = document.getElementById('booking-user-select');
    const createNewUserBtn = document.getElementById('create-new-user-btn');

    // 處理使用者搜尋
    userSearchInput.addEventListener('input', async (e) => {
        const query = e.target.value;
        createNewUserBtn.style.display = 'none';
        userSelect.style.display = 'none';
        if (query.length < 1) return;

        try {
            const users = await api.searchUsers(query);
            userSelect.innerHTML = '<option value="">-- 請從搜尋結果中選擇 --</option>';
            if (users.length > 0) {
                users.forEach(u => {
                    const displayName = u.nickname || u.line_display_name;
                    const option = new Option(`${displayName} (${u.user_id.substring(0, 15)}...)`, u.user_id);
                    option.dataset.userName = displayName;
                    userSelect.add(option);
                });
                userSelect.style.display = 'block';
            } else {
                createNewUserBtn.style.display = 'block';
            }
        } catch (error) {
            console.error('搜尋使用者失敗:', error);
        }
    });

    // 處理從下拉選單選擇使用者
    userSelect.addEventListener('change', () => {
        const selectedOption = userSelect.options[userSelect.selectedIndex];
        if (userSelect.value) {
            setSelectedUser(userSelect.value, selectedOption.dataset.userName);
        }
    });

    // 【新增】處理建立新顧客
    createNewUserBtn.addEventListener('click', async () => {
        const newUserName = prompt('請輸入新顧客的 LINE 名稱或暱稱：');
        if (!newUserName || newUserName.trim() === '') return;

        try {
            // 這裡我們虛構一個 User ID，因為後端 API 需要
            // 更好的做法是後端有一個專門的 "admin-create-user" API
            const tempUserId = 'U' + Date.now(); 
            await api.updateUserDetails({
                userId: tempUserId,
                nickname: newUserName.trim(),
                isNewUser: true // 傳遞一個標記給後端
            });
            setSelectedUser(tempUserId, newUserName.trim());
            ui.toast.success(`已建立新顧客：${newUserName.trim()}`);
        } catch(error) {
            ui.toast.error(`建立新顧客失敗：${error.message}`);
        }
    });
    
    document.getElementById('admin-add-booking-item-btn').addEventListener('click', () => addAdminBookingItemRow());
}

// 處理手動建立表單提交
async function handleCreateBookingSubmit(e) {
    e.preventDefault();

    const items = [];
    document.querySelectorAll('.admin-booking-item-row').forEach(row => {
        const name = row.querySelector('.booking-item-name').value.trim();
        const qty = row.querySelector('.booking-item-qty').value;
        const price = row.querySelector('.booking-item-price').value;
        if (name) {
            items.push({ name, qty, price });
        }
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
        contactName: document.getElementById('selected-user-display').textContent.replace('已選定顧客：', ''), // 暫用
        contactPhone: 'N/A', // 暫用
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
        fetchDataAndRender(document.querySelector('#booking-status-filter .active')?.dataset.filter || 'today');
    } catch (error) {
        ui.toast.error(`建立失敗: ${error.message}`);
    }
}


// --- 既有的列表與日曆渲染函式 (內容不變) ---

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

function updateCalendar() { /* ... 內容不變 ... */ }
async function fetchDataAndRender(filter = 'today') { /* ... 內容不變 ... */ }
async function handleSaveBookingSettings() { /* ... 內容不變 ... */ }


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

        // 報到/取消按鈕
        else if (target.closest('.actions-cell')) {
            const bookingId = target.dataset.bookingId;
            if (!bookingId) return;
            const currentFilter = document.querySelector('#booking-status-filter .active')?.dataset.filter || 'today';

            if (target.classList.contains('btn-check-in')) {
                if (confirm('確定要將此預約標示為「已報到」嗎？')) {
                    await api.updateBookingStatus(Number(bookingId), 'checked-in').catch(err => alert(`錯誤：${err.message}`));
                    fetchDataAndRender(currentFilter);
                }
            } else if (target.classList.contains('btn-cancel-booking')) {
                if (confirm('確定要取消此預約嗎？')) {
                     await api.updateBookingStatus(Number(bookingId), 'cancelled').catch(err => alert(`錯誤：${err.message}`));
                    fetchDataAndRender(currentFilter);
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