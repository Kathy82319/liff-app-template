// functions/test-db.js

export const onRequest = async (context) => {
  try {
    // 檢查 env 和 DB 綁定是否存在
    if (!context.env || !context.env.DB) {
      throw new Error("D1 Database binding (DB) not found in context.env.");
    }
    
    const db = context.env.DB;
    
    // 執行兩個查詢：一個查所有資料表，另一個查 Bookings 的內容
    const tablesStmt = db.prepare("SELECT name FROM sqlite_schema WHERE type='table'");
    const bookingsStmt = db.prepare("SELECT * FROM Bookings LIMIT 15");

    // 使用 batch 一次執行
    const [tablesResult, bookingsResult] = await db.batch([
        tablesStmt,
        bookingsStmt
    ]);

    // 如果成功，回傳一個包含所有資料的 JSON 物件
    return new Response(JSON.stringify({
      success: true,
      message: "Database connection is successful!",
      tables: tablesResult.results.map(t => t.name),
      bookings_data: bookingsResult.results 
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
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};