// public/modules/pages/booking.js
import { api } from '../api.js';
import { state } from '../state.js';
import { router } from '../router.js';
import { ui } from '../ui.js';

let isSubmitting = false;
let bookingData = {
    date: null,
    timeSlot: null
};

// 民宿/區間模式專用狀態
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
    console.log("初始化預約頁面 (Adaptation v12)");
    const terms = state.activeTemplate?.terms || {};
    
    // 1. 設定頁面標題
    const pageTitle = document.querySelector('#page-booking .page-main-title');
    if (pageTitle) pageTitle.textContent = terms.BOOKING_PAGE_TITLE || '線上預約';
    
    // 2. 綁定「查看我的預約」按鈕
    const viewBtn = document.getElementById('view-my-bookings-btn');
    if (viewBtn) {
        viewBtn.textContent = terms.PROFILE_BOOKINGS_BTN_LABEL || '查看我的預約';
        // 移除舊監聽器並綁定新事件
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

    // 6. 【核心修改】根據 Config 設定決定初始化模式
    // 讀取設定，預設為 range (民宿模式) 以保持相容性
    const clientConfig = state.activeTemplate?.client_config?.booking || {};
    const bookingMode = clientConfig.mode || 'range';

    console.log(`[Booking Init] Mode: ${bookingMode}`);

    // 清理舊狀態
    const timeSlotContainer = document.getElementById('booking-time-slot-container');
    const form = document.getElementById('booking-details-form');
    if (timeSlotContainer) timeSlotContainer.style.display = 'none';
    if (form) form.style.display = 'none'; // 預設隱藏表單，等選完日期才顯示

    if (bookingMode === 'single') {
        await initializeSingleDateMode();
    } else {
        await initializeRangeMode();
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
                    if (!confirm("確認使用儲值金付款？使用後若取消預約，儲值金將不自動歸還，請謹慎操作。")) {
                        e.target.checked = false;
                    }
                }
            });
        }
    }
}

