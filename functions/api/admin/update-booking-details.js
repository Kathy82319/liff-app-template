// functions/api/admin/update-booking-details.js

export async function onRequest(context) {
    try {
        if (context.request.method !== 'POST') { //
            return new Response(JSON.stringify({ error: '無效的請求方法' }), { status: 405 }); //
        }

        const db = context.env.DB; //
        const body = await context.request.json(); //
        // --- 【修改】加入 check_out_date ---
        const {
            bookingId, bookingDate, timeSlot, numOfPeople,
            contactPhone, totalAmount, notes, items,
            check_out_date // 新增
        } = body; //

        // --- 後端安全驗證 ---
        if (!bookingId || typeof bookingId !== 'number') { //
            return new Response(JSON.stringify({ error: '缺少有效的預約 ID。' }), { status: 400 }); //
        }
        // 【修改】同時驗證 bookingDate 和 check_out_date (如果存在)
        if (!bookingDate || !/^\d{4}-\d{2}-\d{2}$/.test(bookingDate)) { //
            return new Response(JSON.stringify({ error: '預約/入住日期格式不正確。' }), { status: 400 });
        }
        if (check_out_date && !/^\d{4}-\d{2}-\d{2}$/.test(check_out_date)) {
             return new Response(JSON.stringify({ error: '退房日期格式不正確。' }), { status: 400 });
        }
         // 可選：驗證退房日期是否晚於入住日期
         if (check_out_date && new Date(bookingDate) >= new Date(check_out_date)) {
             return new Response(JSON.stringify({ error: '退房日期必須晚於入住日期。' }), { status: 400 });
         }

        if (!Array.isArray(items)) { //
            return new Response(JSON.stringify({ error: '預約項目格式不正確。' }), { status: 400 }); //
        }


        const operations = []; //

        // 1. 更新 Bookings 主表
        // --- 【修改】加入 check_out_date=? ---
        const updateBookingStmt = db.prepare(
            `UPDATE Bookings
             SET booking_date = ?, time_slot = ?, num_of_people = ?, contact_phone = ?, total_amount = ?, notes = ?, check_out_date = ?
             WHERE booking_id = ?`
        ); //
        operations.push(updateBookingStmt.bind(
            bookingDate,
            timeSlot, // 工作室用
            numOfPeople, // 工作室用 (民宿可能由後端計算)
            contactPhone || null,
            totalAmount || null, // 工作室用 (民宿由後端計算)
            notes || null,
            check_out_date || null, // 民宿用，工作室為 null
            bookingId
        )); //

        // 2. 刪除舊項目
        const deleteItemsStmt = db.prepare('DELETE FROM BookingItems WHERE booking_id = ?'); //
        operations.push(deleteItemsStmt.bind(bookingId)); //

        // 3. 重新插入新項目 (邏輯不變)
        if (items.length > 0) { //
            const insertItemStmt = db.prepare(
                'INSERT INTO BookingItems (booking_id, item_name, quantity, price) VALUES (?, ?, ?, ?)'
            ); //
            items.forEach(item => { //
                // --- 【修改】使用 item.qty ---
                operations.push(insertItemStmt.bind(
                    bookingId, item.name, item.qty, item.price //
                )); //
            });
        }

        // 使用 batch 執行
        await db.batch(operations); //

        // --- 【可選優化】如果更新的是民宿預約，重新計算總人數和總金額 ---
        if (check_out_date) { // 簡單判斷是否為民宿
            // TODO: 在這裡加入重新計算 total_amount 和 num_of_people 的邏輯
            // 這會比較複雜，需要根據新的日期範圍和項目，重新查詢 RoomInventory 或 Products 價格
            // 然後再執行一次 UPDATE Bookings
            // 暫時先跳過這步，讓使用者手動調整或依賴下次查詢時的計算
        }


        return new Response(JSON.stringify({ success: true, message: '預約更新成功！' }), { //
            status: 200,
            headers: { 'Content-Type': 'application/json' }, //
        });

    } catch (error) {
        console.error('Error in update-booking-details API:', error); //
        return new Response(JSON.stringify({ error: '更新預約時發生錯誤', details: error.message }), { //
            status: 500,
        });
    }
}