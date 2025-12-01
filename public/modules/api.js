// public/modules/api.js
import { state } from './state.js';

// 通用請求函式
export async function request(url, options = {}) {
    try {
        const response = await fetch(url, {
            ...options,
            headers: {
                'Content-Type': 'application/json',
                ...options.headers
            }
        });

        // 處理 409 Conflict (通常是資訊性錯誤，如已領過券)
        if (response.status === 409) {
            const errorData = await response.json();
            const error = new Error(errorData.error || 'Conflict');
            error.status = 409;
            error.data = errorData;
            throw error;
        }

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.error || `HTTP error ${response.status}`);
        }

        // 處理 204 No Content
        if (response.status === 204) return null;

        return await response.json();
    } catch (error) {
        console.error(`[API] Error calling ${url}:`, error);
        throw error;
    }
}

// API 集合
export const api = {
    // 基礎 Request 暴露
    request: request,

    // 系統設定與公開資訊
    getAppConfig: () => request('/api/get-app-config'),
    getNews: () => request('/api/get-news'),
    getProducts: () => request('/api/get-products'),
    getStoreInfo: () => request('/api/get-store-info'),
    getBookingPolicy: () => request('/api/get-booking-policy'),
    
    // 使用者相關
    getUserProfile: (userId) => request(`/api/user`, { 
        method: 'POST', 
        body: JSON.stringify({ 
            userId: userId,
            displayName: state.userProfile?.displayName,
            pictureUrl: state.userProfile?.pictureUrl
        }) 
    }),
    updateUserProfile: (data) => request('/api/update-user-profile', { method: 'POST', body: JSON.stringify(data) }),
    
    // 個人紀錄查詢
    getMyBookings: (userId, filter) => request(`/api/my-bookings?userId=${userId}&filter=${filter}`),
    // 【新增】透過 ID 查詢單筆預約
    getBookingById: (userId, bookingId) => request(`/api/my-bookings?userId=${userId}&bookingId=${bookingId}`),
    
    getMyPurchaseHistory: (userId) => request(`/api/my-purchase-history?userId=${userId}`),
    getMyStoredValueHistory: (userId) => request(`/api/my-stored-value-history?userId=${userId}`),
    getMyVouchers: (userId) => request(`/api/my-vouchers?userId=${userId}`),
    
    // 預約流程
    checkRoomAvailability: (start, end) => request(`/api/room-availability?startDate=${start}&endDate=${end}`),
    checkBookingsSlot: (date) => request(`/api/bookings-check?date=${date}`),
    getBookingsCheckInit: () => request('/api/bookings-check?month-init=true'),
    createBooking: (data) => request('/api/bookings-create', { method: 'POST', body: JSON.stringify(data) }),
    cancelBooking: (bookingId, userId) => request('/api/cancel-booking', { method: 'POST', body: JSON.stringify({ bookingId, userId }) }),
    
    // 優惠券與集點
    claimVoucher: (data) => request('/api/claim-voucher', { method: 'POST', body: JSON.stringify(data) }),
    
    getRallyCampaigns: (userId) => request(`/api/rally/campaigns?userId=${userId}`),
    getRallyStations: (campaignId) => request(`/api/rally/stations?campaignId=${campaignId}`),
    getRallyProgress: (userId, campaignId) => request(`/api/rally/progress?userId=${userId}&campaignId=${campaignId}`),
    
    redeemRallyStation: (data) => request('/api/rally/redeem-station', { method: 'POST', body: JSON.stringify(data) }),
    resetRallyCard: (data) => request('/api/rally/reset-card', { method: 'POST', body: JSON.stringify(data) }),

    // 傳訊
    sendMessage: (userId, message) => request('/api/send-message', { method: 'POST', body: JSON.stringify({ userId, message }) })
};