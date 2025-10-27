// functions/api/admin/update-room-inventory.js

// 輔助函式：產生指定日期範圍內的所有日期字串 (YYYY-MM-DD)
function getDateRange(startDateStr, endDateStr) {
    const dates = [];
    let currentDate = new Date(startDateStr + 'T00:00:00');
    const endDate = new Date(endDateStr + 'T00:00:00');
    while (currentDate <= endDate) {
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

// D1 Upsert 輔助函式 (修正 key 檢查與資料類型處理 v2)
function prepareUpsertStatement(db, updates) {
    const baseFields = ['product_id', 'inventory_date'];
    const conflictTarget = '(product_id, inventory_date)';

    // 檢查前端可能傳來的 key
    const possibleFrontendKeys = {
        status: 'status', // 前端 key: DB 欄位
        quantity: 'quantity_available',
        price: 'base_price'
    };

    const updatePlaceholders = [];
    const updateSetClauses = [];
    const bindValuesOrder = []; // 記錄 DB 欄位順序

    // **重要**: 確保 updates 是陣列且至少有一個元素
    if (!Array.isArray(updates) || updates.length === 0) {
        throw new Error("prepareUpsertStatement: 'updates' 參數必須是非空陣列");
    }
    const firstUpdate = updates[0];
    // **重要**: 確保 firstUpdate 是物件
    if (typeof firstUpdate !== 'object' || firstUpdate === null) {
        throw new Error("prepareUpsertStatement: 'updates' 陣列中的元素必須是物件");
    }


    // 遍歷前端可能傳來的 key
    for (const frontendKey in possibleFrontendKeys) {
        // 檢查第一筆 update 資料是否包含這個前端 key
        // **重要**: 使用 Object.prototype.hasOwnProperty.call 避免原型鏈問題
        if (Object.prototype.hasOwnProperty.call(firstUpdate, frontendKey)) {
            const dbField = possibleFrontendKeys[frontendKey]; // 取得對應的 DB 欄位
            updatePlaceholders.push('?');
            updateSetClauses.push(`${dbField} = excluded.${dbField}`); // SQL 使用 DB 欄位
            bindValuesOrder.push(dbField); // 記錄 DB 欄位以便後續綁定
        }
    }


    if (bindValuesOrder.length === 0) {
        // 這個錯誤訊息現在是正確的
        throw new Error("沒有提供任何有效的更新欄位 (status, quantity, price)");
    }

    const allFields = [...baseFields, ...bindValuesOrder];
    const allPlaceholders = ['?', '?', ...updatePlaceholders];

    const sql = `
        INSERT INTO RoomInventory (${allFields.join(', ')})
        VALUES (${allPlaceholders.join(', ')})
        ON CONFLICT ${conflictTarget} DO UPDATE SET
        ${updateSetClauses.join(', ')}
    `;

    // console.log("[prepareUpsertStatement v3] SQL:", sql); // 除錯用
    // console.log("[prepareUpsertStatement v3] Fields to Bind:", [...baseFields, ...bindValuesOrder]); // 除錯用

    try {
        return {
            stmt: db.prepare(sql),
            fieldsToBind: [...baseFields, ...bindValuesOrder] // 傳回 DB 欄位順序
        };
    } catch (e) {
         console.error("Error preparing statement:", e, "SQL:", sql);
         throw e; // 將錯誤重新拋出
    }
}


export async function onRequest(context) {
    try {
        if (context.request.method !== 'POST') {
            return new Response(JSON.stringify({ error: '無效的請求方法' }), { status: 405 });
        }

        const { request, env } = context;
        const db = env.DB;
        const body = await request.json();

        let operations = []; // 存放所有要執行的 D1 操作

        // --- 判斷是單筆/多筆獨立更新還是批次範圍更新 ---

        // 類型 1: 多筆獨立更新 (來自前端直接點擊儲存格)
        if (Array.isArray(body.updates)) {
            const updatesArray = body.updates;
            if (updatesArray.length === 0) {
                 return new Response(JSON.stringify({ error: 'updates 陣列不可為空' }), { status: 400 });
            }

            // 驗證每一筆更新
            for (const update of updatesArray) {
                 if (!update.productId || !update.date || !/^\d{4}-\d{2}-\d{2}$/.test(update.date)) {
                     throw new Error("每筆更新必須包含有效的 productId 和 date (YYYY-MM-DD)");
                 }
                 if (update.status && !['Open', 'Closed'].includes(update.status)) {
                     throw new Error(`無效的 status 值: ${update.status}`);
                 }
                 if (update.quantity !== undefined && (!Number.isInteger(Number(update.quantity)) || Number(update.quantity) < 0)) {
                      throw new Error(`quantity 必須是非負整數: ${update.quantity}`);
                 }
                 if (update.price !== undefined && update.price !== null && (typeof update.price !== 'number' || !Number.isInteger(Number(update.price)) || Number(update.price) < 0)) {
                     throw new Error(`price 必須是非負整數或 null: ${update.price}`);
                 }
                 // **新增驗證**: 確保至少有一個要更新的欄位
                 if (!update.hasOwnProperty('status') && !update.hasOwnProperty('quantity') && !update.hasOwnProperty('price')) {
                     throw new Error(`更新物件必須包含 status, quantity 或 price 其中至少一項`);
                 }
            }

            // 準備 Upsert 語句
            const { stmt, fieldsToBind } = prepareUpsertStatement(db, updatesArray);

            // 為每一筆更新生成綁定操作
            operations = updatesArray.map(update => {
                 const values = fieldsToBind.map(field => {
                     let valueToBind;
                     switch (field) { // field 是 DB 欄位名
                         case 'product_id': valueToBind = update.productId; break;
                         case 'inventory_date': valueToBind = update.date; break;
                         case 'status': valueToBind = update.status; break; // TEXT
                         case 'quantity_available': valueToBind = update.quantity !== undefined && update.quantity !== null ? Number(update.quantity) : null; break; // INTEGER or NULL
                         case 'base_price': valueToBind = update.price !== undefined && update.price !== null ? Number(update.price) : null; break; // INTEGER or NULL
                         default: valueToBind = null; // 預設給 null 以防萬一
                     }
                     return valueToBind;
                 });
                 // console.log("單筆更新 Binding values:", values); // 除錯用
                 return stmt.bind(...values);
            });

        // 類型 2: 批次範圍更新 (來自批次修改功能)
        } else if (body.productId && body.startDate && body.endDate && Array.isArray(body.weekdays) && body.updateValues) {
            const { productId, startDate, endDate, weekdays, updateValues } = body;

            // 驗證批次更新參數
            if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate) || !/^\d{4}-\d{2}-\d{2}$/.test(endDate) || new Date(startDate) > new Date(endDate)) {
                 throw new Error("請提供有效的 startDate 和 endDate");
            }
            if (weekdays.some(day => !Number.isInteger(day) || day < 0 || day > 6)) {
                 throw new Error("weekdays 陣列包含無效的星期數值 (應為 0-6)");
            }
            if (updateValues.status && !['Open', 'Closed'].includes(updateValues.status)) {
                 throw new Error(`無效的 status 值: ${updateValues.status}`);
             }
             if (updateValues.quantity !== undefined && (!Number.isInteger(Number(updateValues.quantity)) || Number(updateValues.quantity) < 0)) {
                 throw new Error(`quantity 必須是非負整數: ${updateValues.quantity}`);
             }
             if (updateValues.price !== undefined && updateValues.price !== null && (typeof updateValues.price !== 'number' || !Number.isInteger(Number(updateValues.price)) || Number(updateValues.price) < 0 )) {
                 throw new Error(`price 必須是非負整數或 null: ${updateValues.price}`);
             }
             // **新增驗證**: 確保 updateValues 至少有一個有效 key
             const validUpdateKeys = Object.keys(updateValues).filter(key => ['status', 'quantity', 'price'].includes(key));
             if (validUpdateKeys.length === 0) {
                 throw new Error("updateValues 物件必須包含 status, quantity 或 price 其中至少一項");
             }

            // 準備 Upsert 語句 (基於 updateValues 的 key)
            // **重要**: 將 updateValues 包裝成陣列以複用
            const { stmt, fieldsToBind } = prepareUpsertStatement(db, [updateValues]);

            // 計算符合條件的所有日期
            const dateRange = getDateRange(startDate, endDate);
            const targetDates = dateRange.filter(dateStr => weekdays.includes(getDayOfWeek(dateStr)));

            // 為每個目標日期生成綁定操作
            operations = targetDates.map(dateStr => {
                 const values = fieldsToBind.map(field => { // field 是 DB 欄位名
                     let valueToBind;
                     switch (field) {
                         case 'product_id': valueToBind = productId; break;
                         case 'inventory_date': valueToBind = dateStr; break;
                         case 'status': valueToBind = updateValues.status; break; // TEXT
                         case 'quantity_available': valueToBind = updateValues.quantity !== undefined && updateValues.quantity !== null ? Number(updateValues.quantity) : null; break; // INTEGER or NULL
                         case 'base_price': valueToBind = updateValues.price !== undefined && updateValues.price !== null ? Number(updateValues.price) : null; break; // INTEGER or NULL
                         default: valueToBind = null;
                     }
                     return valueToBind;
                 });
                 // console.log("批次更新 Binding values:", values); // 除錯用
                 return stmt.bind(...values);
            });

        } else {
            return new Response(JSON.stringify({ error: '請求格式不符，請提供 "updates" 陣列或完整的批次更新參數' }), { status: 400 });
        }

        // --- 執行資料庫操作 ---
        if (operations.length > 0) {
            console.log(`[update-room-inventory] 即將執行 ${operations.length} 個 D1 操作...`); // 除錯用
            await db.batch(operations);
            console.log(`[update-room-inventory] D1 操作執行完成。`); // 除錯用
        } else {
            // 如果是批次更新但沒有符合的日期，也算成功
            return new Response(JSON.stringify({ success: true, message: '沒有符合條件的日期需要更新。' }), {
                status: 200,
                headers: { 'Content-Type': 'application/json' },
            });
        }

        return new Response(JSON.stringify({ success: true, message: `成功更新 ${operations.length} 筆庫存記錄。` }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
        });

    } catch (error) {
        console.error('Error in admin/update-room-inventory API:', error.message, error.stack);
        let details = error.message;
        if (error.cause) {
             details += ` Cause: ${JSON.stringify(error.cause)}`;
        }
        return new Response(JSON.stringify({ error: '更新房量資料失敗', details: details }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' },
        });
    }
}