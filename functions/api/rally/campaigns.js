// functions/api/rally/campaigns.js
// 這是公開 API，供客戶端 LIFF 讀取活動列表 (GET Only)

export async function onRequest(context) {
    // 1. 取得環境變數與資料庫連線
    const { env } = context;
    const db = env.DB;

    // 2. 限制只允許 GET 請求
    if (context.request.method !== 'GET') {
        return new Response(JSON.stringify({ error: 'Method Not Allowed' }), { 
            status: 405,
            headers: { 'Content-Type': 'application/json' }
        });
    }

    try {
        // 3. 查詢資料庫：只選取 "已啟用 (is_active = 1)" 的活動
        const { results } = await db.prepare(
            "SELECT * FROM RallyCampaigns WHERE is_active = 1 ORDER BY campaign_id DESC"
        ).all();

        // 4. 回傳 JSON 結果
        return new Response(JSON.stringify(results || []), {
            status: 200,
            headers: { 
                'Content-Type': 'application/json',
                // 加入快取控制，避免手機端快取舊資料
                'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
                'Pragma': 'no-cache',
                'Expires': '0'
            }
        });

    } catch (error) {
        console.error('Error in public rally campaigns API:', error);
        
        // 發生錯誤時，回傳 JSON 格式的錯誤訊息 (避免前端解析 HTML 報錯)
        return new Response(JSON.stringify({ error: '無法讀取活動列表', details: error.message }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' }
        });
    }
}