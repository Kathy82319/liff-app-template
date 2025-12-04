// functions/api/get-app-config.js (修正版 v4 - 通用 JSON 解析)

export async function onRequest(context) {
    try {
        const db = context.env.DB;
        console.log("[get-app-config v4] Fetching settings..."); // 標記版本
        // 從資料庫獲取所有設定，包含 type 欄位
        const { results } = await db.prepare("SELECT key, value, type FROM AppSettings").all();

        if (!results) {
             console.error("[get-app-config v4] No settings found.");
             return new Response(JSON.stringify({ error: '在資料庫中找不到應用程式設定。' }), { status: 404 });
        }

        const config = {
            FEATURES: {},
            TERMS: {},
            LOGIC: {},
            // 【新增】ENV 區塊，將環境變數傳給前端
            ENV: {
                LIFF_ID: context.env.LIFF_ID,
                OWNER_LIFF_ID: context.env.OWNER_LIFF_ID
            }
        };

        results.forEach(item => {
            let parsedValue;
            let targetObject = null;
            let subKey = null;

            // 拆分 key
            const parts = item.key.split('_');
            const mainKey = parts[0]; // FEATURES, TERMS, LOGIC
            if (config.hasOwnProperty(mainKey) && parts.length > 1) {
                targetObject = config[mainKey];
                subKey = parts.slice(1).join('_');
            } else {
                 console.warn(`[get-app-config v4] Skipping setting with invalid key structure: ${item.key}`);
                 return; // 跳過格式不符的 key
            }

            // --- ****** 核心修改：通用解析邏輯 ****** ---
            try {
                // 1. 優先根據資料庫 type 欄位判斷
                if (item.type === 'boolean') {
                    parsedValue = (item.value === 'true');
                } else if (item.type === 'number') {
                    parsedValue = Number(item.value);
                // 2. 如果 type 是 'json'，或者 key 指明是樣板定義，或者值看起來像 JSON，則嘗試解析
                } else if (item.type === 'json' || item.key === 'LOGIC_INDUSTRY_TEMPLATE_DEFINITIONS' || (item.value && (item.value.startsWith('{') || item.value.startsWith('[')))) {
                    parsedValue = JSON.parse(item.value);
                    console.log(`[get-app-config v4] Parsed JSON for key: ${item.key}`);
                }
                // 3. 否則視為普通字串
                else {
                    parsedValue = item.value;
                }
            } catch (e) {
                // 解析失敗，可能是格式錯誤或非預期的 JSON
                console.error(`[get-app-config v4] Failed to parse value for key: ${item.key}. Error: ${e.message}. Using raw value.`);
                parsedValue = item.value; // 保留原始字串值，避免程式崩潰
            }
            // --- ****** 修改結束 ****** ---


            // 將解析後的值存入 config 物件
            if (targetObject && subKey) {
                targetObject[subKey] = parsedValue;
            }
        });

        // --- 確保 LOGIC.INDUSTRY_TEMPLATE_DEFINITIONS 至少是空物件 (以防萬一) ---
        if (typeof config.LOGIC.INDUSTRY_TEMPLATE_DEFINITIONS !== 'object' || config.LOGIC.INDUSTRY_TEMPLATE_DEFINITIONS === null) {
            console.warn("[get-app-config v4] INDUSTRY_TEMPLATE_DEFINITIONS was not a valid object after processing. Setting to empty object.");
            config.LOGIC.INDUSTRY_TEMPLATE_DEFINITIONS = {};
        }
        // --- 同理，確保 LOGIC.PRODUCT_FILTERS 是陣列或 undefined ---
         if (config.LOGIC.PRODUCT_FILTERS && !Array.isArray(config.LOGIC.PRODUCT_FILTERS)) {
             console.warn("[get-app-config v4] PRODUCT_FILTERS was not an array after processing. Setting to empty array.");
             // 如果解析後不是陣列 (例如解析失敗保留了字串)，給一個空陣列避免前端出錯
             config.LOGIC.PRODUCT_FILTERS = [];
         }


        console.log("[get-app-config v4] Final config object being sent:", JSON.stringify(config, null, 2));

        return new Response(JSON.stringify(config), {
            status: 200,
            headers: {
                'Content-Type': 'application/json',
                // --- ▼▼▼ 請在這裡加入以下三行 ▼▼▼ ---
                'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
                'Pragma': 'no-cache',
                'Expires': '0'
                // --- ▲▲▲ 加入結束 ▲▲▲ ---
            },
        });

    } catch (error) {
        console.error('[get-app-config v4] Error:', error);
        return new Response(JSON.stringify({ error: '獲取應用程式設定時發生錯誤。' }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' },
        });
    }
}