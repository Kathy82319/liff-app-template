// functions/api/admin/update-store-info.js
export async function onRequest(context) {
  try {
    if (context.request.method !== 'POST') {
      return new Response('Invalid request method.', { status: 405 });
    }

    const body = await context.request.json();
    const { store_name, address, phone, opening_hours, description, cancellationPolicy, checkInInstructions } = body;

    // --- 驗證 ---
    const errors = [];
    if (!address) errors.push('地址為必填。');
    if (!phone) errors.push('電話為必填。');
    // 政策欄位是選填的，但如果有傳，我們就更新

    if (errors.length > 0) {
        return new Response(JSON.stringify({ error: errors.join(' ') }), { status: 400 });
    }

    const db = context.env.DB;
    const operations = [];

    // 1. 更新 StoreInfo
    operations.push(
        db.prepare('UPDATE StoreInfo SET store_name = ?, address = ?, phone = ?, opening_hours = ?, description = ? WHERE id = 1')
          .bind(store_name || null, address, phone, opening_hours, description)
    );

    // 2. 更新 MessageDrafts (ID 1) - 如果有傳入政策欄位
    if (cancellationPolicy !== undefined || checkInInstructions !== undefined) {
        const policyContent = JSON.stringify({
            cancellationPolicy: cancellationPolicy || '',
            checkInInstructions: checkInInstructions || ''
        });
        
        // 使用 Upsert (如果不存在則插入，存在則更新)
        operations.push(
            db.prepare(`
                INSERT INTO MessageDrafts (draft_id, title, content) VALUES (1, '入住須知編輯欄', ?)
                ON CONFLICT(draft_id) DO UPDATE SET content=excluded.content
            `).bind(policyContent)
        );
    }

    await db.batch(operations);

    return new Response(JSON.stringify({ success: true, message: '店家資訊與政策更新成功！' }), {
      status: 200, headers: { 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error in update-store-info API:', error);
    return new Response(JSON.stringify({ error: '更新失敗。', details: error.message }), { status: 500, headers: { 'Content-Type': 'application/json' }});
  }
}