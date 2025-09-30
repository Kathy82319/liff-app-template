// functions/api/admin/bulk-create-products.js (優化修正版)
import { customAlphabet } from 'nanoid';

const generateProductId = customAlphabet('0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ_abcdefghijklmnopqrstuvwxyz', 8);

const headerMapping = {
    "產品名稱": "name", "詳細介紹": "description", "分類": "category", "標籤(逗號分隔)": "tags",
    "圖片網址(JSON陣列)": "images", "是否上架(TRUE/FALSE)": "is_visible", "庫存管理模式(none/quantity/status)": "inventory_management_type",
    "庫存數量": "stock_quantity", "庫存狀態": "stock_status", "價格": "price", "規格1名稱": "spec_1_name",
    "規格1內容": "spec_1_value", "規格2名稱": "spec_2_name", "規格2內容": "spec_2_value", "規格3名稱": "spec_3_name",
    "規格3內容": "spec_3_value", "規格4名稱": "spec_4_name", "規格4內容": "spec_4_value", "規格5名稱": "spec_5_name",
    "規格5內容": "spec_5_value"
};

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

        const stmt = db.prepare(
            `INSERT INTO Products (
                product_id, name, description, category, tags, images, is_visible, display_order, inventory_management_type, 
                stock_quantity, stock_status, price_type, price, price_options, spec_1_name, spec_1_value, spec_2_name, 
                spec_2_value, spec_3_name, spec_3_value, spec_4_name, spec_4_value, spec_5_name, spec_5_value
             ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        );
        
        for (let i = 0; i < products.length; i++) {
            const rawProduct = products[i];
            const product = {};
            for (const chiHeader in rawProduct) {
                if (headerMapping[chiHeader]) {
                    product[headerMapping[chiHeader]] = rawProduct[chiHeader];
                }
            }

            if (!product.name || product.name.trim().length === 0) {
                failCount++;
                errors.push(`第 ${i + 2} 行：缺少產品名稱。`);
                continue;
            }

            // 【** Bug 1 修正：更寬鬆地判斷 "TRUE" **】
            // 不論使用者輸入 TRUE, true, Yes, Y, 1 都會被視為 "上架"
            const isVisibleValue = (product.is_visible || '').toString().trim().toUpperCase();
            const isVisible = ['TRUE', 'YES', 'Y', '1'].includes(isVisibleValue) ? 1 : 0;

            // 【** Bug 2 修正：處理圖片格式 **】
            // 如果 images 欄位不是一個合法的 JSON 陣列，就嘗試將其從逗號分隔的字串轉換成 JSON 陣列
            let imagesJson = '[]';
            if (product.images) {
                if (product.images.trim().startsWith('[')) {
                    imagesJson = product.images; // 假定它本身就是 JSON
                } else {
                    // 將 "url1, url2" 轉換為 ["url1", "url2"] 的 JSON 格式
                    const urls = product.images.split(',').map(url => url.trim()).filter(Boolean);
                    imagesJson = JSON.stringify(urls);
                }
            }

            const newProductData = {
                product_id: `p-${generateProductId()}`,
                name: product.name.trim(),
                description: product.description || null,
                category: product.category || null,
                tags: product.tags || null,
                images: imagesJson, // 使用處理過的 JSON
                is_visible: isVisible, // 使用處理過的布林值
                display_order: 999,
                inventory_management_type: product.inventory_management_type || 'none',
                stock_quantity: product.inventory_management_type === 'quantity' ? Number(product.stock_quantity) || null : null,
                stock_status: product.inventory_management_type === 'status' ? product.stock_status : null,
                price_type: 'simple',
                price: product.price ? Number(product.price) || null : null,
                price_options: null,
                spec_1_name: product.spec_1_name || null, spec_1_value: product.spec_1_value || null,
                spec_2_name: product.spec_2_name || null, spec_2_value: product.spec_2_value || null,
                spec_3_name: product.spec_3_name || null, spec_3_value: product.spec_3_value || null,
                spec_4_name: product.spec_4_name || null, spec_4_value: product.spec_4_value || null,
                spec_5_name: product.spec_5_name || null, spec_5_value: product.spec_5_value || null,
            };
            
            operations.push(stmt.bind(...Object.values(newProductData)));
            successCount++;
        }

        if (operations.length > 0) {
            await db.batch(operations);
        }

        let message = `匯入完成！成功新增 ${successCount} 筆資料。`;
        if (failCount > 0) {
            message += `\n失敗 ${failCount} 筆。\n錯誤詳情：\n${errors.slice(0, 5).join('\n')}`;
        }

        return new Response(JSON.stringify({ success: true, message }), { status: 200 });

    } catch (error) {
        console.error('Error in bulk-create-products API:', error);
        return new Response(JSON.stringify({ error: '批量匯入時發生嚴重錯誤', details: error.message }), { status: 500 });
    }
}