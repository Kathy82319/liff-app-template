// functions/test-db.js

export const onRequest = async (context) => {
  try {
    // 檢查 env 和 DB 綁定是否存在
    if (!context.env || !context.env.DB) {
      throw new Error("D1 Database binding (DB) not found in context.env.");
    }
    
    const db = context.env.DB;
    
    // 執行一個最簡單、絕對不會出錯的查詢
    const stmt = db.prepare("SELECT name FROM sqlite_schema WHERE type='table'");
    const { results } = await stmt.all();

    // 如果成功，回傳一個成功的 JSON 物件，內容是您資料庫中所有的資料表名稱
    return new Response(JSON.stringify({
      success: true,
      message: "Database connection is successful!",
      tables: results.map(t => t.name)
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });

  } catch (error) {
    // 如果失敗，回傳一個包含詳細錯誤訊息的 JSON
    console.error("Error in test-db function:", error);
    return new Response(JSON.stringify({
      success: false,
      message: "Database connection failed.",
      error: error.message,
      stack: error.stack, // 包含堆疊追蹤以便偵錯
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};