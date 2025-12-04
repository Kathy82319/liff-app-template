// public/modules/pages/booking.js (v13.0 - Fix Router Error + Full Config Support)
import { api } from '../api.js';
import { state } from '../state.js';
import { router } from '../router.js';
import { ui } from '../ui.js';

let isSubmitting = false;
let flatpickrInstance = null;

// 預約資料暫存 (通用)
let bookingPayload = {
    date: null,
    startDate: null,
    endDate: null,
    timeSlot: null,
    items: [],
    people: 1
};

// 民宿模式專用暫存
let guesthouseData = { 
    roomAvailability: {}, 
    selectedRooms: {}, 
    numberOfNights: 0
};

// =================================================================
// 1. 初始化預約頁面 (Entry Point)
// =================================================================
export async function init() {
    console.log("[Booking Init] Starting...");
    const clientConfig = state.config?.client_config || {};
    const bookingConfig = clientConfig.booking || {};
    
    // 1. 設定頁面標題
    const pageTitle = document.querySelector('#page-booking .page-main-title');
    if (pageTitle) pageTitle.textContent = bookingConfig.page_title || '線上預約';

    // 2. 綁定「查看我的預約」按鈕
    const viewBtn = document.getElementById('view-my-bookings-btn');
    if (viewBtn) {
        viewBtn.textContent = clientConfig.profile?.label_records || '查看我的預約';
        const newBtn = viewBtn.cloneNode(true);
        viewBtn.parentNode.replaceChild(newBtn, viewBtn);
        newBtn.addEventListener('click', () => router.navigate('page-my-records'));
    }

    // 3. 確保產品資料已載入
    if (state.allProducts.length === 0) {
        try { state.allProducts = await api.getProducts(); } 
        catch(e) { console.error("無法載入產品", e); }
    }

    // 4. UI 顯示控制
    setupFieldVisibility(bookingConfig);

    // 5. 預填資料
    await prefillUserData(bookingConfig);

    // 6. 綁定確認按鈕
    const confirmBtn = document.getElementById('confirm-booking-btn');
    if (confirmBtn) {
        const newBtn = confirmBtn.cloneNode(true);
        confirmBtn.parentNode.replaceChild(newBtn, confirmBtn);
        newBtn.addEventListener('click', () => handleBookingConfirmation(bookingConfig));
    }

    // 7. 初始化日曆 (核心分歧)
    if (bookingConfig.mode === 'range') {
        await initializeDateRangePicker(bookingConfig);
    } else {
        await initializeSingleDatePicker(bookingConfig);
    }
}

// =================================================================
// 2. UI 初始化與欄位控制
// =================================================================
function setupFieldVisibility(config) {
    const peopleGroup = document.getElementById('booking-people-group');
    if (peopleGroup) {
        peopleGroup.style.display = config.enable_people_count ? 'block' : 'none';
        if (!config.enable_people_count) document.getElementById('booking-people-input').value = 1;
    }

    const notesGroup = document.getElementById('booking-notes-group');
    if (notesGroup) notesGroup.style.display = config.enable_notes ? 'block' : 'none';

    const storedValueGroup = document.getElementById('stored-value-payment-group');
    if (storedValueGroup) storedValueGroup.style.display = config.enable_stored_value_payment ? 'block' : 'none';

    const dateLabel = document.querySelector('label[for="booking-date-picker"]');
    if (dateLabel) dateLabel.textContent = (config.mode === 'range') ? '入住 / 退房日期:' : '預約日期:';
}

async function prefillUserData(config) {
    try {
        if (state.userProfile?.userId) {
            const userData = await api.getUserProfile(state.userProfile.userId);
            if (userData) {
                const nameInput = document.getElementById('contact-name');
                const phoneInput = document.getElementById('contact-phone');
                if (nameInput) nameInput.value = userData.real_name || state.userProfile.displayName || '';
                if (phoneInput) phoneInput.value = userData.phone || '';
                if (config.enable_stored_value_payment) setupStoredValueLogic(userData.stored_value_balance || 0);
            }
        }
    } catch(e) { console.warn(e); }
}

