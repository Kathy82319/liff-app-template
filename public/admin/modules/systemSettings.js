// public/admin/modules/systemSettings.js
import { api } from '../api.js';
import { ui } from '../ui.js';

const systemSettings = {
    state: {
        definitions: null,
        currentConfig: null,
        activeTemplateKey: '',
        systemActiveKey: ''
    },

    async init() {
        console.log('[SystemSettings] Initializing...');
        const container = document.getElementById('page-settings');
        if (!container) return;
        
        if (!document.getElementById('settings-dynamic-styles')) {
            this.injectStyles();
        }

        await this.loadData();
    },

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
            .sub-settings-box { background: #f8f9fa; padding: 15px; border-radius: 6px; margin-top: 10px; border: 1px solid #eee; }
            .sub-settings-title { margin: 0 0 10px 0; font-size: 0.95rem; color: var(--color-primary); border-bottom: 2px solid #e9ecef; padding-bottom: 5px; display: inline-block;}
            @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
        `;
        document.head.appendChild(style);
    },

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

            this.ensureDefaults();
            this.render();

        } catch (error) {
            console.error('Failed to load settings:', error);
            container.innerHTML = `<p style="color:red; text-align:center;">設定載入失敗: ${error.message}</p>`;
        }
    },

    // 【核心修正】自動資料遷移與預設值
    ensureDefaults() {
        const config = this.state.currentConfig;
        if (!config) return;

        if (!config.admin_config) config.admin_config = {};
        const ac = config.admin_config;

        // 1. Sidebar Visibility
        if (!ac.visible_modules) {
            ac.visible_modules = {
                dashboard: ac.dashboard?.enabled,
                users: ac.users?.enabled,
                products: ac.inventory?.enabled,
                bookings: ac.bookings?.enabled,
                news: ac.news?.enabled,
                store_info: ac.store_info?.enabled,
                finance: ac.others?.reports,
                coupons: ac.others?.vouchers,
                drafts: ac.others?.drafts
            };
        }

        // 2. Users (Migration Object -> Array)
        if (!ac.users) ac.users = { enabled: true };
        if (ac.users.columns && !Array.isArray(ac.users.columns) && typeof ac.users.columns === 'object') {
            const oldCols = ac.users.columns;
            const newCols = [];
            const labelMap = { real_name: '顧客姓名', phone: '電話', level: '等級', balance: '儲值金餘額', stored_value_balance: '儲值金餘額', current_exp: '目前點數', class: '會員方案' };
            Object.keys(oldCols).forEach(key => {
                newCols.push({ key: key === 'balance' ? 'stored_value_balance' : key, label: labelMap[key] || key, enabled: oldCols[key] });
            });
            ['current_exp', 'class'].forEach(key => { if (!newCols.find(c => c.key === key)) newCols.push({ key: key, label: labelMap[key], enabled: true }); });
            ac.users.columns = newCols;
        }
        if (!ac.users.columns) {
            ac.users.columns = [
                { key: 'line_display_name', label: '顧客姓名', enabled: true },
                { key: 'phone', label: '電話', enabled: true },
                { key: 'level', label: '等級', enabled: true },
                { key: 'current_exp', label: '目前點數', enabled: true },
                { key: 'stored_value_balance', label: '儲值金餘額', enabled: true },
                { key: 'class', label: '會員方案', enabled: true }
            ];
        }
        if (!ac.users.crm_view) ac.users.crm_view = { show_stored_value: true, show_vouchers: true, show_rally: true, show_tags: true };

        // 3. News (News 自動移除 views)
        if (!ac.news) ac.news = { enabled: true };
        if (!ac.news.columns) {
            ac.news.columns = [
                { key: 'title', label: '標題', enabled: true },
                { key: 'category', label: '分類', enabled: true },
                { key: 'published_date', label: '發布日期', enabled: true }
            ];
        } else if (Array.isArray(ac.news.columns)) {
            ac.news.columns = ac.news.columns.filter(c => c.key !== 'views');
        }

        // 4. Drafts (核心修正：移除 subject 與 last_updated，只保留 title)
        if (!ac.drafts) ac.drafts = { enabled: true };
        
        // 定義我們希望的「乾淨」欄位
        const cleanDraftColumns = [{ key: 'title', label: '標題', enabled: true }];

        if (!ac.drafts.columns) {
            // 如果完全沒設定，直接用乾淨版
            ac.drafts.columns = cleanDraftColumns;
        } else if (Array.isArray(ac.drafts.columns)) {
            // 如果已經有設定 (可能包含上次儲存的 subject/last_updated)，則執行過濾
            const unwanted = ['subject', 'last_updated'];
            const hasUnwanted = ac.drafts.columns.some(c => unwanted.includes(c.key));
            
            if (hasUnwanted) {
                console.log("[SystemSettings] Auto-removing unwanted Drafts columns...");
                ac.drafts.columns = ac.drafts.columns.filter(c => !unwanted.includes(c.key));
            }
        }
        // 確保 others.drafts 開關存在
        if (!ac.others) ac.others = {};
        if (ac.others.drafts === undefined) ac.others.drafts = true;

        // 5. Points
        if (!ac.points) ac.points = { enabled: true };
        if (!ac.points.columns) {
             ac.points.columns = [
                { key: 'created_at', label: '日期', enabled: true },
                { key: 'user_info', label: '顧客資訊', enabled: true },
                { key: 'reason', label: '原因', enabled: true },
                { key: 'exp_added', label: '點數變動', enabled: true }
             ];
        }
    },

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
                        點擊下方「儲存並套用」可修復遺失的欄位設定。
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

    renderClientConfig() {
        // (與之前相同，省略以節省篇幅，請保留原有的 Client Config 內容)
        const config = this.state.currentConfig?.client_config;
        if (!config) return '';
        let content = '';
        content += this.buildSettingRow('品牌名稱', this.buildInput('client_config.global.brand_name', config.global.brand_name));
        content += this.buildSettingRow('主色調 (Hex)', this.buildColorInput('client_config.global.primary_color', config.global.primary_color));
        let bookingContent = '';
        bookingContent += this.buildSettingRow('預約模式 (Mode)', this.buildSelect('client_config.booking.mode', config.booking.mode, [{ value: 'range', label: '民宿/區間 (Count Nights)' }, { value: 'studio', label: '工作室/單日 (Single Date)' }]));
        if (config.booking.mode === 'studio') {
             const studioSettings = config.booking.studio_settings || {};
             bookingContent += `<div class="sub-settings-box"><h5 class="sub-settings-title">🕐 工作室時段設定</h5>` + this.buildSettingRow('啟用時段選擇', this.buildToggle('client_config.booking.studio_settings.enable_time_slots', studioSettings.enable_time_slots)) + `</div>`;
        }
        content += this.buildNestedSection('線上預約 (Booking)', bookingContent);
        // ... (其他 Client Config 請保留)
        let prodContent = this.buildSettingRow('頁面標題', this.buildInput('client_config.products.title', config.products.title));
        content += this.buildNestedSection('產品型錄 (Products)', prodContent);
        return this.buildAccordionItem('clientConfig', '客戶端 (LIFF App) 設定', content);
    },

    renderAdminConfig() {
        const config = this.state.currentConfig?.admin_config;
        if (!config) return '';

        let content = '';
        const ac = config; 
        const others = ac.others || {}; 

        let sidebarContent = '';
        sidebarContent += this.buildSettingRow('儀表板', this.buildToggle('admin_config.dashboard.enabled', ac.dashboard?.enabled));
        sidebarContent += this.buildSettingRow('顧客管理', this.buildToggle('admin_config.users.enabled', ac.users?.enabled));
        sidebarContent += this.buildSettingRow('產品/服務管理', this.buildToggle('admin_config.inventory.enabled', ac.inventory?.enabled));
        sidebarContent += this.buildSettingRow('訂單管理', this.buildToggle('admin_config.bookings.enabled', ac.bookings?.enabled));
        sidebarContent += this.buildSettingRow('最新消息', this.buildToggle('admin_config.news.enabled', ac.news?.enabled));
        sidebarContent += this.buildSettingRow('店家資訊', this.buildToggle('admin_config.store_info.enabled', ac.store_info?.enabled));
        sidebarContent += this.buildSettingRow('財務報表', this.buildToggle('admin_config.others.reports', others.reports));
        sidebarContent += this.buildSettingRow('優惠券/行銷', this.buildToggle('admin_config.others.vouchers', others.vouchers));
        sidebarContent += this.buildSettingRow('訊息草稿', this.buildToggle('admin_config.others.drafts', others.drafts));
        sidebarContent += this.buildSettingRow('點數中心', this.buildToggle('admin_config.points.enabled', ac.points?.enabled));
        
        content += this.buildNestedSection('頂部選單顯示 (Navigation)', sidebarContent);

        // Dashboard
        const widgets = config.dashboard?.widgets || {};
        let dashContent = this.buildSettingRow('今日訂單/訪客', this.buildToggle('admin_config.dashboard.widgets.today_orders', widgets.today_orders));
        content += this.buildNestedSection('儀表板設定 (Dashboard)', dashContent);

        // Users
        let usersContent = `<div style="margin-top:10px;"><label class="setting-label">顧客列表欄位：</label>` + this.buildColumnSorter('admin_config.users.columns', config.users?.columns) + `</div>`;
        content += this.buildNestedSection('顧客管理設定 (Users)', usersContent);

        // Products
        let invContent = `<div style="margin-top:10px;"><label class="setting-label">產品列表欄位：</label>` + this.buildColumnSorter('admin_config.inventory.columns', config.inventory?.columns) + `</div>`;
        content += this.buildNestedSection('產品管理設定 (Products)', invContent);

        // Bookings
        let bookingContent = `<div style="margin-top:10px;"><label class="setting-label">訂單列表欄位：</label>` + this.buildColumnSorter('admin_config.bookings.columns', config.bookings?.columns) + `</div>`;
        content += this.buildNestedSection('訂單管理設定 (Bookings)', bookingContent);
        
        // News
        let newsContent = `<div style="margin-top:10px;"><label class="setting-label">情報列表欄位：</label>`;
        newsContent += this.buildColumnSorter('admin_config.news.columns', config.news?.columns);
        newsContent += `</div>`;
        content += this.buildNestedSection('情報管理設定 (News)', newsContent);

        // Drafts (核心修正：加入草稿欄位設定)
        let draftsContent = `<div style="margin-top:10px;"><label class="setting-label">草稿列表欄位：</label>`;
        draftsContent += this.buildColumnSorter('admin_config.drafts.columns', config.drafts?.columns);
        draftsContent += `</div>`;
        content += this.buildNestedSection('訊息草稿設定 (Drafts)', draftsContent);

        // Points
        let pointsContent = `<div style="margin-top:10px;"><label class="setting-label">點數紀錄列表欄位：</label>`;
        pointsContent += this.buildColumnSorter('admin_config.points.columns', config.points?.columns);
        pointsContent += `</div>`;
        content += this.buildNestedSection('點數中心設定 (Points)', pointsContent);

        return this.buildAccordionItem('adminConfig', '商家後台 (Admin Panel) 設定', content);
    },

    renderOwnerConfig() {
        const config = this.state.currentConfig?.owner_config;
        if (!config) return '';
        let content = this.buildSettingRow('最新動態', this.buildToggle('owner_config.tabs.activity', config.tabs.activity));
        return this.buildAccordionItem('ownerConfig', '手機版後台 (Owner LIFF) 設定', content);
    },

    renderTermsConfig() {
        const terms = this.state.currentConfig?.terms || {};
        let content = this.buildSettingRow('產品/服務 名詞', this.buildInput('terms.PRODUCT_NAME', terms.PRODUCT_NAME));
        return this.buildAccordionItem('termsConfig', '系統用語設定 (Terms)', content);
    },

    buildAccordionItem(id, title, contentHtml) {
        return `<div class="accordion-item" id="${id}"><div class="accordion-header" onclick="this.parentElement.querySelector('.accordion-content').classList.toggle('show')"><span>${title}</span><span>▼</span></div><div class="accordion-content">${contentHtml}</div></div>`;
    },
    buildNestedSection(title, content) {
        const id = 'nest_' + Math.random().toString(36).substr(2, 9);
        return `<div class="nested-section"><div class="nested-header" onclick="document.getElementById('${id}').classList.toggle('show')"><span>${title}</span><span>▼</span></div><div class="nested-content" id="${id}">${content}</div></div>`;
    },
    buildSettingRow(label, inputHtml, desc = '') {
        return `<div class="setting-row"><div><div class="setting-label">${label}</div>${desc ? `<span class="setting-desc">${desc}</span>` : ''}</div><div>${inputHtml}</div></div>`;
    },
    buildInput(path, value, type = 'text') {
        return `<input type="${type}" class="form-control" value="${(value === null || value === undefined) ? '' : value}" onchange="systemSettings.updateValue('${path}', this.value)">`;
    },
    buildColorInput(path, value) {
        return `<div style="display:flex; align-items:center; gap:10px;"><input type="color" value="${value || '#000000'}" onchange="this.nextElementSibling.value = this.value; systemSettings.updateValue('${path}', this.value)"><input type="text" class="form-control" style="width:100px;" value="${value || '#000000'}" onchange="this.previousElementSibling.value = this.value; systemSettings.updateValue('${path}', this.value)"></div>`;
    },
    buildToggle(path, checked) {
        return `<label class="switch"><input type="checkbox" ${checked ? 'checked' : ''} onchange="systemSettings.updateValue('${path}', this.checked)"><span class="slider"></span></label>`;
    },
    buildSelect(path, value, options) {
        const optsHtml = options.map(opt => `<option value="${opt.value}" ${value === opt.value ? 'selected' : ''}>${opt.label}</option>`).join('');
        return `<select class="form-control" onchange="systemSettings.updateValue('${path}', this.value)">${optsHtml}</select>`;
    },
    buildColumnSorter(path, columns) {
        if (!Array.isArray(columns)) return '<p style="color:red; font-size: 0.9em;">[自動修復] 資料格式異常，請點擊下方的「儲存」按鈕以自動修復此問題。</p>';
        let html = `<ul class="sortable-list" data-path="${path}">`;
        columns.forEach((col, index) => {
            html += `<li class="sortable-item" data-index="${index}"><span class="sortable-handle">⠿</span><input type="checkbox" ${col.enabled ? 'checked' : ''} onchange="systemSettings.updateColumn('${path}', ${index}, 'enabled', this.checked)"><span style="font-family:monospace; color:#666;">${col.key}</span><input type="text" class="form-control" value="${col.label}" placeholder="標題" onchange="systemSettings.updateColumn('${path}', ${index}, 'label', this.value)"></li>`;
        });
        html += `</ul>`;
        return html;
    },

    bindEvents() {
        const select = document.getElementById('settings-template-select');
        if (select) {
            select.addEventListener('change', (e) => {
                if (confirm('切換樣板將遺失未儲存的變更，確定嗎？')) {
                    this.state.activeTemplateKey = e.target.value;
                    this.state.currentConfig = JSON.parse(JSON.stringify(this.state.definitions[this.state.activeTemplateKey]));
                    this.ensureDefaults(); 
                    this.render(); 
                } else {
                    e.target.value = this.state.activeTemplateKey;
                }
            });
        }
        document.getElementById('settings-reload-btn')?.addEventListener('click', () => this.loadData());
        document.getElementById('settings-save-btn')?.addEventListener('click', () => this.saveSettings());
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

    updateValue(path, value) {
        document.getElementById('settings-unsaved-indicator').style.display = 'inline';
        const keys = path.split(/[\.\[\]]+/).filter(k => k);
        let target = this.state.currentConfig;
        for (let i = 0; i < keys.length - 1; i++) {
            if (!target[keys[i]]) target[keys[i]] = {}; 
            target = target[keys[i]];
        }
        target[keys[keys.length - 1]] = value;
        if (path === 'client_config.booking.mode') this.render();
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
            const current = this.state.currentConfig;
            // 強制同步 visible_modules
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
            this.state.definitions[this.state.activeTemplateKey] = current;
            const settingsToUpdate = [
                { key: 'LOGIC_INDUSTRY_TEMPLATE_DEFINITIONS', value: JSON.stringify(this.state.definitions), type: 'json' },
                { key: 'LOGIC_ACTIVE_INDUSTRY_TEMPLATE', value: this.state.activeTemplateKey, type: 'string' },
                { key: 'active_template_id', value: this.state.activeTemplateKey, type: 'string' }
            ];
            if (current.client_config) settingsToUpdate.push({ key: 'client_config', value: JSON.stringify(current.client_config), type: 'json' });
            if (current.admin_config) settingsToUpdate.push({ key: 'admin_config', value: JSON.stringify(current.admin_config), type: 'json' });
            if (current.owner_config) settingsToUpdate.push({ key: 'owner_config', value: JSON.stringify(current.owner_config), type: 'json' });
            if (current.terms) settingsToUpdate.push({ key: 'terms_config', value: JSON.stringify(current.terms), type: 'json' });

            await api.updateSettings(settingsToUpdate);
            alert('設定已儲存成功！\n資料結構已修復，系統將重新整理以套用變更。');
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