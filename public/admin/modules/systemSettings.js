// public/admin/modules/systemSettings.js
import { api } from '../api.js';
import { ui } from '../ui.js';

let allSettings = []; 
let templateDefinitions = {}; 
let sortableInstances = {}; 

// --- UI 建構輔助函式 ---

// 建立單個設定列 (支援 Text, Number, Toggle, Select, Time)
function createSettingRow(setting) {
    const row = document.createElement('div');
    row.className = 'setting-row';
    // 如果有指定 id，則加上 id (用於控制顯示/隱藏)
    if (setting.rowId) row.id = setting.rowId;
    if (setting.hidden) row.style.display = 'none';

    const label = document.createElement('div');
    label.className = 'setting-label';
    label.innerHTML = `${setting.label}<small>${setting.hint || ''}</small>`;

    const inputContainer = document.createElement('div');
    
    if (setting.type === 'toggle') {
        const switchId = `setting-toggle-${setting.key}`;
        inputContainer.innerHTML = `
            <label class="switch" for="${switchId}">
                <input type="checkbox" id="${switchId}" data-key="${setting.key}" ${setting.value ? 'checked' : ''}>
                <span class="slider"></span>
            </label>`;
    } else if (setting.type === 'select') {
        const select = document.createElement('select');
        select.dataset.key = setting.key;
        if (setting.onChange) select.addEventListener('change', setting.onChange);
        
        setting.options.forEach(opt => {
            const option = new Option(opt.label, opt.value);
            if (String(setting.value) === String(opt.value)) option.selected = true;
            select.add(option);
        });
        inputContainer.appendChild(select);
    } else if (setting.type === 'number') {
        inputContainer.innerHTML = `<input type="number" data-key="${setting.key}" value="${setting.value || ''}" placeholder="${setting.hint || ''}">`;
    } else if (setting.type === 'time') {
        inputContainer.innerHTML = `<input type="time" data-key="${setting.key}" value="${setting.value || ''}">`;
    } else { 
        inputContainer.innerHTML = `<input type="text" data-key="${setting.key}" value="${setting.value || ''}" placeholder="${setting.hint || ''}">`;
    }

    row.append(label, inputContainer);
    return row;
}

// 建立底部導覽列設定模組 (Sortable)
function createNavBarModule(navBarConfig = [], availablePages = []) { 
    const container = document.createElement('div');
    container.className = 'setting-visual-guide';
    container.innerHTML = `<h5>底部導覽列設定 (可拖曳排序)</h5><div id="nav-items-container" class="sortable-list"></div>`;
    const navItemsContainer = container.querySelector('#nav-items-container');
    const itemTemplate = document.getElementById('nav-item-template');

    if (!itemTemplate) return container;

    navBarConfig.forEach(item => {
        const clone = itemTemplate.content.cloneNode(true);
        const row = clone.querySelector('.nav-item-row');
        row.querySelector('[name="nav_label"]').value = item.label || '';
        row.querySelector('[name="nav_enabled"]').checked = item.enabled !== false;
        const select = row.querySelector('[name="nav_target"]');
        select.innerHTML = '';
        availablePages.forEach(page => {
            select.add(new Option(page.name || page.id, page.id));
        });
        select.value = item.target || '';
        navItemsContainer.appendChild(row);
    });

    const listId = 'nav-items-container';
    if (sortableInstances[listId]) sortableInstances[listId].destroy();
    if (typeof Sortable !== 'undefined') {
        sortableInstances[listId] = new Sortable(navItemsContainer, { animation: 150, handle: '.drag-handle' });
    }
    return container;
}

