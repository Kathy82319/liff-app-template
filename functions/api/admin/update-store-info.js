// functions/api/admin/update-store-info.js
// --- 【移除】不再需要 Google Sheets 和 jose ---
// import { GoogleSpreadsheet } from 'google-spreadsheet';
// import * as jose from 'jose';

// --- 【移除】Google Sheets 工具函式 ---
// async function getAccessToken(env) { ... }
// async function updateRowInSheet(env, sheetName, matchColumn, matchValue, updateData) { ... }

export async function onRequest(context) {
  try {
    if (context.request.method !== 'POST') { //
      return new Response('Invalid request method.', { status: 405 }); //
    }

    const body = await context.request.json(); //
    const { address, phone, opening_hours, description } = body; //

    // --- (驗證區塊保持不變) ---
    const errors = []; //
    if (!address || typeof address !== 'string' || address.trim().length === 0 || address.length > 200) { errors.push('地址為必填，且長度不可超過 200 字。'); } //
    if (!phone || typeof phone !== 'string' || phone.trim().length === 0 || phone.length > 50) { errors.push('電話為必填，且長度不可超過 50 字。'); } //
    if (!opening_hours || typeof opening_hours !== 'string' || opening_hours.trim().length === 0 || opening_hours.length > 500) { errors.push('營業時間為必填，且長度不可超過 500 字。'); } //
    // 【修改】修正原本複製錯誤的"公會介紹" -> "店家介紹"
    if (!description || typeof description !== 'string' || description.trim().length === 0 || description.length > 2000) { errors.push('店家介紹為必填，且長度不可超過 2000 字。'); } //


    if (errors.length > 0) { //
        return new Response(JSON.stringify({ error: errors.join(' ') }), { status: 400 }); //
    }
    // --- 【驗證區塊結束】 ---

    const db = context.env.DB; //

    const stmt = db.prepare(
      'UPDATE StoreInfo SET address = ?, phone = ?, opening_hours = ?, description = ? WHERE id = 1'
    ); //
    await stmt.bind(address, phone, opening_hours, description).run(); //

    // --- 【移除】Google Sheets 同步 ---
    // const infoDataToSync = { ... };
    // context.waitUntil(updateRowInSheet(...));

    return new Response(JSON.stringify({ success: true, message: '成功更新店家資訊！' }), { //
      status: 200, headers: { 'Content-Type': 'application/json' }, //
    });

  } catch (error) {
    console.error('Error in update-store-info API:', error); //
    // --- 【修改】回傳詳細錯誤 ---
    return new Response(JSON.stringify({ error: '更新店家資訊失敗。', details: error.message }), { status: 500, headers: { 'Content-Type': 'application/json' }}); //
  }
}