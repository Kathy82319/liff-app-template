// functions/api/admin/adjust-stored-value.js

export const onRequest = async (context) => {
    try {
        if (context.request.method !== 'POST') {
            return new Response(JSON.stringify({ error: '無效的請求方法' }), { status: 405 });
        }

        const { userId, amount_to_add, notes } = await context.request.json();
        const db = context.env.DB;

        // --- 1. 後端安全驗證 ---
        if (!userId || typeof userId !== 'string') {
            return new Response(JSON.stringify({ error: '無效的使用者 ID。' }), { status: 400 });
        }
        
        const amount = Number(amount_to_add);
        
        if (isNaN(amount) || !Number.isInteger(amount) || amount === 0) {
            return new Response(JSON.stringify({ error: '變動金額必須是一個非零的整數。' }), { status: 400 });
        }

        // 【新增】單次變動上限檢查 (防止誤操作輸入過大金額)
        if (Math.abs(amount) > 50000) {
            return new Response(JSON.stringify({ error: '單次變動金額不可超過 50,000。' }), { status: 400 });
        }
        
        if (notes && (typeof notes !== 'string' || notes.length > 200)) {
            return new Response(JSON.stringify({ error: '備註長度不可超過 200 字。' }), { status: 400 });
        }

        // --- 2. 核心交易邏輯 (原子化更新) ---
        
        // 【修改】直接執行 UPDATE 並使用 RETURNING 取得最新餘額
        // 這樣可以避免 "Read-Modify-Write" 的 Race Condition
        const updateResult = await db.prepare(`
            UPDATE Users 
            SET stored_value_balance = stored_value_balance + ?1 
            WHERE user_id = ?2
            RETURNING stored_value_balance
        `).bind(amount, userId).first();

        if (!updateResult) {
            return new Response(JSON.stringify({ error: `找不到使用者 ID: ${userId}` }), { status: 404 });
        }

        const new_balance = updateResult.stored_value_balance;
        
        // 決定紀錄類型
        const type = amount > 0 ? 'admin_topup' : 'admin_deduct';

        // 3. 寫入歷史紀錄
        // 注意：這裡無法使用 batch 原子性，因為我們需要先拿到 UPDATE 的結果 (new_balance)
        // 但由於餘額已經原子化更新，即使歷史紀錄寫入失敗，餘額也是正確的 (最壞情況是少一筆 log)
        await db.prepare(
            'INSERT INTO StoredValueHistory (user_id, amount_changed, current_balance, type, notes) VALUES (?, ?, ?, ?, ?)'
        ).bind(userId, amount, new_balance, type, notes || null).run();

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
        // 【修改】隱藏詳細錯誤細節，只回傳通用訊息
        return new Response(JSON.stringify({ 
            error: '更新儲值金失敗，請稍後再試。' 
        }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' },
        });
    }
};