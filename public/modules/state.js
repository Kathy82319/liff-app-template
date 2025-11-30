// public/modules/state.js
export const state = {
    liffId: "",
    userProfile: null,
    config: null,
    activeTemplate: null,
    // 暫存資料
    allProducts: [],
    allNews: []
};

export function setState(key, value) {
    state[key] = value;
}