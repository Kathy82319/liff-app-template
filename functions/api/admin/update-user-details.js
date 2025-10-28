// functions/api/admin/update-user-details.js
// --- 【移除】不再需要 Google Sheets 和 jose ---
// import { GoogleSpreadsheet } from 'google-spreadsheet';
// import * as jose from 'jose';

// --- 【移除】Google Sheets 工具函式 ---
// async function getAccessToken(env) { ... }
// async function updateRowInSheet(env, sheetName, matchColumn, matchValue, updateData) { ... }

// --- 主要 API 邏輯 ---
export async function onRequest(context) {
  try {
    console.log("ADMIN update-user-details.js HANDLER REACHED", context.request.method); //
    if (context.request.method !== 'POST') { //
      return new Response('Invalid request method.', { status: 405 }); //
    }

    const body = await context.request.json(); //
    // ---【修改】從 body 解構時，使用 user_class 接收前端傳來的 class ---
    const { userId, level, current_exp, tag, user_class, perk, notes } = body; //

    // --- (驗證區塊保持不變) ---
    const errors = []; //
    if (!userId || typeof userId !== 'string') errors.push('無效的使用者 ID。'); //
    const levelNum = Number(level); //
    if (isNaN(levelNum) || !Number.isInteger(levelNum) || levelNum < 1) { //
        errors.push('等級必須是大於 0 的整數。'); //
    }
    const expNum = Number(current_exp); //
    if (isNaN(expNum) || !Number.isInteger(expNum) || expNum < 0) { //
        errors.push('經驗值必須是非負整數。'); //
    }
    if (tag && (typeof tag !== 'string' || tag.length > 50)) { //
        errors.push('標籤長度不可超過 50 字。'); //
    }
    // ---【修改】驗證 user_class ---
    if (user_class && (typeof user_class !== 'string' || user_class.length > 50)) { //
        errors.push('會員方案名稱長度不可超過 50 字。'); //
    }
    if (perk && (typeof perk !== 'string' || perk.length > 100)) { //
        errors.push('方案優惠內容長度不可超過 100 字。'); //
    }
    if (notes && (typeof notes !== 'string' || notes.length > 500)) { //
        errors.push('備註長度不可超過 500 字。'); //
    }

    if (errors.length > 0) { //
        return new Response(JSON.stringify({ error: errors.join(' ') }), { status: 400 }); //
    }
    // --- 【驗證區塊結束】 ---

    const db = context.env.DB; //

    // ---【修改】SQL 語句中的 class 對應到 user_class 變數 ---
    const stmt = db.prepare('UPDATE Users SET level = ?, current_exp = ?, tag = ?, class = ?, perk = ?, notes = ? WHERE user_id = ?'); //
    const result = await stmt.bind(levelNum, expNum, tag, user_class, perk, notes || '', userId).run(); //

    if (result.meta.changes === 0) { //
      return new Response(JSON.stringify({ error: `在 D1 中找不到使用者 ID: ${userId}，無法更新資料。` }), { //
        status: 404
      });
    }


    return new Response(JSON.stringify({ success: true, message: '成功更新使用者資料！' }), { //
      status: 200,
      headers: { 'Content-Type': 'application/json' }, //
    });

  } catch (error) {
    console.error('Error in update-user-details API:', error); //
    // --- 【修改】回傳更詳細的錯誤訊息 ---
    return new Response(JSON.stringify({ error: '更新資料失敗。', details: error.message }), { //
      status: 500,
      headers: { 'Content-Type': 'application/json' } // 確保錯誤也是 JSON
    });
  }
}