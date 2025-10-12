// public/admin/modules/systemSettings.js
import { api } from '../api.js';
import { ui } from '../ui.js';

let allSettings = []; // 快取所有設定資料
let templateDefinitions = {}; // 快取樣板定義

// 渲染指定樣板的欄位編輯器
function renderFieldsEditor(templateKey) {
    const container = document.getElementById('fields-editor-container');
    if (!container) return;

    container.innerHTML = ''; // 清空現有欄位
    const template = templateDefinitions[templateKey];
    if (!template || !template.fields) return;

    template.fields.forEach(field => {
        const row = createFieldRow(field);
        container.appendChild(row);
    });
}

// 根據欄位資料建立一個 DOM 元素
function createFieldRow(field = {}) {
    const template = document.getElementById('field-editor-template');
    const clone = template.content.cloneNode(true);
    const row = clone.querySelector('.field-editor-row');

    row.querySelector('[name="key"]').value = field.key || '';
    row.querySelector('[name="label"]').value = field.label || '';
    row.querySelector('[name="type"]').value = field.type || 'text';
    row.querySelector('[name="required"]').checked = field.required || false;

    return row;
}

// 從 UI 收集資料並重組成 JSON
function reconstructTemplatesFromUI() {
    const currentTemplateKey = document.getElementById('template-selector').value;
    
    // 更新當前正在編輯的樣板
    const fields = [];
    document.querySelectorAll('#fields-editor-container .field-editor-row').forEach(row => {
        const key = row.querySelector('[name="key"]').value.trim();
        const label = row.querySelector('[name="label"]').value.trim();
        if (key && label) { // 確保 key 和 label 都有值才加入
            fields.push({
                key: key,
                label: label,
                type: row.querySelector('[name="type"]').value,
                required: row.querySelector('[name="required"]').checked,
            });
        }
    });
    templateDefinitions[currentTemplateKey].fields = fields;

    // 回傳完整的樣板定義物件
    return templateDefinitions;
}

// 渲染「其他系統參數」
function renderOtherSettings() {
    const settingsContainer = document.getElementById('other-settings-container');
    settingsContainer.innerHTML = '';

    const otherSettings = allSettings.filter(s => !s.key.includes('INDUSTRY_TEMPLATE_DEFINITIONS'));

    otherSettings.forEach(setting => {
        const formGroup = document.createElement('div');
        formGroup.className = 'form-group';
        formGroup.innerHTML = `
            <label for="setting-${setting.key}">${setting.description || setting.key}</label>
            <input type="text" id="setting-${setting.key}" name="${setting.key}" value='${setting.value}'>
        `;
        settingsContainer.appendChild(formGroup);
    });
}

// 綁定所有事件監聽器
function setupEventListeners() {
    const page = document.getElementById('page-settings');
    if (page.dataset.initialized) return;

    const templateSelector = document.getElementById('template-selector');
    const addFieldBtn = document.getElementById('add-field-btn');
    const fieldsContainer = document.getElementById('fields-editor-container');
    const settingsForm = document.getElementById('settings-form');

    // 樣板選擇器變更時，重新渲染欄位編輯器
    templateSelector.addEventListener('change', () => {
        // 在切換前，先儲存當前編輯中的樣板狀態
        reconstructTemplatesFromUI();
        renderFieldsEditor(templateSelector.value);
    });

    // 新增欄位按鈕
    addFieldBtn.addEventListener('click', () => {
        const newRow = createFieldRow();
        fieldsContainer.appendChild(newRow);
    });

    // 刪除欄位按鈕 (事件委派)
    fieldsContainer.addEventListener('click', (e) => {
        if (e.target.classList.contains('btn-remove-field')) {
            e.target.closest('.field-editor-row').remove();
        }
    });

    // 表單提交事件
    settingsForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const submitButton = settingsForm.querySelector('button[type="submit"]');
        
        try {
            submitButton.textContent = '儲存中...';
            submitButton.disabled = true;

            const payload = [];

            // 1. 處理樣板定義
            const updatedTemplates = reconstructTemplatesFromUI();
            payload.push({
                key: 'LOGIC_INDUSTRY_TEMPLATE_DEFINITIONS',
                value: JSON.stringify(updatedTemplates, null, 2) // 格式化 JSON 以利閱讀
            });

            // 2. 處理其他設定
            const inputs = settingsForm.querySelectorAll('#other-settings-container input');
            inputs.forEach(input => {
                payload.push({ key: input.name, value: input.value });
            });

            await api.updateSettings(payload);
            ui.toast.success('系統設定已成功更新！');

            // 更新後重新載入，以確保資料同步
            await init();

        } catch (error) {
            ui.toast.error(`儲存失敗：${error.message}`);
        } finally {
            submitButton.textContent = '儲存所有變更';
            submitButton.disabled = false;
        }
    });

    page.dataset.initialized = 'true';
}

// 模組初始化函式
export const init = async () => {
    try {
        allSettings = await api.getSettings();
        
        // 解析樣板定義
        const definitionsSetting = allSettings.find(s => s.key === 'LOGIC_INDUSTRY_TEMPLATE_DEFINITIONS');
        if (definitionsSetting) {
            templateDefinitions = JSON.parse(definitionsSetting.value);
        }

        // 填充樣板選擇器
        const templateSelector = document.getElementById('template-selector');
        templateSelector.innerHTML = '';
        Object.keys(templateDefinitions).forEach(key => {
            templateSelector.add(new Option(templateDefinitions[key].name, key));
        });

        // 渲染第一個樣板的編輯器和「其他設定」
        renderFieldsEditor(templateSelector.value);
        renderOtherSettings();
        
        setupEventListeners();

    } catch (error) {
        console.error('獲取或解析設定失敗:', error);
        document.getElementById('page-settings').innerHTML = `<p style="color:red;">讀取設定失敗: ${error.message}</p>`;
    }
};