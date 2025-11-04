// functions/claim.js
// 這個檔案會處理 /claim 路由，動態產生 HTML 來修復 LINE 預覽標題

export async function onRequest(context) {
    const { request, env } = context;
    const db = env.DB;
    const url = new URL(request.url);
    const claimCode = url.searchParams.get('code');

    let pageTitle = "優惠券領取頁面";
    let pageDescription = "請點擊以領取您的專屬優惠券。";
    let pageImage = "https://example.com/default-voucher-image.png"; // 你可以換成一個預設的 LOGO

    if (claimCode) {
        try {
            // 查詢優惠券標題
            const template = await db.prepare(
                `SELECT title FROM VoucherTemplates 
                 WHERE public_claim_code = ? AND is_active = 1 AND is_public = 1`
            ).bind(claimCode).first();
            
            if (template) {
                pageTitle = `點此領取：${template.title}`;
                pageDescription = "您收到了一張由店家發出的特別優惠券！";
            } else {
                 pageTitle = "無效的優惠券";
                 pageDescription = "此優惠券代碼可能已過期或不存在。";
            }
        } catch (e) {
            console.error("查詢 claim.js 標題時出錯:", e);
        }
    }

    // 產生動態 HTML
    const html = `
<!DOCTYPE html>
<html lang="zh-Hant">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${pageTitle}</title>
    
    <meta property="og:title" content="${pageTitle}" />
    <meta property="og:description" content="${pageDescription}" />
    <meta property="og:type" content="website" />
    <meta property="og:url" content="${url.href}" />
    <meta property="og:image" content="${pageImage}" />
    
    <link rel="stylesheet" href="/style.css">
    <style>
        body { padding: 30px 15px; }
    </style>
</head>
<body>
    <main id="app-content" class="page">
        <p style="text-align: center; padding: 30px;">正在載入 LIFF 並嘗試領取優惠券...</p>
    </main>

    <script src="https://static.line-scdn.net/liff/edge/2/sdk.js"></script>
    <script src="/script.js"></script>
</body>
</html>
    `;

    // --- ▼▼▼ 核心修正 ▼▼▼ ---
    // 將 'application/json' 改為 'text/html; charset=utf-8'
    return new Response(html, {
        status: 200,
        headers: { 'Content-Type': 'text/html; charset=utf-8' },
    });
    // --- ▲▲▲ 修正結束 ▲▲▲ ---
}