// functions/api/admin/rally-campaigns.js (使用方法導向的 Exports)

// Helper function to handle validation and cleanup
async function validateCampaignData(body) {
    const {
        campaign_id, title, description, required_stamps, 
        reward_voucher_id, start_date, end_date, is_active
    } = body;

    const errors = [];
    if (!title || title.trim().length === 0) errors.push('活動標題為必填。');
    if (!required_stamps || !Number.isInteger(Number(required_stamps)) || Number(required_stamps) < 1) errors.push('集點完成數量必須是大於 0 的整數。');
    if (!reward_voucher_id || !Number.isInteger(Number(reward_voucher_id)) || Number(reward_voucher_id) < 1) errors.push('獎勵優惠券 Template ID 為必填的有效 ID。');
    if (start_date && !/^\d{4}-\d{2}-\d{2}$/.test(start_date)) errors.push('開始日期格式不正確 (YYYY-MM-DD)。');
    if (end_date && !/^\d{4}-\d{2}-\d{2}$/.test(end_date)) errors.push('結束日期格式不正確 (YYYY-MM-DD)。');
    if (start_date && end_date && new Date(start_date) > new Date(end_date)) errors.push('活動結束日期不能早於開始日期。');
    
    if (errors.length > 0) {
        return { valid: false, errors: errors };
    }

    const data = {
        campaign_id: campaign_id ? Number(campaign_id) : null,
        title: title.trim(),
        description: description || null,
        required_stamps: Number(required_stamps),
        reward_voucher_id: Number(reward_voucher_id),
        start_date: start_date || null,
        end_date: end_date || null,
        is_active: is_active ? 1 : 0
    };
    
    return { valid: true, data: data };
}

// --- GET: 獲取所有活動 (取代原本的 onRequest 裡的 GET 邏輯) ---
export async function onRequestGet({ env }) {
    try {
        const db = env.DB;
        const { results } = await db.prepare("SELECT * FROM RallyCampaigns ORDER BY campaign_id DESC").all();
        return new Response(JSON.stringify(results || []), { status: 200, headers: { 'Content-Type': 'application/json' } });
    } catch (error) {
        return new Response(JSON.stringify({ error: '獲取集點活動列表失敗', details: error.message }), { status: 500, headers: { 'Content-Type': 'application/json' } });
    }
}

// --- POST: 建立新活動 (取代原本的 onRequest 裡的 POST 邏輯) ---
export async function onRequestPost({ request, env }) {
    const db = env.DB;
    try {
        const body = await request.json();
        const validation = await validateCampaignData(body);
        if (!validation.valid) {
            return new Response(JSON.stringify({ error: validation.errors.join(' ') }), { status: 400, headers: { 'Content-Type': 'application/json' } });
        }
        const data = validation.data;

        const stmt = db.prepare(`
            INSERT INTO RallyCampaigns (title, description, required_stamps, reward_voucher_id, start_date, end_date, is_active) 
            VALUES (?, ?, ?, ?, ?, ?, ?) RETURNING *
        `);
        const result = await stmt.bind(
            data.title, data.description, data.required_stamps, data.reward_voucher_id, 
            data.start_date, data.end_date, data.is_active
        ).first();
        
        return new Response(JSON.stringify({ success: true, campaign: result }), { status: 201, headers: { 'Content-Type': 'application/json' } });

    } catch (error) {
        return new Response(JSON.stringify({ error: '建立集點活動失敗', details: error.message }), { status: 500, headers: { 'Content-Type': 'application/json' } });
    }
}

// --- PUT: 更新活動 ---
export async function onRequestPut({ request, env }) {
    const db = env.DB;
    try {
        const body = await request.json();
        const validation = await validateCampaignData(body);
        if (!validation.valid) {
            return new Response(JSON.stringify({ error: validation.errors.join(' ') }), { status: 400, headers: { 'Content-Type': 'application/json' } });
        }
        const data = validation.data;
        if (!data.campaign_id) {
            return new Response(JSON.stringify({ error: '缺少 campaign_id。' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
        }

        const stmt = db.prepare(`
            UPDATE RallyCampaigns SET 
                title = ?, description = ?, required_stamps = ?, reward_voucher_id = ?, 
                start_date = ?, end_date = ?, is_active = ? 
            WHERE campaign_id = ?
        `);
        await stmt.bind(
            data.title, data.description, data.required_stamps, data.reward_voucher_id, 
            data.start_date, data.end_date, data.is_active, data.campaign_id
        ).run();
        
        return new Response(JSON.stringify({ success: true, message: '活動更新成功' }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    } catch (error) {
        return new Response(JSON.stringify({ error: '更新集點活動失敗', details: error.message }), { status: 500, headers: { 'Content-Type': 'application/json' } });
    }
}

// --- DELETE: 刪除活動 ---
export async function onRequestDelete({ request, env }) {
    const db = env.DB;
    try {
        const body = await request.json();
        const delete_id = body.campaign_id;
        if (!delete_id) {
            return new Response(JSON.stringify({ error: '缺少 campaign_id' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
        }

        const operations = [
            db.prepare("DELETE FROM UserRallyProgress WHERE campaign_id = ?").bind(delete_id),
            db.prepare("DELETE FROM RallyStations WHERE campaign_id = ?").bind(delete_id),
            db.prepare("DELETE FROM RallyCampaigns WHERE campaign_id = ?").bind(delete_id)
        ];
        await db.batch(operations);
        
        return new Response(JSON.stringify({ success: true, message: '活動與所有相關資料已刪除' }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    } catch (error) {
        return new Response(JSON.stringify({ error: '刪除集點活動失敗', details: error.message }), { status: 500, headers: { 'Content-Type': 'application/json' } });
    }
}

// functions/api/admin/rally-campaigns.js.js (末尾追加)

// --- 新增：通用 onRequest 處理，用於手動分派 (修復 405 錯誤) ---
export const onRequest = async (context) => {
    const { request } = context;
    switch (request.method) {
        case 'GET':
            if (typeof onRequestGet === 'function') {
                return onRequestGet(context);
            }
            break;
        case 'POST':
            if (typeof onRequestPost === 'function') {
                return onRequestPost(context);
            }
            break;
        case 'PUT':
            if (typeof onRequestPut === 'function') {
                return onRequestPut(context);
            }
            break;
        case 'DELETE':
            if (typeof onRequestDelete === 'function') {
                return onRequestDelete(context);
            }
            break;
        default:
            return new Response('Method Not Allowed', { status: 405 });
    }
    // 如果找到了 method handler 但執行到這裡，表示該 handler 自身沒有返回 Response
    return new Response('Internal Server Error: Handler did not return response', { status: 500 });
};