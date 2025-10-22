// public/admin/api.js (修正 credentials)

async function request(url, options = {}) {
    try {
        // *** 在這裡加入 credentials: 'same-origin' ***
        const defaultOptions = {
            credentials: 'same-origin', // <--- 新增這一行確保 Cookie 被發送
            headers: {
                'Content-Type': 'application/json',
                ...options.headers // 保留可能傳入的其他 header
            },
            ...options // 包含傳入的 method, body 等
        };

        // 如果是 FormData (例如未來用於圖片上傳)，不需要設定 Content-Type
        if (options.body instanceof FormData) {
            delete defaultOptions.headers['Content-Type'];
        }

        // 使用合併後的 defaultOptions 進行 fetch
        const response = await fetch(url, defaultOptions);

        // ... 以下的錯誤處理和回應解析邏輯保持不變 ...
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({ error: `HTTP 錯誤，狀態碼: ${response.status}` }));
            throw new Error(errorData.error || '未知的 API 錯誤');
        }
        if (response.status === 204) return { success: true };
        return await response.json();
    } catch (error) {
        console.error(`API 請求失敗: ${url}`, error);
        throw error; // 將錯誤拋出，讓呼叫者知道
    }
}

// export const api = { ... } // api 物件的其他內容保持不變
// ... (api 物件的其餘部分) ...
export const api = {
    checkAuthStatus: () => request('/api/admin/auth/status'),
    getDashboardStats: () => request('/api/admin/dashboard-stats'),
    generateImageUploadUrl: () => request('/api/admin/generate-image-upload-url', { method: 'POST' }),
    getActivities: () => request('/api/admin/activities'),
    markActivityAsRead: (activity_id) => request('/api/admin/activities', { method: 'POST', body: JSON.stringify({ activity_id }) }),
    // 依 handover notes，將 get-users 移至 admin 路徑
    getUsers: () => request('/api/admin/get-users'), // <--- 路徑可能需要調整為 /api/admin/get-users
    // 依 handover notes，將 update-user-details 移至 admin 路徑
    updateUserDetails: (data) => request('/api/admin/update-user-details', { method: 'POST', body: JSON.stringify(data) }), // <--- 路徑可能需要調整為 /api/admin/update-user-details
    getUserDetails: (userId) => request(`/api/admin/user-details?userId=${userId}`),
    searchUsers: (query) => request(`/api/admin/user-search?q=${encodeURIComponent(query)}`),

    // 依 handover notes，將 get-products 移至 admin 路徑
    getProducts: () => request('/api/admin/get-products'), // <--- 路徑可能需要調整為 /api/admin/get-products
    updateProductOrder: (orderedproductIds) => request('/api/admin/update-product-order', { method: 'POST', body: JSON.stringify({ orderedproductIds }) }),
    toggleProductVisibility: (productId, isVisible) => request('/api/admin/toggle-product-visibility', { method: 'POST', body: JSON.stringify({ productId, isVisible }) }),
    updateProductDetails: (data) => request('/api/admin/update-product-details', { method: 'POST', body: JSON.stringify(data) }),
    batchUpdateProducts: (productIds, isVisible) => request('/api/admin/batch-update-products', { method: 'POST', body: JSON.stringify({ productIds, isVisible }) }),
    createProduct: (data) => request('/api/admin/create-product', { method: 'POST', body: JSON.stringify(data) }),
    deleteProducts: (productIds) => request('/api/admin/delete-products', { method: 'POST', body: JSON.stringify({ productIds }) }),
    batchUpdateStockStatus: (productIds, stockStatus) => request('/api/admin/batch-update-stock-status', { method: 'POST', body: JSON.stringify({ productIds, stockStatus }) }),
    bulkCreateProducts: (data) => request('/api/admin/bulk-create-products', { method: 'POST', body: JSON.stringify(data) }),


    getBookings: (status = 'all_upcoming') => request(`/api/get-bookings?status=${status}`), // LIFF 會用到，保持 /api/
    updateBookingStatus: (bookingId, status) => request('/api/update-booking-status', { method: 'POST', body: JSON.stringify({ bookingId, status }) }), // LIFF 會用到，保持 /api/
    getBookingSettings: () => request('/api/admin/booking-settings'),
    saveBookingSettings: (body) => request('/api/admin/booking-settings', { method: 'POST', body: JSON.stringify(body) }),
    createBooking: (data) => request('/api/admin/create-booking', { method: 'POST', body: JSON.stringify(data) }),
    updateBookingDetails: (data) => request('/api/admin/update-booking-details', { method: 'POST', body: JSON.stringify(data) }),
    getExpHistory: () => request('/api/admin/exp-history-list'),
    addPoints: (data) => request('/api/add-points', { method: 'POST', body: JSON.stringify(data) }), // PointsCenter 是 admin 功能，移至 /api/admin/add-points?

    getAllNews: () => request('/api/admin/get-all-news'),
    createNews: (data) => request('/api/admin/create-news', { method: 'POST', body: JSON.stringify(data) }),
    updateNews: (data) => request('/api/admin/update-news', { method: 'POST', body: JSON.stringify(data) }),
    deleteNews: (id) => request('/api/admin/delete-news', { method: 'POST', body: JSON.stringify({ id }) }),

    getMessageDrafts: () => request('/api/admin/message-drafts'),
    createMessageDraft: (data) => request('/api/admin/message-drafts', { method: 'POST', body: JSON.stringify(data) }),
    updateMessageDraft: (data) => request('/api/admin/message-drafts', { method: 'PUT', body: JSON.stringify(data) }),
    deleteMessageDraft: (draft_id) => request('/api/admin/message-drafts', { method: 'DELETE', body: JSON.stringify({ draft_id }) }),
    sendMessage: (userId, message) => request('/api/send-message', { method: 'POST', body: JSON.stringify({ userId, message }) }), // CRM (Admin) 會用到，移至 /api/admin/send-message?

    getStoreInfo: () => request('/api/get-store-info'), // LIFF 會用到，保持 /api/
    updateStoreInfo: (data) => request('/api/admin/update-store-info', { method: 'POST', body: JSON.stringify(data) }),

    getSettings: () => request('/api/admin/get-settings'),
    updateSettings: (settings) => request('/api/admin/update-settings', { method: 'POST', body: JSON.stringify(settings) }),

    resetDemoData: () => request('/api/admin/reset-demo-data', { method: 'POST' }),

    // 假設 Sync 是 Admin 功能
    syncD1ToSheet: () => request('/api/admin/sync-d1-to-sheet', { method: 'POST' }), // <--- 路徑可能需要調整
    syncProductsFromSheet: () => request('/api/admin/sync-products-from-sheet', { method: 'POST' }) // <--- 路徑可能需要調整
};