// 渲染後台頁面啟用設定 UI (Toggle List)
function renderAdminPageEnablement(adminPagesConfig = {}, containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;
    container.innerHTML = ''; 

    const allAdminPages = {
        "dashboard": "儀表板",
        "users": "顧客管理",
        "inventory": "產品/服務管理",
        "room-availability": "房量/庫存控管",
        "bookings": "訂位/訂單管理",
        "vouchers": "優惠券管理", 
        "rally": "集點活動管理",
        "news": "資訊管理",
        "drafts": "訊息草稿",
        "store-info": "店家資訊",
        "points": "點數發放中心", 
        "reports": "財務報表",
        "settings": "系統設定"
    };

    for (const pageKey in allAdminPages) {
        const pageLabel = allAdminPages[pageKey];
        const isEnabled = adminPagesConfig[pageKey] !== false;

        const row = document.createElement('div');
        row.className = 'setting-row'; 

        const labelDiv = document.createElement('div');
        labelDiv.className = 'setting-label';
        labelDiv.textContent = pageLabel;

        const switchId = `admin-page-toggle-${pageKey}`;
        const inputContainer = document.createElement('div');
        inputContainer.innerHTML = `<label class="switch" for="${switchId}"><input type="checkbox" id="${switchId}" data-page-key="${pageKey}" ${isEnabled ? 'checked' : ''}><span class="slider"></span></label>`;

        row.append(labelDiv, inputContainer);
        container.appendChild(row);
    }
}

// 渲染後台欄位設定 UI (Sortable Columns)
function renderAdminColumnsSettings(moduleKey, adminColumnsConfig, containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;
    container.innerHTML = ''; 
    container.classList.add('sortable-list'); 

    const columns = Array.isArray(adminColumnsConfig) ? adminColumnsConfig : [];
    const itemTemplate = document.getElementById('admin-column-item-template');
    if (!itemTemplate) return;

    columns.forEach(col => {
        if (!col || typeof col.key !== 'string' || typeof col.label !== 'string') return;
        try {
            const clone = itemTemplate.content.cloneNode(true);
            const row = clone.querySelector('.admin-column-row');
            row.querySelector('.column-key').textContent = col.key;
            row.querySelector('[name="column_label"]').value = col.label;
            row.querySelector('[name="column_enabled"]').checked = (col.enabled !== false);
            container.appendChild(row);
        } catch (e) {}
    });

    if (sortableInstances[containerId]) sortableInstances[containerId].destroy();
    if (typeof Sortable !== 'undefined') {
        sortableInstances[containerId] = new Sortable(container, { animation: 150, handle: '.drag-handle' });
    }
}

// 綁定手風琴收合事件
function bindAccordionEvents(parentElement = document) {
    if (!parentElement) return; 
    parentElement.querySelectorAll('.accordion-header').forEach(header => {
        const oldClickHandler = header.clickHandler;
        if (oldClickHandler) {
            header.removeEventListener('click', oldClickHandler);
        }
        const clickHandler = () => {
            const content = header.nextElementSibling;
            if (content && content.classList.contains('accordion-content')) {
                const isOpen = content.classList.toggle('open');
                const arrow = header.querySelector('span');
                if (arrow) arrow.textContent = isOpen ? '▲' : '▼';
            }
        };
        header.addEventListener('click', clickHandler);
        header.clickHandler = clickHandler; 

        const content = header.nextElementSibling;
        const arrow = header.querySelector('span');
        if (arrow && content) {
            arrow.textContent = content.classList.contains('open') ? '▲' : '▼';
        }
    });
}

