// functions/api/admin/update-product-details.js (最終修正版)
export async function onRequest(context) {
  try {
    if (context.request.method !== 'POST') {
      return new Response(JSON.stringify({ error: '無效的請求方法' }), { status: 405 });
    }
    
    const body = await context.request.json();
    
    // 從 body 中解構出所有可能的欄位
    const { 
        product_id, name, description, category, tags, images, 
        is_visible, inventory_management_type, stock_quantity, stock_status, 
        price, spec_1_name, spec_1_value, spec_2_name, spec_2_value, 
        spec_3_name, spec_3_value, spec_4_name, spec_4_value, 
        spec_5_name, spec_5_value 
    } = body;
  
    // 後端驗證
    if (!product_id || !name) {
        return new Response(JSON.stringify({ error: '產品 ID 和名稱為必填項。' }), { status: 400 });
    }

    const db = context.env.DB;
    
    // 【關鍵修正】對所有可能為空值的欄位進行安全處理，提供預設值
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
       WHERE product_id = ?`
    );

    const result = await stmt.bind(
        name || '', 
        description || null, 
        category || null, 
        tags || null, 
        images || '[]', 
        is_visible ? 1 : 0,
        inventory_management_type || 'none', 
        stockQuantityValue, 
        stock_status || null,
        body.price_type || 'simple', // 如果前端沒傳，預設為 'simple'
        priceValue, 
        body.price_options || null, // 如果前端沒傳，預設為 null
        spec_1_name || null, spec_1_value || null, 
        spec_2_name || null, spec_2_value || null,
        spec_3_name || null, spec_3_value || null, 
        spec_4_name || null, spec_4_value || null,
        spec_5_name || null, spec_5_value || null,
        product_id
    ).run();

    if (result.meta.changes === 0) {
      return new Response(JSON.stringify({ error: `找不到產品 ID: ${product_id}，無法更新。` }), { status: 404 });
    }
    
    return new Response(JSON.stringify({ success: true, message: '成功更新產品資訊！' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });

  } catch (error) {
    // 【新增偵錯日誌】
    console.error('--- Update Product Details API Error ---');
    console.error('Error Message:', error.message);
    console.error('Error Cause:', error.cause);
    try {
        const requestBody = await context.request.json();
        console.error('Request Body:', JSON.stringify(requestBody, null, 2));
    } catch (e) {
        console.error('Could not parse request body for debugging.');
    }
    console.error('------------------------------------');
    
    return new Response(JSON.stringify({ error: '更新產品資訊失敗。', details: error.message }), { status: 500 });
  }
}