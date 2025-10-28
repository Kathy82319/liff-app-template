// functions/api/admin/update-booking-details.js

export async function onRequest(context) {
    try {
        if (context.request.method !== 'POST') {
            return new Response(JSON.stringify({ error: '無效的請求方法' }), { status: 405 });
        }

        const db = context.env.DB;
        const body = await context.request.json();
        const {
            bookingId, bookingDate, timeSlot, numOfPeople, // numOfPeople 現在會從前端傳來
            contactPhone, totalAmount, notes, items,
            check_out_date
        } = body;

        // --- 後端安全驗證 ---
        if (!bookingId || typeof bookingId !== 'number') {
            return new Response(JSON.stringify({ error: '缺少有效的預約 ID。' }), { status: 400 });
        }
        if (!bookingDate || !/^\d{4}-\d{2}-\d{2}$/.test(bookingDate)) {
            return new Response(JSON.stringify({ error: '預約/入住日期格式不正確。' }), { status: 400 });
        }
        if (check_out_date && !/^\d{4}-\d{2}-\d{2}$/.test(check_out_date)) {
             return new Response(JSON.stringify({ error: '退房日期格式不正確。' }), { status: 400 });
        }
         if (check_out_date && new Date(bookingDate) >= new Date(check_out_date)) {
             return new Response(JSON.stringify({ error: '退房日期必須晚於入住日期。' }), { status: 400 });
         }
        // 【修改】驗證 numOfPeople (確保它不是 null 或 undefined)
        if (numOfPeople === null || numOfPeople === undefined || !Number.isInteger(Number(numOfPeople)) || Number(numOfPeople) <= 0) {
            return new Response(JSON.stringify({ error: '人數必須是大於 0 的有效整數。' }), { status: 400 });
        }

        if (!Array.isArray(items)) {
            return new Response(JSON.stringify({ error: '預約項目格式不正確。' }), { status: 400 });
        }

        const operations = [];

        // 1. 更新 Bookings 主表
        const updateBookingStmt = db.prepare(
            `UPDATE Bookings
             SET booking_date = ?, time_slot = ?, num_of_people = ?, contact_phone = ?, total_amount = ?, notes = ?, check_out_date = ?
             WHERE booking_id = ?`
        );
        operations.push(updateBookingStmt.bind(
            bookingDate,
            timeSlot || '', // 使用 || '' 確保非 null
            numOfPeople, // 直接使用從前端傳來的 numOfPeople
            contactPhone || null,
            totalAmount || null,
            notes || null,
            check_out_date || null,
            bookingId
        ));

        // 2. 刪除舊項目
        const deleteItemsStmt = db.prepare('DELETE FROM BookingItems WHERE booking_id = ?');
        operations.push(deleteItemsStmt.bind(bookingId));

        // 3. 重新插入新項目 (邏輯不變)
        if (items.length > 0) {
            const insertItemStmt = db.prepare(
                'INSERT INTO BookingItems (booking_id, item_name, quantity, price) VALUES (?, ?, ?, ?)'
            );
            items.forEach(item => {
                 // 基本驗證 item 結構
                 if (item && item.name && typeof item.qty === 'number' && item.qty > 0) {
                     operations.push(insertItemStmt.bind(
                         bookingId, item.name, item.qty, item.price ?? null // 允許 price 為 null
                     ));
                 } else {
                      console.warn("Skipping invalid item during update:", item);
                 }
            });
        }

        // 使用 batch 執行
        await db.batch(operations);

        // --- 【可選優化】如果更新的是民宿預約，重新計算總金額 ---
        if (check_out_date) {
             // 這裡可以加入重新計算 total_amount 的邏輯
             // 根據 bookingId 讀取 BookingItems, 根據新的日期範圍查價並加總
             // 然後再執行一次 UPDATE Bookings SET total_amount = ? WHERE booking_id = ?
             // 暫時省略此複雜邏輯，依賴前端顯示或下次查詢時計算
        }


        return new Response(JSON.stringify({ success: true, message: '預約更新成功！' }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
        });

    } catch (error) {
        console.error('Error in update-booking-details API:', error);
        // 【新增】在錯誤日誌中包含請求 body (去除敏感資訊)
        try {
             const requestBody = await context.request.json();
             delete requestBody.contactPhone; // 移除電話
             console.error('Failing request body (sanitized):', JSON.stringify(requestBody));
        } catch (readError) {
             console.error('Failed to read failing request body');
        }

        return new Response(JSON.stringify({ error: '更新預約時發生錯誤', details: error.message }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' }, // 確保 header 正確
        });
    }
}