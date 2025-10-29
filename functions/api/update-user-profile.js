// functions/api/update-user-profile.js


export async function onRequest(context) {
  try {
    if (context.request.method !== 'POST') {
      return new Response('Invalid request method.', { status: 405 });
    }

    const body = await context.request.json();
    const { userId, realName, nickname, phone, email, preferredproduct, displayName, pictureUrl } = body;

    // --- 【新增的驗證區塊】 ---
    const errors = [];
    if (!userId || typeof userId !== 'string') {
        errors.push('無效的使用者 ID。');
    }
    if (!nickname || typeof nickname !== 'string' || nickname.trim().length === 0 || nickname.length > 50) {
        errors.push('暱稱為必填，且長度不可超過 50 字。');
    }
    if (!phone || !/^\d{10}$/.test(phone)) {
        errors.push('請輸入有效的 10 碼手機號碼。');
    }
    if (realName && typeof realName !== 'string' || realName.length > 50) {
        errors.push('真實姓名長度不可超過 50 字。');
    }
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        errors.push('請輸入有效的電子信箱格式。');
    }
    if (displayName === undefined || pictureUrl === undefined) {
        errors.push('缺少必要的 LINE 使用者資訊。');
    }

    if (errors.length > 0) {
        return new Response(JSON.stringify({ error: errors.join(' ') }), {
            status: 400, headers: { 'Content-Type': 'application/json' },
        });
    }
    // --- 【驗證區塊結束】 ---

    const db = context.env.DB;
    
    const preferredproductString = Array.isArray(preferredproduct) ? preferredproduct.join(',') : preferredproduct || '未提供';

    const stmt = db.prepare(
      'UPDATE Users SET real_name = ?, nickname = ?, phone = ?, email = ?, preferred_product = ?, line_display_name = ?, line_picture_url = ? WHERE user_id = ?'
    );
    const result = await stmt.bind(
        realName || '',
        nickname, 
        phone, 
        email || '',
        preferredproductString,
        displayName,
        pictureUrl,
        userId
    ).run();
    
    if (result.meta.changes === 0) {
      return new Response(JSON.stringify({ error: `找不到使用者 ID: ${userId}，無法更新資料。` }), {
        status: 404, headers: { 'Content-Type': 'application/json' },
      });
    }

    const userDataToSync = { userId, realName: realName || '', nickname, phone, email: email || '', preferredproduct: preferredproductString, displayName, pictureUrl };

    return new Response(JSON.stringify({ 
        success: true, 
        message: '成功更新使用者登錄資料！' 
    }), {
      status: 200, headers: { 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error in update-user-profile API:', error);
    const errorResponse = { error: '伺服器內部錯誤，更新資料失敗。', details: error.message };
    return new Response(JSON.stringify(errorResponse), {
      status: 500, headers: { 'Content-Type': 'application/json' },
    });
  }
}