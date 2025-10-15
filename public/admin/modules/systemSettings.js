// public/admin/modules/systemSettings.js (修改後)
import { api } from '../api.js';
import { ui } from '../ui.js';

let templateDefinitions = {}; 
let sortableNav = null;

// (createSettingRow 函式維持不變)
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

/**
 * 建立「底部導覽列」的設定 UI
 * @param {object} navBarConfig - 樣板中的 navBar 設定陣列
 * @param {object[]} availablePages - 可用的頁面清單
 * @returns {HTMLElement}
 */
function createNavBarModule(navBarConfig, availablePages) {
    const container = document.createElement('div');
    container.className = 'setting-visual-guide';
    container.innerHTML = `
        <h5>底部導覽列設定 (可拖曳排序)</h5>
        <img src="https://i.imgur.com/g19w3Oa.png" alt="nav-bar-schematic" class="nav-bar-schematic">
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

    // 初始化拖曳排序
    if (sortableNav) sortableNav.destroy();
    sortableNav = new Sortable(navItemsContainer, {
        animation: 150,
        handle: '.drag-handle'
    });

    return container;
}


// (createGlobalSettingsModule 函式修改，加入導覽列模組)
function createGlobalSettingsModule(template) {
    const accordionTemplate = document.getElementById('accordion-template');
    const clone = accordionTemplate.content.cloneNode(true);
    const accordionItem = clone.querySelector('.accordion-item');
    accordionItem.querySelector('h4').textContent = '全域設定 (導覽列、功能開關)';
    const content = accordionItem.querySelector('.accordion-content');

    // --- 動態生成設定列 ---
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
    
    // --- 【核心新增】在這裡插入導覽列設定模組 ---
    if (template.logic.navBar && template.logic.availablePages) {
        const navBarModule = createNavBarModule(template.logic.navBar, template.logic.availablePages);
        content.appendChild(navBarModule);
    }
    
    accordionItem.querySelector('.accordion-header').addEventListener('click', () => {
        content.classList.toggle('open');
    });

    return accordionItem;
}

// (renderTemplateSettings, setupEventListeners, init 函式維持不變)
function renderTemplateSettings(templateKey) {
    const template = templateDefinitions[templateKey];
    if (!template) {
        console.error(`找不到樣板: ${templateKey}`);
        return;
    }
    const liffSettingsContainer = document.getElementById('liff-app-settings');
    const adminSettingsContainer = document.getElementById('admin-panel-settings');
    liffSettingsContainer.innerHTML = ''; 
    adminSettingsContainer.innerHTML = ''; 
    
    const globalSettingsModule = createGlobalSettingsModule(template);
    liffSettingsContainer.appendChild(globalSettingsModule);
    liffSettingsContainer.querySelector('.accordion-content')?.classList.add('open');
    adminSettingsContainer.innerHTML = `<p>這裡是 "${template.name}" 的後台設定區塊。</p>`;
}

function setupEventListeners() {
    const page = document.getElementById('page-settings');
    if (!page || page.dataset.initialized) return;

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

    saveButton.addEventListener('click', async () => {
        ui.toast.info('儲存功能將在後續步驟中實作。');
    });

    page.dataset.initialized = 'true';
}

export const init = async () => {
    try {
        // 【重要】我們現在需要從完整的 JSON 中解析出樣板定義
        const definitionsSetting = await api.getSettings().then(s => s.find(i => i.key === 'LOG-IC_INDUSTRY_TEMPLATE_DEFINITIONS'));
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
        
        setupEventListeners();

    } catch (error) {
        console.error('初始化系統設定頁面失敗:', error);
        document.getElementById('page-settings').innerHTML = `<p style="color:red;">讀取設定失敗: ${error.message}</p>`;
    }
};