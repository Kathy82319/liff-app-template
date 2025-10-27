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

// D1 Upsert 輔助函式 (INSERT ... ON CONFLICT ... DO UPDATE)
// 根據提供的欄位動態生成更新語句
// D1 Upsert 輔助函式 (修正資料類型處理)
function prepareUpsertStatement(db, updates) {
    const baseFields = ['product_id', 'inventory_date'];
    const conflictTarget = '(product_id, inventory_date)';
    const possibleUpdateFields = ['status', 'quantity_available', 'base_price'];
    const updatePlaceholders = [];
    const updateSetClauses = [];
    const bindValuesOrder = []; // 記錄需要綁定的欄位 key 的順序

    const firstUpdate = updates[0];
    possibleUpdateFields.forEach(field => {
        if (firstUpdate.hasOwnProperty(field)) {
            updatePlaceholders.push('?');
            updateSetClauses.push(`${field} = excluded.${field}`);
            bindValuesOrder.push(field); // 記錄欄位 key
        }
    });

    if (bindValuesOrder.length === 0) {
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

    console.log("[prepareUpsertStatement] SQL:", sql); // 除錯用
    console.log("[prepareUpsertStatement] Fields to Bind:", [...baseFields, ...bindValuesOrder]); // 除錯用

    return {
        stmt: db.prepare(sql),
        fieldsToBind: [...baseFields, ...bindValuesOrder] // 傳回欄位順序
    };
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
                 // 驗證可選欄位
                 if (update.status && !['Open', 'Closed'].includes(update.status)) {
                     throw new Error(`無效的 status 值: ${update.status}`);
                 }
                 if (update.quantity !== undefined && (!Number.isInteger(update.quantity) || update.quantity < 0)) {
                      throw new Error(`quantity_available 必須是非負整數: ${update.quantity}`);
                 }
                 if (update.price !== undefined && update.price !== null && typeof update.price !== 'number') {
                     throw new Error(`base_price 必須是數字或 null: ${update.price}`);
                 }
            }

            // 準備 Upsert 語句 (只需準備一次，因為欄位結構相同)
            const { stmt, fieldsToBind } = prepareUpsertStatement(db, updatesArray);

// 為每一筆更新生成綁定操作
        operations = updatesArray.map(update => {
             const values = fieldsToBind.map(field => {
                 let valueToBind;
                 switch (field) {
                     case 'product_id':
                         valueToBind = update.productId; // 前端使用 productId
                         break;
                     case 'inventory_date':
                         valueToBind = update.date; // 前端使用 date
                         break;
                     case 'status':
                         valueToBind = update.status; // TEXT
                         break;
                     case 'quantity_available':
                         // 確保傳入 INTEGER 或 NULL
                         valueToBind = update.quantity !== undefined && update.quantity !== null ? Number(update.quantity) : null;
                         break;
                     case 'base_price':
                         // 確保傳入 INTEGER 或 NULL
                         valueToBind = update.price !== undefined && update.price !== null ? Number(update.price) : null;
                         break;
                     default:
                         valueToBind = update[field]; // 其他欄位直接取值 (雖然此例中應該沒有)
                 }
                 // 除錯用: 檢查每個綁定值和類型
                 // console.log(`Binding field: ${field}, Value: ${valueToBind}, Type: ${typeof valueToBind}`);
                 return valueToBind;
             });
             // 除錯用: 顯示最終綁定陣列
             // console.log("Binding values for row:", values);
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
            // 驗證 updateValues 的內容
             if (updateValues.status && !['Open', 'Closed'].includes(updateValues.status)) {
                 throw new Error(`無效的 status 值: ${updateValues.status}`);
             }
             if (updateValues.quantity !== undefined && (!Number.isInteger(updateValues.quantity) || updateValues.quantity < 0)) {
                 throw new Error(`quantity_available 必須是非負整數: ${updateValues.quantity}`);
             }
             if (updateValues.price !== undefined && updateValues.price !== null && typeof updateValues.price !== 'number') {
                 throw new Error(`base_price 必須是數字或 null: ${updateValues.price}`);
             }
            if (Object.keys(updateValues).length === 0) {
                 throw new Error("updateValues 物件不可為空");
            }


            // 準備 Upsert 語句 (將 updateValues 包裝成陣列以複用 prepareUpsertStatement)
            const { stmt, fieldsToBind } = prepareUpsertStatement(db, [updateValues]);

            // 計算符合條件的所有日期
            const dateRange = getDateRange(startDate, endDate);
            const targetDates = dateRange.filter(dateStr => weekdays.includes(getDayOfWeek(dateStr)));

// 為每個目標日期生成綁定操作
        operations = targetDates.map(dateStr => {
             const values = fieldsToBind.map(field => {
                 let valueToBind;
                 switch (field) {
                     case 'product_id':
                         valueToBind = productId;
                         break;
                     case 'inventory_date':
                         valueToBind = dateStr;
                         break;
                     case 'status':
                         valueToBind = updateValues.status; // TEXT
                         break;
                     case 'quantity_available':
                          // 確保傳入 INTEGER 或 NULL
                         valueToBind = updateValues.quantity !== undefined && updateValues.quantity !== null ? Number(updateValues.quantity) : null;
                         break;
                     case 'base_price':
                          // 確保傳入 INTEGER 或 NULL
                         valueToBind = updateValues.price !== undefined && updateValues.price !== null ? Number(updateValues.price) : null;
                         break;
                     default:
                         valueToBind = updateValues[field];
                 }
                  // console.log(`Binding field: ${field}, Value: ${valueToBind}, Type: ${typeof valueToBind}`);
                 return valueToBind;
             });
              // console.log("Binding values for row:", values);
             return stmt.bind(...values);
        });

        } else {
            return new Response(JSON.stringify({ error: '請求格式不符，請提供 "updates" 陣列或完整的批次更新參數' }), { status: 400 });
        }

        // --- 執行資料庫操作 ---
        if (operations.length > 0) {
            await db.batch(operations);
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
        console.error('Error in admin/update-room-inventory API:', error);
        return new Response(JSON.stringify({ error: '更新房量資料失敗', details: error.message }), {
            status: 500, // 或根據錯誤類型回傳 400
            headers: { 'Content-Type': 'application/json' },
        });
    }
}