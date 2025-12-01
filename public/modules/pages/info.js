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
        setVal('store-phone', info.phone);
        setVal('store-hours', info.opening_hours);
        setVal('store-description', info.description);

        // 【關鍵補全】渲染地址與地圖連結
        renderAddressLink('store-address', info.address);

        const nameSection = document.getElementById('info-section-name');
        if (nameSection) nameSection.style.display = info.store_name ? '' : 'none';

    } catch (error) {
        container.innerHTML = `<p style="color:red; text-align:center; padding:20px;">載入失敗</p>`;
    }
}

function renderAddressLink(elementId, address) {
    const el = document.getElementById(elementId);
    if (!el) return;

    if (address) {
        const mapUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;
        el.innerHTML = `
            <span>${address}</span>
            <a href="${mapUrl}" target="_blank" class="map-link-btn" title="在 Google 地圖開啟" style="display:inline-flex; align-items:center; justify-content:center; margin-left:8px; width:24px; height:24px; background:#E8F5E9; border-radius:50%; text-decoration:none;">
                📍
            </a>
        `;
    } else {
        el.textContent = '未提供';
    }
}