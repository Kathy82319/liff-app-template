// public/modules/pages/booking.js (v12.0 - Config-Driven Architecture)
import { api } from '../api.js';
import { state } from '../state.js';
import { router } from '../router.js';
import { ui } from '../ui.js';

let isSubmitting = false;
let flatpickrInstance = null;

// 預約資料暫存 (通用)
let bookingPayload = {
    date: null,      // 單日模式用
    startDate: null, // 區間模式用
    endDate: null,   // 區間模式用
    timeSlot: null,
    items: [],       // { productId, name, quantity, price }
    people: 1
};

// 民宿模式專用暫存 (房況與選房狀態)
let guesthouseData = { 
    roomAvailability: {}, 
    selectedRooms: {}, // { productId: qty }
    numberOfNights: 0
};

// =================================================================
// 1. 初始化預約頁面 (Entry Point)
// =================================================================
export async function init() {
    console.log("[Booking Init] Starting with config-driven logic...");
    
    // 1. 讀取設定 (從 state.config 獲取，該物件已由 get-app-config API 填充)
    const clientConfig = state.config?.client_config || {};
    const bookingConfig = clientConfig.booking || {};
    const globalConfig = clientConfig.global || {};
    
    // 2. 設定頁面標題
    const pageTitle = document.querySelector('#page-booking .page-main-title');
    if (pageTitle) pageTitle.textContent = bookingConfig.page_title || '線上預約';

    // 3. 綁定「查看我的預約」按鈕
    const viewBtn = document.getElementById('view-my-bookings-btn');
    if (viewBtn) {
        viewBtn.textContent = clientConfig.profile?.label_records || '查看我的預約';
        // 使用 cloneNode 移除舊監聽器
        const newBtn = viewBtn.cloneNode(true);
        viewBtn.parentNode.replaceChild(newBtn, viewBtn);
        newBtn.addEventListener('click', () => router.navigate('page-my-records'));
    }

    // 4. 確保產品資料已載入
    if (state.allProducts.length === 0) {
        try { 
            state.allProducts = await api.getProducts(); 
        } catch(e) {
            console.error("無法載入產品列表", e);
            ui.toast("載入產品失敗，請重新整理", "error");
        }
    }

    // 5. 初始化 UI 顯示/隱藏 (根據設定)
    setupFieldVisibility(bookingConfig);

    // 6. 預填聯絡人資訊 & 儲值金顯示
    await prefillUserData(bookingConfig);

    // 7. 綁定確認預約按鈕
    const confirmBtn = document.getElementById('confirm-booking-btn');
    if (confirmBtn) {
        const newBtn = confirmBtn.cloneNode(true);
        confirmBtn.parentNode.replaceChild(newBtn, confirmBtn);
        newBtn.addEventListener('click', () => handleBookingConfirmation(bookingConfig));
    }

    // 8. 根據模式初始化日曆與邏輯
    // 這是最核心的分歧點：決定是「區間模式」還是「單日模式」
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
    // A. 人數欄位
    const peopleGroup = document.getElementById('booking-people-group');
    if (peopleGroup) {
        peopleGroup.style.display = config.enable_people_count ? 'block' : 'none';
        // 若隱藏，預設值為 1
        if (!config.enable_people_count) document.getElementById('booking-people-input').value = 1;
    }

    // B. 備註欄位
    const notesGroup = document.getElementById('booking-notes-group');
    if (notesGroup) {
        notesGroup.style.display = config.enable_notes ? 'block' : 'none';
    }

    // C. 儲值金欄位
    const storedValueGroup = document.getElementById('stored-value-payment-group');
    if (storedValueGroup) {
        storedValueGroup.style.display = config.enable_stored_value_payment ? 'block' : 'none';
    }

    // D. 根據模式調整標籤文字
    const dateLabel = document.querySelector('label[for="booking-date-picker"]');
    if (dateLabel) {
        dateLabel.textContent = (config.mode === 'range') ? '入住 / 退房日期:' : '預約日期:';
    }
}

async function prefillUserData(config) {
    try {
        if (state.userProfile && state.userProfile.userId) {
            const userData = await api.getUserProfile(state.userProfile.userId);
            if (userData) {
                const nameInput = document.getElementById('contact-name');
                const phoneInput = document.getElementById('contact-phone');
                
                if (nameInput) nameInput.value = userData.real_name || state.userProfile.displayName || '';
                if (phoneInput) phoneInput.value = userData.phone || '';
                
                // 處理儲值金顯示
                if (config.enable_stored_value_payment) {
                    setupStoredValueLogic(userData.stored_value_balance || 0);
                }
            }
        }
    } catch(e) {
        console.warn("預填使用者資料失敗", e);
    }
}

