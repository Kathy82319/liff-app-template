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
    if (contentType && contentType.includes("application/json")) {
            console.log(`[API Response] ${url} - Content-Type: ${contentType}. Parsing JSON.`); // Log
            return await response.json();
        } else {
            // 如果不是 JSON，記錄警告並嘗試回傳文字 (如果狀態碼是成功的)
            const responseText = await response.text();
            console.warn(`[API Response] ${url} - Received non-JSON Content-Type: ${contentType || 'N/A'}. Body Text:`, responseText.substring(0, 100)); // Log

            // 如果狀態碼是 2xx (成功)，但 Content-Type 不對，我們可能還是要視為成功，
            // 但回傳一個標記，或嘗試解析文字看是否剛好是 '{"success":true}'
            if (response.status >= 200 && response.status < 300) {
                 // 嘗試解析看看，以防萬一
                 try {
                      const parsedText = JSON.parse(responseText);
                      console.warn(`[API Response] ${url} - Parsed non-JSON response as JSON anyway.`);
                      return parsedText;
                 } catch(e) {
                      // 解析失敗，回傳一個代表成功但內容未知的物件
                      console.warn(`[API Response] ${url} - Could not parse non-JSON success response.`);
                      return { success: true, warning: 'Response Content-Type was not JSON', raw: responseText };
                 }
            } else {
                 // 如果狀態碼也是錯誤的，回傳錯誤
                 return { success: false, error: `非預期的回應格式: ${responseText}` };
            }
        }
    } catch (error) {
        // ... (catch 區塊不變) ...
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
    getBookings: (status = 'all_upcoming') => request(`/api/get-bookings?status=${status}`), // Keep /api/ for LIFF? Or move?
    updateBookingStatus: (bookingId, status) => request('/api/update-booking-status', { method: 'POST', body: JSON.stringify({ bookingId, status }) }), // Keep /api/ for LIFF? Or move?
    getBookingSettings: () => request('/api/admin/booking-settings'),
    saveBookingSettings: (body) => request('/api/admin/booking-settings', { method: 'POST', body: JSON.stringify(body) }),
    createBooking: (data) => request('/api/admin/create-booking', { method: 'POST', body: JSON.stringify(data) }),
    updateBookingDetails: (data) => request('/api/admin/update-booking-details', { method: 'POST', body: JSON.stringify(data) }),

    // --- Admin EXP/Points ---
    getExpHistory: () => request('/api/admin/exp-history-list'),
    // Assuming addPoints is admin only
    addPoints: (data) => request('/api/admin/add-points', { method: 'POST', body: JSON.stringify(data) }),

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

    // --- Admin Send Message ---
    // Assuming sendMessage is admin only
    sendMessage: (userId, message) => request('/api/admin/send-message', { method: 'POST', body: JSON.stringify({ userId, message }) }),

    // --- Store Info ---
    getStoreInfo: () => request('/api/get-store-info'), // Keep /api/ for LIFF
    updateStoreInfo: (data) => request('/api/admin/update-store-info', { method: 'POST', body: JSON.stringify(data) }),

    // --- Admin Settings ---
    getSettings: () => request('/api/admin/get-settings'),
    updateSettings: (settings) => request('/api/admin/update-settings', { method: 'POST', body: JSON.stringify(settings) }),

    // --- Admin Misc ---
    resetDemoData: () => request('/api/admin/reset-demo-data', { method: 'POST' }),

    // --- Admin Sync ---
    // Assuming Syncs are admin only
    syncD1ToSheet: () => request('/api/admin/sync-d1-to-sheet', { method: 'POST' }), // Verify backend file location
    syncProductsFromSheet: () => request('/api/admin/sync-products-from-sheet', { method: 'POST' }) // Verify backend file location
};