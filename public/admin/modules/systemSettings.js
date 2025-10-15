// public/admin/modules/systemSettings.js (修改後)
import { api } from '../api.js';
import { ui } from '../ui.js';

let allSettings = []; 
let templateDefinitions = {}; 

/**
 * 根據傳入的設定資料，建立一個表單輸入列的 DOM 元素
 * @param {object} setting - 包含 label, hint, key, value, type 的物件
 * @returns {HTMLElement}
 */
function createSettingRow(setting) {
    const row = document.createElement('div');
    row.className = 'setting-row';

    const label = document.createElement('div');
    label.className = 'setting-label';
    label.innerHTML = `${setting.label}<small>${setting.hint}</small>`;
    
    const inputContainer = document.createElement('div');
    
    if (setting.type === 'toggle') {
        const switchId = `setting-toggle-${setting.key}`;
        inputContainer.innerHTML = `
            <label class="switch" for="${switchId}">
                <input type="checkbox" id="${switchId}" data-key="${setting.key}" ${setting.value ? 'checked' : ''}>
                <span class="slider"></span>
            </label>
        `;
    } else { // 預設是 text input
        inputContainer.innerHTML = `<input type="text" data-key="${setting.key}" value="${setting.value}">`;
    }

    row.append(label, inputContainer);
    return row;
}

/**
 * 建立「全域設定」的摺疊區塊
 * @param {object} template - 當前選擇的樣板資料
 * @returns {HTMLElement}
 */
function createGlobalSettingsModule(template) {
    const accordionTemplate = document.getElementById('accordion-template');
    const clone = accordionTemplate.content.cloneNode(true);
    const accordionItem = clone.querySelector('.accordion-item');
    
    accordionItem.querySelector('h4').textContent = '全域設定 (導覽列、功能開關)';
    const content = accordionItem.querySelector('.accordion-content');

    // --- 動態生成設定列 ---
    
    // 1. 核心功能開關
    content.appendChild(createSettingRow({
        label: '會員系統',
        hint: '啟用後，顧客才能註冊會員、累積點數。',
        key: 'FEATURES_ENABLE_MEMBERSHIP_SYSTEM',
        value: template.features.ENABLE_MEMBERSHIP_SYSTEM,
        type: 'toggle'
    }));
    content.appendChild(createSettingRow({
        label: '線上預約系統',
        hint: '啟用後，顧客才能使用線上預約/訂房功能。',
        key: 'FEATURES_ENABLE_BOOKING_SYSTEM',
        value: template.features.ENABLE_BOOKING_SYSTEM,
        type: 'toggle'
    }));
    content.appendChild(createSettingRow({
        label: '購物車功能',
        hint: '【未來功能】啟用後，顧客才能將商品加入購物車。',
        key: 'FEATURES_ENABLE_SHOPPING_CART',
        value: template.features.ENABLE_SHOPPING_CART,
        type: 'toggle'
    }));

    // 2. 術語設定
    content.appendChild(createSettingRow({
        label: '商家/品牌名稱',
        hint: '會顯示在 LIFF App 的頂部標題。',
        key: 'TERMS_BUSINESS_NAME',
        value: template.terms.BUSINESS_NAME,
        type: 'text'
    }));
    content.appendChild(createSettingRow({
        label: '點數/積分名稱',
        hint: '例如：會員點數、購物金、住宿積分。',
        key: 'TERMS_POINTS_NAME',
        value: template.terms.POINTS_NAME,
        type: 'text'
    }));
    
    // 摺疊功能
    accordionItem.querySelector('.accordion-header').addEventListener('click', () => {
        content.classList.toggle('open');
    });

    return accordionItem;
}

// 渲染指定樣板的設定介面
function renderTemplateSettings(templateKey) {
    const template = templateDefinitions[templateKey];
    if (!template) {
        console.error(`找不到樣板: ${templateKey}`);
        return;
    }

    const liffSettingsContainer = document.getElementById('liff-app-settings');
    const adminSettingsContainer = document.getElementById('admin-panel-settings');
    
    liffSettingsContainer.innerHTML = ''; // 清空內容
    adminSettingsContainer.innerHTML = ''; // 清空內容
    
    // 渲染並加入「全域設定」模組
    const globalSettingsModule = createGlobalSettingsModule(template);
    liffSettingsContainer.appendChild(globalSettingsModule);

    // 預設展開第一個摺疊區塊
    liffSettingsContainer.querySelector('.accordion-content')?.classList.add('open');

    adminSettingsContainer.innerHTML = `<p>這裡是 "${template.name}" 的後台設定區塊。</p>`;
}


// (setupEventListeners 和 init 函式維持不變)
function setupEventListeners() {
    const page = document.getElementById('page-settings');
    if (!page || page.dataset.initialized) return;

    const templateSelector = document.getElementById('template-selector');
    const saveButton = document.getElementById('save-settings-btn');
    const tabsContainer = document.querySelector('.settings-tabs');

    templateSelector.addEventListener('change', () => {
        const selectedTemplateKey = templateSelector.value;
        renderTemplateSettings(selectedTemplateKey);
    });

    tabsContainer.addEventListener('click', (e) => {
        if (e.target.matches('.settings-tab')) {
            tabsContainer.querySelector('.active')?.classList.remove('active');
            document.querySelector('.settings-tab-content.active')?.classList.remove('active');
            
            e.target.classList.add('active');
            const targetContentId = e.target.dataset.target;
            document.getElementById(targetContentId)?.classList.add('active');
        }
    });

    saveButton.addEventListener('click', async () => {
        ui.toast.info('儲存功能將在後續步驟中實作。');
    });

    page.dataset.initialized = 'true';
}

export const init = async () => {
    try {
        templateDefinitions = window.CONFIG?.LOGIC?.INDUSTRY_TEMPLATE_DEFINITIONS || {};
        
        if (Object.keys(templateDefinitions).length === 0) {
            throw new Error("在全域設定檔中找不到任何商業樣板定義。");
        }

        const templateSelector = document.getElementById('template-selector');
        templateSelector.innerHTML = '';
        for (const key in templateDefinitions) {
            const option = new Option(templateDefinitions[key].name, key);
            templateSelector.add(option);
        }
        
        const initialTemplateKey = templateSelector.value;
        if (initialTemplateKey) {
            renderTemplateSettings(initialTemplateKey);
        }
        
        setupEventListeners();

    } catch (error) {
        console.error('初始化系統設定頁面失敗:', error);
        document.getElementById('page-settings').innerHTML = `<p style="color:red;">讀取設定失敗: ${error.message}</p>`;
    }
};