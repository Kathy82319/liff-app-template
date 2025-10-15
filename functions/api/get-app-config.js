// functions/api/get-app-config.js (修改後)

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
            LOGIC: {}
        };

        results.forEach(item => {
            let parsedValue;
            switch (item.type) {
                case 'boolean': 
                    parsedValue = (item.value === 'true'); 
                    break;
                case 'number': 
                    parsedValue = Number(item.value); 
                    break;
                case 'json':
                    try { 
                        parsedValue = JSON.parse(item.value); 
                    } catch (e) { 
                        console.error(`解析 JSON 失敗 (key: ${item.key}):`, e);
                        parsedValue = {}; 
                    }
                    break;
                default: 
                    parsedValue = item.value; 
                    break;
            }

            const parts = item.key.split('_');
            const mainKey = parts[0]; 
            const subKey = parts.slice(1).join('_');

            if (config[mainKey]) {
                config[mainKey][subKey] = parsedValue;
            }
        });

        // 【核心修改】確保 LOGIC.INDUSTRY_TEMPLATE_DEFINITIONS 存在且為物件
        // 這樣即使資料庫中沒有這個設定，前端也不會出錯。
        if (!config.LOGIC.INDUSTRY_TEMPLATE_DEFINITIONS || typeof config.LOGIC.INDUSTRY_TEMPLATE_DEFINITIONS !== 'object') {
            config.LOGIC.INDUSTRY_TEMPLATE_DEFINITIONS = {};
        }

        return new Response(JSON.stringify(config), {
            status: 200,
            headers: { 
                'Content-Type': 'application/json',
                'Cache-Control': 'public, max-age=60'
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