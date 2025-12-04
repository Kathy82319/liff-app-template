// public/admin/modules/systemSettings.js (v13.0 - DB-Driven Configuration)
import { api } from '../api.js';
import { ui } from '../ui.js';

let allSettings = [];
let templateDefinitions = {}; // 這裡將會存放從資料庫讀取的完整 JSON
let activeTemplateKey = '';   // 當前選中的樣板 Key

// ==========================================================================
// 1. 渲染邏輯 (UI Generation)
// ==========================================================================

// 通用：建立設定列 (Row)
function createRow(label, hint, inputElement) {
    const row = document.createElement('div');
    row.className = 'setting-row';
    const labelDiv = document.createElement('div');
    labelDiv.className = 'setting-label';
    labelDiv.innerHTML = `${label}${hint ? `<small>${hint}</small>` : ''}`;
    row.append(labelDiv, inputElement);
    return row;
}

// 通用：建立開關 (Toggle)
function createToggle(keyPath, checked) {
    const wrapper = document.createElement('div');
    const id = `toggle-${Math.random().toString(36).substr(2, 9)}`;
    wrapper.innerHTML = `<label class="switch" for="${id}"><input type="checkbox" id="${id}" ${checked ? 'checked' : ''}><span class="slider"></span></label>`;
    const input = wrapper.querySelector('input');
    input.dataset.keyPath = keyPath; // 使用完整路徑綁定資料，例如 "client_config.booking.enable_time_slots"
    return wrapper;
}

// 通用：建立輸入框 (Input)
function createInput(keyPath, value, type = 'text') {
    const wrapper = document.createElement('div');
    wrapper.innerHTML = `<input type="${type}" value="${value || ''}" style="width: 100%;">`;
    const input = wrapper.querySelector('input');
    input.dataset.keyPath = keyPath;
    return wrapper;
}

// 通用：建立下拉選單 (Select)
function createSelect(keyPath, value, options) {
    const wrapper = document.createElement('div');
    const select = document.createElement('select');
    select.dataset.keyPath = keyPath;
    
    options.forEach(opt => {
        select.add(new Option(opt.label, opt.value, false, opt.value === value));
    });
    wrapper.appendChild(select);
    return wrapper;
}

// 輔助：建立手風琴區塊
function createAccordion(title) {
    const item = document.createElement('div');
    item.className = 'accordion-item';
    item.innerHTML = `
        <div class="accordion-header"><h4>${title}</h4><span>▼</span></div>
        <div class="accordion-content open" style="padding: 15px;"></div>
    `;
    item.querySelector('.accordion-header').onclick = () => {
        item.querySelector('.accordion-content').classList.toggle('open');
    };
    return item.querySelector('.accordion-content');
}

