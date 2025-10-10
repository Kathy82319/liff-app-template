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
            switch (item.type) {
                case 'boolean': parsedValue = (item.value === 'true'); break;
                case 'number': parsedValue = Number(item.value); break;
                case 'json':
                    try { parsedValue = JSON.parse(item.value); } catch (e) { parsedValue = {}; }
                    break;
                default: parsedValue = item.value; break;
            }

            const parts = item.key.split('_');
            const mainKey = parts[0]; 
            const subKey = parts.slice(1).join('_');

            if (mainKey === 'FEATURES') config.FEATURES[subKey] = parsedValue;
            else if (mainKey === 'TERMS') config.TERMS[subKey] = parsedValue;
            else if (mainKey === 'LOGIC') config.LOGIC[subKey] = parsedValue;
        });

        return new Response(JSON.stringify(config), {
            status: 200,
            headers: { 
                'Content-Type': 'application/json',
                // 【還原】將 Cache-Control 改回正式環境的設定
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