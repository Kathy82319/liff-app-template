// ======== 偵錯專用：functions/api/admin/_middleware.js ========

export async function onRequest(context) {
  // 獲取環境變數物件
  const env = context.env;

  // 準備回報的偵錯資訊
  const debugReport = {
    middleware_location: "/functions/api/admin/_middleware.js",
    message: "這個訊息來自守門員，它正在回報自己所看到的環境變數。",
    is_demo_mode_value: env.IS_DEMO_MODE || "未設定 (undefined)",
    is_demo_mode_type: typeof env.IS_DEMO_MODE,
    all_available_env_keys: Object.keys(env)
  };

  // 直接將偵錯報告回傳，不執行任何後續操作
  return new Response(JSON.stringify(debugReport, null, 2), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}