// --------------------------------------------------------------------------
// 核心渲染：客戶端 (Client) 設定
// --------------------------------------------------------------------------
function renderClientSettings(config, container) {
    container.innerHTML = '';
    
    // --- 1. 全域設定 ---
    const globalGroup = createAccordion('全域設定 (Global)');
    globalGroup.appendChild(createRow('品牌名稱', '顯示於網頁標題', createInput('client_config.global.business_name', config.global?.business_name)));
    // globalGroup.appendChild(createRow('主色調', '(預留)', createInput('client_config.global.primary_color', config.global?.primary_color, 'color')));
    container.appendChild(globalGroup);

    // --- 2. 線上預約 (邏輯核心) ---
    const bookingGroup = createAccordion('線上預約 (Booking Logic)');
    const booking = config.booking || {};
    
    // 模式選擇 (連動控制)
    const modeSelect = createSelect('client_config.booking.mode', booking.mode, [
        { label: '民宿/旅宿模式 (日期區間)', value: 'range' },
        { label: '工作室/服務模式 (單一日期)', value: 'single' }
    ]);
    
    // 綁定事件：切換模式時顯示/隱藏相關設定
    modeSelect.querySelector('select').addEventListener('change', (e) => {
        updateBookingUIState(e.target.value);
    });
    
    bookingGroup.appendChild(createRow('預約核心模式', '決定日曆行為與計價邏輯', modeSelect));

    // 時段設定區塊
    const timeSlotDiv = document.createElement('div');
    timeSlotDiv.id = 'setting-block-timeslots';
    timeSlotDiv.style.cssText = 'background-color: #f8f9fa; padding: 10px; border-radius: 8px; margin-top: 10px; border: 1px solid #e9ecef;';
    
    timeSlotDiv.appendChild(createRow('啟用時段選擇', '是否讓顧客選擇具體時間', createToggle('client_config.booking.enable_time_slots', booking.enable_time_slots)));
    
    const tsConfig = booking.time_slot_config || { start: "09:00", end: "21:00", interval: 60 };
    timeSlotDiv.appendChild(createRow('每日開始時間', 'Format: HH:mm', createInput('client_config.booking.time_slot_config.start', tsConfig.start)));
    timeSlotDiv.appendChild(createRow('每日結束時間', 'Format: HH:mm', createInput('client_config.booking.time_slot_config.end', tsConfig.end)));
    timeSlotDiv.appendChild(createRow('時段間隔 (分鐘)', '例如: 30, 60', createInput('client_config.booking.time_slot_config.interval', tsConfig.interval, 'number')));
    
    bookingGroup.appendChild(timeSlotDiv);

    // 其他開關
    bookingGroup.appendChild(createRow('顯示「人數」選擇', '預設 1 人', createToggle('client_config.booking.enable_people_count', booking.enable_people_count)));
    bookingGroup.appendChild(createRow('顯示「數量」選擇', '預設 1 組', createToggle('client_config.booking.enable_quantity', booking.enable_quantity)));
    bookingGroup.appendChild(createRow('顯示「備註」欄位', '', createToggle('client_config.booking.enable_notes', booking.enable_notes)));
    bookingGroup.appendChild(createRow('啟用儲值金付款', '需先開啟會員儲值功能', createToggle('client_config.booking.enable_stored_value_payment', booking.enable_stored_value_payment)));

    container.appendChild(bookingGroup);

    // 初始化 UI 狀態 (根據當前值隱藏/顯示)
    // 這裡我們需要一個小延遲或直接呼叫，但在 render 過程中元素還沒上 DOM，所以我們直接操作元素的 style
    timeSlotDiv.style.display = (booking.mode === 'single') ? 'block' : 'none';

    // --- 3. 產品型錄 ---
    const productGroup = createAccordion('產品/服務型錄');
    const prod = config.products || {};
    productGroup.appendChild(createRow('頁面標題', '例如：精選房型、服務項目', createInput('client_config.products.page_title', prod.page_title)));
    productGroup.appendChild(createRow('顯示價格', '是否公開價格', createToggle('client_config.products.show_price', prod.show_price)));
    productGroup.appendChild(createRow('顯示庫存/房況', '是否顯示剩餘數量', createToggle('client_config.products.show_stock', prod.show_stock)));
    container.appendChild(productGroup);

    // --- 4. 會員中心 ---
    const profileGroup = createAccordion('會員中心 (Profile)');
    const prof = config.profile || {};
    profileGroup.appendChild(createRow('顯示等級 (Level)', '', createToggle('client_config.profile.show_level', prof.show_level)));
    profileGroup.appendChild(createRow('顯示點數 (Points)', '', createToggle('client_config.profile.show_points', prof.show_points)));
    profileGroup.appendChild(createRow('顯示會員方案 (Class)', '', createToggle('client_config.profile.show_class', prof.show_class)));
    profileGroup.appendChild(createRow('顯示儲值金餘額', '', createToggle('client_config.profile.show_stored_value', prof.show_stored_value)));
    profileGroup.appendChild(createRow('顯示方案優惠文字', '', createToggle('client_config.profile.show_perk', prof.show_perk)));
    profileGroup.appendChild(createRow('顯示會員 QR Code', '', createToggle('client_config.profile.show_qrcode', prof.show_qrcode)));
    
    profileGroup.appendChild(document.createElement('hr'));
    profileGroup.appendChild(createRow('「預約紀錄」按鈕名稱', '', createInput('client_config.profile.label_records', prof.label_records)));
    profileGroup.appendChild(createRow('「優惠券」按鈕名稱', '', createInput('client_config.profile.label_vouchers', prof.label_vouchers)));
    profileGroup.appendChild(createRow('「集點趣」按鈕名稱', '', createInput('client_config.profile.label_rally', prof.label_rally)));
    
    container.appendChild(profileGroup);
    
    // --- 5. 首頁 ---
    const homeGroup = createAccordion('首頁 (Home)');
    const home = config.home || {};
    homeGroup.appendChild(createRow('頁面標題', '例如：最新情報、活動公告', createInput('client_config.home.page_title', home.page_title)));
    homeGroup.appendChild(createRow('顯示「集點趣」懸浮按鈕', '', createToggle('client_config.home.show_rally_fab', home.show_rally_fab)));
    container.appendChild(homeGroup);
}

