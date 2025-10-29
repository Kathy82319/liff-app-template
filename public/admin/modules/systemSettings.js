// public/admin/modules/systemSettings.js (實作 Task 5.1B 版本)
import { api } from '../api.js';
import { ui } from '../ui.js';

let allSettings = [];
let templateDefinitions = {};
let sortableInstances = {}; // 存放 Sortable 實例

// (createSettingRow, createNavBarModule, createGlobalSettingsModule 維持不變)
function createSettingRow(setting) {
    // ... (此函式內容不變) ...
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
    // ... (此函式內容不變, 注意: 之前的 sortableNav 變數需移除或改名，避免衝突) ...
    const container = document.createElement('div');
    container.className = 'setting-visual-guide';
    container.innerHTML = `<h5>底部導覽列設定 (可拖曳排序)</h5><div id="nav-items-container" class="sortable-list"></div>`; // 加上 sortable-list class
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
    // 建立 Sortable 實例並存儲
    const listId = 'nav-items-container';
    if (sortableInstances[listId]) sortableInstances[listId].destroy();
    sortableInstances[listId] = new Sortable(navItemsContainer, { animation: 150, handle: '.drag-handle' });
    return container;
}

function createGlobalSettingsModule(template) {
    // ... (此函式內容不變) ...
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
    // Accordion 點擊事件移到 setupEventListeners
    return accordionItem;
}

// ****** 新增：渲染 Admin Columns 設定 UI 的函式 ******
function renderAdminColumnsSettings(moduleKey, adminColumnsConfig, containerId) {
    const container = document.getElementById(containerId);
    if (!container) {
        console.error(`找不到容器 #${containerId}`);
        return;
    }
    container.innerHTML = ''; // 清空內容
    container.classList.add('sortable-list'); // 加上 class 方便 Sortable 初始化

    // 檢查 adminColumnsConfig 是否為陣列，若否則提供預設空陣列或提示
    const columns = Array.isArray(adminColumnsConfig) ? adminColumnsConfig : [];
    if (!Array.isArray(adminColumnsConfig)) {
         console.warn(`樣板中 module '${moduleKey}' 的 adminColumns 設定不是陣列，將使用空設定。`, adminColumnsConfig);
         container.innerHTML = '<p style="color:orange;">此樣板尚未設定後台列表欄位。</p>'; // 可以選擇顯示提示
    }


    const itemTemplate = document.getElementById('admin-column-item-template');
    if (!itemTemplate) {
        container.innerHTML = '<p style="color:red;">錯誤：找不到 #admin-column-item-template</p>';
        return;
    }

    columns.forEach(col => {
        if (!col || typeof col.key !== 'string' || typeof col.label !== 'string') {
             console.warn(`略過無效的 adminColumn 設定:`, col);
             return; // 跳過格式不符的項目
        }
        const clone = itemTemplate.content.cloneNode(true);
        const row = clone.querySelector('.admin-column-row');
        row.querySelector('.column-key').textContent = col.key;
        row.querySelector('.column-key').title = `欄位 Key: ${col.key} (不可修改)`; // 加上 tooltip
        row.querySelector('[name="column_label"]').value = col.label;
        // 假設 enabled 預設為 true，除非藍圖明確指定 false
        row.querySelector('[name="column_enabled"]').checked = (col.enabled !== false);
        container.appendChild(row);
    });

    // 初始化 Sortable.js 並儲存實例
    if (sortableInstances[containerId]) sortableInstances[containerId].destroy();
    sortableInstances[containerId] = new Sortable(container, {
        animation: 150,
        handle: '.drag-handle' // 指定拖曳控制柄
    });
}

