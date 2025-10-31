// public/admin/modules/systemSettings.js (實作 Task 5.1B 且移除電商功能版本)
import { api } from '../api.js';
import { ui } from '../ui.js';

let allSettings = []; // 快取從 API 獲取的所有設定
let templateDefinitions = {}; // 快取解析後的樣板定義 JSON
let sortableInstances = {}; // 存放 Sortable 實例，鍵為容器 ID

// 建立單個設定列 (用於 Features, Terms 等)
function createSettingRow(setting) {
    const row = document.createElement('div');
    row.className = 'setting-row';

    const label = document.createElement('div');
    label.className = 'setting-label';
    label.innerHTML = `${setting.label}<small>${setting.hint}</small>`;

    const inputContainer = document.createElement('div');
    // 根據設定類型創建不同的 input 元素
    if (setting.type === 'toggle') {
        const switchId = `setting-toggle-${setting.key}`;
        // 使用 CSS 實現的滑動開關
        inputContainer.innerHTML = `<label class="switch" for="${switchId}"><input type="checkbox" id="${switchId}" data-key="${setting.key}" ${setting.value ? 'checked' : ''}><span class="slider"></span></label>`;
    } else { // 預設為 text input
        inputContainer.innerHTML = `<input type="text" data-key="${setting.key}" value="${setting.value || ''}" placeholder="${setting.hint || ''}">`;
    }

    row.append(label, inputContainer);
    return row;
}

function createLiffPageSettingsModule(pageConfig, templateFeatures, templateTerms) {
    const accordionTemplate = document.getElementById('accordion-template');
    if (!accordionTemplate) {
        console.error("找不到 #accordion-template");
        return document.createElement('div');
    }

    const clone = accordionTemplate.content.cloneNode(true);
    const accordionItem = clone.querySelector('.accordion-item');
    // 使用 pageConfig 中的 label 作為 Accordion 標題
    accordionItem.querySelector('h4').textContent = `${pageConfig.label} 頁面設定`;
    const content = accordionItem.querySelector('.accordion-content');
    content.dataset.pageKey = pageConfig.target; // 標記此區塊對應的頁面 key

    // --- 在此區塊內渲染與此頁面相關的 features 和 terms ---
    // 範例：產品頁面 (page-products)
    if (pageConfig.target === 'page-products') {
        content.appendChild(createSettingRow({
            label: '顯示搜尋框', hint: '是否在產品列表頁顯示關鍵字搜尋框。',
            key: 'FEATURES_PRODUCT_SHOW_SEARCH', value: templateFeatures.PRODUCT_SHOW_SEARCH !== false, type: 'toggle' // 預設 true
        }));
        content.appendChild(createSettingRow({
            label: '顯示篩選器', hint: '是否顯示分類或其他篩選條件。',
            key: 'FEATURES_PRODUCT_SHOW_FILTERS', value: templateFeatures.PRODUCT_SHOW_FILTERS !== false, type: 'toggle'
        }));
        content.appendChild(createSettingRow({
            label: '顯示排序按鈕', hint: '是否顯示價格排序按鈕。',
            key: 'FEATURES_PRODUCT_SHOW_SORTING', value: templateFeatures.PRODUCT_SHOW_SORTING !== false, type: 'toggle'
        }));
        // 產品頁相關的 Terms
        content.appendChild(createSettingRow({
            label: '產品/服務名稱 (單數)', hint: '例如：服務、房型、商品。',
            key: 'TERMS_PRODUCT_NAME', value: templateTerms.PRODUCT_NAME || '項目', type: 'text'
        }));
        content.appendChild(createSettingRow({
            label: '產品/服務目錄標題', hint: '例如：服務項目、房型介紹、線上商店。',
            key: 'TERMS_PRODUCT_CATALOG_TITLE', value: templateTerms.PRODUCT_CATALOG_TITLE || '產品型錄', type: 'text'
        }));
    }
    // 範例：會員中心頁面 (page-profile)
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
        // 會員中心相關 Terms
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
    // ... 為其他頁面 (home, booking, info) 添加類似的邏輯 ...
    else if (pageConfig.target === 'page-home') {
        content.appendChild(createSettingRow({
            label: '最新情報頁面標題', hint: '例如：最新消息、住房優惠、促銷活動。',
            key: 'TERMS_NEWS_PAGE_TITLE', value: templateTerms.NEWS_PAGE_TITLE || '最新情報', type: 'text'
        }));
    }
    else if (pageConfig.target === 'page-booking') {
         content.appendChild(createSettingRow({
            label: '預約/訂單名稱', hint: '例如：預約、訂房、訂單。',
            key: 'TERMS_BOOKING_NAME', value: templateTerms.BOOKING_NAME || '預約', type: 'text'
        }));
        content.appendChild(createSettingRow({
            label: '線上預約頁面標題', hint: '顯示在預約頁頂部的標題。',
            key: 'TERMS_BOOKING_PAGE_TITLE', value: templateTerms.BOOKING_PAGE_TITLE || '線上預約', type: 'text'
        }));
    }
     // ... 其他頁面 ...

    // 如果沒有為此頁面定義特定設定，顯示提示
    if (content.children.length === 0) {
        content.innerHTML = '<p style="color: var(--color-text-secondary);">此頁面目前沒有可設定的項目。</p>';
    }

    return accordionItem;
}

