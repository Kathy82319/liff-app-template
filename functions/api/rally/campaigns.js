// functions/api/admin/rally/campaigns.js

export async function onRequest(context) {
    const { request, env } = context;
    const db = env.DB;

    try {
        const method = request.method;

        // --- GET: 獲取所有活動 ---
        if (method === 'GET') {
            const { results } = await db.prepare("SELECT * FROM RallyCampaigns ORDER BY campaign_id DESC").all();
            return new Response(JSON.stringify(results || []), { status: 200 });
        }

        // --- POST/PUT 通用資料處理與驗證 ---
        const body = await request.json();
        const {
            campaign_id, title, description, required_stamps, 
            reward_voucher_id, start_date, end_date, is_active
        } = body;

        const errors = [];
        if (!title || title.trim().length === 0) errors.push('活動標題為必填。');
        if (!required_stamps || !Number.isInteger(Number(required_stamps)) || Number(required_stamps) < 1) errors.push('集點完成數量必須是大於 0 的整數。');
        if (!reward_voucher_id || !Number.isInteger(Number(reward_voucher_id)) || Number(reward_voucher_id) < 1) errors.push('獎勵優惠券 ID 為必填的有效 ID。');
        if (start_date && !/^\d{4}-\d{2}-\d{2}$/.test(start_date)) errors.push('開始日期格式不正確 (YYYY-MM-DD)。');
        if (end_date && !/^\d{4}-\d{2}-\d{2}$/.test(end_date)) errors.push('結束日期格式不正確 (YYYY-MM-DD)。');
        if (start_date && end_date && new Date(start_date) > new Date(end_date)) errors.push('活動結束日期不能早於開始日期。');
        
        if (errors.length > 0) {
            return new Response(JSON.stringify({ error: errors.join(' ') }), { status: 400 });
        }
        
        // --- POST: 建立新活動 ---
        if (method === 'POST') {
            const stmt = db.prepare(`
                INSERT INTO RallyCampaigns (title, description, required_stamps, reward_voucher_id, start_date, end_date, is_active) 
                VALUES (?, ?, ?, ?, ?, ?, ?) RETURNING *
            `);
            const result = await stmt.bind(
                title.trim(), description || null, Number(required_stamps), Number(reward_voucher_id), 
                start_date || null, end_date || null, is_active ? 1 : 0
            ).first();
            return new Response(JSON.stringify({ success: true, campaign: result }), { status: 201 });
        }

        // --- PUT: 更新活動 ---
        if (method === 'PUT') {
            if (!campaign_id) errors.push('缺少 campaign_id。');
            if (errors.length > 0) {
                 return new Response(JSON.stringify({ error: errors.join(' ') }), { status: 400 });
            }

            const stmt = db.prepare(`
                UPDATE RallyCampaigns SET 
                    title = ?, description = ?, required_stamps = ?, reward_voucher_id = ?, 
                    start_date = ?, end_date = ?, is_active = ? 
                WHERE campaign_id = ?
            `);
            await stmt.bind(
                title.trim(), description || null, Number(required_stamps), Number(reward_voucher_id), 
                start_date || null, end_date || null, is_active ? 1 : 0, Number(campaign_id)
            ).run();
            
            return new Response(JSON.stringify({ success: true, message: '活動更新成功' }), { status: 200 });
        }

        // --- DELETE: 刪除活動 ---
        if (method === 'DELETE') {
            const { campaign_id: delete_id } = body;
            if (!delete_id) return new Response(JSON.stringify({ error: '缺少 campaign_id' }), { status: 400 });

            // 實作級聯刪除：先刪除進度，再刪除站點，最後刪除活動主檔
            const operations = [
                db.prepare("DELETE FROM UserRallyProgress WHERE campaign_id = ?").bind(delete_id),
                db.prepare("DELETE FROM RallyStations WHERE campaign_id = ?").bind(delete_id),
                db.prepare("DELETE FROM RallyCampaigns WHERE campaign_id = ?").bind(delete_id)
            ];
            await db.batch(operations);
            
            return new Response(JSON.stringify({ success: true, message: '活動與所有相關資料已刪除' }), { status: 200 });
        }


        return new Response(JSON.stringify({ error: '無效的請求方法' }), { status: 405 });

    } catch (error) {
        console.error('Error in rally/campaigns API:', error);
        return new Response(JSON.stringify({ error: '處理集點活動失敗', details: error.message }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' },
        });
    }
}