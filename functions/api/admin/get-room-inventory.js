// functions/api/admin/get-room-inventory.js

import { getDateRange, getDayOfWeek } from '../utils/date-helpers.js';

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
        if (new Date(startDate) > new Date(endDate)) {
            return new Response(JSON.stringify({ error: 'startDate 不能晚於 endDate' }), { status: 400 });
        }

        // --- 查詢資料 ---
        // 1. 獲取指定範圍內的所有 `RoomInventory` 記錄
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
        } else {
             // 假設民宿房型有一個特定分類或標籤，可以在此加入 WHERE 條件篩選，提高效率
             // 例如: productsQuery += " WHERE category = '房型'";
        }
        const productsStmt = db.prepare(productsQuery);
        const { results: products } = await productsStmt.bind(...productParams).all();

        // --- 處理資料並組裝回應 ---
        const responseData = {};
        const dateRange = getDateRange(startDate, endDate);

        // 初始化所有房型的結構
        products.forEach(product => {
            responseData[product.product_id] = {};
        });

        // 遍歷日期範圍，為每個房型填入資料
        dateRange.forEach(dateStr => {
            const dayOfWeek = getDayOfWeek(dateStr);

            products.forEach(product => {
                // 查找當天是否有特定的庫存記錄
                const inventoryRecord = inventoryData.find(inv => inv.product_id === product.product_id && inv.inventory_date === dateStr);

                let status = 'Closed';
                let quantity = 0;
                let price = null;

                if (inventoryRecord) {
                    // 如果有記錄，使用記錄的值
                    status = inventoryRecord.status;
                    quantity = inventoryRecord.quantity_available;
                    price = inventoryRecord.base_price; // 可能是數字或 null
                }
                // else {
                // 如果沒有記錄，維持預設 Closed, 0, null
                // }

                // 如果 RoomInventory 價格為 null，嘗試抓取 Products 的預設價格
                if (price === null) {
                    if (dayOfWeek === 5) { // 週五
                        price = product.price_friday !== null ? product.price_friday : product.price_weekday;
                    } else if (dayOfWeek === 6) { // 週六
                        price = product.price_saturday !== null ? product.price_saturday : product.price_weekday;
                    } else { // 平日 (日~四)
                        price = product.price_weekday;
                    }
                }

                responseData[product.product_id][dateStr] = {
                    status: status,
                    quantity_available: quantity,
                    base_price: price // 最終價格 (可能是特定價或預設價)
                };
            });
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