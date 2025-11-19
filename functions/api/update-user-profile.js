export async function onRequest(context) {
  try {
    if (context.request.method !== 'POST') {
      return new Response('Invalid request method.', { status: 405 });
    }

    const body = await context.request.json();
    // 【修正】移除 preferredproduct
    const { userId, realName, phone, email, displayName, pictureUrl } = body;

    // --- 【修正的驗證區塊】 ---
    const errors = [];
    if (!userId || typeof userId !== 'string') {
        errors.push('無效的使用者 ID。');
    }

    
    // 【修正】允許 phone 為空字串，但如果不為空，則必須符合格式
    if (phone && (typeof phone !== 'string' || !/^\d{10}$/.test(phone))) {
        errors.push('請輸入有效的 10 碼手機號碼，或留空。');
    }
    
    // 【修正】允許 realName 為空字串
    if (realName && (typeof realName !== 'string' || realName.length > 50)) {
        errors.push('真實姓名長度不可超過 50 字。');
    }

    // 【修正】允許 email 為空字串，但如果不為空，則必須符合格式
    if (email && (typeof email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))) {
        errors.push('請輸入有效的電子信箱格式，或留空。');
    }

    if (displayName === undefined || pictureUrl === undefined) {
        errors.push('缺少必要的 LINE 使用者資訊。');
    }

    if (errors.length > 0) {
        return new Response(JSON.stringify({ error: errors.join(' ') }), {
            status: 400, headers: { 'Content-Type': 'application/json' },
        });
    }

    const db = context.env.DB;

    const stmt = db.prepare(
      'UPDATE Users SET real_name = ?,  phone = ?, email = ?, line_display_name = ?, line_picture_url = ? WHERE user_id = ?'
    );
    
    // 【修正】bind 參數中移除 preferredproductString
    const result = await stmt.bind(
        realName || '',
        phone || '', // 允許空字串
        email || '', // 允許空字串
        displayName,
        pictureUrl,
        userId
    ).run();
    
    if (result.meta.changes === 0) {
      return new Response(JSON.stringify({ error: `找不到使用者 ID: ${userId}，無法更新資料。` }), {
        status: 404, headers: { 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ 
        success: true, 
        message: '成功更新使用者登錄資料！' 
    }), {
      status: 200, headers: { 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error in update-user-profile API:', error);
    // 【修正】回傳更詳細的錯誤
    const errorResponse = { error: '伺服器內部錯誤，更新資料失敗。', details: error.message };
    return new Response(JSON.stringify(errorResponse), {
      status: 500, headers: { 'Content-Type': 'application/json' },
    });
  }
}