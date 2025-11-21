// public/admin/modules/storeInfo.js
import { api } from '../api.js';
import { ui } from '../ui.js'; 

// 【安全輔助】設定值的函式：先檢查元素是否存在
function setVal(id, value) {
    const el = document.getElementById(id);
    if (el) {
        el.value = value || '';
    } else {
        // 如果找不到元素，只在 Console 顯示黃色警告，不中斷程式
        console.warn(`[storeInfo.js] 警告：找不到 ID 為 '${id}' 的輸入框，略過填值。`);
    }
}

// 填充表單資料
function populateStoreInfoForm(info) {
    const storeInfoForm = document.getElementById('store-info-form');
    if (!storeInfoForm) return;

    if (!info) {
        console.error("[storeInfo.js] 錯誤：店家資訊物件 (info) 為空。");
        return;
    }

    // 使用安全函式填值
    setVal('info-address', info.address);
    setVal('info-phone', info.phone);
    setVal('info-hours', info.opening_hours);
    setVal('info-desc', info.description);
    
    // 填充政策欄位
    setVal('info-policy', info.cancellationPolicy);
    setVal('info-instructions', info.checkInInstructions);
}

// 應用文字設定 (標題客製化)
function applyTermSettings() {
    // 確保 CONFIG 已載入
    const config = window.CONFIG;
    if (!config || !config.LOGIC || !config.LOGIC.ACTIVE_INDUSTRY_TEMPLATE) return;

    const activeKey = config.LOGIC.ACTIVE_INDUSTRY_TEMPLATE;
    const template = config.LOGIC.INDUSTRY_TEMPLATE_DEFINITIONS[activeKey];
    const terms = template?.terms || {};

    // 更新區塊標題 (需確認 HTML 有加上 id="store-policy-section-title")
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
            
            // 收集資料時也使用 Optional Chaining (?.) 避免錯誤
            const formData = {
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
        // 顯示更友善的錯誤訊息
        ui.toast.error(`載入店家資訊失敗: ${error.message}`);
        console.error('載入店家資訊失敗:', error);
    }
};