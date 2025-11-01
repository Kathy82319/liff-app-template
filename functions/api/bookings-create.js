// functions/api/bookings-create.js (v4.1 - 修正活動日誌 link)

// 輔助函式：產生指定日期範圍內的所有日期字串 (YYYY-MM-DD)
function getDateRange(startDateStr, endDateStr) {
    const dates = [];
    let currentDate = new Date(startDateStr + 'T00:00:00');
    const endDate = new Date(endDateStr + 'T00:00:00');
    while (currentDate < endDate) {
        dates.push(currentDate.toISOString().split('T')[0]);
        currentDate.setDate(currentDate.getDate() + 1);
    }
    return dates;
}

const FIXED_DRAFT_IDS = {
    AUTO_CONFIRMATION: 2
};
const DEFAULT_AUTO_CONFIRMATION_CONTENT = "感謝您的預訂！\n\n您的訂房資訊如下：\n入住日期：{{startDate}}\n退房日期：{{endDate}}\n房型：{{roomSummary}}\n總金額：{{totalAmount}}\n\n期待您的光臨！";

export async function onRequest(context) {
    try {
        if (context.request.method !== 'POST') {
            return new Response(JSON.stringify({ error: '無效的請求方法' }), { status: 405 });
        }

        const db = context.env.DB;
        const body = await context.request.json();
        console.log("[bookings-create] Received Payload:", JSON.stringify(body));

        let booking_id; // 在頂層宣告
        let messageContent; // 訊息內容
        let contactName; // 聯絡人姓名
        let bookingDate; // 預約日期
        let productsInfo = []; // 產品資訊
        let items = []; // 項目

        if (body.bookingType === 'guesthouse') {
            const { userId, startDate, endDate, items: guesthouseItems } = body;
            contactName = body.contactName;
            bookingDate = startDate;
            items = guesthouseItems; // 將 items 指向 guesthouseItems

            if (!userId || !startDate || !endDate || !contactName || !body.contactPhone || !Array.isArray(items) || items.length === 0) {
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

            const bookingDates = getDateRange(startDate, endDate);
            if (bookingDates.length === 0) {
                 return new Response(JSON.stringify({ error: '無效的入住天數。' }), { status: 400 });
            }

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
                }
            }

            const totalQuantityBooked = items.reduce((sum, item) => sum + item.quantity, 0);

            const operations = [];
             const bookingStmt = db.prepare(
                `INSERT INTO Bookings (user_id, contact_name, contact_phone, booking_date, check_out_date, status, time_slot, num_of_people)
                 VALUES (?, ?, ?, ?, ?, 'confirmed', ?, ?) RETURNING booking_id`
            );
             const bookingResult = await bookingStmt.bind(
                 userId,
                 body.contactName, // 使用 body 傳來的
                 body.contactPhone, // 使用 body 傳來的
                 startDate,
                 endDate,
                 '',
                 totalQuantityBooked
             ).first();

             if (!bookingResult || !bookingResult.booking_id) {
                 throw new Error('無法建立預約主紀錄，請稍後再試。');
             }
             booking_id = bookingResult.booking_id; // 賦值給頂層
             console.log(`[bookings-create] Guesthouse Booking record created with ID: ${booking_id}`);

            const itemInsertStmt = db.prepare(
                `INSERT INTO BookingItems (booking_id, product_id, item_name, quantity, price) VALUES (?, ?, ?, ?, ?)`
            );
             const productsInfoStmt = db.prepare(`SELECT product_id, name, price_weekday, price_friday, price_saturday FROM Products WHERE product_id IN (${productPlaceholders})`);
             const { results: fetchedProductsInfo } = await productsInfoStmt.bind(...productIdsToCheck).all();
             productsInfo = fetchedProductsInfo; // 賦值給頂層

            let calculatedTotalAmount = 0;

            for (const item of items) {
                 const productDetails = productsInfo.find(p => p.product_id === item.productId);
                 if (!productDetails) { throw new Error(`找不到產品資訊: ${item.productId}`); }
                 let itemTotalPrice = 0;
                 for (const dateStr of bookingDates) {
                     const inventoryRecord = currentInventory.find(inv => inv.inventory_date === dateStr && inv.product_id === item.productId);
                     let dailyPrice = inventoryRecord?.base_price;
                     if (dailyPrice === null || dailyPrice === undefined) {
                         const date = new Date(dateStr + 'T00:00:00');
                         const dayOfWeek = date.getDay();
                         if (dayOfWeek === 5) dailyPrice = productDetails.price_friday ?? productDetails.price_weekday;
                         else if (dayOfWeek === 6) dailyPrice = productDetails.price_saturday ?? productDetails.price_weekday;
                         else dailyPrice = productDetails.price_weekday;
                     }
                     if (dailyPrice === null || dailyPrice === undefined || dailyPrice <= 0) {
                          throw new Error(`房型 "${productDetails.name}" 在 ${dateStr} 價格無效，無法完成預訂。`);
                     }
                     itemTotalPrice += dailyPrice;
                 }
                 const pricePerItem = itemTotalPrice;
                 calculatedTotalAmount += pricePerItem * item.quantity;
                 operations.push(itemInsertStmt.bind(
                      booking_id, item.productId, productDetails.name, item.quantity, pricePerItem
                 ));
            }
             
            const inventoryUpdateStmt = db.prepare(
                `UPDATE RoomInventory SET quantity_available = quantity_available - ?
                 WHERE inventory_date = ? AND product_id = ? AND quantity_available >= ?`
            );
            for (const item of items) {
                for (const dateStr of bookingDates) {
                    operations.push(inventoryUpdateStmt.bind(item.quantity, dateStr, item.productId, item.quantity));
                }
            }
             const updateTotalAmountStmt = db.prepare("UPDATE Bookings SET total_amount = ? WHERE booking_id = ?");
             operations.push(updateTotalAmountStmt.bind(calculatedTotalAmount, booking_id));
            await db.batch(operations);

            // --- 準備訊息內容 ---
            messageContent = DEFAULT_AUTO_CONFIRMATION_CONTENT;
            try {
                const draftStmt = db.prepare("SELECT content FROM MessageDrafts WHERE draft_id = ?");
                const draft = await draftStmt.bind(FIXED_DRAFT_IDS.AUTO_CONFIRMATION).first();
                if (draft && draft.content) { messageContent = draft.content; }
                 const roomSummary = items.map(item => {
                     const name = productsInfo.find(p => p.product_id === item.productId)?.name || item.productId;
                     return `${name} x${item.quantity}`;
                 }).join(', ');
                messageContent = messageContent
                    .replace(/{{startDate}}/g, startDate)
                    .replace(/{{endDate}}/g, endDate)
                    .replace(/{{roomSummary}}/g, roomSummary)
                    .replace(/{{totalAmount}}/g, `$${calculatedTotalAmount}`);
            } catch (draftError) {
                console.error("[bookings-create] Error fetching/processing draft:", draftError);
                 const roomSummary = items.map(item => {
                     const name = productsInfo.find(p => p.product_id === item.productId)?.name || item.productId;
                     return `${name} x${item.quantity}`;
                 }).join(', ');
                 messageContent = `您已成功預訂 ${startDate} 至 ${endDate} (${bookingDates.length}晚)，預訂房型：${roomSummary}。總金額 $${calculatedTotalAmount}。此訊息僅為通知，若有問題請聯絡店家。`;
            }

        } else if (body.bookingType === 'studio' || !body.bookingType) {
            const { userId, timeSlot, numOfPeople, items: studioItems } = body;
            contactName = body.contactName;
            bookingDate = body.bookingDate;
            items = studioItems; // 將 items 指向 studioItems

            if (!userId || !bookingDate || !timeSlot || !numOfPeople || numOfPeople <= 0 || !contactName || !body.contactPhone) {
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

            const bookingStmt = db.prepare(
                'INSERT INTO Bookings (user_id, contact_name, contact_phone, booking_date, time_slot, num_of_people) VALUES (?, ?, ?, ?, ?, ?) RETURNING booking_id'
            );
             const bookingResult = await bookingStmt.bind(userId, contactName, body.contactPhone, bookingDate, timeSlot, numOfPeople).first();

             if (!bookingResult || !bookingResult.booking_id) {
                 throw new Error('無法建立預約主紀錄，請稍後再試。');
             }
             booking_id = bookingResult.booking_id; // 賦值給頂層
             console.log(`[bookings-create] Studio Booking record created with ID: ${booking_id}`);

            const itemOperations = [];
            const itemStmt = db.prepare(
                'INSERT INTO BookingItems (booking_id, item_name, quantity, price, product_id) VALUES (?, ?, ?, ?, ?)'
            );
             const itemNames = items.map(item => item.name);
             const namePlaceholders = itemNames.map(() => '?').join(',');
             if (itemNames.length > 0) {
                const productsInfoStmt = db.prepare(`SELECT name, product_id FROM Products WHERE name IN (${namePlaceholders})`);
                const { results: fetchedProductsInfo } = await productsInfoStmt.bind(...itemNames).all();
                productsInfo = fetchedProductsInfo || [];
             }

            let calculatedTotalAmount = 0;
            items.forEach(item => {
                const productDetails = productsInfo.find(p => p.name === item.name);
                calculatedTotalAmount += (item.price * item.quantity);
                itemOperations.push(itemStmt.bind(
                    booking_id, item.name, item.quantity, item.price,
                    productDetails ? productDetails.product_id : null
                ));
            });
             const updateTotalAmountStmt = db.prepare("UPDATE Bookings SET total_amount = ? WHERE booking_id = ?");
             itemOperations.push(updateTotalAmountStmt.bind(calculatedTotalAmount, booking_id));
            await db.batch(itemOperations);

             // --- 準備訊息內容 ---
             messageContent = `感謝您的預約！\n\n您的預約資訊如下：\n日期：{{bookingDate}}\n時段：{{timeSlot}}\n項目：{{itemSummary}}\n\n期待您的光臨！`;
             try {
                const draftStmt = db.prepare("SELECT content FROM MessageDrafts WHERE draft_id = ?");
                const draft = await draftStmt.bind(FIXED_DRAFT_IDS.AUTO_CONFIRMATION).first();
                if (draft && draft.content) { messageContent = draft.content; }
                 const itemSummary = items.map(item => `${item.name} x${item.quantity}`).join(', ');
                messageContent = messageContent
                    .replace(/{{bookingDate}}/g, bookingDate)
                    .replace(/{{timeSlot}}/g, timeSlot || '未指定')
                    .replace(/{{itemSummary}}/g, itemSummary)
                    .replace(/{{totalAmount}}/g, `$${calculatedTotalAmount}`);
             } catch (draftError) {
                 console.error("[bookings-create] Error fetching/processing draft for studio:", draftError);
                 const itemSummary = items.map(item => `${item.name} x${item.quantity}`).join(', ');
                 messageContent = `您已成功預約 ${bookingDate} ${timeSlot || ''}，預約項目：${itemSummary}。此訊息僅為通知，若有問題請聯絡店家。`;
             }
        } else {
             return new Response(JSON.stringify({ error: `未知的預約類型: ${body.bookingType}` }), { status: 400 });
        }

        // --- 【v6.2 修正】統一在最外層記錄活動 (使用頂層變數) ---
        const activityStmt = db.prepare("INSERT INTO Activities (type, message, link) VALUES (?, ?, ?)");
        const activityLink = `#bookings-${booking_id}`; // 新格式
        context.waitUntil(activityStmt.bind('new_booking', `顧客 ${contactName} 預訂了 ${bookingDate} 的服務`, activityLink).run());
        // --- 修正結束 ---

        return new Response(JSON.stringify({
            success: true,
            message: '預約成功！',
            confirmationMessage: messageContent
        }), { status: 201, headers: { 'Content-Type': 'application/json' } });

    } catch (error) {
        console.error('Error in bookings-create API:', error);
        return new Response(JSON.stringify({ error: '建立預約失敗。', details: error.message }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' },
        });
    }
}