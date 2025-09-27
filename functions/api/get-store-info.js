// functions/get-store-info.js

export const onRequest = async (context) => {
  try {
    // 確保只處理 GET 請求
    if (context.request.method !== 'GET') {
      return new Response('Invalid request method.', { status: 405 });
    }

    const db = context.env.DB;
    if (!db) {
        throw new Error("Database binding not found.");
    }

    // 店家資訊永遠只有一筆，ID 固定為 1
    const info = await db.prepare('SELECT * FROM StoreInfo WHERE id = 1').first();

    if (!info) {
      return new Response(JSON.stringify({ error: '在資料庫中找不到店家資訊。' }), {
        status: 404, // 同樣回傳 404，但附帶更明確的錯誤訊息
        headers: { 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify(info), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error in get-store-info API:', error);
    return new Response(JSON.stringify({ error: '獲取店家資訊時發生內部錯誤。' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};