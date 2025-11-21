// functions/api/admin/update-room-inventory.js

import { getDateRange, getDayOfWeek } from '../utils/date-helpers.js';

// D1 Upsert 輔助函式 (修正 key 檢查與資料類型處理 v3 - 再次修正)
function prepareUpsertStatement(db, updates) {
    const baseFields = ['product_id', 'inventory_date'];
    const conflictTarget = '(product_id, inventory_date)';

    // **修正**: 改回直接使用 DB 欄位名做 key，方便後續對應
    const possibleUpdateFields = {
        status: 'status',
        quantity_available: 'quantity_available',
        base_price: 'base_price'
    };

    const updatePlaceholders = [];
    const updateSetClauses = [];
    const dbFieldsToBindOrder = []; // 記錄 DB 欄位順序

    if (!Array.isArray(updates) || updates.length === 0) {
        throw new Error("prepareUpsertStatement: 'updates' 參數必須是非空陣列");
    }
    const firstUpdate = updates[0];
    if (typeof firstUpdate !== 'object' || firstUpdate === null) {
        throw new Error("prepareUpsertStatement: 'updates' 陣列中的元素必須是物件");
    }
    console.log("[prepareUpsertStatement v4 Debug] Received firstUpdate object:", JSON.stringify(firstUpdate)); // 顯示收到的第一個 update 物件

    // **修正**: 遍歷 DB 欄位名，檢查前端是否有傳對應的 key (status, quantity, price)
    for (const dbField in possibleUpdateFields) {
        let frontendKey = null;
        if (dbField === 'status' && firstUpdate.hasOwnProperty('status')) frontendKey = 'status';
        else if (dbField === 'quantity_available' && firstUpdate.hasOwnProperty('quantity')) frontendKey = 'quantity';
        else if (dbField === 'base_price' && firstUpdate.hasOwnProperty('price')) frontendKey = 'price';

        // 如果前端傳來了對應的 key
        if (frontendKey !== null) {
            updatePlaceholders.push('?');
            updateSetClauses.push(`${dbField} = excluded.${dbField}`); // SQL 使用 DB 欄位
            dbFieldsToBindOrder.push(dbField); // 記錄 DB 欄位以便後續綁定
            console.log(`[prepareUpsertStatement v4 Debug] Found frontend key '${frontendKey}', will update DB field '${dbField}'`); // 除錯
        } else {
             console.log(`[prepareUpsertStatement v4 Debug] Did not find frontend key for DB field '${dbField}'`); // 除錯
        }
    }


    if (dbFieldsToBindOrder.length === 0) {
        // 現在這個錯誤應該更準確
        throw new Error("沒有提供任何有效的更新欄位 (status, quantity, price)");
    }

    const allFields = [...baseFields, ...dbFieldsToBindOrder];
    const allPlaceholders = ['?', '?', ...updatePlaceholders];

    const sql = `
        INSERT INTO RoomInventory (${allFields.join(', ')})
        VALUES (${allPlaceholders.join(', ')})
        ON CONFLICT ${conflictTarget} DO UPDATE SET
        ${updateSetClauses.join(', ')}
    `;

    console.log("[prepareUpsertStatement v4] SQL:", sql);
    console.log("[prepareUpsertStatement v4] DB Fields to Bind:", [...baseFields, ...dbFieldsToBindOrder]);

    try {
        return {
            stmt: db.prepare(sql),
            dbFieldsToBind: [...baseFields, ...dbFieldsToBindOrder] // 傳回 DB 欄位順序
        };
    } catch (e) {
         console.error("Error preparing statement:", e, "SQL:", sql);
         throw e;
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
        console.log("[update-room-inventory] Received body:", JSON.stringify(body)); // **加入詳細 Log**

        let operations = [];

        // 類型 1: 多筆獨立更新
        if (Array.isArray(body.updates)) {
            const updatesArray = body.updates;
            if (updatesArray.length === 0) {
                 return new Response(JSON.stringify({ error: 'updates 陣列不可為空' }), { status: 400 });
            }

            // 驗證
            for (const update of updatesArray) {
                 if (!update.productId || !update.date || !/^\d{4}-\d{2}-\d{2}$/.test(update.date)) { throw new Error("缺少 productId 或 date"); }
                 if (update.status && !['Open', 'Closed'].includes(update.status)) { throw new Error(`無效 status: ${update.status}`); }
                 if (update.quantity !== undefined && (!Number.isInteger(Number(update.quantity)) || Number(update.quantity) < 0)) { throw new Error(`無效 quantity: ${update.quantity}`); }
                 if (update.price !== undefined && update.price !== null && (typeof update.price !== 'number' || !Number.isInteger(Number(update.price)) || Number(update.price) < 0)) { throw new Error(`無效 price: ${update.price}`); }
                 if (!update.hasOwnProperty('status') && !update.hasOwnProperty('quantity') && !update.hasOwnProperty('price')) { throw new Error(`缺少更新欄位`); }
            }

            const { stmt, dbFieldsToBind } = prepareUpsertStatement(db, updatesArray); // 使用修正後的函數

            operations = updatesArray.map(update => {
                 const values = dbFieldsToBind.map(dbField => { // **遍歷 DB 欄位**
                     let valueToBind;
                     switch (dbField) {
                         case 'product_id': valueToBind = update.productId; break;
                         case 'inventory_date': valueToBind = update.date; break;
                         case 'status': valueToBind = update.status; break; // TEXT
                         case 'quantity_available': valueToBind = update.quantity !== undefined && update.quantity !== null ? Number(update.quantity) : null; break; // INTEGER or NULL
                         case 'base_price': valueToBind = update.price !== undefined && update.price !== null ? Number(update.price) : null; break; // INTEGER or NULL
                         default: valueToBind = null;
                     }
                     return valueToBind;
                 });
                 console.log("單筆更新 Binding values:", values); // 除錯用
                 return stmt.bind(...values);
            });

        // 類型 2: 批次範圍更新
        } else if (body.productId && body.startDate && body.endDate && Array.isArray(body.weekdays) && body.updateValues) {
            const { productId, startDate, endDate, weekdays, updateValues } = body;

            // 驗證
            if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate) || !/^\d{4}-\d{2}-\d{2}$/.test(endDate) || new Date(startDate) > new Date(endDate)) { throw new Error("無效日期範圍"); }
            if (weekdays.some(day => !Number.isInteger(day) || day < 0 || day > 6)) { throw new Error("無效星期"); }
            if (updateValues.status && !['Open', 'Closed'].includes(updateValues.status)) { throw new Error(`無效 status: ${updateValues.status}`); }
            if (updateValues.quantity !== undefined && (!Number.isInteger(Number(updateValues.quantity)) || Number(updateValues.quantity) < 0)) { throw new Error(`無效 quantity: ${updateValues.quantity}`); }
            if (updateValues.price !== undefined && updateValues.price !== null && (typeof updateValues.price !== 'number' || !Number.isInteger(Number(updateValues.price)) || Number(updateValues.price) < 0 )) { throw new Error(`無效 price: ${updateValues.price}`); }
            const validUpdateKeys = Object.keys(updateValues).filter(key => ['status', 'quantity', 'price'].includes(key));
            if (validUpdateKeys.length === 0) { throw new Error("updateValues 無有效欄位"); }

            // **修正**: 將 updateValues 包裝成陣列以符合 prepareUpsertStatement
            const { stmt, dbFieldsToBind } = prepareUpsertStatement(db, [updateValues]);

            const dateRange = getDateRange(startDate, endDate);
            const targetDates = dateRange.filter(dateStr => weekdays.includes(getDayOfWeek(dateStr)));

            operations = targetDates.map(dateStr => {
                 const values = dbFieldsToBind.map(dbField => { // **遍歷 DB 欄位**
                     let valueToBind;
                     switch (dbField) {
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
            return new Response(JSON.stringify({ error: '請求格式不符' }), { status: 400 });
        }

        // --- 執行資料庫操作 ---
        if (operations.length > 0) {
            console.log(`[update-room-inventory] 即將執行 ${operations.length} 個 D1 操作...`);
            await db.batch(operations);
            console.log(`[update-room-inventory] D1 操作執行完成。`);
        } else {
            return new Response(JSON.stringify({ success: true, message: '沒有符合條件的日期需要更新。' }), {
                status: 200, headers: { 'Content-Type': 'application/json' },
            });
        }

        return new Response(JSON.stringify({ success: true, message: `成功更新 ${operations.length} 筆庫存記錄。` }), {
            status: 200, headers: { 'Content-Type': 'application/json' },
        });

    } catch (error) {
        console.error('Error in admin/update-room-inventory API:', error.message, error.stack);
        let details = error.message;
        if (error.cause) { details += ` Cause: ${JSON.stringify(error.cause)}`; }
        // **修正**: 在回傳錯誤前 Log 一次 Body
        console.error("Failing request body:", await context.request.text().catch(() => 'Failed to read body'));
        return new Response(JSON.stringify({ error: '更新房量資料失敗', details: details }), {
            status: 500, headers: { 'Content-Type': 'application/json' },
        });
    }
}