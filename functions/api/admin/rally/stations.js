// functions/api/admin/rally/stations.js

import { customAlphabet } from 'nanoid';

// 輔助函式：產生一個 10 位數的唯一代碼 (包含數字與大寫字母)
const generatePartnerCode = customAlphabet('0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ', 10);

export async function onRequest(context) {
    const { request, env } = context;
    const db = env.DB;

    // 準備標準的 JSON 回應標頭
    const jsonHeaders = {
        'Content-Type': 'application/json'
    };

    try {
        const method = request.method;
        const url = new URL(request.url);
        const campaign_id_filter = url.searchParams.get('campaignId');

        // --- GET: 獲取站點列表 (可根據活動 ID 篩選) ---
        if (method === 'GET') {
            const params = [];
            let query = "SELECT s.*, c.title AS campaign_title FROM RallyStations s JOIN RallyCampaigns c ON s.campaign_id = c.campaign_id";
            
            if (campaign_id_filter) {
                query += " WHERE s.campaign_id = ?1";
                params.push(campaign_id_filter);
            }
            query += " ORDER BY s.station_id DESC";

            const { results } = await db.prepare(query).bind(...params).all();
            
            return new Response(JSON.stringify(results || []), { 
                status: 200, 
                headers: jsonHeaders 
            });
        }

        // --- POST/PUT/DELETE 通用資料處理 ---
        const body = await request.json();
        
        // --- POST: 建立新站點 ---
        if (method === 'POST') {
            const {
                campaign_id, name, description, 
                unique_partner_code, partner_name, partner_validation_info, 
                expiry_date, is_active
            } = body;

            const errors = [];
            if (!campaign_id || !Number.isInteger(Number(campaign_id)) || Number(campaign_id) < 1) errors.push('活動 ID 為必填的有效 ID。');
            if (!name || name.trim().length === 0) errors.push('站點名稱為必填。');
            
            if (errors.length > 0) {
                return new Response(JSON.stringify({ error: errors.join(' ') }), { status: 400, headers: jsonHeaders });
            }

            const final_code = (unique_partner_code && unique_partner_code.trim()) || generatePartnerCode();

            // 檢查代碼唯一性
            const codeCheck = await db.prepare("SELECT 1 FROM RallyStations WHERE unique_partner_code = ?").bind(final_code).first();
            if (codeCheck) {
                 return new Response(JSON.stringify({ error: `夥伴代碼 "${final_code}" 已存在，請更換或重新嘗試。` }), { status: 409, headers: jsonHeaders });
            }

            const stmt = db.prepare(`
                INSERT INTO RallyStations (campaign_id, name, description, unique_partner_code, partner_name, partner_validation_info, expiry_date, is_active) 
                VALUES (?, ?, ?, ?, ?, ?, ?, ?) RETURNING *
            `);
            const result = await stmt.bind(
                Number(campaign_id), name.trim(), description || null, final_code, 
                partner_name || null, partner_validation_info || null, expiry_date || null, is_active ? 1 : 0
            ).first();
            
            return new Response(JSON.stringify({ success: true, station: result }), { status: 201, headers: jsonHeaders });
        }

        // --- PUT: 更新站點 ---
        if (method === 'PUT') {
            const {
                station_id, campaign_id, name, description, 
                unique_partner_code, partner_name, partner_validation_info, 
                expiry_date, is_active
            } = body;

            if (!station_id) return new Response(JSON.stringify({ error: '缺少 station_id。' }), { status: 400, headers: jsonHeaders });
            
            const final_code = unique_partner_code ? unique_partner_code.trim() : null;

            // 檢查代碼唯一性 (排除自己)
            if (final_code) {
                 const codeCheck = await db.prepare("SELECT station_id FROM RallyStations WHERE unique_partner_code = ? AND station_id != ?").bind(final_code, station_id).first();
                 if (codeCheck) {
                     return new Response(JSON.stringify({ error: `夥伴代碼 "${final_code}" 已被其他站點使用。` }), { status: 409, headers: jsonHeaders });
                 }
            }

            const stmt = db.prepare(`
                UPDATE RallyStations SET 
                    campaign_id = ?, name = ?, description = ?, unique_partner_code = ?, 
                    partner_name = ?, partner_validation_info = ?, expiry_date = ?, is_active = ?
                WHERE station_id = ?
            `);
            await stmt.bind(
                Number(campaign_id), name.trim(), description || null, final_code || null, 
                partner_name || null, partner_validation_info || null, expiry_date || null, is_active ? 1 : 0, Number(station_id)
            ).run();
            
            return new Response(JSON.stringify({ success: true, message: '站點更新成功' }), { status: 200, headers: jsonHeaders });
        }

        // --- DELETE: 刪除站點 (修改版：加入防呆檢查) ---
        if (method === 'DELETE') {
            const { station_id: delete_id, force } = body;
            if (!delete_id) return new Response(JSON.stringify({ error: '缺少 station_id' }), { status: 400, headers: jsonHeaders });

            // 1. 檢查受影響的紀錄數量
            const countResult = await db.prepare("SELECT COUNT(*) as count FROM UserRallyProgress WHERE station_id = ?").bind(delete_id).first();
            const affectedCount = countResult?.count || 0;

            // 2. 如果有影響且未強制刪除，回傳 409 Conflict
            if (affectedCount > 0 && !force) {
                return new Response(JSON.stringify({ 
                    error: 'affected_users', // 特殊錯誤碼供前端判斷
                    message: `刪除此站點將會影響 ${affectedCount} 筆使用者的集點紀錄。`,
                    affectedCount: affectedCount
                }), { status: 409, headers: jsonHeaders });
            }

            // 3. 執行刪除 (級聯刪除：先刪除進度，再刪除站點)
            const operations = [
                db.prepare("DELETE FROM UserRallyProgress WHERE station_id = ?").bind(delete_id),
                db.prepare("DELETE FROM RallyStations WHERE station_id = ?").bind(delete_id)
            ];
            await db.batch(operations);
            
            return new Response(JSON.stringify({ success: true, message: '站點與所有相關進度資料已刪除' }), { status: 200, headers: jsonHeaders });
        }

        return new Response(JSON.stringify({ error: '無效的請求方法' }), { status: 405, headers: jsonHeaders });

    } catch (error) {
        console.error('Error in rally/stations API:', error);
        return new Response(JSON.stringify({ error: '處理集點站點失敗', details: error.message }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' },
        });
    }
}