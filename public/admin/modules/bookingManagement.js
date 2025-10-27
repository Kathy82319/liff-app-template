// public/admin/modules/bookingManagement.js (修改價格相關部分)
import { api } from '../api.js';
import { ui } from '../ui.js';

// --- 保持原有的變數宣告 ---
let allBookings = [];
let allProducts = [];
let currentCalendarDate = new Date();
let createBookingDatepicker = null;
let bookingDatepicker = null; // For settings modal
let enabledDates = [];
let currentBookingInModal = null;

// --- 【新增】複製 getPriceForDate 輔助函式過來 ---
/**
 * 根據日期和產品資料獲取當日價格
 * @param {string} dateString - 日期字串 (YYYY-MM-DD)
 * @param {object} product - 產品物件 (包含 price_weekday, price_friday, price_saturday)
 * @returns {number | null} 當日價格或 null
 */
function getPriceForDate(dateString, product) {
    if (!product) return null; // 如果沒有產品資訊，回傳 null
    // 如果日期無效，或產品沒有任何價格資訊，嘗試回傳平日價，再沒有就回傳 null
    if (!dateString) return product.price_weekday !== null ? product.price_weekday : null;

    try {
        const date = new Date(dateString + 'T00:00:00'); // 確保解析為當地日期
        // 檢查日期是否有效
        if (isNaN(date.getTime())) {
             console.warn("getPriceForDate: 無效的日期字串", dateString);
             return product.price_weekday !== null ? product.price_weekday : null;
        }
        const dayOfWeek = date.getDay(); // 0=週日, 1=週一, ..., 5=週五, 6=週六

        if (dayOfWeek === 5) { // 週五
            return product.price_friday !== null ? product.price_friday : product.price_weekday;
        } else if (dayOfWeek === 6) { // 週六
            return product.price_saturday !== null ? product.price_saturday : product.price_weekday;
        } else { // 平日 (週日到週四)
            return product.price_weekday !== null ? product.price_weekday : null;
        }
    } catch (e) {
        console.error("getPriceForDate 發生錯誤:", e);
        // 出錯時，安全起見回傳平日價或 null
         return product.price_weekday !== null ? product.price_weekday : null;
    }
     // 如果連平日價都沒有，最終回傳 null
     return product.price_weekday !== null ? product.price_weekday : null;
}


// --- 修改 renderBookingDetails (View Mode) ---
// (顯示詳情時，BookingItems.price 應該已經是當時的正確價格，無需修改)
function renderBookingDetails(booking, userProfile, isEditing = false) {
    const contentEl = document.getElementById('booking-details-content');
    if (!contentEl) return;

    const contactName = userProfile ? (userProfile.nickname || userProfile.line_display_name) : booking.contact_name;

    // View Mode HTML (此部分**不需**修改價格顯示邏輯，因為 booking.items[x].price 應為正確值)
    if (!isEditing) {
        let html = `
            <h4>預約資訊</h4>
            <div class="details-grid-container">
                <div><strong>預約單號:</strong> ${booking.booking_id}</div>
                <div><strong>預約日期:</strong> ${booking.booking_date}</div>
                <div><strong>預約時段:</strong> ${booking.time_slot}</div>
                <div><strong>總人數:</strong> ${booking.num_of_people} 人</div>
                <div><strong>預估總金額:</strong> ${booking.total_amount !== null ? '$' + booking.total_amount : '未設定'}</div>
                <div><strong>聯絡電話:</strong> ${booking.contact_phone || '未提供'}</div>
            </div>
            <div class="details-notes"><strong>內部備註:</strong> <pre>${booking.notes || '無'}</pre></div>

            <h4>預約項目</h4>
            <table class="items-table">
                <thead><tr><th>項目名稱</th><th>數量</th><th>單價</th></tr></thead>
                <tbody>
        `;
        // --- 這裡直接使用 booking.items[x].price ---
        booking.items.forEach(item => {
            html += `<tr><td>${item.item_name}</td><td>${item.quantity}</td><td>${item.price !== null ? '$' + item.price : 'N/A'}</td></tr>`;
        });
        html += '</tbody></table>';

        if (userProfile) {
            html += `
                <hr><h4>顧客資訊 (會員)</h4>
                <p><strong>顧客姓名:</strong> ${contactName}</p>
                `;
        } else {
            html += `<hr><h4>顧客資訊 (臨時顧客)</h4><p><strong>顧客姓名:</strong> ${contactName}</p>`;
        }
        contentEl.innerHTML = html;
    }
    // Edit Mode HTML (此部分**不需**修改價格顯示邏輯，理由同上)
    else {
        let itemsHtml = '';
        booking.items.forEach((item, index) => {
            itemsHtml += `
                <tr class="editable-item-row">
                    <td><input type="text" class="edit-item-name" value="${item.item_name}"></td>
                    <td><input type="number" class="edit-item-qty" value="${item.quantity}" min="1"></td>
                    <td><input type="number" class="edit-item-price" value="${item.price || ''}" min="0"></td>
                </tr>
            `;
        });
        // ... (其餘 Edit Mode HTML 保持不變) ...
         contentEl.innerHTML = `
            <h4>預約資訊 (編輯中)</h4>
            <div id="booking-edit-form" class="details-grid-container">
                 <div><strong>預約單號:</strong> ${booking.booking_id}</div>
                 <div><label>預約日期:</label><input type="text" id="edit-booking-date" value="${booking.booking_date}"></div>
                 <div><label>預約時段:</label><input type="text" id="edit-booking-slot" value="${booking.time_slot}"></div>
                 <div><label>總人數:</label><input type="number" id="edit-booking-people" value="${booking.num_of_people}" min="1"></div>
                 <div><label>預估總金額:</label><input type="number" id="edit-booking-amount" value="${booking.total_amount || ''}" min="0"></div>
                 <div><label>聯絡電話:</label><input type="tel" id="edit-booking-phone" value="${booking.contact_phone || ''}"></div>
            </div>
            <div><label>內部備註:</label><textarea id="edit-booking-notes" rows="3">${booking.notes || ''}</textarea></div>
            <h4>預約項目 (編輯中)</h4>
            <table class="items-table">
                <thead><tr><th>項目名稱</th><th>數量</th><th>單價</th></tr></thead>
                <tbody id="editable-items-tbody">${itemsHtml}</tbody>
            </table>
        `;
         flatpickr("#edit-booking-date", { dateFormat: "Y-m-d" });

    }
}

