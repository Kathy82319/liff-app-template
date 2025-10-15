// public/admin/modules/systemSettings.js (修改後)
import { api } from '../api.js';
import { ui } from '../ui.js';

let allSettings = []; // 快取從 API 獲取的所有原始設定
let templateDefinitions = {}; // 快取解析後的樣板定義

// 渲染指定樣板的設定介面 (此為後續步驟的預留函式)
function renderTemplateSettings(templateKey) {
    const template = templateDefinitions[templateKey];
    if (!template) {
        console.error(`找不到樣板: ${templateKey}`);
        return;
    }
    console.log(`正在為您渲染 "${template.name}" 的設定介面...`);
    // 未來的步驟將在此處添加渲染摺疊區塊、示意圖和輸入框的邏輯
    document.getElementById('liff-app-settings').innerHTML = `<p>這裡是 "${template.name}" 的客戶端設定區塊。</p>`;
    document.getElementById('admin-panel-settings').innerHTML = `<p>這裡是 "${template.name}" 的後台設定區塊。</p>`;
}


// 綁定所有事件監聽器
function setupEventListeners() {
    const page = document.getElementById('page-settings');
    if (!page || page.dataset.initialized) return;

    const templateSelector = document.getElementById('template-selector');
    const saveButton = document.getElementById('save-settings-btn');
    const tabsContainer = document.querySelector('.settings-tabs');

    // 監聽樣板選擇器的變更
    templateSelector.addEventListener('change', () => {
        const selectedTemplateKey = templateSelector.value;
        renderTemplateSettings(selectedTemplateKey);
    });

    // 監聽前後台分頁的切換
    tabsContainer.addEventListener('click', (e) => {
        if (e.target.matches('.settings-tab')) {
            // 移除所有分頁和內容的 active class
            tabsContainer.querySelector('.active')?.classList.remove('active');
            document.querySelector('.settings-tab-content.active')?.classList.remove('active');
            
            // 為被點擊的分頁和對應內容加上 active class
            e.target.classList.add('active');
            const targetContentId = e.target.dataset.target;
            document.getElementById(targetContentId)?.classList.add('active');
        }
    });

    // 監聽儲存按鈕 (此為後續步驟的預留功能)
    saveButton.addEventListener('click', async () => {
        ui.toast.info('儲存功能將在後續步驟中實作。');
        // 未來的步驟將在此處添加收集所有設定並呼叫 API 的邏輯
    });

    page.dataset.initialized = 'true';
}

// 模組初始化函式
export const init = async () => {
    try {
        // 從全域設定檔中獲取樣板定義
        templateDefinitions = window.CONFIG?.LOGIC?.INDUSTRY_TEMPLATE_DEFINITIONS || {};
        
        if (Object.keys(templateDefinitions).length === 0) {
            throw new Error("在全域設定檔中找不到任何商業樣板定義。");
        }

        // 填充樣板選擇器下拉選單
        const templateSelector = document.getElementById('template-selector');
        templateSelector.innerHTML = '';
        for (const key in templateDefinitions) {
            const option = new Option(templateDefinitions[key].name, key);
            templateSelector.add(option);
        }
        
        // 渲染第一個樣板的設定（作為預設顯示）
        const initialTemplateKey = templateSelector.value;
        if (initialTemplateKey) {
            renderTemplateSettings(initialTemplateKey);
        }

        // 綁定所有互動事件
        setupEventListeners();

    } catch (error) {
        console.error('初始化系統設定頁面失敗:', error);
        document.getElementById('page-settings').innerHTML = `<p style="color:red;">讀取設定失敗: ${error.message}</p>`;
    }
};