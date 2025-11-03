// functions/api/admin/adjust-stored-value.js

// 【修正】改用 'export const' 語法
export const onRequest = async (context) => {
    try {
        if (context.request.method !== 'POST') {
            return new Response(JSON.stringify({ error: '無效的請求方法' }), { status: 405 });
        }

        const { userId, amount_to_add, notes } = await context.request.json();
        const db = context.env.DB;

        // --- 後端安全驗證 ---
        if (!userId || typeof userId !== 'string') {
            return new Response(JSON.stringify({ error: '無效的使用者 ID。' }), { status: 400 });
        }
        
        const amount = Number(amount_to_add);
        
        if (isNaN(amount) || !Number.isInteger(amount) || amount === 0) {
            // (確保這行是單行)
            return new Response(JSON.stringify({ error: '變動金額必須是一個非零的整數。' }), { status: 400 });
        }
        
        if (notes && (typeof notes !== 'string' || notes.length > 200)) {
            return new Response(JSON.stringify({ error: '備註長度不可超過 200 字。' }), { status: 400 });
        }

        // --- 核心交易邏輯 ---
        
        // 1. 獲取當前餘額
        const user = await db.prepare('SELECT stored_value_balance FROM Users WHERE user_id = ?')
                           .bind(userId)
                           .first();
        
        if (!user) {
            return new Response(JSON.stringify({ error: `找不到使用者 ID: ${userId}` }), { status: 404 });
        }

        const current_balance = Number(user.stored_value_balance) || 0;
        const new_balance = current_balance + amount;
        
        // 決定紀錄類型
        const type = amount > 0 ? 'admin_topup' : 'admin_deduct';

        // 2. 使用 batch 確保交易原子性 (同時更新餘額並寫入歷史)
        const operations = [
            // 更新 Users 表的餘額
            db.prepare('UPDATE Users SET stored_value_balance = ? WHERE user_id = ?')
              .bind(new_balance, userId),
              
            // 在 StoredValueHistory 新增一筆紀錄
            db.prepare(
                'INSERT INTO StoredValueHistory (user_id, amount_changed, current_balance, type, notes) VALUES (?, ?, ?, ?, ?)'
            ).bind(userId, amount, new_balance, type, notes || null)
        ];

        await db.batch(operations);

        return new Response(JSON.stringify({ 
            success: true, 
            message: `成功更新餘額。`,
            newBalance: new_balance 
        }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
        });

    } catch (error) {
        console.error('Error in adjust-stored-value API:', error);
        return new Response(JSON.stringify({ 
            error: '更新儲值金失敗。', 
            details: error.message 
        }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' },
        });
    }
};