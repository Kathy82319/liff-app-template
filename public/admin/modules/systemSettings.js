/**
 * System Settings Module - v13.0 (Schema-Driven UI Implementation)
 * 負責渲染基於 JSON Template 的系統設定介面，支援動態欄位與連動邏輯。
 */
import { api } from '../api.js';
import { ui } from '../ui.js';

const systemSettings = {
    // 狀態存儲
    state: {
        definitions: null, // 對應 DB: LOGIC_INDUSTRY_TEMPLATE_DEFINITIONS (所有樣板)
        currentConfig: null, // 當前「正在編輯」的樣板完整設定物件
        activeTemplateKey: '', // 當前選擇編輯的樣板 Key (e.g., 'studio_template')
        systemActiveKey: ''    // 系統目前真正啟用的樣板 Key (用於標示)
    },

    // 初始化
    async init() {
        console.log('[SystemSettings] Initializing...');
        const container = document.getElementById('page-settings');
        if (!container) return;
        
        // 注入 CSS (只注入一次)
        if (!document.getElementById('settings-dynamic-styles')) {
            this.injectStyles();
        }

        await this.loadData();
    },

    // 注入 CSS 樣式
    injectStyles() {
        const style = document.createElement('style');
        style.id = 'settings-dynamic-styles';
        style.innerHTML = `
            .settings-container { max-width: 1000px; margin: 0 auto; padding-bottom: 80px; }
            .template-selector-box { background: #fff; padding: 20px; border-radius: 8px; margin-bottom: 20px; box-shadow: 0 2px 4px rgba(0,0,0,0.05); border-left: 5px solid var(--color-primary); }
            
            /* Accordion */
            .accordion-item { background: #fff; border-radius: 8px; margin-bottom: 10px; border: 1px solid #eee; overflow: hidden; }
            .accordion-header { padding: 15px 20px; cursor: pointer; background: #f8f9fa; display: flex; justify-content: space-between; align-items: center; font-weight: 600; transition: background 0.2s; }
            .accordion-header:hover { background: #e9ecef; }
            .accordion-content { display: none; padding: 20px; border-top: 1px solid #eee; }
            .accordion-content.show { display: block; animation: fadeIn 0.3s ease; }

            /* Nested Accordion */
            .nested-section { margin-top: 15px; border: 1px solid #e0e0e0; border-radius: 6px; overflow: hidden; }
            .nested-header { padding: 10px 15px; background: #f1f3f5; font-size: 0.95rem; font-weight: bold; cursor: pointer; display: flex; justify-content: space-between; align-items: center; }
            .nested-content { padding: 15px; display: none; background: #fff; }
            .nested-content.show { display: block; }

            /* Forms */
            .setting-row { display: grid; grid-template-columns: 200px 1fr; gap: 15px; align-items: center; padding: 10px 0; border-bottom: 1px dashed #eee; }
            .setting-row:last-child { border-bottom: none; }
            .setting-label { font-weight: 500; color: #333; }
            .setting-desc { font-size: 0.85em; color: #888; display: block; margin-top: 2px; }
            
            /* Inputs */
            .form-control { width: 100%; padding: 8px 10px; border: 1px solid #ccc; border-radius: 4px; font-size: 1rem; }
            .form-control:focus { border-color: var(--color-primary); outline: none; }
            
            /* Sortable Lists */
            .sortable-list { list-style: none; padding: 0; margin: 0; border: 1px solid #eee; border-radius: 4px; }
            .sortable-item { display: grid; grid-template-columns: 30px 40px 150px 1fr; align-items: center; gap: 10px; padding: 10px; background: #fff; border-bottom: 1px solid #eee; }
            .sortable-item:last-child { border-bottom: none; }
            .sortable-handle { cursor: grab; color: #aaa; text-align: center; }
            
            /* Save Bar */
            .save-bar { position: fixed; bottom: 0; left: 0; right: 0; background: rgba(255,255,255,0.95); padding: 15px 40px; box-shadow: 0 -2px 10px rgba(0,0,0,0.1); display: flex; justify-content: flex-end; align-items: center; gap: 15px; backdrop-filter: blur(5px); z-index: 999; }
            
            @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
        `;
        document.head.appendChild(style);
    },

    // 載入資料
    async loadData() {
        const container = document.getElementById('page-settings');
        // container.innerHTML = '<p style="text-align:center; padding:20px;">正在載入系統設定...</p>';

        try {
            const settings = await api.getSettings();
            
            // 1. 讀取定義檔 (LOGIC_INDUSTRY_TEMPLATE_DEFINITIONS)
            const defsRow = settings.find(s => s.key === 'LOGIC_INDUSTRY_TEMPLATE_DEFINITIONS');
            if (defsRow && defsRow.value) {
                this.state.definitions = JSON.parse(defsRow.value);
            } else {
                // 如果 DB 是空的，給予預設值 (防呆)
                console.warn('DB 缺少 LOGIC_INDUSTRY_TEMPLATE_DEFINITIONS，使用預設空物件。');
                this.state.definitions = {}; 
            }

            // 2. 讀取當前啟用的樣板 ID (LOGIC_ACTIVE_INDUSTRY_TEMPLATE)
            const activeRow = settings.find(s => s.key === 'LOGIC_ACTIVE_INDUSTRY_TEMPLATE');
            this.state.systemActiveKey = activeRow ? activeRow.value : '';
            
            // 預設編輯當前啟用的樣板，如果沒有則選第一個
            const keys = Object.keys(this.state.definitions);
            if (!this.state.activeTemplateKey) {
                this.state.activeTemplateKey = this.state.systemActiveKey && keys.includes(this.state.systemActiveKey) 
                    ? this.state.systemActiveKey 
                    : (keys[0] || '');
            }

            // 3. 深拷貝當前要編輯的設定，避免直接修改原始資料
            if (this.state.activeTemplateKey) {
                this.state.currentConfig = JSON.parse(JSON.stringify(this.state.definitions[this.state.activeTemplateKey]));
            }

            this.render();

        } catch (error) {
            console.error('Failed to load settings:', error);
            container.innerHTML = `<p style="color:red; text-align:center;">設定載入失敗: ${error.message}</p>`;
        }
    },

    // 主渲染函式
    render() {
        const container = document.getElementById('page-settings');
        if (!container) return;

        // 樣板選擇器選項
        const keys = Object.keys(this.state.definitions);
        let templateOptions = keys.map(key => 
            `<option value="${key}" ${this.state.activeTemplateKey === key ? 'selected' : ''}>
                ${this.state.definitions[key].name} ${key === this.state.systemActiveKey ? '(目前啟用)' : ''}
            </option>`
        ).join('');

        const html = `
            <div class="settings-container">
                <div class="page-header"><h2>超級系統設定</h2></div>
                
                <div class="template-selector-box">
                    <label style="font-weight:bold; display:block; margin-bottom:10px;">選擇要編輯 / 啟用的商業樣板：</label>
                    <div style="display:flex; gap:10px;">
                        <select id="settings-template-select" class="form-control" style="flex-grow:1;">
                            ${templateOptions}
                        </select>
                        <button id="settings-reload-btn" class="action-btn" style="background:#6c757d;">重置變更</button>
                    </div>
                    <p style="margin-top:10px; color:#666; font-size:0.9em; line-height:1.5;">
                        <span style="color:var(--color-primary); font-weight:bold;">${this.state.currentConfig?.name || '未命名樣板'}</span>：
                        此操作將修改選定樣板的設定。點擊下方「儲存並套用」後，前台與後台介面將立即更新。
                    </p>
                </div>

                <div id="settings-accordion-container">
                    ${this.renderClientConfig()}
                    ${this.renderAdminConfig()}
                    ${this.renderOwnerConfig()}
                    ${this.renderTermsConfig()}
                </div>

                <div class="save-bar">
                    <span id="settings-unsaved-indicator" style="color:var(--color-warning); display:none;">⚠️ 有未儲存的變更</span>
                    <button id="settings-save-btn" class="action-btn btn-save" style="padding:12px 24px; font-size:1rem;">儲存並套用設定</button>
                </div>
            </div>
        `;

        container.innerHTML = html;
        this.bindEvents();
        
        // 如果使用了 SortableJS，初始化它
        this.initSortables();
    },

    // ------------------------------------------------------------------
    // 渲染區塊 (Renderers)
    // ------------------------------------------------------------------

    // 1. 客戶端設定 (LIFF)
renderClientConfig() {
        const config = this.state.currentConfig?.client_config;
        if (!config) return '';

        let content = '';

        // Global
        content += this.buildSettingRow('品牌名稱', this.buildInput('client_config.global.brand_name', config.global.brand_name));
        content += this.buildSettingRow('主色調 (Hex)', this.buildColorInput('client_config.global.primary_color', config.global.primary_color));

        // Booking Logic
        let bookingContent = '';
        bookingContent += this.buildSettingRow('預約模式 (Mode)', 
            this.buildSelect('client_config.booking.mode', config.booking.mode, [
                { value: 'range', label: '民宿/區間 (Count Nights)' },
                { value: 'studio', label: '工作室/單日 (Single Date)' }
            ])
        );
        bookingContent += this.buildSettingRow('入住/預約 標籤', this.buildInput('client_config.booking.labels.checkin', config.booking.labels.checkin));
        bookingContent += this.buildSettingRow('退房/結束 標籤', this.buildInput('client_config.booking.labels.checkout', config.booking.labels.checkout));

        if (config.booking.mode === 'studio') {
            const studioSettings = config.booking.studio_settings || { enable_time_slots: false, time_slot_config: { start: "09:00", end: "18:00", interval: 60 } };
            if(!this.state.currentConfig.client_config.booking.studio_settings) {
                this.updateValue('client_config.booking.studio_settings', studioSettings); 
            }
            bookingContent += `<div style="background:#f0f8ff; padding:15px; border-radius:6px; margin:10px 0;">`;
            bookingContent += `<h5 style="margin:0 0 10px 0; color:var(--color-primary);">🕐 工作室時段設定</h5>`;
            bookingContent += this.buildSettingRow('啟用時段選擇', this.buildToggle('client_config.booking.studio_settings.enable_time_slots', studioSettings.enable_time_slots));
            
            if (studioSettings.enable_time_slots) {
                bookingContent += this.buildSettingRow('每日開始時間', this.buildInput('client_config.booking.studio_settings.time_slot_config.start', studioSettings.time_slot_config.start, 'time'));
                bookingContent += this.buildSettingRow('每日結束時間', this.buildInput('client_config.booking.studio_settings.time_slot_config.end', studioSettings.time_slot_config.end, 'time'));
                bookingContent += this.buildSettingRow('時段間隔 (分鐘)', this.buildInput('client_config.booking.studio_settings.time_slot_config.interval', studioSettings.time_slot_config.interval, 'number'));
            }
            bookingContent += `</div>`;
        }

        bookingContent += `<h5 style="margin:15px 0 5px 0;">表單欄位開關</h5>`;
        bookingContent += this.buildSettingRow('顯示人數選擇', this.buildToggle('client_config.booking.field_toggles.people', config.booking.field_toggles.people));
        bookingContent += this.buildSettingRow('顯示數量/間數', this.buildToggle('client_config.booking.field_toggles.quantity', config.booking.field_toggles.quantity));
        bookingContent += this.buildSettingRow('顯示備註欄位', this.buildToggle('client_config.booking.field_toggles.notes', config.booking.field_toggles.notes));

        content += this.buildNestedSection('線上預約 (Booking)', bookingContent);

        // Products - 【修正重點：移除舊設定，加入 show_search】
        let prodContent = '';
        prodContent += this.buildSettingRow('頁面標題', this.buildInput('client_config.products.title', config.products.title));
        prodContent += this.buildSettingRow('顯示搜尋欄位', this.buildToggle('client_config.products.show_search', config.products.show_search !== false));
        content += this.buildNestedSection('產品型錄 (Products)', prodContent);

        // Profile
        let profileContent = '';
        profileContent += `<h5 style="margin:5px 0;">資訊區塊</h5>`;
        profileContent += this.buildSettingRow('顯示等級', this.buildToggle('client_config.profile.info_toggles.level', config.profile.info_toggles.level));
        profileContent += this.buildSettingRow('顯示點數', this.buildToggle('client_config.profile.info_toggles.points', config.profile.info_toggles.points));
        profileContent += this.buildSettingRow('顯示方案', this.buildToggle('client_config.profile.info_toggles.plan', config.profile.info_toggles.plan));
        profileContent += this.buildSettingRow('顯示儲值金', this.buildToggle('client_config.profile.info_toggles.balance', config.profile.info_toggles.balance));
        profileContent += `<h5 style="margin:15px 0 5px 0;">功能按鈕</h5>`;
        profileContent += this.buildSettingRow('我的紀錄', this.buildToggle('client_config.profile.btn_toggles.records', config.profile.btn_toggles.records));
        profileContent += this.buildSettingRow('我的優惠券', this.buildToggle('client_config.profile.btn_toggles.vouchers', config.profile.btn_toggles.vouchers));
        profileContent += this.buildSettingRow('集點趣', this.buildToggle('client_config.profile.btn_toggles.rally', config.profile.btn_toggles.rally));
        content += this.buildNestedSection('會員中心 (Profile)', profileContent);

        // Home
        content += this.buildNestedSection('首頁 (Home)', 
            this.buildSettingRow('頁面標題', this.buildInput('client_config.home.title', config.home.title)) +
            this.buildSettingRow('顯示集點懸浮鈕', this.buildToggle('client_config.home.show_rally_fab', config.home.show_rally_fab))
        );

        return this.buildAccordionItem('clientConfig', '客戶端 (LIFF App) 設定', content);
    },

    // ... (其餘函式 renderAdminConfig, renderOwnerConfig, renderTermsConfig, builders, events 保持不變) ...
    
    // (請確保將上述 renderClientConfig 函式替換回 systemSettings 物件中，並保留其他部分)
    // 為了完整性，若您需要完整程式碼請告知，否則只需更新此函式即可。
// ------------------------------------------------------------------
    // 2. 商家後台設定 (Admin Panel)
    renderAdminConfig() {
        const config = this.state.currentConfig?.admin_config;
        if (!config) return '';

        let content = '';

        // Dashboard
        content += this.buildNestedSection('儀表板 (Dashboard)', 
            this.buildSettingRow('啟用模組', this.buildToggle('admin_config.dashboard.enabled', config.dashboard.enabled))
        );

        // Inventory (Columns Sorting)
        let invContent = this.buildSettingRow('啟用模組', this.buildToggle('admin_config.inventory.enabled', config.inventory.enabled));
        invContent += `<div style="margin-top:10px;"><label class="setting-label">產品列表欄位排序與顯示：</label>`;
        invContent += this.buildColumnSorter('admin_config.inventory.columns', config.inventory.columns);
        invContent += `</div>`;
        content += this.buildNestedSection('產品管理 (Inventory)', invContent);

        // Bookings (Columns Sorting)
        let bookingContent = this.buildSettingRow('啟用模組', this.buildToggle('admin_config.bookings.enabled', config.bookings.enabled));
        bookingContent += `<div style="margin-top:10px;"><label class="setting-label">訂單列表欄位排序與顯示：</label>`;
        bookingContent += this.buildColumnSorter('admin_config.bookings.columns', config.bookings.columns);
        bookingContent += `</div>`;
        content += this.buildNestedSection('訂單管理 (Bookings)', bookingContent);

        // Users & Others
        content += this.buildNestedSection('其他模組開關', 
            this.buildSettingRow('顧客管理', this.buildToggle('admin_config.users.enabled', config.users.enabled)) +
            this.buildSettingRow('房量控管 (民宿)', this.buildToggle('admin_config.room_control.enabled', config.room_control?.enabled)) +
            this.buildSettingRow('優惠券', this.buildToggle('admin_config.others.vouchers', config.others.vouchers)) +
            this.buildSettingRow('集點活動', this.buildToggle('admin_config.others.rally', config.others.rally)) +
            this.buildSettingRow('財務報表', this.buildToggle('admin_config.others.reports', config.others.reports))
        );

        return this.buildAccordionItem('adminConfig', '商家後台 (Admin Panel) 設定', content);
    },

    // 3. 手機版後台設定 (Owner)
    renderOwnerConfig() {
        const config = this.state.currentConfig?.owner_config;
        if (!config) return '';

        let content = '';
        content += `<h5 style="margin:5px 0;">底部導覽列 (Tabs)</h5>`;
        content += this.buildSettingRow('最新動態', this.buildToggle('owner_config.tabs.activity', config.tabs.activity));
        content += this.buildSettingRow('預約管理', this.buildToggle('owner_config.tabs.booking', config.tabs.booking));
        content += this.buildSettingRow('房況控管 (民宿)', this.buildToggle('owner_config.tabs.room_control', config.tabs.room_control));
        content += this.buildSettingRow('核銷作業', this.buildToggle('owner_config.tabs.redeem', config.tabs.redeem));
        content += this.buildSettingRow('顧客查詢', this.buildToggle('owner_config.tabs.customer', config.tabs.customer));

        return this.buildAccordionItem('ownerConfig', '手機版後台 (Owner LIFF) 設定', content);
    },

    // 4. 用語設定 (Terms)
    renderTermsConfig() {
        const terms = this.state.currentConfig?.terms || {};
        let content = '';
        content += this.buildSettingRow('產品/服務 名詞', this.buildInput('terms.PRODUCT_NAME', terms.PRODUCT_NAME));
        content += this.buildSettingRow('型錄頁面標題', this.buildInput('terms.PRODUCT_CATALOG_TITLE', terms.PRODUCT_CATALOG_TITLE));
        content += this.buildSettingRow('預約行為 名稱', this.buildInput('terms.BOOKING_NAME', terms.BOOKING_NAME));
        content += this.buildSettingRow('預約頁面標題', this.buildInput('terms.BOOKING_PAGE_TITLE', terms.BOOKING_PAGE_TITLE));
        return this.buildAccordionItem('termsConfig', '系統用語設定 (Terms)', content);
    },

    // ------------------------------------------------------------------
    // UI 元件生成器 (Builders)
    // ------------------------------------------------------------------

    buildAccordionItem(id, title, contentHtml) {
        return `
            <div class="accordion-item" id="${id}">
                <div class="accordion-header" onclick="this.parentElement.querySelector('.accordion-content').classList.toggle('show')">
                    <span>${title}</span>
                    <span>▼</span>
                </div>
                <div class="accordion-content">
                    ${contentHtml}
                </div>
            </div>
        `;
    },

    buildNestedSection(title, content) {
        // 隨機 ID 避免衝突
        const id = 'nest_' + Math.random().toString(36).substr(2, 9);
        return `
            <div class="nested-section">
                <div class="nested-header" onclick="document.getElementById('${id}').classList.toggle('show')">
                    <span>${title}</span><span>▼</span>
                </div>
                <div class="nested-content" id="${id}">
                    ${content}
                </div>
            </div>
        `;
    },

    buildSettingRow(label, inputHtml, desc = '') {
        return `
            <div class="setting-row">
                <div>
                    <div class="setting-label">${label}</div>
                    ${desc ? `<span class="setting-desc">${desc}</span>` : ''}
                </div>
                <div>${inputHtml}</div>
            </div>
        `;
    },

    buildInput(path, value, type = 'text') {
        const safeValue = (value === null || value === undefined) ? '' : value;
        return `<input type="${type}" class="form-control" value="${safeValue}" onchange="systemSettings.updateValue('${path}', this.value)">`;
    },

    buildColorInput(path, value) {
        const safeValue = value || '#000000';
        return `
            <div style="display:flex; align-items:center; gap:10px;">
                <input type="color" value="${safeValue}" onchange="this.nextElementSibling.value = this.value; systemSettings.updateValue('${path}', this.value)">
                <input type="text" class="form-control" style="width:100px;" value="${safeValue}" onchange="this.previousElementSibling.value = this.value; systemSettings.updateValue('${path}', this.value)">
            </div>`;
    },

    buildToggle(path, checked) {
        return `
            <label class="switch">
                <input type="checkbox" ${checked ? 'checked' : ''} onchange="systemSettings.updateValue('${path}', this.checked)">
                <span class="slider"></span>
            </label>
        `;
    },

    buildSelect(path, value, options) {
        const optsHtml = options.map(opt => `<option value="${opt.value}" ${value === opt.value ? 'selected' : ''}>${opt.label}</option>`).join('');
        return `<select class="form-control" onchange="systemSettings.updateValue('${path}', this.value)">${optsHtml}</select>`;
    },

    // 列表排序器生成
    buildColumnSorter(path, columns) {
        if (!Array.isArray(columns)) return '<p style="color:red;">資料格式錯誤 (非陣列)</p>';
        
        let html = `<ul class="sortable-list" data-path="${path}">`;
        columns.forEach((col, index) => {
            html += `
                <li class="sortable-item" data-index="${index}">
                    <span class="sortable-handle">⠿</span>
                    <input type="checkbox" ${col.enabled ? 'checked' : ''} onchange="systemSettings.updateColumn('${path}', ${index}, 'enabled', this.checked)">
                    <span style="font-family:monospace; color:#666;">${col.key}</span>
                    <input type="text" class="form-control" value="${col.label}" placeholder="標題" onchange="systemSettings.updateColumn('${path}', ${index}, 'label', this.value)">
                </li>
            `;
        });
        html += `</ul>`;
        return html;
    },

    // ------------------------------------------------------------------
    // 事件處理與邏輯
    // ------------------------------------------------------------------

    bindEvents() {
        // 樣板切換
        const select = document.getElementById('settings-template-select');
        if (select) {
            select.addEventListener('change', (e) => {
                if (confirm('切換樣板將遺失未儲存的變更，確定嗎？')) {
                    this.state.activeTemplateKey = e.target.value;
                    this.state.currentConfig = JSON.parse(JSON.stringify(this.state.definitions[this.state.activeTemplateKey]));
                    this.render(); // 重新渲染整個介面
                } else {
                    e.target.value = this.state.activeTemplateKey;
                }
            });
        }

        // 重置按鈕
        const reloadBtn = document.getElementById('settings-reload-btn');
        if (reloadBtn) reloadBtn.addEventListener('click', () => this.loadData());

        // 儲存按鈕
        const saveBtn = document.getElementById('settings-save-btn');
        if (saveBtn) saveBtn.addEventListener('click', () => this.saveSettings());
    },

    // 初始化拖曳排序 (SortableJS)
    initSortables() {
        if (typeof Sortable === 'undefined') return;
        
        document.querySelectorAll('.sortable-list').forEach(list => {
            new Sortable(list, {
                handle: '.sortable-handle',
                animation: 150,
                onEnd: (evt) => {
                    // 重新排序陣列
                    const path = list.dataset.path;
                    const oldIndex = evt.oldIndex;
                    const newIndex = evt.newIndex;
                    
                    // 取得陣列參考
                    let arr = this.getValueByPath(path);
                    if (Array.isArray(arr)) {
                        const item = arr.splice(oldIndex, 1)[0];
                        arr.splice(newIndex, 0, item);
                        this.updateValue(path, arr); // 觸發更新
                        
                        // 雖然資料更新了，但 DOM 裡的 data-index 還是舊的
                        // 簡單起見，重新渲染該區塊，或更新 data-index (這裡選擇不重繪，因操作頻繁)
                        // 實際上 updateValue 不會重繪，這裡需要手動修正 data-index 以便下次操作
                        Array.from(list.children).forEach((li, idx) => li.dataset.index = idx);
                    }
                }
            });
        });
    },

    // 通用數值更新
    updateValue(path, value) {
        // 顯示未儲存提示
        document.getElementById('settings-unsaved-indicator').style.display = 'inline';
        
        // 解析路徑並更新物件
        const keys = path.split(/[\.\[\]]+/).filter(k => k);
        let target = this.state.currentConfig;
        
        for (let i = 0; i < keys.length - 1; i++) {
            target = target[keys[i]];
        }
        target[keys[keys.length - 1]] = value;

        // 如果是更改了 Booking Mode，需要觸發 UI 重繪 (因為有條件顯示)
        if (path === 'client_config.booking.mode') {
            this.render();
        }
    },

    // 欄位屬性更新 (針對陣列中的物件)
    updateColumn(path, index, field, value) {
        const arr = this.getValueByPath(path);
        if (arr && arr[index]) {
            arr[index][field] = value;
            this.updateValue(path, arr);
        }
    },

    getValueByPath(path) {
        const keys = path.split(/[\.\[\]]+/).filter(k => k);
        let target = this.state.currentConfig;
        for (let k of keys) {
            if (target && target[k] !== undefined) target = target[k];
            else return null;
        }
        return target;
    },

    // 儲存設定到後端
    async saveSettings() {
        const btn = document.getElementById('settings-save-btn');
        btn.disabled = true;
        btn.textContent = '儲存中...';

        try {
            // 1. 更新 definitions 物件
            this.state.definitions[this.state.activeTemplateKey] = this.state.currentConfig;

            // 2. 準備 payload (更新 definitions 與 active key)
            const settingsToUpdate = [
                { key: 'LOGIC_INDUSTRY_TEMPLATE_DEFINITIONS', value: JSON.stringify(this.state.definitions) },
                { key: 'LOGIC_ACTIVE_INDUSTRY_TEMPLATE', value: this.state.activeTemplateKey } // 設為當前啟用
            ];

            await api.updateSettings(settingsToUpdate);
            
            ui.toast.success('系統設定已更新並套用！');
            document.getElementById('settings-unsaved-indicator').style.display = 'none';
            
            // 更新本地狀態
            this.state.systemActiveKey = this.state.activeTemplateKey;
            this.render(); // 重繪以顯示 (目前啟用) 標籤

        } catch (error) {
            console.error(error);
            ui.toast.error('儲存失敗：' + error.message);
        } finally {
            btn.disabled = false;
            btn.textContent = '儲存並套用設定';
        }
    }
};

// 將模組掛載到 window 以便 onclick 存取
window.systemSettings = systemSettings;

export const init = () => systemSettings.init();