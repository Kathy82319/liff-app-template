// public/modules/pages/booking.js (v12.0 - Config Driven)
import { api } from '../api.js';
import { state } from '../state.js';
import { router } from '../router.js';
import { ui } from '../ui.js';

let isSubmitting = false;
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

export async function init() {
    console.log("初始化預約頁面 (Config Driven)");
    
    // 1. 讀取設定
    const clientConfig = state.activeTemplate?.client_config || {};
    const bookingConfig = clientConfig.booking || {};
    const terms = state.activeTemplate?.terms || {};
    
    // 2. 設定頁面標題
    const pageTitle = document.querySelector('#page-booking .page-main-title');
    if (pageTitle) pageTitle.textContent = terms.BOOKING_PAGE_TITLE || '線上預約';
    
    // 3. 綁定「查看我的預約」按鈕
    const viewBtn = document.getElementById('view-my-bookings-btn');
    if (viewBtn) {
        viewBtn.textContent = terms.PROFILE_BOOKINGS_BTN_LABEL || '查看我的預約';
        const newBtn = viewBtn.cloneNode(true);
        viewBtn.parentNode.replaceChild(newBtn, viewBtn);
        newBtn.addEventListener('click', () => router.navigate('page-my-records'));
    }

    // 4. 載入產品
    if (state.allProducts.length === 0) {
        try { state.allProducts = await api.getProducts(); } catch(e) { console.error("無法載入產品列表", e); }
    }

    // 5. 預填資料 & 儲值金
    try {
        if (state.userProfile && state.userProfile.userId) {
            const userData = await api.getUserProfile(state.userProfile.userId);
            if (userData) {
                const nameInput = document.getElementById('contact-name');
                const phoneInput = document.getElementById('contact-phone');
                if (nameInput) nameInput.value = userData.real_name || state.userProfile.displayName || '';
                if (phoneInput) phoneInput.value = userData.phone || '';
                setupStoredValueUI(userData.stored_value_balance || 0);
            }
        }
    } catch(e) { console.warn("預填使用者資料失敗", e); }

    // 6. 綁定確認按鈕
    const confirmBtn = document.getElementById('confirm-booking-btn');
    if (confirmBtn) {
        const newBtn = confirmBtn.cloneNode(true);
        confirmBtn.parentNode.replaceChild(newBtn, confirmBtn);
        newBtn.addEventListener('click', handleBookingConfirmation);
    }

    // 7. 【關鍵修改】根據 Mode 初始化對應邏輯
    const mode = bookingConfig.mode || 'studio'; // 預設 studio
    console.log(`[Booking Init] Mode: ${mode}`);

    if (mode === 'guesthouse') {
        await initializeGuesthouse(bookingConfig);
    } else {
        await initializeStudio(bookingConfig);
    }
}

function setupStoredValueUI(balance) {
    const features = state.activeTemplate?.client_config?.profile?.info_toggles || {}; 
    // 註：這裡改讀 profile.info_toggles.balance 或者全域 features，視您的 JSON 結構而定。
    // 根據您的 JSON，client_config.profile.info_toggles.balance 控制顯示
    // 但通常付款功能會看 FEATURES_CLIENT_SHOW_STORED_VALUE (舊設定) 或新 config
    // 這裡我們先讀取舊有的 features (相容性) 或新 config
    
    // 暫時維持讀取 state.activeTemplate.features (由 systemSettings 轉換而來)
    // 或是直接讀取 client_config.booking.studio_settings (如果有的話)
    const showStoredValue = state.activeTemplate?.features?.CLIENT_SHOW_STORED_VALUE !== false;
    
    const group = document.getElementById('stored-value-payment-group');
    const display = document.getElementById('stored-value-balance-display');
    const checkbox = document.getElementById('use-stored-value-checkbox');

    if (group) group.style.display = showStoredValue ? 'block' : 'none';
    
    if (display) {
        display.textContent = `(餘額: $${balance})`;
        if (checkbox) {
            if (balance <= 0) {
                checkbox.disabled = true; checkbox.checked = false; display.style.color = 'gray';
            } else {
                checkbox.disabled = false; display.style.color = 'var(--color-text-secondary)';
            }
            const newCheckbox = checkbox.cloneNode(true);
            checkbox.parentNode.replaceChild(newCheckbox, checkbox);
            newCheckbox.addEventListener('change', (e) => {
                if (e.target.checked) {
                    const total = calculateCurrentTotal();
                    if (total <= 0) { alert("請先選擇預約項目。"); e.target.checked = false; return; }
                    if (balance < total) { alert(`餘額不足 (需 $${total}，餘額 $${balance})。`); e.target.checked = false; return; }
                    if (!confirm("確認使用儲值金付款？")) { e.target.checked = false; }
                }
            });
        }
    }
}

