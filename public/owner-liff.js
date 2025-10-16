// public/owner-liff.js

document.addEventListener('DOMContentLoaded', () => {
    // 【重要】請先到 LINE Developers Console 為此頁面建立一個新的 LIFF ID，然後貼在這裡
    const myLiffId = "2008296713-vPAkV7xr";
    let userId = null;

    async function main() {
        try {
            // 1. 初始化 LIFF
            await liff.init({ liffId: myLiffId });
            if (!liff.isLoggedIn()) {
                liff.login({ redirectUri: window.location.href });
                return;
            }
            const profile = await liff.getProfile();
            userId = profile.userId;

            // 2. 呼叫後端 API 驗證使用者身份
            const response = await fetch('/api/admin/verify-liff-user', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userId: userId })
            });
            const result = await response.json();

            // 3. 根據驗證結果顯示對應畫面
            if (result.success && result.isAdmin) {
                // 是管理員 -> 顯示主畫面並開始載入資料
                document.getElementById('loading-view').style.display = 'none';
                document.getElementById('main-view').style.display = 'block';
                initializeApp(result.activeTemplate);
            } else {
                // 不是管理員 -> 顯示權限不足畫面
                document.getElementById('loading-view').style.display = 'none';
                document.getElementById('unauthorized-view').style.display = 'block';
            }
        } catch (error) {
            console.error('初始化或驗證失敗:', error);
            const loadingView = document.getElementById('loading-view');
            loadingView.innerHTML = `<p style="color: red; text-align: center;">初始化失敗: ${error.message}</p>`;
        }
    }

    // 初始化 App (只有管理員會執行到這一步)
    function initializeApp(template) {
        console.log(`以 ${template} 樣板初始化管理介面`);

        const mainTitle = document.getElementById('main-title');
        const dashboardContainer = document.getElementById('dashboard-container');
        
        mainTitle.textContent = "即時數據總覽";
        
        // 步驟 2.2: 根據樣板動態渲染儀表板 (目前是 placeholder)
        renderDashboard(template, dashboardContainer);

        // 步驟 2.3: 載入即時管理列表 (目前是 placeholder)
        loadAndRenderList(template);

        // 步驟 2.4: 綁定進入完整後台按鈕的事件
        const adminPanelBtn = document.getElementById('go-to-admin-panel-btn');
        adminPanelBtn.addEventListener('click', generateAndOpenAdminLink);
    }

    // Placeholder 函式：渲染儀表板
    function renderDashboard(template, container) {
        let cardsHtml = '';
        // 這裡就是我們動態顯示的邏輯
        switch (template) {
            case 'studio':
                cardsHtml = `
                    <div class="stat-card"><h3>今日預約</h3><p class="stat-value" id="stat-1">...</p></div>
                    <div class="stat-card"><h3>待處理</h3><p class="stat-value" id="stat-2">...</p></div>
                    <div class="stat-card" style="grid-column: span 2;"><h3>本月營業額</h3><p class="stat-value" id="stat-3">...</p></div>
                `;
                break;
            case 'guesthouse': // 民宿 (預留)
                 cardsHtml = `
                    <div class="stat-card"><h3>今日入住率</h3><p class="stat-value" id="stat-1">...</p></div>
                    <div class="stat-card"><h3>待處理訂房</h3><p class="stat-value" id="stat-2">...</p></div>
                    <div class="stat-card" style="grid-column: span 2;"><h3>本月營業額</h3><p class="stat-value" id="stat-3">...</p></div>
                `;
                break;
            case 'ecommerce': // 電商 (預留)
                 cardsHtml = `
                    <div class="stat-card"><h3>今日訂單</h3><p class="stat-value" id="stat-1">...</p></div>
                    <div class="stat-card"><h3>待處理出貨</h3><p class="stat-value" id="stat-2">...</p></div>
                    <div class="stat-card" style="grid-column: span 2;"><h3>本月營收</h3><p class="stat-value" id="stat-3">...</p></div>
                `;
                break;
            default:
                cardsHtml = '<p>未知的樣板類型，無法顯示儀表板。</p>';
        }
        container.innerHTML = `<div class="dashboard-grid">${cardsHtml}</div>`;

        // 在這裡呼叫 API 來填充 ... 的部分 (我們下一步會做)
    }

    // Placeholder 函式：載入並渲染列表
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
        // 在這裡呼叫 API 來填充列表 (我們下一步會做)
    }

    // Placeholder 函式：產生並開啟完整後台連結
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
            
            // 使用 liff.openWindow 在外部瀏覽器開啟
            liff.openWindow({
                url: result.link,
                external: true
            });

        } catch (error) {
            alert(`開啟失敗: ${error.message}`);
        } finally {
            btn.disabled = false;
            btn.textContent = '開啟完整版後台';
        }
    }


    // 啟動 App
    main();
});