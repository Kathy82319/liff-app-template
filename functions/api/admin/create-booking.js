{
type: existing file
fileName: kathy82319/liff-app-template/liff-app-template-9010913f3bb95098710929f5b1cd6653aa18c0ae/functions/api/admin/create-booking.js
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

        // --- 1. 基礎驗證 ---
        const errors = [];
        if (!userId) errors.push('無效的使用者 ID。');
        if (!bookingDate) errors.push('日期為必填。');
        if (!contactName) errors.push('聯絡姓名為必填。');
        // 【修改目標 1】電話不再是必填，後端允許 null
        
        if (!Array.isArray(items) || items.length === 0) errors.push('預約必須至少包含一個項目。');
        
        if (errors.length > 0) {
            return new Response(JSON.stringify({ error: errors.join(' ') }), { status: 400 });
        }

        const db = context.env.DB;
        const operations = []; 

        // --- 2. 【目標 4】判斷預約類型並處理庫存 (民宿邏輯) ---
        if (bookingType === 'guesthouse' && checkOutDate) {
            if (new Date(bookingDate) >= new Date(checkOutDate)) {
                 return new Response(JSON.stringify({ error: '退房日期必須晚於入住日期。' }), { status: 400 });
            }

            // 取得日期範圍 (不含退房日)
            const bookingDates = getDateRange(bookingDate, checkOutDate);
            
            for (const item of items) {
                // 我們需要 product_id 才能扣庫存。
                // 嘗試從 Products 表中找出對應的 product_id
                const product = await db.prepare("SELECT product_id FROM Products WHERE name = ?").bind(item.name).first();
                
                if (product) {
                    const productId = product.product_id;
                    
                    // 針對每一天扣除庫存 (Upsert/Update)
                    for (const dateStr of bookingDates) {
                        // 手動預約視為「強制扣除」，允許扣到負數
                        // 使用 COALESCE 處理：如果該日原本沒有紀錄(視為0/關閉)，扣除後變負數
                        operations.push(
                            db.prepare(`
                                UPDATE RoomInventory 
                                SET quantity_available = COALESCE(quantity_available, 0) - ? 
                                WHERE inventory_date = ? AND product_id = ?
                            `).bind(item.qty, dateStr, productId)
                        );
                    }
                } else {
                    // 如果是手動輸入的項目名稱，無法對應到庫存，則跳過庫存扣除
                    console.warn(`找不到產品 "${item.name}" 的 ID，將跳過庫存扣除。`);
                }
            }
        }

        // --- 3. 建立預約主檔 (Bookings) ---
        // 必須先執行以獲取 booking_id
        const bookingStmt = db.prepare(
            `INSERT INTO Bookings (user_id, contact_name, contact_phone, booking_date, check_out_date, time_slot, num_of_people, total_amount, notes, status) 
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'confirmed') 
             RETURNING booking_id`
        );
        
        const { booking_id } = await bookingStmt.bind(
            userId, contactName.trim(), contactPhone ? contactPhone.trim() : null, bookingDate,
            checkOutDate || null, // 民宿有，工作室無
            timeSlot ? timeSlot.trim() : '', 
            Number(numOfPeople), totalAmount || null, notes || null
        ).first();

        if (!booking_id) throw new Error('建立預約主檔失敗');

        // --- 4. 建立預約項目 (BookingItems) ---
        const itemStmt = db.prepare(
            'INSERT INTO BookingItems (booking_id, item_name, quantity, price, product_id) VALUES (?, ?, ?, ?, ?)'
        );
        
        for (const item of items) {
            const product = await db.prepare("SELECT product_id FROM Products WHERE name = ?").bind(item.name).first();
            const pid = product ? product.product_id : null;
            
            operations.push(itemStmt.bind(booking_id, item.name, item.qty, item.price, pid));
        }

        // --- 5. 執行 Batch (項目插入 + 庫存扣除) ---
        if (operations.length > 0) {
            await db.batch(operations);
        }
        
        // --- 6. 記錄活動日誌 ---
        const activityStmt = db.prepare("INSERT INTO Activities (type, message, link) VALUES (?, ?, ?)");
        const activityLink = `#bookings-${booking_id}`;
        context.waitUntil(activityStmt.bind('new_booking_admin', `管理者為 ${contactName.trim()} 建立了 ${bookingDate} 的預約`, activityLink).run());
      
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
}