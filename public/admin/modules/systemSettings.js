// public/admin/modules/systemSettings.js (最終功能版)
import { api } from '../api.js';
import { ui } from '../ui.js';

let allSettings = []; // 用來存放從 API 獲取的所有原始設定
let templateDefinitions = {};
let sortableNav = null;

// (createSettingRow 和 createNavBarModule 函式維持不變)
function createSettingRow(setting) {
    const row = document.createElement('div');
    row.className = 'setting-row';
    const label = document.createElement('div');
    label.className = 'setting-label';
    label.innerHTML = `${setting.label}<small>${setting.hint}</small>`;
    const inputContainer = document.createElement('div');
    if (setting.type === 'toggle') {
        const switchId = `setting-toggle-${setting.key}`;
        inputContainer.innerHTML = `<label class="switch" for="${switchId}"><input type="checkbox" id="${switchId}" data-key="${setting.key}" ${setting.value ? 'checked' : ''}><span class="slider"></span></label>`;
    } else {
        inputContainer.innerHTML = `<input type="text" data-key="${setting.key}" value="${setting.value}">`;
    }
    row.append(label, inputContainer);
    return row;
}

function createNavBarModule(navBarConfig, availablePages) {
    const container = document.createElement('div');
    container.className = 'setting-visual-guide';
    container.innerHTML = `
        <h5>底部導覽列設定 (可拖曳排序)</h5>
        <div id="nav-items-container"></div>
    `;
    const navItemsContainer = container.querySelector('#nav-items-container');
    const itemTemplate = document.getElementById('nav-item-template');
    navBarConfig.forEach(item => {
        const clone = itemTemplate.content.cloneNode(true);
        const row = clone.querySelector('.nav-item-row');
        row.querySelector('[name="nav_label"]').value = item.label;
        row.querySelector('[name="nav_enabled"]').checked = item.enabled;
        const select = row.querySelector('[name="nav_target"]');
        select.innerHTML = '';
        availablePages.forEach(page => {
            select.add(new Option(page.name, page.id));
        });
        select.value = item.target;
        navItemsContainer.appendChild(row);
    });
    if (sortableNav) sortableNav.destroy();
    sortableNav = new Sortable(navItemsContainer, { animation: 150, handle: '.drag-handle' });
    return container;
}

function createGlobalSettingsModule(template) {
    const accordionTemplate = document.getElementById('accordion-template');
    const clone = accordionTemplate.content.cloneNode(true);
    const accordionItem = clone.querySelector('.accordion-item');
    accordionItem.querySelector('h4').textContent = '全域設定 (導覽列、功能開關)';
    const content = accordionItem.querySelector('.accordion-content');
    content.appendChild(createSettingRow({
        label: '會員系統', hint: '啟用後，顧客才能註冊會員、累積點數。',
        key: 'FEATURES_ENABLE_MEMBERSHIP_SYSTEM', value: template.features.ENABLE_MEMBERSHIP_SYSTEM, type: 'toggle'
    }));
    content.appendChild(createSettingRow({
        label: '線上預約系統', hint: '啟用後，顧客才能使用線上預約/訂房功能。',
        key: 'FEATURES_ENABLE_BOOKING_SYSTEM', value: template.features.ENABLE_BOOKING_SYSTEM, type: 'toggle'
    }));
    content.appendChild(createSettingRow({
        label: '購物車功能', hint: '【未來功能】啟用後，顧客才能將商品加入購物車。',
        key: 'FEATURES_ENABLE_SHOPPING_CART', value: template.features.ENABLE_SHOPPING_CART, type: 'toggle'
    }));
    content.appendChild(createSettingRow({
        label: '商家/品牌名稱', hint: '會顯示在 LIFF App 的頂部標題。',
        key: 'TERMS_BUSINESS_NAME', value: template.terms.BUSINESS_NAME, type: 'text'
    }));
    content.appendChild(createSettingRow({
        label: '點數/積分名稱', hint: '例如：會員點數、購物金、住宿積分。',
        key: 'TERMS_POINTS_NAME', value: template.terms.POINTS_NAME, type: 'text'
    }));
    if (template.logic.navBar && template.logic.availablePages) {
        content.appendChild(createNavBarModule(template.logic.navBar, template.logic.availablePages));
    }
    accordionItem.querySelector('.accordion-header').addEventListener('click', () => {
        content.classList.toggle('open');
    });
    return accordionItem;
}

/**
 * 【核心新增】從 UI 收集所有設定值，並重組成一個樣板物件
 * @returns {object} - 重組後的樣板物件
 */