// ==========================================================================
// 核心邏輯：渲染整個樣板設定 (Client & Admin)
// ==========================================================================
function renderTemplateSettings(templateKey) {
    const template = templateDefinitions[templateKey];
    if (!template) return;

    // 確保結構存在
    if (!template.features) template.features = {};
    if (!template.terms) template.terms = {};
    if (!template.logic) template.logic = {};
    // 初始化新的設定結構 (若舊資料沒有)
    if (!template.client_config) template.client_config = {};
    if (!template.client_config.booking) template.client_config.booking = { mode: 'range' };
    if (!template.client_config.booking.time_slots) template.client_config.booking.time_slots = { enabled: false, start: "09:00", end: "21:00", interval: 30 };

    const liffSettingsContainer = document.getElementById('liff-app-settings');
    const adminSettingsContainer = document.getElementById('admin-panel-settings');
    const ownerLiffSettingsContainer = document.getElementById('owner-liff-settings');

    // --- 1. 渲染客戶端 (LIFF) 設定 ---
    liffSettingsContainer.innerHTML = ''; 

    // (A) 通用設定
    const globalAccordion = createAccordionItem('通用設定', [
        createSettingRow({
            label: '商家/品牌名稱', hint: '顯示於網頁標題。',
            key: 'TERMS_BUSINESS_NAME', value: template.terms.BUSINESS_NAME || '我的商店', type: 'text'
        }),
        createSettingRow({ 
            label: '啟用會員系統', hint: '顧客需註冊才能使用功能。',
            key: 'FEATURES_ENABLE_MEMBERSHIP_SYSTEM', value: template.features.ENABLE_MEMBERSHIP_SYSTEM || false, type: 'toggle'
        }),
        createSettingRow({
            label: '啟用線上預約', hint: '開啟預約/訂房功能。',
            key: 'FEATURES_ENABLE_BOOKING_SYSTEM', value: template.features.ENABLE_BOOKING_SYSTEM || false, type: 'toggle' 
        })
    ]);
    liffSettingsContainer.appendChild(globalAccordion);

    // (B) 線上預約設定 (核心邏輯：模式切換)
    const bookingConfig = template.client_config.booking;
    const timeSlotConfig = bookingConfig.time_slots || {};

    const bookingRows = [];
    
    // 預約模式選擇器
    bookingRows.push(createSettingRow({
        label: '預約模式 (Booking Mode)', hint: '決定日曆行為與計價邏輯。',
        key: 'CLIENT_CONFIG_booking_mode', 
        value: bookingConfig.mode || 'range', 
        type: 'select',
        options: [
            { label: '計算晚數 (民宿/租借)', value: 'range' },
            { label: '單一日期 (工作室/課程)', value: 'single' }
        ],
        onChange: (e) => {
            // 連動顯示控制
            const mode = e.target.value;
            const timeSlotRow = document.getElementById('row-time-slot-toggle');
            if (timeSlotRow) timeSlotRow.style.display = (mode === 'single') ? 'flex' : 'none';
            // 如果切換回 range，時段設定區域應隱藏
            const timeDetailRows = document.querySelectorAll('.time-slot-detail');
            timeDetailRows.forEach(row => row.style.display = 'none');
            // 如果是 single 且 toggle 是開的，則顯示 detail
            if (mode === 'single' && document.querySelector('#setting-toggle-CLIENT_CONFIG_booking_time_slots_enabled')?.checked) {
                 timeDetailRows.forEach(row => row.style.display = 'flex');
            }
        }
    }));

    // 時段開啟開關 (僅 Single 模式顯示)
    bookingRows.push(createSettingRow({
        label: '啟用時段選擇', hint: '是否讓顧客選擇具體時間。',
        key: 'CLIENT_CONFIG_booking_time_slots_enabled', 
        value: timeSlotConfig.enabled || false, 
        type: 'toggle',
        rowId: 'row-time-slot-toggle',
        hidden: bookingConfig.mode !== 'single' // 初始狀態
    }));

    // 時段細節設定 (僅開啟時段時顯示)
    // 我們需要手動綁定 toggle 的 change 事件來控制這些 row 的顯示
    const timeStartRow = createSettingRow({ label: '每日開始時間', key: 'CLIENT_CONFIG_booking_time_slots_start', value: timeSlotConfig.start || "09:00", type: 'time', rowId: 'row-ts-start' });
    const timeEndRow = createSettingRow({ label: '每日結束時間', key: 'CLIENT_CONFIG_booking_time_slots_end', value: timeSlotConfig.end || "21:00", type: 'time', rowId: 'row-ts-end' });
    const timeIntervalRow = createSettingRow({ label: '時段間隔 (分鐘)', key: 'CLIENT_CONFIG_booking_time_slots_interval', value: timeSlotConfig.interval || 30, type: 'number', rowId: 'row-ts-interval' });
    
    [timeStartRow, timeEndRow, timeIntervalRow].forEach(r => {
        r.classList.add('time-slot-detail');
        r.style.display = (bookingConfig.mode === 'single' && timeSlotConfig.enabled) ? 'flex' : 'none';
        bookingRows.push(r);
    });

    liffSettingsContainer.appendChild(createAccordionItem('線上預約邏輯設定', bookingRows));

    // (C) 導覽列設定
    const navBarAccordion = createAccordionItem('底部導覽列管理', []);
    navBarAccordion.querySelector('.accordion-content').appendChild(createNavBarModule(template.logic.navBar, template.logic.availablePages));
    liffSettingsContainer.appendChild(navBarAccordion);

    // 綁定時段 Toggle 事件
    setTimeout(() => {
        const toggle = document.getElementById('setting-toggle-CLIENT_CONFIG_booking_time_slots_enabled');
        if (toggle) {
            toggle.addEventListener('change', (e) => {
                const isChecked = e.target.checked;
                document.querySelectorAll('.time-slot-detail').forEach(row => {
                    row.style.display = isChecked ? 'flex' : 'none';
                });
            });
        }
    }, 100);


    // --- 2. 渲染商家後台 (Admin) 設定 ---
    adminSettingsContainer.innerHTML = '';
    
    // (A) 頁面啟用
    const pageEnableDiv = document.createElement('div');
    pageEnableDiv.id = 'admin-pages-enablement-container';
    const pageEnableAccordion = createAccordionItem('後台頁面啟用管理', [pageEnableDiv]);
    adminSettingsContainer.appendChild(pageEnableAccordion);
    renderAdminPageEnablement(template.logic.adminPagesEnabled, 'admin-pages-enablement-container');

    // (B) 列表欄位設定 (使用 Sortable)
    const columnsConfig = [
        { title: '產品/服務管理 列表欄位', key: 'product', config: template.logic.adminColumns, id: 'admin-columns-product' },
        { title: '訂位/訂單管理 列表欄位', key: 'booking', config: template.logic.adminBookingColumns, id: 'admin-columns-booking' },
        { title: '顧客管理 列表欄位', key: 'user', config: template.logic.adminUserColumns, id: 'admin-columns-user' }
    ];

    columnsConfig.forEach(col => {
        const div = document.createElement('div');
        div.id = col.id;
        div.className = 'admin-columns-container';
        div.textContent = '讀取中...';
        adminSettingsContainer.appendChild(createAccordionItem(col.title, [div]));
        
        // 確保 user 欄位有預設值
        if (col.key === 'user' && (!col.config || !col.config.some(c => c.key === 'stored_value_balance'))) {
             if(!col.config) col.config = [];
             col.config.push({ key: 'stored_value_balance', label: '儲值金', enabled: false });
        }
        
        renderAdminColumnsSettings(col.key, col.config, col.id);
    });

    // --- 3. 手機版後台 (Owner) 設定 (簡單範例) ---
    ownerLiffSettingsContainer.innerHTML = '';
    ownerLiffSettingsContainer.appendChild(createAccordionItem('現場作業功能', [
        createSettingRow({ label: '啟用相機掃碼', key: 'FEATURES_OWNER_LIFF_ENABLE_SCANNER', value: template.features.OWNER_LIFF_ENABLE_SCANNER !== false, type: 'toggle' })
    ]));

    // 重新綁定所有手風琴
    bindAccordionEvents(liffSettingsContainer);
    bindAccordionEvents(adminSettingsContainer);
    bindAccordionEvents(ownerLiffSettingsContainer);
}