// =================================================================
// 3. 區間模式 (Range Mode - 原民宿邏輯)
// =================================================================
async function initializeRangeMode() {
    const pickerEl = document.getElementById('booking-date-range-picker');
    const roomContainer = document.getElementById('room-selection-container');
    const form = document.getElementById('booking-details-form');
    
    if (!pickerEl || !roomContainer || !form) return;

    // UI 文字調整
    const label = document.querySelector('label[for="booking-date-range-picker"]');
    if (label) label.textContent = '入住 / 退房日期:';
    pickerEl.placeholder = "請點擊選擇入住與退房日期";

    guesthouseData = { startDate: null, endDate: null, numberOfNights: 0, roomAvailability: {}, selectedRooms: {} };
    
    // 民宿模式預設顯示表單，因為房型列表在下面
    form.style.display = 'block';
    
    // 隱藏時段容器 (如果存在)
    const timeSlotContainer = document.getElementById('booking-time-slot-container');
    if (timeSlotContainer) timeSlotContainer.style.display = 'none';

    // 隱藏一般項目的容器 (如果存在，避免混淆)
    const itemsContainer = document.getElementById('booking-items-container');
    if (itemsContainer) itemsContainer.innerHTML = '';

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
                    alert("查詢房況失敗，請稍後再試");
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
    // 如果找不到容器，可能是切換模式時 DOM 尚未還原，這里簡單處理：如果是 range 模式必須要有此容器
    // 但在 single 模式下此容器可能被隱藏或清空
    if (!container) return;

    const isPreview = !availabilityData;
    guesthouseData.roomAvailability = availabilityData || {};
    if (!isPreview) guesthouseData.selectedRooms = {};

    // 顯示房型列表
    container.style.display = 'block';

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
        try {
            const images = JSON.parse(p.images || '[]');
            if (images.length > 0) img = images[0];
        } catch(e) {}

        let opts = '<option value="0">0</option>';
        for(let i=1; i<=maxQty; i++) {
            opts += `<option value="${i}">${i}</option>`;
        }

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

// =================================================================
// 4. 單日模式 (Single Mode - 原工作室邏輯)
// =================================================================
async function initializeSingleDateMode() {
    const pageDiv = document.getElementById('page-booking');
    const detailsForm = document.getElementById('booking-details-form'); 
    const pickerInput = document.getElementById('booking-date-range-picker'); 
    
    if (!pageDiv || !detailsForm || !pickerInput) return;

    // 1. 更新介面文字
    const sectionTitle = pageDiv.querySelector('.details-section h3');
    if (sectionTitle) sectionTitle.textContent = '1. 選擇日期與時段';
    
    const label = pageDiv.querySelector('label[for="booking-date-range-picker"]');
    if (label) label.textContent = '預約日期:';
    
    pickerInput.placeholder = "請點擊選擇預約日期";

    // 2. 隱藏民宿的房型選擇器
    const roomContainer = document.getElementById('room-selection-container');
    if (roomContainer) roomContainer.style.display = 'none';

    // 3. 動態建立/顯示時段容器
    const tsConfig = state.activeTemplate?.client_config?.booking?.time_slots || { enabled: false };
    let timeSlotContainer = pageDiv.querySelector('#booking-time-slot-container');
    
    if (!timeSlotContainer) {
        timeSlotContainer = document.createElement('div');
        timeSlotContainer.id = 'booking-time-slot-container';
        timeSlotContainer.style.marginTop = '20px';
        
        timeSlotContainer.innerHTML = `
            <label for="time-slot-select" style="display: block; margin-bottom: 10px; font-weight:bold;">請選擇時段：</label>
            <div id="time-slot-buttons-container" style="display: grid; grid-template-columns: repeat(auto-fill, minmax(80px, 1fr)); gap: 10px;"></div>
            <input type="hidden" id="time-slot-select">
        `;
        
        const dateFormGroup = pickerInput.closest('.form-group');
        if (dateFormGroup) {
            dateFormGroup.parentNode.insertBefore(timeSlotContainer, dateFormGroup.nextSibling);
        } else {
            pickerInput.parentNode.appendChild(timeSlotContainer);
        }
    }

    // 根據設定決定是否顯示時段選擇
    timeSlotContainer.style.display = tsConfig.enabled ? 'none' : 'none'; // 預設隱藏，選完日期再顯示

    // 4. 動態建立/顯示項目容器
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
        if (hrElement) {
            detailsForm.insertBefore(itemsSection, hrElement); 
        } else {
            detailsForm.prepend(itemsSection);
        }
        itemsContainer = document.getElementById('booking-items-container'); 
        addBookingItemBtn = document.getElementById('add-booking-item-btn'); 
    }

    if (itemsContainer) itemsContainer.innerHTML = ''; 
    if (addBookingItemBtn) {
        const newBtn = addBookingItemBtn.cloneNode(true);
        addBookingItemBtn.parentNode.replaceChild(newBtn, addBookingItemBtn);
        newBtn.addEventListener('click', () => addBookingItemRow());
    }
    if (itemsContainer) addBookingItemRow(); // 預設新增一行

    // 5. 初始化 Flatpickr (Single Mode)
    try {
        // 可選：從後端獲取可預約日期 (若有設定公休日)
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
                    // 根據設定決定下一步
                    if (tsConfig.enabled) {
                        timeSlotContainer.style.display = 'block';
                        renderDynamicTimeSlots(dateStr, tsConfig);
                        detailsForm.style.display = 'none'; // 隱藏表單，強迫選時段
                    } else {
                        // 如果沒啟用時段，直接顯示表單
                        timeSlotContainer.style.display = 'none';
                        detailsForm.style.display = 'block';
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

    } catch (e) {
        console.error("初始化日期選擇器失敗", e);
    }
}

// 【核心新增】根據 Config 動態渲染時段按鈕
function renderDynamicTimeSlots(dateStr, config) {
    const container = document.getElementById('time-slot-buttons-container');
    const hiddenInput = document.getElementById('time-slot-select');
    const detailsForm = document.getElementById('booking-details-form');
    
    if (!container) return;
    container.innerHTML = ''; 
    hiddenInput.value = ''; 
    detailsForm.style.display = 'none';

    const now = new Date();
    const selectedDate = new Date(dateStr + 'T00:00:00');
    const isToday = now.toDateString() === selectedDate.toDateString();
    
    // 解析設定 (預設值防呆)
    const startTimeStr = config.start || "09:00";
    const endTimeStr = config.end || "21:00";
    const intervalMinutes = parseInt(config.interval || 30);

    const startMinutes = parseTimeToMinutes(startTimeStr);
    const endMinutes = parseTimeToMinutes(endTimeStr);
    
    // 產生時段
    for (let m = startMinutes; m <= endMinutes; m += intervalMinutes) {
        const timeString = formatMinutesToTime(m);
        
        // 檢查是否過期
        let isDisabled = false;
        if (isToday) {
            const currentMinutes = now.getHours() * 60 + now.getMinutes();
            if (m <= currentMinutes) isDisabled = true;
        }

        const btn = document.createElement('button');
        btn.textContent = timeString;
        btn.className = 'time-slot-btn';
        btn.type = 'button';
        btn.style.cssText = `
            padding: 10px; 
            border: 1px solid var(--color-secondary); 
            border-radius: 8px; 
            background-color: #fff; 
            cursor: pointer;
            transition: all 0.2s;
            font-size: 0.9rem;
        `;
        
        if (isDisabled) {
            btn.disabled = true;
            btn.style.backgroundColor = '#f5f5f5';
            btn.style.color = '#ccc';
            btn.style.borderColor = '#eee';
            btn.style.cursor = 'not-allowed';
        } else {
            btn.onclick = () => {
                // 視覺回饋
                container.querySelectorAll('.time-slot-btn').forEach(b => {
                    b.style.backgroundColor = '#fff';
                    b.style.color = 'var(--color-text-primary);';
                    b.style.borderColor = 'var(--color-secondary)';
                });
                btn.style.backgroundColor = 'var(--color-primary)';
                btn.style.color = '#fff';
                btn.style.borderColor = 'var(--color-primary)';
                
                bookingData.timeSlot = timeString;
                hiddenInput.value = timeString;
                detailsForm.style.display = 'block';
                
                setTimeout(() => {
                    detailsForm.scrollIntoView({ behavior: 'smooth', block: 'start' });
                }, 100);
            };
        }
        container.appendChild(btn);
    }
}

// 輔助：時間字串轉分鐘
function parseTimeToMinutes(timeStr) {
    const [h, m] = timeStr.split(':').map(Number);
    return h * 60 + m;
}
// 輔助：分鐘轉時間字串
function formatMinutesToTime(minutes) {
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
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
    // 使用新的 Config 判斷
    const mode = state.activeTemplate?.client_config?.booking?.mode || 'range';

    if (mode === 'range') {
        if (guesthouseData.numberOfNights > 0) {
            for (const pid in guesthouseData.selectedRooms) {
                const qty = guesthouseData.selectedRooms[pid];
                const info = guesthouseData.roomAvailability[pid];
                if (qty > 0 && info && info.pricePerNight !== null) {
                    const price = info.totalPrice !== null 
                        ? info.totalPrice 
                        : (info.pricePerNight * guesthouseData.numberOfNights);
                    total += price * qty;
                }
            }
        }
    } else {
        // Single Mode (Studio)
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
    isSubmitting = true;
    btn.disabled = true;
    btn.textContent = '處理中...';

    const activeForm = document.getElementById('booking-details-form');
    if (!activeForm) {
        ui.toast('找不到預約表單', 'error');
        resetButton(btn);
        return;
    }

    const name = document.getElementById('contact-name').value.trim();
    const phone = document.getElementById('contact-phone').value.trim();
    const useStoredValue = document.getElementById('use-stored-value-checkbox')?.checked;

    if (!name || !phone) { ui.toast('請填寫姓名與電話', 'error'); resetButton(btn); return; }
    if (!/^09\d{8}$/.test(phone)) { ui.toast('請輸入正確的 10 碼手機號碼', 'error'); resetButton(btn); return; }

    // 使用 Config 判斷
    const clientConfig = state.activeTemplate?.client_config?.booking || {};
    const mode = clientConfig.mode || 'range';
    const tsConfig = clientConfig.time_slots || { enabled: false };

    let payload = {
        userId: state.userProfile.userId,
        contactName: name,
        contactPhone: phone,
        useStoredValue: useStoredValue
    };

    if (mode === 'range') {
        if (!guesthouseData.startDate) { ui.toast('請選擇日期', 'error'); resetButton(btn); return; }
        const items = Object.entries(guesthouseData.selectedRooms).map(([pid, qty]) => ({ productId: pid, quantity: qty }));
        if (items.length === 0) { ui.toast('請選擇房型', 'error'); resetButton(btn); return; }
        
        payload.startDate = guesthouseData.startDate;
        payload.endDate = guesthouseData.endDate;
        payload.items = items;
        payload.bookingType = 'guesthouse';
    } else {
        // Single Mode
        const date = bookingData.date;
        let time = null;
        
        // 只有在時段功能啟用時，才強制檢查
        if (tsConfig.enabled) {
            time = document.getElementById('time-slot-select')?.value;
            if (!time) { ui.toast('請選擇時段', 'error'); resetButton(btn); return; }
        }
        
        if (!date) { ui.toast('請選擇日期', 'error'); resetButton(btn); return; }
        
        const items = [];
        activeForm.querySelectorAll('.booking-item-row').forEach(row => {
            const select = row.querySelector('select');
            const input = row.querySelector('input[type="number"]');
            
            if (select && input) {
                const name = select.value;
                const qty = parseInt(input.value);
                if(name && qty > 0) items.push({ name, quantity: qty });
            }
        });
        
        if (items.length === 0) { ui.toast('請至少選擇一個項目', 'error'); resetButton(btn); return; }

        payload.bookingDate = date;
        payload.timeSlot = time; // 可能為 null (若未啟用時段)
        payload.numOfPeople = 1;
        payload.items = items;
        payload.bookingType = 'studio';
    }

    try {
        const res = await api.createBooking(payload);
        api.sendMessage(state.userProfile.userId, res.confirmationMessage).catch(err => console.error("發送 LINE 失敗", err));
        
        document.getElementById('app-content').innerHTML = `
            <div style="text-align:center; padding:50px 20px;">
                <h2 style="color:var(--color-primary); font-size:2rem; margin-bottom:20px;">✅ 預約成功</h2>
                <p>系統已收到您的預約。</p>
                <p style="color:#888; font-size:0.9rem;">3 秒後自動跳轉至紀錄頁...</p>
            </div>
        `;
        setTimeout(() => {
            isSubmitting = false; 
            router.navigate('page-my-records');
        }, 3000);
    } catch (err) {
        ui.toast(err.message || "預約失敗", 'error');
        resetButton(btn);
    }
}

function resetButton(btn) {
    btn.disabled = false;
    btn.textContent = '確認預約';
    isSubmitting = false;
}

// ... (renderBookingDetails 保持不變，與上個版本相同) ...
export async function renderBookingDetails(bookingId) {
    // 為了節省篇幅，這部分未變動，直接引用舊邏輯即可
    // 但為了完整性，若需要請參考前一版回答的內容
    if (!bookingId) return;

    const container = document.getElementById('booking-details-content-container');
    const loadingEl = document.getElementById('booking-details-loading');
    // ... 綁定元素 ...
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
        const [bookingList, policyData] = await Promise.all([
            api.getBookingById(state.userProfile.userId, bookingId), 
            api.getBookingPolicy()
        ]);

        const booking = bookingList[0];
        if (!booking) throw new Error("找不到該筆預約資料");

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