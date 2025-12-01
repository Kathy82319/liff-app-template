// public/modules/pages/booking.js
import { api } from '../api.js';
import { state } from '../state.js';
import { router } from '../router.js';
import { ui } from '../ui.js';

let bookingData = {
    date: null,
    timeSlot: null
};

// 民宿模式專用狀態
let guesthouseData = { 
    startDate: null, 
    endDate: null, 
    numberOfNights: 0, 
    roomAvailability: {}, 
    selectedRooms: {} 
};

let flatpickrInstance = null;

// =================================================================
// 1. 初始化預約頁面 (Entry Point)
// =================================================================
export async function init() {
    console.log("初始化預約頁面 (booking.js)");
    const features = state.activeTemplate?.features || {};
    const terms = state.activeTemplate?.terms || {};
    
    // 1. 設定頁面標題
    const pageTitle = document.querySelector('#page-booking .page-main-title');
    if (pageTitle) pageTitle.textContent = terms.BOOKING_PAGE_TITLE || '線上預約';
    
    // 2. 綁定「查看我的預約」按鈕 (導向紀錄頁)
    const viewBtn = document.getElementById('view-my-bookings-btn');
    if (viewBtn) {
        viewBtn.textContent = terms.PROFILE_BOOKINGS_BTN_LABEL || '查看我的預約';
        const newBtn = viewBtn.cloneNode(true);
        viewBtn.parentNode.replaceChild(newBtn, viewBtn);
        newBtn.addEventListener('click', () => router.navigate('page-my-records'));
    }

    // 3. 確保產品資料已載入
    if (state.allProducts.length === 0) {
        try { 
            state.allProducts = await api.getProducts(); 
        } catch(e) {
            console.error("無法載入產品列表", e);
        }
    }

    // 4. 預填聯絡人資訊 & 儲值金顯示
    try {
        if (state.userProfile && state.userProfile.userId) {
            const userData = await api.getUserProfile(state.userProfile.userId);
            if (userData) {
                const nameInput = document.getElementById('contact-name');
                const phoneInput = document.getElementById('contact-phone');
                
                if (nameInput) nameInput.value = userData.real_name || state.userProfile.displayName || '';
                if (phoneInput) phoneInput.value = userData.phone || '';
                
                // 設定儲值金 UI
                setupStoredValueUI(userData.stored_value_balance || 0);
            }
        }
    } catch(e) {
        console.warn("預填使用者資料失敗", e);
    }

    // 5. 綁定確認預約按鈕
    const confirmBtn = document.getElementById('confirm-booking-btn');
    if (confirmBtn) {
        const newBtn = confirmBtn.cloneNode(true);
        confirmBtn.parentNode.replaceChild(newBtn, confirmBtn);
        newBtn.addEventListener('click', handleBookingConfirmation);
    }

    // 6. 根據樣板模式初始化 UI (民宿 vs 工作室)
    const templateType = state.config?.LOGIC?.ACTIVE_INDUSTRY_TEMPLATE;
    if (templateType === 'guesthouse_template') {
        await initializeGuesthouse();
    } else {
        await initializeStudio();
    }
}

// =================================================================
// 2. 儲值金 UI 邏輯
// =================================================================
function setupStoredValueUI(balance) {
    const features = state.activeTemplate?.features || {};
    const showStoredValue = features.CLIENT_SHOW_STORED_VALUE !== false;
    
    const group = document.getElementById('stored-value-payment-group');
    const display = document.getElementById('stored-value-balance-display');
    const checkbox = document.getElementById('use-stored-value-checkbox');

    if (group) group.style.display = showStoredValue ? 'block' : 'none';
    
    if (display) {
        display.textContent = `(餘額: $${balance})`;
        if (checkbox) {
            if (balance <= 0) {
                checkbox.disabled = true;
                checkbox.checked = false;
                display.style.color = 'gray';
            } else {
                checkbox.disabled = false;
                display.style.color = 'var(--color-text-secondary)';
            }
            
            // 綁定 Checkbox 邏輯
            const newCheckbox = checkbox.cloneNode(true);
            checkbox.parentNode.replaceChild(newCheckbox, checkbox);
            newCheckbox.addEventListener('change', (e) => {
                if (e.target.checked) {
                    const total = calculateCurrentTotal();
                    if (total <= 0) {
                        alert("請先選擇預約項目以計算金額。");
                        e.target.checked = false;
                        return;
                    }
                    if (balance < total) {
                        alert(`餘額不足 (需 $${total}，餘額 $${balance})，無法使用儲值金全額付款。`);
                        e.target.checked = false;
                        return;
                    }
                    if (!confirm("確認使用儲值金付款？")) {
                        e.target.checked = false;
                    }
                }
            });
        }
    }
}

