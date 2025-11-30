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
        // 使用 cloneNode 清除舊事件
        const newBtn = viewBtn.cloneNode(true);
        viewBtn.parentNode.replaceChild(newBtn, viewBtn);
        newBtn.addEventListener('click', () => router.navigate('page-my-records'));
    }

    // 載入產品 (如果沒有)
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
                if (start.getTime() === end.getTime()) return; // 同一天無效

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
    // 這裡需要移植原 script.js 中動態建立 DOM (datepickerContainer, timeSlotContainer) 的邏輯
    // 為節省篇幅，假設 HTML 結構已由 script.js 的動態邏輯建立，重點在於 flatpickr 和 API
    const pageDiv = document.getElementById('page-booking');
    let dateContainer = pageDiv.querySelector('#booking-datepicker-container');
    
    // 如果 DOM 不存在，動態建立 (移植自原 script.js)
    if (!dateContainer) {
        dateContainer = document.createElement('div');
        dateContainer.id = 'booking-datepicker-container';
        pageDiv.querySelector('.details-section').appendChild(dateContainer);
        // ... (其他 DOM 建立邏輯，如 timeSlotContainer, itemsContainer)
        // 建議：將這些 DOM 結構直接寫入 index.html 模板中會更乾淨，但為了相容性，這裡保留動態建立
    }
    // ... (初始化 Items Row 等 UI) ...
    
    // 初始化 Flatpickr
    api.getBookingsCheckInit().then(res => {
        flatpickr(dateContainer, {
            inline: true, minDate: "today", dateFormat: "Y-m-d", locale: "zh_tw",
            enable: res.enabledDates,
            onChange: (selected, dateStr) => {
                bookingData.date = dateStr;
                // 更新時段選單、價格...
            }
        });
    });
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
        // Studio 模式計算 (略)
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

    // 收集表單資料
    const name = document.getElementById('contact-name').value.trim();
    const phone = document.getElementById('contact-phone').value.trim();
    const useStoredValue = document.getElementById('use-stored-value-checkbox')?.checked;

    // 驗證
    if (!name || !phone) { alert('請填寫姓名與電話'); btn.disabled = false; return; }
    
    const isGuesthouse = state.config.LOGIC.ACTIVE_INDUSTRY_TEMPLATE === 'guesthouse_template';
    let payload = {
        userId: state.userProfile.userId,
        contactName: name,
        contactPhone: phone,
        useStoredValue: useStoredValue
    };

    if (isGuesthouse) {
        if (!guesthouseData.startDate) { alert('請選擇日期'); btn.disabled = false; return; }
        const items = Object.entries(guesthouseData.selectedRooms).map(([pid, qty]) => ({ productId: pid, quantity: qty }));
        if (items.length === 0) { alert('請選擇房型'); btn.disabled = false; return; }
        
        payload.startDate = guesthouseData.startDate;
        payload.endDate = guesthouseData.endDate;
        payload.items = items;
        payload.bookingType = 'guesthouse';
    } else {
        // Studio payload building...
    }

    try {
        const res = await api.createBooking(payload);
        // 發送通知
        await fetch('/api/send-message', { 
            method: 'POST', 
            body: JSON.stringify({ userId: state.userProfile.userId, message: res.confirmationMessage }) 
        });
        
        document.getElementById('app-content').innerHTML = `<div style="text-align:center; padding:30px;"><h2>✅ 預約成功</h2><p>即將跳轉...</p></div>`;
        setTimeout(() => router.navigate('page-my-records'), 2000);
    } catch (err) {
        alert(err.message);
        btn.disabled = false;
        btn.textContent = '確認訂房';
    }
}

// 預約詳情 Modal 渲染 (供 router 呼叫)
export function renderBookingDetails(bookingId) {
    // 這裡需要實作顯示 booking-details-modal 的邏輯
    // 包含 fetch API 獲取單筆預約詳情，並填入 Modal
    // 由於篇幅，這裡建議移植原 script.js 中的 initializeBookingDetailsPage 邏輯
}