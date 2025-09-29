// functions/api/get-app-config.js
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
            let parsedValue = item.value;
            // 根據資料庫中的 type 欄位來解析數值
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
                        console.error(`無法解析 JSON 設定 (key: ${item.key}):`, e);
                        parsedValue = {}; // 解析失敗時給予預設空物件
                    }
                    break;
                // 'string' or default
                default:
                    parsedValue = item.value;
                    break;
            }

            // 將 flat key (例如 FEATURES_ENABLE_MEMBERSHIP_SYSTEM) 轉換為巢狀物件
            const parts = item.key.split('_');
            const mainKey = parts[0]; // FEATURES, TERMS, or LOGIC
            const subKey = parts.slice(1).join('_'); // ENABLE_MEMBERSHIP_SYSTEM

            if (mainKey === 'FEATURES') {
                config.FEATURES[subKey] = parsedValue;
            } else if (mainKey === 'TERMS') {
                config.TERMS[subKey] = parsedValue;
            } else if (mainKey === 'LOGIC') {
                config.LOGIC[subKey] = parsedValue;
            }
        });

        return new Response(JSON.stringify(config), {
            status: 200,
            headers: { 
                'Content-Type': 'application/json',
                // 增加快取，減少資料庫讀取
                'Cache-Control': 'public, max-age=60' // 快取 1 分鐘
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