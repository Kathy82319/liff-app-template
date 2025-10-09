// functions/api/admin/create-product.js
import { customAlphabet } from 'nanoid';

// 輔助函式：產生一個亂數ID (例如: p-6aK8bN_e)
const generateProductId = customAlphabet('0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ_abcdefghijklmnopqrstuvwxyz', 8);

export async function onRequest(context) {
    try {
        if (context.request.method !== 'POST') {
            return new Response(JSON.stringify({ error: '無效的請求方法' }), { status: 405 });
        }

        const body = await context.request.json();
        
        // --- 1. 後端嚴格驗證 ---
        const errors = [];
        if (!body.name || typeof body.name !== 'string' || body.name.trim().length === 0 || body.name.length > 100) {
            errors.push('產品名稱為必填，且長度不可超過 100 字。');
        }
        if (body.category && body.category.length > 50) {
            errors.push('分類長度不可超過 50 字。');
        }
        if (body.price && isNaN(Number(body.price))) {
             errors.push('價格必須是有效的數字。');
        }
        if (body.stock_quantity && isNaN(Number(body.stock_quantity))) {
             errors.push('庫存數量必須是有效的數字。');
        }

        if (errors.length > 0) {
            return new Response(JSON.stringify({ error: errors.join(' ') }), { status: 400 });
        }
        // --- 驗證結束 ---

        const db = context.env.DB;
        
        // --- 2. 準備資料並生成 ID ---
        const newProductId = `p-${generateProductId()}`;
        const newProductData = {
            product_id: newProductId,
            name: body.name.trim(),
            description: body.description || null,
            category: body.category || null,
            images: body.images || '[]',
            is_visible: body.is_visible ? 1 : 0,
            display_order: 999,
            inventory_management_type: body.inventory_management_type || 'none',
            stock_quantity: body.stock_quantity ?? null,
            stock_status: body.stock_status || null,
            price_type: body.price_type || 'simple',
            price: body.price ?? null,
            price_options: body.price_options || null,
            spec_1_name: body.spec_1_name || null, spec_1_value: body.spec_1_value || null,
            spec_2_name: body.spec_2_name || null, spec_2_value: body.spec_2_value || null,
            spec_3_name: body.spec_3_name || null, spec_3_value: body.spec_3_value || null,
            spec_4_name: body.spec_4_name || null, spec_4_value: body.spec_4_value || null,
            spec_5_name: body.spec_5_name || null, spec_5_value: body.spec_5_value || null,
            // 【新增】
            filter_1: body.filter_1 || null,
            filter_2: body.filter_2 || null,
            filter_3: body.filter_3 || null,
        };

        const stmt = db.prepare(
            `INSERT INTO Products (
                product_id, name, description, category, images, is_visible, display_order,
                inventory_management_type, stock_quantity, stock_status, price_type, price, price_options,
                spec_1_name, spec_1_value, spec_2_name, spec_2_value, spec_3_name, spec_3_value,
                spec_4_name, spec_4_value, spec_5_name, spec_5_value,
                filter_1, filter_2, filter_3
             ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        );

        await stmt.bind(...Object.values(newProductData)).run();
        
        // --- 4. 回傳成功訊息與新產品資料 ---
        return new Response(JSON.stringify({ success: true, product: newProductData }), {
            status: 201, // 201 Created
            headers: { 'Content-Type': 'application/json' },
        });

    } catch (error) {
        console.error('Error in create-product API:', error);
        return new Response(JSON.stringify({ error: '建立產品失敗', details: error.message }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' },
        });
    }
}