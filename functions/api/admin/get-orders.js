// functions/api/admin/get-orders.js (Placeholder)

export async function onRequest(context) {
  try {
    // 檢查請求方法
    if (context.request.method !== 'GET') {
      return new Response(JSON.stringify({ error: '無效的請求方法' }), {
        status: 405,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // TODO: 在這裡加入實際查詢訂單的資料庫邏輯
    // 目前先回傳一個空的陣列作為佔位符
    const orders = [];

    // 回傳一個有效的 JSON 陣列
    return new Response(JSON.stringify(orders), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error in get-orders API:', error);
    return new Response(JSON.stringify({ error: '獲取訂單列表失敗', details: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}