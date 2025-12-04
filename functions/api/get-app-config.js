// functions/api/get-app-config.js (v12.0 - 藍圖驅動版)

export async function onRequest(context) {
    try {
        const db = context.env.DB;
        
        // 從資料庫獲取所有設定
        const { results } = await db.prepare("SELECT key, value, type FROM AppSettings").all();

        if (!results) {
             return new Response(JSON.stringify({ error: '在資料庫中找不到應用程式設定。' }), { status: 404 });
        }

        const config = {
            FEATURES: {},
            TERMS: {},
            LOGIC: {},
            ENV: {
                LIFF_ID: context.env.LIFF_ID,
                OWNER_LIFF_ID: context.env.OWNER_LIFF_ID
            }
        };

        results.forEach(item => {
            let parsedValue;
            let targetObject = null;
            let subKey = null;

            const parts = item.key.split('_');
            const mainKey = parts[0]; 
            
            if (config.hasOwnProperty(mainKey) && parts.length > 1) {
                targetObject = config[mainKey];
                subKey = parts.slice(1).join('_');
            } else {
                 // 若 key 格式不符，暫時忽略
                 return; 
            }

            try {
                // 1. 優先根據資料庫 type 欄位判斷
                if (item.type === 'boolean') {
                    parsedValue = (item.value === 'true');
                } else if (item.type === 'number') {
                    parsedValue = Number(item.value);
                } 
                // 2. JSON 解析邏輯
                else if (item.type === 'json' || item.key === 'LOGIC_INDUSTRY_TEMPLATE_DEFINITIONS' || (item.value && (item.value.startsWith('{') || item.value.startsWith('[')))) {
                    parsedValue = JSON.parse(item.value);
                } 
                // 3. 字串
                else {
                    parsedValue = item.value;
                }
            } catch (e) {
                console.error(`Config parse error for ${item.key}:`, e);
                parsedValue = item.value; 
            }

            if (targetObject && subKey) {
                targetObject[subKey] = parsedValue;
            }
        });

        // 防呆：確保樣板定義是物件
        if (typeof config.LOGIC.INDUSTRY_TEMPLATE_DEFINITIONS !== 'object' || config.LOGIC.INDUSTRY_TEMPLATE_DEFINITIONS === null) {
            config.LOGIC.INDUSTRY_TEMPLATE_DEFINITIONS = {};
        }

        return new Response(JSON.stringify(config), {
            status: 200,
            headers: {
                'Content-Type': 'application/json',
                'Cache-Control': 'no-store, no-cache, must-revalidate', // 設定檔不快取
                'Pragma': 'no-cache',
                'Expires': '0'
            },
        });

    } catch (error) {
        console.error('get-app-config API Error:', error);
        return new Response(JSON.stringify({ error: '獲取設定失敗' }), { status: 500 });
    }
}