function setupStoredValueLogic(balance) {
    const display = document.getElementById('stored-value-balance-display');
    const checkbox = document.getElementById('use-stored-value-checkbox');
    if (display) {
        display.textContent = `(餘額: $${balance})`;
        if (checkbox) {
            checkbox.disabled = balance <= 0;
            checkbox.checked = false;
            display.style.color = balance <= 0 ? '#999' : 'var(--color-primary)';
            
            const newCheckbox = checkbox.cloneNode(true);
            checkbox.parentNode.replaceChild(newCheckbox, checkbox);
            newCheckbox.addEventListener('change', (e) => {
                if (e.target.checked) {
                    const total = calculateTotalPrice();
                    if (total <= 0) { alert("請先選擇預約項目"); e.target.checked = false; return; }
                    if (balance < total) { alert(`餘額不足 ($${balance})`); e.target.checked = false; return; }
                    if (!confirm("確認使用儲值金付款？")) e.target.checked = false;
                }
            });
        }
    }
}

// =================================================================
// 3. 預約詳情渲染 (新增函式，修復 Router 錯誤)
// =================================================================
export async function renderBookingDetails(bookingId) {
    const container = document.getElementById('booking-details-content-container');
    const loadingEl = document.getElementById('booking-details-loading');
    
    // 欄位元素
    const elId = document.getElementById('details-booking-id');
    const elCheckIn = document.getElementById('details-check-in-date');
    const elCheckOut = document.getElementById('details-check-out-date');
    const elNights = document.getElementById('details-nights');
    const elItemsList = document.getElementById('details-items-list');
    const elTotal = document.getElementById('details-total-amount');
    const elPolicy = document.getElementById('details-cancellation-policy');
    const elInstructions = document.getElementById('details-check-in-instructions');
    const cancelBtn = document.getElementById('details-cancel-booking-btn');

    if (!container || !loadingEl) return;

    container.style.display = 'none';
    loadingEl.style.display = 'block';

    try {
        // 1. 取得預約資料與政策
        const [bookingList, policyData] = await Promise.all([
            api.getBookingById(state.userProfile.userId, bookingId), 
            api.getBookingPolicy()
        ]);
        const booking = bookingList[0];
        if (!booking) throw new Error("找不到該筆預約資料");

        // 2. 根據設定判斷顯示模式
        const config = state.config?.client_config?.booking || {};
        const isGuesthouse = (config.mode === 'range');

        // 3. 填入資料
        if(elId) elId.textContent = `#${String(booking.booking_id).padStart(5, '0')}`;
        
        // 日期顯示邏輯
        if(elCheckIn) elCheckIn.textContent = booking.booking_date;
        
        if (isGuesthouse) {
            // 民宿：顯示退房日與晚數
            if(elCheckOut) {
                elCheckOut.textContent = booking.check_out_date || '-';
                elCheckOut.parentElement.style.display = 'block';
            }
            if(elNights) {
                const start = new Date(booking.booking_date);
                const end = new Date(booking.check_out_date);
                const nights = Math.round((end - start) / 86400000);
                elNights.textContent = nights > 0 ? nights : '-';
                elNights.parentElement.style.display = 'block';
            }
        } else {
            // 工作室：隱藏退房日與晚數，若有時段則顯示在日期旁
            if(elCheckOut) elCheckOut.parentElement.style.display = 'none';
            if(elNights) elNights.parentElement.style.display = 'none';
            if(booking.time_slot && elCheckIn) elCheckIn.textContent += ` ${booking.time_slot}`;
        }

        // 項目列表
        if(elItemsList) {
            elItemsList.innerHTML = (booking.items || []).map(item => `
                <div class="room-item-row" style="display:flex; justify-content:space-between; border-bottom:1px dashed #eee; padding:5px 0;">
                    <span>${item.item_name} x ${item.quantity}</span>
                    <span>$${item.price || '-'}</span>
                </div>
            `).join('');
        }

        if(elTotal) elTotal.textContent = booking.total_amount ? `$${booking.total_amount}` : '-';
        
        // 政策顯示
        if(elPolicy) elPolicy.textContent = policyData.cancellationPolicy || '無';
        if(elInstructions) elInstructions.textContent = policyData.checkInInstructions || '無';

        // 取消按鈕邏輯
        if (cancelBtn) {
            if (booking.status === 'confirmed') {
                cancelBtn.style.display = 'block';
                const newCancelBtn = cancelBtn.cloneNode(true);
                cancelBtn.parentNode.replaceChild(newCancelBtn, cancelBtn);
                newCancelBtn.addEventListener('click', async () => {
                    if (confirm('確定要取消此預約嗎？')) {
                        try {
                            newCancelBtn.disabled = true;
                            newCancelBtn.textContent = '取消中...';
                            await api.cancelBooking(booking.booking_id, state.userProfile.userId);
                            ui.toast('預約已取消', 'success');
                            router.navigate('page-my-records');
                        } catch (err) {
                            ui.toast(`取消失敗: ${err.message}`, 'error');
                            newCancelBtn.disabled = false;
                            newCancelBtn.textContent = '取消預約';
                        }
                    }
                });
            } else {
                cancelBtn.style.display = 'none';
            }
        }

        loadingEl.style.display = 'none';
        container.style.display = 'block';

    } catch (e) {
        loadingEl.innerHTML = `<p style="color:red;">載入失敗: ${e.message}</p>`;
    }
}

