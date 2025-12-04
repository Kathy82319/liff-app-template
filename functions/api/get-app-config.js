/**
 * GET /api/get-app-config
 * v12.1 - 讀取客戶端設定 + 環境變數 (ENV) + 邏輯設定 (LOGIC)
 */
export async function onRequestGet(context) {
  const { env } = context; // 這裡可以取得環境變數 (如 LIFF_ID)
  const db = env.DB;

  try {
    // 1. 查詢設定 (包含 LOGIC 相關 Key)
    const stmt = await db.prepare(`
      SELECT key, value 
      FROM AppSettings 
      WHERE key IN (
        'client_config', 
        'terms_config', 
        'active_template_id',
        'LOGIC_ACTIVE_INDUSTRY_TEMPLATE',
        'LOGIC_INDUSTRY_TEMPLATE_DEFINITIONS'
      )
    `);
    const { results } = await stmt.all();

    // 2. 將結果轉換為 Map
    const settingsMap = {};
    if (results) {
        results.forEach(row => {
            settingsMap[row.key] = row.value;
        });
    }

    // 3. 解析 JSON
    const clientConfig = settingsMap['client_config'] ? JSON.parse(settingsMap['client_config']) : {};
    const termsConfig = settingsMap['terms_config'] ? JSON.parse(settingsMap['terms_config']) : {};
    
    // 建構 LOGIC 物件 (這是您上一步修正的重點)
    const logicConfig = {
        ACTIVE_INDUSTRY_TEMPLATE: settingsMap['LOGIC_ACTIVE_INDUSTRY_TEMPLATE'] || settingsMap['active_template_id'] || 'unknown',
        INDUSTRY_TEMPLATE_DEFINITIONS: settingsMap['LOGIC_INDUSTRY_TEMPLATE_DEFINITIONS'] ? JSON.parse(settingsMap['LOGIC_INDUSTRY_TEMPLATE_DEFINITIONS']) : {}
    };

    // 4. 組裝回傳結構 (【關鍵修正】：加入 ENV 區塊)
    const responseData = {
      client_config: clientConfig,
      terms: termsConfig,
      LOGIC: logicConfig,
      ENV: {
        LIFF_ID: env.LIFF_ID,             // 將環境變數傳給前端
        OWNER_LIFF_ID: env.OWNER_LIFF_ID  // 同時傳送老闆端 ID (若有)
      },
      meta: {
        template_id: logicConfig.ACTIVE_INDUSTRY_TEMPLATE,
        version: 'v12.2'
      }
    };

    return new Response(JSON.stringify(responseData), {
      headers: { 
        "Content-Type": "application/json",
        // 【關鍵修正】原本是 public, max-age=60，導致 1 分鐘延遲
        // 改成 no-store，強迫瀏覽器每次都要拿最新資料
        "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
        "Pragma": "no-cache",
        "Expires": "0"
      }
    });

  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
}