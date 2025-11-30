// public/modules/api.js
import { state } from './state.js';

async function request(url, options = {}) {
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

        return await response.json();
    } catch (error) {
        console.error(`[API] Error calling ${url}:`, error);
        throw error;
    }
}

export const api = {
    getAppConfig: () => request('/api/get-app-config'),
    getNews: () => request('/api/get-news'),
    getProducts: () => request('/api/get-products'),
    getStoreInfo: () => request('/api/get-store-info'),
    
    // User
    getUserProfile: (userId) => request(`/api/user`, { 
        method: 'POST', 
        body: JSON.stringify({ 
            userId: userId,
            displayName: state.userProfile?.displayName,
            pictureUrl: state.userProfile?.pictureUrl
        }) 
    }),
    updateUserProfile: (data) => request('/api/update-user-profile', { method: 'POST', body: JSON.stringify(data) }),
    
    // Records
    getMyBookings: (userId, filter) => request(`/api/my-bookings?userId=${userId}&filter=${filter}`),
    getMyPurchaseHistory: (userId) => request(`/api/my-purchase-history?userId=${userId}`),
    getMyStoredValueHistory: (userId) => request(`/api/my-stored-value-history?userId=${userId}`),
    getMyVouchers: (userId) => request(`/api/my-vouchers?userId=${userId}`),
    
    // Booking
    checkRoomAvailability: (start, end) => request(`/api/room-availability?startDate=${start}&endDate=${end}`),
    checkBookingsSlot: (date) => request(`/api/bookings-check?date=${date}`),
    getBookingsCheckInit: () => request('/api/bookings-check?month-init=true'),
    createBooking: (data) => request('/api/bookings-create', { method: 'POST', body: JSON.stringify(data) }),
    
    // Voucher & Rally
    claimVoucher: (data) => request('/api/claim-voucher', { method: 'POST', body: JSON.stringify(data) }),
    getRallyCampaigns: (userId) => request(`/api/rally/campaigns?userId=${userId}`),
    getRallyStations: (campaignId) => request(`/api/rally/stations?campaignId=${campaignId}`),
    getRallyProgress: (userId, campaignId) => request(`/api/rally/progress?userId=${userId}&campaignId=${campaignId}`),
    redeemRallyStation: (data) => request('/api/rally/redeem-station', { method: 'POST', body: JSON.stringify(data) }),
    resetRallyCard: (data) => request('/api/rally/reset-card', { method: 'POST', body: JSON.stringify(data) })
};