// =================================================================
// 4. 模式 A: 日期區間模式 (Range Mode - 民宿邏輯)
// =================================================================
async function initializeDateRangePicker(config) {
    const pickerInput = document.getElementById('booking-date-picker');
    const itemSelectionSection = document.getElementById('booking-item-selection-section');
    const guesthouseContainer = document.getElementById('guesthouse-room-container');
    const studioContainer = document.getElementById('studio-item-container');
    const timeSlotContainer = document.getElementById('booking-time-slot-container');

    if (itemSelectionSection) itemSelectionSection.style.display = 'block';
    if (guesthouseContainer) guesthouseContainer.style.display = 'block';
    if (studioContainer) studioContainer.style.display = 'none';
    if (timeSlotContainer) timeSlotContainer.style.display = 'none';

    guesthouseData = { startDate: null, endDate: null, numberOfNights: 0, roomAvailability: {}, selectedRooms: {} };
    renderGuesthouseRooms(null);

    if (flatpickrInstance) flatpickrInstance.destroy();
    
    flatpickrInstance = flatpickr(pickerInput, {
        mode: "range", minDate: "today", dateFormat: "Y-m-d", locale: "zh_tw", disableMobile: true,
        placeholder: "請點擊選擇入住與退房日期",
        onClose: async (selectedDates) => {
            if (selectedDates.length === 2) {
                const start = selectedDates[0];
                const end = selectedDates[1];
                if (start.getTime() === end.getTime()) { ui.toast("退房日期必須晚於入住日期", "warning"); pickerInput.clear(); return; }

                guesthouseData.startDate = flatpickr.formatDate(start, "Y-m-d");
                guesthouseData.endDate = flatpickr.formatDate(end, "Y-m-d");
                guesthouseData.numberOfNights = Math.round((end - start) / 86400000);

                guesthouseContainer.style.opacity = '0.5';
                try {
                    const data = await api.checkRoomAvailability(guesthouseData.startDate, guesthouseData.endDate);
                    guesthouseContainer.style.opacity = '1';
                    renderGuesthouseRooms(data);
                } catch (e) {
                    guesthouseContainer.style.opacity = '1';
                    ui.toast("查詢房況失敗", "error");
                }
            } else {
                guesthouseData.startDate = null; renderGuesthouseRooms(null); calculateTotalPrice();
            }
        }
    });
}

