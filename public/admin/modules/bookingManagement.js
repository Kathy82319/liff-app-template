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


// public/admin/modules/bookingManagement.js

async function initializeCreateBookingModal() {
    // --- 【修正】將 addBtn 的事件綁定移到函數末尾，確保 DOM 元素已準備好 ---

    // --- 防止重複初始化 ---
    const userSearchInput = document.getElementById('booking-user-search');
    if (!userSearchInput || userSearchInput.dataset.initialized === 'true') {
        console.log("initializeCreateBookingModal: 已初始化或找不到 userSearchInput，跳過。");
        return;
    }
    console.log("initializeCreateBookingModal: 執行初始化...");


    // --- 獲取產品資料 ---
    try {
        if(allProducts.length === 0) {
             console.log("initializeCreateBookingModal: 正在獲取產品列表...");
             allProducts = await api.getProducts();
             console.log(`initializeCreateBookingModal: 成功獲取 ${allProducts.length} 個產品。`);
        }
    } catch(e) {
         console.error("initializeCreateBookingModal: 無法載入產品列表供預約使用", e);
         // 可以在 Modal 中顯示錯誤提示
    }

    // --- 初始化日期選擇器並加入 onChange 事件 ---
    if (createBookingDatepicker) {
         console.log("initializeCreateBookingModal: 銷毀舊的 createBookingDatepicker 實例。");
         createBookingDatepicker.destroy();
    }
    createBookingDatepicker = flatpickr("#booking-date-input", { // <-- flatpickr 呼叫開始
        dateFormat: "Y-m-d", // 選項 1
        onChange: function(selectedDates, dateStr, instance) { // 選項 2: onChange 開始
            console.log("日期選擇變更:", dateStr); // <--- 加入日誌
            // --- 當日期改變時，更新所有項目列的價格 ---
            document.querySelectorAll('.admin-booking-item-row').forEach(row => { // <-- forEach 開始
                const select = row.querySelector('.booking-item-select');
                const priceInput = row.querySelector('.booking-item-price');
                const selectedProductName = select.value;
                // --- 增加檢查：確保 select 和 priceInput 存在 ---
                if (select && priceInput && selectedProductName && selectedProductName !== 'other') { // <-- if 開始
                    const selectedProduct = allProducts.find(p => p.name === selectedProductName);
                    const actualPrice = selectedProduct ? getPriceForDate(dateStr, selectedProduct) : null;
                    priceInput.value = actualPrice !== null ? actualPrice : '';
                    console.log(`更新項目 "${selectedProductName}" 價格為: ${priceInput.value}`); // <--- 加入日誌
                } // <-- if 結束
            }); // <-- forEach 結束
            updateItemsSubtotal(); // 日期變了，重新計算所有項目的小計
        } // <-- onChange 函數結束
        // ---【關鍵修正】確保這裡沒有多餘的逗號 ---
    }); // <-- flatpickr 呼叫結束
    console.log("initializeCreateBookingModal: Flatpickr 初始化完成。");


    // --- 初始化時段下拉選單 (如果尚未初始化) ---
    const slotSelect = document.getElementById('booking-slot-select');
    if (slotSelect && slotSelect.options.length <= 1) { // 避免重複添加選項
         console.log("initializeCreateBookingModal: 初始化時段選項...");
         slotSelect.innerHTML = '<option value="">-- 請選擇時段 --</option>'; // 清空並加入預設
         for (let hour = 8; hour <= 22; hour++) {
             ['00', '30'].forEach(minute => {
                 const time = `${String(hour).padStart(2, '0')}:${minute}`;
                 slotSelect.add(new Option(time, time));
             });
         }
    }


    // --- 使用者搜尋與選擇邏輯 (保持不變) ---
    const userSelect = document.getElementById('booking-user-select');
    // 檢查事件是否已綁定，避免重複
    if (!userSearchInput.dataset.inputListenerAttached) {
        userSearchInput.addEventListener('input', async (e) => {
             const query = e.target.value;
             // console.log("搜尋觸發:", query); // 可以保留或移除
             if (query.length < 1) { /* ... 清空下拉選單 ... */ return; }
             try {
                 const users = await api.searchUsers(query);
                 // console.log("API 回應:", users); // 可以保留或移除
                 userSelect.innerHTML = '';
                 if (users.length > 0) {
                     users.forEach(u => {
                         const displayName = u.nickname || u.line_display_name;
                         const option = new Option(`${displayName} (${u.user_id.substring(0, 10)}...)`, u.user_id);
                         option.dataset.userName = displayName;
                         option.dataset.userPhone = u.phone || '';
                         userSelect.add(option);
                     });
                     userSelect.style.display = 'block';
                 } else { userSelect.style.display = 'none'; }
             } catch (error) { console.error('搜尋使用者失敗:', error); userSelect.style.display = 'none'; }
        });
        userSearchInput.dataset.inputListenerAttached = 'true';
    }

    if (userSelect && !userSelect.dataset.changeListenerAttached) {
        userSelect.addEventListener('change', () => {
             const selectedValue = userSelect.value;
             if (selectedValue) {
                 const selectedOption = userSelect.options[userSelect.selectedIndex];
                 setSelectedUser(selectedValue, selectedOption.dataset.userName);
                 document.getElementById('booking-phone-input').value = selectedOption.dataset.userPhone || '';
                 userSelect.style.display = 'none';
             }
        });
        userSelect.dataset.changeListenerAttached = 'true';
    }

     if (!userSearchInput.dataset.blurListenerAttached) {
          userSearchInput.addEventListener('blur', () => {
               setTimeout(() => {
                    const isUserSelected = document.getElementById('selected-user-view').style.display === 'flex';
                    const inputText = userSearchInput.value.trim();
                    if (userSelect.style.display === 'block' || isUserSelected || !inputText) { return; }
                    const tempUserId = `walk-in-${Date.now()}`;
                    setSelectedUser(tempUserId, inputText);
                    document.getElementById('booking-phone-input').value = '';
               }, 200);
          });
          userSearchInput.dataset.blurListenerAttached = 'true';
     }

     const changeUserBtn = document.getElementById('change-user-btn');
     if (changeUserBtn && !changeUserBtn.dataset.clickListenerAttached) {
          changeUserBtn.addEventListener('click', () => {
               document.getElementById('selected-user-id').value = '';
               document.getElementById('selected-user-view').style.display = 'none';
               document.getElementById('user-selection-container').style.display = 'block';
               userSearchInput.value = '';
               document.getElementById('booking-phone-input').value = '';
               userSearchInput.focus();
          });
          changeUserBtn.dataset.clickListenerAttached = 'true';
     }


    // --- 【修正】確保新增項目按鈕事件綁定 ---
    const addBtn = document.getElementById('admin-add-booking-item-btn');
    if (addBtn && !addBtn.dataset.listenerAttached) {
        addBtn.addEventListener('click', () => {
            console.log("+ 按鈕被點擊 (in initializeCreateBookingModal)");
            addAdminBookingItemRow();
        });
        addBtn.dataset.listenerAttached = 'true'; // 標記已綁定
        console.log("initializeCreateBookingModal: 成功綁定 +新增項目 按鈕事件。");
    } else if (addBtn && addBtn.dataset.listenerAttached) {
         console.log("initializeCreateBookingModal: +新增項目 按鈕事件已綁定，跳過。");
    } else if (!addBtn) {
        console.error("initializeCreateBookingModal: 找不到 #admin-add-booking-item-btn 按鈕！");
    }

    // --- 標記已初始化 ---
    userSearchInput.dataset.initialized = 'true';
    console.log("initializeCreateBookingModal: 初始化完成。");
}


