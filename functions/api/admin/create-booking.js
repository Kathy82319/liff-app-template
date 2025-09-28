// functions/api/admin/create-booking.js (新檔案)

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

        // 後端嚴格驗證
        if (!userId || !bookingDate || !timeSlot || !contactName || !contactPhone || !numOfPeople) {
            return new Response(JSON.stringify({ error: '所有必填欄位皆不可為空' }), { status: 400 });
        }

        const db = context.env.DB;

        const insertStmt = db.prepare(
            'INSERT INTO Bookings (user_id, contact_name, contact_phone, booking_date, time_slot, num_of_people, item) VALUES (?, ?, ?, ?, ?, ?, ?)'
        );
        await insertStmt.bind(
            userId, contactName, contactPhone, bookingDate, 
            timeSlot, Number(numOfPeople), item || null
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