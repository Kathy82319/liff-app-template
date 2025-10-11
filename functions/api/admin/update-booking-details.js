// functions/api/admin/update-booking-details.js

export async function onRequest(context) {
    try {
        if (context.request.method !== 'POST') {
            return new Response(JSON.stringify({ error: '無效的請求方法' }), { status: 405 });
        }

        const db = context.env.DB;
        const body = await context.request.json();
        const {
            bookingId, bookingDate, timeSlot, numOfPeople,
            contactPhone, totalAmount, notes, items
        } = body;

        // --- 後端安全驗證 ---
        if (!bookingId || typeof bookingId !== 'number') {
            return new Response(JSON.stringify({ error: '缺少有效的預約 ID。' }), { status: 400 });
        }
        if (!bookingDate || !/^\d{4}-\d{2}-\d{2}$/.test(bookingDate)) {
            return new Response(JSON.stringify({ error: '日期格式不正確。' }), { status: 400 });
        }
        if (!Array.isArray(items)) {
            return new Response(JSON.stringify({ error: '預約項目格式不正確。' }), { status: 400 });
        }

        // 準備一系列資料庫操作
        const operations = [];

        // 1. 更新 Bookings 主表
        const updateBookingStmt = db.prepare(
            `UPDATE Bookings 
             SET booking_date = ?, time_slot = ?, num_of_people = ?, contact_phone = ?, total_amount = ?, notes = ?
             WHERE booking_id = ?`
        );
        operations.push(updateBookingStmt.bind(
            bookingDate, timeSlot, numOfPeople, contactPhone || null, 
            totalAmount || null, notes || null, bookingId
        ));

        // 2. 刪除該筆預約所有舊的項目
        const deleteItemsStmt = db.prepare('DELETE FROM BookingItems WHERE booking_id = ?');
        operations.push(deleteItemsStmt.bind(bookingId));

        // 3. 重新插入所有新的項目
        if (items.length > 0) {
            const insertItemStmt = db.prepare(
                'INSERT INTO BookingItems (booking_id, item_name, quantity, price) VALUES (?, ?, ?, ?)'
            );
            items.forEach(item => {
                operations.push(insertItemStmt.bind(
                    bookingId, item.name, item.qty, item.price
                ));
            });
        }

        // 使用 batch 批次執行所有操作，確保資料一致性
        await db.batch(operations);

        return new Response(JSON.stringify({ success: true, message: '預約更新成功！' }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
        });

    } catch (error) {
        console.error('Error in update-booking-details API:', error);
        return new Response(JSON.stringify({ error: '更新預約時發生錯誤', details: error.message }), {
            status: 500,
        });
    }
}