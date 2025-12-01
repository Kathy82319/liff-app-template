// functions/api/bookings-create.js (v15.0 - 安全強化版)
import { getDateRange, getDayOfWeek } from './utils/date-helpers.js';

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

        const { userId } = body;

        // --- 【安全性修正 1】頻率限制 (Rate Limiting) ---
        // 防止惡意使用者短時間內灌爆資料庫 (限制：每分鐘最多 3 筆)
        if (userId) {
            const recent = await db.prepare("SELECT COUNT(*) as count FROM Bookings WHERE user_id = ? AND created_at > datetime('now', '-1 minute')").bind(userId).first();
            if (recent && recent.count >= 3) {
                console.warn(`[Security] User ${userId} rate limit exceeded.`);
                return new Response(JSON.stringify({ error: '預約請求過於頻繁，請稍待一分鐘後再試。' }), { status: 429 });
            }
        }
        // --- 修正結束 ---

        const useStoredValue = body.useStoredValue === true;

        let booking_id;
        let messageContent;
        let contactName;
        let bookingDate;
        let productsInfo = [];
        let items = [];
        let calculatedTotalAmount = 0; // 總金額 (將由後端重新計算)

        const operations = []; // 批次操作指令集

        // === 步驟 A: 建立預約主檔與項目 (依類型) ===
        if (body.bookingType === 'guesthouse') {
            // ... (民宿邏輯保持不變，因原本已有庫存與價格檢查) ...
            const { startDate, endDate, items: guesthouseItems } = body;
            contactName = body.contactName;
            bookingDate = startDate;
            items = guesthouseItems;

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

            const fullDateRange = getDateRange(startDate, endDate);
            const stayDates = fullDateRange.slice(0, -1); 

            if (stayDates.length === 0) {
                 return new Response(JSON.stringify({ error: '無效的入住天數。' }), { status: 400 });
            }

            const productIdsToCheck = items.map(item => item.productId);
            const datePlaceholders = stayDates.map(() => '?').join(',');
            const productPlaceholders = productIdsToCheck.map(() => '?').join(',');

            const inventoryCheckStmt = db.prepare(
                `SELECT inventory_date, product_id, status, quantity_available, base_price
                 FROM RoomInventory
                 WHERE inventory_date IN (${datePlaceholders}) AND product_id IN (${productPlaceholders})`
            );
            const { results: currentInventory } = await inventoryCheckStmt.bind(...stayDates, ...productIdsToCheck).all();

            for (const item of items) {
                for (const dateStr of stayDates) {
                    const inventoryRecord = currentInventory.find(inv => inv.inventory_date === dateStr && inv.product_id === item.productId);
                    if (!inventoryRecord || inventoryRecord.status !== 'Open' || inventoryRecord.quantity_available < item.quantity) {
                        const productInfo = await db.prepare("SELECT name FROM Products WHERE product_id = ?").bind(item.productId).first();
                        const productName = productInfo ? productInfo.name : item.productId;
                        return new Response(JSON.stringify({ error: `抱歉，房型 "${productName}" 在 ${dateStr} 的數量不足或未開放預訂。` }), { status: 409 });
                    }
                }
            }

            const totalQuantityBooked = items.reduce((sum, item) => sum + item.quantity, 0);

            const bookingStmt = db.prepare(
                `INSERT INTO Bookings (user_id, contact_name, contact_phone, booking_date, check_out_date, status, time_slot, num_of_people)
                 VALUES (?, ?, ?, ?, ?, 'confirmed', ?, ?) RETURNING booking_id`
            );
             const bookingResult = await bookingStmt.bind(
                 userId,
                 body.contactName,
                 body.contactPhone,
                 startDate,
                 endDate,
                 '',
                 totalQuantityBooked
             ).first();

             if (!bookingResult || !bookingResult.booking_id) {
                 throw new Error('無法建立預約主紀錄，請稍後再試。');
             }
             booking_id = bookingResult.booking_id;

            const itemInsertStmt = db.prepare(
                `INSERT INTO BookingItems (booking_id, product_id, item_name, quantity, price) VALUES (?, ?, ?, ?, ?)`
            );
             const productsInfoStmt = db.prepare(`SELECT product_id, name, price_weekday, price_friday, price_saturday FROM Products WHERE product_id IN (${productPlaceholders})`);
             const { results: fetchedProductsInfo } = await productsInfoStmt.bind(...productIdsToCheck).all();
             productsInfo = fetchedProductsInfo;

            for (const item of items) {
                 const productDetails = productsInfo.find(p => p.product_id === item.productId);
                 if (!productDetails) { throw new Error(`找不到產品資訊: ${item.productId}`); }
                 
                 let itemTotalPrice = 0;
                 for (const dateStr of stayDates) { 
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
                for (const dateStr of stayDates) { 
                    operations.push(inventoryUpdateStmt.bind(item.quantity, dateStr, item.productId, item.quantity));
                }
            }

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
                 const roomSummary = items.map(item => {
                     const name = productsInfo.find(p => p.product_id === item.productId)?.name || item.productId;
                     return `${name} x${item.quantity}`;
                 }).join(', ');
                 messageContent = `您已成功預訂 ${startDate} 至 ${endDate} (${stayDates.length}晚)，預訂房型：${roomSummary}。總金額 $${calculatedTotalAmount}。此訊息僅為通知，若有問題請聯絡店家。`;
            }

        } else if (body.bookingType === 'studio' || !body.bookingType) {
            // --- 【安全性修正 2】工作室模式：強制後端查價 ---
            const { timeSlot, numOfPeople, items: studioItems } = body;
            contactName = body.contactName;
            bookingDate = body.bookingDate;
            items = studioItems;

            if (!userId || !bookingDate || !timeSlot || !numOfPeople || numOfPeople <= 0 || !contactName || !body.contactPhone) {
                return new Response(JSON.stringify({ error: '工作室預約缺少必要參數。' }), { status: 400 });
            }
            if (!Array.isArray(items) || items.length === 0) {
                return new Response(JSON.stringify({ error: '預約必須至少包含一個項目。' }), { status: 400 });
            }

            // 1. 查詢所有產品以獲取正確價格
            const { results: allProducts } = await db.prepare("SELECT name, price_weekday, price_friday, price_saturday FROM Products").all();

            // 2. 建立預約主檔
            const bookingStmt = db.prepare(
                'INSERT INTO Bookings (user_id, contact_name, contact_phone, booking_date, time_slot, num_of_people) VALUES (?, ?, ?, ?, ?, ?) RETURNING booking_id'
            );
            const bookingResult = await bookingStmt.bind(userId, contactName, body.contactPhone, bookingDate, timeSlot, numOfPeople).first();
            booking_id = bookingResult.booking_id;

            // 3. 遍歷項目，強制使用資料庫價格
            const insertItemStmt = db.prepare('INSERT INTO BookingItems (booking_id, item_name, quantity, price, product_id) VALUES (?, ?, ?, ?, ?)');
            
            for (const item of items) {
                // 從資料庫中找到對應產品 (根據名稱)
                // 注意：若前端傳來的名稱被竄改，這裡會找不到而報錯，這也是一種防護
                const product = allProducts.find(p => p.name === item.name);
                
                if (!product) {
                    throw new Error(`找不到產品 "${item.name}"，無法計算價格。`);
                }

                // 根據日期計算正確價格 (呼叫共用邏輯)
                const dayOfWeek = getDayOfWeek(bookingDate); // 0-6
                let realPrice = product.price_weekday;
                if (dayOfWeek === 5) realPrice = product.price_friday !== null ? product.price_friday : realPrice;
                else if (dayOfWeek === 6) realPrice = product.price_saturday !== null ? product.price_saturday : realPrice;

                // 如果資料庫中價格未設定 (null)，則報錯
                if (realPrice === null) {
                    throw new Error(`產品 "${item.name}" 價格設定不完整，無法結帳。`);
                }

                // 使用後端查到的 realPrice，忽略前端傳來的 item.price
                calculatedTotalAmount += (realPrice * item.quantity);
                
                operations.push(insertItemStmt.bind(booking_id, item.name, item.quantity, realPrice, null));
            }
            // --- 修正結束 ---

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
                 const itemSummary = items.map(item => `${item.name} x${item.quantity}`).join(', ');
                 messageContent = `您已成功預約 ${bookingDate} ${timeSlot || ''}，預約項目：${itemSummary}。此訊息僅為通知，若有問題請聯絡店家。`;
             }
        } else {
             return new Response(JSON.stringify({ error: `未知的預約類型: ${body.bookingType}` }), { status: 400 });
        }

        // === 步驟 B: 儲值金扣款邏輯 (使用後端計算的金額) ===
        let paymentStatus = 'unpaid'; 

        if (useStoredValue) {
            const userStmt = db.prepare("SELECT stored_value_balance FROM Users WHERE user_id = ?");
            const user = await userStmt.bind(body.userId).first();
            const currentBalance = user ? (user.stored_value_balance || 0) : 0;

            if (currentBalance < calculatedTotalAmount) {
                return new Response(JSON.stringify({ 
                    error: `儲值金餘額不足 (餘額: $${currentBalance}，需支付: $${calculatedTotalAmount})。請先儲值或改用現場付款。` 
                }), { status: 402 }); 
            }

            const newBalance = currentBalance - calculatedTotalAmount;
            operations.push(
                db.prepare("UPDATE Users SET stored_value_balance = ? WHERE user_id = ?")
                  .bind(newBalance, body.userId)
            );

            const historyNote = `預訂 #${String(booking_id).padStart(5, '0')} 款項扣抵`;
            operations.push(
                db.prepare("INSERT INTO StoredValueHistory (user_id, amount_changed, current_balance, type, notes) VALUES (?, ?, ?, 'booking_payment', ?)")
                  .bind(body.userId, -calculatedTotalAmount, newBalance, historyNote)
            );

            paymentStatus = 'paid';
        }

        // === 步驟 C: 更新訂單總金額與付款狀態 (使用後端計算的金額) ===
        const updateTotalAmountStmt = db.prepare("UPDATE Bookings SET total_amount = ?, payment_status = ? WHERE booking_id = ?");
        operations.push(updateTotalAmountStmt.bind(calculatedTotalAmount, paymentStatus, booking_id));

        // === 步驟 D: 執行所有資料庫操作 ===
        await db.batch(operations);

        // === 步驟 E: 寫入活動紀錄與回傳 ===
        const activityStmt = db.prepare("INSERT INTO Activities (type, message, link) VALUES (?, ?, ?)");
        const activityLink = `#bookings-${booking_id}`;
        let activityMsg = body.bookingType === 'guesthouse' 
            ? `顧客 ${contactName.trim()} 預訂了 ${bookingDate} 至 ${body.endDate} 的服務`
            : `顧客 ${contactName.trim()} 預訂了 ${bookingDate} 的服務`;
        
        if (useStoredValue) {
            activityMsg += " (儲值金付款)";
        }
            
        context.waitUntil(activityStmt.bind('new_booking', activityMsg, activityLink).run());

        if (useStoredValue && !messageContent.includes("儲值金")) { 
             messageContent += `\n(已使用儲值金扣款 $${calculatedTotalAmount})`;
        }

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