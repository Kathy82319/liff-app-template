// functions/api/room-availability.js

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

        // --- 輸入驗證 ---
        if (!startDate || !endDate || !/^\d{4}-\d{2}-\d{2}$/.test(startDate) || !/^\d{4}-\d{2}-\d{2}$/.test(endDate)) {
            return new Response(JSON.stringify({ error: '請提供有效的 startDate 和 endDate (YYYY-MM-DD)' }), { status: 400 });
        }
        // endDate 必須嚴格晚於 startDate (因為範圍不包含 endDate)
        if (new Date(startDate) >= new Date(endDate)) {
            return new Response(JSON.stringify({ error: 'endDate 必須晚於 startDate' }), { status: 400 });
        }

        // --- 查詢資料 ---
        const dateRange = getDateRange(startDate, endDate); // 獲取入住期間的日期列表 (不含退房日)
        if (dateRange.length === 0) {
             // 如果 startDate 和 endDate 相鄰，則 dateRange 會是空的，也視為無效範圍
             return new Response(JSON.stringify({ error: '無效的日期範圍 (至少需入住一晚)' }), { status: 400 });
        }

        // 1. 獲取指定範圍內的所有 `RoomInventory` 記錄
        // 查詢範圍是入住期間的所有日期
        const inventoryQuery = "SELECT * FROM RoomInventory WHERE inventory_date BETWEEN ?1 AND ?2";
        const inventoryStmt = db.prepare(inventoryQuery);
        // 查詢的結束日期是 dateRange 中的最後一天 (即退房日的前一天)
        const lastDateInRange = dateRange[dateRange.length - 1];
        const { results: inventoryData } = await inventoryStmt.bind(startDate, lastDateInRange).all();

        // 2. 獲取所有房型的基本資料 (包含預設價格)
        // TODO: 這裡可以優化，只查詢民宿相關的房型 (例如： WHERE category = '房型')
        const productsStmt = db.prepare("SELECT product_id, name, price_weekday, price_friday, price_saturday FROM Products");
        const { results: products } = await productsStmt.all();

        // --- 處理資料並組裝回應 ---
        const responseData = {};

        // 遍歷所有房型
        products.forEach(product => {
            let isAvailableOverall = true; // 先假設此房型在整個期間都可訂
            let minQuantity = Infinity;    // 記錄期間內最小的可訂數量
            let totalCalculatedPrice = 0;  // 累加期間總價
            const dailyDetails = [];       // (可選) 記錄每日細節

            // 遍歷入住期間的每一天 (dateRange 不含退房日)
            for (const dateStr of dateRange) {
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
                    // 如果連平日價都沒有，dailyPrice 會維持 null
                }

                // 檢查當天是否真正可預訂 (狀態開啟、數量>0、價格有效且>0)
                const isDailyAvailable = dailyStatus === 'Open' && dailyQuantity > 0 && dailyPrice !== null && dailyPrice > 0;

                // 更新整體的狀態和最小數量
                if (!isDailyAvailable) {
                    isAvailableOverall = false; // 只要有一天不可訂，整體就不可訂
                }
                // 更新期間內的最小剩餘數量 (即使當天不可訂，也要更新最小值，可能是 0)
                minQuantity = Math.min(minQuantity, dailyQuantity);

                // 累加總價 (只有在價格有效時才累加)
                if (dailyPrice !== null && dailyPrice > 0) {
                    totalCalculatedPrice += dailyPrice;
                } else {
                    // 如果某天價格無效，雖然可能仍有房間 (dailyQuantity>0)，但總價計算會忽略這天
                    // isAvailableOverall 已被設為 false，所以最終 totalPrice 會是 null
                }

                // (可選) 記錄每日細節
                dailyDetails.push({
                    date: dateStr,
                    price: dailyPrice,        // 當日的實際價格
                    available: dailyQuantity, // 當日剩餘數量
                    isBookable: isDailyAvailable // 標記當天是否可訂
                });
            } // --- 每日檢查結束 ---

            // 處理邊界情況：如果從未找到任何房間記錄 (minQuantity 仍是 Infinity)
            if (minQuantity === Infinity) {
                minQuantity = 0;         // 實際可訂數量為 0
                isAvailableOverall = false; // 確保整體不可訂
            }

            // 計算平均每晚價格 (僅在總價大於0時計算)
            const avgPricePerNight = totalCalculatedPrice > 0 && dateRange.length > 0 ? Math.round(totalCalculatedPrice / dateRange.length) : null;

            // 儲存此房型的最終結果
            responseData[product.product_id] = {
                isAvailable: isAvailableOverall,                // 整體是否可訂
                minAvailableQuantity: minQuantity,              // 期間最小剩餘數量
                totalPrice: isAvailableOverall ? totalCalculatedPrice : null, // 只有整體可訂才提供總價
                pricePerNight: avgPricePerNight,                // 平均每晚價格
                dailyDetails: dailyDetails // (可選擇是否回傳每日細節給前端)
            };
        }); // --- 房型遍歷結束 ---

        // 回傳所有房型的結果
        return new Response(JSON.stringify(responseData), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
        });

    } catch (error) {
        console.error('Error in api/room-availability API:', error);
        return new Response(JSON.stringify({ error: '查詢房型可用性失敗', details: error.message }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' },
        });
    }
}