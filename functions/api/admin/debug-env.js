// ======== 偵錯專用：functions/api/admin/debug-env.js ========

export async function onRequest(context) {
  // 獲取環境變數物件
  const env = context.env;

  // 為了安全起見，我們不直接回傳整個 env 物件，
  // 因為裡面可能包含敏感金鑰 (雖然這次是為了偵錯)。
  // 我們建立一個安全的物件來回傳。
  const debugInfo = {
    message: "這是在 Cloudflare 伺服器上實際讀取到的環境變數。",
    // 檢查 IS_DEMO_MODE 是否存在，並回傳其值
    IS_DEMO_MODE: env.IS_DEMO_MODE || "未設定 (undefined)",
    // 檢查 JWT_SECRET 是否存在，這有助於確認其他變數是否正常
    HAS_JWT_SECRET: !!env.JWT_SECRET,
    // 檢查 Google 相關金鑰是否存在
    HAS_GOOGLE_PRIVATE_KEY: !!env.GOOGLE_PRIVATE_KEY,
    // 列出所有可見的環境變數的"名稱" (key)，但不顯示它們的"值" (value)
    // 這樣可以在不洩漏金鑰的情況下，確認變數是否被載入
    available_env_keys: Object.keys(env),
  };

  // 將偵錯資訊以 JSON 格式回傳
  return new Response(JSON.stringify(debugInfo, null, 2), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}