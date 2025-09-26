// 這是一個全新的、絕對不會出錯的 script.js 檔案
console.log("新的 script.js 檔案開始執行！");
alert("如果您看到這個彈窗，代表部署成功了！");

// 為了確認 config.js 也被正確載入，我們來讀取裡面的值
try {
    const businessName = window.APP_CONFIG.TERMS.BUSINESS_NAME;
    console.log("成功讀取到店名:", businessName);
    document.getElementById('message').textContent = `部署成功！店名是：${businessName}`;
} catch (e) {
    console.error("讀取 config.js 失敗:", e);
    document.getElementById('message').textContent = "部署失敗：無法讀取 config.js。";
    alert("script.js 執行了，但讀取不到 config.js！");
}