// 輔助：更新 UI 狀態 (連動邏輯)
function updateBookingUIState(mode) {
    const timeSlotBlock = document.getElementById('setting-block-timeslots');
    if (timeSlotBlock) {
        timeSlotBlock.style.display = (mode === 'single') ? 'block' : 'none';
    }
}

// --------------------------------------------------------------------------
// 核心渲染：商家後台 (Admin) 設定
// --------------------------------------------------------------------------
function renderAdminSettings(config, container) {
    container.innerHTML = '';

    // --- 1. 左側選單管理 ---
    const sidebarGroup = createAccordion('後台選單啟用 (Sidebar)');
    const sidebar = config.sidebar || {};
    const pages = [
        {k: 'dashboard', l: '儀表板'}, {k: 'users', l: '顧客管理'}, {k: 'inventory', l: '產品/服務'},
        {k: 'room-availability', l: '房量/庫存控管'}, {k: 'bookings', l: '訂單管理'}, {k: 'vouchers', l: '優惠券'},
        {k: 'rally', l: '集點活動'}, {k: 'news', l: '情報管理'}, {k: 'drafts', l: '訊息草稿'}, 
        {k: 'store-info', l: '店家資訊'}, {k: 'points', l: '點數發放'}, {k: 'reports', l: '財務報表'}
    ];
    
    const grid = document.createElement('div');
    grid.style.display = 'grid';
    grid.style.gridTemplateColumns = 'repeat(auto-fill, minmax(200px, 1fr))';
    grid.style.gap = '10px';
    
    pages.forEach(p => {
        // 這裡我們直接用 Toggle 控制 true/false，暫時不實作改名
        grid.appendChild(createRow(p.l, '', createToggle(`admin_config.sidebar.${p.k}`, sidebar[p.k] !== false)));
    });
    sidebarGroup.appendChild(grid);
    container.appendChild(sidebarGroup);

    // --- 2. 產品設定 ---
    const prodGroup = createAccordion('產品/服務 新增邏輯');
    const prod = config.products || {};
    
    prodGroup.appendChild(createRow('價格模式', '決定新增產品時的價格欄位', createSelect('admin_config.products.price_mode', prod.price_mode, [
        {label: '單一價格 (Simple)', value: 'simple'},
        {label: '平假日價格 (Complex - 民宿)', value: 'complex'}
    ])));
    
    prodGroup.appendChild(createRow('庫存模式', '決定庫存扣減邏輯', createSelect('admin_config.products.inventory_mode', prod.inventory_mode, [
        {label: '日期制房況 (Date Based - 民宿)', value: 'date_based'},
        {label: '數量制 (Quantity Based - 零售/工作室)', value: 'quantity'},
        {label: '無庫存 (None - 純展示)', value: 'none'}
    ])));
    
    prodGroup.appendChild(createRow('啟用圖片上傳功能', '', createToggle('admin_config.products.enable_image_upload', prod.enable_image_upload)));
    container.appendChild(prodGroup);
    
    // --- 3. 訂單列表設定 ---
    const bookGroup = createAccordion('訂單列表欄位');
    const book = config.bookings || {};
    bookGroup.appendChild(createRow('顯示「退房日期」', '工作室模式建議關閉', createToggle('admin_config.bookings.show_check_out', book.show_check_out)));
    bookGroup.appendChild(createRow('顯示「時段」', '民宿模式建議關閉', createToggle('admin_config.bookings.show_time_slot', book.show_time_slot)));
    container.appendChild(bookGroup);
    
    // --- 4. CRM 設定 ---
    const crmGroup = createAccordion('顧客管理 (CRM)');
    const crm = config.crm || {}; // 假設架構中有 crm 區塊
    crmGroup.appendChild(createRow('顯示「等級/點數」區塊', '', createToggle('admin_config.crm.show_level_points', crm.show_level_points !== false)));
    crmGroup.appendChild(createRow('顯示「儲值金」區塊', '', createToggle('admin_config.crm.show_stored_value', crm.show_stored_value !== false)));
    crmGroup.appendChild(createRow('顯示「優惠券」區塊', '', createToggle('admin_config.crm.show_vouchers', crm.show_vouchers !== false)));
    crmGroup.appendChild(createRow('顯示「集點進度」區塊', '', createToggle('admin_config.crm.show_rally', crm.show_rally !== false)));
    container.appendChild(crmGroup);
    
    // --- 5. 店家資訊設定 ---
    const storeGroup = createAccordion('店家資訊欄位');
    const store = config.store_info || {};
    storeGroup.appendChild(createRow('政策欄位 1 標題', '預設: 取消政策', createInput('admin_config.store_info.label_policy', store.label_policy || '取消政策')));
    storeGroup.appendChild(createRow('政策欄位 2 標題', '預設: 入住須知', createInput('admin_config.store_info.label_instructions', store.label_instructions || '入住須知')));
    container.appendChild(storeGroup);
}

