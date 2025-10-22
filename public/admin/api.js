// public/admin/api.js (v2 - 包含 Cookie 修正)

async function request(url, options = {}) {
    try {
        // 【核心修正】加入 credentials: 'same-origin'
        // 這會確保瀏覽器在發送同源請求時，自動攜帶 Cookie
        const defaultOptions = {
            credentials: 'same-origin', // <--- 新增這一行
            headers: {
                'Content-Type': 'application/json',
                // 如果 options 中有 headers，則合併它們
                ...(options.headers || {}),
            },
        };

        // 合併預設選項與傳入的選項
        const fetchOptions = { ...defaultOptions, ...options };

        // 如果 body 是物件，將其轉換為 JSON 字串
        if (fetchOptions.body && typeof fetchOptions.body === 'object') {
            fetchOptions.body = JSON.stringify(fetchOptions.body);
        }
        // 如果請求方法是 GET 或 HEAD，移除 body (fetch 規範)
        if (fetchOptions.method === 'GET' || fetchOptions.method === 'HEAD') {
            delete fetchOptions.body;
        }


        const response = await fetch(url, fetchOptions); // 使用合併後的選項

        if (!response.ok) {
            let errorData;
            try {
                // 嘗試解析 JSON 錯誤訊息
                errorData = await response.json();
            } catch (e) {
                // 如果解析失敗，使用文字錯誤訊息
                const errorText = await response.text();
                errorData = { error: `HTTP 錯誤，狀態碼: ${response.status}`, details: errorText };
            }
            throw new Error(errorData.error || '未知的 API 錯誤');
        }

        // 處理 204 No Content 的情況
        if (response.status === 204) {
            return { success: true }; // 或回傳 null，視前端需要決定
        }

        // 嘗試解析 JSON 回應
        return await response.json();

    } catch (error) {
        console.error(`API 請求失敗: ${url}`, error);
        // 將原始錯誤再次拋出，以便呼叫者可以捕捉
        throw error;
    }
}

// --- API 端點列表 (保持不變) ---
export const api = {
    checkAuthStatus: () => request('/api/admin/auth/status'),
    getDashboardStats: () => request('/api/admin/dashboard-stats'),
    generateImageUploadUrl: () => request('/api/admin/generate-image-upload-url', { method: 'POST' }),
    getActivities: () => request('/api/admin/activities'),
    markActivityAsRead: (activity_id) => request('/api/admin/activities', { method: 'POST', body: { activity_id } }), // 直接傳物件
    getUsers: () => request('/api/admin/get-users'),
    updateUserDetails: (data) => request('/api/update-user-details', { method: 'POST', body: data }),
    getUserDetails: (userId) => request(`/api/admin/user-details?userId=${userId}`),
    searchUsers: (query) => request(`/api/admin/user-search?q=${encodeURIComponent(query)}`),

    getProducts: () => request('/api/admin/get-products'),
    updateProductOrder: (orderedproductIds) => request('/api/admin/update-product-order', { method: 'POST', body: { orderedproductIds } }),
    toggleProductVisibility: (productId, isVisible) => request('/api/admin/toggle-product-visibility', { method: 'POST', body: { productId, isVisible } }),
    updateProductDetails: (data) => request('/api/admin/update-product-details', { method: 'POST', body: data }),
    batchUpdateProducts: (productIds, isVisible) => request('/api/admin/batch-update-products', { method: 'POST', body: { productIds, isVisible } }),
    createProduct: (data) => request('/api/admin/create-product', { method: 'POST', body: data }),
    deleteProducts: (productIds) => request('/api/admin/delete-products', { method: 'POST', body: { productIds } }),
    batchUpdateStockStatus: (productIds, stockStatus) => request('/api/admin/batch-update-stock-status', { method: 'POST', body: { productIds, stockStatus } }),
    bulkCreateProducts: (data) => request('/api/admin/bulk-create-products', { method: 'POST', body: data }),

    getBookings: (status = 'all_upcoming') => request(`/api/get-bookings?status=${status}`),
    updateBookingStatus: (bookingId, status) => request('/api/update-booking-status', { method: 'POST', body: { bookingId, status } }),
    getBookingSettings: () => request('/api/admin/booking-settings'),
    saveBookingSettings: (body) => request('/api/admin/booking-settings', { method: 'POST', body: body }),
    createBooking: (data) => request('/api/admin/create-booking', { method: 'POST', body: data }),
    updateBookingDetails: (data) => request('/api/admin/update-booking-details', { method: 'POST', body: data }),
    getExpHistory: () => request('/api/admin/exp-history-list'),
    addPoints: (data) => request('/api/add-points', { method: 'POST', body: data }),

    getAllNews: () => request('/api/admin/get-all-news'),
    createNews: (data) => request('/api/admin/create-news', { method: 'POST', body: data }),
    updateNews: (data) => request('/api/admin/update-news', { method: 'POST', body: data }),
    deleteNews: (id) => request('/api/admin/delete-news', { method: 'POST', body: { id } }),

    getMessageDrafts: () => request('/api/admin/message-drafts'),
    createMessageDraft: (data) => request('/api/admin/message-drafts', { method: 'POST', body: data }),
    updateMessageDraft: (data) => request('/api/admin/message-drafts', { method: 'PUT', body: data }),
    deleteMessageDraft: (draft_id) => request('/api/admin/message-drafts', { method: 'DELETE', body: { draft_id } }),
    sendMessage: (userId, message) => request('/api/send-message', { method: 'POST', body: { userId, message } }),

    getStoreInfo: () => request('/api/get-store-info'),
    updateStoreInfo: (data) => request('/api/admin/update-store-info', { method: 'POST', body: data }),

    getSettings: () => request('/api/admin/get-settings'),
    updateSettings: (settings) => request('/api/admin/update-settings', { method: 'POST', body: settings }), // 直接傳陣列

    resetDemoData: () => request('/api/admin/reset-demo-data', { method: 'POST' }),

    syncD1ToSheet: () => request('/api/sync-d1-to-sheet', { method: 'POST' }),
    syncProductsFromSheet: () => request('/api/admin/get-products', { method: 'POST' }) // <--- 加入 /admin
};