function renderGuesthouseRooms(availabilityData) {
    const container = document.getElementById('guesthouse-room-container');
    const isPreview = !availabilityData;
    guesthouseData.roomAvailability = availabilityData || {};
    if (!isPreview) guesthouseData.selectedRooms = {};

    const products = state.allProducts.filter(p => p.is_visible);
    if (products.length === 0) { container.innerHTML = '<p style="text-align:center;">目前無可預訂房型。</p>'; return; }

    let hasBookable = false;
    container.innerHTML = products.map(p => {
        let priceHtml = p.price_weekday !== null ? `$${p.price_weekday} <span style="font-size:0.8em; color:#888;">起 / 晚</span>` : '洽詢';
        let maxQty = 0;
        let isDisabled = true;
        let statusHtml = '';

        if (!isPreview) {
            const info = availabilityData[p.product_id];
            if (info && info.isAvailable) {
                maxQty = info.minAvailableQuantity || 0;
                const avgPrice = info.pricePerNight !== null ? `$${info.pricePerNight}` : '洽詢';
                const totalPrice = info.totalPrice !== null ? `$${info.totalPrice}` : null;
                priceHtml = totalPrice 
                    ? `<div style="font-weight:bold;">${avgPrice} <span style="font-size:0.8em; color:#888; font-weight:normal;">/ 晚</span></div>
                       <div style="font-size:0.9rem; color:var(--color-primary); font-weight:bold; margin-top:2px;">${guesthouseData.numberOfNights}晚 小計 $${totalPrice}</div>`
                    : `${avgPrice} <span style="font-size:0.8em; color:#888;">/ 晚</span>`;
                isDisabled = false;
                hasBookable = true;
            } else {
                statusHtml = '<span style="color:var(--color-danger); font-size:0.85rem;">🚫 已售完 / 未開放</span>';
            }
        } else {
            statusHtml = '<span style="font-size:0.85rem; color: var(--color-primary);">← 請先選擇日期</span>';
        }

        let img = 'https://placehold.co/100x100?text=No+Image';
        try { const images = JSON.parse(p.images || '[]'); if (images.length > 0) img = images[0]; } catch(e) {}
        let opts = '<option value="0">0</option>';
        for(let i=1; i<=maxQty; i++) opts += `<option value="${i}">${i}</option>`;

        return `
        <div class="room-item" style="${isDisabled && !isPreview ? 'opacity:0.6; background:#eee;' : ''}">
            <img src="${img}" class="room-thumb">
            <div class="room-content"><div class="room-name">${p.name}</div><div class="room-price">${priceHtml}</div>${statusHtml}</div>
            <div class="room-controls"><select class="room-qty-select" data-pid="${p.product_id}" ${isDisabled ? 'disabled' : ''} style="padding: 5px;">${opts}</select>${!isDisabled ? `<span class="room-stock-badge">剩 ${maxQty} 間</span>` : ''}</div>
        </div>`;
    }).join('');

    container.querySelectorAll('.room-qty-select').forEach(sel => {
        sel.addEventListener('change', (e) => {
            const qty = parseInt(e.target.value);
            if (qty > 0) guesthouseData.selectedRooms[e.target.dataset.pid] = qty;
            else delete guesthouseData.selectedRooms[e.target.dataset.pid];
            calculateTotalPrice();
        });
    });
    if (!isPreview && !hasBookable) container.innerHTML += '<p style="text-align:center; color:var(--color-danger);">抱歉，此日期區間已無空房。</p>';
    calculateTotalPrice();
}