// ****** 新增：渲染後台頁面啟用設定 UI 的函式 ******
function renderAdminPageEnablement(adminPagesConfig = {}, containerId) {
    const container = document.getElementById(containerId);
    if (!container) {
        console.error(`渲染後台頁面啟用設定失敗：找不到容器 #${containerId}`);
        container.innerHTML = '<p style="color:red;">錯誤：UI 容器不存在。</p>'; // 直接在父級顯示錯誤
        return;
    }
    container.innerHTML = ''; // 清空

    // 定義所有可能的後台頁面對應的 key 和中文名稱
    const allAdminPages = {
        "dashboard": "儀表板",
        "users": "顧客管理",
        "inventory": "產品/服務管理",
        "room-availability": "房量控管",
        "bookings": "訂位/訂單管理",
        "exp-history": "點數紀錄",
        "news": "資訊管理",
        "drafts": "訊息草稿",
        "store-info": "店家資訊",
        "settings": "系統設定",
        "points": "點數發放中心"
    };

    for (const pageKey in allAdminPages) {
        const pageLabel = allAdminPages[pageKey];
        // 檢查 config 中是否有此 key，若無則預設為 true (啟用)
        const isEnabled = adminPagesConfig[pageKey] !== false;

        const row = document.createElement('div');
        row.className = 'setting-row'; // 沿用 setting-row 樣式

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

// 建立底部導覽列設定模組 UI
function createNavBarModule(navBarConfig = [], availablePages = []) { // 提供預設空陣列
    const container = document.createElement('div');
    container.className = 'setting-visual-guide';
    container.innerHTML = `<h5>底部導覽列設定 (可拖曳排序)</h5><div id="nav-items-container" class="sortable-list"></div>`; // 加上 sortable-list class
    const navItemsContainer = container.querySelector('#nav-items-container');
    const itemTemplate = document.getElementById('nav-item-template'); // 需確保 admin-panel.html 有此 template

    if (!itemTemplate) {
        console.error("找不到 #nav-item-template");
        container.innerHTML = '<p style="color:red;">錯誤：缺少導覽列項目模板。</p>';
        return container;
    }

    navBarConfig.forEach(item => {
        const clone = itemTemplate.content.cloneNode(true);
        const row = clone.querySelector('.nav-item-row');
        // 安全地設置值，避免 undefined 錯誤
        row.querySelector('[name="nav_label"]').value = item.label || '';
        row.querySelector('[name="nav_enabled"]').checked = item.enabled !== false; // 預設啟用
        const select = row.querySelector('[name="nav_target"]');
        select.innerHTML = ''; // 清空預設選項
        availablePages.forEach(page => {
            select.add(new Option(page.name || page.id, page.id)); // 使用 name 或 id 作為顯示文字
        });
        select.value = item.target || ''; // 設置選中值
        navItemsContainer.appendChild(row);
    });

    // 建立 Sortable 實例並存儲
    const listId = 'nav-items-container';
    if (sortableInstances[listId]) sortableInstances[listId].destroy(); // 銷毀舊實例
    // 確保 Sortable 函式庫已載入
    if (typeof Sortable !== 'undefined') {
        sortableInstances[listId] = new Sortable(navItemsContainer, { animation: 150, handle: '.drag-handle' });
    } else {
        console.error("Sortable.js 未載入，無法啟用拖曳排序。");
    }
    return container;
}

// 建立客戶端全域設定模組 UI (已移除購物車)
function createGlobalSettingsModule(template) {
    const accordionTemplate = document.getElementById('accordion-template'); // 需確保 admin-panel.html 有此 template
    if (!accordionTemplate) {
        console.error("找不到 #accordion-template");
        return document.createElement('div'); // 返回空 div 避免錯誤
    }

    const clone = accordionTemplate.content.cloneNode(true);
    const accordionItem = clone.querySelector('.accordion-item');
    accordionItem.querySelector('h4').textContent = '全域設定 (導覽列、功能開關)';
    const content = accordionItem.querySelector('.accordion-content');

    // 確保 template.features 和 template.terms 存在，若否則使用空物件
    const features = template.features || {};
    const terms = template.terms || {};
    const logic = template.logic || {};

    // 功能開關
    content.appendChild(createSettingRow({
        label: '會員系統', hint: '啟用後，顧客才能註冊會員、累積點數。',
        key: 'FEATURES_ENABLE_MEMBERSHIP_SYSTEM', value: features.ENABLE_MEMBERSHIP_SYSTEM || false, type: 'toggle' // 提供預設值 false
    }));
    content.appendChild(createSettingRow({
        label: '線上預約系統', hint: '啟用後，顧客才能使用線上預約/訂房功能。',
        key: 'FEATURES_ENABLE_BOOKING_SYSTEM', value: features.ENABLE_BOOKING_SYSTEM || false, type: 'toggle' // 提供預設值 false
    }));
    // --- 購物車功能已移除 ---
    // content.appendChild(createSettingRow({
    //     label: '購物車功能', hint: '【未來功能】啟用後，顧客才能將商品加入購物車。',
    //     key: 'FEATURES_ENABLE_SHOPPING_CART', value: features.ENABLE_SHOPPING_CART || false, type: 'toggle'
    // }));

    // 用詞定義
    content.appendChild(createSettingRow({
        label: '商家/品牌名稱', hint: '會顯示在 LIFF App 的頂部標題。',
        key: 'TERMS_BUSINESS_NAME', value: terms.BUSINESS_NAME || '我的商店', type: 'text' // 提供預設值
    }));
    content.appendChild(createSettingRow({
        label: '點數/積分名稱', hint: '例如：會員點數、購物金、住宿積分。',
        key: 'TERMS_POINTS_NAME', value: terms.POINTS_NAME || '點數', type: 'text' // 提供預設值
    }));
    // **新增** 其他 TERMS (請根據您的藍圖加入)
     content.appendChild(createSettingRow({
        label: '產品/服務名稱 (單數)', hint: '例如：服務、房型、商品。',
        key: 'TERMS_PRODUCT_NAME', value: terms.PRODUCT_NAME || '項目', type: 'text'
    }));
     content.appendChild(createSettingRow({
        label: '產品/服務目錄標題', hint: '例如：服務項目、房型介紹、線上商店。',
        key: 'TERMS_PRODUCT_CATALOG_TITLE', value: terms.PRODUCT_CATALOG_TITLE || '產品型錄', type: 'text'
    }));
     content.appendChild(createSettingRow({
        label: '預約/訂單名稱', hint: '例如：預約、訂房、訂單。',
        key: 'TERMS_BOOKING_NAME', value: terms.BOOKING_NAME || '預約', type: 'text'
    }));
     content.appendChild(createSettingRow({
        label: '最新情報頁面標題', hint: '例如：最新消息、住房優惠、促銷活動。',
        key: 'TERMS_NEWS_PAGE_TITLE', value: terms.NEWS_PAGE_TITLE || '最新情報', type: 'text'
    }));
    // ... 可以繼續添加其他 TERMS ...


    // 導覽列設定 (確保 logic.navBar 和 logic.availablePages 存在)
    if (logic.navBar && logic.availablePages) {
        content.appendChild(createNavBarModule(logic.navBar, logic.availablePages));
    } else {
         console.warn("樣板缺少 navBar 或 availablePages 設定。");
         const navPlaceholder = document.createElement('p');
         navPlaceholder.textContent = '此樣板缺少導覽列設定。';
         navPlaceholder.style.color = 'orange';
         content.appendChild(navPlaceholder);
    }

    // Accordion 點擊事件移到 setupEventListeners
    return accordionItem;
}

// ****** 新增：渲染 Admin Columns 設定 UI 的函式 ******
function renderAdminColumnsSettings(moduleKey, adminColumnsConfig, containerId) {
    const container = document.getElementById(containerId);
    if (!container) {
        console.error(`渲染後台欄位設定失敗：找不到容器 #${containerId}`);
        // 在容器位置顯示錯誤，而不是完全不渲染
        const errorP = document.createElement('p');
        errorP.style.color = 'red';
        errorP.textContent = `錯誤：UI 容器 #${containerId} 不存在。`;
        // 嘗試找到父級容器來顯示錯誤
        const parentContainer = document.querySelector(`#admin-panel-settings .accordion-content [data-container-id="${containerId}"]`) || document.getElementById('admin-panel-settings');
        if(parentContainer) parentContainer.appendChild(errorP);
        return;
    }
    container.innerHTML = ''; // 清空內容
    container.classList.add('sortable-list'); // 加上 class 方便 Sortable 初始化

    // 檢查 adminColumnsConfig 是否為陣列，若否則提供預設空陣列或提示
    const columns = Array.isArray(adminColumnsConfig) ? adminColumnsConfig : [];
    if (!Array.isArray(adminColumnsConfig)) {
         console.warn(`樣板 module '${moduleKey}' 的 adminColumns 設定不是陣列，將使用空設定。`, adminColumnsConfig);
         container.innerHTML = '<p style="color:orange;">此樣板尚未設定此模組的後台列表欄位。</p>'; // 顯示提示
    }

    const itemTemplate = document.getElementById('admin-column-item-template');
    if (!itemTemplate) {
        container.innerHTML = '<p style="color:red;">錯誤：找不到 #admin-column-item-template</p>';
        return;
    }

    columns.forEach(col => {
        // 增加對 col 本身以及內部屬性的檢查
        if (!col || typeof col.key !== 'string' || typeof col.label !== 'string') {
             console.warn(`[renderAdminColumnsSettings] 略過無效的 adminColumn 設定 (module: ${moduleKey}):`, col);
             return; // 跳過格式不符的項目
        }
        try {
            const clone = itemTemplate.content.cloneNode(true);
            const row = clone.querySelector('.admin-column-row');
            const keySpan = row.querySelector('.column-key');
            const labelInput = row.querySelector('[name="column_label"]');
            const enabledCheckbox = row.querySelector('[name="column_enabled"]');

            if(keySpan) {
                keySpan.textContent = col.key;
                keySpan.title = `欄位 Key: ${col.key} (不可修改)`; // 加上 tooltip
            } else { console.error("Template 缺少 .column-key"); }

            if(labelInput) labelInput.value = col.label;
            else { console.error("Template 缺少 [name='column_label']"); }

            if(enabledCheckbox) {
                // 假設 enabled 預設為 true，除非藍圖明確指定 false
                enabledCheckbox.checked = (col.enabled !== false);
            } else { console.error("Template 缺少 [name='column_enabled']"); }

            container.appendChild(row);
        } catch (e) {
             console.error(`[renderAdminColumnsSettings] 渲染欄位 '${col.key}' (module: ${moduleKey}) 時發生錯誤:`, e);
             container.innerHTML += `<p style="color:red;">渲染欄位 ${col.key} 失敗。</p>`;
        }
    });

    // 初始化 Sortable.js 並儲存實例
    if (sortableInstances[containerId]) sortableInstances[containerId].destroy();
    if (typeof Sortable !== 'undefined') {
        try {
             sortableInstances[containerId] = new Sortable(container, {
                 animation: 150,
                 handle: '.drag-handle' // 指定拖曳控制柄
             });
        } catch(e) {
             console.error(`初始化 Sortable 失敗於 #${containerId}:`, e);
             container.innerHTML += `<p style="color:red;">拖曳排序功能初始化失敗。</p>`;
        }
    } else {
        console.error("Sortable.js 未載入，無法啟用拖曳排序。");
        container.innerHTML += `<p style="color:orange;">拖曳排序功能未載入。</p>`;
    }
}

// ****** 修改：渲染整個樣板設定 (包含後台頁面啟用、更多後台欄位) ******
function renderTemplateSettings(templateKey) {
    const template = templateDefinitions[templateKey];
    if (!template) {
        console.error(`渲染樣板設定失敗：找不到樣板資料: ${templateKey}`);
        // 清空兩個 Tab 的內容並顯示錯誤
        const liffContainer = document.getElementById('liff-app-settings');
        const adminContainer = document.getElementById('admin-panel-settings');
        if (liffContainer) liffContainer.innerHTML = `<p style="color:red;">載入樣板 ${templateKey} 失敗。</p>`;
        if (adminContainer) adminContainer.innerHTML = ''; // 清空後台設定區
        return;
    }
    console.log(`渲染樣板 '${templateKey}' 的設定...`);

    const liffSettingsContainer = document.getElementById('liff-app-settings');
    const adminSettingsContainer = document.getElementById('admin-panel-settings');
    if (!liffSettingsContainer || !adminSettingsContainer) {
         console.error("渲染樣板設定失敗：找不到設定容器元素 (liff or admin)。");
         return;
    }

    // --- 渲染客戶端設定 (重構成按頁面分區) ---
    liffSettingsContainer.innerHTML = ''; // 清空
    if (template.logic && template.logic.navBar && Array.isArray(template.logic.navBar) && template.features && template.terms) {
        try {
            // 1. 渲染通用設定 (例如商家名稱、點數名稱)
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
            globalContent.appendChild(createSettingRow({ // 會員系統總開關
                label: '會員系統', hint: '啟用後，顧客才能註冊會員、累積點數。',
                key: 'FEATURES_ENABLE_MEMBERSHIP_SYSTEM', value: template.features.ENABLE_MEMBERSHIP_SYSTEM || false, type: 'toggle'
            }));
            // --- 【新增】加入其他總開關 ---
            globalContent.appendChild(createSettingRow({
                label: '線上預約系統', hint: '啟用後，顧客才能使用線上預約/訂房功能。',
                key: 'FEATURES_ENABLE_BOOKING_SYSTEM', value: template.features.ENABLE_BOOKING_SYSTEM || false, type: 'toggle' 
            }));
            // --- (購物車功能已移除) ---
            
            liffSettingsContainer.appendChild(globalAccordion);

            // 2. 根據 NavBar 設定，為每個頁面渲染一個 Accordion
            template.logic.navBar.forEach(pageConfig => {
                // 確保 pageConfig 結構完整
                if (pageConfig && pageConfig.target && pageConfig.label) {
                     liffSettingsContainer.appendChild(
                         createLiffPageSettingsModule(pageConfig, template.features, template.terms)
                     );
                } else {
                     console.warn("偵測到 NavBar 中有格式不完整的項目:", pageConfig);
                }
            });

            // 3. 渲染獨立的導覽列排序設定
            const navBarAccordion = document.getElementById('accordion-template').content.cloneNode(true).querySelector('.accordion-item');
            navBarAccordion.querySelector('h4').textContent = '底部導覽列管理';
            const navBarContent = navBarAccordion.querySelector('.accordion-content');
            if (template.logic.availablePages) { // 確保 availablePages 存在
                 navBarContent.appendChild(createNavBarModule(template.logic.navBar, template.logic.availablePages));
            } else {
                 console.warn(`樣板 ${templateKey} 缺少 availablePages 設定。`);
                 navBarContent.innerHTML = '<p style="color:orange;">此樣板缺少可用頁面定義，無法設定導覽列。</p>';
            }
            liffSettingsContainer.appendChild(navBarAccordion);

            // 為 LIFF 設定區塊綁定 Accordion 事件
             bindAccordionEvents(liffSettingsContainer);

        } catch (e) {
             console.error(`渲染客戶端設定時發生錯誤 (樣板: ${templateKey}):`, e);
             liffSettingsContainer.innerHTML = `<p style="color:red;">渲染客戶端設定失敗: ${e.message}</p>`;
        }
    } else {
        console.warn(`樣板 '${templateKey}' 缺少必要的設定區塊 (navBar, features, or terms)。`);
        liffSettingsContainer.innerHTML = '<p style="color:orange;">此樣板缺少必要的客戶端設定區塊。</p>';
    }

    // --- ****** 關鍵修改：渲染商家後台設定 (使用新版 HTML 結構) ****** ---
    // 這裡的 innerHTML 必須包含所有區塊
    adminSettingsContainer.innerHTML = `
        <p style="margin-bottom: 1.5rem; color: var(--color-text-light);">設定商家後台各管理頁面的顯示與列表欄位。</p>
        <div class="accordion-item">
            <div class="accordion-header"><h4>後台頁面啟用管理</h4><span>▼</span></div>
            <div class="accordion-content"><div id="admin-pages-enablement-container"><p>讀取中...</p></div></div>
        </div>
        <div class="accordion-item">
            <div class="accordion-header"><h4>產品/服務管理 後台設定</h4><span>▼</span></div>
            <div class="accordion-content"><div class="setting-visual-guide"><h5>列表顯示欄位 (可拖曳排序，勾選代表顯示)</h5><div id="admin-columns-product" class="admin-columns-container"><p>讀取中...</p></div></div></div>
        </div>
        <div class="accordion-item">
            <div class="accordion-header"><h4>訂位/訂單管理 後台設定</h4><span>▼</span></div>
            <div class="accordion-content"><div class="setting-visual-guide"><h5>列表顯示欄位 (可拖曳排序，勾選代表顯示)</h5><div id="admin-columns-booking" class="admin-columns-container"><p>讀取中...</p></div></div></div>
        </div>
        <div class="accordion-item">
            <div class="accordion-header"><h4>顧客管理 後台設定</h4><span>▼</span></div>
            <div class="accordion-content"><div class="setting-visual-guide"><h5>列表顯示欄位 (可拖曳排序，勾選代表顯示)</h5><div id="admin-columns-user" class="admin-columns-container"><p>讀取中...</p></div></div></div>
        </div>
        <div class="accordion-item">
            <div class="accordion-header"><h4>情報管理 後台設定</h4><span>▼</span></div>
            <div class="accordion-content"><div class="setting-visual-guide"><h5>列表顯示欄位 (可拖曳排序，勾選代表顯示)</h5><div id="admin-columns-news" class="admin-columns-container"><p>讀取中...</p></div></div></div>
        </div>
        <div class="accordion-item">
            <div class="accordion-header"><h4>訊息草稿管理 後台設定</h4><span>▼</span></div>
            <div class="accordion-content"><div class="setting-visual-guide"><h5>列表顯示欄位 (可拖曳排序，勾選代表顯示)</h5><div id="admin-columns-drafts" class="admin-columns-container"><p>讀取中...</p></div></div></div>
        </div>
         <div class="accordion-item">
            <div class="accordion-header"><h4>點數紀錄查詢 後台設定</h4><span>▼</span></div>
            <div class="accordion-content"><div class="setting-visual-guide"><h5>列表顯示欄位 (可拖曳排序，勾選代表顯示)</h5><div id="admin-columns-exp-history" class="admin-columns-container"><p>讀取中...</p></div></div></div>
        </div>
    `;
    // --- ****** 修改結束 ****** ---


    // 確保 template.logic 存在
    const logic = template.logic || {};

    // 渲染後台頁面啟用設定
    renderAdminPageEnablement(logic.adminPagesEnabled, 'admin-pages-enablement-container');

    // 渲染各模組的 adminColumns (加入新的)
    renderAdminColumnsSettings('product', logic.adminColumns, 'admin-columns-product');
    renderAdminColumnsSettings('booking', logic.adminBookingColumns || [], 'admin-columns-booking');
    renderAdminColumnsSettings('user', logic.adminUserColumns || [], 'admin-columns-user');
    renderAdminColumnsSettings('news', logic.adminNewsColumns || [], 'admin-columns-news');
    renderAdminColumnsSettings('drafts', logic.adminDraftColumns || [], 'admin-columns-drafts');
    renderAdminColumnsSettings('exp-history', logic.adminExpHistoryColumns || [], 'admin-columns-exp-history');

    // 為商家後台設定區塊綁定 Accordion 事件
    bindAccordionEvents(adminSettingsContainer);
}

// ****** 修改：從 UI 反向建構樣板 (加入讀取後台設定) ******
function reconstructTemplateFromUI() {
    // ... (開頭的 selectedKey 和 currentTemplate 深拷貝保持不變) ...
    const selectedKey = document.getElementById('template-selector').value;
    if (!templateDefinitions[selectedKey]) {
         throw new Error(`無法重構樣板：找不到樣板 key "${selectedKey}"`);
    }
    const currentTemplate = JSON.parse(JSON.stringify(templateDefinitions[selectedKey]));
    console.log("開始從 UI 重構樣板:", selectedKey);

    // --- 讀取客戶端設定 (從分頁 Accordion) ---
    const liffSettingsContainer = document.getElementById('liff-app-settings');
    if (liffSettingsContainer) {
        // 確保 features 和 terms 物件存在
        if (!currentTemplate.features) currentTemplate.features = {};
        if (!currentTemplate.terms) currentTemplate.terms = {};

        // 遍歷所有 setting-row 內的 input
        liffSettingsContainer.querySelectorAll('.setting-row [data-key]').forEach(input => {
            const key = input.dataset.key; // e.g., FEATURES_PRODUCT_SHOW_SEARCH or TERMS_BUSINESS_NAME
            if (!key) return;

            const keyParts = key.split('_');
            if (keyParts.length < 2) return;

            const mainKey = keyParts[0].toLowerCase(); // 'features' or 'terms'
            const subKey = keyParts.slice(1).join('_');

            // 根據 mainKey 決定存到 features 還是 terms
            if (currentTemplate[mainKey]) {
                if (input.type === 'checkbox') {
                    currentTemplate[mainKey][subKey] = input.checked;
                } else {
                     // 對數字類型嘗試轉換 (保持不變)
                     const originalSetting = allSettings.find(s => s.key === key);
                     if (originalSetting && originalSetting.type === 'number') {
                         currentTemplate[mainKey][subKey] = parseFloat(input.value) || 0;
                     } else {
                         currentTemplate[mainKey][subKey] = input.value;
                     }
                }
            } else {
                 console.warn(`樣板 ${selectedKey} 缺少 '${mainKey}' 物件，無法儲存 ${key}`);
            }
        });

        // 讀取導覽列排序設定 (保持不變)
        const navBar = [];
        // ... (讀取 #nav-items-container 的邏輯不變) ...
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
            } else {
                 console.warn("跳過格式不完整的導覽列項目行。");
            }
        });

        // 確保 currentTemplate.logic 存在
        if (!currentTemplate.logic) currentTemplate.logic = {};
        currentTemplate.logic.navBar = navBar;

    } else {
        console.warn("找不到客戶端設定容器 #liff-app-settings");
    }

    // --- 讀取商家後台設定 ---
    // 確保 currentTemplate.logic 存在
    if (!currentTemplate.logic) currentTemplate.logic = {};

    // 讀取後台頁面啟用設定
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
        console.log("讀取後台頁面啟用設定:", adminPagesEnabled);
    } else {
        console.warn("找不到後台頁面啟用設定容器 #admin-pages-enablement-container");
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
                } else {
                     console.warn(`跳過容器 ${containerId} 中格式不完整的欄位設定行。`);
                }
            });
        } else {
             console.warn(`找不到後台欄位設定容器 #${containerId}`);
        }
        return columns;
    }


    currentTemplate.logic.adminColumns = reconstructAdminColumns('admin-columns-product');
    currentTemplate.logic.adminBookingColumns = reconstructAdminColumns('admin-columns-booking');
    currentTemplate.logic.adminUserColumns = reconstructAdminColumns('admin-columns-user');
    currentTemplate.logic.adminNewsColumns = reconstructAdminColumns('admin-columns-news'); // 新增
    currentTemplate.logic.adminDraftColumns = reconstructAdminColumns('admin-columns-drafts'); // 新增
    currentTemplate.logic.adminExpHistoryColumns = reconstructAdminColumns('admin-columns-exp-history'); // 新增

    console.log("重構完成的樣板資料:", JSON.stringify(currentTemplate, null, 2));
    return { [selectedKey]: currentTemplate };
}

