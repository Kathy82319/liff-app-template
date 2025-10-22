// functions/api/get-app-config.js (修正版 v3 - 簡化合併邏輯)

export async function onRequest(context) {
    try {
        const db = context.env.DB;
        console.log("[get-app-config v3] Fetching settings..."); // 標記版本
        const { results } = await db.prepare("SELECT key, value, type FROM AppSettings").all();

        if (!results) {
             console.error("[get-app-config v3] No settings found.");
             return new Response(JSON.stringify({ error: '在資料庫中找不到應用程式設定。' }), { status: 404 });
        }

        const config = {
            FEATURES: {},
            TERMS: {},
            LOGIC: {} // 確保 LOGIC 物件已初始化
        };

        // --- 步驟 1: 先處理所有非 JSON 和非樣板定義的設定 ---
        results.forEach(item => {
            // 跳過樣板定義 JSON 字串，稍後處理
            if (item.key === 'LOGIC_INDUSTRY_TEMPLATE_DEFINITIONS') {
                return;
            }

            let parsedValue;
            switch (item.type) {
                case 'boolean':
                    parsedValue = (item.value === 'true');
                    break;
                case 'number':
                    parsedValue = Number(item.value);
                    break;
                // 注意：這裡暫不處理 type='json'，除非您確定除了樣板定義外還有其他 JSON 設定
                default:
                    parsedValue = item.value;
                    break;
            }

            const parts = item.key.split('_');
            const mainKey = parts[0]; // FEATURES, TERMS, LOGIC
            const subKey = parts.slice(1).join('_');

            if (config[mainKey] && subKey) { // 確保 mainKey 存在且 subKey 不是空的
                config[mainKey][subKey] = parsedValue;
            } else {
                 console.warn(`[get-app-config v3] Skipping setting with invalid key structure: ${item.key}`);
            }
        });
        console.log("[get-app-config v3] Initial config structure (before templates):", JSON.stringify(config, null, 2));

        // --- 步驟 2: 獨立處理樣板定義 ---
        const templateDefinitionsItem = results.find(item => item.key === 'LOGIC_INDUSTRY_TEMPLATE_DEFINITIONS');

        if (templateDefinitionsItem && templateDefinitionsItem.value) {
            try {
                console.log("[get-app-config v3] Parsing LOGIC_INDUSTRY_TEMPLATE_DEFINITIONS...");
                const parsedDefinitions = JSON.parse(templateDefinitionsItem.value);

                // **直接賦值給 config.LOGIC.INDUSTRY_TEMPLATE_DEFINITIONS**
                config.LOGIC.INDUSTRY_TEMPLATE_DEFINITIONS = parsedDefinitions;
                 console.log("[get-app-config v3] Successfully parsed and assigned INDUSTRY_TEMPLATE_DEFINITIONS.");

                 // 添加更詳細的後端檢查
                 const activeKey = config.LOGIC.ACTIVE_INDUSTRY_TEMPLATE;
                 if (activeKey && config.LOGIC.INDUSTRY_TEMPLATE_DEFINITIONS[activeKey]) {
                     const checkTemplate = config.LOGIC.INDUSTRY_TEMPLATE_DEFINITIONS[activeKey];
                     console.log(`[get-app-config v3] Backend check for ${activeKey}: adminColumns exists?`, checkTemplate.hasOwnProperty('adminColumns'));
                     console.log(`[get-app-config v3] Backend check for ${activeKey}: adminColumns is Array?`, Array.isArray(checkTemplate.adminColumns));
                 } else {
                     console.warn(`[get-app-config v3] Backend check: Active template key "${activeKey}" not found in definitions.`);
                 }


            } catch (e) {
                console.error("[get-app-config v3] Failed to parse LOGIC_INDUSTRY_TEMPLATE_DEFINITIONS:", e);
                config.LOGIC.INDUSTRY_TEMPLATE_DEFINITIONS = {}; // 解析失敗給空物件
            }
        } else {
            console.warn("[get-app-config v3] LOGIC_INDUSTRY_TEMPLATE_DEFINITIONS not found in DB results.");
            config.LOGIC.INDUSTRY_TEMPLATE_DEFINITIONS = {}; // 資料庫沒設定也給空物件
        }

        // --- 步驟 3: 確保 LOGIC.INDUSTRY_TEMPLATE_DEFINITIONS 至少是空物件 ---
        if (typeof config.LOGIC.INDUSTRY_TEMPLATE_DEFINITIONS !== 'object' || config.LOGIC.INDUSTRY_TEMPLATE_DEFINITIONS === null) {
            config.LOGIC.INDUSTRY_TEMPLATE_DEFINITIONS = {};
        }

        console.log("[get-app-config v3] Final config object being sent:", JSON.stringify(config, null, 2));

        return new Response(JSON.stringify(config), {
            status: 200,
            headers: {
                'Content-Type': 'application/json'
            },
        });

    } catch (error) {
        console.error('[get-app-config v3] Error:', error);
        return new Response(JSON.stringify({ error: '獲取應用程式設定時發生錯誤。' }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' },
        });
    }
}