// ****** 修改：渲染整個樣板設定 (包含後台部分) ******
function renderTemplateSettings(templateKey) {
    const template = templateDefinitions[templateKey];
    if (!template) {
        console.error(`找不到樣板資料: ${templateKey}`);
        return;
    }
    const liffSettingsContainer = document.getElementById('liff-app-settings');
    const adminSettingsContainer = document.getElementById('admin-panel-settings');

    // --- 渲染客戶端設定 (保持不變) ---
    liffSettingsContainer.innerHTML = '';
    if (template.features && template.terms && template.logic) {
        liffSettingsContainer.appendChild(createGlobalSettingsModule(template));
        liffSettingsContainer.querySelector('.accordion-content')?.classList.add('open'); // 預設展開第一個
    } else {
        liffSettingsContainer.innerHTML = '<p style="color:orange;">此樣板缺少必要的設定區塊 (features, terms, logic)。</p>';
    }

    // --- 渲染商家後台設定 ---
    adminSettingsContainer.querySelectorAll('.admin-columns-container').forEach(el => el.innerHTML = '<p>讀取中...</p>'); // 先清空

    // 確保 template.logic 存在
    const logic = template.logic || {};

    // 渲染產品管理的 adminColumns (確保 logic.adminColumns 是陣列)
    renderAdminColumnsSettings('product', logic.adminColumns, 'admin-columns-product');

    // 渲染訂位管理的 adminColumns (假設 key 是 adminBookingColumns，如果不同請修改)
    // 注意：您需要確定訂位/訂單管理的 adminColumns 在藍圖中的 key 是什麼
    renderAdminColumnsSettings('booking', logic.adminBookingColumns || [], 'admin-columns-booking'); // 使用 || [] 避免 undefined

    // 渲染顧客管理的 adminColumns (假設 key 是 adminUserColumns)
    renderAdminColumnsSettings('user', logic.adminUserColumns || [], 'admin-columns-user'); // 使用 || [] 避免 undefined

    // 手動觸發一次 Accordion 綁定 (因為元素是動態加入的)
    bindAccordionEvents(adminSettingsContainer);
}

