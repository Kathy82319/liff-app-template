// public/modules/pages/booking.js
import { api } from '../api.js';
import { state } from '../state.js';
import { router } from '../router.js';
import { toast } from '../ui.js';

let bookingData = {};
let guesthouseData = { startDate: null, endDate: null, numberOfNights: 0, roomAvailability: {}, selectedRooms: {} };
let flatpickrInstance = null;

export async function init() {
    console.log("初始化預約頁面");
    const features = state.activeTemplate?.features || {};
    const terms = state.activeTemplate?.terms || {};
    
    // 設定標題與按鈕
    const pageTitle = document.querySelector('#page-booking .page-main-title');
    if (pageTitle) pageTitle.textContent = terms.BOOKING_PAGE_TITLE || '線上預約';
    
    // 綁定「查看我的預約」按鈕
    const viewBtn = document.getElementById('view-my-bookings-btn');
    if (viewBtn) {
        viewBtn.textContent = terms.PROFILE_BOOKINGS_BTN_LABEL || '查看我的預約';
        const newBtn = viewBtn.cloneNode(true);
        viewBtn.parentNode.replaceChild(newBtn, viewBtn);
        newBtn.addEventListener('click', () => router.navigate('page-my-records'));
    }

    // 載入產品
    if (state.allProducts.length === 0) {
        try { state.allProducts = await api.getProducts(); } catch(e) {}
    }

    // 預填聯絡人
    try {
        const userData = await api.getUserProfile(state.userProfile.userId);
        if (userData) {
            const nameInput = document.getElementById('contact-name');
            const phoneInput = document.getElementById('contact-phone');
            if (nameInput) nameInput.value = userData.real_name || state.userProfile.displayName || '';
            if (phoneInput) phoneInput.value = userData.phone || '';
            
            // 儲值金餘額顯示
            setupStoredValue(userData.stored_value_balance || 0);
        }
    } catch(e) {}

    // 綁定確認按鈕
    const confirmBtn = document.getElementById('confirm-booking-btn');
    if (confirmBtn) {
        const newBtn = confirmBtn.cloneNode(true);
        confirmBtn.parentNode.replaceChild(newBtn, confirmBtn);
        newBtn.addEventListener('click', handleBookingConfirmation);
    }

    // 根據樣板初始化不同模式
    if (state.config.LOGIC.ACTIVE_INDUSTRY_TEMPLATE === 'guesthouse_template') {
        initializeGuesthouse();
    } else {
        initializeStudio();
    }
}

function setupStoredValue(balance) {
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
                        alert(`餘額不足 (需 $${total}，餘額 $${balance})。`);
                        e.target.checked = false;
                        return;
                    }
                    if (!confirm("確認使用儲值金付款？")) e.target.checked = false;
                }
            });
        }
    }
}

