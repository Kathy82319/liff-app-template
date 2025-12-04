// functions/api/get-app-config.js

export async function onRequestGet(context) {
  const db = context.env.DB;

  try {
    // 1. 擴充查詢範圍：加入 LOGIC 相關的 Key
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

    // 2. 將結果轉換為 Map 以便存取
    const settingsMap = {};
    if (results) {
        results.forEach(row => {
            settingsMap[row.key] = row.value;
        });
    }

    // 3. 解析 JSON 資料 (加入防呆機制)
    const clientConfig = settingsMap['client_config'] ? JSON.parse(settingsMap['client_config']) : {};
    const termsConfig = settingsMap['terms_config'] ? JSON.parse(settingsMap['terms_config']) : {};
    
    // 【關鍵修正】建構 LOGIC 物件，滿足 app.js 的檢查需求
    const logicConfig = {
        ACTIVE_INDUSTRY_TEMPLATE: settingsMap['LOGIC_ACTIVE_INDUSTRY_TEMPLATE'] || settingsMap['active_template_id'] || 'unknown',
        INDUSTRY_TEMPLATE_DEFINITIONS: settingsMap['LOGIC_INDUSTRY_TEMPLATE_DEFINITIONS'] ? JSON.parse(settingsMap['LOGIC_INDUSTRY_TEMPLATE_DEFINITIONS']) : {}
    };

    // 4. 組裝回傳結構
    const responseData = {
      client_config: clientConfig,
      terms: termsConfig,
      LOGIC: logicConfig, // <--- 這裡補上了前端需要的 LOGIC 區塊
      meta: {
        template_id: logicConfig.ACTIVE_INDUSTRY_TEMPLATE,
        version: 'v12.0'
      }
    };

    return new Response(JSON.stringify(responseData), {
      headers: { 
        "Content-Type": "application/json",
        "Cache-Control": "public, max-age=60" // 簡單快取
      }
    });

  } catch (err) {
    console.error("[get-app-config] Error:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
}