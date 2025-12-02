// public/owner/state.js

export const state = {
    // --- 系統基礎 ---
    myLiffId: "",
    userId: null,
    currentTemplate: null,
    
    // --- 設定與快取 ---
    allMessageDrafts: [],
    allProducts: [], // 產品列表
    
    // --- UI 狀態 ---
    currentSelectedDate: new Date(),
    currentHistoryState: { modal: null },
    
    // --- 編輯對象暫存 ---
    currentEditingProfile: null, // 正在編輯的顧客資料
    currentOpUser: null,         // 現場作業目前選中的顧客 ID
    
    // --- 外部套件實例 ---
    flatpickrInstance: null,     // 預約日曆實例
    rcDateRangePicker: null,     // 控房日期選擇器實例
    html5QrCodeScanner: null,    // 掃碼器實例
    
    // --- 控房管理資料 ---
    currentRoomInventoryData: {},
    rcDisplayedDates: [],
    
    // --- 快速預約 ---
    qbDatePicker: null           // 快速預約日期選擇器
};

// 簡單的更新輔助函式 (可選用，或直接修改 state 物件)
export function setState(key, value) {
    state[key] = value;
}