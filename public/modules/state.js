// public/modules/state.js
export const state = {
    liffId: "",
    userProfile: null,
    config: null,
    activeTemplate: null,
    
    // 資料快取
    allProducts: [],
    allNews: []
};

// 簡單的狀態更新 helper
export function setState(key, value) {
    state[key] = value;
}