// --------------------------------------------------------------------------
// 手機版後台 (Owner) 設定 (目前較簡單，預留擴充)
// --------------------------------------------------------------------------
function renderOwnerSettings(config, container) {
    container.innerHTML = '<p style="color:#666; padding:10px;">手機版後台將自動繼承「客戶端」與「商家後台」的相關邏輯設定。</p>';
}

// ==========================================================================
// 3. 資料處理與儲存 (Data Handling)
// ==========================================================================

// 從 DOM 讀取數據並更新 JSON
function updateConfigFromUI(originalConfig) {
    // 深拷貝一份 config，避免直接修改原始物件造成參照問題
    const newConfig = JSON.parse(JSON.stringify(originalConfig));
    
    // 遍歷所有有 data-key-path 的輸入項
    const inputs = document.querySelectorAll('[data-key-path]');
    
    inputs.forEach(input => {
        const path = input.dataset.keyPath.split('.'); // e.g. ["client_config", "booking", "mode"]
        let current = newConfig;
        
        // 尋找目標物件
        for (let i = 0; i < path.length - 1; i++) {
            if (!current[path[i]]) current[path[i]] = {};
            current = current[path[i]];
        }
        
        const lastKey = path[path.length - 1];
        let value;
        
        if (input.type === 'checkbox') {
            value = input.checked;
        } else if (input.type === 'number') {
            value = Number(input.value);
        } else {
            value = input.value;
        }
        
        current[lastKey] = value;
    });
    
    // 特殊邏輯處理 (Server-Side Logic Inheritance)
    // 雖然前端做了連動，但為了確保資料一致性，這裡可以做一些強制覆寫
    // 例如：如果 client 模式是 range，強制將 admin 的 inventory_mode 設為 date_based (視需求而定，目前先保持彈性)
    
    return newConfig;
}

async function handleSave() {
    const saveBtn = document.getElementById('save-settings-btn');
    saveBtn.disabled = true;
    saveBtn.textContent = '儲存中...';

    try {
        if (!activeTemplateKey || !templateDefinitions[activeTemplateKey]) {
            throw new Error("無法確認當前編輯的樣板");
        }

        // 1. 取得當前 UI 的設定值，更新到 templateDefinitions 大物件中
        const currentConfig = templateDefinitions[activeTemplateKey];
        const updatedConfig = updateConfigFromUI(currentConfig);
        templateDefinitions[activeTemplateKey] = updatedConfig;

        // 2. 準備 API Payload
        // 我們需要更新兩個設定：
        // (1) LOGIC_INDUSTRY_TEMPLATE_DEFINITIONS (整個大 JSON)
        // (2) LOGIC_ACTIVE_INDUSTRY_TEMPLATE (當前選中的 Key，雖然通常沒變，但為了保險一起送)
        const payload = [
            { 
                key: 'LOGIC_INDUSTRY_TEMPLATE_DEFINITIONS', 
                value: JSON.stringify(templateDefinitions), 
                type: 'json' 
            },
            {
                key: 'LOGIC_ACTIVE_INDUSTRY_TEMPLATE',
                value: activeTemplateKey,
                type: 'string'
            }
        ];

        await api.updateSettings(payload);
        
        ui.toast.success('系統設定已更新！');
        
        // 重新載入以確保畫面與資料同步
        await init(); 

    } catch (error) {
        console.error(error);
        ui.toast.error(`儲存失敗: ${error.message}`);
    } finally {
        saveBtn.disabled = false;
        saveBtn.textContent = '儲存並啟用';
    }
}

