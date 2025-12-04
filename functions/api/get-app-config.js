/**
 * GET /api/get-app-config
 * v12.0 - 讀取客戶端專用的設定 (Client Config + Terms)
 */
export async function onRequestGet(context) {
  const db = context.env.DB;

  try {
    // 1. 一次查詢需要的設定 Key
    const stmt = await db.prepare(`
      SELECT key, value 
      FROM AppSettings 
      WHERE key IN ('client_config', 'terms_config', 'active_template_id')
    `);
    const { results } = await stmt.all();

    // 2. 將結果轉換為物件 map
    const settingsMap = {};
    if (results) {
        results.forEach(row => {
            settingsMap[row.key] = row.value;
        });
    }

    // 3. 解析 JSON (若資料庫無資料，給予空物件防爆)
    const clientConfig = settingsMap['client_config'] ? JSON.parse(settingsMap['client_config']) : {};
    const termsConfig = settingsMap['terms_config'] ? JSON.parse(settingsMap['terms_config']) : {};
    const activeTemplateId = settingsMap['active_template_id'] || 'unknown';

    // 4. 組裝回傳結構 (符合 v12.0 前端需求)
    const responseData = {
      client_config: clientConfig,
      terms: termsConfig,
      meta: {
        template_id: activeTemplateId,
        version: 'v12.0'
      }
    };

    return new Response(JSON.stringify(responseData), {
      headers: { 
        "Content-Type": "application/json",
        "Cache-Control": "public, max-age=60" // 簡單快取 60秒
      }
    });

  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
}