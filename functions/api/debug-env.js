// functions/api/debug-env.js

export async function onRequest(context) {
  // 準備一個物件來存放我們要回傳的偵錯資訊
  const debugInfo = {
    // 1. 檢查 context.env 中所有的 key
    // 這會告訴我們有哪些環境變數和綁定被成功注入
    availableEnvKeys: Object.keys(context.env),

    // 2. 檢查 'DB' 綁定的類型
    // 如果是 'object'，代表綁定成功。如果是 'undefined'，代表失敗。
    typeofDB: typeof context.env.DB,

    // 3. 嘗試列出 'DB' 物件上的方法 (如果它存在的話)
    // 一個正常的 D1 綁定物件應該會有 'prepare', 'exec', 'batch' 等方法
    dbMethods: (typeof context.env.DB === 'object' && context.env.DB !== null)
      ? Object.keys(context.env.DB)
      : "DB binding is not an object.",

    // 4. 顯示所有非密鑰的環境變數，方便檢查
    // (注意：為了安全，密鑰(Secrets)的值不會被顯示)
    env: { ...context.env }
  };

  // 為了安全起見，從回傳的 env 物件中刪除敏感資訊
  // 雖然 Secrets 預設不會顯示，但多一層保護更好
  delete debugInfo.env.GOOGLE_PRIVATE_KEY;
  delete debugInfo.env.JWT_SECRET;
  delete debugInfo.env.LINE_CHANNEL_ACCESS_TOKEN;
  delete debugInfo.env.ADMIN_PASSWORD;

  // 將偵錯資訊以 JSON 格式回傳
  return new Response(JSON.stringify(debugInfo, null, 2), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}