// public/owner/modules/customer.js
import { api } from '../api.js';
import { state } from '../state.js';
import { ui } from '../ui.js';
import { openDetailsModal } from './detailsModal.js';

export function init() {
    const searchBtn = document.getElementById('customer-search-btn');
    const searchInput = document.getElementById('customer-search-input');
    const resultsContainer = document.getElementById('customer-search-results');
    
    if (searchBtn && !searchBtn.dataset.bound) {
        searchBtn.addEventListener('click', searchCustomers);
        searchInput.addEventListener('keypress', (e) => { if(e.key === 'Enter') searchCustomers(); });
        
        resultsContainer.addEventListener('click', (e) => {
            const item = e.target.closest('.customer-result-item');
            if (item && item.dataset.userId) {
                openDetailsModal('user', item.dataset.userId);
            }
        });
        
        const editForm = document.getElementById('edit-customer-form');
        if (editForm) {
            editForm.addEventListener('submit', handleEditCustomerSubmit);
        }
        
        searchBtn.dataset.bound = 'true';
    }
}

export async function searchCustomers() {
    const query = document.getElementById('customer-search-input').value.trim();
    const container = document.getElementById('customer-search-results');
    
    if (!query) return;
    
    container.innerHTML = '<p style="padding:10px; color:#888;">搜尋中...</p>';
    
    try {
        const users = await api.fetchData(`/api/admin/user-search?q=${encodeURIComponent(query)}`);
        
        if (users.length === 0) {
            container.innerHTML = '<p style="padding:10px;">找不到符合的顧客。</p>';
            return;
        }
        
        container.innerHTML = users.map(user => `
            <div class="customer-result-item" data-user-id="${user.user_id}" style="padding: 12px; border-bottom: 1px solid #eee; cursor: pointer; background: var(--color-card-bg);">
                <p style="margin:0 0 5px 0; font-weight: bold;">${user.line_display_name} ${user.real_name ? `(${user.real_name})` : ''}</p>
                <p style="margin:0; color: #888; font-size: 0.9em;">📞 ${user.phone || '未設定'}</p>
            </div>
        `).join('');
        
    } catch (error) {
        container.innerHTML = `<p style="padding:10px; color:red;">搜尋失敗: ${error.message}</p>`;
    }
}

export async function openEditCustomerModal(userId) {
    const modal = document.getElementById('edit-customer-modal');
    if (!modal) return;
    
    try {
        ui.showModal('載入中...', '正在準備編輯表單...'); 
        
        const data = await api.fetchData(`/api/admin/user-details?userId=${userId}`);
        const user = data.profile;
        state.currentEditingProfile = user;
        
        ui.hideAllModals(); 
        
        document.getElementById('edit-customer-modal-title').textContent = `編輯: ${user.line_display_name}`;
        document.getElementById('edit-customer-user-id').value = user.user_id;
        document.getElementById('edit-customer-phone').value = user.phone || '';
        document.getElementById('edit-customer-notes').value = user.notes || '';
        
        modal.style.display = 'flex';
        ui.updateHistoryState('edit-customer', 'open');
        
    } catch (e) {
        alert("載入失敗: " + e.message);
    }
}

async function handleEditCustomerSubmit(e) {
    e.preventDefault();
    const btn = document.getElementById('edit-customer-submit-btn');
    btn.disabled = true;
    btn.textContent = '儲存中...';
    
    const userId = document.getElementById('edit-customer-user-id').value;
    const phone = document.getElementById('edit-customer-phone').value.trim();
    const notes = document.getElementById('edit-customer-notes').value.trim();
    
    try {
        if (phone && !/^09\d{8}$/.test(phone)) {
             throw new Error('請輸入正確的 10 碼手機號碼');
        }
        
        await api.fetchData('/api/admin/update-user-details', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId, phone, notes })
        });
        
        alert('更新成功！');
        ui.updateHistoryState('edit-customer', 'close'); 
        document.getElementById('edit-customer-modal').style.display = 'none';
        
        openDetailsModal('user', userId);
        
    } catch (error) {
        alert(`儲存失敗: ${error.message}`);
    } finally {
        btn.disabled = false;
        btn.textContent = '儲存變更';
    }
}