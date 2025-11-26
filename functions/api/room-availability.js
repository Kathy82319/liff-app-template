import { getDateRange, getDayOfWeek } from './utils/date-helpers.js';

export async function onRequest(context) {
    try {
        if (context.request.method !== 'GET') {
            return new Response(JSON.stringify({ error: '無效的請求方法' }), { status: 405 });
        }

        const { request, env } = context;
        const db = env.DB;
        const url = new URL(request.url);

        const startDate = url.searchParams.get('startDate');
        const endDate = url.searchParams.get('endDate');
        const productIdFilter = url.searchParams.get('productId');

        // --- 輸入驗證 ---
        if (!startDate || !endDate || !/^\d{4}-\d{2}-\d{2}$/.test(startDate) || !/^\d{4}-\d{2}-\d{2}$/.test(endDate)) {
            return new Response(JSON.stringify({ error: '請提供有效的 startDate 和 endDate (YYYY-MM-DD)' }), { status: 400 });
        }
        if (new Date(startDate) >= new Date(endDate)) {
            return new Response(JSON.stringify({ error: 'startDate 必須早於 endDate (至少入住一晚)' }), { status: 400 });
        }

        // --- 查詢資料 ---
        // 1. 獲取指定範圍內的所有 `RoomInventory` 記錄
        // 我們需要查詢範圍內的所有設定 (包含退房日，以防萬一需要顯示)，但計算價格時會排除退房日
        let inventoryQuery = "SELECT * FROM RoomInventory WHERE inventory_date BETWEEN ?1 AND ?2";
        const queryParams = [startDate, endDate];
        if (productIdFilter) {
            inventoryQuery += " AND product_id = ?3";
            queryParams.push(productIdFilter);
        }
        const inventoryStmt = db.prepare(inventoryQuery);
        const { results: inventoryData } = await inventoryStmt.bind(...queryParams).all();

        // 2. 獲取所有（或指定）房型的基本資料 (包含預設價格)
        let productsQuery = "SELECT product_id, name, price_weekday, price_friday, price_saturday FROM Products";
        const productParams = [];
        if (productIdFilter) {
             productsQuery += " WHERE product_id = ?1";
             productParams.push(productIdFilter);
        }
        const productsStmt = db.prepare(productsQuery);
        const { results: products } = await productsStmt.bind(...productParams).all();

        // --- 處理資料並組裝回應 ---
        const responseData = {};
        
        // 【修正重點】取得完整日期範圍，但計算價格與檢查庫存時排除最後一天 (退房日)
        const fullDateRange = getDateRange(startDate, endDate);
        
        // 實際入住的夜晚 (排除退房日)
        // 例如：1/1 入住，1/2 退房。fullDateRange = [1/1, 1/2]。stayDates = [1/1]。
        const stayDates = fullDateRange.slice(0, -1); 

        if (stayDates.length === 0) {
             // 理論上前面的驗證已擋掉，但防呆
             return new Response(JSON.stringify({}), { status: 200, headers: { 'Content-Type': 'application/json' } });
        }

        // 初始化所有房型的結構
        products.forEach(product => {
            responseData[product.product_id] = {};
        });

        // 針對每個房型計算
        products.forEach(product => {
            let isAvailableOverall = true; // 先假設此房型在整個期間都可訂
            let minQuantity = Infinity;    // 記錄期間內最小的可訂數量
            let totalCalculatedPrice = 0;  // 累加期間總價
            const dailyDetails = [];       // (可選) 記錄每日細節

            // 【修正重點】只遍歷「入住夜」(stayDates) 來計算價格與檢查庫存
            for (const dateStr of stayDates) {
                const dayOfWeek = getDayOfWeek(dateStr); // 獲取星期幾
                // 查找當天是否有特定的庫存記錄
                const inventoryRecord = inventoryData.find(inv => inv.product_id === product.product_id && inv.inventory_date === dateStr);

                // 初始化每日狀態、數量、價格
                let dailyStatus = 'Closed';
                let dailyQuantity = 0;
                let dailyPrice = null;

                if (inventoryRecord) { // 如果有當日特定設定
                    dailyStatus = inventoryRecord.status;
                    dailyQuantity = inventoryRecord.quantity_available;
                    dailyPrice = inventoryRecord.base_price; // 可能是數字或 null
                }
                // else { 如果沒有記錄，維持預設 Closed, 0, null }

                // 確定當日實際價格
                if (dailyPrice === null) { // 如果 RoomInventory 沒設定特定價格，則參考 Products 預設價
                    if (dayOfWeek === 5) { // 週五
                        dailyPrice = product.price_friday !== null ? product.price_friday : product.price_weekday;
                    } else if (dayOfWeek === 6) { // 週六
                        dailyPrice = product.price_saturday !== null ? product.price_saturday : product.price_weekday;
                    } else { // 平日 (日~四)
                        dailyPrice = product.price_weekday;
                    }
                }

                // 檢查當天是否真正可預訂 (狀態開啟、數量>0、價格有效且>0)
                const isDailyAvailable = dailyStatus === 'Open' && dailyQuantity > 0 && dailyPrice !== null && dailyPrice > 0;

                // 更新整體的狀態和最小數量
                if (!isDailyAvailable) {
                    isAvailableOverall = false; 
                }
                // 更新期間內的最小剩餘數量
                if (dailyStatus === 'Open') {
                     minQuantity = Math.min(minQuantity, dailyQuantity);
                } else {
                     minQuantity = 0; // 如果沒開，可用數量視為 0
                }

                // 累加總價
                if (dailyPrice !== null && dailyPrice > 0) {
                    totalCalculatedPrice += dailyPrice;
                } else {
                    // 價格無效，無法計算總價
                    isAvailableOverall = false; 
                }

                dailyDetails.push({
                    date: dateStr,
                    price: dailyPrice,
                    available: dailyQuantity,
                    isBookable: isDailyAvailable
                });
            }

            // 處理邊界情況
            if (minQuantity === Infinity) {
                minQuantity = 0;
                isAvailableOverall = false;
            }

            // 計算平均每晚價格
            const avgPricePerNight = totalCalculatedPrice > 0 && stayDates.length > 0 ? Math.round(totalCalculatedPrice / stayDates.length) : null;

            // 儲存此房型的最終結果
            responseData[product.product_id] = {
                isAvailable: isAvailableOverall,
                minAvailableQuantity: minQuantity,
                totalPrice: isAvailableOverall ? totalCalculatedPrice : null, // 總價
                pricePerNight: avgPricePerNight,
                dailyDetails: dailyDetails
            };
        });

        return new Response(JSON.stringify(responseData), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
        });

    } catch (error) {
        console.error('Error in admin/get-room-inventory API:', error);
        return new Response(JSON.stringify({ error: '獲取房量資料失敗', details: error.message }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' },
        });
    }
}