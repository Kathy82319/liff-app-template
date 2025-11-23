// public/admin/api.js (修正 getUsers/getProducts 路徑，確保 getAppConfig)

async function request(url, options = {}) {
    // *** 請求前檢查 Cookie 的偵錯碼可以保留或移除 ***
    const currentCookies = document.cookie;
    console.log(`[API Request] URL: ${url}`);
    console.log(`[API Request] Cookies before fetch: ${currentCookies || '(none)'}`);


    try {
        const defaultOptions = {
            credentials: 'same-origin', // 確保發送 Cookie
            headers: {
                'Content-Type': 'application/json',
                ...options.headers
            },
            ...options
        };

        if (options.body instanceof FormData) {
            delete defaultOptions.headers['Content-Type'];
        }

        const response = await fetch(url, defaultOptions);

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({ error: `HTTP 錯誤，狀態碼: ${response.status}` }));
            console.error(`API Error Data for ${url}:`, errorData);
            throw new Error(errorData.error || '未知的 API 錯誤');
        }
        if (response.status === 204) return { success: true };
        const contentType = response.headers.get("content-type");
        if (contentType && contentType.indexOf("application/json") !== -1) {
            return await response.json();
        } else {
            console.warn(`API ${url} 回應非 JSON 格式 (${contentType})`);
            return { success: false, error: `非預期的回應格式: ${await response.text()}` };
        }
    } catch (error) {
        console.error(`API 請求失敗 (in catch): ${url}`, error);
        throw error;
    }
}