function setupStoredValueLogic(balance) {
    const display = document.getElementById('stored-value-balance-display');
    const checkbox = document.getElementById('use-stored-value-checkbox');

    if (display) {
        display.textContent = `(餘額: $${balance})`;
        if (checkbox) {
            if (balance <= 0) {
                checkbox.disabled = true;
                checkbox.checked = false;
                display.style.color = '#999';
            } else {
                checkbox.disabled = false;
                display.style.color = 'var(--color-primary)';
            }
            
            // 重新綁定 change 事件以加入防呆
            const newCheckbox = checkbox.cloneNode(true);
            checkbox.parentNode.replaceChild(newCheckbox, checkbox);
            newCheckbox.addEventListener('change', (e) => {
                if (e.target.checked) {
                    const total = calculateTotalPrice();
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
                    if (!confirm("確認使用儲值金付款？使用後若取消預約，儲值金將不自動歸還(需人工處理)，請謹慎操作。")) {
                        e.target.checked = false;
                    }
                }
            });
        }
    }
}

// =================================================================
// 3. 模式 A: 日期區間模式 (Range Mode - 民宿邏輯)
// =================================================================
async function initializeDateRangePicker(config) {
    console.log("[Booking] Initializing Range Mode (Guesthouse)");
    const pickerInput = document.getElementById('booking-date-picker');
    const itemSelectionSection = document.getElementById('booking-item-selection-section');
    const guesthouseContainer = document.getElementById('guesthouse-room-container');
    const studioContainer = document.getElementById('studio-item-container');
    const timeSlotContainer = document.getElementById('booking-time-slot-container');

    // 切換 UI 顯示：顯示民宿選房區，隱藏工作室選項區
    if (itemSelectionSection) itemSelectionSection.style.display = 'block';
    if (guesthouseContainer) guesthouseContainer.style.display = 'block';
    if (studioContainer) studioContainer.style.display = 'none';
    if (timeSlotContainer) timeSlotContainer.style.display = 'none'; // 民宿不需要時段

    // 重置資料
    guesthouseData = { startDate: null, endDate: null, numberOfNights: 0, roomAvailability: {}, selectedRooms: {} };
    renderGuesthouseRooms(null); // 渲染空狀態

    if (flatpickrInstance) flatpickrInstance.destroy();
    
    flatpickrInstance = flatpickr(pickerInput, {
        mode: "range", 
        minDate: "today", 
        dateFormat: "Y-m-d", 
        locale: "zh_tw",
        disableMobile: true,
        placeholder: "請點擊選擇入住與退房日期",
        onClose: async (selectedDates) => {
            if (selectedDates.length === 2) {
                const start = selectedDates[0];
                const end = selectedDates[1];
                
                // 防止選同一天
                if (start.getTime() === end.getTime()) {
                    ui.toast("退房日期必須晚於入住日期", "warning");
                    pickerInput.clear();
                    return;
                }

                guesthouseData.startDate = flatpickr.formatDate(start, "Y-m-d");
                guesthouseData.endDate = flatpickr.formatDate(end, "Y-m-d");
                guesthouseData.numberOfNights = Math.round((end - start) / 86400000);

                // 呼叫後端查詢房況
                guesthouseContainer.style.opacity = '0.5';
                try {
                    const data = await api.checkRoomAvailability(guesthouseData.startDate, guesthouseData.endDate);
                    guesthouseContainer.style.opacity = '1';
                    renderGuesthouseRooms(data);
                } catch (e) {
                    guesthouseContainer.style.opacity = '1';
                    console.error(e);
                    ui.toast("查詢房況失敗，請稍後再試", "error");
                }
            } else {
                guesthouseData.startDate = null; 
                renderGuesthouseRooms(null);
                calculateTotalPrice();
            }
        }
    });
}