// =================================================================
// 3. 民宿模式 (Guesthouse) 邏輯
// =================================================================
async function initializeGuesthouse() {
    const pickerEl = document.getElementById('booking-date-range-picker');
    const roomContainer = document.getElementById('room-selection-container');
    const form = document.getElementById('booking-details-form');
    
    if (!pickerEl || !roomContainer || !form) return;

    guesthouseData = { startDate: null, endDate: null, numberOfNights: 0, roomAvailability: {}, selectedRooms: {} };
    form.style.display = 'block';
    renderRoomList(null); // 預覽模式
    document.getElementById('estimated-total-price').textContent = '$0';

    if (flatpickrInstance) flatpickrInstance.destroy();
    
    flatpickrInstance = flatpickr(pickerEl, {
        mode: "range", 
        minDate: "today", 
        dateFormat: "Y-m-d", 
        locale: "zh_tw",
        onClose: async (selectedDates) => {
            if (selectedDates.length === 2) {
                const start = selectedDates[0];
                const end = selectedDates[1];
                if (start.getTime() === end.getTime()) return;

                guesthouseData.startDate = flatpickr.formatDate(start, "Y-m-d");
                guesthouseData.endDate = flatpickr.formatDate(end, "Y-m-d");
                guesthouseData.numberOfNights = Math.round((end - start) / 86400000);

                roomContainer.style.opacity = '0.5';
                try {
                    const data = await api.checkRoomAvailability(guesthouseData.startDate, guesthouseData.endDate);
                    roomContainer.style.opacity = '1';
                    renderRoomList(data);
                } catch (e) {
                    roomContainer.style.opacity = '1';
                    alert("查詢房況失敗");
                }
            } else {
                guesthouseData.startDate = null; 
                renderRoomList(null);
                calculateTotalPrice();
            }
        }
    });
}

