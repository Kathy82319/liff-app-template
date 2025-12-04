// functions/api/get-app-config.js (v12.0 Final - 支援 JSON 解析與原子化設定)

export async function onRequest(context) {
    try {
        const db = context.env.DB;
        console.log("[get-app-config] Fetching settings...");

        // 從資料庫獲取所有設定，包含 type 欄位
        // 這裡會讀取我們剛存入的 LOGIC_INDUSTRY_TEMPLATE_DEFINITIONS
        const { results } = await db.prepare("SELECT key, value, type FROM AppSettings").all();

        if (!results) {
             console.error("[get-app-config] No settings found.");
             // 若無設定，回傳空結構以免前端崩潰
             return new Response(JSON.stringify({ 
                 FEATURES: {}, TERMS: {}, LOGIC: {}, ENV: {} 
             }), { status: 200 });
        }

        const config = {
            FEATURES: {},
            TERMS: {},
            LOGIC: {},
            // 將必要的環境變數傳給前端 (如 LIFF ID)
            ENV: {
                LIFF_ID: context.env.LIFF_ID,
                OWNER_LIFF_ID: context.env.OWNER_LIFF_ID
            }
        };

        results.forEach(item => {
            let parsedValue;
            let targetObject = null;
            let subKey = null;

            // 1. 拆分 Key (例如 "LOGIC_ACTIVE_TEMPLATE" -> mainKey="LOGIC", subKey="ACTIVE_TEMPLATE")
            const parts = item.key.split('_');
            const mainKey = parts[0]; 
            
            if (config.hasOwnProperty(mainKey) && parts.length > 1) {
                targetObject = config[mainKey];
                subKey = parts.slice(1).join('_');
            } else {
                 // 若 Key 格式不符 (例如沒有底線)，則略過或視情況處理
                 return;
            }

            // 2. 解析值 (Value Parsing)
            try {
                // A. 布林值
                if (item.type === 'boolean') {
                    parsedValue = (item.value === 'true');
                } 
                // B. 數字
                else if (item.type === 'number') {
                    parsedValue = Number(item.value);
                } 
                // C. JSON 物件 (這是我們這次升級的關鍵！)
                // 如果 type 是 json，或者 key 是特定的大型設定檔，就執行 JSON.parse
                else if (item.type === 'json' || item.key === 'LOGIC_INDUSTRY_TEMPLATE_DEFINITIONS' || (item.value && (item.value.startsWith('{') || item.value.startsWith('[')))) {
                    parsedValue = JSON.parse(item.value);
                } 
                // D. 一般字串
                else {
                    parsedValue = item.value;
                }
            } catch (e) {
                console.error(`[get-app-config] Parse error for key: ${item.key}. Using raw value.`, e);
                parsedValue = item.value; // 解析失敗時，保留原始字串以免程式崩潰
            }

            // 3. 存入 Config 物件
            if (targetObject && subKey) {
                targetObject[subKey] = parsedValue;
            }
        });

        // --- 防呆處理：確保重要結構存在 ---
        if (typeof config.LOGIC.INDUSTRY_TEMPLATE_DEFINITIONS !== 'object' || config.LOGIC.INDUSTRY_TEMPLATE_DEFINITIONS === null) {
            console.warn("[get-app-config] Template Definitions missing. Setting default empty object.");
            config.LOGIC.INDUSTRY_TEMPLATE_DEFINITIONS = {};
        }

        // 回傳設定給前端
        return new Response(JSON.stringify(config), {
            status: 200,
            headers: {
                'Content-Type': 'application/json',
                // --- 關鍵設定：強制不快取 ---
                // 這是為了避免「後台剛改設定，前端卻還是舊邏輯」的問題
                'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
                'Pragma': 'no-cache',
                'Expires': '0'
            },
        });

    } catch (error) {
        console.error('[get-app-config] Critical Error:', error);
        return new Response(JSON.stringify({ error: '獲取應用程式設定時發生嚴重錯誤。' }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' },
        });
    }
}