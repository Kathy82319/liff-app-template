// public/admin/api-mock.js (v2 - 修正版)

// --- 模擬資料庫 & 輔助工具 ---
const getMockData = (key, defaultValue) => {
    const stored = localStorage.getItem(`demo_${key}`);
    return stored ? JSON.parse(stored) : defaultValue;
};
const setMockData = (key, data) => {
    localStorage.setItem(`demo_${key}`, JSON.stringify(data));
};
const generateId = (prefix = '') => prefix + Math.random().toString(36).substr(2, 9);
const delay = (ms = 50) => new Promise(res => setTimeout(res, ms));

// --- 預設的範例資料 (已補全欄位) ---
const initialProducts = [
    { product_id: 'p-demo001', name: '【範例】夏季攝影速成班', category: '課程', price: 2500, description: '為期四週的攝影入門課程，帶您從零開始掌握光影與構圖。', images: '["https://placehold.co/600x400/4A90E2/ffffff?text=Course+1"]', display_order: 1, is_visible: 1, inventory_management_type: 'status', stock_status: '尚有名額' },
    { product_id: 'p-demo002', name: '【範例】手沖咖啡體驗', category: '餐飲', price: 800, description: '由專業咖啡師指導，親手沖煮屬於您自己的精品咖啡。', images: '["https://placehold.co/600x400/00B900/ffffff?text=Service+2"]', display_order: 2, is_visible: 1, inventory_management_type: 'quantity', stock_quantity: 10 },
    { product_id: 'p-demo003', name: '【範例】VIP 場地租借', category: '服務', price: 5000, description: '提供高品質的獨立空間，適合舉辦私人派對或商務會議。', images: '[]', display_order: 3, is_visible: 1, inventory_management_type: 'none' },
    { product_id: 'p-demo004', name: '【範例】已下架的舊活動', category: '課程', price: 1200, description: '此為已下架的活動範例。', images: '[]', display_order: 4, is_visible: 0, inventory_management_type: 'none' },
];

const initialUsers = [
    { user_id: 'U-demo-12345', line_display_name: '體驗顧客A', nickname: '小明', class: 'VIP會員', level: 5, current_exp: 5, perk: '餐飲9折', tag: '常客', notes: '喜歡靠窗的位子' },
    { user_id: 'U-demo-67890', line_display_name: '體驗顧客B', nickname: '莉莉', class: '普通會員', level: 2, current_exp: 8, perk: '無', tag: '' },
];

// --- 模擬全域設定檔 ---
const mockConfig = {
    FEATURES: { ENABLE_BOOKING_SYSTEM: true, ENABLE_MEMBERSHIP_SYSTEM: true, ENABLE_SHOPPING_CART: true },
    TERMS: { BUSINESS_NAME: "DEMO 商店", PRODUCT_CATALOG_TITLE: "服務項目", NEWS_PAGE_TITLE: "最新情報", MEMBER_PROFILE_TITLE: "會員中心", BOOKING_NAME: "線上預約" },
    LOGIC: {
        ACTIVE_INDUSTRY_TEMPLATE: "studio",
        INDUSTRY_TEMPLATE_DEFINITIONS: {
            "studio": {
                "entityName": "服務", "entityNamePlural": "服務項目",
                "adminColumns": [{"key":"name","label":"服務項目"}, {"key":"category","label":"分類"}, {"key":"price","label":"價格"}],
                "fields": [
                    {"key":"name","label":"服務名稱","type":"text","required":true},
                    {"key":"category","label":"分類","type":"text","required":true},
                    {"key":"price","label":"價格","type":"number","required":true},
                    {"key":"description","label":"詳細介紹","type":"textarea"},
                    {"key":"images","label":"圖片網址","type":"json"},
                    {"key":"is_visible","label":"是否上架","type":"boolean"}
                ]
            }
        }
    }
};


// 如果 localStorage 是空的，就寫入初始資料
if (!localStorage.getItem('demo_products')) setMockData('products', initialProducts);
if (!localStorage.getItem('demo_users')) setMockData('users', initialUsers);
if (!localStorage.getItem('demo_bookings')) setMockData('bookings', []);


