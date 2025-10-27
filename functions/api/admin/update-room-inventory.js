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
function prepareUpsertStatement(db, updates) {
    // 確定的欄位
    const baseFields = ['product_id', 'inventory_date'];
    const conflictTarget = '(product_id, inventory_date)';

    // 可能更新的欄位
    const possibleUpdateFields = ['status', 'quantity_available', 'base_price'];
    const updatePlaceholders = [];
    const updateSetClauses = [];
    const bindValues = [];

    // 檢查第一個 update 物件有哪些欄位需要更新
    const firstUpdate = updates[0];
    possibleUpdateFields.forEach(field => {
        if (firstUpdate.hasOwnProperty(field)) {
             // 欄位名加上問號作為預留位置
            updatePlaceholders.push('?');
            // 生成 `field = excluded.field` 子句
            updateSetClauses.push(`${field} = excluded.${field}`);
            // 將欄位名存起來，以便後續綁定值
            bindValues.push(field);
        }
    });

    if (bindValues.length === 0) {
        throw new Error("沒有提供任何有效的更新欄位 (status, quantity_available, base_price)");
    }

    // 組合 SQL 語句
    const allFields = [...baseFields, ...bindValues]; // 所有要 INSERT 的欄位
    const allPlaceholders = ['?', '?', ...updatePlaceholders]; // 對應的 INSERT 預留位置

    const sql = `
        INSERT INTO RoomInventory (${allFields.join(', ')})
        VALUES (${allPlaceholders.join(', ')})
        ON CONFLICT ${conflictTarget} DO UPDATE SET
        ${updateSetClauses.join(', ')}
    `;

    // 返回預備好的語句和需要綁定的欄位順序
    return {
        stmt: db.prepare(sql),
        fieldsToBind: [...baseFields, ...bindValues] // 確保順序正確
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
                    // 特殊處理 quantity 和 price，確保是整數或 null
                    if (field === 'quantity_available') return update.quantity ?? null; // 使用 quantity 屬性
                    if (field === 'base_price') return update.price ?? null; // 使用 price 屬性
                    if (field === 'product_id') return update.productId;
                    if (field === 'inventory_date') return update.date;
                    return update[field]; // 其他欄位直接取值
                 });
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
                     if (field === 'product_id') return productId;
                     if (field === 'inventory_date') return dateStr;
                     // 從 updateValues 中取值
                     if (field === 'quantity_available') return updateValues.quantity ?? null; // 使用 quantity 屬性
                     if (field === 'base_price') return updateValues.price ?? null; // 使用 price 屬性
                     return updateValues[field]; // 其他欄位直接取值
                 });
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