// =================================================================
// 5. 模式 B: 單一日期模式 (Single Mode - 工作室邏輯)
// =================================================================
async function initializeSingleDatePicker(config) {
    const pickerInput = document.getElementById('booking-date-picker');
    const itemSelectionSection = document.getElementById('booking-item-selection-section');
    const guesthouseContainer = document.getElementById('guesthouse-room-container');
    const studioContainer = document.getElementById('studio-item-container');
    const timeSlotContainer = document.getElementById('booking-time-slot-container');

    if (itemSelectionSection) itemSelectionSection.style.display = 'none';
    if (guesthouseContainer) guesthouseContainer.style.display = 'none';
    if (timeSlotContainer) {
        timeSlotContainer.style.display = config.enable_time_slots ? 'block' : 'none';
        if (!config.enable_time_slots) {
            itemSelectionSection.style.display = 'block';
            if (studioContainer) studioContainer.style.display = 'block';
        }
    }

    bookingPayload = { date: null, timeSlot: null, items: [], people: 1 };
    renderStudioItems(config); 

    if (flatpickrInstance) flatpickrInstance.destroy();
    let enabledDates = [];
    try { const res = await api.getBookingsCheckInit(); enabledDates = res?.enabledDates || []; } catch(e) {}

    flatpickrInstance = flatpickr(pickerInput, {
        mode: "single", minDate: "today", dateFormat: "Y-m-d", locale: "zh_tw", disableMobile: true,
        placeholder: "請點擊選擇預約日期",
        enable: enabledDates.length > 0 ? enabledDates : undefined,
        onChange: (selected, dateStr) => {
            bookingPayload.date = dateStr;
            if (config.enable_time_slots) {
                renderTimeSlots(dateStr, config.time_slot_config);
                if (itemSelectionSection) itemSelectionSection.style.display = 'none';
            } else {
                if (itemSelectionSection) itemSelectionSection.style.display = 'block';
                if (studioContainer) studioContainer.style.display = 'block';
                updateStudioItemsPrice(dateStr);
            }
        }
    });
}

function renderTimeSlots(dateStr, slotConfig) {
    const container = document.getElementById('time-slot-buttons');
    const itemSection = document.getElementById('booking-item-selection-section');
    const studioContainer = document.getElementById('studio-item-container');
    if (!container) return;
    container.innerHTML = '';
    
    const startStr = slotConfig?.start || "09:00";
    const endStr = slotConfig?.end || "21:00";
    const interval = slotConfig?.interval || 60;

    const [startH, startM] = startStr.split(':').map(Number);
    const [endH, endM] = endStr.split(':').map(Number);
    const startTime = new Date(); startTime.setHours(startH, startM, 0, 0);
    const endTime = new Date(); endTime.setHours(endH, endM, 0, 0);
    const now = new Date();
    const isToday = now.toDateString() === new Date(dateStr + 'T00:00:00').toDateString();

    let currentTime = new Date(startTime);
    let hasSlots = false;

    while (currentTime < endTime) {
        hasSlots = true;
        const timeString = currentTime.toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit', hour12: false });
        let isDisabled = isToday && currentTime <= now;

        const btn = document.createElement('button');
        btn.textContent = timeString;
        btn.className = 'time-slot-btn'; // CSS 需支援
        btn.type = 'button';
        btn.style.cssText = `padding: 10px; border: 1px solid ${isDisabled?'#eee':'var(--color-secondary)'}; border-radius: 8px; background: ${isDisabled?'#f5f5f5':'#fff'}; color: ${isDisabled?'#ccc':'var(--color-text-primary)'}; cursor: ${isDisabled?'not-allowed':'pointer'};`;
        
        if (isDisabled) btn.disabled = true;
        else {
            btn.onclick = () => {
                container.querySelectorAll('button').forEach(b => { b.style.backgroundColor='#fff'; b.style.color='var(--color-text-primary)'; b.style.borderColor='var(--color-secondary)'; });
                btn.style.backgroundColor = 'var(--color-primary)'; btn.style.color = '#fff'; btn.style.borderColor = 'var(--color-primary)';
                bookingPayload.timeSlot = timeString;
                if (itemSection) itemSection.style.display = 'block';
                if (studioContainer) studioContainer.style.display = 'block';
                setTimeout(() => itemSection.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100);
                updateStudioItemsPrice(dateStr);
            };
        }
        container.appendChild(btn);
        currentTime.setMinutes(currentTime.getMinutes() + interval);
    }
    if (!hasSlots) container.innerHTML = '<p style="color:#999;">本日無可預約時段。</p>';
}

