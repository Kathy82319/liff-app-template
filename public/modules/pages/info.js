// public/modules/pages/info.js
import { api } from '../api.js';
import { state } from '../state.js';

export async function init() {
    const terms = state.activeTemplate?.terms || {};
    const pageTitle = document.querySelector('#page-info .page-main-title');
    if (pageTitle) pageTitle.textContent = terms.ADMIN_STORE_INFO_LABEL || '店家資訊';

    const container = document.getElementById('store-info-container');
    if (!container) return;

    try {
        const info = await api.getStoreInfo();
        
        const setVal = (id, val) => {
            const el = document.getElementById(id);
            if (el) el.textContent = val || '未提供';
        };

        setVal('store-name', info.store_name);
        setVal('store-address', info.address);
        setVal('store-phone', info.phone);
        setVal('store-hours', info.opening_hours);
        setVal('store-description', info.description);

    } catch (error) {
        container.innerHTML = `<p style="color:red; text-align:center; padding:20px;">載入失敗</p>`;
    }
}