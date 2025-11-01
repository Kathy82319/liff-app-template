// functions/api/admin/update-user-details.js
// 【v2.0 - 允許 LIFF 更新 phone 和 notes】

export async function onRequest(context) {
  try {
    console.log("ADMIN update-user-details.js HANDLER REACHED", context.request.method);
    if (context.request.method !== 'POST') {
      return new Response('Invalid request method.', { status: 405 });
    }

    const body = await context.request.json();
    
    // 【修改】讀取 phone，並允許 level, exp, tag 等為 undefined
    const { userId, level, current_exp, tag, user_class, perk, notes, phone } = body;

    const errors = [];
    if (!userId || typeof userId !== 'string') errors.push('無效的使用者 ID。');

    // --- 檢查非 LIFF 傳來的欄位 ---
    let levelNum = null, expNum = null;
    if (level !== undefined) {
        levelNum = Number(level);
        if (isNaN(levelNum) || !Number.isInteger(levelNum) || levelNum < 1) {
            errors.push('等級必須是大於 0 的整數。');
        }
    }
    if (current_exp !== undefined) {
        expNum = Number(current_exp);
        if (isNaN(expNum) || !Number.isInteger(expNum) || expNum < 0) {
            errors.push('經驗值必須是非負整數。');
        }
    }
    if (tag && (typeof tag !== 'string' || tag.length > 50)) {
        errors.push('標籤長度不可超過 50 字。');
    }
    if (user_class && (typeof user_class !== 'string' || user_class.length > 50)) {
        errors.push('會員方案名稱長度不可超過 50 字。');
    }
    if (perk && (typeof perk !== 'string' || perk.length > 100)) {
        errors.push('方案優惠內容長度不可超過 100 字。');
    }

    // --- 【新增】檢查 LIFF 傳來的欄位 ---
    if (notes && (typeof notes !== 'string' || notes.length > 500)) {
        errors.push('備註長度不可超過 500 字。');
    }
    // 允許 phone 為空字串或 null，但不允許格式錯誤
    if (phone && (typeof phone !== 'string' || !/^\d{10}$/.test(phone))) {
         errors.push('請輸入有效的 10 碼手機號碼，或留空。');
    }
    // --- 驗證結束 ---

    if (errors.length > 0) {
        return new Response(JSON.stringify({ error: errors.join(' ') }), { status: 400 });
    }

    const db = context.env.DB;
    
    // 【修改】動態產生 SQL，只更新有提供的欄位
    const user = await db.prepare('SELECT * FROM Users WHERE user_id = ?').bind(userId).first();
    if (!user) {
        return new Response(JSON.stringify({ error: `在 D1 中找不到使用者 ID: ${userId}，無法更新資料。` }), {
            status: 404
        });
    }

    // 以資料庫的值為基底
    const dataToUpdate = {
        level: levelNum !== null ? levelNum : user.level,
        current_exp: expNum !== null ? expNum : user.current_exp,
        tag: tag !== undefined ? tag : user.tag,
        class: user_class !== undefined ? user_class : user.class,
        perk: perk !== undefined ? perk : user.perk,
        notes: notes !== undefined ? (notes || '') : user.notes, // 允許清空
        phone: phone !== undefined ? (phone || '') : user.phone // 允許清空
    };
    
    // 【修改】使用新的 dataToUpdate 物件
    const stmt = db.prepare(
      'UPDATE Users SET level = ?, current_exp = ?, tag = ?, class = ?, perk = ?, notes = ?, phone = ? WHERE user_id = ?'
    );
    const result = await stmt.bind(
        dataToUpdate.level,
        dataToUpdate.current_exp,
        dataToUpdate.tag,
        dataToUpdate.class,
        dataToUpdate.perk,
        dataToUpdate.notes,
        dataToUpdate.phone,
        userId
    ).run();

    return new Response(JSON.stringify({ 
        success: true, 
        message: '成功更新使用者資料！',
        updatedUser: { ...user, ...dataToUpdate } // 回傳更新後的資料
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error in update-user-details API:', error);
    return new Response(JSON.stringify({ error: '更新資料失敗。', details: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' } 
    });
  }
}