// functions/api/admin/voucher-templates.js
import { customAlphabet } from 'nanoid';

// 輔助函式：產生一個 8 位數的隨機代碼 (用於公開領取碼)
const generateClaimCode = customAlphabet('0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ', 8);

// 輔助函式：清理並驗證傳入的樣板資料
function validateTemplateData(body) {
    const data = {
        internal_name: body.internal_name?.trim() || '未命名樣板',
        title: body.title?.trim() || '',
        type: body.type,
        value: (body.type === 'discount_fixed' || body.type === 'discount_percentage') ? (Number(body.value) || null) : null,
        redeem_item_name: (body.type === 'redeem_item') ? (body.redeem_item_name?.trim() || null) : null,
        min_spend: Number(body.min_spend) || 0,
        valid_from: body.valid_from || null,
        valid_to: body.valid_to || null,
        applicable_product_ids: JSON.stringify(body.applicable_product_ids || []),
        applicable_days_of_week: JSON.stringify(body.applicable_days_of_week || []),
        total_supply: body.total_supply ? Number(body.total_supply) : null,
        limit_per_user: body.limit_per_user ? Number(body.limit_per_user) : 1,
        is_public: body.is_public ? 1 : 0,
        is_active: body.is_active ? 1 : 0,
        public_claim_code: body.is_public ? (body.public_claim_code?.trim() || generateClaimCode()) : null
    };

    if (!data.title) throw new Error('「優惠券標題」為必填。');
    if (!data.type || !['discount_fixed', 'discount_percentage', 'redeem_item'].includes(data.type)) throw new Error('無效的「優惠券類型」。');
    if (data.type === 'redeem_item' && !data.redeem_item_name) throw new Error('「兌換物品名稱」為必填。');
    if (data.type !== 'redeem_item' && !data.value) throw new Error('「折扣數值」為必填。');

    return data;
}

export async function onRequest(context) {
    const { request, env } = context;
    const db = env.DB;

    try {
        // --- GET: 獲取所有樣板 ---
        if (request.method === 'GET') {
            const { results } = await db.prepare("SELECT * FROM VoucherTemplates ORDER BY created_at DESC").all();
            
            // 解析 JSON 欄位，方便前端使用
            const templates = results.map(t => ({
                ...t,
                applicable_product_ids: JSON.parse(t.applicable_product_ids || '[]'),
                applicable_days_of_week: JSON.parse(t.applicable_days_of_week || '[]')
            }));

            return new Response(JSON.stringify(templates), {
                status: 200, headers: { 'Content-Type': 'application/json' }
            });
        }

        // --- POST: 建立新樣板 ---
        if (request.method === 'POST') {
            const body = await request.json();
            const data = validateTemplateData(body);

            const stmt = db.prepare(
                `INSERT INTO VoucherTemplates (
                    internal_name, title, type, value, redeem_item_name, min_spend, 
                    valid_from, valid_to, applicable_product_ids, applicable_days_of_week, 
                    total_supply, limit_per_user, is_public, is_active, public_claim_code
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
            );
            
            await stmt.bind(
                data.internal_name, data.title, data.type, data.value, data.redeem_item_name, data.min_spend,
                data.valid_from, data.valid_to, data.applicable_product_ids, data.applicable_days_of_week,
                data.total_supply, data.limit_per_user, data.is_public, data.is_active, data.public_claim_code
            ).run();

            return new Response(JSON.stringify({ success: true, message: '優惠券樣板建立成功' }), { status: 201 });
        }

        // --- PUT: 更新樣板 ---
        if (request.method === 'PUT') {
            const body = await request.json();
            const template_id = body.template_id;
            if (!template_id) return new Response(JSON.stringify({ error: '缺少 template_id' }), { status: 400 });

            const data = validateTemplateData(body);

            const stmt = db.prepare(
                `UPDATE VoucherTemplates SET
                    internal_name = ?, title = ?, type = ?, value = ?, redeem_item_name = ?, min_spend = ?, 
                    valid_from = ?, valid_to = ?, applicable_product_ids = ?, applicable_days_of_week = ?, 
                    total_supply = ?, limit_per_user = ?, is_public = ?, is_active = ?, public_claim_code = ?
                WHERE template_id = ?`
            );
            
            await stmt.bind(
                data.internal_name, data.title, data.type, data.value, data.redeem_item_name, data.min_spend,
                data.valid_from, data.valid_to, data.applicable_product_ids, data.applicable_days_of_week,
                data.total_supply, data.limit_per_user, data.is_public, data.is_active, data.public_claim_code,
                template_id
            ).run();

            return new Response(JSON.stringify({ success: true, message: '優惠券樣板更新成功' }), { status: 200 });
        }

        // --- DELETE: 刪除樣板 ---
// --- DELETE: 刪除樣板 ---
        if (request.method === 'DELETE') {
            const { template_id } = await request.json();
            if (!template_id) {
                return new Response(JSON.stringify({ error: '缺少 template_id' }), { status: 400 });
            }

            // --- ▼▼▼ 修正：執行「智慧刪除」 ▼▼▼ ---
            let message = '';
            
            // 1. 檢查這張券是否已被發行
            const checkStmt = db.prepare("SELECT 1 FROM UserVouchers WHERE template_id = ? LIMIT 1");
            const issuedVoucher = await checkStmt.bind(template_id).first();

            if (issuedVoucher) {
                // 2a. 如果已被發行：執行「軟刪除」(設為停用)
                await db.prepare("UPDATE VoucherTemplates SET is_active = 0 WHERE template_id = ?")
                      .bind(template_id)
                      .run();
                message = '樣板已停用 (因已被發行，故無法永久刪除)';
            } else {
                // 2b. 如果從未發行：執行「永久刪除」
                await db.prepare("DELETE FROM VoucherTemplates WHERE template_id = ?")
                      .bind(template_id)
                      .run();
                message = '樣板已成功刪除';
            }
            // --- ▲▲▲ 修正結束 ▲▲▲ ---
            
            return new Response(JSON.stringify({ success: true, message: message }), { status: 200 });
        }

        return new Response('無效的請求方法', { status: 405 });

    } catch (error) {
        console.error('Voucher Templates API Error:', error);
        return new Response(JSON.stringify({ error: '處理優惠券樣板時發生錯誤', details: error.message }), { 
            status: error instanceof Error && error.message.includes('為必填') ? 400 : 500,
            headers: { 'Content-Type': 'application/json' }
        });
    }
}