// 輔助：建立手風琴項目
function createAccordionItem(title, contentElements) {
    const item = document.getElementById('accordion-template').content.cloneNode(true).querySelector('.accordion-item');
    item.querySelector('h4').textContent = title;
    const contentDiv = item.querySelector('.accordion-content');
    contentElements.forEach(el => contentDiv.appendChild(el));
    return item;
}

// 從 UI 反向建構樣板資料
function reconstructTemplateFromUI() {
    const selectedKey = document.getElementById('template-selector').value;
    if (!templateDefinitions[selectedKey]) {
         throw new Error(`無法重構樣板：找不到樣板 key "${selectedKey}"`);
    }
    // 深拷貝當前樣板作為基底
    const currentTemplate = JSON.parse(JSON.stringify(templateDefinitions[selectedKey]));

    // 確保結構
    if (!currentTemplate.features) currentTemplate.features = {};
    if (!currentTemplate.terms) currentTemplate.terms = {};
    if (!currentTemplate.client_config) currentTemplate.client_config = {};
    if (!currentTemplate.client_config.booking) currentTemplate.client_config.booking = {};
    if (!currentTemplate.client_config.booking.time_slots) currentTemplate.client_config.booking.time_slots = {};

    // 1. 收集所有通用 input (data-key)
    const containers = document.querySelectorAll('#liff-app-settings, #owner-liff-settings, #admin-panel-settings');
    containers.forEach(container => {
        container.querySelectorAll('[data-key]').forEach(input => {
            const key = input.dataset.key;
            let val;
            if (input.type === 'checkbox') val = input.checked;
            else if (input.type === 'number') val = Number(input.value);
            else val = input.value;

            // 解析 Key 路徑 (支援多層級)
            // 規則：FEATURES_X, TERMS_X, LOGIC_X, CLIENT_CONFIG_booking_mode
            if (key.startsWith('CLIENT_CONFIG_')) {
                const subKey = key.replace('CLIENT_CONFIG_', '');
                if (subKey === 'booking_mode') currentTemplate.client_config.booking.mode = val;
                else if (subKey === 'booking_time_slots_enabled') currentTemplate.client_config.booking.time_slots.enabled = val;
                else if (subKey === 'booking_time_slots_start') currentTemplate.client_config.booking.time_slots.start = val;
                else if (subKey === 'booking_time_slots_end') currentTemplate.client_config.booking.time_slots.end = val;
                else if (subKey === 'booking_time_slots_interval') currentTemplate.client_config.booking.time_slots.interval = val;
            } 
            else if (key.startsWith('FEATURES_')) {
                currentTemplate.features[key.replace('FEATURES_', '')] = val;
            }
            else if (key.startsWith('TERMS_')) {
                currentTemplate.terms[key.replace('TERMS_', '')] = val;
            }
        });
    });

    // 2. 收集導覽列
    const navBar = [];
    document.querySelectorAll('#nav-items-container .nav-item-row').forEach(row => {
        navBar.push({
            label: row.querySelector('[name="nav_label"]').value,
            target: row.querySelector('[name="nav_target"]').value,
            enabled: row.querySelector('[name="nav_enabled"]').checked
        });
    });
    currentTemplate.logic.navBar = navBar;

    // 3. 收集後台頁面啟用
    const adminPagesEnabled = {};
    document.querySelectorAll('#admin-pages-enablement-container input[type="checkbox"]').forEach(cb => {
        adminPagesEnabled[cb.dataset.pageKey] = cb.checked;
    });
    currentTemplate.logic.adminPagesEnabled = adminPagesEnabled;

    // 4. 收集後台欄位設定
    function getColumns(id) {
        const cols = [];
        document.querySelectorAll(`#${id} .admin-column-row`).forEach(row => {
            cols.push({
                key: row.querySelector('.column-key').textContent.trim(),
                label: row.querySelector('[name="column_label"]').value.trim(),
                enabled: row.querySelector('[name="column_enabled"]').checked
            });
        });
        return cols;
    }
    currentTemplate.logic.adminColumns = getColumns('admin-columns-product');
    currentTemplate.logic.adminBookingColumns = getColumns('admin-columns-booking');
    currentTemplate.logic.adminUserColumns = getColumns('admin-columns-user');

    return { [selectedKey]: currentTemplate };
}

