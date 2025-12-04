/**
 * GET /api/admin/get-templates
 * 從 AppSettings 表中讀取 LOGIC_INDUSTRY_TEMPLATE_DEFINITIONS
 */
export async function onRequestGet(context) {
  try {
    const db = context.env.DB; // 確保您的 D1 綁定名稱是 DB

    // 從資料庫查詢
    const stmt = await db.prepare("SELECT value FROM AppSettings WHERE key = ?");
    const result = await stmt.bind('LOGIC_INDUSTRY_TEMPLATE_DEFINITIONS').first();

    if (!result || !result.value) {
      return new Response(JSON.stringify({ error: "找不到樣板定義，請確認資料庫是否已初始化" }), {
        status: 404,
        headers: { "Content-Type": "application/json" }
      });
    }

    // 資料庫存的是字串，直接回傳 JSON 格式
    const definitions = JSON.parse(result.value);

    return new Response(JSON.stringify(definitions), {
      headers: { "Content-Type": "application/json" }
    });

  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
}