// public/admin/modules/storeInfo.js
import { api } from '../api.js';
import { ui } from '../ui.js'; 

function setVal(id, value) {
    const el = document.getElementById(id);
    if (el) el.value = value || '';
}

function populateStoreInfoForm(info) {
    const storeInfoForm = document.getElementById('store-info-form');
    if (!storeInfoForm) return;

    if (!info) return;

    setVal('info-store-name', info.store_name);
    setVal('info-address', info.address);
    setVal('info-phone', info.phone);
    setVal('info-hours', info.opening_hours);
    setVal('info-desc', info.description);
    
    setVal('info-policy', info.cancellationPolicy);
    setVal('info-instructions', info.checkInInstructions);
}

// --- 【核心修正】應用設定 (Policy Fields & Labels) ---
function applyConfigSettings() {
    const config = window.CONFIG;
    if (!config || !config.LOGIC || !config.LOGIC.ACTIVE_INDUSTRY_TEMPLATE) return;

    const activeKey = config.LOGIC.ACTIVE_INDUSTRY_TEMPLATE;
    const template = config.LOGIC.INDUSTRY_TEMPLATE_DEFINITIONS[activeKey];
    
    const storeConfig = template?.admin_config?.store_info || {};
    const policyFields = storeConfig.policy_fields || { show_cancellation: true, show_instructions: true };
    const policyLabels = storeConfig.policy_labels || {};
    const terms = template?.terms || {}; // Fallback

    // 1. 控制顯示/隱藏
    const policyInput = document.getElementById('info-policy');
    if (policyInput) {
        // 找到外層 form-group 隱藏
        const group = policyInput.closest('.form-group');
        if (group) group.style.display = policyFields.show_cancellation !== false ? '' : 'none';
    }

    const instrInput = document.getElementById('info-instructions');
    if (instrInput) {
        const group = instrInput.closest('.form-group');
        if (group) group.style.display = policyFields.show_instructions !== false ? '' : 'none';
    }

    // 2. 更新標題文字
    // 優先使用 policy_labels，其次使用 terms (相容舊版)
    const policyLabel = document.querySelector('label[for="info-policy"]');
    if (policyLabel) {
        policyLabel.textContent = policyLabels.cancellation || terms.ADMIN_CANCELLATION_POLICY_LABEL || '取消政策';
    }

    const instructionsLabel = document.querySelector('label[for="info-instructions"]');
    if (instructionsLabel) {
        instructionsLabel.textContent = policyLabels.instructions || terms.ADMIN_CHECKIN_INSTRUCTIONS_LABEL || '入住須知';
    }
}

function setupEventListeners() {
    const storeInfoForm = document.getElementById('store-info-form');
    if (storeInfoForm) {
        storeInfoForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const submitButton = storeInfoForm.querySelector('button[type="submit"]');
            
            const formData = {
                store_name: document.getElementById('info-store-name')?.value,
                address: document.getElementById('info-address')?.value,
                phone: document.getElementById('info-phone')?.value,
                opening_hours: document.getElementById('info-hours')?.value,
                description: document.getElementById('info-desc')?.value,
                cancellationPolicy: document.getElementById('info-policy')?.value,
                checkInInstructions: document.getElementById('info-instructions')?.value
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

export const init = async () => {
    const storeInfoForm = document.getElementById('store-info-form');
    if (!storeInfoForm) return;

    // 應用設定
    applyConfigSettings();

    try {
        const info = await api.getStoreInfo();
        populateStoreInfoForm(info);
        
        if (!storeInfoForm.dataset.initialized) {
            setupEventListeners();
            storeInfoForm.dataset.initialized = 'true';
        }
    } catch (error) {
        ui.toast.error(`載入店家資訊失敗: ${error.message}`);
    }
};