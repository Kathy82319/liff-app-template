// public/admin/api.js (修正後)

/**
 * 處理 API 請求的通用函式
 * @param {string} url - API 的 URL
 * @param {object} options - fetch 的選項 (method, headers, body)
 * @returns {Promise<any>} - 解析後的 JSON 資料
 */
async function request(url, options = {}) {
    try {
        const response = await fetch(url, options);
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({ error: `HTTP 錯誤，狀態碼: ${response.status}` }));
            throw new Error(errorData.error || '未知的 API 錯誤');
        }
        if (response.status === 204) {
            return { success: true };
        }
        return await response.json();
    } catch (error) {
        console.error(`API 請求失敗: ${url}`, error);
        throw error;
    }
}

// 導出所有 API 函式
export const api = {
    checkAuthStatus: () => request('/api/admin/auth/status'),
    getDashboardStats: () => request('/api/admin/dashboard-stats'),
    
    getUsers: () => request('/api/get-users'),
    updateUserDetails: (data) => request('/api/update-user-details', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) }),
    getUserDetails: (userId) => request(`/api/admin/user-details?userId=${userId}`),
    searchUsers: (query) => request(`/api/admin/user-search?q=${encodeURIComponent(query)}`),

    getProducts: () => request('/api/get-products'),
    updateProductOrder: (orderedproductIds) => request('/api/admin/update-product-order', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ orderedproductIds }) }),
    toggleProductVisibility: (productId, isVisible) => request('/api/admin/toggle-product-visibility', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ productId, isVisible }) }),
    updateProductDetails: (data) => request('/api/admin/update-product-details', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) }),
    batchUpdateProducts: (productIds, isVisible) => request('/api/admin/batch-update-products', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ productIds, isVisible }) }),
    createProduct: (data) => request('/api/admin/create-product', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) }),
    deleteProducts: (productIds) => request('/api/admin/delete-products', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ productIds }) }),

    getBookings: (status = 'all_upcoming') => request(`/api/get-bookings?status=${status}`),
    updateBookingStatus: (bookingId, status) => request('/api/update-booking-status', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ bookingId, status }) }),
    getBookingSettings: () => request('/api/admin/booking-settings'),
    saveBookingSettings: (body) => request('/api/admin/booking-settings', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }),
    createBooking: (data) => request('/api/admin/create-booking', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) }),

    getExpHistory: () => request('/api/admin/exp-history-list'),
    addPoints: (data) => request('/api/add-points', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) }),

    getAllNews: () => request('/api/admin/get-all-news'),
    createNews: (data) => request('/api/admin/create-news', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) }),
    updateNews: (data) => request('/api/admin/update-news', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) }),
    deleteNews: (id) => request('/api/admin/delete-news', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }) }),

    getMessageDrafts: () => request('/api/admin/message-drafts'),
    createMessageDraft: (data) => request('/api/admin/message-drafts', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) }),
    updateMessageDraft: (data) => request('/api/admin/message-drafts', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) }),
    deleteMessageDraft: (draft_id) => request('/api/admin/message-drafts', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ draft_id }) }),
    sendMessage: (userId, message) => request('/api/send-message', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ userId, message }) }),

    getStoreInfo: () => request('/api/get-store-info'),
    updateStoreInfo: (data) => request('/api/admin/update-store-info', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) }),

    // 【新增】系統設定相關 API
    getSettings: () => request('/api/admin/get-settings'),
    updateSettings: (settings) => request('/api/admin/update-settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings)
    }),
    
    resetDemoData: () => request('/api/admin/reset-demo-data', { method: 'POST' }),

    syncD1ToSheet: () => request('/api/sync-d1-to-sheet', { method: 'POST' }),
    syncProductsFromSheet: () => request('/api/get-products', { method: 'POST' })
};