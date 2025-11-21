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
    
    document.getElementById('info-policy').value = info.cancellationPolicy || '';
    document.getElementById('info-instructions').value = info.checkInInstructions || '';
}

// 【新增】應用文字設定
function applyTermSettings() {
    // 確保 CONFIG 已載入 (app.js 會處理，但這裡做個防呆)
    const config = window.CONFIG;
    if (!config || !config.LOGIC || !config.LOGIC.ACTIVE_INDUSTRY_TEMPLATE) return;

    const activeKey = config.LOGIC.ACTIVE_INDUSTRY_TEMPLATE;
    const template = config.LOGIC.INDUSTRY_TEMPLATE_DEFINITIONS[activeKey];
    const terms = template?.terms || {};

    // 更新區塊標題
    const sectionTitle = document.getElementById('store-policy-section-title');
    if (sectionTitle && terms.ADMIN_POLICY_SECTION_TITLE) {
        sectionTitle.textContent = terms.ADMIN_POLICY_SECTION_TITLE;
    }

    // 更新欄位標籤
    const policyLabel = document.querySelector('label[for="info-policy"]');
    if (policyLabel && terms.ADMIN_CANCELLATION_POLICY_LABEL) {
        policyLabel.textContent = terms.ADMIN_CANCELLATION_POLICY_LABEL;
    }

    const instructionsLabel = document.querySelector('label[for="info-instructions"]');
    if (instructionsLabel && terms.ADMIN_CHECKIN_INSTRUCTIONS_LABEL) {
        instructionsLabel.textContent = terms.ADMIN_CHECKIN_INSTRUCTIONS_LABEL;
    }
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

    // 1. 先應用文字設定
    applyTermSettings();

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