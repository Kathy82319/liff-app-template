// functions/api/admin/bulk-create-products.js
import { customAlphabet } from 'nanoid';

const generateProductId = customAlphabet('0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ_abcdefghijklmnopqrstuvwxyz', 8);

export async function onRequest(context) {
    try {
        if (context.request.method !== 'POST') {
            return new Response(JSON.stringify({ error: '無效的請求方法' }), { status: 405 });
        }

        const { products } = await context.request.json();

        if (!Array.isArray(products) || products.length === 0) {
            return new Response(JSON.stringify({ error: '請提供有效的產品資料陣列。' }), { status: 400 });
        }

        const db = context.env.DB;
        const operations = [];
        let successCount = 0;
        let failCount = 0;
        const errors = [];

        // 準備好一次性的 SQL 插入語句
        const stmt = db.prepare(
            `INSERT INTO Products (
                product_id, name, description, category, tags, images, is_visible, display_order,
                inventory_management_type, stock_quantity, stock_status, price_type, price, price_options,
                spec_1_name, spec_1_value, spec_2_name, spec_2_value, spec_3_name, spec_3_value,
                spec_4_name, spec_4_value, spec_5_name, spec_5_value
             ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        );
        
        // 遍歷前端傳來的每一筆產品資料
        for (let i = 0; i < products.length; i++) {
            const product = products[i];
            
            // 簡易驗證：至少要有 name
            if (!product.name || product.name.trim().length === 0) {
                failCount++;
                errors.push(`第 ${i + 2} 行：缺少產品名稱。`);
                continue;
            }

            const newProductData = {
                product_id: `p-${generateProductId()}`,
                name: product.name.trim(),
                description: product.description || null,
                category: product.category || null,
                tags: product.tags || null,
                images: product.images || '[]',
                is_visible: String(product.is_visible).toUpperCase() === 'TRUE' ? 1 : 0,
                display_order: 999,
                inventory_management_type: product.inventory_management_type || 'none',
                stock_quantity: product.inventory_management_type === 'quantity' ? Number(product.stock_quantity) : null,
                stock_status: product.inventory_management_type === 'status' ? product.stock_status : null,
                price_type: 'simple',
                price: product.price ? Number(product.price) : null,
                price_options: null,
                spec_1_name: product.spec_1_name || null, spec_1_value: product.spec_1_value || null,
                spec_2_name: product.spec_2_name || null, spec_2_value: product.spec_2_value || null,
                spec_3_name: product.spec_3_name || null, spec_3_value: product.spec_3_value || null,
                spec_4_name: product.spec_4_name || null, spec_4_value: product.spec_4_value || null,
                spec_5_name: product.spec_5_name || null, spec_5_value: product.spec_5_value || null,
            };
            
            // 將合法的操作加入到 operations 陣列中
            operations.push(stmt.bind(...Object.values(newProductData)));
            successCount++;
        }

        // 如果有任何合法的操作，就一次性執行
        if (operations.length > 0) {
            await db.batch(operations);
        }

        // 組合回傳訊息
        let message = `匯入完成！成功新增 ${successCount} 筆資料。`;
        if (failCount > 0) {
            message += `\n失敗 ${failCount} 筆。\n錯誤詳情：\n${errors.slice(0, 5).join('\n')}`; // 最多顯示前 5 條錯誤
        }

        return new Response(JSON.stringify({ success: true, message }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
        });

    } catch (error) {
        console.error('Error in bulk-create-products API:', error);
        return new Response(JSON.stringify({ error: '批量匯入時發生嚴重錯誤', details: error.message }), {
            status: 500
        });
    }
}