// ****** 新增：綁定 Accordion 事件的獨立函式 ******
function bindAccordionEvents(parentElement = document) {
    // console.log("綁定 Accordion 事件於:", parentElement);
    if (!parentElement) return; // 如果父元素不存在，直接返回
    parentElement.querySelectorAll('.accordion-header').forEach(header => {
        // 先移除舊監聽器，避免重複綁定
        const oldClickHandler = header.clickHandler;
        if (oldClickHandler) {
            header.removeEventListener('click', oldClickHandler);
            // console.log("移除舊 Accordion 監聽器:", header.nextElementSibling?.id || header.textContent);
        }
        // 定義新的處理函式
        const clickHandler = () => {
            const content = header.nextElementSibling;
            if (content && content.classList.contains('accordion-content')) {
                const isOpen = content.classList.toggle('open');
                // console.log("Accordion toggled:", header.textContent, "Open:", isOpen);
                // 改變箭頭方向
                const arrow = header.querySelector('span');
                if (arrow) {
                    arrow.textContent = isOpen ? '▲' : '▼';
                }
            } else {
                 console.warn("找不到對應的 accordion-content:", header);
            }
        };
        // 綁定新監聽器並存儲引用
        header.addEventListener('click', clickHandler);
        header.clickHandler = clickHandler; // 存儲引用以便移除
        // console.log("新增 Accordion 監聽器:", header.nextElementSibling?.id || header.textContent);

        // 確保初始狀態箭頭正確 (根據是否有 open class)
        const content = header.nextElementSibling;
        const arrow = header.querySelector('span');
        if (arrow && content) {
            arrow.textContent = content.classList.contains('open') ? '▲' : '▼';
        }
    });
}