// --- 修改 handleSaveBookingChanges (編輯儲存) ---
// (BookingItems.price 是使用者在編輯時手動輸入的，無需自動計算)
async function handleSaveBookingChanges(bookingId) {
    const payload = {
        bookingId: bookingId,
        bookingDate: document.getElementById('edit-booking-date').value,
        timeSlot: document.getElementById('edit-booking-slot').value,
        numOfPeople: parseInt(document.getElementById('edit-booking-people').value, 10),
        contactPhone: document.getElementById('edit-booking-phone').value,
        totalAmount: parseFloat(document.getElementById('edit-booking-amount').value) || null,
        notes: document.getElementById('edit-booking-notes').value,
        items: []
    };

    document.querySelectorAll('#editable-items-tbody .editable-item-row').forEach(row => {
        payload.items.push({
            name: row.querySelector('.edit-item-name').value,
            qty: parseInt(row.querySelector('.edit-item-qty').value, 10),
            // --- 直接讀取編輯後的價格 ---
            price: parseFloat(row.querySelector('.edit-item-price').value) || null,
        });
    });

    try {
        await api.updateBookingDetails(payload); // 後端 API 會處理這些欄位
        ui.toast.success('預約更新成功！');
        ui.hideModal('#booking-details-modal');
        await fetchDataAndRender(); // 重新整理列表
    } catch (error) {
        ui.toast.error(`儲存失敗：${error.message}`);
    }
}


// --- 修改 updateItemsSubtotal (手動建立預約時計算小計) ---
function updateItemsSubtotal() {
    let subtotal = 0;
    document.querySelectorAll('.admin-booking-item-row').forEach(row => {
        const qty = parseFloat(row.querySelector('.booking-item-qty').value) || 0;
        // --- 直接讀取價格輸入框的值 ---
        const price = parseFloat(row.querySelector('.booking-item-price').value) || 0;
        subtotal += qty * price;
    });
    const subtotalEl = document.getElementById('items-subtotal');
    const totalAmountInput = document.getElementById('booking-total-amount-input');
    if (subtotalEl) subtotalEl.textContent = `項目小計: $${subtotal}`;
    // --- 同步更新總金額輸入框 ---
    if (totalAmountInput) totalAmountInput.value = subtotal > 0 ? subtotal : ''; // 如果小計是0，清空總金額
}

// --- 修改 addAdminBookingItemRow (手動建立預約時新增項目列) ---
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
        // --- 選項文字顯示平日價格 ---
        const priceText = p.price_weekday !== null ? `$${p.price_weekday} 起` : '洽詢';
        select.add(new Option(`${p.name} - ${priceText}`, p.name));
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

    // --- 事件監聽 ---
    qtyInput.addEventListener('input', updateItemsSubtotal); // 數量變動 -> 更新小計
    priceInput.addEventListener('input', updateItemsSubtotal); // 價格變動 -> 更新小計

    select.addEventListener('change', () => {
        console.log("項目選擇變更:", select.value);
        nameInput.style.display = select.value === 'other' ? 'block' : 'none';
        // ---【修改】呼叫新的 updateItemPrice 函數 ---
        const bookingDateInput = document.getElementById('booking-date-input');
        const bookingDate = bookingDateInput ? bookingDateInput.value : null;
        updateItemPrice(itemRow, bookingDate); // <--- 使用新函數更新價格
        updateItemsSubtotal(); // 更新完價格後，重新計算小計
    });
    // ---【修改】初始設定值與價格計算 ---
    select.value = name; // 嘗試設定初始選擇

    // 如果初始有 name，立即嘗試計算並設定價格
    if (name && name !== 'other') {
        const initialDateInput = document.getElementById('booking-date-input');
        const initialDate = initialDateInput ? initialDateInput.value : null;
         // ---【修改】呼叫新的 updateItemPrice 函數 ---
         updateItemPrice(itemRow, initialDate); // <--- 使用新函數設定初始價格
         console.log(`初始項目: ${name}, 初始日期: ${initialDate}, 計算後價格輸入框值: ${priceInput.value}`);
    } else {
         console.log("addAdminBookingItemRow: 無初始項目名稱，不設定初始價格。");
    }

    removeBtn.addEventListener('click', () => {
        itemRow.remove();
        if (container.children.length < 5) document.getElementById('admin-add-booking-item-btn').style.display = 'block';
        updateItemsSubtotal();
    });

    if (container.children.length >= 5) document.getElementById('admin-add-booking-item-btn').style.display = 'none';
    updateItemsSubtotal();
}


