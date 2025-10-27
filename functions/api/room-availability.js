// functions/api/room-availability.js

// 輔助函式：產生指定日期範圍內的所有日期字串 (YYYY-MM-DD)
// 注意：這個版本不包含 endDate 本身
function getDateRange(startDateStr, endDateStr) {
    const dates = [];
    let currentDate = new Date(startDateStr + 'T00:00:00');
    const endDate = new Date(endDateStr + 'T00:00:00'); // 結束日期本身不包含
    while (currentDate < endDate) {
        dates.push(currentDate.toISOString().split('T')[0]);
        currentDate.setDate(currentDate.getDate() + 1);
    }
    return dates;
}

// 輔助函式：根據日期字串獲取星期幾 (0=週日, 6=週六)
function getDayOfWeek(dateString) {
    const date = new Date(dateString + 'T00:00:00');
    return date.getDay();
}

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
        if (new Date(startDate) >= new Date(endDate)) { // endDate 必須晚於 startDate
            return new Response(JSON.stringify({ error: 'endDate 必須晚於 startDate' }), { status: 400 });
        }

        // --- 查詢資料 ---
        const dateRange = getDateRange(startDate, endDate);
        if (dateRange.length === 0) {
             return new Response(JSON.stringify({ error: '無效的日期範圍' }), { status: 400 });
        }

        // 1. 獲取指定範圍內的所有 `RoomInventory` 記錄
        // 我們需要查詢 startDate 到 endDate 前一天 的資料
        const inventoryQuery = "SELECT * FROM RoomInventory WHERE inventory_date BETWEEN ?1 AND ?2";
        const inventoryStmt = db.prepare(inventoryQuery);
        // 注意：endDate 參數需要減一天，因為 BETWEEN 包含兩端，但我們的 dateRange 不包含 endDate
        const lastDateInRange = dateRange[dateRange.length - 1];
        const { results: inventoryData } = await inventoryStmt.bind(startDate, lastDateInRange).all();

        // 2. 獲取所有房型的基本資料 (包含預設價格)
        // 假設民宿房型有一個特定分類或標籤，可以在此加入 WHERE 條件篩選
        const productsStmt = db.prepare("SELECT product_id, name, price_weekday, price_friday, price_saturday FROM Products"); // WHERE category = '房型'
        const { results: products } = await productsStmt.all();

        // --- 處理資料並組裝回應 ---
        const responseData = {};

        products.forEach(product => {
            let isAvailableOverall = true; // 先假設可訂
            let minQuantity = Infinity;
            let totalCalculatedPrice = 0;
            const dailyDetails = [];

            // 遍歷入住期間的每一天
            for (const dateStr of dateRange) {
                const dayOfWeek = getDayOfWeek(dateStr);
                const inventoryRecord = inventoryData.find(inv => inv.product_id === product.product_id && inv.inventory_date === dateStr);

                let dailyStatus = 'Closed';
                let dailyQuantity = 0;
                let dailyPrice = null;

                if (inventoryRecord) {
                    dailyStatus = inventoryRecord.status;
                    dailyQuantity = inventoryRecord.quantity_available;
                    dailyPrice = inventoryRecord.base_price;
                }
                // else { 維持預設 Closed, 0, null }

                // 確定當日實際價格
                if (dailyPrice === null) { // 如果 RoomInventory 沒設定特定價格
                    if (dayOfWeek === 5) { // 週五
                        dailyPrice = product.price_friday !== null ? product.price_friday : product.price_weekday;
                    } else if (dayOfWeek === 6) { // 週六
                        dailyPrice = product.price_saturday !== null ? product.price_saturday : product.price_weekday;
                    } else { // 平日 (日~四)
                        dailyPrice = product.price_weekday;
                    }
                }

                // 檢查當日是否可訂
                const isDailyAvailable = dailyStatus === 'Open' && dailyQuantity > 0 && dailyPrice !== null;

                // 更新整體可訂狀態和最小數量
                if (!isDailyAvailable) {
                    isAvailableOverall = false;
                }
                minQuantity = Math.min(minQuantity, dailyQuantity);

                // 累加總價 (只有在整體仍然可訂的情況下才有意義)
                if (isAvailableOverall) {
                    totalCalculatedPrice += dailyPrice; // 每日價格累加
                }

                // (可選) 記錄每日細節
                dailyDetails.push({
                    date: dateStr,
                    price: dailyPrice, // 當日的實際價格
                    available: dailyQuantity,
                    isBookable: isDailyAvailable // 標記當天是否可訂
                });
            } // End of dateRange loop

            // 如果從未找到任何房間 (例如整個範圍都沒有庫存記錄且預設關閉)
            if (minQuantity === Infinity) {
                minQuantity = 0;
                isAvailableOverall = false;
            }

            // 計算平均價格 (僅在可預訂時)
            const avgPricePerNight = isAvailableOverall && dateRange.length > 0 ? Math.round(totalCalculatedPrice / dateRange.length) : null;

            responseData[product.product_id] = {
                isAvailable: isAvailableOverall,
                minAvailableQuantity: minQuantity,
                totalPrice: isAvailableOverall ? totalCalculatedPrice : null,
                pricePerNight: avgPricePerNight, // 可以提供平均價
                // dailyDetails: dailyDetails // (選擇性回傳)
            };
        }); // End of products loop

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