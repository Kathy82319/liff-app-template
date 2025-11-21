// public/admin/modules/systemSettings.js
import { api } from '../api.js';
import { ui } from '../ui.js';

let allSettings = []; 
let templateDefinitions = {}; 
let sortableInstances = {}; 

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
        inputContainer.innerHTML = `<input type="text" data-key="${setting.key}" value="${setting.value || ''}" placeholder="${setting.hint || ''}">`;
    }

    row.append(label, inputContainer);
    return row;
}

// ... (createNavBarModule 保持不變) ...
function createNavBarModule(navBarConfig = [], availablePages = []) { 
    const container = document.createElement('div');
    container.className = 'setting-visual-guide';
    container.innerHTML = `<h5>底部導覽列設定 (可拖曳排序)</h5><div id="nav-items-container" class="sortable-list"></div>`;
    const navItemsContainer = container.querySelector('#nav-items-container');
    const itemTemplate = document.getElementById('nav-item-template');

    if (!itemTemplate) {
        return container;
    }

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

// ... (createLiffPageSettingsModule 保持不變) ...
function createLiffPageSettingsModule(pageConfig, templateFeatures, templateTerms) {
    const accordionTemplate = document.getElementById('accordion-template');
    if (!accordionTemplate) return document.createElement('div');

    if (pageConfig.target === 'page-booking') return null;

    const clone = accordionTemplate.content.cloneNode(true);
    const accordionItem = clone.querySelector('.accordion-item');
    accordionItem.querySelector('h4').textContent = `${pageConfig.label} 頁面設定`;
    const content = accordionItem.querySelector('.accordion-content');
    content.dataset.pageKey = pageConfig.target;

    if (pageConfig.target === 'page-products') {
        content.appendChild(createSettingRow({
            label: '顯示搜尋框', hint: '是否在產品列表頁顯示關鍵字搜尋框。',
            key: 'FEATURES_PRODUCT_SHOW_SEARCH', value: templateFeatures.PRODUCT_SHOW_SEARCH !== false, type: 'toggle'
        }));
        content.appendChild(createSettingRow({
            label: '顯示篩選器', hint: '是否顯示分類或其他篩選條件。',
            key: 'FEATURES_PRODUCT_SHOW_FILTERS', value: templateFeatures.PRODUCT_SHOW_FILTERS !== false, type: 'toggle'
        }));
        content.appendChild(createSettingRow({
            label: '顯示排序按鈕', hint: '是否顯示價格排序按鈕。',
            key: 'FEATURES_PRODUCT_SHOW_SORTING', value: templateFeatures.PRODUCT_SHOW_SORTING !== false, type: 'toggle'
        }));
        content.appendChild(createSettingRow({
            label: '產品/服務名稱 (單數)', hint: '例如：服務、房型、商品。',
            key: 'TERMS_PRODUCT_NAME', value: templateTerms.PRODUCT_NAME || '項目', type: 'text'
        }));
        content.appendChild(createSettingRow({
            label: '產品/服務目錄標題', hint: '例如：服務項目、房型介紹、線上商店。',
            key: 'TERMS_PRODUCT_CATALOG_TITLE', value: templateTerms.PRODUCT_CATALOG_TITLE || '產品型錄', type: 'text'
        }));
    }
    else if (pageConfig.target === 'page-profile') {
        content.appendChild(createSettingRow({
            label: '顯示 QR Code', hint: '是否在會員中心顯示會員 QR Code。',
            key: 'FEATURES_PROFILE_SHOW_QR_CODE', value: templateFeatures.PROFILE_SHOW_QR_CODE !== false, type: 'toggle'
        }));
        content.appendChild(createSettingRow({
            label: '顯示特殊優惠行', hint: '是否顯示會員獨享的優惠文字行。',
            key: 'FEATURES_PROFILE_SHOW_PERK_LINE', value: templateFeatures.PROFILE_SHOW_PERK_LINE !== false, type: 'toggle'
        }));
        content.appendChild(createSettingRow({
            label: '顯示點數紀錄按鈕', hint: '是否顯示前往點數紀錄頁面的按鈕。',
            key: 'FEATURES_PROFILE_SHOW_EXP_HISTORY_BTN', value: templateFeatures.PROFILE_SHOW_EXP_HISTORY_BTN !== false, type: 'toggle'
        }));
        content.appendChild(createSettingRow({
            label: '會員方案標籤文字', hint: '例如：會員等級、目前方案。',
            key: 'TERMS_PROFILE_CLASS_LABEL', value: templateTerms.PROFILE_CLASS_LABEL || '會員方案', type: 'text'
        }));
         content.appendChild(createSettingRow({
            label: '等級/經驗值標籤文字', hint: '例如：目前等級、經驗值。',
            key: 'TERMS_PROFILE_LEVEL_LABEL', value: templateTerms.PROFILE_LEVEL_LABEL || '等級', type: 'text'
        }));
         content.appendChild(createSettingRow({
            label: '點數/積分標籤文字', hint: '例如：剩餘點數、可用積分。',
            key: 'TERMS_PROFILE_POINTS_LABEL', value: templateTerms.PROFILE_POINTS_LABEL || '點數', type: 'text'
        }));
        content.appendChild(createSettingRow({
            label: '特殊優惠標籤文字', hint: '顯示在優惠內容前的文字。',
            key: 'TERMS_PROFILE_PERK_LABEL', value: templateTerms.PROFILE_PERK_LABEL || '專屬優惠', type: 'text'
        }));
        content.appendChild(createSettingRow({
            label: '預約紀錄按鈕文字', hint: '會員中心內按鈕的文字。',
            key: 'TERMS_PROFILE_BOOKINGS_BTN_LABEL', value: templateTerms.PROFILE_BOOKINGS_BTN_LABEL || '預約紀錄', type: 'text'
        }));
        content.appendChild(createSettingRow({
            label: '點數紀錄按鈕文字', hint: '會員中心內按鈕的文字。',
            key: 'TERMS_PROFILE_EXP_HISTORY_BTN_LABEL', value: templateTerms.PROFILE_EXP_HISTORY_BTN_LABEL || '點數紀錄', type: 'text'
        }));
        content.appendChild(createSettingRow({
            label: '編輯資料按鈕文字', hint: '會員中心內按鈕的文字。',
            key: 'TERMS_PROFILE_EDIT_BTN_LABEL', value: templateTerms.PROFILE_EDIT_BTN_LABEL || '編輯資料', type: 'text'
        }));
    }
    else if (pageConfig.target === 'page-home') {
        content.appendChild(createSettingRow({
            label: '最新情報頁面標題', hint: '例如：最新消息、住房優惠、促銷活動。',
            key: 'TERMS_NEWS_PAGE_TITLE', value: templateTerms.NEWS_PAGE_TITLE || '最新情報', type: 'text'
        }));
    }

    if (content.children.length === 0) {
        content.innerHTML = '<p style="color: var(--color-text-secondary);">此頁面目前沒有可設定的項目。</p>';
    }

    return accordionItem;
}

// ... (renderAdminPageEnablement, renderAdminColumnsSettings 保持不變) ...
function renderAdminPageEnablement(adminPagesConfig = {}, containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;
    container.innerHTML = ''; 

    const allAdminPages = {
        "dashboard": "儀表板",
        "users": "顧客管理",
        "inventory": "產品/服務管理",
        "room-availability": "房量控管",
        "bookings": "訂位/訂單管理",
        "vouchers": "優惠券管理", 
        "exp-history": "點數紀錄",
        "points": "點數發放中心", 
        "news": "資訊管理",
        "drafts": "訊息草稿",
        "store-info": "店家資訊",
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

function renderTemplateSettings(templateKey) {
    const template = templateDefinitions[templateKey];
    if (!template) return;

    const liffSettingsContainer = document.getElementById('liff-app-settings');
    const adminSettingsContainer = document.getElementById('admin-panel-settings');
    const ownerLiffSettingsContainer = document.getElementById('owner-liff-settings');

    // --- 1. 渲染客戶端 (LIFF) 設定 ---
    liffSettingsContainer.innerHTML = ''; 
    if (template.logic && template.logic.navBar && template.features && template.terms) {
        try {
            // (1) 通用設定
            const globalAccordion = document.getElementById('accordion-template').content.cloneNode(true).querySelector('.accordion-item');
            globalAccordion.querySelector('h4').textContent = '通用設定';
            const globalContent = globalAccordion.querySelector('.accordion-content');
            globalContent.appendChild(createSettingRow({
                label: '商家/品牌名稱', hint: '會顯示在 LIFF App 的頂部標題。',
                key: 'TERMS_BUSINESS_NAME', value: template.terms.BUSINESS_NAME || '我的商店', type: 'text'
            }));
            globalContent.appendChild(createSettingRow({
                label: '點數/積分名稱', hint: '例如：會員點數、購物金、住宿積分。',
                key: 'TERMS_POINTS_NAME', value: template.terms.POINTS_NAME || '點數', type: 'text'
            }));
            globalContent.appendChild(createSettingRow({ 
                label: '會員系統', hint: '啟用後，顧客才能註冊會員、累積點數。',
                key: 'FEATURES_ENABLE_MEMBERSHIP_SYSTEM', value: template.features.ENABLE_MEMBERSHIP_SYSTEM || false, type: 'toggle'
            }));
            globalContent.appendChild(createSettingRow({
                label: '線上預約系統', hint: '啟用後，顧客才能使用線上預約/訂房功能。',
                key: 'FEATURES_ENABLE_BOOKING_SYSTEM', value: template.features.ENABLE_BOOKING_SYSTEM || false, type: 'toggle' 
            }));
            liffSettingsContainer.appendChild(globalAccordion);

            // 【核心修改】 (2) 客戶端專屬功能開關 (分流設定)
            const clientFeaturesAccordion = document.getElementById('accordion-template').content.cloneNode(true).querySelector('.accordion-item');
            clientFeaturesAccordion.querySelector('h4').textContent = '功能模組顯示 (客戶端)';
            const clientFeaturesContent = clientFeaturesAccordion.querySelector('.accordion-content');
            
            // 儲值金
            clientFeaturesContent.appendChild(createSettingRow({
                label: '顯示儲值金功能', hint: '控制是否在會員中心顯示餘額、在預約時顯示付款選項。',
                key: 'FEATURES_CLIENT_SHOW_STORED_VALUE', value: template.features.CLIENT_SHOW_STORED_VALUE !== false, type: 'toggle'
            }));
            clientFeaturesContent.appendChild(createSettingRow({
                label: '儲值金名稱', hint: '例如：儲值金、錢包餘額。',
                key: 'TERMS_STORED_VALUE_NAME', value: template.terms.STORED_VALUE_NAME || '儲值金', type: 'text'
            }));
            
            // 優惠券
            clientFeaturesContent.appendChild(createSettingRow({
                label: '顯示優惠券功能', hint: '控制是否在會員中心顯示「我的優惠券」按鈕。',
                key: 'FEATURES_CLIENT_SHOW_VOUCHERS', value: template.features.CLIENT_SHOW_VOUCHERS !== false, type: 'toggle'
            }));
            clientFeaturesContent.appendChild(createSettingRow({
                label: '優惠券名稱', hint: '例如：優惠券、折價券。',
                key: 'TERMS_VOUCHER_NAME', value: template.terms.VOUCHER_NAME || '優惠券', type: 'text'
            }));
            
            liffSettingsContainer.appendChild(clientFeaturesAccordion);

            // (3) 頁面設定 (NavBar)
            template.logic.navBar.forEach(pageConfig => {
                const pageModule = createLiffPageSettingsModule(pageConfig, template.features, template.terms);
                if (pageModule) liffSettingsContainer.appendChild(pageModule);
            });

            // (4) 導覽列排序
            const navBarAccordion = document.getElementById('accordion-template').content.cloneNode(true).querySelector('.accordion-item');
            navBarAccordion.querySelector('h4').textContent = '底部導覽列管理';
            navBarAccordion.querySelector('.accordion-content').appendChild(createNavBarModule(template.logic.navBar, template.logic.availablePages));
            liffSettingsContainer.appendChild(navBarAccordion);

            bindAccordionEvents(liffSettingsContainer);

        } catch (e) {
             console.error("渲染客戶端設定錯誤:", e);
        }
    }

    // --- 2. 渲染商家後台 (Admin) 設定 ---
    adminSettingsContainer.innerHTML = `
        <p style="margin-bottom: 1.5rem; color: var(--color-text-light);">設定商家後台各管理頁面的顯示、列表欄位與功能開關。</p>
        <div class="accordion-item">
            <div class="accordion-header"><h4>後台頁面啟用管理</h4><span>▼</span></div>
            <div class="accordion-content"><div id="admin-pages-enablement-container"></div></div>
        </div>
        <div class="accordion-item">
            <div class="accordion-header"><h4>顧客管理 (CRM) 功能設定</h4><span>▼</span></div>
            <div class="accordion-content" id="admin-crm-settings-container"></div>
        </div>
        <div class="accordion-item">
            <div class="accordion-header"><h4 data-module-title="product">產品/服務管理 列表欄位</h4><span>▼</span></div>
            <div class="accordion-content"><div id="admin-columns-product" class="admin-columns-container"></div></div>
        </div>
        <div class="accordion-item">
            <div class="accordion-header"><h4>訂位/訂單管理 列表欄位</h4><span>▼</span></div>
            <div class="accordion-content"><div id="admin-columns-booking" class="admin-columns-container"></div></div>
        </div>
        <div class="accordion-item">
            <div class="accordion-header"><h4>顧客管理 列表欄位</h4><span>▼</span></div>
            <div class="accordion-content"><div id="admin-columns-user" class="admin-columns-container"></div></div>
        </div>
        <div class="accordion-item">
            <div class="accordion-header"><h4>情報管理 列表欄位</h4><span>▼</span></div>
            <div class="accordion-content"><div id="admin-columns-news" class="admin-columns-container"></div></div>
        </div>
        <div class="accordion-item">
            <div class="accordion-header"><h4>訊息草稿管理 列表欄位</h4><span>▼</span></div>
            <div class="accordion-content"><div id="admin-columns-drafts" class="admin-columns-container"></div></div>
        </div>
         <div class="accordion-item">
            <div class="accordion-header"><h4>點數紀錄查詢 列表欄位</h4><span>▼</span></div>
            <div class="accordion-content"><div id="admin-columns-exp-history" class="admin-columns-container"></div></div>
        </div>
    `;

    const logic = template.logic || {};
    const features = template.features || {};
    
    // 渲染頁面啟用開關
    renderAdminPageEnablement(logic.adminPagesEnabled, 'admin-pages-enablement-container');

    // 【核心修改】渲染 CRM 功能開關 (Admin 專用)
    const crmContainer = document.getElementById('admin-crm-settings-container');
    crmContainer.appendChild(createSettingRow({
        label: '顯示「儲值金」模組', hint: '是否在詳細資料視窗中顯示儲值金餘額、紀錄與操作按鈕。',
        key: 'FEATURES_ADMIN_CRM_SHOW_STORED_VALUE', value: features.ADMIN_CRM_SHOW_STORED_VALUE !== false, type: 'toggle'
    }));
    crmContainer.appendChild(createSettingRow({
        label: '顯示「優惠券」模組', hint: '是否在詳細資料視窗中顯示優惠券列表與發送按鈕。',
        key: 'FEATURES_ADMIN_CRM_SHOW_VOUCHERS', value: features.ADMIN_CRM_SHOW_VOUCHERS !== false, type: 'toggle'
    }));

    // 渲染產品名稱設定
    const productAccordionContent = adminSettingsContainer.querySelector('#admin-columns-product')?.parentElement;
    if (productAccordionContent) {
        const nameSettingGroup = document.createElement('div');
        nameSettingGroup.className = 'setting-row';
        nameSettingGroup.innerHTML = `
            <div class="setting-label"><label>產品管理(編輯的標題)</label><small>用於「編輯...」彈窗</small></div>
            <div><input type="text" id="setting-admin-entity-name" value="${logic.adminEntityName || ''}"></div>
        `;
        const namePluralSettingGroup = document.createElement('div');
        namePluralSettingGroup.className = 'setting-row';
        namePluralSettingGroup.innerHTML = `
            <div class="setting-label"><label>產品管理名稱更改</label><small>用於分頁標題。</small></div>
            <div><input type="text" id="setting-admin-entity-name-plural" value="${logic.adminEntityNamePlural || ''}"></div>
        `;
        productAccordionContent.insertBefore(namePluralSettingGroup, productAccordionContent.firstChild);
        productAccordionContent.insertBefore(nameSettingGroup, namePluralSettingGroup);
    }
    const productAccordionTitle = adminSettingsContainer.querySelector('.accordion-item h4[data-module-title="product"]');
    if (productAccordionTitle) {
        productAccordionTitle.textContent = `${logic.adminEntityNamePlural || '產品/服務'}管理 列表欄位`;
    }

    // 渲染欄位設定
    renderAdminColumnsSettings('product', logic.adminColumns, 'admin-columns-product');
    renderAdminColumnsSettings('booking', logic.adminBookingColumns || [], 'admin-columns-booking');
    
    // 確保 user columns 中包含 stored_value_balance
    let userColumns = logic.adminUserColumns || [];
    if (!userColumns.some(col => col.key === 'stored_value_balance')) {
        userColumns.push({ key: 'stored_value_balance', label: '儲值金', enabled: false });
    }
    renderAdminColumnsSettings('user', userColumns, 'admin-columns-user');
    
    renderAdminColumnsSettings('news', logic.adminNewsColumns || [], 'admin-columns-news');
    renderAdminColumnsSettings('drafts', logic.adminDraftColumns || [], 'admin-columns-drafts');
    renderAdminColumnsSettings('exp-history', logic.adminExpHistoryColumns || [], 'admin-columns-exp-history');
    
    bindAccordionEvents(adminSettingsContainer);

    // --- 3. 渲染手機板後台 (Owner LIFF) 設定 ---
    ownerLiffSettingsContainer.innerHTML = ''; 
    const terms = template.terms || {};
    
    // (1) 預約/訂房設定
    const bookingAccordion = document.getElementById('accordion-template').content.cloneNode(true).querySelector('.accordion-item');
    bookingAccordion.querySelector('h4').textContent = '預約/訂房 頁面設定';
    const bookingContent = bookingAccordion.querySelector('.accordion-content');
    bookingContent.appendChild(createSettingRow({
        label: '預約/訂單名稱', hint: '例如：預約、訂房、訂單。',
        key: 'TERMS_BOOKING_NAME', value: terms.BOOKING_NAME || '預約', type: 'text'
    }));
    bookingContent.appendChild(createSettingRow({
        label: '線上預約頁面標題', hint: '顯示在預約頁頂部的標題。',
        key: 'TERMS_BOOKING_PAGE_TITLE', value: terms.BOOKING_PAGE_TITLE || '線上預約', type: 'text'
    }));
    bookingContent.appendChild(createSettingRow({
        label: '取消政策標題', hint: '對應「入住須知編輯欄」中的取消政策欄位。',
        key: 'TERMS_BOOKING_POLICY_LABEL', value: terms.BOOKING_POLICY_LABEL || '取消政策', type: 'text'
    }));
    bookingContent.appendChild(createSettingRow({
        label: '入住須知標題', hint: '對應「入住須知編輯欄」中的入住須知欄位。',
        key: 'TERMS_BOOKING_INSTRUCTIONS_LABEL', value: terms.BOOKING_INSTRUCTIONS_LABEL || '入住須知', type: 'text'
    }));
    ownerLiffSettingsContainer.appendChild(bookingAccordion);

    // (2) 現場作業設定 (CRM 分流)
    const opAccordion = document.getElementById('accordion-template').content.cloneNode(true).querySelector('.accordion-item');
    opAccordion.querySelector('h4').textContent = '現場作業功能 (手機板)';
    const opContent = opAccordion.querySelector('.accordion-content');
    opContent.appendChild(createSettingRow({
        label: '顯示「核銷/點數」分頁', hint: '是否在手機板顯示現場作業功能。',
        key: 'FEATURES_OWNER_LIFF_ENABLE_REDEEM', value: features.OWNER_LIFF_ENABLE_REDEEM !== false, type: 'toggle'
    }));
    opContent.appendChild(createSettingRow({
        label: '啟用相機掃碼', hint: '是否啟用 QR Code 掃描器。',
        key: 'FEATURES_OWNER_LIFF_ENABLE_SCANNER', value: features.OWNER_LIFF_ENABLE_SCANNER !== false, type: 'toggle'
    }));
    // 【新增】Owner CRM 開關
    opContent.appendChild(createSettingRow({
        label: 'CRM 顯示儲值金', hint: '手機查詢顧客時，是否顯示儲值金資訊與操作。',
        key: 'FEATURES_OWNER_CRM_SHOW_STORED_VALUE', value: features.OWNER_CRM_SHOW_STORED_VALUE !== false, type: 'toggle'
    }));
    opContent.appendChild(createSettingRow({
        label: 'CRM 顯示優惠券', hint: '手機查詢顧客時，是否顯示優惠券資訊與操作。',
        key: 'FEATURES_OWNER_CRM_SHOW_VOUCHERS', value: features.OWNER_CRM_SHOW_VOUCHERS !== false, type: 'toggle'
    }));
    
    ownerLiffSettingsContainer.appendChild(opAccordion);

    // (3) 民宿專用設定
    if (templateKey === 'guesthouse_template') { 
        const guesthouseAccordion = document.getElementById('accordion-template').content.cloneNode(true).querySelector('.accordion-item');
        guesthouseAccordion.querySelector('h4').textContent = '民宿專用功能 (手機板)';
        const guesthouseContent = guesthouseAccordion.querySelector('.accordion-content');
        guesthouseContent.appendChild(createSettingRow({
            label: '啟用簡易控房', 
            hint: '是否在老闆 LIFF 中顯示「管理房價/房量」按鈕。',
            key: 'FEATURES_OWNER_LIFF_ENABLE_ROOM_CONTROL',
            value: features.OWNER_LIFF_ENABLE_ROOM_CONTROL || false, 
            type: 'toggle'
        }));
        ownerLiffSettingsContainer.appendChild(guesthouseAccordion);
    }
    
    bindAccordionEvents(ownerLiffSettingsContainer);
}

function reconstructTemplateFromUI() {
    const selectedKey = document.getElementById('template-selector').value;
    if (!templateDefinitions[selectedKey]) {
         throw new Error(`無法重構樣板：找不到樣板 key "${selectedKey}"`);
    }
    const currentTemplate = JSON.parse(JSON.stringify(templateDefinitions[selectedKey]));

    if (!currentTemplate.features) currentTemplate.features = {};
    if (!currentTemplate.terms) currentTemplate.terms = {};

    document.querySelectorAll('#liff-app-settings, #owner-liff-settings, #admin-crm-settings-container').forEach(container => {
        container.querySelectorAll('.setting-row [data-key]').forEach(input => {
            const key = input.dataset.key; 
            if (!key) return;

            const keyParts = key.split('_');
            if (keyParts.length < 2) return;

            const mainKey = keyParts[0].toLowerCase(); 
            const subKey = keyParts.slice(1).join('_');

            if (currentTemplate[mainKey]) {
                if (input.type === 'checkbox') {
                    currentTemplate[mainKey][subKey] = input.checked;
                } else {
                     currentTemplate[mainKey][subKey] = input.value;
                }
            }
        });
    });

    const navBar = [];
    document.querySelectorAll('#nav-items-container .nav-item-row').forEach(row => {
        const labelInput = row.querySelector('[name="nav_label"]');
        const targetSelect = row.querySelector('[name="nav_target"]');
        const enabledCheckbox = row.querySelector('[name="nav_enabled"]');
        if (labelInput && targetSelect && enabledCheckbox) {
            navBar.push({
                label: labelInput.value,
                target: targetSelect.value,
                enabled: enabledCheckbox.checked
            });
        }
    });

    if (!currentTemplate.logic) currentTemplate.logic = {};
    currentTemplate.logic.navBar = navBar;

    const adminEntityNameInput = document.getElementById('setting-admin-entity-name');
    const adminEntityNamePluralInput = document.getElementById('setting-admin-entity-name-plural');
    if (adminEntityNameInput) currentTemplate.logic.adminEntityName = adminEntityNameInput.value.trim() || '';
    if (adminEntityNamePluralInput) currentTemplate.logic.adminEntityNamePlural = adminEntityNamePluralInput.value.trim() || '';

    const adminPagesEnabled = {};
    const enablementContainer = document.getElementById('admin-pages-enablement-container');
    if (enablementContainer) {
        enablementContainer.querySelectorAll('input[type="checkbox"][data-page-key]').forEach(checkbox => {
            const pageKey = checkbox.dataset.pageKey;
            if (pageKey) {
                adminPagesEnabled[pageKey] = checkbox.checked;
            }
        });
        currentTemplate.logic.adminPagesEnabled = adminPagesEnabled;
    }

     function reconstructAdminColumns(containerId) {
        const container = document.getElementById(containerId);
        const columns = [];
        if (container) {
            container.querySelectorAll('.admin-column-row').forEach(row => {
                const keyElement = row.querySelector('.column-key');
                const labelInput = row.querySelector('[name="column_label"]');
                const enabledCheckbox = row.querySelector('[name="column_enabled"]');
                if (keyElement && keyElement.textContent.trim() && labelInput && enabledCheckbox) {
                    columns.push({
                        key: keyElement.textContent.trim(),
                        label: labelInput.value.trim(),
                        enabled: enabledCheckbox.checked
                    });
                }
            });
        }
        return columns;
    }

    currentTemplate.logic.adminColumns = reconstructAdminColumns('admin-columns-product');
    currentTemplate.logic.adminBookingColumns = reconstructAdminColumns('admin-columns-booking');
    currentTemplate.logic.adminUserColumns = reconstructAdminColumns('admin-columns-user');
    currentTemplate.logic.adminNewsColumns = reconstructAdminColumns('admin-columns-news');
    currentTemplate.logic.adminDraftColumns = reconstructAdminColumns('admin-columns-drafts');
    currentTemplate.logic.adminExpHistoryColumns = reconstructAdminColumns('admin-columns-exp-history');

    return { [selectedKey]: currentTemplate };
}

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
                if (arrow) {
                    arrow.textContent = isOpen ? '▲' : '▼';
                }
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

function setupEventListeners() {
    const page = document.getElementById('page-settings');
    if (!page || page.dataset.listenersAttached === 'true') return;

    const templateSelector = document.getElementById('template-selector');
    const tabsContainer = page.querySelector('.settings-tabs');
    const settingsForm = document.getElementById('settings-form');

    templateSelector.addEventListener('change', () => {
        Object.keys(sortableInstances).forEach(key => {
            if (sortableInstances[key]) {
                try { sortableInstances[key].destroy(); } catch (e) {}
            }
        });
        sortableInstances = {};
        renderTemplateSettings(templateSelector.value);
    });

    tabsContainer.addEventListener('click', (e) => {
        if (e.target.matches('.settings-tab')) {
            const activeTab = tabsContainer.querySelector('.active');
            const activeContent = document.querySelector('.settings-tab-content.active');
            if (activeTab) activeTab.classList.remove('active');
            if (activeContent) activeContent.classList.remove('active');

            e.target.classList.add('active');
            const targetContent = document.getElementById(e.target.dataset.target);
            if (targetContent) targetContent.classList.add('active');
        }
    });

    settingsForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const saveButton = document.getElementById('save-settings-btn');
        const confirmed = await ui.confirm('您確定要儲存所有變更嗎？這將會更新樣板藍圖並啟用選擇的樣板。');
        if (!confirmed) return;

        saveButton.disabled = true;
        saveButton.textContent = '儲存中...';

        try {
            const payload = [];
            const updatedTemplatePart = reconstructTemplateFromUI();
            const currentTemplateKey = Object.keys(updatedTemplatePart)[0];
            const finalDefinitions = Object.assign({}, templateDefinitions, updatedTemplatePart);

            payload.push({
                key: 'LOGIC_INDUSTRY_TEMPLATE_DEFINITIONS',
                value: JSON.stringify(finalDefinitions, null, 2)
            });

            payload.push({
                key: 'LOGIC_ACTIVE_INDUSTRY_TEMPLATE',
                value: currentTemplateKey
            });

            await api.updateSettings(payload);
            templateDefinitions = finalDefinitions;
            allSettings = await api.getSettings();

            ui.toast.success('所有設定已成功儲存並啟用！');
             await ui.confirm("後台設定已更新！建議您重新整理管理頁面。");
             window.location.reload();

        } catch (error) {
            ui.toast.error(`儲存失敗：${error.message}`);
        } finally {
            saveButton.disabled = false;
            saveButton.textContent = '儲存並啟用';
        }
    });

    const liffSettingsContainer = document.getElementById('liff-app-settings');
    const adminSettingsContainer = document.getElementById('admin-panel-settings');
    const ownerLiffSettingsContainer = document.getElementById('owner-liff-settings');
    
    bindAccordionEvents(liffSettingsContainer);
    bindAccordionEvents(adminSettingsContainer);
    bindAccordionEvents(ownerLiffSettingsContainer); 

    page.dataset.listenersAttached = 'true';
}

export const init = async () => {
    const settingsPage = document.getElementById('page-settings');
     if (!settingsPage) return;

    try {
        Object.values(sortableInstances).forEach(instance => {
            if (instance && typeof instance.destroy === 'function') instance.destroy();
        });
        sortableInstances = {};

        allSettings = await api.getSettings();

        const definitionsSetting = allSettings.find(i => i.key === 'LOGIC_INDUSTRY_TEMPLATE_DEFINITIONS');
        const activeTemplateSetting = allSettings.find(i => i.key === 'LOGIC_ACTIVE_INDUSTRY_TEMPLATE');

        if (definitionsSetting && definitionsSetting.value) {
            try {
                templateDefinitions = JSON.parse(definitionsSetting.value);
            } catch (e) {
                 templateDefinitions = {};
                 throw new Error('樣板定義檔格式錯誤。');
            }
        } else {
             templateDefinitions = {};
        }

        const templateSelector = document.getElementById('template-selector');
        templateSelector.innerHTML = '';
        if (Object.keys(templateDefinitions).length > 0) {
             let activeKeyFound = false;
             for (const key in templateDefinitions) {
                 if (templateDefinitions[key] && templateDefinitions[key].name) {
                     templateSelector.add(new Option(templateDefinitions[key].name, key));
                     if (activeTemplateSetting && activeTemplateSetting.value === key) {
                         templateSelector.value = key;
                         activeKeyFound = true;
                     }
                 }
             }
             if (!activeKeyFound && templateSelector.options.length > 0) {
                 templateSelector.selectedIndex = 0;
             }
             templateSelector.disabled = false;
             document.getElementById('save-settings-btn').disabled = false;
        } else {
             templateSelector.innerHTML = '<option value="">無可用樣板</option>';
             templateSelector.disabled = true;
             document.getElementById('save-settings-btn').disabled = true;
             throw new Error('系統中沒有設定任何商業樣板藍圖。');
        }

        renderTemplateSettings(templateSelector.value);
        setupEventListeners();

    } catch (error) {
        console.error('初始化系統設定頁面失敗:', error);
        settingsPage.innerHTML = `<p style="color:red;">讀取設定失敗: ${error.message}</p>`;
    }
};