function renderGuesthouseRooms(availabilityData) {
    const container = document.getElementById('guesthouse-room-container');
    const isPreview = !availabilityData;
    guesthouseData.roomAvailability = availabilityData || {};
    if (!isPreview) guesthouseData.selectedRooms = {}; // 重置選取

    // 只顯示上架的產品
    const products = state.allProducts.filter(p => p.is_visible);
    
    if (products.length === 0) {
        container.innerHTML = '<p style="text-align:center; padding:20px;">目前無可預訂房型。</p>';
        return;
    }

    let hasBookable = false;
    container.innerHTML = products.map(p => {
        // 預設顯示 (尚未選擇日期時)
        let priceHtml = p.price_weekday !== null ? `$${p.price_weekday} <span style="font-size:0.8em; color:#888;">起 / 晚</span>` : '洽詢';
        let maxQty = 0;
        let isDisabled = true;
        let statusHtml = '';

        if (!isPreview) {
            const info = availabilityData[p.product_id];
            // 判斷該房型在該區間是否可訂
            if (info && info.isAvailable) {
                maxQty = info.minAvailableQuantity || 0;
                
                // 顯示均價與總價
                const avgPrice = info.pricePerNight !== null ? `$${info.pricePerNight}` : '洽詢';
                const totalPrice = info.totalPrice !== null ? `$${info.totalPrice}` : null;
                
                if (totalPrice) {
                    priceHtml = `
                        <div style="font-weight:bold;">${avgPrice} <span style="font-size:0.8em; color:#888; font-weight:normal;">/ 晚</span></div>
                        <div style="font-size:0.9rem; color:var(--color-primary); font-weight:bold; margin-top:2px;">${guesthouseData.numberOfNights}晚 小計 $${totalPrice}</div>
                    `;
                } else {
                    priceHtml = `${avgPrice} <span style="font-size:0.8em; color:#888;">/ 晚</span>`;
                }

                isDisabled = false;
                hasBookable = true;
            } else {
                statusHtml = '<span style="color:var(--color-danger); font-size:0.85rem;">🚫 已售完 / 未開放</span>';
            }
        } else {
            statusHtml = '<span style="font-size:0.85rem; color: var(--color-primary);">← 請先選擇日期</span>';
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
                <select class="room-qty-select" data-pid="${p.product_id}" ${isDisabled ? 'disabled' : ''} style="padding: 5px;">${opts}</select>
                ${!isDisabled ? `<span class="room-stock-badge">剩 ${maxQty} 間</span>` : ''}
            </div>
        </div>`;
    }).join('');

    // 綁定下拉選單事件
    container.querySelectorAll('.room-qty-select').forEach(sel => {
        sel.addEventListener('change', (e) => {
            const qty = parseInt(e.target.value);
            const pid = e.target.dataset.pid;
            if (qty > 0) guesthouseData.selectedRooms[pid] = qty;
            else delete guesthouseData.selectedRooms[pid];
            calculateTotalPrice();
        });
    });

    if (!isPreview && !hasBookable) {
        container.innerHTML += '<p style="text-align:center; color:var(--color-danger); margin-top:10px;">抱歉，此日期區間已無空房，請嘗試其他日期。</p>';
    }
    
    // 初始計算 (歸零)
    calculateTotalPrice();
}

// =================================================================
// 4. 模式 B: 單一日期模式 (Single Mode - 工作室邏輯)
// =================================================================
async function initializeSingleDatePicker(config) {
    console.log("[Booking] Initializing Single Mode (Studio)");
    const pickerInput = document.getElementById('booking-date-picker');
    const itemSelectionSection = document.getElementById('booking-item-selection-section');
    const guesthouseContainer = document.getElementById('guesthouse-room-container');
    const studioContainer = document.getElementById('studio-item-container');
    const timeSlotContainer = document.getElementById('booking-time-slot-container');

    // 切換 UI：顯示工作室選項區，隱藏民宿區
    if (itemSelectionSection) itemSelectionSection.style.display = 'none'; // 預設先隱藏，選完時間再顯示
    if (guesthouseContainer) guesthouseContainer.style.display = 'none';
    
    // 根據設定決定是否顯示時段選擇
    if (timeSlotContainer) {
        timeSlotContainer.style.display = config.enable_time_slots ? 'block' : 'none';
        // 如果不選時段，則直接顯示項目選擇區
        if (!config.enable_time_slots) {
            itemSelectionSection.style.display = 'block';
            if (studioContainer) studioContainer.style.display = 'block';
        }
    }

    // 重置資料
    bookingPayload = { date: null, timeSlot: null, items: [], people: 1 };
    renderStudioItems(config); // 預先渲染項目列表

    if (flatpickrInstance) flatpickrInstance.destroy();

    // 獲取公休日設定 (API)
    let enabledDates = [];
    try {
        const res = await api.getBookingsCheckInit();
        enabledDates = res?.enabledDates || [];
    } catch(e) { console.warn("無法獲取公休日設定", e); }

    const fpConfig = {
        mode: "single",
        minDate: "today",
        dateFormat: "Y-m-d",
        locale: "zh_tw",
        disableMobile: true,
        placeholder: "請點擊選擇預約日期",
        onChange: (selected, dateStr) => {
            bookingPayload.date = dateStr;
            
            if (config.enable_time_slots) {
                // 如果開啟時段，根據日期渲染時段按鈕
                renderTimeSlots(dateStr, config.time_slot_config);
                // 隱藏項目選擇，直到選完時段
                if (itemSelectionSection) itemSelectionSection.style.display = 'none';
            } else {
                // 如果不開啟時段，直接顯示項目選擇
                if (itemSelectionSection) itemSelectionSection.style.display = 'block';
                if (studioContainer) studioContainer.style.display = 'block';
                // 更新價格 (可能有平日/假日價差)
                updateStudioItemsPrice(dateStr);
            }
        }
    };

    // 如果有設定可預約日 (白名單)，則只允許選擇這些日期
    if (enabledDates.length > 0) {
        fpConfig.enable = enabledDates;
    }

    flatpickrInstance = flatpickr(pickerInput, fpConfig);
}

function renderTimeSlots(dateStr, slotConfig) {
    const container = document.getElementById('time-slot-buttons');
    const itemSection = document.getElementById('booking-item-selection-section');
    const studioContainer = document.getElementById('studio-item-container');
    
    if (!container) return;
    container.innerHTML = '';
    
    // 如果沒有設定檔，使用預設值
    const startStr = slotConfig?.start || "09:00";
    const endStr = slotConfig?.end || "21:00";
    const interval = slotConfig?.interval || 60; // 分鐘

    // 解析時間
    const [startH, startM] = startStr.split(':').map(Number);
    const [endH, endM] = endStr.split(':').map(Number);
    
    const startTime = new Date(); startTime.setHours(startH, startM, 0, 0);
    const endTime = new Date(); endTime.setHours(endH, endM, 0, 0);
    
    // 用於檢查是否過期
    const now = new Date();
    const selectedDate = new Date(dateStr + 'T00:00:00');
    const isToday = now.toDateString() === selectedDate.toDateString();

    let currentTime = new Date(startTime);
    let hasSlots = false;

    while (currentTime < endTime) {
        hasSlots = true;
        const timeString = currentTime.toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit', hour12: false });
        
        // 檢查是否已過期 (如果是今天)
        // 簡單邏輯：如果現在時間 > 時段開始時間，就停用
        // 若要更精確 (如加上緩衝時間)，可在此修改
        let isDisabled = false;
        if (isToday && currentTime <= now) {
            isDisabled = true;
        }

        const btn = document.createElement('button');
        btn.textContent = timeString;
        btn.className = 'time-slot-btn';
        btn.type = 'button'; // 避免觸發 submit
        
        if (isDisabled) {
            btn.disabled = true;
            btn.classList.add('disabled');
            btn.title = "此時段已過";
        } else {
            btn.onclick = () => {
                // UI 狀態切換
                container.querySelectorAll('.time-slot-btn').forEach(b => b.classList.remove('selected'));
                btn.classList.add('selected');
                
                // 記錄資料
                bookingPayload.timeSlot = timeString;
                
                // 顯示下一步：項目選擇
                if (itemSection) itemSection.style.display = 'block';
                if (studioContainer) studioContainer.style.display = 'block';
                
                // 自動捲動
                setTimeout(() => {
                    itemSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
                }, 100);
                
                // 更新價格 (以防萬一)
                updateStudioItemsPrice(dateStr);
            };
        }
        
        container.appendChild(btn);
        
        // 增加時間間隔
        currentTime.setMinutes(currentTime.getMinutes() + interval);
    }

    if (!hasSlots) {
        container.innerHTML = '<p style="color:#999;">本日無可預約時段。</p>';
    }
}

function renderStudioItems(config) {
    const container = document.getElementById('booking-items-list'); // UL or Div
    const addBtn = document.getElementById('add-studio-item-btn');
    
    if (!container) return;
    container.innerHTML = ''; // 清空

    // 判斷是否開啟「數量選擇」
    const enableQty = config.enable_quantity !== false; // 預設開啟，若 false 則隱藏

    // 建立新增項目的函式
    window.addStudioItemRow = () => {
        if (container.children.length >= 5) {
            ui.toast("最多選擇 5 個項目", "warning");
            return;
        }

        const itemRow = document.createElement('div');
        itemRow.className = 'booking-item-row';
        
        // 產品選單
        const select = document.createElement('select');
        select.className = 'booking-item-select';
        select.add(new Option('-- 請選擇項目 --', ''));
        state.allProducts.filter(p => p.is_visible).forEach(p => {
            select.add(new Option(p.name, p.product_id)); // Value 存 ID 比較穩
        });

        // 數量輸入框 (依設定顯示/隱藏)
        const qtyInput = document.createElement('input');
        qtyInput.type = 'number';
        qtyInput.className = 'booking-item-qty';
        qtyInput.value = 1;
        qtyInput.min = 1;
        qtyInput.style.display = enableQty ? 'inline-block' : 'none';

        // 價格顯示
        const priceDisplay = document.createElement('span');
        priceDisplay.className = 'booking-item-price-hint';
        
        // 刪除按鈕
        const removeBtn = document.createElement('button');
        removeBtn.textContent = '✕';
        removeBtn.className = 'btn-remove-item';
        removeBtn.onclick = () => {
            itemRow.remove();
            calculateTotalPrice(); // 重新計算
        };

        // 事件綁定
        select.addEventListener('change', () => {
            updateRowPrice(itemRow, select.value, bookingPayload.date);
            calculateTotalPrice();
        });
        qtyInput.addEventListener('change', calculateTotalPrice);

        itemRow.append(select, qtyInput, priceDisplay, removeBtn);
        container.appendChild(itemRow);
    };

    // 綁定新增按鈕
    if (addBtn) {
        // 清除舊事件
        const newAddBtn = addBtn.cloneNode(true);
        addBtn.parentNode.replaceChild(newAddBtn, addBtn);
        newAddBtn.addEventListener('click', window.addStudioItemRow);
    }

    // 預設先加一列
    window.addStudioItemRow();
}

function updateRowPrice(row, productId, dateStr) {
    const priceDisplay = row.querySelector('.booking-item-price-hint');
    const product = state.allProducts.find(p => p.product_id === productId);
    
    if (product) {
        // 根據日期 (平假日) 取得價格
        const price = getPriceForDate(dateStr, product);
        if (price !== null) {
            priceDisplay.textContent = `$${price}`;
            row.dataset.price = price; // 暫存價格在 DOM 屬性方便計算
        } else {
            priceDisplay.textContent = '(價格未定)';
            row.dataset.price = 0;
        }
    } else {
        priceDisplay.textContent = '';
        row.dataset.price = 0;
    }
}

function updateStudioItemsPrice(dateStr) {
    document.querySelectorAll('.booking-item-row').forEach(row => {
        const select = row.querySelector('.booking-item-select');
        if (select && select.value) updateRowPrice(row, select.value, dateStr);
    });
    calculateTotalPrice();
}

// =================================================================
// 5. 共用計算與提交邏輯
// =================================================================

// 根據日期與產品設定，回傳正確價格
function getPriceForDate(dateString, product) {
    if (!product) return null;
    // 如果沒有日期 (尚未選擇)，預設回傳平日價
    if (!dateString) return product.price_weekday || null;

    const date = new Date(dateString + 'T00:00:00');
    const dayOfWeek = date.getDay(); // 0 (日) - 6 (六)

    if (dayOfWeek === 5) { // 週五
        return product.price_friday !== null ? product.price_friday : product.price_weekday;
    } else if (dayOfWeek === 6) { // 週六
        return product.price_saturday !== null ? product.price_saturday : product.price_weekday;
    } else { // 平日 (日~四)
        return product.price_weekday !== null ? product.price_weekday : null;
    }
}

function calculateCurrentTotal() {
    let total = 0;
    // 判斷目前是哪個模式
    // 這裡我們直接看 guesthouseData 是否有資料來判斷，或者依賴全域 config (較佳)
    const mode = state.config?.client_config?.booking?.mode;

    if (mode === 'range') {
        // 民宿模式：累加 (單價 x 晚數 x 數量)
        if (guesthouseData.numberOfNights > 0) {
            for (const pid in guesthouseData.selectedRooms) {
                const qty = guesthouseData.selectedRooms[pid];
                const info = guesthouseData.roomAvailability[pid];
                
                if (qty > 0 && info) {
                    // 優先使用後端回傳的期間總價 (totalPrice)，若無則用均價 x 晚數
                    const price = info.totalPrice !== null 
                        ? info.totalPrice 
                        : (info.pricePerNight * guesthouseData.numberOfNights);
                    total += price * qty;
                }
            }
        }
    } else {
        // 工作室模式：累加 (單價 x 數量)
        document.querySelectorAll('.booking-item-row').forEach(row => {
            const qtyInput = row.querySelector('.booking-item-qty');
            const price = parseFloat(row.dataset.price) || 0;
            // 確保數量至少為 1 (即使隱藏也是 1)
            const qty = qtyInput ? (parseInt(qtyInput.value) || 1) : 1;
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

async function handleBookingConfirmation(config) {
    if (isSubmitting) return;

    const btn = document.getElementById('confirm-booking-btn');
    
    // 1. 基礎驗證
    const name = document.getElementById('contact-name').value.trim();
    const phone = document.getElementById('contact-phone').value.trim();
    const notes = document.getElementById('booking-notes-input')?.value.trim();
    const people = parseInt(document.getElementById('booking-people-input')?.value) || 1;
    const useStoredValue = document.getElementById('use-stored-value-checkbox')?.checked;

    if (!name || !phone) { ui.toast('請填寫姓名與電話', 'error'); return; }
    if (!/^09\d{8}$/.test(phone)) { ui.toast('請輸入正確的手機號碼', 'error'); return; }

    // 2. 根據模式建構 Payload
    let payload = {
        userId: state.userProfile.userId,
        contactName: name,
        contactPhone: phone,
        notes: notes,
        numOfPeople: people,
        useStoredValue: useStoredValue
    };

    if (config.mode === 'range') {
        // --- 民宿模式 ---
        if (!guesthouseData.startDate) { ui.toast('請選擇入住日期', 'error'); return; }
        
        // 轉換 selectedRooms 物件為陣列
        const items = Object.entries(guesthouseData.selectedRooms).map(([pid, qty]) => ({ 
            productId: pid, 
            quantity: qty 
        }));
        
        if (items.length === 0) { ui.toast('請選擇至少一間房型', 'error'); return; }
        
        payload.bookingType = 'guesthouse';
        payload.startDate = guesthouseData.startDate;
        payload.endDate = guesthouseData.endDate;
        payload.items = items; // { productId, quantity }

    } else {
        // --- 工作室模式 ---
        if (!bookingPayload.date) { ui.toast('請選擇預約日期', 'error'); return; }
        if (config.enable_time_slots && !bookingPayload.timeSlot) { ui.toast('請選擇預約時段', 'error'); return; }
        
        // 收集 DOM 中的項目
        const items = [];
        document.querySelectorAll('.booking-item-row').forEach(row => {
            const select = row.querySelector('select');
            const qtyInput = row.querySelector('.booking-item-qty');
            
            if (select && select.value) {
                // 這裡我們傳送產品名稱與 ID，方便後端查價
                // 注意：後端 API 應該要依賴 ID 查價比較安全，或是名稱
                // 舊版 API 依賴 name，這裡同時傳 name 保持相容性
                const productName = select.options[select.selectedIndex].text;
                const qty = qtyInput ? (parseInt(qtyInput.value) || 1) : 1;
                
                items.push({ 
                    name: productName, 
                    productId: select.value,
                    quantity: qty 
                });
            }
        });

        if (items.length === 0) { ui.toast('請至少選擇一個服務項目', 'error'); return; }

        payload.bookingType = 'studio';
        payload.bookingDate = bookingPayload.date;
        payload.timeSlot = bookingPayload.timeSlot || ''; // 若未開啟時段則為空字串
        payload.items = items;
    }

    // 3. 送出請求
    isSubmitting = true;
    btn.disabled = true;
    btn.textContent = '處理中...';

    try {
        const res = await api.createBooking(payload);
        
        // 不等待 LINE 訊息發送，避免卡住介面
        api.sendMessage(state.userProfile.userId, res.confirmationMessage).catch(err => console.error("發送 LINE 失敗", err));
        
        // 顯示成功並跳轉
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
        btn.disabled = false;
        btn.textContent = '確認預約';
        isSubmitting = false;
    }
}