// --- 民宿模式邏輯 ---
function initializeGuesthouse() {
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
        mode: "range", minDate: "today", dateFormat: "Y-m-d", locale: "zh_tw",
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

        const img = JSON.parse(p.images || '[]')[0] || 'https://placehold.co/100x100?text=No+Image';
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

// --- 工作室模式邏輯 (簡化版) ---
function initializeStudio() {
    const pageDiv = document.getElementById('page-booking');
    const detailsForm = document.getElementById('booking-details-form'); 
    
    if (!pageDiv || !detailsForm) return;

    let dateContainer = pageDiv.querySelector('#booking-datepicker-container');
    if (!dateContainer) {
        dateContainer = document.createElement('div');
        dateContainer.id = 'booking-datepicker-container';
        pageDiv.querySelector('.details-section').appendChild(dateContainer);
    }

    let timeSlotContainer = pageDiv.querySelector('#booking-time-slot-container');
    if (!timeSlotContainer) {
        timeSlotContainer = document.createElement('div');
        timeSlotContainer.id = 'booking-time-slot-container';
        timeSlotContainer.style.marginTop = '20px';
        timeSlotContainer.style.display = 'none'; 
        timeSlotContainer.innerHTML = `
            <label for="time-slot-select" style="display: block; margin-bottom: 10px;">請選擇時段：</label>
            <select id="time-slot-select"></select>
        `;
        dateContainer.parentNode.appendChild(timeSlotContainer);
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
            }
        });
    });

    const timeSlotSelect = document.getElementById('time-slot-select'); 
    if (timeSlotSelect) {
        timeSlotSelect.addEventListener('change', (e) => {
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

    const removeBtn = document.createElement('button');
    removeBtn.textContent = '-';
    removeBtn.style.cssText = 'background: var(--color-danger); border: none; color: white; border-radius: 4px; padding: 5px 10px;';
    removeBtn.onclick = () => itemRow.remove();

    itemRow.append(select, qtyInput, removeBtn);
    container.appendChild(itemRow);
}

// --- 共用計算邏輯 ---
function calculateCurrentTotal() {
    if (state.config.LOGIC.ACTIVE_INDUSTRY_TEMPLATE === 'guesthouse_template') {
        let total = 0;
        for (const pid in guesthouseData.selectedRooms) {
            const qty = guesthouseData.selectedRooms[pid];
            const info = guesthouseData.roomAvailability[pid];
            if (qty > 0 && info) {
                const price = info.totalPrice !== null ? info.totalPrice : (info.pricePerNight * guesthouseData.numberOfNights);
                total += price * qty;
            }
        }
        return Math.round(total);
    } else {
        // Studio 模式暫時簡化
        return 0; 
    }
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

    if (!name || !phone) { alert('請填寫姓名與電話'); btn.disabled = false; btn.textContent = '確認訂房'; return; }
    
    const isGuesthouse = state.config.LOGIC.ACTIVE_INDUSTRY_TEMPLATE === 'guesthouse_template';
    let payload = {
        userId: state.userProfile.userId,
        contactName: name,
        contactPhone: phone,
        useStoredValue: useStoredValue
    };

    if (isGuesthouse) {
        if (!guesthouseData.startDate) { alert('請選擇日期'); btn.disabled = false; btn.textContent = '確認訂房'; return; }
        const items = Object.entries(guesthouseData.selectedRooms).map(([pid, qty]) => ({ productId: pid, quantity: qty }));
        if (items.length === 0) { alert('請選擇房型'); btn.disabled = false; btn.textContent = '確認訂房'; return; }
        
        payload.startDate = guesthouseData.startDate;
        payload.endDate = guesthouseData.endDate;
        payload.items = items;
        payload.bookingType = 'guesthouse';
    } else {
        const date = bookingData.date;
        const time = document.getElementById('time-slot-select')?.value;
        if (!date || !time) { alert('請選擇日期與時段'); btn.disabled = false; btn.textContent = '確認預約'; return; }
        
        const items = [];
        document.querySelectorAll('.booking-item-row').forEach(row => {
            const name = row.querySelector('select').value;
            const qty = row.querySelector('input').value;
            if(name) items.push({ name, quantity: parseInt(qty) });
        });
        
        if (items.length === 0) { alert('請選擇項目'); btn.disabled = false; btn.textContent = '確認預約'; return; }

        payload.bookingDate = date;
        payload.timeSlot = time;
        payload.numOfPeople = 1;
        payload.items = items;
        payload.bookingType = 'studio';
    }

    try {
        const res = await api.createBooking(payload);
        // 發送通知 (非同步)
        fetch('/api/send-message', { 
            method: 'POST', 
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId: state.userProfile.userId, message: res.confirmationMessage }) 
        });
        
        document.getElementById('app-content').innerHTML = `<div style="text-align:center; padding:30px;"><h2>✅ 預約成功</h2><p>即將跳轉...</p></div>`;
        setTimeout(() => router.navigate('page-my-records'), 2000);
    } catch (err) {
        alert(err.message);
        btn.disabled = false;
        btn.textContent = isGuesthouse ? '確認訂房' : '確認預約';
    }
}

// 預約詳情 Modal (簡化版)
export function renderBookingDetails(bookingId) {
    if (!bookingId) return;
    const modal = document.getElementById('booking-details-modal');
    if (!modal) return;
    // 這裡通常會 fetch 單筆訂單詳情然後顯示在 modal
    // 為了簡化，建議將原本 script.js 中 initializeBookingDetailsPage 的邏輯移入
    // 並在此處呼叫 showModal('#booking-details-modal')
}