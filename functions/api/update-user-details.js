// functions/api/update-user-details.js
import { GoogleSpreadsheet } from 'google-spreadsheet';
import * as jose from 'jose';


// --- 主要 API 邏輯 ---
export async function onRequest(context) {
  console.log("PUBLIC update-user-details.js HANDLER REACHED", context.request.method);
  try {
    console.log("ADMIN update-user-details.js HANDLER REACHED", context.request.method);
    if (context.request.method !== 'POST') {
      return new Response('Invalid request method.', { status: 405 });
    }

    const body = await context.request.json();
    const { userId, level, current_exp, tag, user_class, perk, notes } = body;

    // --- 【最重要的驗證區塊】 ---
    const errors = [];
    if (!userId || typeof userId !== 'string') errors.push('無效的使用者 ID。');
    
    const levelNum = Number(level);
    if (isNaN(levelNum) || !Number.isInteger(levelNum) || levelNum < 1) {
        errors.push('等級必須是大於 0 的整數。');
    }
    
    const expNum = Number(current_exp);
    if (isNaN(expNum) || !Number.isInteger(expNum) || expNum < 0) {
        errors.push('經驗值必須是非負整數。');
    }
    
    if (tag && (typeof tag !== 'string' || tag.length > 50)) {
        errors.push('標籤長度不可超過 50 字。');
    }
    if (user_class && (typeof user_class !== 'string' || user_class.length > 50)) {
        errors.push('職業名稱長度不可超過 50 字。');
    }
    if (perk && (typeof perk !== 'string' || perk.length > 100)) {
        errors.push('福利內容長度不可超過 100 字。');
    }
    if (notes && (typeof notes !== 'string' || notes.length > 500)) {
        errors.push('備註長度不可超過 500 字。');
    }

    if (errors.length > 0) {
        return new Response(JSON.stringify({ error: errors.join(' ') }), { status: 400 });
    }
    // --- 【驗證區塊結束】 ---

    const db = context.env.DB;

    const stmt = db.prepare('UPDATE Users SET level = ?, current_exp = ?, tag = ?, class = ?, perk = ?, notes = ? WHERE user_id = ?');
    const result = await stmt.bind(levelNum, expNum, tag, user_class, perk, notes || '', userId).run();

    if (result.meta.changes === 0) {
      return new Response(JSON.stringify({ error: `在 D1 中找不到使用者 ID: ${userId}，無法更新資料。` }), {
        status: 404
      });
    }

    const dataToSync = {
        level: levelNum,
        current_exp: expNum,
        tag: tag,
        class: user_class,
        perk: perk,
        notes: notes || ''
    };

    context.waitUntil(
        updateRowInSheet(context.env, '使用者列表', 'user_id', userId, dataToSync)
        .catch(err => console.error(`背景同步 Google Sheet 失敗 (使用者: ${userId}):`, err))
    );

    return new Response(JSON.stringify({ success: true, message: '成功更新使用者資料！' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error in update-user-details API:', error);
    return new Response(JSON.stringify({ error: '更新資料失敗。' }), {
      status: 500,
    });
  }
}