// --- 修改 handleCreateBookingSubmit 函數 ---
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
    let calculatedTotalAmount = 0; // 新增：計算總金額
    let itemsValid = true;

    document.querySelectorAll('.admin-booking-item-row').forEach(row => {
        const select = row.querySelector('.booking-item-select');
        let name = select.value;
        if (name === 'other') {
            name = row.querySelector('.booking-item-name-other').value.trim();
        }
        const qty = parseInt(row.querySelector('.booking-item-qty').value, 10);
        // --- 直接讀取價格輸入框 ---
        const price = parseFloat(row.querySelector('.booking-item-price').value);

        if (name && !isNaN(qty) && qty > 0) {
            // --- 價格驗證 ---
            if (isNaN(price) || price < 0) {
                 ui.toast.error(`項目 "${name}" 缺少有效的價格！`);
                 itemsValid = false;
                 return; // 跳過此項目
            }
            items.push({ name, qty, price });
            calculatedTotalAmount += qty * price; // 累加金額
        }
    });

    if (!itemsValid || items.length === 0) {
        if (items.length === 0) ui.toast.error('請至少填寫一個預約項目！');
        return; // 如果有項目價格無效或沒有項目，停止提交
    }

    const formData = {
        userId: finalUserId,
        bookingDate: document.getElementById('booking-date-input').value,
timeSlot: document.getElementById('booking-slot-select').value || null, // 如果沒選，傳 null
        numOfPeople: document.getElementById('booking-people-input').value,
        contactPhone: document.getElementById('booking-phone-input').value,
        // --- 使用計算出的小計作為預設總金額 ---
        totalAmount: calculatedTotalAmount, // 使用計算值
        notes: document.getElementById('booking-notes-input').value,
        contactName: finalContactName,
        items: items, // items 陣列已包含 price
    };

    // --- 可選：如果總金額輸入框有值，且與計算值不同，可能需要提示或使用輸入框的值 ---
     const manualTotalAmount = parseFloat(document.getElementById('booking-total-amount-input').value);
     if (!isNaN(manualTotalAmount) && manualTotalAmount !== calculatedTotalAmount) {
         console.warn("手動輸入的總金額與項目小計不同，將使用手動輸入的值。");
         formData.totalAmount = manualTotalAmount;
     }


    if (!formData.userId || !formData.bookingDate) { // 只檢查 userId 和 bookingDate
        ui.toast.error('顧客和預約日期為必填！');
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

        renderBookingDetails(currentBookingInModal, userProfile, false); // 初始為 View mode

        // --- 核心編輯邏輯 ---
        editBtn.onclick = () => {
            const isEditing = editBtn.textContent === '儲存變更';
            if (isEditing) {
                handleSaveBookingChanges(currentBookingInModal.booking_id);
            } else {
                renderBookingDetails(currentBookingInModal, userProfile, true); // 切換到 Edit mode
                editBtn.textContent = '儲存變更';
            }
        };

    } catch (error) {
        document.getElementById('booking-details-content').innerHTML = `<p style="color: red;">讀取資料失敗：${error.message}</p>`;
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

    initializeCreateBookingModal(
    userSearchInput.addEventListener('input', async (e) => {
    const query = e.target.value;
    console.log("搜尋觸發:", query); // <--- 加入日誌
    if (query.length < 1) {
        userSelect.style.display = 'none';
        userSelect.innerHTML = ''; // 清空選項
        return;
    }
    try {
        console.log("呼叫 API: /api/admin/user-search?q=" + encodeURIComponent(query)); // <--- 加入日誌
        const users = await api.searchUsers(query);
        console.log("API 回應:", users); // <--- 加入日誌
        userSelect.innerHTML = '';
        if (users.length > 0) {
            // ... (產生選項的邏輯) ...
             users.forEach(u => { /* ... */ });
            userSelect.style.display = 'block';
        } else {
            userSelect.style.display = 'none';
        }
    } catch (error) {
        console.error('搜尋使用者失敗:', error); // <--- 確認錯誤有被印出
        userSelect.style.display = 'none';
    }
    });
); 
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