// ==========================================================================
// 4. 初始化 (Initialization)
// ==========================================================================

export const init = async () => {
    const page = document.getElementById('page-settings');
    if (!page) return;

    // 清空載入中提示，準備渲染
    const liffContainer = document.getElementById('liff-app-settings');
    const adminContainer = document.getElementById('admin-panel-settings');
    const ownerContainer = document.getElementById('owner-liff-settings');
    const selector = document.getElementById('template-selector');
    
    try {
        // 1. 從 API 獲取設定
        allSettings = await api.getSettings();
        
        // 2. 解析樣板定義 (Source of Truth)
        const definitionsItem = allSettings.find(i => i.key === 'LOGIC_INDUSTRY_TEMPLATE_DEFINITIONS');
        if (definitionsItem && definitionsItem.value) {
            try {
                templateDefinitions = (typeof definitionsItem.value === 'string') 
                    ? JSON.parse(definitionsItem.value) 
                    : definitionsItem.value;
            } catch (e) {
                console.error("解析樣板定義失敗", e);
                // 如果解析失敗，這裡可以考慮是否要有一個 Fallback，或是直接報錯
                // 為了安全起見，這裡不自動修復，以免覆蓋資料
                throw new Error("設定檔格式錯誤，請聯繫管理員。");
            }
        } else {
            // 如果資料庫是空的 (第一次初始化)，這裡需要處理
            // 這裡不應該發生，因為您說已經寫入資料庫了。
            // 但為了強健性，如果真的空的，顯示提示。
            throw new Error("找不到樣板定義資料，請確認資料庫初始化。");
        }

        // 3. 解析當前啟用樣板
        const activeItem = allSettings.find(i => i.key === 'LOGIC_ACTIVE_INDUSTRY_TEMPLATE');
        activeTemplateKey = activeItem ? activeItem.value : Object.keys(templateDefinitions)[0];

        // 4. 渲染選擇器
        selector.innerHTML = '';
        Object.keys(templateDefinitions).forEach(key => {
            const t = templateDefinitions[key];
            selector.add(new Option(t.name || key, key, false, key === activeTemplateKey));
        });

        // 5. 綁定選擇器事件
        selector.onchange = (e) => {
            activeTemplateKey = e.target.value;
            renderAll(templateDefinitions[activeTemplateKey]);
        };

        // 6. 初次渲染內容
        if (activeTemplateKey && templateDefinitions[activeTemplateKey]) {
            renderAll(templateDefinitions[activeTemplateKey]);
        }

        // 7. 綁定儲存按鈕 (只綁定一次)
        const form = document.getElementById('settings-form');
        if (!form.dataset.bound) {
            form.addEventListener('submit', (e) => {
                e.preventDefault();
                handleSave();
            });
            form.dataset.bound = 'true';
        }
        
        // 8. 綁定 Tab 切換
        const tabsContainer = page.querySelector('.settings-tabs');
        if (tabsContainer && !tabsContainer.dataset.bound) {
            tabsContainer.addEventListener('click', (e) => {
                if (e.target.classList.contains('settings-tab')) {
                    tabsContainer.querySelector('.active')?.classList.remove('active');
                    e.target.classList.add('active');
                    page.querySelectorAll('.settings-tab-content').forEach(el => el.classList.remove('active'));
                    document.getElementById(e.target.dataset.target)?.classList.add('active');
                }
            });
            tabsContainer.dataset.bound = 'true';
        }

    } catch (error) {
        console.error("Settings Init Error:", error);
        liffContainer.innerHTML = `<p style="color:red">載入失敗: ${error.message}</p>`;
    }

    function renderAll(config) {
        renderClientSettings(config.client_config || {}, liffContainer);
        renderAdminSettings(config.admin_config || {}, adminContainer);
        renderOwnerSettings(config.owner_config || {}, ownerContainer);
    }
};