// functions/api/set-class.js

export async function onRequest(context) {
    try {
        if (context.request.method !== 'POST') {
            return new Response('Invalid request method.', { status: 405 });
        }

        const { userId, className } = await context.request.json();
        const ALLOWED_CLASSES = ['戰士', '盜賊', '法師', '牧師'];

        if (!userId || !className || !ALLOWED_CLASSES.includes(className)) {
            return new Response(JSON.stringify({ error: '無效的使用者 ID 或職業名稱。' }), { status: 400 });
        }

        const db = context.env.DB;
        
        // ** 安全性檢查：只允許等級 >= 5 且目前職業為 '無' 的使用者更新 **
        const stmt = db.prepare(
            "UPDATE Users SET class = ? WHERE user_id = ? AND level >= 5 AND class = '無'"
        );
        const result = await stmt.bind(className, userId).run();

        if (result.meta.changes === 0) {
            return new Response(JSON.stringify({ error: '不符合職業選擇資格或已選擇過職業。' }), { status: 403 });
        }

        return new Response(JSON.stringify({ success: true, message: `成功選擇職業：${className}` }), { status: 200 });

    } catch (error) {
        console.error('Error in set-class API:', error);
        return new Response(JSON.stringify({ error: '選擇職業失敗。' }), { status: 500 });
    }
}