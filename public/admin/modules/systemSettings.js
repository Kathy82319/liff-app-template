// public/admin/modules/systemSettings.js (v12.0 - 藍圖驅動版)
import { api } from '../api.js';
import { ui } from '../ui.js';

let templateDefinitions = {};
let activeTemplateKey = '';
let currentTemplateData = null; // 當前正在編輯的樣板資料副本

// --------------------------------------------------------
// 1. UI 生成核心 (Form Builder)
// --------------------------------------------------------

/**
 * 建立開關 (Toggle)
 */
function createToggle(label, checked, onChange) {
    const wrapper = document.createElement('div');
    wrapper.className = 'setting-row';
    wrapper.innerHTML = `<div class="setting-label">${label}</div>`;
    
    const switchLabel = document.createElement('label');
    switchLabel.className = 'switch';
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.checked = checked;
    input.addEventListener('change', (e) => onChange(e.target.checked));
    
    const slider = document.createElement('span');
    slider.className = 'slider';
    
    switchLabel.appendChild(input);
    switchLabel.appendChild(slider);
    wrapper.appendChild(switchLabel);
    return wrapper;
}

/**
 * 建立輸入框 (Text Input)
 */
function createInput(label, value, onChange, placeholder = '') {
    const wrapper = document.createElement('div');
    wrapper.className = 'setting-row';
    wrapper.innerHTML = `<div class="setting-label">${label}</div>`;
    
    const input = document.createElement('input');
    input.type = 'text';
    input.value = value || '';
    input.placeholder = placeholder;
    input.addEventListener('input', (e) => onChange(e.target.value));
    
    wrapper.appendChild(input);
    return wrapper;
}

/**
 * 建立下拉選單 (Select)
 */
function createSelect(label, options, value, onChange) {
    const wrapper = document.createElement('div');
    wrapper.className = 'setting-row';
    wrapper.innerHTML = `<div class="setting-label">${label}</div>`;
    
    const select = document.createElement('select');
    options.forEach(opt => {
        const option = new Option(opt.label, opt.value);
        select.add(option);
    });
    select.value = value;
    select.addEventListener('change', (e) => onChange(e.target.value));
    
    wrapper.appendChild(select);
    return wrapper;
}

// --------------------------------------------------------
// 2. 各區塊渲染邏輯
// --------------------------------------------------------