function renderRoomList(availabilityData) {
    const container = document.getElementById('room-selection-container');
    const isPreview = !availabilityData;
    guesthouseData.roomAvailability = availabilityData || {};
    if (!isPreview) guesthouseData.selectedRooms = {};

    const products = state.allProducts.filter(p => p.is_visible);
    if (products.length === 0) {
        container.innerHTML = '<p style="text-align:center; padding:20px;">無可預訂房型。</p>';
        return;
    }

    let hasBookable = false;
    container.innerHTML = products.map(p => {
        let priceText = p.price_weekday !== null ? `$${p.price_weekday} 起` : '洽詢';
        let maxQty = 0;
        let isDisabled = true;
        let statusHtml = '';

        if (!isPreview) {
            const info = availabilityData[p.product_id];
            if (info && info.isAvailable) {
                maxQty = info.minAvailableQuantity || 0;
                priceText = info.pricePerNight !== null ? `$${info.pricePerNight}` : '洽詢';
                isDisabled = false;
                hasBookable = true;
            } else {
                statusHtml = '<span style="color:var(--color-danger); font-size:0.8rem;">已售完 / 未開放</span>';
            }
        } else {
            statusHtml = '<span style="font-size:0.8rem; color: var(--color-primary);">← 請先選擇日期</span>';
        }

        let img = 'https://placehold.co/100x100?text=No+Image';
        try {
            const images = JSON.parse(p.images || '[]');
            if (images.length > 0) img = images[0];
        } catch(e) {}

        let opts = '<option value="0">0</option>';
        for(let i=1; i<=maxQty; i++) opts += `<option value="${i}">${i}</option>`;

        return `
        <div class="room-item" style="${isDisabled && !isPreview ? 'opacity:0.6; background:#eee;' : ''}">
            <img src="${img}" class="room-thumb">
            <div class="room-content">
                <div class="room-name">${p.name}</div>
                <div class="room-price">${priceText} <span style="font-size:0.8em; color:#888;">/ 晚</span></div>
                ${statusHtml}
            </div>
            <div class="room-controls">
                <select class="room-qty-select" data-pid="${p.product_id}" ${isDisabled ? 'disabled' : ''}>${opts}</select>
                ${!isDisabled ? `<span class="room-stock-badge">剩 ${maxQty}</span>` : ''}
            </div>
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

    if (!isPreview && !hasBookable) container.innerHTML += '<p style="text-align:center; color:red;">此日期區間已無空房。</p>';
    calculateTotalPrice();
}

// =================================================================
// 4. 工作室模式 (Studio) 邏輯
// =================================================================
function initializeStudio() {
    const pageDiv = document.getElementById('page-booking');
    const detailsForm = document.getElementById('booking-details-form'); 
    if (!pageDiv || !detailsForm) return;

    let dateContainer = pageDiv.querySelector('#booking-datepicker-container');
    if (!dateContainer) {
        dateContainer = document.createElement('div');
        dateContainer.id = 'booking-datepicker-container';
        pageDiv.querySelector('.details-section').prepend(dateContainer);
        // 如果原本有 h3, 調整一下
        const h3 = pageDiv.querySelector('.details-section h3');
        if(h3) h3.textContent = '1. 選擇日期與時段';
    }

    let timeSlotContainer = pageDiv.querySelector('#booking-time-slot-container');
    if (!timeSlotContainer) {
        timeSlotContainer = document.createElement('div');
        timeSlotContainer.id = 'booking-time-slot-container';
        timeSlotContainer.style.marginTop = '20px';
        timeSlotContainer.style.display = 'none'; 
        timeSlotContainer.innerHTML = `
            <label for="time-slot-select" style="display: block; margin-bottom: 10px; font-weight:bold;">請選擇時段：</label>
            <select id="time-slot-select" style="width:100%; padding:10px; border-radius:8px; border:1px solid #ccc;"></select>
        `;
        dateContainer.parentNode.insertBefore(timeSlotContainer, dateContainer.nextSibling);
    }

    let itemsContainer = detailsForm.querySelector('#booking-items-container');
    let addBookingItemBtn = detailsForm.querySelector('#add-booking-item-btn');
    if (!itemsContainer) {
        const itemsSection = document.createElement('div');
        itemsSection.className = 'form-group';
        itemsSection.innerHTML = `
            <label>預約項目</label>
            <div id="booking-items-container"></div>
            <button type="button" id="add-booking-item-btn" class="cta-button" style="margin-top: 10px; background-color: var(--color-secondary); font-size: 0.9rem; padding: 8px;">⊕ 新增項目</button>
        `;
        const hrElement = detailsForm.querySelector('hr'); 
        if(hrElement) detailsForm.insertBefore(itemsSection, hrElement); 
        else detailsForm.prepend(itemsSection);
        
        itemsContainer = document.getElementById('booking-items-container'); 
        addBookingItemBtn = document.getElementById('add-booking-item-btn'); 
    }

    if (itemsContainer) itemsContainer.innerHTML = ''; 
    if(addBookingItemBtn) {
        const newBtn = addBookingItemBtn.cloneNode(true);
        addBookingItemBtn.parentNode.replaceChild(newBtn, addBookingItemBtn);
        newBtn.addEventListener('click', () => addBookingItemRow());
    }
    if(itemsContainer) addBookingItemRow();

    api.getBookingsCheckInit().then(res => {
        flatpickr(dateContainer, {
            inline: true, minDate: "today", dateFormat: "Y-m-d", locale: "zh_tw",
            enable: res.enabledDates,
            onChange: (selected, dateStr) => {
                bookingData.date = dateStr;
                const timeSlotSel = document.getElementById('time-slot-select');
                if (dateStr) {
                    timeSlotContainer.style.display = 'block';
                    if(timeSlotSel) renderTimeSlots(timeSlotSel);
                } else {
                    timeSlotContainer.style.display = 'none';
                    detailsForm.style.display = 'none';
                }
                updateAllItemsPrice(dateStr);
            }
        });
    });

    const timeSlotSelect = document.getElementById('time-slot-select'); 
    if (timeSlotSelect) {
        timeSlotSelect.addEventListener('change', (e) => {
            bookingData.timeSlot = e.target.value;
            detailsForm.style.display = e.target.value ? 'block' : 'none';
        });
    }
}

function renderTimeSlots(selectElement) {
    if (!selectElement) return;
    selectElement.innerHTML = '<option value="">-- 請選擇 --</option>'; 
    for (let hour = 8; hour <= 18; hour++) {
        const timeString = `${hour.toString().padStart(2, '0')}:00`;
        selectElement.add(new Option(timeString, timeString));
    }
}

function addBookingItemRow() {
    const container = document.getElementById('booking-items-container');
    if (!container || container.children.length >= 5) return;

    const itemRow = document.createElement('div');
    itemRow.className = 'booking-item-row';
    itemRow.style.cssText = 'display: flex; gap: 10px; margin-bottom: 10px; align-items: center;';

    const select = document.createElement('select');
    select.className = 'booking-item-select';
    select.style.flexGrow = '1';
    select.add(new Option('-- 請選擇服務項目 --', ''));
    state.allProducts.filter(p => p.is_visible).forEach(p => {
        select.add(new Option(p.name, p.name));
    });

    const qtyInput = document.createElement('input');
    qtyInput.type = 'number';
    qtyInput.className = 'booking-item-qty';
    qtyInput.value = 1;
    qtyInput.min = 1;
    qtyInput.style.width = '70px';

    const priceInputHidden = document.createElement('input');
    priceInputHidden.type = 'hidden';
    priceInputHidden.className = 'booking-item-actual-price';

    const priceDisplay = document.createElement('span');
    priceDisplay.className = 'price-display-hint';
    priceDisplay.style.fontSize = '0.8rem';
    priceDisplay.style.color = '#666';

    const removeBtn = document.createElement('button');
    removeBtn.textContent = '-';
    removeBtn.style.cssText = 'background: var(--color-danger); border: none; color: white; border-radius: 4px; padding: 5px 10px; cursor: pointer;';
    removeBtn.onclick = () => {
        itemRow.remove();
        calculateTotalPrice();
        checkAddButtonVisibility();
    };

    select.addEventListener('change', () => {
        updateRowPrice(itemRow, select.value);
        calculateTotalPrice();
    });
    qtyInput.addEventListener('change', calculateTotalPrice);

    itemRow.append(select, qtyInput, priceDisplay, priceInputHidden, removeBtn);
    container.appendChild(itemRow);
    
    checkAddButtonVisibility();
}

function checkAddButtonVisibility() {
    const container = document.getElementById('booking-items-container');
    const btn = document.getElementById('add-booking-item-btn');
    if (container && btn) {
        btn.style.display = (container.children.length >= 5) ? 'none' : 'block';
    }
}

function updateRowPrice(row, productName) {
    const priceInput = row.querySelector('.booking-item-actual-price');
    const priceDisplay = row.querySelector('.price-display-hint');
    const product = state.allProducts.find(p => p.name === productName);
    
    if (product && bookingData.date) {
        const price = getPriceForDate(bookingData.date, product);
        if (price !== null) {
            priceInput.value = price;
            priceDisplay.textContent = `$${price}`;
        } else {
            priceInput.value = '';
            priceDisplay.textContent = '(價格未定)';
        }
    } else {
        priceInput.value = '';
        priceDisplay.textContent = '';
    }
}

function updateAllItemsPrice(dateStr) {
    document.querySelectorAll('.booking-item-row').forEach(row => {
        const select = row.querySelector('.booking-item-select');
        if (select && select.value) updateRowPrice(row, select.value);
    });
    calculateTotalPrice();
}

function getPriceForDate(dateString, product) {
    if (!dateString || !product) return product?.price_weekday || null;
    const date = new Date(dateString + 'T00:00:00');
    const dayOfWeek = date.getDay();
    if (dayOfWeek === 5) return product.price_friday !== null ? product.price_friday : product.price_weekday;
    else if (dayOfWeek === 6) return product.price_saturday !== null ? product.price_saturday : product.price_weekday;
    else return product.price_weekday !== null ? product.price_weekday : null;
}

// =================================================================
// 5. 共用計算與提交邏輯
// =================================================================
function calculateCurrentTotal() {
    let total = 0;
    const templateType = state.config.LOGIC.ACTIVE_INDUSTRY_TEMPLATE;

    if (templateType === 'guesthouse_template') {
        if (guesthouseData.numberOfNights > 0) {
            for (const pid in guesthouseData.selectedRooms) {
                const qty = guesthouseData.selectedRooms[pid];
                const info = guesthouseData.roomAvailability[pid];
                if (qty > 0 && info && info.pricePerNight !== null) {
                    const price = info.totalPrice !== null ? info.totalPrice : (info.pricePerNight * guesthouseData.numberOfNights);
                    total += price * qty;
                }
            }
        }
    } else {
        document.querySelectorAll('.booking-item-row').forEach(row => {
            const qty = parseInt(row.querySelector('.booking-item-qty').value) || 0;
            const price = parseFloat(row.querySelector('.booking-item-actual-price').value) || 0;
            total += qty * price;
        });
    }
    return Math.round(total);
}

function calculateTotalPrice() {
    const total = calculateCurrentTotal();
    const el = document.getElementById('estimated-total-price');
    if (el) el.textContent = `$${total}`;
}

async function handleBookingConfirmation(e) {
    const btn = e.target;
    btn.disabled = true;
    btn.textContent = '處理中...';

    const name = document.getElementById('contact-name').value.trim();
    const phone = document.getElementById('contact-phone').value.trim();
    const useStoredValue = document.getElementById('use-stored-value-checkbox')?.checked;

    if (!name || !phone) { ui.toast('請填寫姓名與電話', 'error'); btn.disabled = false; btn.textContent = '確認預約'; return; }
    if (!/^09\d{8}$/.test(phone)) { ui.toast('請輸入正確的 10 碼手機號碼', 'error'); btn.disabled = false; btn.textContent = '確認預約'; return; }

    const templateType = state.config.LOGIC.ACTIVE_INDUSTRY_TEMPLATE;
    let payload = {
        userId: state.userProfile.userId,
        contactName: name,
        contactPhone: phone,
        useStoredValue: useStoredValue
    };

    if (templateType === 'guesthouse_template') {
        if (!guesthouseData.startDate) { ui.toast('請選擇日期', 'error'); btn.disabled = false; return; }
        const items = Object.entries(guesthouseData.selectedRooms).map(([pid, qty]) => ({ productId: pid, quantity: qty }));
        if (items.length === 0) { ui.toast('請選擇房型', 'error'); btn.disabled = false; return; }
        
        payload.startDate = guesthouseData.startDate;
        payload.endDate = guesthouseData.endDate;
        payload.items = items;
        payload.bookingType = 'guesthouse';
    } else {
        const date = bookingData.date;
        const time = document.getElementById('time-slot-select')?.value;
        if (!date || !time) { ui.toast('請選擇日期與時段', 'error'); btn.disabled = false; return; }
        
        const items = [];
        document.querySelectorAll('.booking-item-row').forEach(row => {
            const name = row.querySelector('select').value;
            const qty = row.querySelector('input').value;
            if(name) items.push({ name, quantity: parseInt(qty) });
        });
        
        if (items.length === 0) { ui.toast('請至少選擇一個項目', 'error'); btn.disabled = false; return; }

        payload.bookingDate = date;
        payload.timeSlot = time;
        payload.numOfPeople = 1;
        payload.items = items;
        payload.bookingType = 'studio';
    }

    try {
        const res = await api.createBooking(payload);
        api.sendMessage(state.userProfile.userId, res.confirmationMessage).catch(() => {});
        document.getElementById('app-content').innerHTML = `<div style="text-align:center; padding:50px 20px;"><h2>✅ 預約成功</h2><p>即將跳轉...</p></div>`;
        setTimeout(() => router.navigate('page-my-records'), 3000);
    } catch (err) {
        ui.toast(err.message || "預約失敗", 'error');
        btn.disabled = false;
        btn.textContent = '確認預約';
    }
}

// =================================================================
// 6. 預約詳細資料頁面渲染函式 (renderBookingDetails)
// =================================================================
export async function renderBookingDetails(bookingId) {
    if (!bookingId) return;

    const container = document.getElementById('booking-details-content-container');
    const loadingEl = document.getElementById('booking-details-loading');
    
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
        // 【修正】使用 getBookingById 直接取得單筆預約 (陣列的第一個)
        const [bookingList, policyData] = await Promise.all([
            api.getBookingById(state.userProfile.userId, bookingId), 
            api.getBookingPolicy()
        ]);

        const booking = bookingList[0];

        if (!booking) {
            throw new Error("找不到該筆預約資料");
        }

        if(elId) elId.textContent = `#${String(booking.booking_id).padStart(5, '0')}`;
        if(elCheckIn) elCheckIn.textContent = booking.booking_date;
        
        if (booking.check_out_date && elCheckOut) {
            elCheckOut.parentElement.style.display = 'block';
            elCheckOut.textContent = booking.check_out_date;
            const start = new Date(booking.booking_date);
            const end = new Date(booking.check_out_date);
            const nights = Math.round((end - start) / 86400000);
            if(elNights) {
                elNights.textContent = nights > 0 ? nights : '-';
                elNights.parentElement.style.display = 'block';
            }
        } else {
            if(elCheckOut) elCheckOut.parentElement.style.display = 'none';
            if(elNights) elNights.parentElement.style.display = 'none';
            if(booking.time_slot && elCheckIn) elCheckIn.textContent += ` ${booking.time_slot}`;
        }

        if(elItemsList) {
            elItemsList.innerHTML = (booking.items || []).map(item => `
                <div class="room-item-row" style="display:flex; justify-content:space-between; border-bottom:1px dashed #eee; padding:5px 0;">
                    <span>${item.item_name} x ${item.quantity}</span>
                    <span>$${item.price || '-'}</span>
                </div>
            `).join('');
        }

        if(elTotal) elTotal.textContent = booking.total_amount ? `$${booking.total_amount}` : '-';
        if(elPolicy) elPolicy.textContent = policyData.cancellationPolicy || '無取消政策資料';
        if(elInstructions) elInstructions.textContent = policyData.checkInInstructions || '無入住須知資料';

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