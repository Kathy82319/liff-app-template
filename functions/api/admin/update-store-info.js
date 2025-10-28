// functions/api/admin/update-store-info.js

export async function onRequest(context) {
  try {
    if (context.request.method !== 'POST') {
      return new Response('Invalid request method.', { status: 405 });
    }

    const body = await context.request.json();
    const { address, phone, opening_hours, description } = body;

    // --- 【新增的驗證區塊】 ---
    const errors = [];
    if (!address || typeof address !== 'string' || address.trim().length === 0 || address.length > 200) {
        errors.push('地址為必填，且長度不可超過 200 字。');
    }
    if (!phone || typeof phone !== 'string' || phone.trim().length === 0 || phone.length > 50) {
        errors.push('電話為必填，且長度不可超過 50 字。');
    }
    if (!opening_hours || typeof opening_hours !== 'string' || opening_hours.trim().length === 0 || opening_hours.length > 500) {
        errors.push('營業時間為必填，且長度不可超過 500 字。');
    }
    if (!description || typeof description !== 'string' || description.trim().length === 0 || description.length > 2000) {
        errors.push('公會介紹為必填，且長度不可超過 2000 字。');
    }

    if (errors.length > 0) {
        return new Response(JSON.stringify({ error: errors.join(' ') }), { status: 400 });
    }
    // --- 【驗證區塊結束】 ---

    const db = context.env.DB;
    
    const stmt = db.prepare(
      'UPDATE StoreInfo SET address = ?, phone = ?, opening_hours = ?, description = ? WHERE id = 1'
    );
    await stmt.bind(address, phone, opening_hours, description).run();

    const infoDataToSync = { address, phone, opening_hours, description };
    context.waitUntil(
        updateRowInSheet(context.env, context.env.STORE_INFO_SHEET_NAME, 'id', 1, infoDataToSync)
        .catch(err => console.error("背景同步更新店家資訊失敗:", err))
    );

    return new Response(JSON.stringify({ success: true, message: '成功更新店家資訊！' }), {
      status: 200, headers: { 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error in update-store-info API:', error);
    return new Response(JSON.stringify({ error: '更新店家資訊失敗。' }), { status: 500 });
  }
}