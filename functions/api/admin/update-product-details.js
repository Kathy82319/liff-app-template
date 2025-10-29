// functions/api/admin/update-product-details.js (v5 - Add Post-Update Read & Check)
export async function onRequest(context) {
    try {
        if (context.request.method !== 'POST') {
            return new Response('Invalid request method.', { status: 405 });
        }

        const body = await context.request.json();
        const { product_id } = body;
        console.log("[v5 update-product-details] Received body:", JSON.stringify(body));


        if (!product_id) {
            return new Response(JSON.stringify({ error: '缺少 product_id' }), { status: 400 });
        }

        // 允許更新的欄位白名單 (保持不變)
        const allowedFields = [
             'name', 'description', 'category', 'images', 'is_visible',
             'inventory_management_type', 'stock_quantity', 'stock_status',
             'price_type', /* 'price', */
             'price_weekday', 'price_friday', 'price_saturday',
             'price_options',
             'spec_1_name', 'spec_1_value', 'spec_2_name', 'spec_2_value',
             'spec_3_name', 'spec_3_value', 'spec_4_name', 'spec_4_value',
             'spec_5_name', 'spec_5_value',
             'filter_1', 'filter_2', 'filter_3'
        ];

        const updates = [];
        const values = [];

        // 遍歷前端送來的資料，準備 SQL 更新 (處理數值/空值，保持不變)
        for (const key in body) {
            if (allowedFields.includes(key) && key !== 'product_id') {
                updates.push(`${key} = ?`);
                let valueToBind;
                const frontendValue = body[key];

                if (typeof frontendValue === 'boolean') {
                    valueToBind = frontendValue ? 1 : 0;
                } else if (key.startsWith('price_') || key === 'stock_quantity') {
                    if (frontendValue === null || frontendValue === undefined || frontendValue === '') {
                        valueToBind = null;
                    } else {
                        const num = parseFloat(frontendValue);
                        valueToBind = isNaN(num) ? null : num;
                    }
                } else if (frontendValue === null || frontendValue === undefined) {
                     valueToBind = null;
                } else {
                    valueToBind = frontendValue;
                }
                values.push(valueToBind);
            }
        }

        // 如果沒有有效欄位可更新 (使用者可能沒改東西就儲存)
        if (updates.length === 0) {
             console.warn("[v5 update-product-details] No valid fields to update found.");
            return new Response(JSON.stringify({ success: true, message: '沒有需要更新的欄位。' }), {
                 status: 200, headers: { 'Content-Type': 'application/json' },
            });
        }

        // 加入 updated_at 並組合 SQL
        updates.push('updated_at = CURRENT_TIMESTAMP');
        const sql = `UPDATE Products SET ${updates.join(', ')} WHERE product_id = ?`;
        values.push(product_id); // product_id 是 WHERE 條件的值

        console.log("[v5 update-product-details] SQL:", sql);
        console.log("[v5 update-product-details] Values:", JSON.stringify(values));

        const db = context.env.DB;
        const updateStmt = db.prepare(sql);
        let updateResult;

        // --- 執行 UPDATE ---
        try {
             updateResult = await updateStmt.bind(...values).run();
             console.log("[v5 update-product-details] D1 Update Result:", JSON.stringify(updateResult)); // Log 更新結果
        } catch (dbError) {
             console.error("[v5 update-product-details] D1 UPDATE Error:", dbError);
             throw new Error(`資料庫更新操作失敗: ${dbError.message}`);
        }

        // --- ****** 新增：執行後立即回讀 ****** ---
        let readBackData = null;
        // 只有在 UPDATE 成功回傳後才執行回讀
        if (updateResult && updateResult.success) {
            try {
                 console.log(`[v5 update-product-details] Attempting to read back product ID: ${product_id}`);
                 const readStmt = db.prepare("SELECT * FROM Products WHERE product_id = ?");
                 readBackData = await readStmt.bind(product_id).first();
                 console.log("[v5 update-product-details] Read back data:", JSON.stringify(readBackData)); // **偵錯 Log 7: 顯示回讀結果**
            } catch (readError) {
                 console.error("[v5 update-product-details] D1 Read Back Error:", readError);
                 readBackData = { error: `Read back failed: ${readError.message}` };
            }
        } else {
            console.warn("[v5 update-product-details] Skipping read back because update result was not successful.");
        }
        // --- ****** 回讀結束 ****** ---

        // 重新檢查 changes，即使 result.success 為 true 也可能 changes 為 0
        if (!updateResult || !updateResult.success || updateResult.meta.changes === 0) {
            // 如果 changes 為 0，檢查是不是 ID 不存在
            const checkStmt = db.prepare("SELECT 1 FROM Products WHERE product_id = ?");
            const exists = await checkStmt.bind(product_id).first();
            if (!exists) {
                 console.error(`[v5 update-product-details] Update failed: Product ID not found: ${product_id}`);
                 return new Response(JSON.stringify({ error: `找不到產品 ID: ${product_id}，無法更新。` }), { status: 404 });
            } else {
                  console.warn(`[v5 update-product-details] Update reported no changes for product ID: ${product_id}. Read back: ${JSON.stringify(readBackData)}`);
                 // 回傳包含回讀資料的警告訊息
                 return new Response(JSON.stringify({
                      success: true, // API 本身沒錯
                      message: '資料庫回報未變更 (可能新舊值相同)。',
                      readBack: readBackData // 將回讀結果傳給前端 (或只在 log 看)
                 }), {
                     status: 200, headers: { 'Content-Type': 'application/json' },
                 });
            }
        }

        // 執行成功且有變更
        console.log(`[v5 update-product-details] Successfully updated product ID: ${product_id}.`);
        // **比較回讀資料和送出的資料 (僅比較有送出的欄位)**
        let readMatch = true;
        if (readBackData && typeof readBackData === 'object' && !readBackData.error) {
            for (const key in body) {
                 if (allowedFields.includes(key) && key !== 'product_id') {
                     let expectedValue = body[key];
                     let readValue = readBackData[key];
                     // 特殊處理 boolean (資料庫存 0/1)
                     if (typeof expectedValue === 'boolean') {
                         expectedValue = expectedValue ? 1 : 0;
                     }
                     // 特殊處理數字空值 (前端 "" vs 資料庫 null)
                     if ((key.startsWith('price_') || key === 'stock_quantity') && expectedValue === '') {
                          expectedValue = null;
                     }
                     // 特殊處理 JSON 字串 (images)
                     if (key === 'images' && typeof expectedValue !== 'string') {
                          expectedValue = JSON.stringify(expectedValue); // 確保是字串比較
                     }
                     // 進行比較 (注意 null == undefined 是 true，但不嚴格相等)
                     if (readValue !== expectedValue && !(readValue === null && expectedValue === undefined)) {
                          console.warn(`[v5 Mismatch Check] Field '${key}': Expected '${expectedValue}' (type: ${typeof expectedValue}), Read back '${readValue}' (type: ${typeof readValue})`);
                          readMatch = false;
                     }
                 }
            }
        } else {
             readMatch = false; // 回讀失敗視為不匹配
        }

        console.log(`[v5 update-product-details] Read back data matches sent data: ${readMatch}`);

        return new Response(JSON.stringify({
             success: true,
             message: '成功更新產品資訊！',
             readBack: readBackData, // (可選) 將回讀結果傳給前端
             readMatch: readMatch   // (可選) 將比對結果傳給前端
        }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
        });

    } catch (error) {
        console.error('Error in v5 update-product-details API:', error);
        console.error("Failing request body:", await context.request.text().catch(() => 'Failed to read body'));
        return new Response(JSON.stringify({ error: '更新產品資訊失敗。', details: error.message }), { status: 500 });
    }
}