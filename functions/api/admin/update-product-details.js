// functions/api/admin/update-product-details.js (最終修正版)
export async function onRequest(context) {
  try {
    if (context.request.method !== 'POST') {
      return new Response(JSON.stringify({ error: '無效的請求方法' }), { status: 405 });
    }
    
    const body = await context.request.json();
    
    // 【關鍵修正】直接從 body 中解構出 'product_id'
    const { product_id, name, description, category, tags, images, is_visible, inventory_management_type, stock_quantity, stock_status, price_type, price, price_options, spec_1_name, spec_1_value, spec_2_name, spec_2_value, spec_3_name, spec_3_value, spec_4_name, spec_4_value, spec_5_name, spec_5_value } = body;
  
    // 【關鍵修正】驗證 'product_id' 而不是 'productId'
    if (!product_id || !name) {
        return new Response(JSON.stringify({ error: '產品 ID 和名稱為必填項。' }), { status: 400 });
    }

    const db = context.env.DB;
    
    const priceValue = (price || price === 0) ? Number(price) : null;
    const stockQuantityValue = (inventory_management_type === 'quantity' && (stock_quantity || stock_quantity === 0)) ? Number(stock_quantity) : null;

    const stmt = db.prepare(
      `UPDATE Products SET
         name = ?, description = ?, category = ?, tags = ?, images = ?, is_visible = ?,
         inventory_management_type = ?, stock_quantity = ?, stock_status = ?,
         price_type = ?, price = ?, price_options = ?,
         spec_1_name = ?, spec_1_value = ?, spec_2_name = ?, spec_2_value = ?,
         spec_3_name = ?, spec_3_value = ?, spec_4_name = ?, spec_4_value = ?,
         spec_5_name = ?, spec_5_value = ?, updated_at = CURRENT_TIMESTAMP
       WHERE product_id = ?` // SQL 中的欄位名稱是正確的
    );

    const result = await stmt.bind(
        name, description, category, tags, images, is_visible ? 1 : 0,
        inventory_management_type, stockQuantityValue, stock_status,
        price_type || 'simple', priceValue, price_options,
        spec_1_name, spec_1_value, spec_2_name, spec_2_value,
        spec_3_name, spec_3_value, spec_4_name, spec_4_value,
        spec_5_name, spec_5_value,
        product_id // 【關鍵修正】將 product_id 綁定到 SQL 語句
    ).run();

    if (result.meta.changes === 0) {
      return new Response(JSON.stringify({ error: `找不到產品 ID: ${product_id}，無法更新。` }), { status: 404 });
    }
    
    return new Response(JSON.stringify({ success: true, message: '成功更新產品資訊！' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error in update-product-details API:', error);
    return new Response(JSON.stringify({ error: '更新產品資訊失敗。', details: error.message }), { status: 500 });
  }
}