function setSelectedUser(userId, userName) {
    console.log(`setSelectedUser 被呼叫: userId=${userId}, userName=${userName}`);

    // --- ▼▼▼ 修改 ID ▼▼▼ ---
    const selectedUserIdInput = document.getElementById('booking-selected-user-id');
    const selectedUserDisplay = document.getElementById('booking-selected-user-display');
    // --- ▲▲▲ 修改 ID ▲▲▲ ---
    const userSelectionContainer = document.getElementById('user-selection-container');
    const selectedUserView = document.getElementById('selected-user-view');

    if (!selectedUserIdInput || !selectedUserDisplay || !userSelectionContainer || !selectedUserView) {
        console.error("setSelectedUser 錯誤：找不到必要的 UI 元素！");
        ui.toast.error("更新顧客顯示時發生錯誤，請檢查控制台。");
        return;
    }

    selectedUserIdInput.value = userId;
    userSelectionContainer.style.display = 'none';
    selectedUserView.style.display = 'flex';

    // --- ▼▼▼ 使用 setTimeout 延遲設定 textContent ▼▼▼ ---
    setTimeout(() => {
        if(selectedUserDisplay){ // 再次檢查元素是否存在
             selectedUserDisplay.textContent = userName || '名稱錯誤';
             console.log(`(延遲後) setSelectedUser 完成：顯示名稱設為 "${selectedUserDisplay.textContent}"`);
        } else {
             console.error("(延遲後) setSelectedUser 錯誤: selectedUserDisplay 元素消失了！");
        }
    }, 0); // 設定為 0 毫秒，使其在當前同步程式碼執行完畢後立即執行

}

