// public/modules/router.js
import { init as initHome } from './pages/home.js';
import { init as initProducts, renderDetails as renderProductDetails } from './pages/product.js';
import { init as initProfile, initEdit as initEditProfile, initVouchers as initMyVouchers } from './pages/profile.js';
import { init as initBooking, renderBookingDetails } from './pages/booking.js';
import { init as initRally } from './pages/rally.js';
import { init as initRecords } from './pages/records.js';
import { init as initInfo } from './pages/info.js';
import { init as initNewsDetails, renderDetails as renderNewsDetails } from './pages/home.js'; 

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
        console.log(`[Router] Navigating to ${pageId}`);
        const appContent = document.getElementById('app-content');
        const template = document.getElementById('page-templates').querySelector(`#${pageId}`);
        
        if (!template) {
            console.error(`[Router] Route not found: ${pageId}`);
            // 如果找不到路由，回首頁
            this.navigate('page-home');
            return;
        }

        // 1. 渲染 HTML (從 template 複製內容)
        appContent.innerHTML = template.innerHTML;
        
        // 2. 更新 URL Hash (移除 page- 前綴)
        const hash = pageId.replace('page-', '');
        // 避免重複推入相同的 history
        if (location.hash !== `#${hash}`) {
            history.pushState({ page: pageId, data: data }, '', `#${hash}`);
        }

        // 3. 更新 Tab Bar 狀態
        document.querySelectorAll('.tab-button').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.target === pageId);
        });

        // 4. 執行該頁面的初始化邏輯
        if (routes[pageId]) {
            // 使用 try-catch 確保單一頁面錯誤不會導致整個路由掛掉
            try {
                routes[pageId](data);
            } catch (e) {
                console.error(`[Router] Error initializing ${pageId}:`, e);
                appContent.innerHTML += `<p style="color:red; text-align:center;">頁面載入發生錯誤</p>`;
            }
        }
        
        // 5. 滾動到頂部
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