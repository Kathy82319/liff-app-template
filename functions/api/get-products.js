// functions/api/get-products.js (修正後)
import { GoogleSpreadsheet } from 'google-spreadsheet';
import * as jose from 'jose';

// --- 【已修正】同步邏輯以符合新的 Products 表 ---
async function runProductSync(env) {
    const { DB } = env;
    const rows = await getProductsFromSheet(env);
    if (rows.length === 0) {
        return { success: true, message: 'Google Sheet 中沒有產品資料可同步。' };
    }

    const stmt = DB.prepare(
        `INSERT INTO Products (
            product_id, name, description, category, tags, images, is_visible, display_order,
            inventory_management_type, stock_quantity, stock_status, price_type, price, price_options,
            spec_1_name, spec_1_value, spec_2_name, spec_2_value, spec_3_name, spec_3_value,
            spec_4_name, spec_4_value, spec_5_name, spec_5_value
         )
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(product_id) DO UPDATE SET
           name=excluded.name, description=excluded.description, category=excluded.category, tags=excluded.tags,
           images=excluded.images, is_visible=excluded.is_visible, display_order=excluded.display_order,
           inventory_management_type=excluded.inventory_management_type, stock_quantity=excluded.stock_quantity,
           stock_status=excluded.stock_status, price_type=excluded.price_type, price=excluded.price, price_options=excluded.price_options,
           spec_1_name=excluded.spec_1_name, spec_1_value=excluded.spec_1_value, spec_2_name=excluded.spec_2_name, spec_2_value=excluded.spec_2_value,
           spec_3_name=excluded.spec_3_name, spec_3_value=excluded.spec_3_value, spec_4_name=excluded.spec_4_name, spec_4_value=excluded.spec_4_value,
           spec_5_name=excluded.spec_5_name, spec_5_value=excluded.spec_5_value`
    );

    const operations = rows.map(row => {
        const d = row.toObject();
        if (!d.product_id) return null;
        return stmt.bind(
            d.product_id, d.name || '', d.description || '', d.category || '', d.tags || '',
            d.images || '[]', String(d.is_visible).toUpperCase() === 'TRUE' ? 1 : 0, Number(d.display_order) || 999,
            d.inventory_management_type || 'none', Number(d.stock_quantity) || null, d.stock_status || null,
            d.price_type || 'simple', Number(d.price) || null, d.price_options || null,
            d.spec_1_name || null, d.spec_1_value || null, d.spec_2_name || null, d.spec_2_value || null,
            d.spec_3_name || null, d.spec_3_value || null, d.spec_4_name || null, d.spec_4_value || null,
            d.spec_5_name || null, d.spec_5_value || null
        );
    }).filter(op => op !== null);

    if (operations.length === 0) {
        return { success: true, message: '在 Google Sheet 中沒有找到包含有效 product_id 的資料可同步。' };
    }

    await DB.batch(operations);
    return { success: true, message: `成功從 Google Sheet 同步了 ${operations.length} 筆產品資料到資料庫。` };
}

// --- API Endpoint 邏輯 ---
export async function onRequest(context) {
    const { request, env } = context;
    const db = env.DB;

    try {
        if (request.method === 'GET') {
            const stmt = db.prepare('SELECT * FROM Products ORDER BY display_order ASC');
            const { results } = await stmt.all();
            return new Response(JSON.stringify(results || []), {
                status: 200, headers: { 'Content-Type': 'application/json' },
            });
        }
        if (request.method === 'POST') {
             const result = await runProductSync(env);
             return new Response(JSON.stringify(result), { status: 200, headers: { 'Content-Type': 'application/json' } });
        }
        return new Response('Invalid request method.', { status: 405 });

    } catch (error) {
        console.error(`Error in get-products API:`, error);
        return new Response(JSON.stringify({ error: '獲取或同步產品列表失敗。', details: error.message }), {
            status: 500, headers: { 'Content-Type': 'application/json' },
        });
    }
}