// --- 民宿模式 ---
async function initializeGuesthouse(config) {
    const pickerEl = document.getElementById('booking-date-range-picker');
    const roomContainer = document.getElementById('room-selection-container');
    const form = document.getElementById('booking-details-form');
    
    if (!pickerEl || !roomContainer || !form) return;

    // 設定 Label
    const labels = config.labels || {};
    const labelEl = document.querySelector('label[for="booking-date-range-picker"]');
    if (labelEl) labelEl.textContent = `${labels.checkin || '入住'} / ${labels.checkout || '退房'} 日期:`;

    guesthouseData = { startDate: null, endDate: null, numberOfNights: 0, roomAvailability: {}, selectedRooms: {} };
    
    form.style.display = 'block';
    renderRoomList(null);
    
    const totalEl = document.getElementById('estimated-total-price');
    if (totalEl) totalEl.textContent = '$0';

    if (flatpickrInstance) flatpickrInstance.destroy();
    
    flatpickrInstance = flatpickr(pickerEl, {
        mode: "range", 
        minDate: "today", 
        dateFormat: "Y-m-d", 
        locale: "zh_tw",
        disableMobile: true,
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
                    console.error(e);
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
                
                if (totalPrice) {
                    priceHtml = `
                        <div style="font-weight:bold;">${avgPrice} <span style="font-size:0.8em; color:#888; font-weight:normal;">/ 晚</span></div>
                        <div style="font-size:0.95rem; color:var(--color-primary); font-weight:bold; margin-top:2px;">小計 ${totalPrice}</div>
                    `;
                } else {
                    priceHtml = `${avgPrice} <span style="font-size:0.8em; color:#888;">/ 晚</span>`;
                }
                isDisabled = false;
                hasBookable = true;
            } else {
                statusHtml = '<span style="color:var(--color-danger); font-size:0.8rem;">已售完 / 未開放</span>';
            }
        } else {
            statusHtml = '<span style="font-size:0.8rem; color: var(--color-primary);">← 請先選擇日期</span>';
        }

        let img = 'https://placehold.co/100x100?text=No+Image';
        try { const images = JSON.parse(p.images || '[]'); if (images.length > 0) img = images[0]; } catch(e) {}

        let opts = '<option value="0">0</option>';
        for(let i=1; i<=maxQty; i++) opts += `<option value="${i}">${i}</option>`;

        return `
        <div class="room-item" style="${isDisabled && !isPreview ? 'opacity:0.6; background:#eee;' : ''}">
            <img src="${img}" class="room-thumb">
            <div class="room-content">
                <div class="room-name">${p.name}</div>
                <div class="room-price">${priceHtml}</div>
                ${statusHtml}
            </div>
            <div class="room-controls">
                <select class="room-qty-select" data-pid="${p.product_id}" ${isDisabled ? 'disabled' : ''}>${opts}</select>
                ${!isDisabled ? `<span class="room-stock-badge">剩 ${maxQty} 間</span>` : ''}
            </div>
        </div>`;
    }).join('');

    container.querySelectorAll('.room-qty-select').forEach(sel => {
        sel.addEventListener('change', (e) => {
            const qty = parseInt(e.target.value);
            const pid = e.target.dataset.pid;
            if (qty > 0) guesthouseData.selectedRooms[pid] = qty;
            else delete guesthouseData.selectedRooms[pid];
            calculateTotalPrice();
        });
    });

    if (!isPreview && !hasBookable) container.innerHTML += '<p style="text-align:center; color:var(--color-danger); margin-top:10px;">抱歉，此日期區間已無空房。</p>';
    calculateTotalPrice();
}