function setupEventListeners() {
    const page = document.getElementById('page-settings');
    if (!page || page.dataset.listenersAttached === 'true') return;

    const templateSelector = document.getElementById('template-selector');
    const tabsContainer = page.querySelector('.settings-tabs');
    const settingsForm = document.getElementById('settings-form');

    // 樣板切換
    templateSelector.addEventListener('change', () => {
        renderTemplateSettings(templateSelector.value);
    });

    // Tab 切換
    tabsContainer.addEventListener('click', (e) => {
        if (e.target.matches('.settings-tab')) {
            tabsContainer.querySelector('.active')?.classList.remove('active');
            e.target.classList.add('active');
            page.querySelectorAll('.settings-tab-content').forEach(el => el.classList.remove('active'));
            document.getElementById(e.target.dataset.target)?.classList.add('active');
        }
    });

    // 表單提交 (儲存)
    settingsForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const saveButton = document.getElementById('save-settings-btn');
        if (!await ui.confirm('確定要儲存並套用變更嗎？')) return;

        saveButton.disabled = true;
        saveButton.textContent = '儲存中...';

        try {
            const updatedDefinitions = reconstructTemplateFromUI();
            const currentTemplateKey = Object.keys(updatedDefinitions)[0];
            const finalDefinitions = Object.assign({}, templateDefinitions, updatedDefinitions);

            const payload = [
                { key: 'LOGIC_INDUSTRY_TEMPLATE_DEFINITIONS', value: JSON.stringify(finalDefinitions, null, 2) },
                { key: 'LOGIC_ACTIVE_INDUSTRY_TEMPLATE', value: currentTemplateKey }
            ];

            await api.updateSettings(payload);
            templateDefinitions = finalDefinitions;
            
            ui.toast.success('設定已更新！請重新整理頁面以確保功能生效。');
            setTimeout(() => window.location.reload(), 1500);

        } catch (error) {
            ui.toast.error(`儲存失敗：${error.message}`);
        } finally {
            saveButton.disabled = false;
            saveButton.textContent = '儲存並啟用';
        }
    });

    page.dataset.listenersAttached = 'true';
}

