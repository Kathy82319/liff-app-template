// functions/api/admin/update-product-details.js (v4 - 增強數值處理與偵錯)
export async function onRequest(context) {
    try {
        if (context.request.method !== 'POST') {
            return new Response('Invalid request method.', { status: 405 });
        }

        const body = await context.request.json();
        const { product_id } = body;
        console.log("[update-product-details] Received body:", JSON.stringify(body)); // **偵錯 Log 1: 顯示收到的完整 body**


        if (!product_id) {
            return new Response(JSON.stringify({ error: '缺少 product_id' }), { status: 400 });
        }

        const allowedFields = [
            'name', 'description', 'category', 'images', 'is_visible',
            'inventory_management_type', 'stock_quantity', 'stock_status',
            'price_type', /* 'price', */
            'price_weekday', 'price_friday', 'price_saturday', // 價格欄位
            'price_options',
            'spec_1_name', 'spec_1_value', 'spec_2_name', 'spec_2_value',
            'spec_3_name', 'spec_3_value', 'spec_4_name', 'spec_4_value',
            'spec_5_name', 'spec_5_value',
            'filter_1', 'filter_2', 'filter_3'
            // 'display_order' // 如果需要更新順序，要從這裡取消註解
        ];

        const updates = [];
        const values = [];

        for (const key in body) {
            if (allowedFields.includes(key) && key !== 'product_id') {
                updates.push(`${key} = ?`);
                let valueToBind;
                const frontendValue = body[key];

                // --- 【核心修改】更穩健的數值與空值處理 ---
                if (typeof frontendValue === 'boolean') {
                    valueToBind = frontendValue ? 1 : 0; // 布林轉 0/1
                } else if (key.startsWith('price_') || key === 'stock_quantity') {
                    // 數字欄位處理
                    if (frontendValue === null || frontendValue === undefined || frontendValue === '') {
                        valueToBind = null; // 明確的空值轉為 NULL
                    } else {
                        const num = parseFloat(frontendValue);
                        valueToBind = isNaN(num) ? null : num; // 解析失敗也轉為 NULL
                    }
                } else if (frontendValue === null || frontendValue === undefined) {
                     valueToBind = null; // 其他欄位的空值也轉 NULL (例如 description)
                }
                else {
                    valueToBind = frontendValue; // 其他類型直接使用
                }
                // --- 【修改結束】 ---

                values.push(valueToBind);
            }
        }

        if (updates.length === 0) {
            console.warn("[update-product-details] No valid fields to update found in body for product:", product_id); // **偵錯 Log 2: 無有效欄位**
            // 即使沒有欄位更新，也回傳成功，因為可能是使用者沒改東西就按儲存
            return new Response(JSON.stringify({ success: true, message: '沒有需要更新的欄位。' }), {
                 status: 200, headers: { 'Content-Type': 'application/json' },
            });
        }

        // --- 加入 updated_at ---
        updates.push('updated_at = CURRENT_TIMESTAMP'); // 自動更新時間戳

        const sql = `UPDATE Products SET ${updates.join(', ')} WHERE product_id = ?`;
        values.push(product_id); // 最後一個 ? 對應 product_id

        console.log("[update-product-details] SQL:", sql);                 // **偵錯 Log 3: 顯示最終 SQL**
        console.log("[update-product-details] Values:", JSON.stringify(values)); // **偵錯 Log 4: 顯示綁定值**


        const db = context.env.DB;
        const stmt = db.prepare(sql);
        const result = await stmt.bind(...values).run();

        console.log("[update-product-details] D1 Result:", JSON.stringify(result)); // **偵錯 Log 5: 顯示 D1 執行結果**


        if (result.meta.changes === 0) {
             // **增加 Log，區分是找不到 ID 還是資料沒變**
             // 可以嘗試再 SELECT 一次確認 ID 是否存在
             const checkStmt = db.prepare("SELECT 1 FROM Products WHERE product_id = ?");
             const exists = await checkStmt.bind(product_id).first();
             if (!exists) {
                 console.error(`[update-product-details] Update failed: Product ID not found: ${product_id}`);
                 return new Response(JSON.stringify({ error: `找不到產品 ID: ${product_id}，無法更新。` }), { status: 404 });
             } else {
                  console.warn(`[update-product-details] Update executed but no changes made for product ID: ${product_id}. Data might be identical or invalid.`);
                  // 雖然沒變更，但 API 執行成功，仍回傳 200 給前端
                 return new Response(JSON.stringify({ success: true, message: '資料未變更。' }), {
                     status: 200, headers: { 'Content-Type': 'application/json' },
                 });
             }
        }

        // 執行成功且有變更
        console.log(`[update-product-details] Successfully updated product ID: ${product_id}`);
        return new Response(JSON.stringify({ success: true, message: '成功更新產品資訊！' }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
        });

    } catch (error) {
        console.error('Error in update-product-details API:', error);
        console.error("Failing request body:", await context.request.text().catch(() => 'Failed to read body')); // **偵錯 Log 6: 顯示失敗時的 body**
        return new Response(JSON.stringify({ error: '更新產品資訊失敗。', details: error.message }), { status: 500 });
    }
}