// ****** 修改：從 UI 反向建構樣板 (加入讀取後台設定) ******
function reconstructTemplateFromUI() {
    const selectedKey = document.getElementById('template-selector').value;
    // 深拷貝一份當前樣板作為基礎，避免修改原始 templateDefinitions
    const currentTemplate = JSON.parse(JSON.stringify(templateDefinitions[selectedKey]));

    // --- 讀取客戶端設定 (保持不變) ---
    const liffSettingsContainer = document.getElementById('liff-app-settings');
    liffSettingsContainer.querySelectorAll('[data-key]').forEach(input => {
        const keyParts = input.dataset.key.split('_');
        const mainKey = keyParts[0].toLowerCase(); // features, terms
        const subKey = keyParts.slice(1).join('_');

        // 確保目標物件存在
        if (!currentTemplate[mainKey]) currentTemplate[mainKey] = {};

        if (input.type === 'checkbox') {
            currentTemplate[mainKey][subKey] = input.checked;
        } else {
            currentTemplate[mainKey][subKey] = input.value;
        }
    });
    const navBar = [];
    document.querySelectorAll('#nav-items-container .nav-item-row').forEach(row => {
        navBar.push({
            label: row.querySelector('[name="nav_label"]').value,
            target: row.querySelector('[name="nav_target"]').value,
            enabled: row.querySelector('[name="nav_enabled"]').checked
        });
    });
     // 確保 currentTemplate.logic 存在
     if (!currentTemplate.logic) currentTemplate.logic = {};
    currentTemplate.logic.navBar = navBar;

    // --- 讀取商家後台設定 ---
    function reconstructAdminColumns(containerId) {
        const container = document.getElementById(containerId);
        const columns = [];
        if (container) {
            container.querySelectorAll('.admin-column-row').forEach(row => {
                const keyElement = row.querySelector('.column-key');
                const labelInput = row.querySelector('[name="column_label"]');
                const enabledCheckbox = row.querySelector('[name="column_enabled"]');
                if (keyElement && labelInput && enabledCheckbox) {
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
    // 假設訂位/訂單和顧客管理的 adminColumns key 分別是 adminBookingColumns 和 adminUserColumns
    currentTemplate.logic.adminBookingColumns = reconstructAdminColumns('admin-columns-booking');
    currentTemplate.logic.adminUserColumns = reconstructAdminColumns('admin-columns-user');

    return { [selectedKey]: currentTemplate };
}


function renderOtherSettings() {

    const settingsContainer = document.getElementById('other-settings-container'); // 假設這個容器還存在
    if (!settingsContainer) return;
    settingsContainer.innerHTML = ''; // 清空

    // 過濾掉樣板定義和啟用鍵
    const otherSettings = allSettings.filter(s =>
        s.key !== 'LOGIC_ACTIVE_INDUSTRY_TEMPLATE'
    );

    if (otherSettings.length === 0) {
        // settingsContainer.innerHTML = '<p>沒有其他獨立設定項。</p>';
        settingsContainer.style.display = 'none'; // 如果沒有其他設定，直接隱藏容器
        return;
    } else {
         settingsContainer.style.display = 'block'; // 確保容器可見
    }


    otherSettings.forEach(setting => {
        const formGroup = document.createElement('div');
        formGroup.className = 'form-group';
        // 只生成 input type="text"
        formGroup.innerHTML = `
            <label for="setting-${setting.key}">${setting.description || setting.key}</label>
            <input type="text" id="setting-${setting.key}" name="${setting.key}" value='${setting.value}'>
        `;
        settingsContainer.appendChild(formGroup);
    });
}


// ****** 新增：綁定 Accordion 事件的獨立函式 ******
function bindAccordionEvents(parentElement = document) {
    parentElement.querySelectorAll('.accordion-header').forEach(header => {
        // 先移除舊監聽器，避免重複綁定
        const oldClickHandler = header.clickHandler;
        if (oldClickHandler) {
            header.removeEventListener('click', oldClickHandler);
        }
        // 定義新的處理函式
        const clickHandler = () => {
            const content = header.nextElementSibling;
            if (content && content.classList.contains('accordion-content')) {
                content.classList.toggle('open');
                // 可以加上改變箭頭方向的邏輯
                const arrow = header.querySelector('span');
                if (arrow) {
                    arrow.textContent = content.classList.contains('open') ? '▲' : '▼';
                }
            }
        };
        // 綁定新監聽器並存儲引用
        header.addEventListener('click', clickHandler);
        header.clickHandler = clickHandler; // 存儲引用以便移除

        // 預設展開第一個 Accordion (如果需要)
         const firstAccordionContent = parentElement.querySelector('.accordion-item:first-child .accordion-content');
         if (firstAccordionContent && !firstAccordionContent.classList.contains('open')) {
             // firstAccordionContent.classList.add('open');
             // const firstArrow = parentElement.querySelector('.accordion-item:first-child .accordion-header span');
             // if(firstArrow) firstArrow.textContent = '▲';
             // 調整為預設不展開
         }
    });
}


// ****** 修改：設定事件監聽器 ******
function setupEventListeners() {
    const page = document.getElementById('page-settings');
    if (page.dataset.initialized) {
        console.log("Settings listeners already initialized, skipping.");
        return; // 防止重複綁定
    }
     console.log("Initializing Settings event listeners...");

    const templateSelector = document.getElementById('template-selector');
    const tabsContainer = document.querySelector('.settings-tabs');
    const settingsForm = document.getElementById('settings-form');
    if (!templateSelector || !tabsContainer || !settingsForm) {
         console.error("無法初始化設定頁面事件：缺少必要的元素。");
         return;
    }


    // 樣板選擇器變更事件
    templateSelector.addEventListener('change', () => {
        // 清空 Sortable 實例，避免舊的拖曳區殘留
        Object.values(sortableInstances).forEach(instance => instance.destroy());
        sortableInstances = {}; // 重置
        renderTemplateSettings(templateSelector.value);
        // 重新綁定新生成內容的 Accordion 事件
        bindAccordionEvents(document.getElementById('liff-app-settings'));
        bindAccordionEvents(document.getElementById('admin-panel-settings'));
    });

    // Tab 切換事件
    tabsContainer.addEventListener('click', (e) => {
        if (e.target.matches('.settings-tab')) {
            tabsContainer.querySelector('.active')?.classList.remove('active');
            document.querySelector('.settings-tab-content.active')?.classList.remove('active');
            e.target.classList.add('active');
            const targetContent = document.getElementById(e.target.dataset.target);
            if (targetContent) targetContent.classList.add('active');
        }
    });

    // 表單提交事件
    settingsForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const saveButton = document.getElementById('save-settings-btn');
        // 加入確認對話框
        const confirmed = await ui.confirm('您確定要儲存所有變更嗎？這將會更新樣板藍圖以及其他系統參數。');
        if (!confirmed) return;

        saveButton.disabled = true;
        saveButton.textContent = '儲存中...';

        try {
            const payload = [];
            // 1. 重構當前編輯的樣板藍圖
            const updatedTemplatePart = reconstructTemplateFromUI();
            const finalDefinitions = { ...templateDefinitions, ...updatedTemplatePart };


            // 3. 將當前選擇器選中的樣板 key 作為啟用樣板加入 payload
            const selectedTemplateKey = document.getElementById('template-selector').value;
            payload.push({
                key: 'LOGIC_ACTIVE_INDUSTRY_TEMPLATE',
                value: selectedTemplateKey
            });

            // 4. (可選) 讀取其他獨立設定 (如果有的話)
            const otherInputsContainer = document.getElementById('other-settings-container'); // 假設容器還存在
            if (otherInputsContainer) {
                 const otherInputs = otherInputsContainer.querySelectorAll('input, select');
                 otherInputs.forEach(input => {
                      if(input.name) { // 確保元素有 name 屬性
                         payload.push({ key: input.name, value: input.value });
                      }
                 });
            }

            console.log("準備儲存的 payload:", payload); // Debug: 檢查送出的資料

            // 5. 呼叫 API 儲存
            await api.updateSettings(payload);

            // 6. 更新前端快取的設定
            templateDefinitions = finalDefinitions; // 更新記憶體中的樣板定義
            allSettings = await api.getSettings(); // 重新獲取所有設定 (包含剛儲存的)
            renderOtherSettings(); // 重新渲染獨立設定區塊 (如果有的話)

            ui.toast.success('所有設定已成功儲存並啟用！');

             // 【重要】提示使用者重新整理以套用後台設定
             await ui.confirm("後台設定已更新！為了確保所有後台頁面都使用最新設定，建議您重新整理管理頁面。點擊「確定」將重新整理。");
             window.location.reload();


        } catch (error) {
            ui.toast.error(`儲存失敗：${error.message}`);
            console.error("儲存設定失敗:", error); // Debug: 顯示詳細錯誤
        } finally {
            saveButton.disabled = false;
            saveButton.textContent = '儲存並啟用';
        }
    });

    // 初始綁定 Accordion 事件 (給第一次載入時的元素)
    bindAccordionEvents(document.getElementById('liff-app-settings'));
    bindAccordionEvents(document.getElementById('admin-panel-settings'));


    page.dataset.initialized = 'true'; // 標記已初始化
     console.log("Settings event listeners setup complete.");
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
        allSettings = await api.getSettings();

        const activeTemplateSetting = allSettings.find(i => i.key === 'LOGIC_ACTIVE_INDUSTRY_TEMPLATE');

        // 解析樣板定義
        if (definitionsSetting && definitionsSetting.value) {
            try {
                templateDefinitions = JSON.parse(definitionsSetting.value);
            } catch (e) {
                 templateDefinitions = {}; // 解析失敗給空物件
                 throw new Error('樣板定義檔格式錯誤，請檢查資料庫內容。');
            }
        } else {
             templateDefinitions = {};
        }

        // 填充樣板選擇器
        const templateSelector = document.getElementById('template-selector');
        templateSelector.innerHTML = ''; // 清空選項
        if (Object.keys(templateDefinitions).length > 0) {
             for (const key in templateDefinitions) {
                 // 確保樣板物件存在且有 name 屬性
                 if (templateDefinitions[key] && templateDefinitions[key].name) {
                     templateSelector.add(new Option(templateDefinitions[key].name, key));
                 } else {
                      console.warn(`樣板 '${key}' 缺少 name 屬性或無效，已略過。`);
                      // 可以選擇刪除無效的樣板定義
                      // delete templateDefinitions[key];
                 }
             }
             // 設定選擇器的預設值為當前啟用的樣板
             if (activeTemplateSetting && templateDefinitions[activeTemplateSetting.value]) {
                 templateSelector.value = activeTemplateSetting.value;
             } else if (templateSelector.options.length > 0) {
                  // 如果沒有啟用設定或啟用的樣板不存在，預設選第一個
                  templateSelector.selectedIndex = 0;
                  console.warn("找不到已啟用的樣板設定或樣板不存在，預設選擇第一個。");
             }
        } else {
             templateSelector.innerHTML = '<option value="">無可用樣板</option>';
             templateSelector.disabled = true;
             document.getElementById('save-settings-btn').disabled = true; // 沒有樣板也禁用儲存
             throw new Error('系統中沒有設定任何商業樣板藍圖。');
        }


        // 初始渲染選擇的樣板設定
        renderTemplateSettings(templateSelector.value);

        // 渲染其他獨立設定
        renderOtherSettings();

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