export const init = async () => {
    const settingsPage = document.getElementById('page-settings');
    if (!settingsPage) return;

    try {
        allSettings = await api.getSettings();
        
        const defSetting = allSettings.find(i => i.key === 'LOGIC_INDUSTRY_TEMPLATE_DEFINITIONS');
        const activeSetting = allSettings.find(i => i.key === 'LOGIC_ACTIVE_INDUSTRY_TEMPLATE');

        templateDefinitions = defSetting && defSetting.value ? JSON.parse(defSetting.value) : {};
        
        const selector = document.getElementById('template-selector');
        selector.innerHTML = '';
        
        let activeKey = activeSetting ? activeSetting.value : '';
        let hasOptions = false;

        for (const key in templateDefinitions) {
            selector.add(new Option(templateDefinitions[key].name || key, key));
            hasOptions = true;
        }

        if (hasOptions) {
            if (activeKey && templateDefinitions[activeKey]) {
                selector.value = activeKey;
            } else {
                selector.selectedIndex = 0;
            }
            renderTemplateSettings(selector.value);
            setupEventListeners();
        } else {
            selector.innerHTML = '<option>無可用樣板</option>';
            selector.disabled = true;
        }

    } catch (error) {
        console.error('Settings Init Error:', error);
        settingsPage.innerHTML = `<p style="color:red;">載入失敗: ${error.message}</p>`;
    }
};