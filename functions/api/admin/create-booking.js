import { getDateRange } from '../utils/date-helpers.js';

export async function onRequest(context) {
    try {
        if (context.request.method !== 'POST') {
            return new Response(JSON.stringify({ error: '無效的請求方法' }), { status: 405 });
        }

        const body = await context.request.json();
        const {
            userId, bookingDate, checkOutDate, timeSlot, contactName, 
            contactPhone, numOfPeople, items, totalAmount, notes, bookingType
        } = body;

        const errors = [];
        if (!userId) errors.push('無效的使用者 ID。');
        if (!bookingDate) errors.push('日期為必填。');
        if (!contactName) errors.push('聯絡姓名為必填。');
        // 電話已改為非必填，故不檢查 contactPhone
        if (!Array.isArray(items) || items.length === 0) errors.push('預約必須至少包含一個項目。');
        
        if (errors.length > 0) {
            return new Response(JSON.stringify({ error: errors.join(' ') }), { status: 400 });
        }

        const db = context.env.DB;
        const operations = []; 

        // --- 2. 判斷預約類型並處理庫存 (民宿邏輯) ---
        if (bookingType === 'guesthouse' && checkOutDate) {
            if (new Date(bookingDate) >= new Date(checkOutDate)) {
                 return new Response(JSON.stringify({ error: '退房日期必須晚於入住日期。' }), { status: 400 });
            }

            const bookingDates = getDateRange(bookingDate, checkOutDate);
            
            for (const item of items) {
                // 【需求 5】優先使用前端傳來的 productId
                let productId = item.productId;

                // 如果前端沒傳 productId (可能是舊版前端或手動輸入)，嘗試用名稱找
                if (!productId) {
                    const product = await db.prepare("SELECT product_id FROM Products WHERE name = ?").bind(item.name).first();
                    if (product) productId = product.product_id;
                }
                
                if (productId) {
                    // 針對每一天扣除庫存 (允許扣到負數)
                    for (const dateStr of bookingDates) {
                        operations.push(
                            db.prepare(`
                                UPDATE RoomInventory 
                                SET quantity_available = COALESCE(quantity_available, 0) - ? 
                                WHERE inventory_date = ? AND product_id = ?
                            `).bind(item.qty, dateStr, productId)
                        );
                    }
                } else {
                    console.warn(`[CreateBooking] 無法為項目 "${item.name}" 扣除庫存 (找不到 ID)。`);
                }
            }
        }

        // --- 3. 建立預約主檔 (Bookings) ---
        // 【需求 4】這裡確保 booking_date 只存 Start Date (前端已處理，這裡是雙重保險)
        const cleanStartDate = bookingDate.split(' to ')[0];

        const bookingStmt = db.prepare(
            `INSERT INTO Bookings (user_id, contact_name, contact_phone, booking_date, check_out_date, time_slot, num_of_people, total_amount, notes, status) 
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'confirmed') 
             RETURNING booking_id`
        );
        
        const { booking_id } = await bookingStmt.bind(
            userId, contactName.trim(), contactPhone ? contactPhone.trim() : null, 
            cleanStartDate, // 存入乾淨的入住日
            checkOutDate || null, 
            timeSlot ? timeSlot.trim() : '', 
            Number(numOfPeople), totalAmount || null, notes || null
        ).first();

        if (!booking_id) throw new Error('建立預約主檔失敗');

        // --- 4. 建立預約項目 (BookingItems) ---
        const itemStmt = db.prepare(
            'INSERT INTO BookingItems (booking_id, item_name, quantity, price, product_id) VALUES (?, ?, ?, ?, ?)'
        );
        
        for (const item of items) {
            // 這裡同樣優先使用傳入的 productId
            let pid = item.productId || null;
            if (!pid) {
                 const product = await db.prepare("SELECT product_id FROM Products WHERE name = ?").bind(item.name).first();
                 pid = product ? product.product_id : null;
            }
            
            operations.push(itemStmt.bind(booking_id, item.name, item.qty, item.price, pid));
        }

        // --- 5. 執行 Batch ---
        if (operations.length > 0) {
            await db.batch(operations);
        }
        
        // --- 6. 記錄活動日誌 ---
        const activityStmt = db.prepare("INSERT INTO Activities (type, message, link) VALUES (?, ?, ?)");
        const activityLink = `#bookings-${booking_id}`;
        context.waitUntil(activityStmt.bind('new_booking_admin', `管理者為 ${contactName.trim()} 建立了 ${cleanStartDate} 的預約`, activityLink).run());
      
        return new Response(JSON.stringify({ success: true, message: '預約已成功建立' }), {
            status: 201,
            headers: { 'Content-Type': 'application/json' },
        });

    } catch (error) {
        console.error('Error in admin/create-booking API:', error);
        return new Response(JSON.stringify({ error: '建立預約失敗', details: error.message }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' },
        });
    }
}
