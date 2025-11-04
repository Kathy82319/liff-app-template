// functions/api/admin/issue-voucher.js
export async function onRequest(context) {
    const { request, env } = context;
    const db = env.DB;

    try {
        if (request.method !== 'POST') {
            return new Response(JSON.stringify({ error: '無效的請求方法' }), { status: 405 });
        }

        const { userId, templateId } = await request.json();

        if (!userId || !templateId) {
            return new Response(JSON.stringify({ error: '缺少使用者 ID 或樣板 ID' }), { status: 400 });
        }

        // 1. 獲取樣板規則
        const template = await db.prepare("SELECT * FROM VoucherTemplates WHERE template_id = ? AND is_active = 1")
                               .bind(templateId)
                               .first();
        
        if (!template) {
            return new Response(JSON.stringify({ error: '優惠券樣板不存在或已停用' }), { status: 404 });
        }

        // 2. 檢查「發行總量」 (total_supply)
        if (template.total_supply !== null && template.total_supply > 0) {
            const countResult = await db.prepare("SELECT COUNT(voucher_id) as count FROM UserVouchers WHERE template_id = ?")
                                        .bind(templateId)
                                        .first();
            const issuedCount = countResult?.count || 0;
            if (issuedCount >= template.total_supply) {
                return new Response(JSON.stringify({ error: `發送失敗：此優惠券已達總發行上限 (${template.total_supply} 張)` }), { status: 409 }); // 409 Conflict
            }
        }

        // 3. 檢查「每人限領」 (limit_per_user)
        if (template.limit_per_user !== null && template.limit_per_user > 0) {
            const userCountResult = await db.prepare("SELECT COUNT(voucher_id) as count FROM UserVouchers WHERE template_id = ? AND user_id = ?")
                                             .bind(templateId, userId)
                                             .first();
            const userIssuedCount = userCountResult?.count || 0;
            if (userIssuedCount >= template.limit_per_user) {
                return new Response(JSON.stringify({ error: `發送失敗：該使用者已達此券的領取上限 (${template.limit_per_user} 張)` }), { status: 409 });
            }
        }

        // 4. 所有檢查通過，執行發送 (寫入 UserVouchers)
        await db.prepare("INSERT INTO UserVouchers (template_id, user_id) VALUES (?, ?)")
              .bind(templateId, userId)
              .run();

        return new Response(JSON.stringify({ success: true, message: '優惠券已成功發送' }), { 
            status: 201,
            headers: { 'Content-Type': 'application/json' }
        });

    } catch (error) {
        console.error('Issue Voucher API Error:', error);
        return new Response(JSON.stringify({ error: '發送優惠券時發生錯誤', details: error.message }), { 
            status: 500,
            headers: { 'Content-Type': 'application/json' }
        });
    }
}