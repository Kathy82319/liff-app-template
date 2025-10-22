// public/admin/api.js (加入 Cookie 檢查)

async function request(url, options = {}) {
    // *** 關鍵偵錯點 2：每次請求前檢查 Cookie ***
    const currentCookies = document.cookie;
    console.log(`[API Request] URL: ${url}`);
    console.log(`[API Request] Cookies before fetch: ${currentCookies || '(none)'}`);

    // (可選) 如果無法看 console，可以用 alert 暫時代替，但會一直跳出視窗
    // alert(`請求 ${url}\nCookies: ${currentCookies || '(none)'}`);

    if (!currentCookies || !currentCookies.includes('AuthToken=')) {
         console.warn(`[API Request] 警告：發送請求 ${url} 時缺少 AuthToken Cookie！`);
         // (可選) alert(`警告：請求 ${url} 時缺少 AuthToken！`);
    }

    try {
        const defaultOptions = {
            credentials: 'same-origin', // 確保這個設定存在
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
            // ... (錯誤處理不變)
            const errorData = await response.json().catch(() => ({ error: `HTTP 錯誤，狀態碼: ${response.status}` }));
            console.error(`API Error Data for ${url}:`, errorData);
            throw new Error(errorData.error || '未知的 API 錯誤');
        }
        if (response.status === 204) return { success: true };
        return await response.json();
    } catch (error) {
        console.error(`API 請求失敗 (in catch): ${url}`, error);
        throw error;
    }
}

// ... export const api = { ... } (其餘部分不變)
export const api = {
    checkAuthStatus: () => request('/api/admin/auth/status'),
    getDashboardStats: () => request('/api/admin/dashboard-stats'),
    generateImageUploadUrl: () => request('/api/admin/generate-image-upload-url', { method: 'POST' }),
    getActivities: () => request('/api/admin/activities'),
    markActivityAsRead: (activity_id) => request('/api/admin/activities', { method: 'POST', body: JSON.stringify({ activity_id }) }),
    // Use correct paths based on previous handover/discussion
    getUsers: () => request('/api/admin/get-users'),
    updateUserDetails: (data) => request('/api/admin/update-user-details', { method: 'POST', body: JSON.stringify(data) }),
    getUserDetails: (userId) => request(`/api/admin/user-details?userId=${userId}`),
    searchUsers: (query) => request(`/api/admin/user-search?q=${encodeURIComponent(query)}`),

    getProducts: () => request('/api/admin/get-products'),
    updateProductOrder: (orderedproductIds) => request('/api/admin/update-product-order', { method: 'POST', body: JSON.stringify({ orderedproductIds }) }),
    toggleProductVisibility: (productId, isVisible) => request('/api/admin/toggle-product-visibility', { method: 'POST', body: JSON.stringify({ productId, isVisible }) }),
    updateProductDetails: (data) => request('/api/admin/update-product-details', { method: 'POST', body: JSON.stringify(data) }),
    batchUpdateProducts: (productIds, isVisible) => request('/api/admin/batch-update-products', { method: 'POST', body: JSON.stringify({ productIds, isVisible }) }),
    createProduct: (data) => request('/api/admin/create-product', { method: 'POST', body: JSON.stringify(data) }),
    deleteProducts: (productIds) => request('/api/admin/delete-products', { method: 'POST', body: JSON.stringify({ productIds }) }),
    batchUpdateStockStatus: (productIds, stockStatus) => request('/api/admin/batch-update-stock-status', { method: 'POST', body: JSON.stringify({ productIds, stockStatus }) }),
    bulkCreateProducts: (data) => request('/api/admin/bulk-create-products', { method: 'POST', body: JSON.stringify(data) }),


    getBookings: (status = 'all_upcoming') => request(`/api/get-bookings?status=${status}`), // Keep /api/ for LIFF
    updateBookingStatus: (bookingId, status) => request('/api/update-booking-status', { method: 'POST', body: JSON.stringify({ bookingId, status }) }), // Keep /api/ for LIFF
    getBookingSettings: () => request('/api/admin/booking-settings'),
    saveBookingSettings: (body) => request('/api/admin/booking-settings', { method: 'POST', body: JSON.stringify(body) }),
    createBooking: (data) => request('/api/admin/create-booking', { method: 'POST', body: JSON.stringify(data) }),
    updateBookingDetails: (data) => request('/api/admin/update-booking-details', { method: 'POST', body: JSON.stringify(data) }),
    getExpHistory: () => request('/api/admin/exp-history-list'),
    // Assuming addPoints is admin-only based on context
    addPoints: (data) => request('/api/admin/add-points', { method: 'POST', body: JSON.stringify(data) }), // Moved to /admin/

    getAllNews: () => request('/api/admin/get-all-news'),
    createNews: (data) => request('/api/admin/create-news', { method: 'POST', body: JSON.stringify(data) }),
    updateNews: (data) => request('/api/admin/update-news', { method: 'POST', body: JSON.stringify(data) }),
    deleteNews: (id) => request('/api/admin/delete-news', { method: 'POST', body: JSON.stringify({ id }) }),

    getMessageDrafts: () => request('/api/admin/message-drafts'),
    createMessageDraft: (data) => request('/api/admin/message-drafts', { method: 'POST', body: JSON.stringify(data) }),
    updateMessageDraft: (data) => request('/api/admin/message-drafts', { method: 'PUT', body: JSON.stringify(data) }),
    deleteMessageDraft: (draft_id) => request('/api/admin/message-drafts', { method: 'DELETE', body: JSON.stringify({ draft_id }) }),
     // Assuming sendMessage is admin-only based on context
    sendMessage: (userId, message) => request('/api/admin/send-message', { method: 'POST', body: JSON.stringify({ userId, message }) }), // Moved to /admin/

    getStoreInfo: () => request('/api/get-store-info'), // Keep /api/ for LIFF
    updateStoreInfo: (data) => request('/api/admin/update-store-info', { method: 'POST', body: JSON.stringify(data) }),

    getSettings: () => request('/api/admin/get-settings'),
    updateSettings: (settings) => request('/api/admin/update-settings', { method: 'POST', body: JSON.stringify(settings) }),

    resetDemoData: () => request('/api/admin/reset-demo-data', { method: 'POST' }),

    // Assuming Syncs are admin-only
    syncD1ToSheet: () => request('/api/admin/sync-d1-to-sheet', { method: 'POST' }),
    syncProductsFromSheet: () => request('/api/admin/sync-products-from-sheet', { method: 'POST' })
};