function resetCreateBookingModal() {
    const form = document.getElementById('create-booking-form');
    if (form) form.reset();

    const itemsContainer = document.getElementById('admin-booking-items-container');
    if (itemsContainer) {
        itemsContainer.innerHTML = '';
        addAdminBookingItemRow();
    }

    const selectedUserId = document.getElementById('booking-selected-user-id');
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
    const userSearchInput = document.getElementById('booking-user-search');
    if (!userSearchInput) {
        console.error("initializeCreateBookingModal: 找不到 userSearchInput 元素！");
        return;
    }
    console.log("initializeCreateBookingModal: 執行初始化/重新初始化...");

    // --- 步驟 1: 強制確保 allProducts 已載入 ---
    if (allProducts.length === 0) {
        console.log("initializeCreateBookingModal: allProducts 為空，強制 await api.getProducts()...");
        try {
            allProducts = await api.getProducts(); // 等待 API 完成
            console.log(`initializeCreateBookingModal: 強制獲取了 ${allProducts.length} 個產品。`);
            if (allProducts.length === 0) {
                 console.warn("initializeCreateBookingModal: 獲取的產品列表為空！");
                 ui.toast.error("無法載入預約項目，產品列表為空。");
            }
        } catch (e) {
            console.error("initializeCreateBookingModal: 強制獲取產品失敗", e);
            ui.toast.error(`載入預約項目失敗: ${e.message}`);
            // 如果獲取失敗，後續 addAdminBookingItemRow 的下拉選單會是空的
        }
    } else {
         console.log(`initializeCreateBookingModal: 使用快取的 ${allProducts.length} 個產品。`);
    }

    // --- 步驟 2: 初始化日期選擇器 (並在 onChange 中更新價格) ---
    if (createBookingDatepicker) {
        console.log("initializeCreateBookingModal: 銷毀舊的 createBookingDatepicker 實例。");
        createBookingDatepicker.destroy();
    }
    createBookingDatepicker = flatpickr("#booking-date-input", {
        dateFormat: "Y-m-d",
        onChange: function(selectedDates, dateStr, instance) {
            console.log("日期選擇變更:", dateStr);
            // --- 當日期改變時，更新所有項目列的價格 ---
            document.querySelectorAll('.admin-booking-item-row').forEach(row => {
                // ---【修改】呼叫新的 updateItemPrice 函數 ---
                updateItemPrice(row, dateStr);
            });
            updateItemsSubtotal(); // 重新計算小計
        }
    });
    console.log("initializeCreateBookingModal: Flatpickr 初始化完成。");

    // --- 步驟 3: 初始化時段下拉選單 ---
    const slotSelect = document.getElementById('booking-slot-select');
    if (slotSelect && slotSelect.options.length <= 1) {
        console.log("initializeCreateBookingModal: 初始化時段選項...");
        slotSelect.innerHTML = '<option value="">-- 請選擇時段 --</option>';
        for (let hour = 8; hour <= 22; hour++) {
            ['00', '30'].forEach(minute => {
                const time = `${String(hour).padStart(2, '0')}:${minute}`;
                slotSelect.add(new Option(time, time));
            });
        }
    }

    // --- 步驟 4: 處理使用者搜尋與選擇 (確保事件只綁定一次) ---
// --- 步驟 4: 處理使用者搜尋與選擇 (確保事件只綁定一次) ---
    const userSelect = document.getElementById('booking-user-select');
    if (!userSearchInput.dataset.inputListenerAttached) {
        userSearchInput.addEventListener('input', async (e) => {
            // /* ... 使用者搜尋 API 呼叫 ... */
            // --- ▼▼▼ 補全開始 ▼▼▼ ---
            const query = e.target.value.trim();
            const userSelectElement = document.getElementById('booking-user-select'); // 在事件處理器內重新獲取元素
            if (!userSelectElement) return; // 如果找不到下拉選單元素，則不繼續

            if (query.length < 1) { // 至少輸入1個字才搜尋
                userSelectElement.style.display = 'none';
                userSelectElement.innerHTML = '';
                return;
            }
            try {
                const users = await api.searchUsers(query); // 呼叫 API 搜尋
                userSelectElement.innerHTML = ''; // 清空舊結果
                if (users.length > 0) {
                    userSelectElement.add(new Option('-- 請選擇顧客 --', '')); // 加入預設選項
                    users.forEach(user => {
                        const displayName = user.nickname || user.line_display_name;
                        // 將 user name 存在 option 的 dataset 中，方便後續選取時取得
                        const option = new Option(`${displayName} (${user.user_id.substring(0, 10)}...)`, user.user_id);
                        option.dataset.userName = displayName; // 儲存顯示名稱
                        userSelectElement.add(option);
                    });
                    userSelectElement.style.display = 'block'; // 顯示下拉選單
                } else {
                    userSelectElement.style.display = 'none'; // 沒結果就隱藏
                    // 可以選擇性地提示找不到用戶，或讓用戶直接輸入臨時名稱
                }
            } catch (error) {
                console.error("搜尋顧客失敗:", error);
                ui.toast.error(`搜尋顧客時發生錯誤: ${error.message}`); // 使用 ui.toast 提示錯誤
                userSelectElement.style.display = 'none';
            }
            // --- ▲▲▲ 補全結束 ▲▲▲ ---
        });
        userSearchInput.dataset.inputListenerAttached = 'true';
    }
if (userSelect && !userSelect.dataset.changeListenerAttached) {
        userSelect.addEventListener('change', async () => { // 確認是 async
            const selectedOption = userSelect.options[userSelect.selectedIndex];
            if (selectedOption && selectedOption.value) {
                const userId = selectedOption.value;
                const userName = selectedOption.dataset.userName;
                setSelectedUser(userId, userName); // 呼叫上面修改過的函數

                // --- ▼▼▼ 除錯手機自動帶入 ▼▼▼ ---
                try {
                    console.log(`準備為用戶 ${userId} 獲取詳細資料...`); // <--- 加入日誌
                    const userDetails = await api.getUserDetails(userId);
                    console.log('從 API 獲取的用戶詳細資料:', userDetails); // <--- **重要：檢查 API 回傳的完整內容**

                    // --- **檢查點：確認 userDetails 和 profile 存在** ---
                    if (userDetails && userDetails.profile) {
                        const phoneInput = document.getElementById('booking-phone-input');
                        if (phoneInput) {
                             // --- **檢查點：確認 phone 欄位存在且有值** ---
                            if (userDetails.profile.phone) {
                                phoneInput.value = userDetails.profile.phone;
                                console.log(`已自動填入電話: ${userDetails.profile.phone}`); // <--- 加入日誌
                            } else {
                                console.log(`用戶 ${userId} 的資料中沒有電話號碼。`); // <--- 加入日誌
                                phoneInput.value = ''; // 如果用戶沒存電話，清空輸入框
                            }
                        } else {
                             console.error("找不到電話輸入框 booking-phone-input");
                        }
                    } else {
                         console.warn(`無法從 API 回應中獲取用戶 ${userId} 的 profile 資料。`);
                         // 即使 profile 不存在，也不清空用戶可能手動輸入的電話
                    }
                } catch (error) {
                    console.error(`無法獲取用戶 ${userId} 的詳細資料以自動填入電話:`, error);
                    // API 呼叫失敗時不清空電話，避免覆蓋用戶可能手動輸入的值
                }
                // --- ▲▲▲ 除錯結束 ▲▲▲ ---
            }
        });
        userSelect.dataset.changeListenerAttached = 'true';
    }

     if (!userSearchInput.dataset.blurListenerAttached) {
          userSearchInput.addEventListener('blur', () => {
            /* ... 處理臨時顧客 ... */
            // --- ▼▼▼ 補全開始 (範例：延遲隱藏下拉選單，給使用者點擊的時間) ▼▼▼ ---
            // 使用 setTimeout 避免在點擊下拉選項前就因 blur 而隱藏
            setTimeout(() => {
                const userSelectElement = document.getElementById('booking-user-select');
                // 檢查是否已經選擇了用戶（selected-user-view 是否顯示）
                const isUserSelected = document.getElementById('selected-user-view').style.display === 'flex';
                if (userSelectElement && !isUserSelected) {
                     // 如果下拉選單還在且尚未選擇用戶，可以選擇隱藏它
                     // userSelectElement.style.display = 'none';
                     // 或者保留，讓 handleCreateBookingSubmit 判斷
                     console.log("Blur event on user search input, no user selected from dropdown yet.");
                }
            }, 200); // 延遲 200 毫秒
            // --- ▲▲▲ 補全結束 ▲▲▲ ---
          });
          userSearchInput.dataset.blurListenerAttached = 'true';
     }
     const changeUserBtn = document.getElementById('change-user-btn');
     if (changeUserBtn && !changeUserBtn.dataset.clickListenerAttached) {
          changeUserBtn.addEventListener('click', () => {
            /* ... 更換使用者 ... */
            // --- ▼▼▼ 補全開始 ▼▼▼ ---
            // 重置使用者選擇介面
            document.getElementById('booking-selected-user-id').value = '';
            document.getElementById('booking-selected-user-display').textContent = '';
            document.getElementById('selected-user-view').style.display = 'none';

            // 顯示搜尋輸入框並清空
            const searchInput = document.getElementById('booking-user-search');
            searchInput.value = '';
            document.getElementById('user-selection-container').style.display = 'block';

            // 清空並隱藏下拉選單
            const selectElement = document.getElementById('booking-user-select');
            selectElement.innerHTML = '';
            selectElement.style.display = 'none';

            // (可選) 清空電話
            const phoneInput = document.getElementById('booking-phone-input');
            if(phoneInput) phoneInput.value = '';

            // 讓搜尋框獲得焦點，方便重新輸入
            searchInput.focus();
            // --- ▲▲▲ 補全結束 ▲▲▲ ---
          });
          changeUserBtn.dataset.clickListenerAttached = 'true';
     }

    // --- 步驟 5: 清空舊項目並新增第一行 ---
    const itemsContainer = document.getElementById('admin-booking-items-container');
    if (itemsContainer) {
        console.log("initializeCreateBookingModal: 清空並新增第一行項目...");
        itemsContainer.innerHTML = ''; // 清空舊項目
        addAdminBookingItemRow();      // <--- 在這裡呼叫，確保 allProducts 已載入
        // 確保按鈕可見
        const addBtn = document.getElementById('admin-add-booking-item-btn');
        if (addBtn) addBtn.style.display = 'block';
    } else {
        console.error("initializeCreateBookingModal: 找不到 #admin-booking-items-container 元素！");
    }

    // --- 步驟 6: 綁定 "+新增項目" 按鈕事件 (確保只綁定一次) ---
    const addBtn = document.getElementById('admin-add-booking-item-btn');
    if (addBtn && !addBtn.dataset.listenerAttached) {
        addBtn.addEventListener('click', () => {
            console.log("+ 按鈕被點擊 (in initializeCreateBookingModal)");
            addAdminBookingItemRow();
        });
        addBtn.dataset.listenerAttached = 'true';
        console.log("initializeCreateBookingModal: 成功綁定 +新增項目 按鈕事件。");
    } else if (!addBtn) {
         console.error("initializeCreateBookingModal: 找不到 #admin-add-booking-item-btn 按鈕！");
    }

    console.log("initializeCreateBookingModal: 初始化完成。");
}

