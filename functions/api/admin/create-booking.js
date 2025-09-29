// functions/api/admin/create-booking.js

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
            contactPhone, numOfPeople, item
        } = body;

        // --- 【安全強化：輸入驗證】 ---
        const errors = [];
        if (!userId || typeof userId !== 'string' || userId.length < 5) errors.push('無效的使用者 ID。');
        if (!bookingDate || !isValidDate(bookingDate)) errors.push('無效的日期格式，應為 YYYY-MM-DD。');
        if (!timeSlot || !isValidTime(timeSlot)) errors.push('無效的時間格式，應為 HH:MM。');
        if (!contactName || typeof contactName !== 'string' || contactName.trim().length === 0 || contactName.length > 50) errors.push('聯絡姓名為必填，且長度不可超過 50 字。');
        if (!contactPhone || typeof contactPhone !== 'string' || contactPhone.trim().length === 0 || contactPhone.length > 20) errors.push('聯絡電話為必填，且長度不可超過 20 字。');
        const people = Number(numOfPeople);
        if (!Number.isInteger(people) || people <= 0 || people > 100) errors.push('人數必須是 1 到 100 之間的正整數。');
        if (item && (typeof item !== 'string' || item.length > 100)) errors.push('預約項目長度不可超過 100 字。');

        if (errors.length > 0) {
            return new Response(JSON.stringify({ error: errors.join(' ') }), { status: 400 });
        }
        // --- 【驗證結束】 ---

        const db = context.env.DB;

        const insertStmt = db.prepare(
            'INSERT INTO Bookings (user_id, contact_name, contact_phone, booking_date, time_slot, num_of_people, item) VALUES (?, ?, ?, ?, ?, ?, ?)'
        );
        await insertStmt.bind(
            userId, contactName.trim(), contactPhone.trim(), bookingDate, 
            timeSlot, people, item ? item.trim() : null
        ).run();
        
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