// A. 客戶端設定 (Client)
function renderClientSettings(config, container) {
    container.innerHTML = '';
    
    // 1. 線上預約 (Booking)
    const bookingDiv = document.createElement('div');
    bookingDiv.className = 'setting-group';
    bookingDiv.innerHTML = `<h4>📅 線上預約 (Booking)</h4>`;
    
    // 模式選擇
    bookingDiv.appendChild(createSelect('核心模式', [
        { label: '民宿 (日期區間)', value: 'guesthouse' },
        { label: '工作室 (單一日期)', value: 'studio' }
    ], config.booking.mode, (val) => {
        config.booking.mode = val;
        renderClientSettings(config, container); // 重繪以更新連動欄位
    }));

    // 根據模式顯示不同細項
    if (config.booking.mode === 'studio') {
        const studio = config.booking.studio_settings || {};
        bookingDiv.appendChild(createToggle('啟用時段選擇', studio.enable_time_slots, (val) => studio.enable_time_slots = val));
        
        // 時段細節 (如果啟用)
        if (studio.enable_time_slots) {
            const timeConfig = studio.time_slot_config || { start: "10:00", end: "20:00", interval: 60 };
            const timeDiv = document.createElement('div');
            timeDiv.style.cssText = "padding: 10px; background: #f9f9f9; border-radius: 8px; margin-bottom: 10px;";
            timeDiv.appendChild(createInput('開始時間 (HH:mm)', timeConfig.start, (v) => timeConfig.start = v));
            timeDiv.appendChild(createInput('結束時間 (HH:mm)', timeConfig.end, (v) => timeConfig.end = v));
            timeDiv.appendChild(createInput('間隔 (分鐘)', timeConfig.interval, (v) => timeConfig.interval = Number(v)));
            bookingDiv.appendChild(timeDiv);
            studio.time_slot_config = timeConfig; // 回寫
        }
        config.booking.studio_settings = studio;
    } else {
        const gh = config.booking.guesthouse_settings || {};
        bookingDiv.appendChild(createToggle('顯示「計算晚數」', gh.show_night_calc, (val) => gh.show_night_calc = val));
        config.booking.guesthouse_settings = gh;
    }

    // 表單欄位開關
    const fields = config.booking.field_toggles || {};
    bookingDiv.appendChild(createToggle('顯示「人數」選擇器', fields.people, (v) => fields.people = v));
    bookingDiv.appendChild(createToggle('顯示「數量」選擇器', fields.quantity, (v) => fields.quantity = v));
    bookingDiv.appendChild(createToggle('顯示「備註」欄位', fields.notes, (v) => fields.notes = v));
    config.booking.field_toggles = fields;

    container.appendChild(bookingDiv);

    // 2. 產品型錄 (Products)
    const prodDiv = document.createElement('div');
    prodDiv.className = 'setting-group';
    prodDiv.innerHTML = `<h4>🛍️ 產品/服務型錄</h4>`;
    prodDiv.appendChild(createInput('頁面標題', config.products.title, (v) => config.products.title = v));
    prodDiv.appendChild(createToggle('顯示價格', config.products.show_price, (v) => config.products.show_price = v));
    prodDiv.appendChild(createToggle('顯示庫存/房況', config.products.show_stock, (v) => config.products.show_stock = v));
    prodDiv.appendChild(createSelect('檢視模式', [
        { label: '網格 (Grid)', value: 'grid' },
        { label: '列表 (List)', value: 'list' }
    ], config.products.view_mode, (v) => config.products.view_mode = v));
    container.appendChild(prodDiv);

    // 3. 會員中心 (Profile)
    const profileDiv = document.createElement('div');
    profileDiv.className = 'setting-group';
    profileDiv.innerHTML = `<h4>👤 會員中心</h4>`;
    
    const info = config.profile.info_toggles || {};
    profileDiv.appendChild(createToggle('顯示等級', info.level, (v) => info.level = v));
    profileDiv.appendChild(createToggle('顯示點數', info.points, (v) => info.points = v));
    profileDiv.appendChild(createToggle('顯示儲值金', info.balance, (v) => info.balance = v));
    config.profile.info_toggles = info;

    const btns = config.profile.btn_toggles || {};
    profileDiv.appendChild(createToggle('顯示「我的優惠券」', btns.vouchers, (v) => btns.vouchers = v));
    profileDiv.appendChild(createToggle('顯示「集點趣」', btns.rally, (v) => btns.rally = v));
    config.profile.btn_toggles = btns;
    
    container.appendChild(profileDiv);
}

// B. 商家後台設定 (Admin)
function renderAdminSettings(config, container) {
    container.innerHTML = '';

    // 1. 頁面開關
    const pageDiv = document.createElement('div');
    pageDiv.className = 'setting-group';
    pageDiv.innerHTML = `<h4>🖥️ 後台頁面啟用 (Sidebar)</h4>`;
    
    const pages = {
        'dashboard': '儀表板',
        'users': '顧客管理',
        'inventory': '產品管理',
        'room_control': '房量控管',
        'bookings': '訂單管理',
        'news': '資訊管理',
        'store_info': '店家資訊'
    };

    Object.entries(pages).forEach(([key, label]) => {
        if (!config[key]) config[key] = { enabled: true };
        pageDiv.appendChild(createToggle(label, config[key].enabled, (v) => config[key].enabled = v));
    });
    
    // 2. 產品表單設定
    const invConfig = config.inventory?.form_settings || {};
    const invDiv = document.createElement('div');
    invDiv.className = 'setting-group';
    invDiv.innerHTML = `<h4>📦 產品表單設定</h4>`;
    invDiv.appendChild(createSelect('價格模式', [
        { label: '單一價格', value: 'simple' },
        { label: '平假日價格', value: 'complex' }
    ], invConfig.price_mode, (v) => invConfig.price_mode = v));
    
    invDiv.appendChild(createSelect('庫存模式', [
        { label: '數量制', value: 'quantity' },
        { label: '日期制 (房況)', value: 'date_based' },
        { label: '不管理', value: 'none' }
    ], invConfig.stock_mode, (v) => invConfig.stock_mode = v));
    
    config.inventory.form_settings = invConfig;
    pageDiv.appendChild(invDiv);

    container.appendChild(pageDiv);
}

