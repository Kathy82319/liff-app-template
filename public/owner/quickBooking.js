// public/owner/modules/quickBooking.js
import { api } from '../api.js';
import { state } from '../state.js';
import { ui } from '../ui.js';

export function openQuickBookingModal() {
    const modal = document.getElementById('quick-booking-modal');
    const form = document.getElementById('quick-booking-form');
    const itemSelect = document.getElementById('qb-booking-item');
    
    if (!modal) return;

    form.reset();
    document.getElementById('qb-customer-search-results').style.display = 'none';
    document.getElementById('qb-customer-selected-view').style.display = 'none';
    document.getElementById('qb-customer-search-input').style.display = 'block';
    
    // 填充產品
    itemSelect.innerHTML = '<option value="">-- 選擇項目 --</option>';
    const itemsToShow = state.allProducts.filter(p => p.is_visible);
    itemsToShow.forEach(p => {
        const priceText = p.price_weekday != null ? `$${p.price_weekday}` : '洽詢';
        itemSelect.add(new Option(`${p.name} (${priceText})`, p.product_id));
    });

    // 初始化日期 (Flatpickr)
    if (state.qbDatePicker) state.qbDatePicker.destroy();
    state.qbDatePicker = flatpickr("#qb-booking-date", {
        dateFormat: "Y-m-d",
        locale: "zh_tw",
        defaultDate: "today"
    });

    // 預設時間 (下一個半點)
    const now = new Date();
    const nextHour = (now.getMinutes() > 30) ? now.getHours() + 1 : now.getHours();
    const nextMinute = (now.getMinutes() > 30) ? '00' : '30';
    document.getElementById('qb-booking-time').value = `${String(nextHour).padStart(2, '0')}:${nextMinute}`;

    modal.style.display = 'flex';
    ui.updateHistoryState('quick-booking', 'open');
    
    // 重新綁定搜尋輸入 (如果尚未綁定)
    const searchInput = document.getElementById('qb-customer-search-input');
    if (!searchInput.dataset.bound) {
        searchInput.addEventListener('input', handleCustomerSearchInput);
        document.getElementById('qb-customer-search-results').addEventListener('click', handleCustomerSelect);
        document.getElementById('qb-customer-change-btn').addEventListener('click', resetCustomerSearch);
        form.addEventListener('submit', handleQuickBookingSubmit);
        searchInput.dataset.bound = 'true';
    }
}

async function handleCustomerSearchInput(e) {
    const query = e.target.value.trim();
    const resultsDiv = document.getElementById('qb-customer-search-results');
    resultsDiv.innerHTML = '';
    
    if (query.length < 1) {
        resultsDiv.style.display = 'none';
        return;
    }
    
    try {
        const users = await api.fetchData(`/api/admin/user-search?q=${encodeURIComponent(query)}`);
        if (users.length > 0) {
            resultsDiv.innerHTML = users.map(user => `
                <div class="customer-result-item" data-user-id="${user.user_id}" data-user-name="${user.line_display_name}" data-user-phone="${user.phone || ''}" style="padding: 10px; cursor: pointer; border-bottom: 1px solid var(--color-secondary);">
                    <p style="margin:0; font-weight: bold;">${user.line_display_name}</p>
                    <small style="color: var(--color-text-secondary);">${user.phone || '未設定電話'}</small>
                </div>
            `).join('');
            resultsDiv.style.display = 'block';
        } else {
            resultsDiv.innerHTML = '<div style="padding: 10px; color: #888;">找不到顧客 (將建立為新訪客)</div>';
            resultsDiv.style.display = 'block';
        }
    } catch (error) { console.error(error); }
}

function handleCustomerSelect(e) {
    const item = e.target.closest('.customer-result-item');
    if (!item) return;
    
    document.getElementById('qb-customer-selected-id').value = item.dataset.userId;
    document.getElementById('qb-customer-selected-name').textContent = item.dataset.userName;
    document.getElementById('qb-contact-phone').value = item.dataset.userPhone;
    
    document.getElementById('qb-customer-search-results').style.display = 'none';
    document.getElementById('qb-customer-search-input').style.display = 'none';
    document.getElementById('qb-customer-selected-view').style.display = 'block';
}

function resetCustomerSearch() {
    document.getElementById('qb-customer-selected-id').value = '';
    document.getElementById('qb-customer-selected-name').textContent = '';
    document.getElementById('qb-contact-phone').value = '';
    document.getElementById('qb-customer-search-input').value = '';
    document.getElementById('qb-customer-search-input').style.display = 'block';
    document.getElementById('qb-customer-selected-view').style.display = 'none';
}

async function handleQuickBookingSubmit(e) {
    e.preventDefault();
    const btn = document.getElementById('quick-booking-submit-btn');
    btn.disabled = true;
    btn.textContent = '建立中...';

    try {
        const userId = document.getElementById('qb-customer-selected-id').value || `walk-in-${Date.now()}`;
        const contactName = document.getElementById('qb-customer-selected-name').textContent || document.getElementById('qb-customer-search-input').value.trim();
        
        if (!contactName) throw new Error('請選擇顧客或輸入名稱');
        
        const product = state.allProducts.find(p => p.product_id === document.getElementById('qb-booking-item').value);
        if (!product) throw new Error('請選擇項目');

        const bookingDate = document.getElementById('qb-booking-date').value;
        // 簡單計算價格 (只抓平日價當代表)
        const price = product.price_weekday || 0; 
        const qty = 1;
        const people = document.getElementById('qb-booking-people').value;

        const payload = {
            userId, contactName,
            contactPhone: document.getElementById('qb-contact-phone').value.trim() || null,
            bookingDate,
            timeSlot: document.getElementById('qb-booking-time').value,
            numOfPeople: parseInt(people),
            totalAmount: price * qty,
            notes: document.getElementById('qb-booking-notes').value.trim() || null,
            items: [{ name: product.name, qty: qty, price: price }]
        };

        await api.fetchData('/api/admin/create-booking', {
            method: 'POST', 
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        ui.toast('快速預約建立成功！');
        ui.hideAllModals();
        // 如果在預約分頁，則重新載入
        const bookingModule = await import('./booking.js');
        bookingModule.reload();

    } catch (error) {
        ui.toast(`建立失敗: ${error.message}`);
    } finally {
        btn.disabled = false;
        btn.textContent = '確認建立';
    }
}