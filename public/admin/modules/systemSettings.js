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
        container.innerHTML = `<p style="color:red;">錯誤：UI 容器 #${containerId} 不存在。</p>`;
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
             console.error(`[renderAdminColumnsSettings] 渲染欄位 '${col.key}' 時發生錯誤:`, e);
             container.innerHTML += `<p style="color:red;">渲染欄位 ${col.key} 失敗。</p>`;
        }
    });

    // 初始化 Sortable.js 並儲存實例
    if (sortableInstances[containerId]) sortableInstances[containerId].destroy();
    if (typeof Sortable !== 'undefined') {
        sortableInstances[containerId] = new Sortable(container, {
            animation: 150,
            handle: '.drag-handle' // 指定拖曳控制柄
        });
    } else {
        console.error("Sortable.js 未載入，無法啟用拖曳排序。");
    }
}

// ****** 修改：渲染整個樣板設定 (包含後台部分) ******
function renderTemplateSettings(templateKey) {
    const template = templateDefinitions[templateKey];
    if (!template) {
        console.error(`渲染樣板設定失敗：找不到樣板資料: ${templateKey}`);
        // 可以選擇清空或顯示錯誤
        document.getElementById('liff-app-settings').innerHTML = `<p style="color:red;">載入樣板 ${templateKey} 失敗。</p>`;
        document.getElementById('admin-panel-settings').innerHTML = '';
        return;
    }
    console.log(`渲染樣板 '${templateKey}' 的設定...`);

    const liffSettingsContainer = document.getElementById('liff-app-settings');
    const adminSettingsContainer = document.getElementById('admin-panel-settings');
    if (!liffSettingsContainer || !adminSettingsContainer) {
         console.error("渲染樣板設定失敗：找不到設定容器元素。");
         return;
    }


    // --- 渲染客戶端設定 ---
    liffSettingsContainer.innerHTML = ''; // 清空
    // 增加檢查確保 template 結構基本完整
    if (template.features && template.terms && template.logic) {
        liffSettingsContainer.appendChild(createGlobalSettingsModule(template));
        // Accordion 展開/收合事件由 setupEventListeners 統一處理
    } else {
        console.warn(`樣板 '${templateKey}' 缺少必要的設定區塊 (features, terms, or logic)。`);
        liffSettingsContainer.innerHTML = '<p style="color:orange;">此樣板缺少必要的客戶端設定區塊。</p>';
    }

    // --- 渲染商家後台設定 ---
    adminSettingsContainer.querySelectorAll('.admin-columns-container').forEach(el => el.innerHTML = '<p>讀取中...</p>'); // 先顯示載入中

    // 確保 template.logic 存在，若否則使用空物件
    const logic = template.logic || {};

    // 渲染產品管理的 adminColumns (確保 logic.adminColumns 是陣列)
    renderAdminColumnsSettings('product', logic.adminColumns, 'admin-columns-product');

    // 渲染訂位管理的 adminColumns (假設 key 是 adminBookingColumns)
    renderAdminColumnsSettings('booking', logic.adminBookingColumns || [], 'admin-columns-booking'); // 使用 || [] 避免 undefined

    // 渲染顧客管理的 adminColumns (假設 key 是 adminUserColumns)
    renderAdminColumnsSettings('user', logic.adminUserColumns || [], 'admin-columns-user'); // 使用 || [] 避免 undefined

    // 手動觸發一次 Accordion 綁定 (因為商家後台設定是動態加入的)
    bindAccordionEvents(adminSettingsContainer);
}

