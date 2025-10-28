// functions/api/bookings-create.js (v3 - Guesthouse & Studio Support with Inventory Check)

// 輔助函式：產生指定日期範圍內的所有日期字串 (YYYY-MM-DD)
// 注意：這個版本不包含 endDate 本身 (用於庫存檢查)
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

export async function onRequest(context) {
    try {
        if (context.request.method !== 'POST') {
            return new Response(JSON.stringify({ error: '無效的請求方法' }), { status: 405 });
        }

        const db = context.env.DB;
        const body = await context.request.json();
        console.log("[bookings-create] Received Payload:", JSON.stringify(body)); // Log 收到的資料

        // --- 根據 bookingType 判斷是哪種預約 ---
        if (body.bookingType === 'guesthouse') {
            // --- 民宿訂房邏輯 ---
            const { userId, startDate, endDate, contactName, contactPhone, items } = body;

            // --- 基本驗證 ---
            if (!userId || !startDate || !endDate || !contactName || !contactPhone || !Array.isArray(items) || items.length === 0) {
                return new Response(JSON.stringify({ error: '民宿訂房缺少必要參數。' }), { status: 400 });
            }
            if (new Date(startDate) >= new Date(endDate)) {
                 return new Response(JSON.stringify({ error: '退房日期必須晚於入住日期。' }), { status: 400 });
            }
            // 驗證 items 結構
            for (const item of items) {
                 if (!item.productId || !Number.isInteger(item.quantity) || item.quantity <= 0) {
                     return new Response(JSON.stringify({ error: '預訂項目格式錯誤 (缺少 productId 或 quantity 無效)。' }), { status: 400 });
                 }
            }

            // --- 核心：庫存檢查 ---
            const bookingDates = getDateRange(startDate, endDate); // 獲取需要檢查庫存的日期列表
            if (bookingDates.length === 0) {
                 return new Response(JSON.stringify({ error: '無效的入住天數。' }), { status: 400 });
            }

            console.log(`[bookings-create] Checking inventory for ${items.length} products across ${bookingDates.length} dates: ${bookingDates.join(', ')}`);

            // 準備一個查詢來獲取所有相關日期的庫存
            const productIdsToCheck = items.map(item => item.productId);
            const datePlaceholders = bookingDates.map(() => '?').join(','); // ?,?,?
            const productPlaceholders = productIdsToCheck.map(() => '?').join(','); // ?,?,?

            const inventoryCheckStmt = db.prepare(
                `SELECT inventory_date, product_id, status, quantity_available
                 FROM RoomInventory
                 WHERE inventory_date IN (${datePlaceholders}) AND product_id IN (${productPlaceholders})`
            );
            const { results: currentInventory } = await inventoryCheckStmt.bind(...bookingDates, ...productIdsToCheck).all();

            // 逐一檢查每個預訂項目在每一天的庫存
            for (const item of items) {
                for (const dateStr of bookingDates) {
                    const inventoryRecord = currentInventory.find(inv => inv.inventory_date === dateStr && inv.product_id === item.productId);

                    // 檢查條件：
                    // 1. 必須找到記錄 (如果找不到，代表那天預設是 Closed)
                    // 2. 狀態必須是 'Open'
                    // 3. 可用數量必須 >= 預訂數量
                    if (!inventoryRecord || inventoryRecord.status !== 'Open' || inventoryRecord.quantity_available < item.quantity) {
                        console.error(`[bookings-create] Inventory Check FAILED for ${item.productId} on ${dateStr}. Record:`, inventoryRecord, `Requested: ${item.quantity}`);
                        // 嘗試查詢房型名稱以提供更友善的錯誤訊息
                        const productInfo = await db.prepare("SELECT name FROM Products WHERE product_id = ?").bind(item.productId).first();
                        const productName = productInfo ? productInfo.name : item.productId;
                        return new Response(JSON.stringify({ error: `抱歉，房型 "${productName}" 在 ${dateStr} 的數量不足或未開放預訂。` }), { status: 409 }); // 409 Conflict
                    }
                     console.log(`[bookings-create] Inventory Check OK for ${item.productId} on ${dateStr}. Available: ${inventoryRecord.quantity_available}, Requested: ${item.quantity}`);
                }
            }
            console.log("[bookings-create] Inventory check passed for all items and dates.");

            // --- 建立預訂記錄 & 更新庫存 (使用 Batch) ---
            const operations = [];

            const bookingStmt = db.prepare(
                `INSERT INTO Bookings (user_id, contact_name, contact_phone, booking_date, check_out_date, status, time_slot, num_of_people)
                 VALUES (?, ?, ?, ?, ?, 'confirmed', ?, ?) RETURNING booking_id` // **<-- 加入 num_of_people 和 ?**
            );
             // 執行插入 Booking 並立即獲取 booking_id
             const { booking_id } = await bookingStmt.bind(
                 userId,
                 contactName,
                 contactPhone,
                 startDate,
                 endDate,
                 '', // time_slot
                 0  // **<-- 綁定 0 給 num_of_people**
             ).first();

             if (!booking_id) {
                 throw new Error('無法建立預約主紀錄，請稍後再試。');
             }
             console.log(`[bookings-create] Booking record created with ID: ${booking_id}`);

            // 2. 插入 BookingItems (需要 productId, quantity, price - price 需後端計算)
            const itemInsertStmt = db.prepare(
                `INSERT INTO BookingItems (booking_id, product_id, item_name, quantity, price) VALUES (?, ?, ?, ?, ?)`
            );
            // 準備查詢 Products 以獲取名稱和預設價格
             const productsInfoStmt = db.prepare(`SELECT product_id, name, price_weekday, price_friday, price_saturday FROM Products WHERE product_id IN (${productPlaceholders})`);
             const { results: productsInfo } = await productsInfoStmt.bind(...productIdsToCheck).all();

            let calculatedTotalAmount = 0; // 後端計算總金額

            // 計算每個 item 的總價並準備插入 BookingItems
            for (const item of items) {
                 const productDetails = productsInfo.find(p => p.product_id === item.productId);
                 if (!productDetails) {
                      throw new Error(`找不到產品資訊: ${item.productId}`); // 應該不會發生，因為前面檢查過庫存
                 }
                 let itemTotalPrice = 0;
                 // 逐日計算價格
                 for (const dateStr of bookingDates) {
                     const inventoryRecord = currentInventory.find(inv => inv.inventory_date === dateStr && inv.product_id === item.productId);
                     let dailyPrice = inventoryRecord?.base_price; // 優先使用當日自訂價

                     if (dailyPrice === null || dailyPrice === undefined) { // 若無自訂價，參考預設價
                         const date = new Date(dateStr + 'T00:00:00');
                         const dayOfWeek = date.getDay();
                         if (dayOfWeek === 5) dailyPrice = productDetails.price_friday ?? productDetails.price_weekday;
                         else if (dayOfWeek === 6) dailyPrice = productDetails.price_saturday ?? productDetails.price_weekday;
                         else dailyPrice = productDetails.price_weekday;
                     }
                     // 如果最終價格仍無效或 <= 0，這在庫存檢查階段就該被擋下，但加個保險
                     if (dailyPrice === null || dailyPrice === undefined || dailyPrice <= 0) {
                          throw new Error(`房型 "${productDetails.name}" 在 ${dateStr} 價格無效，無法完成預訂。`);
                     }
                     itemTotalPrice += dailyPrice; // 累加每日價格 (單間房的總價)
                 }
                 const pricePerItem = itemTotalPrice; // 這是單間房在入住期間的總價
                 calculatedTotalAmount += pricePerItem * item.quantity; // 總金額 = (單間總價 * 數量) 的加總

                 operations.push(itemInsertStmt.bind(
                      booking_id,
                      item.productId,
                      productDetails.name, // 從 Products 獲取名稱
                      item.quantity,
                      pricePerItem // 儲存單間房的總價
                 ));
            }
             console.log(`[bookings-create] Calculated Total Amount: ${calculatedTotalAmount}`);

            // 3. 更新 RoomInventory (扣減數量)
            const inventoryUpdateStmt = db.prepare(
                `UPDATE RoomInventory SET quantity_available = quantity_available - ?
                 WHERE inventory_date = ? AND product_id = ? AND quantity_available >= ?` // 增加條件確保不會減成負數
            );
            for (const item of items) {
                for (const dateStr of bookingDates) {
                    operations.push(inventoryUpdateStmt.bind(item.quantity, dateStr, item.productId, item.quantity));
                }
            }

             // 4. (可選) 更新 Bookings 主表的 total_amount
             const updateTotalAmountStmt = db.prepare("UPDATE Bookings SET total_amount = ? WHERE booking_id = ?");
             operations.push(updateTotalAmountStmt.bind(calculatedTotalAmount, booking_id));

            // --- 執行 Batch ---
            console.log(`[bookings-create] Executing ${operations.length} batch operations...`);
            await db.batch(operations);
            console.log(`[bookings-create] Batch operations completed.`);

            // --- 準備回傳訊息 ---
            const itemSummary = items.map(item => {
                 const name = productsInfo.find(p => p.product_id === item.productId)?.name || item.productId;
                 return `${name} x${item.quantity}`;
            }).join(', ');
            const message = `您已成功預訂 ${startDate} 至 ${endDate} (${bookingDates.length}晚)，預訂房型：${itemSummary}。總金額 $${calculatedTotalAmount}。此訊息僅為通知，若有問題請聯絡店家。`;

            // --- 新增: 寫入活動紀錄 ---
            const activityStmt = db.prepare("INSERT INTO Activities (type, message, link) VALUES (?, ?, ?)");
            context.waitUntil(activityStmt.bind('new_booking', `顧客 ${contactName} 預訂了 ${startDate} 的房間`, '#bookings').run());


            return new Response(JSON.stringify({
                success: true,
                message: '訂房成功！',
                confirmationMessage: message
            }), { status: 201, headers: { 'Content-Type': 'application/json' } });

        } else if (body.bookingType === 'studio' || !body.bookingType) { // 如果是工作室預約或未指定類型
            // --- 工作室預約邏輯 (基本保持舊版，但加入 RETURNING booking_id 和 Activities) ---
            const { userId, bookingDate, timeSlot, numOfPeople, contactName, contactPhone, items } = body;

            // --- 後端驗證 ---
            if (!userId || !bookingDate || !timeSlot || !numOfPeople || numOfPeople <= 0 || !contactName || !contactPhone) {
                return new Response(JSON.stringify({ error: '工作室預約缺少必要參數。' }), { status: 400 });
            }
            if (!Array.isArray(items) || items.length === 0) {
                return new Response(JSON.stringify({ error: '預約必須至少包含一個項目。' }), { status: 400 });
            }
            // 驗證項目價格
            for (const item of items) {
                 if (item.price === null || item.price === undefined || isNaN(item.price) || item.price < 0) {
                     return new Response(JSON.stringify({ error: `預約項目 "${item.name}" 缺少有效價格。` }), { status: 400 });
                 }
            }


            // --- 使用 Batch 模擬交易 ---
            const bookingStmt = db.prepare(
                'INSERT INTO Bookings (user_id, contact_name, contact_phone, booking_date, time_slot, num_of_people) VALUES (?, ?, ?, ?, ?, ?) RETURNING booking_id'
            );
             // 執行插入 Booking 並立即獲取 booking_id
             const { booking_id } = await bookingStmt.bind(userId, contactName, contactPhone, bookingDate, timeSlot, numOfPeople).first();

             if (!booking_id) {
                 throw new Error('無法建立預約主紀錄，請稍後再試。');
             }
             console.log(`[bookings-create] Studio Booking record created with ID: ${booking_id}`);


            const itemOperations = [];
            const itemStmt = db.prepare(
                'INSERT INTO BookingItems (booking_id, item_name, quantity, price, product_id) VALUES (?, ?, ?, ?, ?)' // 增加 product_id
            );
             // 準備查詢 Products 以獲取 product_id (如果前端沒傳)
             const itemNames = items.map(item => item.name);
             const namePlaceholders = itemNames.map(() => '?').join(',');
             const productsInfoStmt = db.prepare(`SELECT name, product_id FROM Products WHERE name IN (${namePlaceholders})`);
             const { results: productsInfo } = await productsInfoStmt.bind(...itemNames).all();


            let calculatedTotalAmount = 0; // 後端計算總金額
            items.forEach(item => {
                const productDetails = productsInfo.find(p => p.name === item.name);
                calculatedTotalAmount += (item.price * item.quantity); // 工作室直接用前端傳來的 price
                itemOperations.push(itemStmt.bind(
                    booking_id,
                    item.name,
                    item.quantity,
                    item.price, // 使用前端傳來的價格
                    productDetails ? productDetails.product_id : null // 嘗試關聯 product_id
                ));
            });

             // (可選) 更新 Bookings 主表的 total_amount
             const updateTotalAmountStmt = db.prepare("UPDATE Bookings SET total_amount = ? WHERE booking_id = ?");
             itemOperations.push(updateTotalAmountStmt.bind(calculatedTotalAmount, booking_id));

            // 一次性執行所有 item 的插入和總金額更新
            await db.batch(itemOperations);
            console.log(`[bookings-create] Studio Items inserted and total amount updated.`);


            // --- 準備回傳給顧客的確認訊息 ---
            const itemSummary = items.map(item => `${item.name} x${item.qty}`).join(', ');
            const message = `您已成功預約 ${bookingDate} ${timeSlot}，預約項目：${itemSummary}。此訊息僅為通知，若有問題請聯絡店家。`;

            // --- 新增: 寫入活動紀錄 ---
            const activityStmt = db.prepare("INSERT INTO Activities (type, message, link) VALUES (?, ?, ?)");
            context.waitUntil(activityStmt.bind('new_booking', `顧客 ${contactName} 預約了 ${bookingDate} 的服務`, '#bookings').run());

            return new Response(JSON.stringify({
                success: true,
                message: '預約成功！',
                confirmationMessage: message
            }), { status: 201, headers: { 'Content-Type': 'application/json' } });

        } else {
             // 如果 bookingType 不認識
             return new Response(JSON.stringify({ error: `未知的預約類型: ${body.bookingType}` }), { status: 400 });
        }

    } catch (error) {
        console.error('Error in bookings-create API:', error);
        // 回傳更詳細的錯誤給前端
        return new Response(JSON.stringify({ error: '建立預約失敗。', details: error.message }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' },
        });
    }
}