export const api = {
    // *** 新增/確認：獲取 App 設定的 API ***
    getAppConfig: () => request('/api/get-app-config'), // 公開 API

    // --- Admin Auth ---
    checkAuthStatus: () => request('/api/admin/auth/status'),
    // login 和 logout 通常由頁面直接處理，不需要放在這裡

    // --- Admin Dashboard ---
    getDashboardStats: () => request('/api/admin/dashboard-stats'),
    getActivities: () => request('/api/admin/activities'),
    markActivityAsRead: (activity_id) => request('/api/admin/activities', { method: 'POST', body: JSON.stringify({ activity_id }) }),

    // --- Admin User Management ---
    // *** 使用正確的公開路徑 ***
    getUsers: () => request('/api/get-users'), // File at functions/api/get-users.js
    // 假設 updateUserDetails 是 admin 功能且檔案在 functions/api/admin/
    updateUserDetails: (data) => request('/api/admin/update-user-details', { method: 'POST', body: JSON.stringify(data) }),
    getUserDetails: (userId) => request(`/api/admin/user-details?userId=${userId}`),
    searchUsers: (query) => request(`/api/admin/user-search?q=${encodeURIComponent(query)}`),

    // --- Admin Product Management ---
    // *** 使用正確的公開路徑 ***
    getProducts: () => request('/api/get-products'), // File at functions/api/get-products.js
    updateProductOrder: (orderedproductIds) => request('/api/admin/update-product-order', { method: 'POST', body: JSON.stringify({ orderedproductIds }) }),
    toggleProductVisibility: (productId, isVisible) => request('/api/admin/toggle-product-visibility', { method: 'POST', body: JSON.stringify({ productId, isVisible }) }),
    updateProductDetails: (data) => request('/api/admin/update-product-details', { method: 'POST', body: JSON.stringify(data) }),
    batchUpdateProducts: (productIds, isVisible) => request('/api/admin/batch-update-products', { method: 'POST', body: JSON.stringify({ productIds, isVisible }) }),
    createProduct: (data) => request('/api/admin/create-product', { method: 'POST', body: JSON.stringify(data) }),
    deleteProducts: (productIds) => request('/api/admin/delete-products', { method: 'POST', body: JSON.stringify({ productIds }) }),
    batchUpdateStockStatus: (productIds, stockStatus) => request('/api/admin/batch-update-stock-status', { method: 'POST', body: JSON.stringify({ productIds, stockStatus }) }),
    bulkCreateProducts: (data) => request('/api/admin/bulk-create-products', { method: 'POST', body: JSON.stringify(data) }),
    generateImageUploadUrl: () => request('/api/admin/generate-image-upload-url', { method: 'POST' }),

    // --- Admin Room Availability Management (民宿專用) ---
    getRoomInventory: (params) => request(`/api/admin/get-room-inventory?${params.toString()}`),
    updateRoomInventory: (data) => request('/api/admin/update-room-inventory', { method: 'POST', body: JSON.stringify(data) }),

    // --- Admin Booking Management ---
    getBookings: (queryString = 'status=today') => {
        // 直接將 queryString 附加到基礎 URL 後面
        const url = `/api/get-bookings?${queryString}`;
        console.log(`[api.js getBookings] Constructed URL: ${url}`); // Log 構造的 URL
        return request(url); // 呼叫 request 函數
    },    updateBookingStatus: (bookingId, status) => request('/api/update-booking-status', { method: 'POST', body: JSON.stringify({ bookingId, status }) }), // Keep /api/ for LIFF? Or move?
    getBookingSettings: () => request('/api/admin/booking-settings'),
    saveBookingSettings: (body) => request('/api/admin/booking-settings', { method: 'POST', body: JSON.stringify(body) }),
    createBooking: (data) => request('/api/admin/create-booking', { method: 'POST', body: JSON.stringify(data) }),
    updateBookingDetails: (data) => request('/api/admin/update-booking-details', { method: 'POST', body: JSON.stringify(data) }),

    // --- Admin EXP/Points ---
    getExpHistory: () => request('/api/admin/exp-history-list'),
    // Assuming addPoints is admin only
    addPoints: (data) => request('/api/admin/add-points', { method: 'POST', body: JSON.stringify(data) }),
    adjustStoredValue: (data) => request('/api/admin/adjust-stored-value', { method: 'POST', body: JSON.stringify(data) }),
    // --- Admin News ---
    getAllNews: () => request('/api/admin/get-all-news'),
    createNews: (data) => request('/api/admin/create-news', { method: 'POST', body: JSON.stringify(data) }),
    updateNews: (data) => request('/api/admin/update-news', { method: 'POST', body: JSON.stringify(data) }),
    deleteNews: (id) => request('/api/admin/delete-news', { method: 'POST', body: JSON.stringify({ id }) }),

    // --- Admin Drafts ---
    getMessageDrafts: () => request('/api/admin/message-drafts'),
    createMessageDraft: (data) => request('/api/admin/message-drafts', { method: 'POST', body: JSON.stringify(data) }),
    updateMessageDraft: (data) => request('/api/admin/message-drafts', { method: 'PUT', body: JSON.stringify(data) }),
    deleteMessageDraft: (draft_id) => request('/api/admin/message-drafts', { method: 'DELETE', body: JSON.stringify({ draft_id }) }),


    sendMessage: (userId, message) => request('/api/send-message', { method: 'POST', body: JSON.stringify({ userId, message }) }),
    
    // --- Store Info ---
    getStoreInfo: () => request('/api/get-store-info'), // Keep /api/ for LIFF
    updateStoreInfo: (data) => request('/api/admin/update-store-info', { method: 'POST', body: JSON.stringify(data) }),

    // --- Admin Settings ---
    getSettings: () => request('/api/admin/get-settings'),
    updateSettings: (settings) => request('/api/admin/update-settings', { method: 'POST', body: JSON.stringify(settings) }),

    // --- Admin Voucher Management ---
    getVoucherTemplates: () => request('/api/admin/voucher-templates'),
    createVoucherTemplate: (data) => request('/api/admin/voucher-templates', { method: 'POST', body: JSON.stringify(data) }),
    updateVoucherTemplate: (data) => request('/api/admin/voucher-templates', { method: 'PUT', body: JSON.stringify(data) }),
    deleteVoucherTemplate: (template_id) => request('/api/admin/voucher-templates', { method: 'DELETE', body: JSON.stringify({ template_id }) }),
    issueVoucher: (data) => request('/api/admin/issue-voucher', { method: 'POST', body: JSON.stringify(data) }), // <-- ▼▼▼ 新增這一行 ▼▼▼
    massIssueVoucher: (data) => request('/api/admin/mass-issue-voucher', { method: 'POST', body: JSON.stringify(data) }), // <-- ▼▼▼ 新增這一行 ▼▼▼
    
    // --- Admin Reports ---
    getFinancialReport: (startDate, endDate) => request(`/api/admin/financial-report?startDate=${startDate}&endDate=${endDate}`),
    updatePaymentStatus: (bookingId, paymentStatus) => request('/api/admin/update-payment-status', { 
        method: 'POST', 
        body: JSON.stringify({ bookingId, paymentStatus }) 
    }),
    
    // --- Admin Rally Campaigns Management (新增) ---
    getRallyCampaigns: () => request('/api/admin/rally/campaigns'),
    createRallyCampaign: (data) => request('/api/admin/rally/campaigns', { method: 'POST', body: JSON.stringify(data) }),
    updateRallyCampaign: (data) => request('/api/admin/rally/campaigns', { method: 'PUT', body: JSON.stringify(data) }),
    deleteRallyCampaign: (campaign_id) => request('/api/admin/rally/campaigns', { method: 'DELETE', body: JSON.stringify({ campaign_id }) }),

    // --- Admin Rally Stations Management (新增) ---
    getRallyStations: (campaignId) => request(`/api/admin/rally/stations?campaignId=${campaignId}`),
    createRallyStation: (data) => request('/api/admin/rally/stations', { method: 'POST', body: JSON.stringify(data) }),
    updateRallyStation: (data) => request('/api/admin/rally/stations', { method: 'PUT', body: JSON.stringify(data) }),
    deleteRallyStation: (station_id) => request('/api/admin/rally/stations', { method: 'DELETE', body: JSON.stringify({ station_id }) }),

    // --- Admin Misc ---
    resetDemoData: () => request('/api/admin/reset-demo-data', { method: 'POST' }),
};