// --- 工作室模式 ---
async function initializeStudio(config) {
    const studioSettings = config.studio_settings || {};
    const fieldToggles = config.field_toggles || {};

    const pageDiv = document.getElementById('page-booking');
    const detailsForm = document.getElementById('booking-details-form'); 
    const pickerInput = document.getElementById('booking-date-range-picker'); 
    
    if (!pageDiv || !detailsForm || !pickerInput) return;

    // 1. 更新介面文字
    const sectionTitle = pageDiv.querySelector('.details-section h3');
    if (sectionTitle) sectionTitle.textContent = studioSettings.enable_time_slots ? '1. 選擇日期與時段' : '1. 選擇預約日期';
    
    const label = pageDiv.querySelector('label[for="booking-date-range-picker"]');
    if (label) label.textContent = '預約日期:';
    pickerInput.placeholder = "請點擊選擇日期";

    // 2. 時段容器 (如果啟用)
    let timeSlotContainer = pageDiv.querySelector('#booking-time-slot-container');
    if (!timeSlotContainer) {
        timeSlotContainer = document.createElement('div');
        timeSlotContainer.id = 'booking-time-slot-container';
        timeSlotContainer.style.marginTop = '20px';
        timeSlotContainer.style.display = 'none'; 
        timeSlotContainer.innerHTML = `
            <label for="time-slot-select" style="display: block; margin-bottom: 10px; font-weight:bold;">請選擇時段：</label>
            <div id="time-slot-buttons-container" style="display: grid; grid-template-columns: repeat(auto-fill, minmax(80px, 1fr)); gap: 10px;"></div>
            <input type="hidden" id="time-slot-select">
        `;
        const dateFormGroup = pickerInput.closest('.form-group');
        if (dateFormGroup) dateFormGroup.parentNode.insertBefore(timeSlotContainer, dateFormGroup.nextSibling);
    }

    // 3. 項目容器
    let itemsContainer = detailsForm.querySelector('#booking-items-container');
    if (!itemsContainer) {
        const itemsSection = document.createElement('div');
        itemsSection.className = 'form-group';
        itemsSection.innerHTML = `
            <label>預約項目</label>
            <div id="booking-items-container"></div>
            <button type="button" id="add-booking-item-btn" class="cta-button" style="margin-top: 10px; background-color: var(--color-secondary); font-size: 0.9rem; padding: 8px;">⊕ 新增項目</button>
        `;
        const hrElement = detailsForm.querySelector('hr'); 
        if (hrElement) detailsForm.insertBefore(itemsSection, hrElement); else detailsForm.prepend(itemsSection);
        itemsContainer = document.getElementById('booking-items-container'); 
        
        // 綁定新增按鈕
        document.getElementById('add-booking-item-btn').addEventListener('click', () => addBookingItemRow(fieldToggles));
    }
    
    // 初始化第一行
    if (itemsContainer) {
        itemsContainer.innerHTML = '';
        addBookingItemRow(fieldToggles);
    }

    // 4. Flatpickr (Popup)
    try {
        const res = await api.getBookingsCheckInit(); 
        if (flatpickrInstance) flatpickrInstance.destroy();
        
        const fpConfig = {
            minDate: "today", 
            dateFormat: "Y-m-d", 
            locale: "zh_tw",
            disableMobile: true,
            onChange: (selected, dateStr) => {
                bookingData.date = dateStr;
                if (dateStr) {
                    if (studioSettings.enable_time_slots) {
                        timeSlotContainer.style.display = 'block';
                        // 傳入 Config 中的時段設定
                        renderTimeSlots(dateStr, studioSettings.time_slot_config);
                    } else {
                        // 無時段模式：直接顯示表單
                        timeSlotContainer.style.display = 'none';
                        detailsForm.style.display = 'block';
                        bookingData.timeSlot = null; // 清空時段
                    }
                } else {
                    timeSlotContainer.style.display = 'none';
                    detailsForm.style.display = 'none';
                }
                updateAllItemsPrice(dateStr);
            }
        };
        if (res && res.enabledDates && res.enabledDates.length > 0) {
            fpConfig.enable = res.enabledDates;
        }
        flatpickrInstance = flatpickr(pickerInput, fpConfig);
    } catch (e) { console.error("日期選擇器初始化失敗", e); }
}