function renderStudioItems(config) {
    const container = document.getElementById('booking-items-list');
    const addBtn = document.getElementById('add-studio-item-btn');
    if (!container) return;
    container.innerHTML = '';
    const enableQty = config.enable_quantity !== false;

    window.addStudioItemRow = () => {
        if (container.children.length >= 5) { ui.toast("最多選擇 5 個項目", "warning"); return; }
        const itemRow = document.createElement('div');
        itemRow.className = 'booking-item-row';
        itemRow.style.cssText = 'display:flex; gap:10px; margin-bottom:10px; align-items:center;';
        
        const select = document.createElement('select');
        select.className = 'booking-item-select';
        select.style.flexGrow = '1';
        select.add(new Option('-- 請選擇項目 --', ''));
        state.allProducts.filter(p => p.is_visible).forEach(p => select.add(new Option(p.name, p.product_id)));

        const qtyInput = document.createElement('input');
        qtyInput.type = 'number';
        qtyInput.className = 'booking-item-qty';
        qtyInput.value = 1;
        qtyInput.min = 1;
        qtyInput.style.cssText = enableQty ? 'width:60px;' : 'display:none;';

        const priceDisplay = document.createElement('span');
        priceDisplay.className = 'booking-item-price-hint';
        priceDisplay.style.cssText = 'font-size:0.8rem; color:#666; min-width:50px; text-align:right;';

        const removeBtn = document.createElement('button');
        removeBtn.textContent = '✕';
        removeBtn.style.cssText = 'background:var(--color-danger); border:none; color:white; border-radius:4px; width:30px; height:30px; cursor:pointer;';
        removeBtn.onclick = () => { itemRow.remove(); calculateTotalPrice(); };

        select.addEventListener('change', () => { updateRowPrice(itemRow, select.value, bookingPayload.date); calculateTotalPrice(); });
        qtyInput.addEventListener('change', calculateTotalPrice);

        itemRow.append(select, qtyInput, priceDisplay, removeBtn);
        container.appendChild(itemRow);
    };

    if (addBtn) {
        const newAddBtn = addBtn.cloneNode(true);
        addBtn.parentNode.replaceChild(newAddBtn, addBtn);
        newAddBtn.addEventListener('click', window.addStudioItemRow);
    }
    window.addStudioItemRow();
}

function updateRowPrice(row, productId, dateStr) {
    const priceDisplay = row.querySelector('.booking-item-price-hint');
    const product = state.allProducts.find(p => p.product_id === productId);
    if (product) {
        const price = getPriceForDate(dateStr, product);
        if (price !== null) { priceDisplay.textContent = `$${price}`; row.dataset.price = price; }
        else { priceDisplay.textContent = '(價格未定)'; row.dataset.price = 0; }
    } else {
        priceDisplay.textContent = ''; row.dataset.price = 0;
    }
}

function updateStudioItemsPrice(dateStr) {
    document.querySelectorAll('.booking-item-row').forEach(row => {
        const select = row.querySelector('.booking-item-select');
        if (select && select.value) updateRowPrice(row, select.value, dateStr);
    });
    calculateTotalPrice();
}

function getPriceForDate(dateString, product) {
    if (!product) return null;
    if (!dateString) return product.price_weekday || null;
    const date = new Date(dateString + 'T00:00:00');
    const dayOfWeek = date.getDay();
    if (dayOfWeek === 5) return product.price_friday !== null ? product.price_friday : product.price_weekday;
    else if (dayOfWeek === 6) return product.price_saturday !== null ? product.price_saturday : product.price_weekday;
    else return product.price_weekday !== null ? product.price_weekday : null;
}

