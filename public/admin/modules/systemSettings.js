/**
 * System Settings Module - v15.1 (Fix Render Loop & Null Pointer)
 * 修正：將資料初始化邏輯 (ensureDefaults) 與渲染邏輯分離，避免無限迴圈與 DOM 存取錯誤。
 */
import { api } from '../api.js';
import { ui } from '../ui.js';

const systemSettings = {
    // 狀態存儲
    state: {
        definitions: null,
        currentConfig: null,
        activeTemplateKey: '',
        systemActiveKey: ''
    },

    // 初始化
    async init() {
        console.log('[SystemSettings] Initializing...');
        const container = document.getElementById('page-settings');
        if (!container) return;
        
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
            
            .accordion-item { background: #fff; border-radius: 8px; margin-bottom: 10px; border: 1px solid #eee; overflow: hidden; }
            .accordion-header { padding: 15px 20px; cursor: pointer; background: #f8f9fa; display: flex; justify-content: space-between; align-items: center; font-weight: 600; transition: background 0.2s; }
            .accordion-header:hover { background: #e9ecef; }
            .accordion-content { display: none; padding: 20px; border-top: 1px solid #eee; }
            .accordion-content.show { display: block; animation: fadeIn 0.3s ease; }

            .nested-section { margin-top: 15px; border: 1px solid #e0e0e0; border-radius: 6px; overflow: hidden; }
            .nested-header { padding: 10px 15px; background: #f1f3f5; font-size: 0.95rem; font-weight: bold; cursor: pointer; display: flex; justify-content: space-between; align-items: center; }
            .nested-content { padding: 15px; display: none; background: #fff; }
            .nested-content.show { display: block; }

            .setting-row { display: grid; grid-template-columns: 200px 1fr; gap: 15px; align-items: center; padding: 10px 0; border-bottom: 1px dashed #eee; }
            .setting-row:last-child { border-bottom: none; }
            .setting-label { font-weight: 500; color: #333; }
            .setting-desc { font-size: 0.85em; color: #888; display: block; margin-top: 2px; }
            
            .form-control { width: 100%; padding: 8px 10px; border: 1px solid #ccc; border-radius: 4px; font-size: 1rem; }
            .form-control:focus { border-color: var(--color-primary); outline: none; }
            
            .sortable-list { list-style: none; padding: 0; margin: 0; border: 1px solid #eee; border-radius: 4px; }
            .sortable-item { display: grid; grid-template-columns: 30px 40px 150px 1fr; align-items: center; gap: 10px; padding: 10px; background: #fff; border-bottom: 1px solid #eee; }
            .sortable-item:last-child { border-bottom: none; }
            .sortable-handle { cursor: grab; color: #aaa; text-align: center; }
            
            .save-bar { position: fixed; bottom: 0; left: 0; right: 0; background: rgba(255,255,255,0.95); padding: 15px 40px; box-shadow: 0 -2px 10px rgba(0,0,0,0.1); display: flex; justify-content: flex-end; align-items: center; gap: 15px; backdrop-filter: blur(5px); z-index: 999; }
            
            /* 內部區塊樣式 */
            .sub-settings-box { background: #f8f9fa; padding: 15px; border-radius: 6px; margin-top: 10px; border: 1px solid #eee; }
            .sub-settings-title { margin: 0 0 10px 0; font-size: 0.95rem; color: var(--color-primary); border-bottom: 2px solid #e9ecef; padding-bottom: 5px; display: inline-block;}
            
            @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
        `;
        document.head.appendChild(style);
    },

    // 載入資料
    async loadData() {
        const container = document.getElementById('page-settings');
        try {
            const settings = await api.getSettings();
            
            const defsRow = settings.find(s => s.key === 'LOGIC_INDUSTRY_TEMPLATE_DEFINITIONS');
            if (defsRow && defsRow.value) {
                this.state.definitions = JSON.parse(defsRow.value);
            } else {
                this.state.definitions = {}; 
            }

            const activeRow = settings.find(s => s.key === 'LOGIC_ACTIVE_INDUSTRY_TEMPLATE');
            this.state.systemActiveKey = activeRow ? activeRow.value : '';
            
            const keys = Object.keys(this.state.definitions);
            if (!this.state.activeTemplateKey) {
                this.state.activeTemplateKey = this.state.systemActiveKey && keys.includes(this.state.systemActiveKey) 
                    ? this.state.systemActiveKey 
                    : (keys[0] || '');
            }

            if (this.state.activeTemplateKey) {
                this.state.currentConfig = JSON.parse(JSON.stringify(this.state.definitions[this.state.activeTemplateKey]));
            }

            // 【修正】先確保資料結構完整，再進行渲染
            this.ensureDefaults();
            this.render();

        } catch (error) {
            console.error('Failed to load settings:', error);
            container.innerHTML = `<p style="color:red; text-align:center;">設定載入失敗: ${error.message}</p>`;
        }
    },

    // 【新功能】資料初始化與預設值填補 (不觸發 UI 更新)
    ensureDefaults() {
        const config = this.state.currentConfig;
        if (!config) return;

        // 確保 admin_config 結構存在
        if (!config.admin_config) config.admin_config = {};
        
        const ac = config.admin_config;

        // 1. Sidebar
        if (!ac.visible_modules) {
            ac.visible_modules = {
                dashboard: ac.dashboard?.enabled,
                users: ac.users?.enabled,
                products: ac.inventory?.enabled,
                room_control: ac.room_control?.enabled,
                bookings: ac.bookings?.enabled,
                news: ac.news?.enabled,
                store_info: ac.store_info?.enabled,
                finance: ac.others?.reports,
                coupons: ac.others?.vouchers
            };
        }

        // 2. Dashboard Widgets
        if (!ac.dashboard) ac.dashboard = { enabled: true };
        if (!ac.dashboard.widgets) {
            ac.dashboard.widgets = { today_orders: true, revenue: true, pending: true, hot_items: true };
        }

        // 3. Users CRM
        if (!ac.users) ac.users = { enabled: true };
        if (!ac.users.crm_view) {
            ac.users.crm_view = { show_stored_value: true, show_vouchers: true, show_rally: true, show_tags: true };
        }

        // 4. Inventory Features & Settings
        if (!ac.inventory) ac.inventory = { enabled: true };
        if (!ac.inventory.features) {
            ac.inventory.features = { add_single: true, import_export: true };
        }
        if (!ac.inventory.form_settings) {
            ac.inventory.form_settings = { price_mode: 'simple', stock_mode: 'quantity', specs_count: 3, allow_image_upload: true };
        }

        // 5. Store Info
        if (!ac.store_info) ac.store_info = { enabled: true };
        if (!ac.store_info.policy_fields) {
            ac.store_info.policy_fields = { show_cancellation: true, show_instructions: true };
        }
        if (!ac.store_info.policy_labels) {
            ac.store_info.policy_labels = { cancellation: "取消政策", instructions: "入住須知" };
        }

        // 6. Client Config - Studio Settings
        if (config.client_config && config.client_config.booking) {
            if (!config.client_config.booking.studio_settings) {
                config.client_config.booking.studio_settings = { enable_time_slots: false, time_slot_config: { start: "09:00", end: "18:00", interval: 60 } };
            }
        }
        
        // 注意：這裡直接修改記憶體中的 state，不呼叫 updateValue 以避免副作用
    },

    // 主渲染函式
    render() {
        const container = document.getElementById('page-settings');
        if (!container) return;

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
        this.initSortables();
    },

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
            const studioSettings = config.booking.studio_settings; // ensureDefaults 已確保存在
            
            bookingContent += `<div class="sub-settings-box">`;
            bookingContent += `<h5 class="sub-settings-title">🕐 工作室時段設定</h5>`;
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

        // Products
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

    // 2. 商家後台設定 (Admin Panel)
    renderAdminConfig() {
        const config = this.state.currentConfig?.admin_config;
        if (!config) return '';

        let content = '';

        // 1. Sidebar (頂部選單顯示) - 修正：綁定到各模組的 Source of Truth (enabled/others)
        // 這樣 saveSettings 的同步邏輯才能正確運作
        const ac = config; // alias
        const others = ac.others || {}; 

        let sidebarContent = '';
        // 儀表板 -> admin_config.dashboard.enabled
        sidebarContent += this.buildSettingRow('儀表板', this.buildToggle('admin_config.dashboard.enabled', ac.dashboard?.enabled));
        // 顧客管理 -> admin_config.users.enabled
        sidebarContent += this.buildSettingRow('顧客管理', this.buildToggle('admin_config.users.enabled', ac.users?.enabled));
        // 產品管理 -> admin_config.inventory.enabled
        sidebarContent += this.buildSettingRow('產品/服務管理', this.buildToggle('admin_config.inventory.enabled', ac.inventory?.enabled));
        // 房況管理 -> admin_config.room_control.enabled
        sidebarContent += this.buildSettingRow('房況控管 (民宿)', this.buildToggle('admin_config.room_control.enabled', ac.room_control?.enabled));
        // 訂單管理 -> admin_config.bookings.enabled
        sidebarContent += this.buildSettingRow('訂單管理', this.buildToggle('admin_config.bookings.enabled', ac.bookings?.enabled));
        // 最新消息 -> admin_config.news.enabled
        sidebarContent += this.buildSettingRow('最新消息', this.buildToggle('admin_config.news.enabled', ac.news?.enabled));
        // 店家資訊 -> admin_config.store_info.enabled
        sidebarContent += this.buildSettingRow('店家資訊', this.buildToggle('admin_config.store_info.enabled', ac.store_info?.enabled));
        // 財務報表 -> admin_config.others.reports
        sidebarContent += this.buildSettingRow('財務報表', this.buildToggle('admin_config.others.reports', others.reports));
        // 優惠券 -> admin_config.others.vouchers
        sidebarContent += this.buildSettingRow('優惠券/行銷', this.buildToggle('admin_config.others.vouchers', others.vouchers));
        
        content += this.buildNestedSection('頂部選單顯示 (Navigation)', sidebarContent);

        // 2. Dashboard Widgets
        const widgets = config.dashboard?.widgets || {};
        let dashContent = '';
        dashContent += this.buildSettingRow('今日訂單/訪客', this.buildToggle('admin_config.dashboard.widgets.today_orders', widgets.today_orders));
        dashContent += this.buildSettingRow('營收統計', this.buildToggle('admin_config.dashboard.widgets.revenue', widgets.revenue));
        content += this.buildNestedSection('儀表板設定 (Dashboard)', dashContent);

        // 3. Users
        let usersContent = '';
        const crm = config.users?.crm_view || {};
        usersContent += `<div class="sub-settings-box">`;
        usersContent += `<h5 class="sub-settings-title">顧客詳情 (CRM) 顯示</h5>`;
        usersContent += this.buildSettingRow('儲值金紀錄', this.buildToggle('admin_config.users.crm_view.show_stored_value', crm.show_stored_value));
        usersContent += this.buildSettingRow('持有優惠券', this.buildToggle('admin_config.users.crm_view.show_vouchers', crm.show_vouchers));
        usersContent += this.buildSettingRow('集點進度', this.buildToggle('admin_config.users.crm_view.show_rally', crm.show_rally));
        usersContent += this.buildSettingRow('標籤', this.buildToggle('admin_config.users.crm_view.show_tags', crm.show_tags));
        usersContent += `</div>`;

        usersContent += `<div style="margin-top:10px;"><label class="setting-label">顧客列表欄位：</label>`;
        usersContent += this.buildColumnSorter('admin_config.users.columns', config.users?.columns);
        usersContent += `</div>`;
        content += this.buildNestedSection('顧客管理設定 (Users)', usersContent);

        // 4. Products
        let invContent = '';
        const features = config.inventory?.features || {};
        const formSettings = config.inventory?.form_settings || {};

        invContent += `<div class="sub-settings-box">`;
        invContent += `<h5 class="sub-settings-title">功能按鈕</h5>`;
        invContent += this.buildSettingRow('顯示「新增單筆」', this.buildToggle('admin_config.inventory.features.add_single', features.add_single));
        invContent += this.buildSettingRow('顯示「匯入/匯出」', this.buildToggle('admin_config.inventory.features.import_export', features.import_export));
        invContent += `</div>`;

        invContent += `<div class="sub-settings-box">`;
        invContent += `<h5 class="sub-settings-title">新增/編輯表單設定</h5>`;
        invContent += this.buildSettingRow('價格模式', this.buildSelect('admin_config.inventory.form_settings.price_mode', formSettings.price_mode, [
            {value: 'simple', label: '單一價格 (適用工作室)'},
            {value: 'complex', label: '平/假日價格 (適用民宿)'}
        ]));
        invContent += this.buildSettingRow('庫存模式', this.buildSelect('admin_config.inventory.form_settings.stock_mode', formSettings.stock_mode, [
            {value: 'quantity', label: '數量制 (Quantity)'},
            {value: 'status', label: '狀態制 (Status Only)'},
            {value: 'date_based', label: '日期制 (Date Based - 民宿用)'},
            {value: 'none', label: '不管理 (純展示)'}
        ]));
        invContent += this.buildSettingRow('規格欄位數量', this.buildInput('admin_config.inventory.form_settings.specs_count', formSettings.specs_count, 'number'));
        invContent += this.buildSettingRow('允許圖片上傳', this.buildToggle('admin_config.inventory.form_settings.allow_image_upload', formSettings.allow_image_upload));
        invContent += `</div>`;

        invContent += `<div style="margin-top:10px;"><label class="setting-label">產品列表欄位：</label>`;
        invContent += this.buildColumnSorter('admin_config.inventory.columns', config.inventory?.columns);
        invContent += `</div>`;
        content += this.buildNestedSection('產品管理設定 (Products)', invContent);

        // 5. Bookings
        let bookingContent = '';
        bookingContent += `<div style="margin-top:10px;"><label class="setting-label">訂單列表欄位：</label>`;
        bookingContent += this.buildColumnSorter('admin_config.bookings.columns', config.bookings?.columns);
        bookingContent += `</div>`;
        content += this.buildNestedSection('訂單管理設定 (Bookings)', bookingContent);
        
        // 6. Store Info
        let storeContent = '';
        const policyFields = config.store_info?.policy_fields || {};
        const policyLabels = config.store_info?.policy_labels || {};
        
        storeContent += `<div class="sub-settings-box">`;
        storeContent += `<h5 class="sub-settings-title">政策顯示與標題</h5>`;
        storeContent += this.buildSettingRow('顯示「取消政策」', this.buildToggle('admin_config.store_info.policy_fields.show_cancellation', policyFields.show_cancellation));
        storeContent += this.buildSettingRow('自訂標題', this.buildInput('admin_config.store_info.policy_labels.cancellation', policyLabels.cancellation));
        storeContent += `<hr style="margin:10px 0; border-color:#eee;">`;
        storeContent += this.buildSettingRow('顯示「須知事項」', this.buildToggle('admin_config.store_info.policy_fields.show_instructions', policyFields.show_instructions));
        storeContent += this.buildSettingRow('自訂標題', this.buildInput('admin_config.store_info.policy_labels.instructions', policyLabels.instructions));
        storeContent += `</div>`;
        content += this.buildNestedSection('店家資訊設定 (Store Info)', storeContent);

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
        const select = document.getElementById('settings-template-select');
        if (select) {
            select.addEventListener('change', (e) => {
                if (confirm('切換樣板將遺失未儲存的變更，確定嗎？')) {
                    this.state.activeTemplateKey = e.target.value;
                    this.state.currentConfig = JSON.parse(JSON.stringify(this.state.definitions[this.state.activeTemplateKey]));
                    this.ensureDefaults(); // 確保新樣板也有預設值
                    this.render(); 
                } else {
                    e.target.value = this.state.activeTemplateKey;
                }
            });
        }
        const reloadBtn = document.getElementById('settings-reload-btn');
        if (reloadBtn) reloadBtn.addEventListener('click', () => this.loadData());
        const saveBtn = document.getElementById('settings-save-btn');
        if (saveBtn) saveBtn.addEventListener('click', () => this.saveSettings());
    },

    initSortables() {
        if (typeof Sortable === 'undefined') return;
        document.querySelectorAll('.sortable-list').forEach(list => {
            new Sortable(list, {
                handle: '.sortable-handle',
                animation: 150,
                onEnd: (evt) => {
                    const path = list.dataset.path;
                    const oldIndex = evt.oldIndex;
                    const newIndex = evt.newIndex;
                    let arr = this.getValueByPath(path);
                    if (Array.isArray(arr)) {
                        const item = arr.splice(oldIndex, 1)[0];
                        arr.splice(newIndex, 0, item);
                        this.updateValue(path, arr);
                        Array.from(list.children).forEach((li, idx) => li.dataset.index = idx);
                    }
                }
            });
        });
    },

    // 修正後的 updateValue：加上防呆檢查
    updateValue(path, value) {
        // 1. 顯示「未儲存」提示
        const indicator = document.getElementById('settings-unsaved-indicator');
        if (indicator) indicator.style.display = 'inline';

        // 2. 更新記憶體中的設定值 (Deep Update)
        const keys = path.split(/[\.\[\]]+/).filter(k => k);
        let target = this.state.currentConfig;
        for (let i = 0; i < keys.length - 1; i++) {
            if (!target[keys[i]]) target[keys[i]] = {}; 
            target = target[keys[i]];
        }
        target[keys[keys.length - 1]] = value;

        // 3. 【關鍵修正】只有在「會改變介面結構」的重大設定變更時，才重新渲染
        // 例如：切換「預約模式」會導致下方的欄位完全不同，這時才需要重繪
        // 一般的 enabled 開關不需要重繪
        if (path === 'client_config.booking.mode') {
            this.render();
        }
    },

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

    async saveSettings() {
        const btn = document.getElementById('settings-save-btn');
        btn.disabled = true;
        btn.textContent = '儲存與同步中...';

        try {
            // 1. 強制同步 visible_modules (解決設定矛盾問題)
            const current = this.state.currentConfig;
            
            if (current.admin_config) {
                const ac = current.admin_config;
                ac.visible_modules = {
                    'dashboard': ac.dashboard?.enabled,
                    'users': ac.users?.enabled,
                    'products': ac.inventory?.enabled,
                    'room_control': ac.room_control?.enabled,
                    'bookings': ac.bookings?.enabled,
                    'news': ac.news?.enabled,
                    'store_info': ac.store_info?.enabled,
                    'finance': ac.others?.reports,
                    'coupons': ac.others?.vouchers,
                    'rally': ac.others?.rally,
                    'points': ac.others?.points,
                    'drafts': ac.others?.drafts
                };
            }

            // 2. 更新記憶體中的藍圖
            this.state.definitions[this.state.activeTemplateKey] = current;
            
            // 3. 準備寫入資料庫 (包含藍圖與獨立欄位)
            const settingsToUpdate = [
                { key: 'LOGIC_INDUSTRY_TEMPLATE_DEFINITIONS', value: JSON.stringify(this.state.definitions), type: 'json' },
                { key: 'LOGIC_ACTIVE_INDUSTRY_TEMPLATE', value: this.state.activeTemplateKey, type: 'string' },
                { key: 'active_template_id', value: this.state.activeTemplateKey, type: 'string' }
            ];

            if (current.client_config) settingsToUpdate.push({ key: 'client_config', value: JSON.stringify(current.client_config), type: 'json' });
            if (current.admin_config) settingsToUpdate.push({ key: 'admin_config', value: JSON.stringify(current.admin_config), type: 'json' });
            if (current.owner_config) settingsToUpdate.push({ key: 'owner_config', value: JSON.stringify(current.owner_config), type: 'json' });
            if (current.terms) settingsToUpdate.push({ key: 'terms_config', value: JSON.stringify(current.terms), type: 'json' });

            // 4. 發送請求
            await api.updateSettings(settingsToUpdate);
            
            // 5. 【關鍵修正】強制重整網頁
            // 這樣 app.js 才會重新執行 init()，讀取到最新的 visible_modules
            alert('設定已儲存成功！\n系統將自動重新整理以套用變更。');
            window.location.reload(); 

        } catch (error) {
            console.error(error);
            ui.toast.error('儲存失敗：' + error.message);
            btn.disabled = false;
            btn.textContent = '儲存並套用設定';
        }
    }
}
window.systemSettings = systemSettings;
export const init = () => systemSettings.init();