// 渲染時段 (動態生成)
function renderTimeSlots(dateStr, config) {
    const container = document.getElementById('time-slot-buttons-container');
    const hiddenInput = document.getElementById('time-slot-select');
    const detailsForm = document.getElementById('booking-details-form');
    
    if (!container) return;
    container.innerHTML = ''; 
    hiddenInput.value = ''; 
    detailsForm.style.display = 'none';

    // 預設值
    const startHour = parseInt((config?.start || "10:00").split(':')[0]);
    const endHour = parseInt((config?.end || "20:00").split(':')[0]);
    const interval = config?.interval || 60; // 分鐘

    const now = new Date();
    const selectedDate = new Date(dateStr + 'T00:00:00');
    const isToday = now.toDateString() === selectedDate.toDateString();
    
    // 產生時段
    let current = new Date(selectedDate);
    current.setHours(startHour, 0, 0, 0);
    const end = new Date(selectedDate);
    end.setHours(endHour, 0, 0, 0);

    while (current <= end) {
        const hour = current.getHours();
        const minute = current.getMinutes();
        const timeString = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
        
        let isDisabled = false;
        // 簡單檢查：如果今天且時間已過
        if (isToday) {
            if (hour < now.getHours() || (hour === now.getHours() && minute <= now.getMinutes())) {
                isDisabled = true;
            }
        }

        const btn = document.createElement('button');
        btn.textContent = timeString;
        btn.className = 'time-slot-btn';
        btn.type = 'button';
        btn.style.cssText = `padding: 10px; border: 1px solid var(--color-secondary); border-radius: 8px; background-color: #fff; cursor: pointer; transition: all 0.2s; font-size: 0.9rem;`;
        
        if (isDisabled) {
            btn.disabled = true;
            btn.style.backgroundColor = '#f5f5f5'; btn.style.color = '#ccc'; btn.style.borderColor = '#eee'; btn.style.cursor = 'not-allowed';
        } else {
            btn.onclick = () => {
                container.querySelectorAll('.time-slot-btn').forEach(b => {
                    b.style.backgroundColor = '#fff'; b.style.color = 'var(--color-text-primary)'; b.style.borderColor = 'var(--color-secondary)';
                });
                btn.style.backgroundColor = 'var(--color-primary)'; btn.style.color = '#fff'; btn.style.borderColor = 'var(--color-primary)';
                
                bookingData.timeSlot = timeString;
                hiddenInput.value = timeString;
                detailsForm.style.display = 'block';
                setTimeout(() => { detailsForm.scrollIntoView({ behavior: 'smooth', block: 'start' }); }, 100);
            };
        }
        container.appendChild(btn);
        
        // 增加間隔
        current.setMinutes(current.getMinutes() + interval);
    }
}

function addBookingItemRow(fieldToggles = {}) {
    const container = document.getElementById('booking-items-container');
    if (!container || container.children.length >= 5) return; 

    const itemRow = document.createElement('div');
    itemRow.className = 'booking-item-row';
    itemRow.style.cssText = 'display: flex; gap: 10px; margin-bottom: 10px; align-items: center;';

    const select = document.createElement('select');
    select.className = 'booking-item-select';
    select.style.flexGrow = '1';
    select.add(new Option('-- 請選擇項目 --', ''));
    state.allProducts.filter(p => p.is_visible).forEach(p => { select.add(new Option(p.name, p.name)); });

    const qtyInput = document.createElement('input');
    qtyInput.type = 'number';
    qtyInput.className = 'booking-item-qty';
    qtyInput.value = 1;
    qtyInput.min = 1;
    qtyInput.style.width = '70px';
    // 根據設定隱藏
    if (fieldToggles.quantity === false) qtyInput.style.display = 'none';

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
    removeBtn.onclick = () => { itemRow.remove(); calculateTotalPrice(); checkAddButtonVisibility(); };

    select.addEventListener('change', () => { updateRowPrice(itemRow, select.value); calculateTotalPrice(); });
    qtyInput.addEventListener('change', calculateTotalPrice);

    itemRow.append(select, qtyInput, priceDisplay, priceInputHidden, removeBtn);
    container.appendChild(itemRow);
    checkAddButtonVisibility();
}

