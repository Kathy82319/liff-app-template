// functions/api/claim-voucher.js
export async function onRequest(context) {
    const { request, env } = context;
    const db = env.DB;

    try {
        if (request.method !== 'POST') {
            return new Response(JSON.stringify({ error: '無效的請求方法' }), { status: 405 });
        }

        const { userId, public_claim_code } = await request.json();

        if (!userId || !public_claim_code) {
            return new Response(JSON.stringify({ error: '缺少使用者 ID 或領取代碼' }), { status: 400 });
        }

        // 1. 根據代碼查找有效樣板
        const template = await db.prepare(
            `SELECT * FROM VoucherTemplates 
             WHERE public_claim_code = ? AND is_active = 1 AND is_public = 1`
        ).bind(public_claim_code).first();
        
        if (!template) {
            return new Response(JSON.stringify({ error: '優惠券代碼無效、不存在或已停用' }), { status: 404 });
        }

        const templateId = template.template_id;

        // 2. 檢查「發行總量」 (total_supply)
        if (template.total_supply !== null && template.total_supply > 0) {
            const countResult = await db.prepare("SELECT COUNT(voucher_id) as count FROM UserVouchers WHERE template_id = ?")
                                        .bind(templateId)
                                        .first();
            const issuedCount = countResult?.count || 0;
            if (issuedCount >= template.total_supply) {
                return new Response(JSON.stringify({ error: `領取失敗：此優惠券已被領取完畢` }), { status: 409 });
            }
        }

        // 3. 檢查「每人限領」 (limit_per_user)
        if (template.limit_per_user !== null && template.limit_per_user > 0) {
            const userCountResult = await db.prepare("SELECT COUNT(voucher_id) as count FROM UserVouchers WHERE template_id = ? AND user_id = ?")
                                             .bind(templateId, userId)
                                             .first();
            const userIssuedCount = userCountResult?.count || 0;
            if (userIssuedCount >= template.limit_per_user) {
                return new Response(JSON.stringify({ error: `領取失敗：您已達此券的領取上限 (${template.limit_per_user} 張)` }), { status: 409 });
            }
        }

        // 4. 所有檢查通過，執行發送 (寫入 UserVouchers)
        await db.prepare("INSERT INTO UserVouchers (template_id, user_id) VALUES (?, ?)")
              .bind(templateId, userId)
              .run();

        return new Response(JSON.stringify({ success: true, message: `成功領取 ${template.title}` }), { 
            status: 201,
            headers: { 'Content-Type': 'application/json' }
        });

    } catch (error) {
        console.error('Claim Voucher API Error:', error);
        return new Response(JSON.stringify({ error: '領取優惠券時發生錯誤', details: error.message }), { 
            status: 500,
            headers: { 'Content-Type': 'application/json' }
        });
    }
}