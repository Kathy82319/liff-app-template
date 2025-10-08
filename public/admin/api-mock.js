// public/admin/api-mock.js (DEMO 模式專用的模擬 API)

// --- 模擬資料庫 & 輔助工具 ---

// 模擬資料庫，從 localStorage 讀取，若無則使用預設值
const getMockData = (key, defaultValue) => {
    const stored = localStorage.getItem(`demo_${key}`);
    return stored ? JSON.parse(stored) : defaultValue;
};

// 將資料存回 localStorage
const setMockData = (key, data) => {
    localStorage.setItem(`demo_${key}`, JSON.stringify(data));
};

// 產生一個簡單的亂數 ID
const generateId = (prefix = '') => prefix + Math.random().toString(36).substr(2, 9);

// 模擬網路延遲
const delay = (ms = 200) => new Promise(res => setTimeout(res, ms));


// --- 預設的範例資料 ---
const initialProducts = [
    { product_id: 'p-demo001', name: '【範例】夏季攝影速成班', category: '課程', price: 2500, display_order: 1, is_visible: 1, inventory_management_type: 'status', stock_status: '尚有名額' },
    { product_id: 'p-demo002', name: '【範例】手沖咖啡體驗', category: '餐飲', price: 800, display_order: 2, is_visible: 1, inventory_management_type: 'quantity', stock_quantity: 10 },
    { product_id: 'p-demo003', name: '【範例】VIP 場地租借', category: '服務', price: 5000, display_order: 3, is_visible: 1, inventory_management_type: 'none' },
    { product_id: 'p-demo004', name: '【範例】已下架的舊活動', category: '課程', price: 1200, display_order: 4, is_visible: 0, inventory_management_type: 'none' },
];

const initialUsers = [
    { user_id: 'U-demo-12345', line_display_name: '體驗顧客A', nickname: '小明', class: 'VIP會員', level: 5, current_exp: 5, perk: '餐飲9折', tag: '常客' },
    { user_id: 'U-demo-67890', line_display_name: '體驗顧客B', nickname: '莉莉', class: '普通會員', level: 2, current_exp: 8, perk: '無', tag: '' },
];

// 如果 localStorage 是空的，就寫入初始資料
if (!localStorage.getItem('demo_products')) {
    setMockData('products', initialProducts);
}
if (!localStorage.getItem('demo_users')) {
    setMockData('users', initialUsers);
}


// --- 模擬 API 函式 ---

export const api = {
    // 模擬讀取
    getProducts: async () => {
        await delay();
        return getMockData('products', []);
    },
    getUsers: async () => {
        await delay();
        return getMockData('users', []);
    },
    // 其他 get... 函式可以依此類推，暫時回傳空陣列
    getDashboardStats: async () => { await delay(); return { today_total_guests: 15 }; },
    getBookings: async () => { await delay(); return []; },
    getExpHistory: async () => { await delay(); return []; },
    getAllNews: async () => { await delay(); return []; },
    getMessageDrafts: async () => { await delay(); return []; },
    getStoreInfo: async () => { await delay(); return { address: '範例地址', phone: '0987654321', opening_hours: '10:00-20:00', description: '這是DEMO模式的店家資訊' }; },
    getSettings: async () => { await delay(); return []; },


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


    // 模擬刪除 (Delete)
    deleteProducts: async (productIds) => {
        await delay();
        let products = getMockData('products', []);
        products = products.filter(p => !productIds.includes(p.product_id));
        setMockData('products', products);
        return { success: true };
    },

    // 對於其他修改性質的 API，先回傳一個提示
    updateUserDetails: async (data) => { await delay(500); alert('DEMO 模式：使用者資料已在您的瀏覽器中更新！'); return { success: true }; },
    createBooking: async (data) => { await delay(500); alert('DEMO 模式：預約已模擬建立！'); return { success: true }; },
    // ... 其他函式可以依此類推

    // DEMO 模式專用：重設資料
    resetDemoData: async () => {
        await delay(1000);
        localStorage.removeItem('demo_products');
        localStorage.removeItem('demo_users');
        // 可在此處加入其他要清除的項目
        // 重新寫入初始資料
        setMockData('products', initialProducts);
        setMockData('users', initialUsers);
        return { success: true, message: 'DEMO 資料已重設' };
    },

    // 真實 API 中不存在的函式，但為了 DEMO 模式的完整性而加入
    checkAuthStatus: async () => {
        await delay(10);
        console.log("DEMO mode: Skipping auth check.");
        return { loggedIn: true };
    },
};