// --- 【新增】獨立的更新項目價格函數 ---
function updateItemPrice(itemRowElement, selectedDateString) {
     if (!itemRowElement) return;
     const select = itemRowElement.querySelector('.booking-item-select');
     const priceInput = itemRowElement.querySelector('.booking-item-price');
     if (!select || !priceInput) return; // 確保元素存在

     const selectedProductName = select.value;
     console.log(`updateItemPrice: 項目=${selectedProductName}, 日期=${selectedDateString}`); // 加入日誌

     if (selectedProductName && selectedProductName !== 'other') {
         const selectedProduct = allProducts.find(p => p.name === selectedProductName);
         const actualPrice = selectedProduct ? getPriceForDate(selectedDateString, selectedProduct) : null;
         console.log(`updateItemPrice: 計算價格=${actualPrice}`); // 加入日誌
         priceInput.value = actualPrice !== null ? actualPrice : ''; // 更新價格輸入框
         if (actualPrice === null && selectedProduct) {
             console.warn(`updateItemPrice: 產品 "${selectedProduct.name}" 在日期 ${selectedDateString} 無法確定價格！`);
         }
     } else {
          // 如果是 "其他" 或未選擇，清空價格
          priceInput.value = '';
          console.log("updateItemPrice: 清空價格 (其他或未選)");
     }
}


