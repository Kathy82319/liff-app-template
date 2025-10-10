// functions/api/bookings-create.js (v2 - 多項目支援版)
export async function onRequest(context) {
  try {
    if (context.request.method !== 'POST') {
      return new Response(JSON.stringify({ error: '無效的請求方法' }), { status: 405 });
    }

    const { 
        userId, 
        bookingDate, 
        timeSlot, 
        numOfPeople, 
        contactName, 
        contactPhone,
        items // 前端會傳來一個包含多個項目的陣列
    } = await context.request.json();
    
    // --- 後端驗證 ---
    if (!userId || !bookingDate || !timeSlot || !numOfPeople || numOfPeople <= 0 || !contactName || !contactPhone) {
      return new Response(JSON.stringify({ error: '顧客基本資料與預約時段為必填。' }), { status: 400 });
    }
    if (!Array.isArray(items) || items.length === 0) {
      return new Response(JSON.stringify({ error: '預約必須至少包含一個項目。' }), { status: 400 });
    }

    const db = context.env.DB;

    // --- 【核心修改】使用交易 (Transaction) 來確保資料一致性 ---
    // D1 目前不直接支援 transaction, 我們用 batch() 來模擬原子操作
    
    // 1. 準備插入 Bookings 主表的指令
    const bookingStmt = db.prepare(
      'INSERT INTO Bookings (user_id, contact_name, contact_phone, booking_date, time_slot, num_of_people) VALUES (?, ?, ?, ?, ?, ?) RETURNING booking_id'
    );
    // 執行並立即獲取新產生的 booking_id
    const { booking_id } = await bookingStmt.bind(userId, contactName, contactPhone, bookingDate, timeSlot, numOfPeople).first();

    if (!booking_id) {
        throw new Error('無法建立預約主紀錄，請稍後再試。');
    }

    // 2. 準備批次插入 BookingItems 的指令
    const itemStmt = db.prepare(
        'INSERT INTO BookingItems (booking_id, item_name, quantity) VALUES (?, ?, ?)'
    );
    const itemOperations = items.map(item => {
        // 在後端再次驗證每個項目的內容
        const itemName = item.name || '未命名項目';
        const quantity = Number(item.qty) || 1;
        return itemStmt.bind(booking_id, itemName, quantity);
    });

    // 3. 一次性執行所有 item 的插入
    await db.batch(itemOperations);
    
    // 背景同步至 Google Sheet 的邏輯可以先暫時移除或註解，因為格式已經改變
    // context.waitUntil(...) 

    // 準備回傳給顧客的確認訊息
    const itemSummary = items.map(item => `${item.name} x${item.qty}`).join(', ');
    const message = `您已成功預約 ${bookingDate} ${timeSlot}，預約項目：${itemSummary}。此訊息僅為通知，若有問題請聯絡店家。`;

    return new Response(JSON.stringify({ 
        success: true, 
        message: '預約成功！', 
        confirmationMessage: message 
    }), { status: 201, headers: { 'Content-Type': 'application/json' } });

  } catch (error) {
    console.error('Error in bookings-create API:', error);
    return new Response(JSON.stringify({ error: '建立預約失敗。', details: error.message }), { status: 500 });
  }
}