// --------------------------------------------------------
// 3. 主流程與事件
// --------------------------------------------------------

function renderAllSettings() {
    if (!currentTemplateData) return;

    // 渲染 Client 區塊
    const clientContainer = document.getElementById('liff-app-settings');
    renderClientSettings(currentTemplateData.client_config, clientContainer);

    // 渲染 Admin 區塊
    const adminContainer = document.getElementById('admin-panel-settings');
    renderAdminSettings(currentTemplateData.admin_config, adminContainer);
    
    // (Owner 區塊暫略，邏輯雷同)
}

async function handleSave() {
    const btn = document.getElementById('save-settings-btn');
    btn.disabled = true;
    btn.textContent = '儲存中...';

    try {
        // 更新全域變數中的該樣板資料
        templateDefinitions[activeTemplateKey] = currentTemplateData;

        // 準備寫入資料庫
        const payload = [
            {
                key: 'LOGIC_INDUSTRY_TEMPLATE_DEFINITIONS',
                value: JSON.stringify(templateDefinitions),
                type: 'json'
            },
            {
                key: 'LOGIC_ACTIVE_INDUSTRY_TEMPLATE',
                value: activeTemplateKey
            }
        ];

        await api.updateSettings(payload);
        ui.toast.success('設定已更新！請重新整理頁面以套用變更。');
        
        // 建議重整
        if(await ui.confirm("設定已儲存。建議重新整理以確保所有模組讀取到最新設定。")) {
            window.location.reload();
        }

    } catch (e) {
        ui.toast.error('儲存失敗: ' + e.message);
    } finally {
        btn.disabled = false;
        btn.textContent = '儲存並啟用';
    }
}

export const init = async () => {
    const page = document.getElementById('page-settings');
    if (!page) return;

    // 1. 載入設定
    try {
        const settings = await api.getSettings();
        const defs = settings.find(s => s.key === 'LOGIC_INDUSTRY_TEMPLATE_DEFINITIONS');
        const active = settings.find(s => s.key === 'LOGIC_ACTIVE_INDUSTRY_TEMPLATE');

        if (defs && defs.value) {
            templateDefinitions = JSON.parse(defs.value);
        }
        if (active) {
            activeTemplateKey = active.value;
        }

        // 2. 填充樣板選擇器
        const selector = document.getElementById('template-selector');
        selector.innerHTML = '';
        Object.keys(templateDefinitions).forEach(key => {
            const t = templateDefinitions[key];
            selector.add(new Option(t.name || key, key));
        });
        selector.value = activeTemplateKey;

        // 3. 載入當前樣板資料到記憶體
        currentTemplateData = JSON.parse(JSON.stringify(templateDefinitions[activeTemplateKey]));
        renderAllSettings();

        // 4. 綁定切換事件
        selector.addEventListener('change', (e) => {
            activeTemplateKey = e.target.value;
            // 切換時，重新深拷貝一份資料
            currentTemplateData = JSON.parse(JSON.stringify(templateDefinitions[activeTemplateKey]));
            renderAllSettings();
        });

        // 5. 綁定儲存
        document.getElementById('settings-form').addEventListener('submit', (e) => {
            e.preventDefault();
            handleSave();
        });

    } catch (e) {
        console.error("Settings init failed:", e);
        page.innerHTML = `<p style="color:red">載入失敗: ${e.message}</p>`;
    }
};