// ****** 修改：從 UI 反向建構樣板 (加入讀取後台設定) ******
function reconstructTemplateFromUI() {
    const selectedKey = document.getElementById('template-selector').value;
    // 深拷貝一份當前樣板作為基礎，避免修改記憶體中的原始 templateDefinitions
    // 增加檢查，如果找不到選擇的樣板，拋出錯誤
    if (!templateDefinitions[selectedKey]) {
         throw new Error(`無法重構樣板：找不到樣板 key "${selectedKey}"`);
    }
    const currentTemplate = JSON.parse(JSON.stringify(templateDefinitions[selectedKey]));

    console.log("開始從 UI 重構樣板:", selectedKey);

    // --- 讀取客戶端設定 ---
    const liffSettingsContainer = document.getElementById('liff-app-settings');
    if (liffSettingsContainer) {
        liffSettingsContainer.querySelectorAll('[data-key]').forEach(input => {
            const key = input.dataset.key;
            if (!key) return; // 跳過沒有 data-key 的元素

            const keyParts = key.split('_');
            const mainKey = keyParts[0].toLowerCase(); // features, terms
            const subKey = keyParts.slice(1).join('_');

            // 確保目標物件存在
            if (!currentTemplate[mainKey]) {
                 console.warn(`樣板 ${selectedKey} 缺少 '${mainKey}' 物件，將自動創建。`);
                 currentTemplate[mainKey] = {};
            }

            if (input.type === 'checkbox') {
                currentTemplate[mainKey][subKey] = input.checked;
            } else {
                currentTemplate[mainKey][subKey] = input.value;
            }
             // console.log(`讀取客戶端設定: ${mainKey}.${subKey} = ${currentTemplate[mainKey][subKey]}`);
        });

        // 讀取導覽列設定
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
            } else {
                 console.warn("跳過格式不完整的導覽列項目行。");
            }
        });
        // 確保 currentTemplate.logic 存在
        if (!currentTemplate.logic) currentTemplate.logic = {};
        currentTemplate.logic.navBar = navBar;
        // console.log("讀取導覽列設定:", navBar);
    } else {
        console.warn("找不到客戶端設定容器 #liff-app-settings");
    }


    // --- 讀取商家後台設定 ---
    // 輔助函式：從容器讀取 adminColumns
    function reconstructAdminColumns(containerId) {
        const container = document.getElementById(containerId);
        const columns = [];
        if (container) {
            container.querySelectorAll('.admin-column-row').forEach(row => {
                const keyElement = row.querySelector('.column-key');
                const labelInput = row.querySelector('[name="column_label"]');
                const enabledCheckbox = row.querySelector('[name="column_enabled"]');
                // 增加檢查，確保元素都存在且 key 有值
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

    // 確保 currentTemplate.logic 存在
    if (!currentTemplate.logic) currentTemplate.logic = {};

    currentTemplate.logic.adminColumns = reconstructAdminColumns('admin-columns-product');
    // 假設訂位/訂單和顧客管理的 adminColumns key 分別是 adminBookingColumns 和 adminUserColumns
    currentTemplate.logic.adminBookingColumns = reconstructAdminColumns('admin-columns-booking');
    currentTemplate.logic.adminUserColumns = reconstructAdminColumns('admin-columns-user');

    console.log("重構完成的樣板資料:", JSON.stringify(currentTemplate, null, 2)); // 輸出完整的 JSON 供檢查

    return { [selectedKey]: currentTemplate }; // 回傳包含樣板 key 的物件
}

// (renderOtherSettings 已移除，因為不再需要)

// ****** 新增：綁定 Accordion 事件的獨立函式 ******
function bindAccordionEvents(parentElement = document) {
    // console.log("綁定 Accordion 事件於:", parentElement);
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

        // 確保初始狀態箭頭正確 (預設不展開)
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
    if (!templateSelector || !tabsContainer || !settingsForm) {
         console.error("無法初始化設定頁面事件：缺少必要的元素 (selector, tabs, form)。");
         return;
    }

    // 樣板選擇器變更事件
    templateSelector.addEventListener('change', () => {
        console.log("樣板選擇變更:", templateSelector.value);
        // 清空 Sortable 實例，避免舊的拖曳區殘留影響
        Object.keys(sortableInstances).forEach(key => {
            if (sortableInstances[key]) {
                try {
                    sortableInstances[key].destroy();
                    console.log(`銷毀 Sortable 實例: ${key}`);
                } catch (e) { console.error(`銷毀 Sortable ${key} 失敗:`, e); }
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
            // 1. 重構當前編輯的樣板藍圖 (包含客戶端和後台設定)
            const updatedTemplatePart = reconstructTemplateFromUI(); // 返回 { templateKey: updatedTemplateData }
            const currentTemplateKey = Object.keys(updatedTemplatePart)[0]; // 獲取當前編輯的樣板 key

            // 2. 將完整的樣板定義 (包含所有樣板，含剛更新的) 加入 payload
            //    使用 Object.assign 合併更新的部分到記憶體中的 definitions
            const finalDefinitions = Object.assign({}, templateDefinitions, updatedTemplatePart);

            payload.push({
                key: 'LOGIC_INDUSTRY_TEMPLATE_DEFINITIONS',
                value: JSON.stringify(finalDefinitions, null, 2) // 格式化 JSON
            });

            // 3. 將當前選擇器選中的樣板 key (即 currentTemplateKey) 作為啟用樣板加入 payload
            payload.push({
                key: 'LOGIC_ACTIVE_INDUSTRY_TEMPLATE',
                value: currentTemplateKey
            });

            // 4. (已移除) 不再讀取 other-settings-container

            console.log("準備儲存的 payload:", JSON.stringify(payload, null, 2)); // Debug: 檢查送出的資料

            // 5. 呼叫 API 儲存
            await api.updateSettings(payload);

            // 6. 更新前端快取的設定
            templateDefinitions = finalDefinitions; // 更新記憶體中的樣板定義
            // allSettings = await api.getSettings(); // 可選：如果需要立即反映其他可能的後端變更
            // renderOtherSettings(); // 已移除

            ui.toast.success('所有設定已成功儲存並啟用！');

             // 【重要】提示使用者重新整理以套用後台設定
             await ui.confirm("後台設定已更新！為了確保所有後台頁面都使用最新設定，建議您重新整理管理頁面。點擊「確定」將重新整理。");
             window.location.reload();

        } catch (error) {
            ui.toast.error(`儲存失敗：${error.message}`);
            console.error("儲存設定失敗:", error); // Debug: 顯示詳細錯誤
        } finally {
            // 重新啟用按鈕 (即使跳轉前也恢復)
            saveButton.disabled = false;
            saveButton.textContent = '儲存並啟用';
        }
    });

    // 初始綁定 Accordion 事件 (給第一次載入時靜態存在的 Accordion 結構)
    bindAccordionEvents(document.getElementById('liff-app-settings'));
    bindAccordionEvents(document.getElementById('admin-panel-settings'));

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
        // 重置 Sortable 實例，確保切換頁面回來時不會有問題
        Object.values(sortableInstances).forEach(instance => {
            if (instance && typeof instance.destroy === 'function') {
                instance.destroy();
            }
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
             // 如果找不到啟用的 key (可能設定錯誤或樣板被刪)，預設選第一個
             if (!activeKeyFound && templateSelector.options.length > 0) {
                 templateSelector.selectedIndex = 0;
                 console.warn("找不到已啟用的樣板設定或樣板不存在於定義中，預設選擇第一個:", templateSelector.value);
             }
             templateSelector.disabled = false;
             document.getElementById('save-settings-btn').disabled = false;
        } else {
             templateSelector.innerHTML = '<option value="">無可用樣板</option>';
             templateSelector.disabled = true;
             document.getElementById('save-settings-btn').disabled = true; // 沒有樣板也禁用儲存
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