// functions/api/get-store-info.js

// 預設的政策內容 (如果資料庫是空的)
const DEFAULT_POLICY_JSON = JSON.stringify({
    cancellationPolicy: "請在此編輯取消政策...\n例如：\n- 入住日 7 天前取消，全額退款。\n- 入住日 7 天內取消，收取第一晚費用。",
    checkInInstructions: "請在此編輯入住須知...\n例如：\n- 入住時間：15:00 ~ 20:00\n- 退房時間：11:00 前"
});

export const onRequest = async (context) => {
  try {
    if (context.request.method !== 'GET') {
      return new Response('Invalid request method.', { status: 405 });
    }

    const db = context.env.DB;
    
    // 1. 獲取店家基本資訊
    const info = await db.prepare('SELECT * FROM StoreInfo WHERE id = 1').first();

    // 2. 獲取政策內容 (Draft ID 1)
    const policyDraft = await db.prepare('SELECT content FROM MessageDrafts WHERE draft_id = 1').first();
    
    let policyData = {};
    try {
        const contentStr = policyDraft ? policyDraft.content : DEFAULT_POLICY_JSON;
        policyData = JSON.parse(contentStr);
    } catch (e) {
        console.error("解析政策 JSON 失敗:", e);
        // 發生錯誤時使用預設結構
        policyData = { cancellationPolicy: "", checkInInstructions: "" };
    }

    // 3. 合併回傳
    const responseData = {
        ...(info || {}),
        cancellationPolicy: policyData.cancellationPolicy || '',
        checkInInstructions: policyData.checkInInstructions || ''
    };

    if (!info) {
       // 如果完全沒有 info，至少回傳 200 和空物件結構，避免前端炸掉
       // 但通常應該要有，這裡保留原本的 404 邏輯也可以，視需求而定
       // 這裡選擇回傳預設結構
    }

    return new Response(JSON.stringify(responseData), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error in get-store-info API:', error);
    return new Response(JSON.stringify({ error: '獲取店家資訊時發生內部錯誤。' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};