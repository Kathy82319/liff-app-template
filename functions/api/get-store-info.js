// functions/api/get-store-info.js

export async function onRequest(context) {
  try {
    if (context.request.method !== 'GET') {
      return new Response('Invalid request method.', { status: 405 });
    }

    const db = context.env.DB;
    // 店家資訊永遠只有一筆，ID 固定為 1
    const info = await db.prepare('SELECT * FROM StoreInfo WHERE id = 1').first();

    if (!info) {
      return new Response(JSON.stringify({ error: '找不到店家資訊。' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify(info), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error in get-store-info API:', error);
    return new Response(JSON.stringify({ error: '獲取店家資訊失敗。' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}