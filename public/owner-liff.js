// public/owner-liff.js (偵錯版 v2)

document.addEventListener('DOMContentLoaded', () => {
    const myLiffId = "請在這裡貼上您新建立的 LIFF ID"; // 請再次確認 LIFF ID 是否正確
    let userId = null;
    const loadingView = document.getElementById('loading-view');

    // 輔助函式：在畫面上顯示錯誤訊息，方便直接在手機上看到
    function displayError(message) {
        console.error(message); // 仍在 console 中印出詳細錯誤
        if (loadingView) {
            loadingView.innerHTML = `<p style="color: red; text-align: center; white-space: pre-wrap;">${message}</p>`;
        }
    }

    async function main() {
        try {
            console.log("1. 腳本開始執行，準備初始化 LIFF...");
            await liff.init({ liffId: myLiffId });
            console.log("2. LIFF 初始化成功。");

            if (!liff.isLoggedIn()) {
                console.log("3. 使用者未登入，執行 liff.login()...");
                liff.login({ redirectUri: window.location.href });
                return; // liff.login() 會跳轉頁面，後續程式碼不會執行
            }
            console.log("3. 使用者已登入。");

            const profile = await liff.getProfile();
            userId = profile.userId;
            console.log(`4. 成功獲取使用者 Profile，userId: ${userId}`);

            console.log("5. 準備呼叫後端 API '/api/admin/verify-liff-user'...");
            const response = await fetch('/api/admin/verify-liff-user', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userId: userId })
            });
            console.log(`6. 後端 API 回應狀態碼: ${response.status}`);

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`API 請求失敗，狀態碼: ${response.status}, 回應: ${errorText}`);
            }

            const result = await response.json();
            console.log("7. 成功解析後端回傳的 JSON:", result);

            if (result.success && result.isAdmin) {
                console.log("8. 驗證成功，使用者是管理員。顯示主畫面。");
                document.getElementById('loading-view').style.display = 'none';
                document.getElementById('main-view').style.display = 'block';
                initializeApp(result.activeTemplate);
            } else {
                console.log("8. 驗證失敗或非管理員。顯示權限不足畫面。");
                document.getElementById('loading-view').style.display = 'none';
                document.getElementById('unauthorized-view').style.display = 'block';
            }
        } catch (error) {
            // 將詳細的錯誤物件印在 console，並在畫面上顯示錯誤訊息
            console.error('執行過程中發生嚴重錯誤:', error);
            displayError(`初始化或驗證失敗:\n\n${error.message}\n\n請打開開發者工具(Console)查看詳細資訊。`);
        }
    }

    // initializeApp 之後的函式保持不變...
    function initializeApp(template) {
        console.log(`以 ${template} 樣板初始化管理介面`);
        const mainTitle = document.getElementById('main-title');
        const dashboardContainer = document.getElementById('dashboard-container');
        mainTitle.textContent = "即時數據總覽";
        renderDashboard(template, dashboardContainer);
        loadAndRenderList(template);
        const adminPanelBtn = document.getElementById('go-to-admin-panel-btn');
        adminPanelBtn.addEventListener('click', generateAndOpenAdminLink);
    }
    function renderDashboard(template, container) {
        let cardsHtml = '';
        switch (template) {
            case 'studio':
                cardsHtml = `<div class="dashboard-grid"><div class="stat-card"><h3>今日預約</h3><p class="stat-value" id="stat-1">...</p></div><div class="stat-card"><h3>待處理</h3><p class="stat-value" id="stat-2">...</p></div><div class="stat-card" style="grid-column: span 2;"><h3>本月營業額</h3><p class="stat-value" id="stat-3">...</p></div></div>`;
                break;
            case 'guesthouse':
                 cardsHtml = `<div class="dashboard-grid"><div class="stat-card"><h3>今日入住率</h3><p class="stat-value" id="stat-1">...</p></div><div class="stat-card"><h3>待處理訂房</h3><p class="stat-value" id="stat-2">...</p></div><div class="stat-card" style="grid-column: span 2;"><h3>本月營業額</h3><p class="stat-value" id="stat-3">...</p></div></div>`;
                break;
            case 'ecommerce':
                 cardsHtml = `<div class="dashboard-grid"><div class="stat-card"><h3>今日訂單</h3><p class="stat-value" id="stat-1">...</p></div><div class="stat-card"><h3>待處理出貨</h3><p class="stat-value" id="stat-2">...</p></div><div class="stat-card" style="grid-column: span 2;"><h3>本月營收</h3><p class="stat-value" id="stat-3">...</p></div></div>`;
                break;
            default:
                cardsHtml = '<p>未知的樣板類型，無法顯示儀表板。</p>';
        }
        container.innerHTML = cardsHtml;
    }
    function loadAndRenderList(template) {
        const listContent = document.getElementById('booking-list-content');
        const listTitle = document.getElementById('list-title');
        switch (template) {
            case 'studio':
            case 'guesthouse':
                listTitle.textContent = '今日預約列表';
                break;
            case 'ecommerce':
                 listTitle.textContent = '今日訂單列表';
                 break;
        }
    }
    async function generateAndOpenAdminLink() {
        const btn = document.getElementById('go-to-admin-panel-btn');
        btn.disabled = true;
        btn.textContent = '正在產生安全連結...';
        try {
            const response = await fetch('/api/generate-admin-link', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userId: userId })
            });
            const result = await response.json();
            if (!result.success) throw new Error(result.error);
            liff.openWindow({ url: result.link, external: true });
        } catch (error) {
            alert(`開啟失敗: ${error.message}`);
        } finally {
            btn.disabled = false;
            btn.textContent = '開啟完整版後台';
        }
    }

    main();
});