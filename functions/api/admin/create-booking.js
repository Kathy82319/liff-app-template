
// 輔助函式：正規表達式，用於驗證 YYYY-MM-DD 格式
const isValidDate = (dateString) => /^\d{4}-\d{2}-\d{2}$/.test(dateString);

export async function onRequest(context) {
    try {
        if (context.request.method !== 'POST') {
            return new Response(JSON.stringify({ error: '無效的請求方法' }), { status: 405 });
        }

        const body = await context.request.json();
        const {
            userId, bookingDate, timeSlot, contactName, 
            contactPhone, numOfPeople, items, totalAmount, notes,
            bookingType, endDate // 新增參數
        } = body;

        // --- 【安全強化：輸入驗證】 ---
        const errors = [];
        if (!userId || typeof userId !== 'string' || userId.length < 5) errors.push('無效的使用者 ID。');
        if (!bookingDate || !isValidDate(bookingDate)) errors.push('無效的日期格式，應為 YYYY-MM-DD。');
        if (!contactName || typeof contactName !== 'string' || contactName.trim().length === 0) errors.push('聯絡姓名為必填。');
        
        if (contactPhone && (typeof contactPhone !== 'string' || contactPhone.length > 20)) errors.push('電話號碼格式不正確或過長。');
        
        const people = Number(numOfPeople);
        if (!Number.isInteger(people) || people <= 0) errors.push('人數必須是大於 0 的整數。');
        
        if (!Array.isArray(items) || items.length === 0) errors.push('預約必須至少包含一個項目。');
        
        if (notes && (typeof notes !== 'string' || notes.length > 500)) errors.push('備註長度不可超過 500 字。');

        // 民宿專用驗證
        if (bookingType === 'guesthouse') {
            if (!endDate || !isValidDate(endDate)) errors.push('民宿訂房必須提供有效的退房日期。');
            if (new Date(bookingDate) >= new Date(endDate)) errors.push('退房日期必須晚於入住日期。');
        }

        if (errors.length > 0) {
            return new Response(JSON.stringify({ error: errors.join(' ') }), { status: 400 });
        }
        // --- 【驗證結束】 ---

        const db = context.env.DB;
        const operations = [];

        // 1. 建立預約主紀錄 (Bookings)
        // 注意：如果是民宿，我們會將 check_out_date 寫入，time_slot 可能為空
        const bookingStmt = db.prepare(
            `INSERT INTO Bookings (user_id, contact_name, contact_phone, booking_date, time_slot, num_of_people, total_amount, notes, check_out_date, status) 
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'confirmed') 
             RETURNING booking_id`
        );
        
        const { booking_id } = await bookingStmt.bind(
            userId, 
            contactName.trim(), 
            contactPhone ? contactPhone.trim() : null, 
            bookingDate,
            timeSlot ? timeSlot.trim() : '',
            people, 
            totalAmount || null, 
            notes || null,
            bookingType === 'guesthouse' ? endDate : null // 民宿才寫入退房日
        ).first();

        if (!booking_id) {
            throw new Error('無法建立預約主紀錄，請稍後再試。');
        }

        // 2. 建立預約明細 (BookingItems)
        // 【修正】加入 product_id 欄位
        const itemStmt = db.prepare(
            'INSERT INTO BookingItems (booking_id, item_name, quantity, price, product_id) VALUES (?, ?, ?, ?, ?)'
        );
        
        items.forEach(item => {
            const itemName = item.name || '未命名項目';
            const quantity = Number(item.qty) || 1;
            const price = Number(item.price) || null;
            const productId = item.productId || null; // 從前端獲取 productId
            operations.push(itemStmt.bind(booking_id, itemName, quantity, price, productId));
        });

        // 3. 【新增】民宿庫存扣除邏輯
        if (bookingType === 'guesthouse' && endDate) {
            const start = new Date(bookingDate);
            const end = new Date(endDate);
            
            // 產生入住期間的所有日期 (不含退房日)
            const datesToUpdate = [];
            for (let d = new Date(start); d < end; d.setDate(d.getDate() + 1)) {
                datesToUpdate.push(d.toISOString().split('T')[0]);
            }

            // 準備庫存更新指令 (使用 UPSERT 語法)
            // 邏輯：如果該日期+房型已有紀錄，則數量減去預訂量 (可能變負數)
            // 如果無紀錄，則插入一筆新紀錄，數量設為 0 - 預訂量 (即負數)，狀態設為 Open (假設若無設定則視為預設開啟但無庫存資料)
            const inventoryUpsertStmt = db.prepare(`
                INSERT INTO RoomInventory (inventory_date, product_id, quantity_available, status) 
                VALUES (?1, ?2, 0 - ?3, 'Open') 
                ON CONFLICT(product_id, inventory_date) 
                DO UPDATE SET quantity_available = quantity_available - ?3
            `);

            items.forEach(item => {
                if (item.productId) { // 只有在有 productId 時才能扣庫存
                    datesToUpdate.forEach(dateStr => {
                        operations.push(inventoryUpsertStmt.bind(dateStr, item.productId, item.qty));
                    });
                }
            });
        }

        // 4. 執行批次寫入
        await db.batch(operations);
        
        // 5. 寫入活動紀錄
        const activityStmt = db.prepare("INSERT INTO Activities (type, message, link) VALUES (?, ?, ?)");
        const activityLink = `#bookings-${booking_id}`;
        const activityMsg = bookingType === 'guesthouse' 
            ? `管理者為 ${contactName.trim()} 建立了 ${bookingDate} 至 ${endDate} 的民宿預約`
            : `管理者為 ${contactName.trim()} 建立了 ${bookingDate} 的預約`;
            
        context.waitUntil(activityStmt.bind('new_booking_admin', activityMsg, activityLink).run());
      
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