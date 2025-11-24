// functions/claim.js

export async function onRequest(context) {
    const { request, env } = context;
    const db = env.DB;
    const url = new URL(request.url);
    const myLiffId = "${env.LIFF_ID}";
    
    // 【修正】優先讀取 voucher_code，如果沒有才讀取 code (為了相容舊連結，雖然我們建議用新的)
    const claimCode = url.searchParams.get('voucher_code') || url.searchParams.get('code');

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
        #status-message {
            text-align: center;
            padding: 30px;
            font-size: 1.1em;
            white-space: pre-wrap; /* 支援換行 */
        }
        #status-message.success { color: var(--color-success, green); }
        #status-message.error { color: var(--color-danger, red); }
    </style>
</head>
<body>
    <main id="app-content" class="page">
        <p id="status-message">正在載入 LIFF 並嘗試領取優惠券...</p>
    </main>

    <script src="https://static.line-scdn.net/liff/edge/2/sdk.js"></script>
    
    <script>
        async function claimVoucher() {
            const statusEl = document.getElementById('status-message');
            const urlParams = new URLSearchParams(window.location.search);
            
            // 【修正】前端也改為讀取 voucher_code
            const claimCode = urlParams.get('voucher_code') || urlParams.get('code');
            
            

            if (!claimCode) {
                statusEl.textContent = '錯誤：缺少優惠券代碼 (voucher_code)。';
                statusEl.className = 'error';
                return;
            }

            try {
                // ... (中間 LIFF 初始化與登入邏輯保持不變) ...
                // 注意：這裡的 liff.login 不需修改，因為我們已經避開了 code 參數衝突
                
                statusEl.textContent = '正在初始化 LIFF...';
                await liff.init({ liffId: myLiffId });

                if (!liff.isLoggedIn()) {
                    statusEl.textContent = '請先登入以領取優惠券...';
                    // 在此處，我們讓它跳轉回帶有 voucher_code 的網址，這樣登入後參數還在
                    liff.login({ redirectUri: window.location.href });
                    return;
                }

                statusEl.textContent = '正在獲取使用者資料...';
                const profile = await liff.getProfile();
                const userId = profile.userId;

                statusEl.textContent = '正在領取優惠券...';
                const response = await fetch('/api/claim-voucher', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        userId: profile.userId,
                        public_claim_code: claimCode // 傳送給後端
                    })
                });
                
                const result = await response.json();

                if (!response.ok) {
                    throw new Error(result.error || '領取失敗');
                }
                
                // 領取成功
                // --- ▼▼▼ 修正：移除多餘的反斜線 \ ▼▼▼ ---
                const successMsg = \`✅ 領取成功！\\n\${result.message}\`;
                statusEl.textContent = successMsg;
                statusEl.className = 'success';
                alert(successMsg);

            } catch (error) {
                // 領取失敗
                console.error("領券失敗:", error);
                const errorMsg = \`❌ 領取失敗：\\n\${error.message}\`;
                statusEl.textContent = errorMsg;
                statusEl.className = 'error';
                alert(errorMsg);
            } finally {
                // 無論成功失敗，都清除 URL 代碼並跳轉到優惠券頁面
                // --- ▼▼▼ 修正：移除結尾多餘的 _ ▼▼▼ ---
                statusEl.textContent += \`\\n\\n即將跳轉至「我的優惠券」...\`;
                setTimeout(() => {
                    // 使用 /#my-vouchers 重定向到主應用的優惠券頁面
                    window.location.href = '/#my-vouchers';
                }, 3000);
            }
        }
        claimVoucher();
    <\/script>
    </body>
</html>
    `;

    return new Response(html, {
        status: 200,
        headers: { 'Content-Type': 'text/html; charset=utf-8' },
    });
}