function checkAddButtonVisibility() {
    const container = document.getElementById('booking-items-container');
    const btn = document.getElementById('add-booking-item-btn');
    if (container && btn) { btn.style.display = (container.children.length >= 5) ? 'none' : 'block'; }
}

function updateRowPrice(row, productName) {
    const priceInput = row.querySelector('.booking-item-actual-price');
    const priceDisplay = row.querySelector('.price-display-hint');
    const product = state.allProducts.find(p => p.name === productName);
    
    if (product && bookingData.date) {
        const price = getPriceForDate(bookingData.date, product);
        if (price !== null) { priceInput.value = price; priceDisplay.textContent = `$${price}`; } 
        else { priceInput.value = ''; priceDisplay.textContent = '(價格未定)'; }
    } else { priceInput.value = ''; priceDisplay.textContent = ''; }
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

function calculateCurrentTotal() {
    let total = 0;
    const mode = state.activeTemplate?.client_config?.booking?.mode || 'studio';

    if (mode === 'guesthouse') {
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
    if (isSubmitting) return; 
    const btn = e.target;
    isSubmitting = true; btn.disabled = true; btn.textContent = '處理中...';

    const activeForm = document.getElementById('booking-details-form');
    const name = document.getElementById('contact-name').value.trim();
    const phone = document.getElementById('contact-phone').value.trim();
    const useStoredValue = document.getElementById('use-stored-value-checkbox')?.checked;

    if (!name || !phone) { ui.toast('請填寫姓名與電話', 'error'); resetButton(btn); return; }
    if (!/^09\d{8}$/.test(phone)) { ui.toast('請輸入正確的 10 碼手機號碼', 'error'); resetButton(btn); return; }

    const mode = state.activeTemplate?.client_config?.booking?.mode || 'studio';
    let payload = {
        userId: state.userProfile.userId,
        contactName: name,
        contactPhone: phone,
        useStoredValue: useStoredValue
    };

    if (mode === 'guesthouse') {
        if (!guesthouseData.startDate) { ui.toast('請選擇日期', 'error'); resetButton(btn); return; }
        const items = Object.entries(guesthouseData.selectedRooms).map(([pid, qty]) => ({ productId: pid, quantity: qty }));
        if (items.length === 0) { ui.toast('請選擇房型', 'error'); resetButton(btn); return; }
        
        payload.startDate = guesthouseData.startDate;
        payload.endDate = guesthouseData.endDate;
        payload.items = items;
        payload.bookingType = 'guesthouse';
    } else {
        const date = bookingData.date;
        const time = document.getElementById('time-slot-select')?.value;
        const enableTimeSlots = state.activeTemplate?.client_config?.booking?.studio_settings?.enable_time_slots !== false;

        if (!date) { ui.toast('請選擇日期', 'error'); resetButton(btn); return; }
        if (enableTimeSlots && !time) { ui.toast('請選擇時段', 'error'); resetButton(btn); return; }
        
        const items = [];
        activeForm.querySelectorAll('.booking-item-row').forEach(row => {
            const select = row.querySelector('select');
            const input = row.querySelector('.booking-item-qty');
            if (select && input) {
                const name = select.value;
                const qty = parseInt(input.value);
                if(name && qty > 0) items.push({ name, quantity: qty });
            }
        });
        
        if (items.length === 0) { ui.toast('請至少選擇一個項目', 'error'); resetButton(btn); return; }

        payload.bookingDate = date;
        payload.timeSlot = time;
        payload.numOfPeople = 1;
        payload.items = items;
        payload.bookingType = 'studio';
    }

    try {
        const res = await api.createBooking(payload);
        api.sendMessage(state.userProfile.userId, res.confirmationMessage).catch(e => console.error(e));
        document.getElementById('app-content').innerHTML = `<div style="text-align:center; padding:50px 20px;"><h2 style="color:var(--color-primary);">✅ 預約成功</h2><p>3 秒後跳轉...</p></div>`;
        setTimeout(() => { isSubmitting = false; router.navigate('page-my-records'); }, 3000);
    } catch (err) {
        ui.toast(err.message || "預約失敗", 'error'); resetButton(btn);
    }
}

function resetButton(btn) { btn.disabled = false; btn.textContent = '確認預約'; isSubmitting = false; }