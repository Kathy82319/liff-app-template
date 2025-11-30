// public/modules/router.js
import { init as initHome } from './pages/home.js';
import { init as initProducts, renderDetails as renderProductDetails } from './pages/product.js';
import { init as initProfile, initEdit as initEditProfile, initVouchers as initMyVouchers } from './pages/profile.js';
import { init as initBooking, renderBookingDetails } from './pages/booking.js';
import { init as initRally } from './pages/rally.js';
import { init as initRecords } from './pages/records.js';
import { init as initInfo } from './pages/info.js';
import { init as initNewsDetails, renderDetails as renderNewsDetails } from './pages/home.js'; // News details logic inside home module

const routes = {
    'page-home': initHome,
    'page-products': initProducts,
    'page-product-details': (data) => renderProductDetails(data.product),
    'page-profile': initProfile,
    'page-edit-profile': initEditProfile,
    'page-my-vouchers': initMyVouchers,
    'page-booking': initBooking,
    'page-booking-details': (data) => renderBookingDetails(data.bookingId),
    'page-rally': initRally,
    'page-my-records': initRecords,
    'page-info': initInfo,
    'page-news-details': (data) => renderNewsDetails(data.news)
};

export const router = {
    navigate(pageId, data = null) {
        const appContent = document.getElementById('app-content');
        const template = document.getElementById('page-templates').querySelector(`#${pageId}`);
        
        if (!template) {
            console.error(`Route not found: ${pageId}`);
            this.navigate('page-home');
            return;
        }

        // 渲染 HTML
        appContent.innerHTML = template.innerHTML;
        
        // 更新 URL Hash
        const hash = pageId.replace('page-', '');
        history.pushState({ page: pageId, data: data }, '', `#${hash}`);

        // 更新 Tab Bar 狀態
        document.querySelectorAll('.tab-button').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.target === pageId);
        });

        // 執行頁面初始化邏輯
        if (routes[pageId]) {
            routes[pageId](data);
        }
        
        // 滾動到頂部
        window.scrollTo(0, 0);
    },

    handlePopState(event) {
        if (event.state && event.state.page) {
            this.navigate(event.state.page, event.state.data);
        } else {
            const hash = window.location.hash.substring(1);
            const pageId = hash ? `page-${hash}` : 'page-home';
            this.navigate(pageId);
        }
    }
};