// --- 模擬 API 函式 ---
// 這個物件將會覆蓋掉真實的 api.js 物件
export const api = {
    // 模擬讀取
    getProducts: async () => { await delay(); return getMockData('products', []); },
    getUsers: async () => { await delay(); return getMockData('users', []); },
    getDashboardStats: async () => { await delay(); return { today_total_guests: 15 }; },
    getBookings: async () => { await delay(); return getMockData('bookings', []); },
    getExpHistory: async () => { await delay(); return []; },
    getAllNews: async () => { await delay(); return []; },
    getMessageDrafts: async () => { await delay(); return []; },
    getStoreInfo: async () => { await delay(); return { address: '範例地址', phone: '0987654321', opening_hours: '10:00-20:00', description: '這是DEMO模式的店家資訊' }; },
    getSettings: async () => { await delay(); return []; },
    // 【重要】補上 getAppConfig 的模擬
    getAppConfig: async () => { await delay(); return mockConfig; },


    // 模擬寫入 (Create)
    createProduct: async (data) => {
        await delay();
        const products = getMockData('products', []);
        const newProduct = { ...data, product_id: generateId('p-demo-'), display_order: products.length + 1 };
        products.push(newProduct);
        setMockData('products', products);
        return newProduct;
    },

    // 模擬更新 (Update)
    updateProductDetails: async (data) => {
        await delay();
        let products = getMockData('products', []);
        products = products.map(p => p.product_id === data.product_id ? { ...p, ...data } : p);
        setMockData('products', products);
        return { success: true };
    },
    updateProductOrder: async (orderedproductIds) => {
        await delay();
        let products = getMockData('products', []);
        const productMap = new Map(products.map(p => [p.product_id, p]));
        const orderedProducts = orderedproductIds.map((id, index) => {
            const product = productMap.get(id);
            if(product) product.display_order = index + 1;
            return product;
        }).filter(Boolean);
        orderedProducts.sort((a, b) => a.display_order - b.display_order);
        setMockData('products', orderedProducts);
        return { success: true };
    },
    toggleProductVisibility: async (productId, isVisible) => {
        await delay();
        let products = getMockData('products', []);
        products = products.map(p => p.product_id === productId ? { ...p, is_visible: isVisible ? 1 : 0 } : p);
        setMockData('products', products);
        return { success: true };
    },
    batchUpdateProducts: async (productIds, isVisible) => {
        await delay();
        let products = getMockData('products', []);
        products = products.map(p => productIds.includes(p.product_id) ? { ...p, is_visible: isVisible ? 1 : 0 } : p);
        setMockData('products', products);
        return { success: true };
    },

    sendMessage: async (userId, message) => {
        await delay(500);
        alert(`【DEMO 模式】訊息已模擬發送！\n\n收件人 ID: ${userId}\n內容: ${message}\n\n(在真實系統中，顧客此時會收到一則 LINE 通知)`);
        return { success: true };
    },    

    // 模擬刪除 (Delete)
    deleteProducts: async (productIds) => {
        await delay();
        let products = getMockData('products', []);
        products = products.filter(p => !productIds.includes(p.product_id));
        setMockData('products', products);
        return { success: true };
    },
    
    updateUserDetails: async (data) => { await delay(); alert('DEMO 模式：使用者資料已在您的瀏覽器中更新！'); return { success: true }; },
    createBooking: async (data) => { 
        await delay(); 
        const bookings = getMockData('bookings', []);
        const newBooking = { ...data, booking_id: generateId('b-demo-'), status: 'confirmed' };
        bookings.unshift(newBooking); // 加到最前面
        setMockData('bookings', bookings);
        alert('DEMO 模式：預約已模擬建立！'); 
        return { success: true }; 
    },

    // DEMO 模式專用：重設資料
    resetDemoData: async () => {
        await delay(1000);
        localStorage.clear(); // 清空所有 demo 資料
        // 重新寫入初始資料
        setMockData('products', initialProducts);
        setMockData('users', initialUsers);
        setMockData('bookings', []);
        return { success: true, message: 'DEMO 資料已重設' };
    },

    // 真實 API 中不存在的函式，但為了 DEMO 模式的完整性而加入
    checkAuthStatus: async () => {
        await delay(10);
        console.log("DEMO mode: Skipping auth check.");
        return { loggedIn: true };
    },
};

// 攔截所有 fetch 請求
const originalFetch = window.fetch;
window.fetch = async (url, options) => {
    console.log(`[DEMO Fetch] Intercepted: ${url}`);
    
    // 將 URL 轉換為對應的 api 物件中的函式名稱
    // 例如 /api/get-products -> getProducts
    const funcName = url.split('/').pop().replace(/-([a-z])/g, g => g[1].toUpperCase());

    if (api[funcName]) {
        console.log(`[DEMO Fetch] Mocking with function: ${funcName}`);
        
        // 模擬一個 Response 物件
        const mockResponse = {
            ok: true,
            status: 200,
            json: async () => api[funcName](options && options.body ? JSON.parse(options.body) : undefined),
        };
        
        // 模擬網路延遲
        await delay();
        return mockResponse;
    }

    // 如果 mock 中沒有對應的函式，就執行真實的 fetch (雖然在 DEMO 模式下應該用不到)
    console.log(`[DEMO Fetch] No mock found, performing real fetch for: ${url}`);
    return originalFetch(url, options);
};