// ****** 修改：設定事件監聽器 ******
function setupEventListeners() {
    const page = document.getElementById('page-settings');
    // 使用 dataset 屬性防止重複綁定
    if (!page || page.dataset.listenersAttached === 'true') {
        console.log("Settings listeners already attached or page not found, skipping.");
        return;
    }
     console.log("首次綁定 Settings event listeners...");

    const templateSelector = document.getElementById('template-selector');
    const tabsContainer = document.querySelector('.settings-tabs');
    const settingsForm = document.getElementById('settings-form');
    // **增加** 對 Accordion 父容器的獲取
    const liffSettingsContainer = document.getElementById('liff-app-settings');
    const adminSettingsContainer = document.getElementById('admin-panel-settings');

    if (!templateSelector || !tabsContainer || !settingsForm || !liffSettingsContainer || !adminSettingsContainer) {
         console.error("無法初始化設定頁面事件：缺少必要的元素 (selector, tabs, form, or content containers)。");
         return;
    }


    // 樣板選擇器變更事件
    templateSelector.addEventListener('change', () => {
        console.log("樣板選擇變更:", templateSelector.value);
        // 清空 Sortable 實例
        Object.keys(sortableInstances).forEach(key => {
            if (sortableInstances[key]) {
                try { sortableInstances[key].destroy(); } catch (e) { console.error(`銷毀 Sortable ${key} 失敗:`, e); }
            }
        });
        sortableInstances = {}; // 重置
        // 重新渲染設定 UI
        renderTemplateSettings(templateSelector.value);
        // Accordion 事件已在 renderTemplateSettings 內部重新綁定
    });

    // Tab 切換事件
    tabsContainer.addEventListener('click', (e) => {
        if (e.target.matches('.settings-tab')) {
            const activeTab = tabsContainer.querySelector('.active');
            const activeContent = document.querySelector('.settings-tab-content.active');
            if (activeTab) activeTab.classList.remove('active');
            if (activeContent) activeContent.classList.remove('active');

            e.target.classList.add('active');
            const targetContent = document.getElementById(e.target.dataset.target);
            if (targetContent) targetContent.classList.add('active');
            console.log("切換 Tab 至:", e.target.dataset.target);
        }
    });

    // 表單提交事件
    settingsForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        console.log("設定表單提交...");
        const saveButton = document.getElementById('save-settings-btn');
        // 加入確認對話框
        const confirmed = await ui.confirm('您確定要儲存所有變更嗎？這將會更新樣板藍圖並啟用選擇的樣板。');
        if (!confirmed) {
            console.log("使用者取消儲存。");
            return;
        }

        saveButton.disabled = true;
        saveButton.textContent = '儲存中...';

        try {
            const payload = [];
            // 1. 重構當前編輯的樣板藍圖
            const updatedTemplatePart = reconstructTemplateFromUI(); // 返回 { templateKey: updatedTemplateData }
            const currentTemplateKey = Object.keys(updatedTemplatePart)[0]; // 獲取當前編輯的樣板 key

            // 2. 將完整的樣板定義 (合併更新) 加入 payload
            const finalDefinitions = Object.assign({}, templateDefinitions, updatedTemplatePart);

            payload.push({
                key: 'LOGIC_INDUSTRY_TEMPLATE_DEFINITIONS',
                value: JSON.stringify(finalDefinitions, null, 2) // 格式化 JSON
            });

            // 3. 將當前選擇器選中的樣板 key 作為啟用樣板加入 payload
            payload.push({
                key: 'LOGIC_ACTIVE_INDUSTRY_TEMPLATE',
                value: currentTemplateKey
            });

            // 4. (已移除) 不再讀取 other-settings-container

            console.log("準備儲存的 payload:", JSON.stringify(payload, null, 2)); // Debug

            // 5. 呼叫 API 儲存
            await api.updateSettings(payload);

            // 6. 更新前端快取的設定
            templateDefinitions = finalDefinitions; // 更新記憶體中的樣板定義
            allSettings = await api.getSettings(); // 重新獲取所有設定

            ui.toast.success('所有設定已成功儲存並啟用！');

             // 【重要】提示使用者重新整理
             await ui.confirm("後台設定已更新！為了確保所有後台頁面都使用最新設定，建議您重新整理管理頁面。點擊「確定」將重新整理。");
             window.location.reload();

        } catch (error) {
            ui.toast.error(`儲存失敗：${error.message}`);
            console.error("儲存設定失敗:", error);
        } finally {
            saveButton.disabled = false;
            saveButton.textContent = '儲存並啟用';
        }
    });

    // 初始綁定 Accordion 事件 (給第一次載入時存在的 Accordion)
    bindAccordionEvents(liffSettingsContainer);
    bindAccordionEvents(adminSettingsContainer);

    // 標記事件已綁定
    page.dataset.listenersAttached = 'true';
    console.log("Settings event listeners 首次綁定完成。");
}