async function handleCreateBookingSubmit(e) {
    e.preventDefault();
    console.log("handleCreateBookingSubmit 函數觸發"); // 加入日誌

    let finalUserId = document.getElementById('booking-selected-user-id').value;
    let finalContactName = '';
    const isUserSelected = document.getElementById('selected-user-view').style.display === 'flex';

    if (isUserSelected) {
        finalUserId = document.getElementById('booking-selected-user-id').value;
        finalContactName = document.getElementById('booking-selected-user-display').textContent;
         console.log("已選取既有顧客:", finalUserId, finalContactName);
    } else {
        const searchInputText = document.getElementById('booking-user-search').value.trim();
        if (searchInputText) {
            finalUserId = `walk-in-${Date.now()}`;
            finalContactName = searchInputText;
             console.log("建立臨時顧客:", finalUserId, finalContactName);
        } else {
             // 如果沒有選取既有顧客，也沒有輸入臨時名稱，則提示錯誤
             ui.toast.error('請選擇或輸入顧客名稱！');
             return; // 停止執行
        }
    }

    const items = [];
    let calculatedTotalAmount = 0;
    let itemsValid = true;

    document.querySelectorAll('.admin-booking-item-row').forEach(row => {
         if (!itemsValid) return; // 如果前面已有項目無效，則不再處理後續項目

        const select = row.querySelector('.booking-item-select');
        let name = select.value;
        if (name === 'other') {
            name = row.querySelector('.booking-item-name-other').value.trim();
        }
        const qtyInput = row.querySelector('.booking-item-qty');
        const priceInput = row.querySelector('.booking-item-price');

        const qty = parseInt(qtyInput.value, 10);
        const price = parseFloat(priceInput.value); // 直接讀取價格輸入框

        if (name && !isNaN(qty) && qty > 0) {
            // 價格驗證：必須是有效的非負數字
            if (isNaN(price) || price < 0) {
                console.error(`項目 "${name}" 價格無效: ${priceInput.value}`);
                ui.toast.error(`項目 "${name}" 缺少有效的價格！`);
                itemsValid = false; // 標記無效
                return; // 跳過此項目
            }
            items.push({ name, qty, price });
            calculatedTotalAmount += qty * price; // 累加金額
            console.log(`加入項目: ${name}, 數量: ${qty}, 價格: ${price}, 目前小計: ${calculatedTotalAmount}`);
        } else if (name && (isNaN(qty) || qty <= 0)) {
             // 如果選了名稱但數量無效
             ui.toast.error(`項目 "${name}" 的數量無效。`);
             itemsValid = false;
        }
        // 如果沒選 name，則忽略此行
    });

    if (!itemsValid || items.length === 0) {
        if (items.length === 0 && itemsValid) { // 確保不是因為價格錯誤而被攔截
             ui.toast.error('請至少填寫一個有效的預約項目！');
        }
        return; // 如果有項目價格無效或沒有項目，停止提交
    }

    // 獲取其他表單數據
    const bookingDate = document.getElementById('booking-date-input').value;
    const timeSlot = document.getElementById('booking-slot-select').value || null; // 允許空值
    const numOfPeople = document.getElementById('booking-people-input').value;
    const contactPhone = document.getElementById('booking-phone-input').value;
    const notes = document.getElementById('booking-notes-input').value;
    let totalAmount = calculatedTotalAmount; // 預設使用計算值

    // 檢查手動輸入的總金額
    const manualTotalAmountInput = document.getElementById('booking-total-amount-input');
    const manualTotalAmount = parseFloat(manualTotalAmountInput.value);
    if (!isNaN(manualTotalAmount) && manualTotalAmount >= 0 && manualTotalAmount !== calculatedTotalAmount) {
        console.warn("手動輸入的總金額與項目小計不同，將使用手動輸入的值:", manualTotalAmount);
        totalAmount = manualTotalAmount; // 覆蓋計算值
    } else if (isNaN(manualTotalAmount) && manualTotalAmountInput.value.trim() !== '') {
         // 如果輸入了非數字的值
         ui.toast.error('預估總金額必須是有效的數字。');
         return;
    }


    // 基礎驗證 (顧客和日期)
    if (!finalUserId || !bookingDate) {
        ui.toast.error('顧客和預約日期為必填！');
        return;
    }
     // 電話驗證 (如果填寫了)
     if (contactPhone && !/^09\d{8}$/.test(contactPhone)) {
         ui.toast.error('請輸入正確的 10 位手機號碼 (09開頭)，或留空。');
         return;
     }


    const formData = {
        userId: finalUserId,
        bookingDate: bookingDate,
        timeSlot: timeSlot,
        numOfPeople: numOfPeople,
        contactPhone: contactPhone, // 允許空字串或 null
        totalAmount: totalAmount, // 使用最終確定的 totalAmount
        notes: notes,
        contactName: finalContactName,
        items: items,
    };

    console.log("準備提交的 formData:", formData); // 加入日誌

    // API 提交
    try {
        // ---【新增】獲取提交按鈕並禁用 ---
         const submitButton = e.target.querySelector('button[type="submit"]');
         if (submitButton) {
             submitButton.disabled = true;
             submitButton.textContent = '建立中...';
         }

        await api.createBooking(formData);
        ui.toast.success('預約建立成功！');
        ui.hideModal('#create-booking-modal');
        // ---【修正】確保 fetchDataAndRender 呼叫正確 ---
        const activeFilter = document.querySelector('#booking-status-filter .active')?.dataset.filter || 'today';
        await fetchDataAndRender(activeFilter); // 刷新列表

    } catch (error) {
        console.error("建立預約 API 失敗:", error); // 加入詳細錯誤日誌
        ui.toast.error(`建立失敗: ${error.message}`);
         // ---【新增】錯誤時恢復按鈕 ---
          const submitButton = e.target.querySelector('button[type="submit"]');
          if (submitButton) {
              submitButton.disabled = false;
              submitButton.textContent = '確認建立';
          }
    }
}

async function handleSaveBookingSettings() {
    console.log("handleSaveBookingSettings 函數觸發"); // 加入日誌
    if (!bookingDatepicker) {
         console.error("bookingDatepicker 未初始化！");
         ui.toast.error("日期選擇器未就緒，無法儲存。");
         return;
    }
    const saveButton = document.getElementById('save-booking-settings-btn');
    if (!saveButton) {
         console.error("找不到儲存按鈕！");
         return;
    }

    try {
        saveButton.disabled = true;
        saveButton.textContent = '儲存中...';

        // ---【修正】確保 bookingDatepicker.selectedDates 存在且是陣列 ---
        const selectedDates = bookingDatepicker.selectedDates;
        if (!Array.isArray(selectedDates)) {
             throw new Error("無法獲取選擇的日期。");
        }
        const newEnabledDates = selectedDates.map(d => bookingDatepicker.formatDate(d, "Y-m-d"));
        console.log("新選擇的可預約日期:", newEnabledDates);

        // ---【修正】確保 enabledDates 是陣列 ---
        if (!Array.isArray(enabledDates)) {
             console.warn("原始 enabledDates 不是陣列，將其視為空陣列處理。");
             enabledDates = [];
        }
        const originalDates = new Set(enabledDates);
        const newDates = new Set(newEnabledDates);

        // 計算差異
        const datesToAdd = newEnabledDates.filter(d => !originalDates.has(d));
        const datesToRemove = enabledDates.filter(d => !newDates.has(d));
        console.log("待新增日期:", datesToAdd);
        console.log("待移除日期:", datesToRemove);


        const promises = [];
        if (datesToAdd.length > 0) {
             datesToAdd.forEach(date => promises.push(api.saveBookingSettings({ action: 'add', date: date })));
        }
        if (datesToRemove.length > 0) {
             datesToRemove.forEach(date => promises.push(api.saveBookingSettings({ action: 'remove', date: date })));
        }

        // ---【新增】如果沒有任何變更，也提示使用者 ---
        if (promises.length === 0) {
             ui.toast.info("沒有任何日期變更需要儲存。");
        } else {
             console.log(`準備執行 ${promises.length} 個 API 操作...`);
             await Promise.all(promises);
             ui.toast.success('可預約日期已成功儲存！');
             enabledDates = newEnabledDates; // 更新快取的日期
        }

        ui.hideModal('#booking-settings-modal');

    } catch (error) {
        console.error("儲存可預約日期失敗:", error); // 加入詳細錯誤日誌
        ui.toast.error("儲存失敗: " + error.message);
    } finally {
        // 確保按鈕一定會恢復
        saveButton.disabled = false;
        saveButton.textContent = '儲存所有變更';
    }
}



