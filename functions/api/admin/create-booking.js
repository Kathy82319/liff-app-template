// functions/api/admin/create-booking.js (v2 - 多項目支援版)

// 輔助函式：正規表達式，用於驗證 YYYY-MM-DD 格式
const isValidDate = (dateString) => /^\d{4}-\d{2}-\d{2}$/.test(dateString);
// 輔助函式：正規表達式，用於驗證 HH:MM 格式
const isValidTime = (timeString) => /^([01]\d|2[0-3]):([0-5]\d)$/.test(timeString);

export async function onRequest(context) {
    try {
        if (context.request.method !== 'POST') {
            return new Response(JSON.stringify({ error: '無效的請求方法' }), { status: 405 });
        }

        const body = await context.request.json();
        const {
            userId, bookingDate, timeSlot, contactName, 
            contactPhone, numOfPeople, items, totalAmount, notes
        } = body;

        // --- 【安全強化：輸入驗證】 ---
        const errors = [];
        if (!userId || typeof userId !== 'string' || userId.length < 5) errors.push('無效的使用者 ID。');
        if (!bookingDate || !isValidDate(bookingDate)) errors.push('無效的日期格式，應為 YYYY-MM-DD。');
        if (!timeSlot || !isValidTime(timeSlot)) errors.push('無效的時間格式，應為 HH:MM。');
        if (!contactName || typeof contactName !== 'string' || contactName.trim().length === 0) errors.push('聯絡姓名為必填。');
        
        // ▼▼▼ 修改點：電話變成非必填 ▼▼▼
        if (contactPhone && (typeof contactPhone !== 'string' || contactPhone.length > 20)) errors.push('電話號碼格式不正確或過長。');
        
        const people = Number(numOfPeople);
        if (!Number.isInteger(people) || people <= 0) errors.push('人數必須是大於 0 的整數。');
        
        if (!Array.isArray(items) || items.length === 0) errors.push('預約必須至少包含一個項目。');
        
        if (notes && (typeof notes !== 'string' || notes.length > 500)) errors.push('備註長度不可超過 500 字。');

        if (errors.length > 0) {
            return new Response(JSON.stringify({ error: errors.join(' ') }), { status: 400 });
        }
        // --- 【驗證結束】 ---

        const db = context.env.DB;

        const bookingStmt = db.prepare(
            `INSERT INTO Bookings (user_id, contact_name, contact_phone, booking_date, time_slot, num_of_people, total_amount, notes) 
             VALUES (?, ?, ?, ?, ?, ?, ?, ?) 
             RETURNING booking_id`
        );
        // ▼▼▼ 修改點：將 contactPhone 傳入資料庫 ▼▼▼
        const { booking_id } = await bookingStmt.bind(
            userId, contactName.trim(), contactPhone.trim() || null, bookingDate, 
            timeSlot, people, totalAmount || null, notes || null
        ).first();

        if (!booking_id) {
            throw new Error('無法建立預約主紀錄，請稍後再試。');
        }

        const itemStmt = db.prepare(
            'INSERT INTO BookingItems (booking_id, item_name, quantity, price) VALUES (?, ?, ?, ?)'
        );
        const itemOperations = items.map(item => {
            const itemName = item.name || '未命名項目';
            const quantity = Number(item.qty) || 1;
            const price = Number(item.price) || null;
            return itemStmt.bind(booking_id, itemName, quantity, price);
        });

        await db.batch(itemOperations);
        
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