// ****** 修改：初始化函式 ******
export const init = async () => {
    const settingsPage = document.getElementById('page-settings');
     if (!settingsPage) {
         console.error("無法初始化系統設定：找不到 #page-settings 元素。");
         return;
     }

    try {
        console.log("系統設定頁面 init 開始...");
        // 重置 Sortable 實例
        Object.values(sortableInstances).forEach(instance => {
            if (instance && typeof instance.destroy === 'function') instance.destroy();
        });
        sortableInstances = {};

        allSettings = await api.getSettings(); // 從後端獲取最新設定

        const definitionsSetting = allSettings.find(i => i.key === 'LOGIC_INDUSTRY_TEMPLATE_DEFINITIONS');
        const activeTemplateSetting = allSettings.find(i => i.key === 'LOGIC_ACTIVE_INDUSTRY_TEMPLATE');

        // 解析樣板定義
        if (definitionsSetting && definitionsSetting.value) {
            try {
                templateDefinitions = JSON.parse(definitionsSetting.value);
                console.log("成功解析樣板定義:", Object.keys(templateDefinitions));
            } catch (e) {
                 console.error("解析 LOGIC_INDUSTRY_TEMPLATE_DEFINITIONS 失敗:", e, "Value:", definitionsSetting.value);
                 templateDefinitions = {}; // 解析失敗給空物件
                 throw new Error('樣板定義檔格式錯誤，請檢查資料庫內容。');
            }
        } else {
             console.warn("在資料庫中找不到 'LOGIC_INDUSTRY_TEMPLATE_DEFINITIONS' 設定，將使用空設定。");
             templateDefinitions = {};
        }

        // 填充樣板選擇器
        const templateSelector = document.getElementById('template-selector');
        templateSelector.innerHTML = ''; // 清空選項
        if (Object.keys(templateDefinitions).length > 0) {
             let activeKeyFound = false;
             for (const key in templateDefinitions) {
                 // 確保樣板物件存在且有 name 屬性
                 if (templateDefinitions[key] && templateDefinitions[key].name) {
                     templateSelector.add(new Option(templateDefinitions[key].name, key));
                     // 檢查此 key 是否為當前啟用的 key
                     if (activeTemplateSetting && activeTemplateSetting.value === key) {
                         templateSelector.value = key; // 設定選擇器的值
                         activeKeyFound = true;
                     }
                 } else {
                      console.warn(`樣板 '${key}' 缺少 name 屬性或無效，已略過。`);
                 }
             }
             // 如果找不到啟用的 key，預設選第一個
             if (!activeKeyFound && templateSelector.options.length > 0) {
                 templateSelector.selectedIndex = 0;
                 console.warn("找不到已啟用的樣板設定或樣板不存在於定義中，預設選擇第一個:", templateSelector.value);
             }
             templateSelector.disabled = false;
             document.getElementById('save-settings-btn').disabled = false;
        } else {
             templateSelector.innerHTML = '<option value="">無可用樣板</option>';
             templateSelector.disabled = true;
             document.getElementById('save-settings-btn').disabled = true;
             throw new Error('系統中沒有設定任何商業樣板藍圖。');
        }

        // 初始渲染選擇的樣板設定
        renderTemplateSettings(templateSelector.value);

        // (已移除 renderOtherSettings)

        // 綁定事件監聽器 (確保只執行一次)
        setupEventListeners();

        console.log("系統設定頁面 init 完成。");

    } catch (error) {
        console.error('初始化系統設定頁面失敗:', error);
        settingsPage.innerHTML = `<p style="color:red;">讀取設定失敗: ${error.message}</p>`;
        // 確保禁用儲存按鈕
         const saveBtn = document.getElementById('save-settings-btn');
         if(saveBtn) saveBtn.disabled = true;
    }
};