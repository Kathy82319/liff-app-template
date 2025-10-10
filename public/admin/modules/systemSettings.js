// public/admin/modules/systemSettings.js
import { api } from '../api.js';

let allSettings = []; // 快取設定資料

// 建立一個布林值的滑動開關
function createToggleSwitch(setting) {
    const formGroup = document.createElement('div');
    formGroup.className = 'form-group';
    formGroup.style.cssText = 'display: flex; align-items: center; justify-content: space-between; padding: 0.5rem 0; border-bottom: 1px solid var(--color-border);';
    
    const label = document.createElement('label');
    label.htmlFor = setting.key;
    label.textContent = setting.description;
    label.style.marginBottom = '0';

    const switchLabel = document.createElement('label');
    switchLabel.className = 'switch';
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.id = setting.key;
    input.name = setting.key;
    input.checked = (setting.value === 'true');
    const slider = document.createElement('span');
    slider.className = 'slider';

    switchLabel.append(input, slider);
    formGroup.append(label, switchLabel);
    
    // 監聽變化，連動顯示/隱藏相關設定
    input.addEventListener('change', (e) => {
        const isEnabled = e.target.checked;
        document.querySelectorAll(`[data-dependency="${setting.key}"]`).forEach(el => {
            el.style.display = isEnabled ? 'block' : 'none';
        });
    });

    return formGroup;
}

// 建立一個通用的輸入框 (text, number, json)
function createGenericInput(setting) {
    const formGroup = document.createElement('div');
    formGroup.className = 'form-group';

    const label = document.createElement('label');
    label.htmlFor = setting.key;
    label.textContent = setting.description || setting.key;
    
    let inputElement;
    if (setting.type === 'json') {
        inputElement = document.createElement('textarea');
        inputElement.rows = 5;
        try {
            // 美化 JSON 格式方便閱讀
            inputElement.value = JSON.stringify(JSON.parse(setting.value), null, 2);
        } catch (e) {
            inputElement.value = setting.value; // 如果解析失敗，顯示原始字串
        }
    } else {
        inputElement = document.createElement('input');
        inputElement.type = setting.type === 'number' ? 'number' : 'text';
        inputElement.value = setting.value;
    }
    
    inputElement.id = setting.key;
    inputElement.name = setting.key;
    formGroup.append(label, inputElement);
    return formGroup;
}

// 尋找設定項目的依賴關係
function findRelatedFeatureKey(key) {
    if (key.includes('BOOKING')) return 'FEATURES_ENABLE_BOOKING_SYSTEM';
    if (key.includes('MEMBERSHIP') || key.includes('POINTS')) return 'FEATURES_ENABLE_MEMBERSHIP_SYSTEM';
    return null;
}

// 渲染整個設定表單
function renderSettingsForm(settings) {
    const settingsContainer = document.getElementById('settings-container');
    if (!settingsContainer) return;
    settingsContainer.innerHTML = '';

    const groupedSettings = {
        FEATURES: { title: '⚙️ 功能開關', items: [] },
        TERMS: { title: '🏷️ 商業術語', items: [] },
        LOGIC: { title: '🧠 業務邏輯', items: [] }
    };

    settings.forEach(setting => {
        const groupKey = setting.key.split('_')[0];
        if (groupedSettings[groupKey]) {
            groupedSettings[groupKey].items.push(setting);
        }
    });

    Object.values(groupedSettings).forEach(group => {
        if (group.items.length === 0) return;

        const groupWrapper = document.createElement('div');
        groupWrapper.className = 'setting-group';
        groupWrapper.innerHTML = `<h4>${group.title}</h4>`;
        
        const groupBody = document.createElement('div');
        groupBody.className = 'setting-group-body';

        group.items.forEach(setting => {
            const formGroup = (setting.type === 'boolean') ? createToggleSwitch(setting) : createGenericInput(setting);
            
            // 處理依賴關係
            const dependency = findRelatedFeatureKey(setting.key);
            if (dependency) {
                formGroup.dataset.dependency = dependency;
                const feature = settings.find(s => s.key === dependency);
                if (feature && feature.value !== 'true') {
                    formGroup.style.display = 'none';
                }
            }
            groupBody.appendChild(formGroup);
        });
        groupWrapper.appendChild(groupBody);
        settingsContainer.appendChild(groupWrapper);
    });
}

// 綁定事件監聽器
function setupEventListeners() {
    const settingsForm = document.getElementById('settings-form');
    if (settingsForm) {
        settingsForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const submitButton = settingsForm.querySelector('button[type="submit"]');
            const payload = [];
            const inputs = settingsForm.querySelectorAll('input, textarea');
            
            inputs.forEach(input => {
                const key = input.name;
                let value = (input.type === 'checkbox') ? input.checked.toString() : input.value;
                payload.push({ key, value });
            });

            try {
                submitButton.textContent = '儲存中...';
                submitButton.disabled = true;
                await api.updateSettings(payload); // 假設 api.js 有這個函式
                ui.toast.success('系統設定已成功更新！');
            } catch (error) {
                ui.toast.error(`儲存失敗：${error.message}`);
            } finally {
                submitButton.textContent = '儲存所有變更';
                submitButton.disabled = false;
            }
        });
    }
}

// 模組初始化函式
export const init = async () => {
    const settingsContainer = document.getElementById('settings-container');
    if (!settingsContainer) return;
    
    settingsContainer.innerHTML = '<p>正在載入設定...</p>';
    
    try {
        allSettings = await api.getSettings();
        renderSettingsForm(allSettings);

        if (!document.getElementById('page-settings').dataset.initialized) {
            setupEventListeners();
            document.getElementById('page-settings').dataset.initialized = 'true';
        }
    } catch (error) {
        console.error('獲取設定失敗:', error);
        settingsContainer.innerHTML = `<p style="color:red;">讀取設定失敗: ${error.message}</p>`;
    }
};