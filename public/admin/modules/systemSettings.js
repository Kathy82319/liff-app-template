/**
 * System Settings Module - v12.0 (Schema-Driven UI)
 * 負責渲染基於 JSON Template 的系統設定介面
 */

const systemSettings = {
    // 狀態存儲
    state: {
        definitions: null, // 對應 DB: LOGIC_INDUSTRY_TEMPLATE_DEFINITIONS
        currentConfig: null, // 當前編輯中的完整設定物件
        activeTemplateKey: '' // 當前選擇的樣板 Key (e.g., 'studio_template')
    },

    // 初始化
    async init() {
        console.log('System Settings Module Initialized');
        await this.loadData();
        this.render();
    },

    // 載入資料 (模擬 API)
    async loadData() {
        try {
            // 在實際串接時，這裡會呼叫 GET /api/admin/settings
            // 這裡假設 app.js 或全域變數已經載入了 appSettings
            // 為了演示，我們假設從全域變數取得，實際請替換為 fetch
            
            // 模擬從資料庫取得的 Definitions (即您提供的 JSON)
            // 這裡不寫死 JSON，而是預期它已經存在於環境中
            // const response = await fetch('/api/admin/settings/definitions');
            // this.state.definitions = await response.json();
            
            // ⚠️ 開發測試用：請確保後端 API 有回傳您提供的 JSON 結構
            // 這裡假設 window.TEMP_DB_DEFINITIONS 是您剛才提供的 JSON
            if (window.TEMP_DB_DEFINITIONS) {
                this.state.definitions = window.TEMP_DB_DEFINITIONS;
            } else {
                console.warn('找不到樣板定義檔，請確認資料庫連線');
                this.state.definitions = {}; 
            }

            // 預設選中第一個樣板或讀取當前設定
            const keys = Object.keys(this.state.definitions);
            if (keys.length > 0) {
                this.state.activeTemplateKey = keys.includes('studio_template') ? 'studio_template' : keys[0];
                // 深拷貝一份作為當前編輯對象
                this.state.currentConfig = JSON.parse(JSON.stringify(this.state.definitions[this.state.activeTemplateKey]));
            }

        } catch (error) {
            console.error('Failed to load settings:', error);
            alert('設定載入失敗');
        }
    },

    // 主渲染函式
    render() {
        const container = document.getElementById('module-content');
        if (!container) return;

        // 注入 CSS 樣式
        const styles = `
            <style>
                .settings-container { max-width: 1000px; margin: 0 auto; }
                .template-selector { background: #fff; padding: 20px; border-radius: 8px; margin-bottom: 20px; box-shadow: 0 2px 4px rgba(0,0,0,0.05); }
                .accordion-item { background: #fff; border-radius: 8px; margin-bottom: 10px; border: 1px solid #eee; overflow: hidden; }
                .accordion-header { 
                    padding: 15px 20px; 
                    cursor: pointer; 
                    background: #f8f9fa; 
                    display: flex; 
                    justify-content: space-between; 
                    align-items: center;
                    font-weight: 600;
                    user-select: none;
                    transition: background 0.2s;
                }
                .accordion-header:hover { background: #f0f2f5; }
                .accordion-header .icon { transition: transform 0.3s ease; }
                .accordion-header.active .icon { transform: rotate(180deg); }
                .accordion-content { display: none; padding: 20px; border-top: 1px solid #eee; }
                .accordion-content.show { display: block; animation: slideDown 0.3s ease-out; }
                
                /* 內層 Accordion 樣式 (Nested) */
                .nested-accordion { margin-left: 10px; border-left: 3px solid #e9ecef; margin-bottom: 10px; }
                .nested-header { padding: 10px 15px; font-size: 0.95em; color: #555; cursor: pointer; display: flex; align-items: center; }
                .nested-header:hover { color: #000; }
                .nested-header .icon { margin-right: 8px; font-size: 0.8em; }
                .nested-content { display: none; padding: 10px 20px; }
                .nested-content.show { display: block; }

                /* 表單元件 */
                .form-group { margin-bottom: 15px; display: flex; align-items: center; justify-content: space-between; padding: 8px 0; border-bottom: 1px dashed #f0f0f0; }
                .form-group label { margin-right: 15px; color: #333; }
                .form-group.sub-group { padding-left: 20px; }
                .form-control { padding: 8px; border: 1px solid #ddd; border-radius: 4px; width: 200px; }
                
                /* Toggle Switch */
                .switch { position: relative; display: inline-block; width: 40px; height: 22px; }
                .switch input { opacity: 0; width: 0; height: 0; }
                .slider { position: absolute; cursor: pointer; top: 0; left: 0; right: 0; bottom: 0; background-color: #ccc; transition: .4s; border-radius: 34px; }
                .slider:before { position: absolute; content: ""; height: 16px; width: 16px; left: 3px; bottom: 3px; background-color: white; transition: .4s; border-radius: 50%; }
                input:checked + .slider { background-color: #2196F3; }
                input:checked + .slider:before { transform: translateX(18px); }

                .save-bar { position: sticky; bottom: 20px; background: rgba(255,255,255,0.9); padding: 15px; box-shadow: 0 -2px 10px rgba(0,0,0,0.1); border-radius: 8px; display: flex; justify-content: flex-end; backdrop-filter: blur(5px); margin-top: 20px; }
                .btn-primary { background: #007bff; color: white; border: none; padding: 10px 25px; border-radius: 4px; cursor: pointer; font-size: 1rem; }
                .btn-primary:hover { background: #0056b3; }

                @keyframes slideDown { from { opacity: 0; transform: translateY(-10px); } to { opacity: 1; transform: translateY(0); } }
            </style>
        `;

        // 樣板選擇器 HTML
        let templateOptions = Object.keys(this.state.definitions).map(key => 
            `<option value="${key}" ${this.state.activeTemplateKey === key ? 'selected' : ''}>${this.state.definitions[key].name}</option>`
        ).join('');

        const html = `
            ${styles}
            <div class="settings-container">
                <div class="template-selector">
                    <label><strong>選擇要編輯/啟用的樣板：</strong></label>
                    <select id="templateSelect" class="form-control" style="width: 100%; margin-top: 10px;">
                        ${templateOptions}
                    </select>
                    <p style="margin-top: 10px; color: #666; font-size: 0.9em;">
                        ${this.state.definitions[this.state.activeTemplateKey]?.description || ''}
                    </p>
                </div>

                <div id="settingsAccordion">
                    ${this.renderAccordionItem('客戶端 (LIFF App) 設定', 'clientConfig', this.renderClientConfig())}
                    
                    ${this.renderAccordionItem('商家後台 (Admin Panel) 設定', 'adminConfig', this.renderAdminConfig())}
                    
                    ${this.renderAccordionItem('手機版後台 (Owner LIFF) 設定', 'ownerConfig', this.renderOwnerConfig())}

                    ${this.renderAccordionItem('系統用語與文字設定 (Terms)', 'termsConfig', this.renderTermsConfig())}
                </div>

                <div class="save-bar">
                    <button class="btn-primary" onclick="systemSettings.saveSettings()">儲存並套用設定</button>
                </div>
            </div>
        `;

        container.innerHTML = html;
        this.bindEvents();
    },

    // --- 渲染邏輯 Helper ---

    renderAccordionItem(title, id, contentHtml) {
        return `
            <div class="accordion-item" id="${id}">
                <div class="accordion-header" onclick="systemSettings.toggleAccordion('${id}')">
                    <span>${title}</span>
                    <span class="icon">▼</span>
                </div>
                <div class="accordion-content">
                    ${contentHtml}
                </div>
            </div>
        `;
    },

    // 1. 客戶端設定渲染
    renderClientConfig() {
        const config = this.state.currentConfig.client_config;
        if (!config) return '<div>無設定資料</div>';

        let html = '';

        // Global
        html += this.renderNestedSection('全域設定 (Global)', [
            this.createInput('品牌名稱', 'client_config.global.brand_name', config.global.brand_name),
            this.createColorInput('主色調', 'client_config.global.primary_color', config.global.primary_color)
        ]);

        // Booking
        const bookingFields = [
            this.createDisplayOnly('核心模式', config.booking.mode === 'guesthouse' ? '民宿模式 (Guesthouse)' : '工作室模式 (Studio)'),
            this.createInput('入住/預約文字', 'client_config.booking.labels.checkin', config.booking.labels.checkin),
            this.createInput('退房/結束文字', 'client_config.booking.labels.checkout', config.booking.labels.checkout)
        ];

        // 判斷是否顯示民宿特定設定
        if (config.booking.guesthouse_settings) {
             bookingFields.push(this.createToggle('顯示晚數計算', 'client_config.booking.guesthouse_settings.show_night_calc', config.booking.guesthouse_settings.show_night_calc));
        }

        // 判斷是否顯示工作室特定設定
        if (config.booking.studio_settings) {
            bookingFields.push(this.createToggle('啟用時段選擇', 'client_config.booking.studio_settings.enable_time_slots', config.booking.studio_settings.enable_time_slots));
            // 時段細項
            if (config.booking.studio_settings.enable_time_slots) {
                bookingFields.push(`<div class="form-group sub-group"><label>開始時間</label><input type="time" class="form-control" value="${config.booking.studio_settings.time_slot_config.start}" onchange="systemSettings.updateValue('client_config.booking.studio_settings.time_slot_config.start', this.value)"></div>`);
                bookingFields.push(`<div class="form-group sub-group"><label>結束時間</label><input type="time" class="form-control" value="${config.booking.studio_settings.time_slot_config.end}" onchange="systemSettings.updateValue('client_config.booking.studio_settings.time_slot_config.end', this.value)"></div>`);
                bookingFields.push(`<div class="form-group sub-group"><label>間隔 (分鐘)</label><input type="number" class="form-control" value="${config.booking.studio_settings.time_slot_config.interval}" onchange="systemSettings.updateValue('client_config.booking.studio_settings.time_slot_config.interval', parseInt(this.value))"></div>`);
            }
        }

        // Field Toggles
        bookingFields.push('<hr style="margin:10px 0; border:0; border-top:1px dashed #eee;"><h5>表單欄位開關</h5>');
        bookingFields.push(this.createToggle('顯示人數選擇', 'client_config.booking.field_toggles.people', config.booking.field_toggles.people));
        bookingFields.push(this.createToggle('顯示數量/間數', 'client_config.booking.field_toggles.quantity', config.booking.field_toggles.quantity));
        bookingFields.push(this.createToggle('顯示備註欄位', 'client_config.booking.field_toggles.notes', config.booking.field_toggles.notes));

        html += this.renderNestedSection('線上預約 (Booking)', bookingFields);

        // Products
        html += this.renderNestedSection('產品/服務 (Products)', [
            this.createInput('頁面標題', 'client_config.products.title', config.products.title),
            this.createToggle('顯示價格', 'client_config.products.show_price', config.products.show_price),
            this.createToggle('顯示庫存/名額', 'client_config.products.show_stock', config.products.show_stock)
        ]);

        // Profile
        const profileFields = [
            '<h5>資訊區塊</h5>',
            this.createToggle('顯示等級', 'client_config.profile.info_toggles.level', config.profile.info_toggles.level),
            this.createToggle('顯示點數', 'client_config.profile.info_toggles.points', config.profile.info_toggles.points),
            this.createToggle('顯示儲值金', 'client_config.profile.info_toggles.balance', config.profile.info_toggles.balance),
            '<hr style="margin:10px 0; border:0; border-top:1px dashed #eee;"><h5>功能按鈕</h5>',
            this.createToggle('我的紀錄', 'client_config.profile.btn_toggles.records', config.profile.btn_toggles.records),
            this.createToggle('我的優惠券', 'client_config.profile.btn_toggles.vouchers', config.profile.btn_toggles.vouchers),
            this.createToggle('集點趣', 'client_config.profile.btn_toggles.rally', config.profile.btn_toggles.rally)
        ];
        html += this.renderNestedSection('會員中心 (Profile)', profileFields);

        // Home
        html += this.renderNestedSection('首頁 (Home)', [
            this.createInput('首頁標題', 'client_config.home.title', config.home.title),
            this.createToggle('顯示集點懸浮鈕', 'client_config.home.show_rally_fab', config.home.show_rally_fab)
        ]);

        return html;
    },

    // 2. 商家後台設定渲染
    renderAdminConfig() {
        const config = this.state.currentConfig.admin_config;
        let html = '';

        // Helper to render columns array
        const renderColumns = (path, columnsArray) => {
            if (!Array.isArray(columnsArray)) return ''; // Handle object based columns if needed, but JSON uses array for inventory/bookings
            
            // 如果是 Object (如 users.columns)
            if (!Array.isArray(columnsArray) && typeof columnsArray === 'object') {
                 return Object.keys(columnsArray).map(key => 
                    this.createToggle(`顯示 ${key}`, `${path}.${key}`, columnsArray[key])
                ).join('');
            }

            // 如果是 Array (如 inventory.columns)
            return columnsArray.map((col, index) => 
                this.createToggle(`顯示欄位：${col.label}`, `${path}[${index}].enabled`, col.enabled)
            ).join('');
        };

        // Dashboard
        html += this.renderNestedSection('儀表板 (Dashboard)', [
            this.createToggle('啟用儀表板', 'admin_config.dashboard.enabled', config.dashboard.enabled),
            '<div style="margin-left:20px; font-size:0.9em; color:#666;">區塊設定：</div>',
            this.createToggle('今日計數', 'admin_config.dashboard.blocks.today_count', config.dashboard.blocks.today_count),
            this.createToggle('待處理訂單', 'admin_config.dashboard.blocks.pending', config.dashboard.blocks.pending),
            this.createToggle('營收統計', 'admin_config.dashboard.blocks.revenue', config.dashboard.blocks.revenue)
        ]);

        // Users
        html += this.renderNestedSection('顧客管理 (Users)', [
            this.createToggle('啟用模組', 'admin_config.users.enabled', config.users.enabled),
            '<hr><h6>列表欄位：</h6>',
            this.createToggle('真實姓名', 'admin_config.users.columns.real_name', config.users.columns.real_name),
            this.createToggle('電話', 'admin_config.users.columns.phone', config.users.columns.phone),
            this.createToggle('等級', 'admin_config.users.columns.level', config.users.columns.level),
            this.createToggle('儲值金餘額', 'admin_config.users.columns.balance', config.users.columns.balance)
        ]);

        // Inventory
        html += this.renderNestedSection('產品/服務管理 (Inventory)', [
            this.createToggle('啟用模組', 'admin_config.inventory.enabled', config.inventory.enabled),
            this.createToggle('允許單筆新增', 'admin_config.inventory.features.add_single', config.inventory.features.add_single),
            this.createToggle('允許匯入/匯出', 'admin_config.inventory.features.import_export', config.inventory.features.import_export),
            '<hr><h6>表單設定：</h6>',
            this.createToggle('允許上傳圖片', 'admin_config.inventory.form_settings.allow_image_upload', config.inventory.form_settings.allow_image_upload),
            this.createDisplayOnly('價格模式', config.inventory.form_settings.price_mode),
            this.createDisplayOnly('庫存模式', config.inventory.form_settings.stock_mode),
            '<hr><h6>列表欄位：</h6>',
            renderColumns('admin_config.inventory.columns', config.inventory.columns)
        ]);

        // Room Control (房控)
        if (config.room_control) {
            html += this.renderNestedSection('房量/房況控管 (Room Control)', [
                this.createToggle('啟用房控頁面', 'admin_config.room_control.enabled', config.room_control.enabled),
                '<small style="color:#666;">(工作室模式建議關閉此項目)</small>'
            ]);
        }

        // Bookings
        html += this.renderNestedSection('訂位/訂單管理 (Bookings)', [
            this.createToggle('啟用模組', 'admin_config.bookings.enabled', config.bookings.enabled),
            '<hr><h6>列表欄位：</h6>',
            renderColumns('admin_config.bookings.columns', config.bookings.columns)
        ]);

        // Store Info & Policies
        html += this.renderNestedSection('店家資訊與政策 (Store Info)', [
             this.createToggle('啟用模組', 'admin_config.store_info.enabled', config.store_info.enabled),
             this.createInput('取消政策標題', 'admin_config.store_info.policy_labels.cancellation', config.store_info.policy_labels.cancellation),
             this.createInput('須知/說明標題', 'admin_config.store_info.policy_labels.instructions', config.store_info.policy_labels.instructions)
        ]);

        // Others
        html += this.renderNestedSection('其他模組 (Others)', [
            this.createToggle('優惠券 (Vouchers)', 'admin_config.others.vouchers', config.others.vouchers),
            this.createToggle('集點地圖 (Rally)', 'admin_config.others.rally', config.others.rally),
            this.createToggle('點數發放', 'admin_config.others.points', config.others.points),
            this.createToggle('財務報表', 'admin_config.others.reports', config.others.reports)
        ]);

        return html;
    },

    // 3. 手機版後台設定
    renderOwnerConfig() {
        const config = this.state.currentConfig.owner_config;
        let html = '';

        html += this.renderNestedSection('導覽列分頁 (Tabs)', [
            this.createToggle('最新動態', 'owner_config.tabs.activity', config.tabs.activity),
            this.createToggle('預約管理', 'owner_config.tabs.booking', config.tabs.booking),
            this.createToggle('房況/庫存', 'owner_config.tabs.room_control', config.tabs.room_control),
            this.createToggle('核銷作業', 'owner_config.tabs.redeem', config.tabs.redeem),
            this.createToggle('顧客列表', 'owner_config.tabs.customer', config.tabs.customer)
        ]);

        html += this.renderNestedSection('預約列表設定', [
            this.createDisplayOnly('新增模式', config.booking.mode === 'inherit' ? '繼承客戶端設定' : config.booking.mode),
            config.booking.list_columns.checkout !== undefined ? 
                this.createToggle('顯示退房日期', 'owner_config.booking.list_columns.checkout', config.booking.list_columns.checkout) : '',
            config.booking.list_columns.timeslot !== undefined ? 
                this.createToggle('顯示時段', 'owner_config.booking.list_columns.timeslot', config.booking.list_columns.timeslot) : ''
        ]);

        return html;
    },

    // 4. 用語設定
    renderTermsConfig() {
        const terms = this.state.currentConfig.terms;
        if (!terms) return '無相關設定';
        return this.renderNestedSection('名詞定義', [
            this.createInput('產品/房型 名稱', 'terms.PRODUCT_NAME', terms.PRODUCT_NAME),
            this.createInput('型錄頁面 標題', 'terms.PRODUCT_CATALOG_TITLE', terms.PRODUCT_CATALOG_TITLE),
            this.createInput('預約行為 名稱', 'terms.BOOKING_NAME', terms.BOOKING_NAME),
            this.createInput('預約頁面 標題', 'terms.BOOKING_PAGE_TITLE', terms.BOOKING_PAGE_TITLE),
        ]);
    },

    // --- UI 元件產生器 ---

    renderNestedSection(title, contentArray) {
        // 產生唯一的 ID
        const id = 'nest_' + Math.random().toString(36).substr(2, 9);
        const content = Array.isArray(contentArray) ? contentArray.join('') : contentArray;
        return `
            <div class="nested-accordion">
                <div class="nested-header" onclick="document.getElementById('${id}').classList.toggle('show'); this.querySelector('.icon').innerHTML = document.getElementById('${id}').classList.contains('show') ? '▼' : '▶';">
                    <span class="icon">▶</span> ${title}
                </div>
                <div class="nested-content" id="${id}">
                    ${content}
                </div>
            </div>
        `;
    },

    createInput(label, path, value) {
        return `
            <div class="form-group">
                <label>${label}</label>
                <input type="text" class="form-control" value="${value || ''}" onchange="systemSettings.updateValue('${path}', this.value)">
            </div>
        `;
    },

    createColorInput(label, path, value) {
         return `
            <div class="form-group">
                <label>${label}</label>
                <div style="display:flex; align-items:center;">
                    <input type="color" value="${value || '#000000'}" onchange="systemSettings.updateValue('${path}', this.value)" style="margin-right:10px;">
                    <input type="text" class="form-control" style="width:100px;" value="${value || ''}" onchange="systemSettings.updateValue('${path}', this.value)">
                </div>
            </div>
        `;
    },

    createToggle(label, path, checked) {
        return `
            <div class="form-group">
                <label>${label}</label>
                <label class="switch">
                    <input type="checkbox" ${checked ? 'checked' : ''} onchange="systemSettings.updateValue('${path}', this.checked)">
                    <span class="slider"></span>
                </label>
            </div>
        `;
    },

    createDisplayOnly(label, value) {
        return `
            <div class="form-group">
                <label>${label}</label>
                <span style="color:#666; font-family:monospace; background:#eee; padding:2px 6px; border-radius:4px;">${value}</span>
            </div>
        `;
    },

    // --- 事件處理 ---

    toggleAccordion(id) {
        const item = document.getElementById(id);
        const content = item.querySelector('.accordion-content');
        const header = item.querySelector('.accordion-header');
        
        // 簡單的 Toggle 邏輯
        if (content.classList.contains('show')) {
            content.classList.remove('show');
            header.classList.remove('active');
        } else {
            // 若要開啟手風琴效果 (開啟一個自動關閉其他)，可以在這裡處理
            content.classList.add('show');
            header.classList.add('active');
        }
    },

    bindEvents() {
        const select = document.getElementById('templateSelect');
        if (select) {
            select.addEventListener('change', (e) => {
                const key = e.target.value;
                if (confirm('切換樣板將會重置當前未儲存的設定，確定要切換嗎？')) {
                    this.state.activeTemplateKey = key;
                    // 重置 currentConfig 為所選樣板的預設值
                    this.state.currentConfig = JSON.parse(JSON.stringify(this.state.definitions[key]));
                    this.render(); // 重新渲染
                } else {
                    e.target.value = this.state.activeTemplateKey; // 還原選擇
                }
            });
        }
    },

    // 更新數值 (支援巢狀路徑字串 'client_config.global.brand_name')
    updateValue(path, value) {
        const keys = path.split(/[\.\[\]]+/).filter(k => k); // 分割路徑並移除空字串
        let target = this.state.currentConfig;
        
        for (let i = 0; i < keys.length - 1; i++) {
            // 如果遇到數字，說明是陣列索引
            const key = isNaN(keys[i]) ? keys[i] : parseInt(keys[i]);
            target = target[key];
        }
        
        const lastKey = keys[keys.length - 1];
        target[isNaN(lastKey) ? lastKey : parseInt(lastKey)] = value;
        
        console.log(`Updated [${path}] to:`, value);
        // 不需重新 render，因為 input 狀態已經改變，減少閃爍
    },

    async saveSettings() {
        // 這裡實作儲存邏輯
        const payload = {
            template_id: this.state.activeTemplateKey,
            settings: this.state.currentConfig
        };
        
        console.log('Saving settings...', payload);
        
        try {
            // 模擬 API 呼叫
            // const res = await fetch('/api/admin/settings', { 
            //    method: 'POST', 
            //    headers: {'Content-Type': 'application/json'},
            //    body: JSON.stringify(payload) 
            // });
            
            // 模擬成功
            await new Promise(r => setTimeout(r, 500));
            alert('設定已成功儲存並套用！');
            
        } catch (e) {
            console.error(e);
            alert('儲存失敗');
        }
    }
};

// 啟動模組
systemSettings.init();