// functions/api/bookings-create.js (v4 - Incorporate Message Draft)

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

// --- 【新增】複製 message-drafts.js 中的固定 ID 和預設內容 ---
const FIXED_DRAFT_IDS = {
    AUTO_CONFIRMATION: 2
};
const DEFAULT_AUTO_CONFIRMATION_CONTENT = "感謝您的預訂！\n\n您的訂房資訊如下：\n入住日期：{{startDate}}\n退房日期：{{endDate}}\n房型：{{roomSummary}}\n總金額：{{totalAmount}}\n\n期待您的光臨！";
// --- 【新增結束】 ---

export async function onRequest(context) {
    try {
        if (context.request.method !== 'POST') {
            return new Response(JSON.stringify({ error: '無效的請求方法' }), { status: 405 });
        }

        const db = context.env.DB;
        const body = await context.request.json();
        console.log("[bookings-create] Received Payload:", JSON.stringify(body));

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
            for (const item of items) {
                 if (!item.productId || !Number.isInteger(item.quantity) || item.quantity <= 0) {
                     return new Response(JSON.stringify({ error: '預訂項目格式錯誤 (缺少 productId 或 quantity 無效)。' }), { status: 400 });
                 }
            }

            // --- 核心：庫存檢查 ---
            const bookingDates = getDateRange(startDate, endDate);
            if (bookingDates.length === 0) {
                 return new Response(JSON.stringify({ error: '無效的入住天數。' }), { status: 400 });
            }

            console.log(`[bookings-create] Checking inventory for ${items.length} products across ${bookingDates.length} dates: ${bookingDates.join(', ')}`);

            const productIdsToCheck = items.map(item => item.productId);
            const datePlaceholders = bookingDates.map(() => '?').join(',');
            const productPlaceholders = productIdsToCheck.map(() => '?').join(',');

            const inventoryCheckStmt = db.prepare(
                `SELECT inventory_date, product_id, status, quantity_available, base_price
                 FROM RoomInventory
                 WHERE inventory_date IN (${datePlaceholders}) AND product_id IN (${productPlaceholders})`
            );
            const { results: currentInventory } = await inventoryCheckStmt.bind(...bookingDates, ...productIdsToCheck).all();

            for (const item of items) {
                for (const dateStr of bookingDates) {
                    const inventoryRecord = currentInventory.find(inv => inv.inventory_date === dateStr && inv.product_id === item.productId);
                    if (!inventoryRecord || inventoryRecord.status !== 'Open' || inventoryRecord.quantity_available < item.quantity) {
                        console.error(`[bookings-create] Inventory Check FAILED for ${item.productId} on ${dateStr}. Record:`, inventoryRecord, `Requested: ${item.quantity}`);
                        const productInfo = await db.prepare("SELECT name FROM Products WHERE product_id = ?").bind(item.productId).first();
                        const productName = productInfo ? productInfo.name : item.productId;
                        return new Response(JSON.stringify({ error: `抱歉，房型 "${productName}" 在 ${dateStr} 的數量不足或未開放預訂。` }), { status: 409 });
                    }
                     console.log(`[bookings-create] Inventory Check OK for ${item.productId} on ${dateStr}. Available: ${inventoryRecord.quantity_available}, Requested: ${item.quantity}`);
                }
            }
            console.log("[bookings-create] Inventory check passed for all items and dates.");

            // --- 計算總預訂房間數 ---
            const totalQuantityBooked = items.reduce((sum, item) => sum + item.quantity, 0);
            console.log(`[bookings-create] Total quantity calculated: ${totalQuantityBooked}`);

            // --- 建立預訂記錄 & 更新庫存 (使用 Batch) ---
            const operations = [];
            let booking_id; // Declare booking_id here

             // 1. 插入 Bookings 主表 (注意欄位差異)
             const bookingStmt = db.prepare(
                `INSERT INTO Bookings (user_id, contact_name, contact_phone, booking_date, check_out_date, status, time_slot, num_of_people)
                 VALUES (?, ?, ?, ?, ?, 'confirmed', ?, ?) RETURNING booking_id`
            );
             // Execute insert Booking and get booking_id immediately
             const bookingResult = await bookingStmt.bind(
                 userId,
                 contactName,
                 contactPhone,
                 startDate,
                 endDate,
                 '', // time_slot
                 totalQuantityBooked // Use the calculated total room count
             ).first();

             if (!bookingResult || !bookingResult.booking_id) { // Check if bookingResult and booking_id exist
                 throw new Error('無法建立預約主紀錄，請稍後再試。');
             }
             booking_id = bookingResult.booking_id; // Assign booking_id
             console.log(`[bookings-create] Booking record created with ID: ${booking_id}`);


            // 2. 插入 BookingItems (需要 productId, quantity, price - price 需後端計算)
            const itemInsertStmt = db.prepare(
                `INSERT INTO BookingItems (booking_id, product_id, item_name, quantity, price) VALUES (?, ?, ?, ?, ?)`
            );
            // Prepare query for Products to get name and default prices
             const productsInfoStmt = db.prepare(`SELECT product_id, name, price_weekday, price_friday, price_saturday FROM Products WHERE product_id IN (${productPlaceholders})`);
             const { results: productsInfo } = await productsInfoStmt.bind(...productIdsToCheck).all();

            let calculatedTotalAmount = 0; // Backend calculates total amount

            // Calculate total price for each item and prepare insert for BookingItems
            for (const item of items) {
                 const productDetails = productsInfo.find(p => p.product_id === item.productId);
                 if (!productDetails) {
                      throw new Error(`找不到產品資訊: ${item.productId}`);
                 }
                 let itemTotalPrice = 0;
                 // Calculate price day by day
                 for (const dateStr of bookingDates) {
                     const inventoryRecord = currentInventory.find(inv => inv.inventory_date === dateStr && inv.product_id === item.productId);
                     let dailyPrice = inventoryRecord?.base_price; // Prioritize custom daily price

                     if (dailyPrice === null || dailyPrice === undefined) { // If no custom price, refer to default price
                         const date = new Date(dateStr + 'T00:00:00');
                         const dayOfWeek = date.getDay();
                         if (dayOfWeek === 5) dailyPrice = productDetails.price_friday ?? productDetails.price_weekday;
                         else if (dayOfWeek === 6) dailyPrice = productDetails.price_saturday ?? productDetails.price_weekday;
                         else dailyPrice = productDetails.price_weekday;
                     }
                     // Insurance check: price should be valid (>0) at this stage due to inventory check
                     if (dailyPrice === null || dailyPrice === undefined || dailyPrice <= 0) {
                          throw new Error(`房型 "${productDetails.name}" 在 ${dateStr} 價格無效，無法完成預訂。`);
                     }
                     itemTotalPrice += dailyPrice; // Accumulate daily price (total price for one room)
                 }
                 const pricePerItem = itemTotalPrice; // This is the total price for one room for the duration
                 calculatedTotalAmount += pricePerItem * item.quantity; // Total amount = sum of (pricePerItem * quantity)

                 operations.push(itemInsertStmt.bind(
                      booking_id,
                      item.productId,
                      productDetails.name, // Get name from Products
                      item.quantity,
                      pricePerItem // Store the total price for one room
                 ));
            }
             console.log(`[bookings-create] Calculated Total Amount: ${calculatedTotalAmount}`);

            // 3. 更新 RoomInventory (扣減數量)
            const inventoryUpdateStmt = db.prepare(
                `UPDATE RoomInventory SET quantity_available = quantity_available - ?
                 WHERE inventory_date = ? AND product_id = ? AND quantity_available >= ?` // Add condition to prevent negative quantity
            );
            for (const item of items) {
                for (const dateStr of bookingDates) {
                    operations.push(inventoryUpdateStmt.bind(item.quantity, dateStr, item.productId, item.quantity));
                }
            }

             // 4. (Optional) Update total_amount in the main Bookings table
             const updateTotalAmountStmt = db.prepare("UPDATE Bookings SET total_amount = ? WHERE booking_id = ?");
             operations.push(updateTotalAmountStmt.bind(calculatedTotalAmount, booking_id));

            // --- 執行 Batch ---
            console.log(`[bookings-create] Executing ${operations.length} batch operations...`);
            await db.batch(operations);
            console.log(`[bookings-create] Batch operations completed.`);

            // --- 【修改】讀取草稿並替換內容 ---
            let messageContent = DEFAULT_AUTO_CONFIRMATION_CONTENT;
            try {
                const draftStmt = db.prepare("SELECT content FROM MessageDrafts WHERE draft_id = ?");
                const draft = await draftStmt.bind(FIXED_DRAFT_IDS.AUTO_CONFIRMATION).first();
                if (draft && draft.content) {
                    messageContent = draft.content;
                } else {
                    console.warn(`[bookings-create] Draft ID ${FIXED_DRAFT_IDS.AUTO_CONFIRMATION} not found or content empty, using default message.`);
                }

                // 準備房型摘要
                 const roomSummary = items.map(item => {
                     const name = productsInfo.find(p => p.product_id === item.productId)?.name || item.productId;
                     return `${name} x${item.quantity}`;
                 }).join(', ');

                // 替換預留位置
                messageContent = messageContent
                    .replace(/{{startDate}}/g, startDate)
                    .replace(/{{endDate}}/g, endDate)
                    .replace(/{{roomSummary}}/g, roomSummary)
                    .replace(/{{totalAmount}}/g, `$${calculatedTotalAmount}`);

            } catch (draftError) {
                console.error("[bookings-create] Error fetching or processing message draft:", draftError);
                // 如果讀取或處理草稿失敗，還是使用預設訊息格式，但確保資料正確
                 const roomSummary = items.map(item => {
                     const name = productsInfo.find(p => p.product_id === item.productId)?.name || item.productId;
                     return `${name} x${item.quantity}`;
                 }).join(', ');
                 messageContent = `您已成功預訂 ${startDate} 至 ${endDate} (${bookingDates.length}晚)，預訂房型：${roomSummary}。總金額 $${calculatedTotalAmount}。此訊息僅為通知，若有問題請聯絡店家。`;
            }
            // --- 【修改結束】 ---

            // --- (寫入活動紀錄保持不變) ---
            const activityStmt = db.prepare("INSERT INTO Activities (type, message, link) VALUES (?, ?, ?)");
            context.waitUntil(activityStmt.bind('new_booking', `顧客 ${contactName} 預訂了 ${startDate} 的房間`, '#bookings').run());


            return new Response(JSON.stringify({
                success: true,
                message: '訂房成功！',
                confirmationMessage: messageContent // 回傳處理過的訊息
            }), { status: 201, headers: { 'Content-Type': 'application/json' } });

        } else if (body.bookingType === 'studio' || !body.bookingType) { // 如果是工作室預約或未指定類型
            // --- 工作室預約邏輯 ---
            const { userId, bookingDate, timeSlot, numOfPeople, contactName, contactPhone, items } = body;

            // --- 後端驗證 ---
            if (!userId || !bookingDate || !timeSlot || !numOfPeople || numOfPeople <= 0 || !contactName || !contactPhone) {
                return new Response(JSON.stringify({ error: '工作室預約缺少必要參數。' }), { status: 400 });
            }
            if (!Array.isArray(items) || items.length === 0) {
                return new Response(JSON.stringify({ error: '預約必須至少包含一個項目。' }), { status: 400 });
            }
            for (const item of items) {
                 if (item.price === null || item.price === undefined || isNaN(item.price) || item.price < 0) {
                     return new Response(JSON.stringify({ error: `預約項目 "${item.name}" 缺少有效價格。` }), { status: 400 });
                 }
            }

            // --- 使用 Batch 模擬交易 ---
            let booking_id; // Declare booking_id here
            const bookingStmt = db.prepare(
                'INSERT INTO Bookings (user_id, contact_name, contact_phone, booking_date, time_slot, num_of_people) VALUES (?, ?, ?, ?, ?, ?) RETURNING booking_id'
            );
             // Execute insert Booking and get booking_id immediately
             const bookingResult = await bookingStmt.bind(userId, contactName, contactPhone, bookingDate, timeSlot, numOfPeople).first();

             if (!bookingResult || !bookingResult.booking_id) { // Check if bookingResult and booking_id exist
                 throw new Error('無法建立預約主紀錄，請稍後再試。');
             }
             booking_id = bookingResult.booking_id; // Assign booking_id
             console.log(`[bookings-create] Studio Booking record created with ID: ${booking_id}`);


            const itemOperations = [];
            const itemStmt = db.prepare(
                'INSERT INTO BookingItems (booking_id, item_name, quantity, price, product_id) VALUES (?, ?, ?, ?, ?)' // Add product_id
            );
             // Prepare query for Products to get product_id (if not sent from frontend)
             const itemNames = items.map(item => item.name);
             const namePlaceholders = itemNames.map(() => '?').join(',');
             let productsInfo = []; // Initialize productsInfo
             if (itemNames.length > 0) { // Only query if there are items
                const productsInfoStmt = db.prepare(`SELECT name, product_id FROM Products WHERE name IN (${namePlaceholders})`);
                const { results: fetchedProductsInfo } = await productsInfoStmt.bind(...itemNames).all();
                productsInfo = fetchedProductsInfo || []; // Assign fetched results or empty array
             }


            let calculatedTotalAmount = 0; // Backend calculates total amount
            items.forEach(item => {
                const productDetails = productsInfo.find(p => p.name === item.name);
                calculatedTotalAmount += (item.price * item.quantity); // Studio uses price sent from frontend
                itemOperations.push(itemStmt.bind(
                    booking_id,
                    item.name,
                    item.quantity,
                    item.price, // Use price sent from frontend
                    productDetails ? productDetails.product_id : null // Try to associate product_id
                ));
            });

             // (Optional) Update total_amount in the main Bookings table
             const updateTotalAmountStmt = db.prepare("UPDATE Bookings SET total_amount = ? WHERE booking_id = ?");
             itemOperations.push(updateTotalAmountStmt.bind(calculatedTotalAmount, booking_id));

            // Execute all item inserts and total amount update at once
            await db.batch(itemOperations);
            console.log(`[bookings-create] Studio Items inserted and total amount updated.`);

             // --- 【修改】讀取工作室草稿並替換 ---
             let messageContent = `感謝您的預約！\n\n您的預約資訊如下：\n日期：{{bookingDate}}\n時段：{{timeSlot}}\n項目：{{itemSummary}}\n\n期待您的光臨！`; // Default message
             try {
                const draftStmt = db.prepare("SELECT content FROM MessageDrafts WHERE draft_id = ?");
                const draft = await draftStmt.bind(FIXED_DRAFT_IDS.AUTO_CONFIRMATION).first();
                if (draft && draft.content) {
                    messageContent = draft.content;
                } else {
                     console.warn(`[bookings-create] Draft ID ${FIXED_DRAFT_IDS.AUTO_CONFIRMATION} not found or content empty, using default message for studio.`);
                }

                // 準備項目摘要
                 const itemSummary = items.map(item => `${item.name} x${item.quantity}`).join(', ');

                // 替換預留位置 (工作室可能需要的預留位置不同)
                messageContent = messageContent
                    .replace(/{{bookingDate}}/g, bookingDate)
                    .replace(/{{timeSlot}}/g, timeSlot || '未指定')
                    .replace(/{{itemSummary}}/g, itemSummary)
                    .replace(/{{totalAmount}}/g, `$${calculatedTotalAmount}`); // 工作室也加入總金額替換

             } catch (draftError) {
                 console.error("[bookings-create] Error fetching or processing message draft for studio:", draftError);
                 // 使用預設訊息格式
                 const itemSummary = items.map(item => `${item.name} x${item.quantity}`).join(', ');
                 messageContent = `您已成功預約 ${bookingDate} ${timeSlot || ''}，預約項目：${itemSummary}。此訊息僅為通知，若有問題請聯絡店家。`;
             }
             // --- 【修改結束】 ---

            // --- (寫入活動紀錄保持不變) ---
            const activityStmt = db.prepare("INSERT INTO Activities (type, message, link) VALUES (?, ?, ?)");
            context.waitUntil(activityStmt.bind('new_booking', `顧客 ${contactName} 預約了 ${bookingDate} 的服務`, '#bookings').run());

            return new Response(JSON.stringify({
                success: true,
                message: '預約成功！',
                confirmationMessage: messageContent // 回傳處理過的訊息
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