// =================================================================
// 6. 計算與送出
// =================================================================
function calculateTotalPrice() {
    let total = 0;
    const mode = state.config?.client_config?.booking?.mode;
    if (mode === 'range') {
        if (guesthouseData.numberOfNights > 0) {
            for (const pid in guesthouseData.selectedRooms) {
                const qty = guesthouseData.selectedRooms[pid];
                const info = guesthouseData.roomAvailability[pid];
                if (qty > 0 && info) {
                    const price = info.totalPrice !== null ? info.totalPrice : (info.pricePerNight * guesthouseData.numberOfNights);
                    total += price * qty;
                }
            }
        }
    } else {
        document.querySelectorAll('.booking-item-row').forEach(row => {
            const qtyInput = row.querySelector('.booking-item-qty');
            const price = parseFloat(row.dataset.price) || 0;
            const qty = qtyInput ? (parseInt(qtyInput.value) || 1) : 1;
            total += qty * price;
        });
    }
    const el = document.getElementById('estimated-total-price');
    if (el) el.textContent = `$${total}`;
    return Math.round(total);
}

async function handleBookingConfirmation(config) {
    if (isSubmitting) return;
    const btn = document.getElementById('confirm-booking-btn');
    
    const name = document.getElementById('contact-name').value.trim();
    const phone = document.getElementById('contact-phone').value.trim();
    const notes = document.getElementById('booking-notes-input')?.value.trim();
    const people = parseInt(document.getElementById('booking-people-input')?.value) || 1;
    const useStoredValue = document.getElementById('use-stored-value-checkbox')?.checked;

    if (!name || !phone) { ui.toast('請填寫姓名與電話', 'error'); return; }
    if (!/^09\d{8}$/.test(phone)) { ui.toast('請輸入正確的 10 碼手機號碼', 'error'); return; }

    let payload = { userId: state.userProfile.userId, contactName: name, contactPhone: phone, notes: notes, numOfPeople: people, useStoredValue: useStoredValue };

    if (config.mode === 'range') {
        if (!guesthouseData.startDate) { ui.toast('請選擇入住日期', 'error'); return; }
        const items = Object.entries(guesthouseData.selectedRooms).map(([pid, qty]) => ({ productId: pid, quantity: qty }));
        if (items.length === 0) { ui.toast('請選擇至少一間房型', 'error'); return; }
        
        payload.bookingType = 'guesthouse';
        payload.startDate = guesthouseData.startDate;
        payload.endDate = guesthouseData.endDate;
        payload.items = items;
    } else {
        if (!bookingPayload.date) { ui.toast('請選擇預約日期', 'error'); return; }
        if (config.enable_time_slots && !bookingPayload.timeSlot) { ui.toast('請選擇預約時段', 'error'); return; }
        
        const items = [];
        document.querySelectorAll('.booking-item-row').forEach(row => {
            const select = row.querySelector('select');
            const qtyInput = row.querySelector('.booking-item-qty');
            if (select && select.value) {
                const productName = select.options[select.selectedIndex].text;
                const qty = qtyInput ? (parseInt(qtyInput.value) || 1) : 1;
                items.push({ name: productName, productId: select.value, quantity: qty });
            }
        });
        if (items.length === 0) { ui.toast('請至少選擇一個服務項目', 'error'); return; }

        payload.bookingType = 'studio';
        payload.bookingDate = bookingPayload.date;
        payload.timeSlot = bookingPayload.timeSlot || '';
        payload.items = items;
    }

    isSubmitting = true; btn.disabled = true; btn.textContent = '處理中...';
    try {
        const res = await api.createBooking(payload);
        api.sendMessage(state.userProfile.userId, res.confirmationMessage).catch(e => console.error(e));
        document.getElementById('app-content').innerHTML = `<div style="text-align:center; padding:50px 20px;"><h2 style="color:var(--color-primary);">✅ 預約成功</h2><p>系統已收到您的預約。</p><p style="color:#888;">3 秒後自動跳轉至紀錄頁...</p></div>`;
        setTimeout(() => { isSubmitting = false; router.navigate('page-my-records'); }, 3000);
    } catch (err) {
        ui.toast(err.message || "預約失敗", 'error');
        btn.disabled = false; btn.textContent = '確認預約'; isSubmitting = false;
    }
}