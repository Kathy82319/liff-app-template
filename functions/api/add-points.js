// functions/api/add-points.js
// --- 【移除】不再需要 Google Sheets 和 jose ---
// import { GoogleSpreadsheet } from 'google-spreadsheet';
// import * as jose from 'jose';

// --- 【移除】Google Sheets 工具函式 ---
// async function getAccessToken(env) { ... }
// async function updateRowInSheet(env, sheetName, matchColumn, matchValue, updateData) { ... }
// async function syncSingleExpToSheet(env, expData) { ... }

export const onRequest = async (context) => {
    try {
        if (context.request.method !== 'POST') { //
            return new Response('Invalid request method.', { status: 405 }); //
        }
        const { userId, expValue, reason } = await context.request.json(); //
        const db = context.env.DB; //

        // --- (驗證邏輯不變) ---
        if (!userId || typeof userId !== 'string') { //
            return new Response(JSON.stringify({ error: '無效的使用者 ID。' }), { status: 400 }); //
        }
        const exp = Number(expValue); //
        if (isNaN(exp) || !Number.isInteger(exp) || exp <= 0 || exp > 1000) { //
            return new Response(JSON.stringify({ error: '積分值必須是 1 到 1000 之間的正整數。' }), { status: 400 }); //
        }
        if (!reason || typeof reason !== 'string' || reason.trim().length === 0 || reason.length > 100) { //
            return new Response(JSON.stringify({ error: '原因為必填，且長度不可超過 100 字。' }), { status: 400 }); //
        }

        const userStmt = db.prepare('SELECT level, current_exp FROM Users WHERE user_id = ?'); //
        let user = await userStmt.bind(userId).first(); //
        if (!user) { //
            return new Response(JSON.stringify({ error: `找不到使用者 ID: ${userId}` }), { status: 404 }); //
        }

        let currentLevel = user.level; //
        let currentExp = user.current_exp + exp; //
        const requiredExp = 10; //
        while (currentExp >= requiredExp) { //
            currentExp -= requiredExp; //
            currentLevel += 1; //
        }

        // --- (資料庫操作保持不變，更新 Users 和插入 Purchasehistory) ---
        await db.batch([ //
          db.prepare('UPDATE Users SET level = ?, current_exp = ? WHERE user_id = ?').bind(currentLevel, currentExp, userId), //
          db.prepare('INSERT INTO Purchasehistory (user_id, exp_added, reason) VALUES (?, ?, ?)').bind(userId, exp, reason) //
        ]);

        // --- 【移除】Google Sheets 同步 ---
        // context.waitUntil(syncSingleExpToSheet(...));
        // context.waitUntil(updateRowInSheet(...));

        return new Response(JSON.stringify({ //
            success: true, //
            message: `成功新增 ${exp} 點積分。`, //
            newLevel: currentLevel, //
            newExp: currentExp //
        }), {
          status: 200, //
          headers: { 'Content-Type': 'application/json' }, //
        });

    } catch (error) {
        console.error('Error in add-points API:', error); //
        // --- 【修改】回傳詳細錯誤 ---
        return new Response(JSON.stringify({ error: '伺服器內部錯誤，新增積分失敗。', details: error.message}), { status: 500, headers: { 'Content-Type': 'application/json' } }); //
    }
};