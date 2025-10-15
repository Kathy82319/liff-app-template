// functions/api/admin/update-settings.js (修正後)
export async function onRequest(context) {
  try {
    if (context.request.method !== 'POST') {
      return new Response('Invalid request method.', { status: 405 });
    }

    const settings = await context.request.json();

    if (!Array.isArray(settings)) {
        return new Response(JSON.stringify({ error: '無效的資料格式，預期應為一個陣列。' }), { status: 400 });
    }

    const MAX_KEY_LENGTH = 100;
    // 【核心修正】將最大長度限制從 5000 提升到 20000
    const MAX_VALUE_LENGTH = 20000; 

    for (const setting of settings) {
        if (typeof setting.key !== 'string' || typeof setting.value === 'undefined') {
            throw new Error('陣列中的每個設定物件都必須包含 key 和 value。');
        }
        if (setting.key.length === 0 || setting.key.length > MAX_KEY_LENGTH) {
            return new Response(JSON.stringify({ error: `設定的鍵(key)長度無效: ${setting.key}` }), { status: 400 });
        }
        
        // 確保 value 在轉換為字串後進行長度檢查
        const valueStr = (typeof setting.value === 'object' && setting.value !== null) 
            ? JSON.stringify(setting.value) 
            : String(setting.value);

        if (valueStr.length > MAX_VALUE_LENGTH) {
            return new Response(JSON.stringify({ error: `設定的值(value)過長 (key: ${setting.key})` }), { status: 400 });
        }
    }

    const db = context.env.DB;
    const stmt = db.prepare('UPDATE AppSettings SET value = ? WHERE key = ?');

    const operations = settings.map(setting => {
        const valueToStore = (typeof setting.value === 'object' && setting.value !== null) 
            ? JSON.stringify(setting.value) 
            : String(setting.value);
        return stmt.bind(valueToStore, setting.key);
    });

    await db.batch(operations);

    return new Response(JSON.stringify({ success: true, message: '系統設定已成功更新！' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error in update-settings API:', error);
    return new Response(JSON.stringify({ error: '更新系統設定失敗。', details: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}