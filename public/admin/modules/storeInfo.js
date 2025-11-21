// public/admin/modules/storeInfo.js
import { api } from '../api.js';
import { ui } from '../ui.js'; 

// 填充表單資料
function populateStoreInfoForm(info) {
    const storeInfoForm = document.getElementById('store-info-form');
    if (!storeInfoForm) return;

    document.getElementById('info-address').value = info.address || '';
    document.getElementById('info-phone').value = info.phone || '';
    document.getElementById('info-hours').value = info.opening_hours || '';
    document.getElementById('info-desc').value = info.description || '';
    
    // 【新增】填充政策欄位
    document.getElementById('info-policy').value = info.cancellationPolicy || '';
    document.getElementById('info-instructions').value = info.checkInInstructions || '';
}

// 綁定事件監聽器
function setupEventListeners() {
    const storeInfoForm = document.getElementById('store-info-form');
    if (storeInfoForm) {
        storeInfoForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const submitButton = storeInfoForm.querySelector('button[type="submit"]');
            
            const formData = {
                address: document.getElementById('info-address').value,
                phone: document.getElementById('info-phone').value,
                opening_hours: document.getElementById('info-hours').value,
                description: document.getElementById('info-desc').value,
                // 【新增】收集政策欄位
                cancellationPolicy: document.getElementById('info-policy').value,
                checkInInstructions: document.getElementById('info-instructions').value
            };

            try {
                submitButton.textContent = '儲存中...';
                submitButton.disabled = true;
                await api.updateStoreInfo(formData);
                ui.toast.success('店家資訊與政策更新成功！');
            } catch (error) {
                ui.toast.error(`錯誤：${error.message}`);
            } finally {
                submitButton.textContent = '儲存變更';
                submitButton.disabled = false;
            }
        });
    }
}

// 模組初始化函式
export const init = async () => {
    const storeInfoForm = document.getElementById('store-info-form');
    if (!storeInfoForm) return;

    try {
        const info = await api.getStoreInfo();
        populateStoreInfoForm(info);
        
        if (!storeInfoForm.dataset.initialized) {
            setupEventListeners();
            storeInfoForm.dataset.initialized = 'true';
        }
    } catch (error) {
        ui.toast.error(`載入店家資訊失敗: ${error.message}`);
        console.error('載入店家資訊失敗:', error);
    }
};