async function openBookingDetailsModal(bookingId) {
    const modal = document.getElementById('booking-details-modal');
    const editBtn = document.getElementById('booking-details-edit-btn');
    if (!modal || !editBtn) return;

    ui.showModal('#booking-details-modal');
    document.getElementById('booking-details-content').innerHTML = '<p>正在載入預約資料...</p>';
    editBtn.textContent = '編輯'; // 重置按鈕文字

    try {
        currentBookingInModal = allBookings.find(b => b.booking_id == bookingId);
        if (!currentBookingInModal) throw new Error('找不到預約資料');

        let userProfile = null;
        if (currentBookingInModal.user_id && !currentBookingInModal.user_id.startsWith('walk-in-')) {
            const userDetails = await api.getUserDetails(currentBookingInModal.user_id);
            userProfile = userDetails.profile;
        }

        renderBookingDetails(currentBookingInModal, userProfile, false); 

        editBtn.onclick = () => {
            const isEditing = editBtn.textContent === '儲存變更';
            if (isEditing) {
                handleSaveBookingChanges(currentBookingInModal.booking_id);
            } else {
                renderBookingDetails(currentBookingInModal, userProfile, true); 
                editBtn.textContent = '儲存變更';
            }
        };

    } catch (error) {
        document.getElementById('booking-details-content').innerHTML = `<p style="color: red;">讀取資料失敗：${error.message}</p>`;
    }
}


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

        row.innerHTML = `
            <td class="compound-cell"><div class="main-info">${booking.booking_date}</div><div class="sub-info">${booking.time_slot}</div></td>
            <td class="compound-cell"><div class="main-info">${booking.contact_name}</div><div class="sub-info">${itemSummary}</div></td>
            <td>${booking.num_of_people}</td>
            <td>${booking.total_amount || 'N/A'}</td>
            <td><span class="status-tag ${statusClass}">${statusText}</span></td>
            <td class="actions-cell">
                <button class="action-btn btn-edit-booking" data-booking-id="${booking.booking_id}" style="background-color: var(--color-primary);">編輯</button>
                <button class="action-btn btn-quick-cancel" data-booking-id="${booking.booking_id}" style="background-color: var(--color-danger);" ${booking.status === 'cancelled' ? 'disabled' : ''}>取消</button>
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



// --- 綁定事件監聽器 (修正後完整版) ---
function setupEventListeners() {
    console.log("setupEventListeners 函數觸發"); // 加入日誌
    const page = document.getElementById('page-bookings');
    // ---【修正】檢查 page 是否存在，以及是否已初始化 ---
    if (!page) {
         console.error("setupEventListeners: 找不到 #page-bookings 元素！");
         return; // 找不到頁面元素，無法繼續
    }
    if (page.dataset.initialized === 'true') {
         console.log("setupEventListeners: 事件已初始化，跳過。");
         return; // 防止重複綁定
    }

    // --- 使用事件委派處理頁面點擊 ---
    page.addEventListener('click', async e => {
        const target = e.target;
        console.log("頁面點擊事件觸發:", target); // 加入日誌

        // --- 取消按鈕 (列表或日曆) ---
        const quickCancelBtn = target.closest('.btn-quick-cancel');
        if (quickCancelBtn) {
            e.stopPropagation(); // 防止觸發外層事件
            const bookingId = quickCancelBtn.dataset.bookingId;
            console.log("點擊快速取消按鈕, bookingId:", bookingId);
            if (!bookingId) {
                 console.error("取消按鈕缺少 bookingId");
                 return;
            }
            const confirmed = await ui.confirm('確定要取消此預約嗎？');
            if (confirmed) {
                try {
                    quickCancelBtn.disabled = true;
                    await api.updateBookingStatus(Number(bookingId), 'cancelled');
                    ui.toast.success('預約已取消');
                    // 重新載入當前篩選條件的數據
                    const activeFilter = document.querySelector('#booking-status-filter .active')?.dataset.filter || 'today';
                    await fetchDataAndRender(activeFilter);
                } catch(err) {
                    console.error("取消預約失敗:", err);
                    ui.toast.error(`錯誤：${err.message}`);
                    quickCancelBtn.disabled = false; // 失敗時恢復按鈕
                }
            }
            return; // 處理完畢
        }

        // --- 點擊看詳情 (日曆項目或列表行) ---
        const calendarBooking = target.closest('.calendar-booking');
        const bookingRow = target.closest('tr[data-booking-id]');
        if (calendarBooking || bookingRow) {
            const bookingId = calendarBooking?.dataset.bookingId || bookingRow?.dataset.bookingId;
             console.log("點擊查看詳情, bookingId:", bookingId);
             if (bookingId) {
                openBookingDetailsModal(bookingId); // 打開詳情 Modal
             } else {
                  console.error("無法從點擊目標獲取 bookingId");
             }
            return; // 處理完畢
        }

        // --- 切換日曆/列表檢視按鈕 ---
        if (target.id === 'switch-to-calendar-view-btn') {
             console.log("點擊切換檢視按鈕");
            const listView = document.getElementById('list-view-container');
            const calendarView = document.getElementById('calendar-view-container');
             // ---【新增】防禦性檢查 ---
             if (!listView || !calendarView) {
                  console.error("找不到 listView 或 calendarView 容器");
                  return;
             }
            const isListVisible = listView.style.display !== 'none';
            listView.style.display = isListVisible ? 'none' : 'block';
            calendarView.style.display = isListVisible ? 'block' : 'none';
            target.textContent = isListVisible ? '切換至列表' : '切換至行事曆';
            fetchDataAndRender(); // 重新載入數據以適應新視圖
             return; // 處理完畢
        }

        // --- 列表狀態篩選按鈕 ---
        const filterButton = target.closest('#booking-status-filter button');
        if (filterButton) {
            console.log("點擊狀態篩選按鈕:", filterButton.dataset.filter);
            document.querySelector('#booking-status-filter .active')?.classList.remove('active');
            filterButton.classList.add('active');
            fetchDataAndRender(filterButton.dataset.filter); // 使用按鈕的 filter 條件載入數據
             return; // 處理完畢
        }

        // --- 手動建立預約按鈕 ---
        if (target.id === 'create-booking-btn') {
            console.log("點擊手動建立預約按鈕");
            resetCreateBookingModal(); // 重置 Modal 內容
            initializeCreateBookingModal(); // 確保 Modal 初始化 (包含事件綁定)
            ui.showModal('#create-booking-modal'); // 顯示 Modal
             return; // 處理完畢
        }

        // --- 管理公休日按鈕 ---
        if (target.id === 'manage-booking-dates-btn') {
            console.log("點擊管理公休日按鈕");
            try {
                enabledDates = await api.getBookingSettings();
                console.log("獲取的可預約日期:", enabledDates);
                if (bookingDatepicker) {
                     console.log("銷毀舊的 bookingDatepicker (管理用)");
                     bookingDatepicker.destroy();
                }
                bookingDatepicker = flatpickr("#booking-datepicker-admin-container", {
                    inline: true, mode: "multiple", dateFormat: "Y-m-d", defaultDate: enabledDates,
                });
                ui.showModal('#booking-settings-modal');
            } catch (error) {
                 console.error("初始化公休日設定失敗:", error);
                 ui.toast.error("初始化公休日設定失敗: " + error.message);
            }
             return; // 處理完畢
        }
    });

    // ---【修正】確保在 setupEventListeners 中只呼叫 initializeCreateBookingModal 一次 ---
    // initializeCreateBookingModal(); // <--- 不在這裡直接呼叫，改為點擊按鈕時呼叫

    // --- 綁定 Modal 表單提交事件 ---
    const createBookingForm = document.getElementById('create-booking-form');
    // ---【修正】使用 dataset 標記防止重複綁定 ---
    if (createBookingForm && !createBookingForm.dataset.submitListenerAttached) {
        createBookingForm.addEventListener('submit', handleCreateBookingSubmit);
        createBookingForm.dataset.submitListenerAttached = 'true';
        console.log("綁定 create-booking-form submit 事件。");
    }

    // --- 綁定儲存公休日按鈕事件 ---
    const saveSettingsBtn = document.getElementById('save-booking-settings-btn');
     // ---【修正】使用 dataset 標記防止重複綁定 ---
    if (saveSettingsBtn && !saveSettingsBtn.dataset.clickListenerAttached) {
        saveSettingsBtn.addEventListener('click', handleSaveBookingSettings);
        saveSettingsBtn.dataset.clickListenerAttached = 'true';
        console.log("綁定 save-booking-settings-btn click 事件。");
    }

    // --- 綁定日曆月份切換按鈕事件 ---
    const prevMonthBtn = document.getElementById('calendar-prev-month-btn');
    // ---【修正】使用 dataset 標記防止重複綁定 ---
    if (prevMonthBtn && !prevMonthBtn.dataset.clickListenerAttached) {
        prevMonthBtn.addEventListener('click', () => {
             console.log("點擊上個月按鈕");
             currentCalendarDate.setMonth(currentCalendarDate.getMonth() - 1);
             updateCalendar(); // 更新日曆顯示
        });
        prevMonthBtn.dataset.clickListenerAttached = 'true';
    }

    const nextMonthBtn = document.getElementById('calendar-next-month-btn');
     // ---【修正】使用 dataset 標記防止重複綁定 ---
    if (nextMonthBtn && !nextMonthBtn.dataset.clickListenerAttached) {
        nextMonthBtn.addEventListener('click', () => {
             console.log("點擊下個月按鈕");
             currentCalendarDate.setMonth(currentCalendarDate.getMonth() + 1);
             updateCalendar(); // 更新日曆顯示
        });
        nextMonthBtn.dataset.clickListenerAttached = 'true';
    }


    // --- 標記頁面事件已初始化 ---
    page.dataset.initialized = 'true';
    console.log("setupEventListeners 完成。");
}

// --- init 函數保持不變 ---
export const init = async () => {
    // ---【修正】確保 setupEventListeners 在 fetchDataAndRender 之前執行 ---
    setupEventListeners(); // 先綁定好所有靜態事件
    await fetchDataAndRender('today'); // 然後載入初始數據
};

