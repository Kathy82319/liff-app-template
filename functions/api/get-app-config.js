// functions/api/get-app-config.js (修正版 v2)

export async function onRequest(context) {
    try {
        const db = context.env.DB;
        const { results } = await db.prepare("SELECT key, value, type FROM AppSettings").all();

        if (!results) {
             return new Response(JSON.stringify({ error: '在資料庫中找不到應用程式設定。' }), { status: 404 });
        }

        const config = {
            FEATURES: {},
            TERMS: {},
            LOGIC: {} // 初始化 LOGIC 物件
        };

        // 儲存 LOGIC_INDUSTRY_TEMPLATE_DEFINITIONS 的原始值，稍後處理
        let templateDefinitionsString = null;

        results.forEach(item => {
            // --- 優先處理特殊鍵 ---
            if (item.key === 'LOGIC_INDUSTRY_TEMPLATE_DEFINITIONS') {
                templateDefinitionsString = item.value; // 先存起來
                return; // 跳過此 item 的一般處理
            }

            // --- 一般處理 ---
            let parsedValue;
            switch (item.type) {
                case 'boolean':
                    parsedValue = (item.value === 'true');
                    break;
                case 'number':
                    parsedValue = Number(item.value);
                    break;
                case 'json': // 處理其他可能是 JSON 的設定 (如果有的話)
                    try {
                        parsedValue = JSON.parse(item.value);
                    } catch (e) {
                        console.error(`解析 JSON 失敗 (key: ${item.key}):`, e);
                        parsedValue = item.value; // 解析失敗則保留原始字串
                    }
                    break;
                default:
                    parsedValue = item.value;
                    break;
            }

            const parts = item.key.split('_');
            const mainKey = parts[0]; // FEATURES, TERMS, LOGIC
            const subKey = parts.slice(1).join('_');

            // 確保目標物件存在
            if (!config[mainKey]) {
                config[mainKey] = {};
            }

            // 將解析後的值賦予對應的 key
            config[mainKey][subKey] = parsedValue;
        });

        // --- 在迴圈外，獨立處理 LOGIC_INDUSTRY_TEMPLATE_DEFINITIONS ---
        if (templateDefinitionsString) {
            try {
                config.LOGIC.INDUSTRY_TEMPLATE_DEFINITIONS = JSON.parse(templateDefinitionsString);
                // 確保 INDUSTRY_TEMPLATE_DEFINITIONS 至少是個空物件
                if (typeof config.LOGIC.INDUSTRY_TEMPLATE_DEFINITIONS !== 'object' || config.LOGIC.INDUSTRY_TEMPLATE_DEFINITIONS === null) {
                   config.LOGIC.INDUSTRY_TEMPLATE_DEFINITIONS = {};
                }
            } catch (e) {
                console.error(`解析 LOGIC_INDUSTRY_TEMPLATE_DEFINITIONS 失敗:`, e);
                config.LOGIC.INDUSTRY_TEMPLATE_DEFINITIONS = {}; // 解析失敗給一個空物件
            }
        } else {
            // 如果資料庫根本沒有這個 key，也給一個空物件
            config.LOGIC.INDUSTRY_TEMPLATE_DEFINITIONS = {};
        }

        // --- 回傳最終組合好的 config 物件 ---
        return new Response(JSON.stringify(config), {
            status: 200,
            headers: {
                'Content-Type': 'application/json'
                // 已移除 Cache-Control
            },
        });

    } catch (error) {
        console.error('Error in get-app-config API:', error);
        return new Response(JSON.stringify({ error: '獲取應用程式設定時發生錯誤。' }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' },
        });
    }
}