function reconstructTemplateFromUI() {
    const selectedKey = document.getElementById('template-selector').value;
    const currentTemplate = JSON.parse(JSON.stringify(templateDefinitions[selectedKey])); // 深拷貝一份以防修改到快取

    const liffSettingsContainer = document.getElementById('liff-app-settings');

    // 1. 讀取「全域設定」中的文字輸入框和開關
    liffSettingsContainer.querySelectorAll('[data-key]').forEach(input => {
        const keyParts = input.dataset.key.split('_');
        const mainKey = keyParts[0].toLowerCase(); // 'features' or 'terms'
        const subKey = keyParts.slice(1).join('_');
        
        if (currentTemplate[mainKey]) {
            if (input.type === 'checkbox') {
                currentTemplate[mainKey][subKey] = input.checked;
            } else {
                currentTemplate[mainKey][subKey] = input.value;
            }
        }
    });

    // 2. 讀取並重組「導覽列」設定
    const navBar = [];
    document.querySelectorAll('#nav-items-container .nav-item-row').forEach(row => {
        navBar.push({
            label: row.querySelector('[name="nav_label"]').value,
            target: row.querySelector('[name="nav_target"]').value,
            enabled: row.querySelector('[name="nav_enabled"]').checked
        });
    });
    currentTemplate.logic.navBar = navBar;

    return { [selectedKey]: currentTemplate };
}


function renderTemplateSettings(templateKey) {
    const template = templateDefinitions[templateKey];
    if (!template) return;
    const liffSettingsContainer = document.getElementById('liff-app-settings');
    const adminSettingsContainer = document.getElementById('admin-panel-settings');
    liffSettingsContainer.innerHTML = ''; 
    adminSettingsContainer.innerHTML = ''; 
    liffSettingsContainer.appendChild(createGlobalSettingsModule(template));
    liffSettingsContainer.querySelector('.accordion-content')?.classList.add('open');
    adminSettingsContainer.innerHTML = `<p>這裡是 "${template.name}" 的後台設定區塊。</p>`;
}

function setupEventListeners() {
    const page = document.getElementById('page-settings');
    if (page.dataset.initialized) return;

    const templateSelector = document.getElementById('template-selector');
    const saveButton = document.getElementById('save-settings-btn');
    const tabsContainer = document.querySelector('.settings-tabs');

    templateSelector.addEventListener('change', () => {
        renderTemplateSettings(templateSelector.value);
    });

    tabsContainer.addEventListener('click', (e) => {
        if (e.target.matches('.settings-tab')) {
            tabsContainer.querySelector('.active')?.classList.remove('active');
            document.querySelector('.settings-tab-content.active')?.classList.remove('active');
            e.target.classList.add('active');
            document.getElementById(e.target.dataset.target)?.classList.add('active');
        }
    });

    // --- 【核心啟用】儲存按鈕功能 ---
    saveButton.addEventListener('click', async () => {
        const confirmed = await ui.confirm('您確定要儲存對目前樣板的所有變更嗎？');
        if (!confirmed) return;

        saveButton.disabled = true;
        saveButton.textContent = '儲存中...';

        try {
            // 1. 從 UI 收集當前正在編輯的樣板資料
            const updatedTemplatePart = reconstructTemplateFromUI();
            
            // 2. 將修改後的樣板與其他未修改的樣板合併
            const finalDefinitions = { ...templateDefinitions, ...updatedTemplatePart };

            // 3. 準備 API 需要的 payload
            const payload = [{
                key: 'LOGIC_INDUSTRY_TEMPLATE_DEFINITIONS',
                value: JSON.stringify(finalDefinitions, null, 2) // 格式化 JSON 以利閱讀
            }];

            // 4. 呼叫 API 更新設定
            await api.updateSettings(payload);
            
            // 5. 更新快取並提示成功
            templateDefinitions = finalDefinitions;
            ui.toast.success('樣板設定已成功儲存！');

        } catch (error) {
            ui.toast.error(`儲存失敗：${error.message}`);
        } finally {
            saveButton.disabled = false;
            saveButton.textContent = '儲存所有變更';
        }
    });

    page.dataset.initialized = 'true';
}

export const init = async () => {
    try {
        allSettings = await api.getSettings();
        const definitionsSetting = allSettings.find(i => i.key === 'LOGIC_INDUSTRY_TEMPLATE_DEFINITIONS');
        
        if (definitionsSetting && definitionsSetting.value) {
            templateDefinitions = JSON.parse(definitionsSetting.value);
        } else {
             throw new Error("在資料庫中找不到 'LOGIC_INDUSTRY_TEMPLATE_DEFINITIONS' 設定。");
        }
        
        const templateSelector = document.getElementById('template-selector');
        templateSelector.innerHTML = '';
        for (const key in templateDefinitions) {
            templateSelector.add(new Option(templateDefinitions[key].name, key));
        }
        
        const initialTemplateKey = templateSelector.value;
        if (initialTemplateKey) {
            renderTemplateSettings(initialTemplateKey);
        }
        
        if (!document.getElementById('page-settings').dataset.initialized) {
            setupEventListeners();
        }
    } catch (error) {
        console.error('初始化系統設定頁面失敗:', error);
        document.getElementById('page-settings').innerHTML = `<p style="color:red;">讀取設定失敗: ${error.message}</p>`;
    }
};