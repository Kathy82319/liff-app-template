// functions/api/admin/generate-image-upload-url.js

export async function onRequest(context) {
    try {
        // 僅允許 POST 請求
        if (context.request.method !== 'POST') {
            return new Response(JSON.stringify({ error: '無效的請求方法' }), { status: 405 });
        }

        const { CF_IMAGE_ACCOUNT_ID, CF_IMAGE_API_TOKEN } = context.env;

        // 後端安全檢查：確保環境變數已設定
        if (!CF_IMAGE_ACCOUNT_ID || !CF_IMAGE_API_TOKEN) {
            console.error('環境變數 CF_IMAGE_ACCOUNT_ID 或 CF_IMAGE_API_TOKEN 未設定');
            return new Response(JSON.stringify({ error: '伺服器缺少圖片上傳服務的必要設定' }), { status: 500 });
        }

        // 向 Cloudflare Images API 發出請求，獲取一個一次性的上傳 URL
        const response = await fetch(
            `https://api.cloudflare.com/client/v4/accounts/${CF_IMAGE_ACCOUNT_ID}/images/v2/direct_upload`,
            {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${CF_IMAGE_API_TOKEN}`,
                },
            }
        );

        const result = await response.json();

        if (!result.success) {
            console.error('從 Cloudflare 獲取上傳 URL 失敗:', result.errors);
            throw new Error('無法從圖片服務取得上傳授權');
        }

        // 將從 Cloudflare 獲取的結果直接回傳給前端
        return new Response(JSON.stringify(result.result), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
        });

    } catch (error) {
        console.error('Error in generate-image-upload-url API:', error);
        return new Response(JSON.stringify({ error: '產生圖片上傳連結時發生錯誤', details: error.message }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' },
        });
    }
}