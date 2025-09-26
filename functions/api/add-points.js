// functions/api/add-exp.js
import { GoogleSpreadsheet } from 'google-spreadsheet';
import * as jose from 'jose';

// ** START: 關鍵修正 - 複製 updateRowInSheet 函式過來 **
// 我們需要這個函式來更新使用者列表
async function getAccessToken(env) {
    const { GOOGLE_SERVICE_ACCOUNT_EMAIL, GOOGLE_PRIVATE_KEY } = env;
    if (!GOOGLE_SERVICE_ACCOUNT_EMAIL || !GOOGLE_PRIVATE_KEY) throw new Error('缺少 Google 服務帳號的環境變數。');
    const privateKey = await jose.importPKCS8(GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n'), 'RS256');
    const jwt = await new jose.SignJWT({ scope: 'https://www.googleapis.com/auth/spreadsheets' })
      .setProtectedHeader({ alg: 'RS256', typ: 'JWT' }).setIssuer(GOOGLE_SERVICE_ACCOUNT_EMAIL)
      .setAudience('https://oauth2.googleapis.com/token').setSubject(GOOGLE_SERVICE_ACCOUNT_EMAIL)
      .setIssuedAt().setExpirationTime('1h').sign(privateKey);
    const body = `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`;
    const tokenResponse = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: body, });
    const tokenData = await tokenResponse.json();
    if (!tokenResponse.ok) throw new Error(`從 Google 取得 access token 失敗: ${tokenData.error_description || tokenData.error}`);
    return tokenData.access_token;
}

async function updateRowInSheet(env, sheetName, matchColumn, matchValue, updateData) {
    const { GOOGLE_SHEET_ID } = env;
    if (!GOOGLE_SHEET_ID) throw new Error('缺少 GOOGLE_SHEET_ID 環境變數。');
    const accessToken = await getAccessToken(env);
    const simpleAuth = { getRequestHeaders: () => ({ 'Authorization': `Bearer ${accessToken}` }) };
    const doc = new GoogleSpreadsheet(GOOGLE_SHEET_ID, simpleAuth);
    await doc.loadInfo();
    const sheet = doc.sheetsByTitle[sheetName];
    if (!sheet) throw new Error(`在 Google Sheets 中找不到名為 "${sheetName}" 的工作表。`);
    await sheet.loadCells();
    const rows = await sheet.getRows();
    const rowToUpdate = rows.find(row => row.get(matchColumn) == matchValue);
    if (rowToUpdate) {
        rowToUpdate.assign(updateData);
        await rowToUpdate.save();
    }
}
// ** END: 關鍵修正 **

async function syncSingleExpToSheet(env, expData) {
    // 這個函式保持不變，繼續用來記錄歷史
    try {
        console.log('背景任務：開始同步單筆經驗值紀錄...');
        const { GOOGLE_SHEET_ID, EXP_HISTORY_SHEET_NAME } = env;
        if (!EXP_HISTORY_SHEET_NAME) {
            throw new Error('背景同步(Exp)失敗：缺少 EXP_HISTORY_SHEET_NAME 環境變數。');
        }
        const accessToken = await getAccessToken(env);
        const simpleAuth = { getRequestHeaders: () => ({ 'Authorization': `Bearer ${accessToken}` }) };
        const doc = new GoogleSpreadsheet(GOOGLE_SHEET_ID, simpleAuth);
        await doc.loadInfo();
        const sheet = doc.sheetsByTitle[EXP_HISTORY_SHEET_NAME];
        if (!sheet) throw new Error(`背景同步(Exp)：找不到名為 "${EXP_HISTORY_SHEET_NAME}" 的工作表。`);
        await sheet.addRow({
            user_id: expData.userId,
            exp_added: expData.expValue, 
            reason: expData.reason,
            staff_id: null,
            created_at: new Date().toLocaleString('zh-TW', { timeZone: 'Asia/Taipei' })
        });
        console.log('背景任務：單筆經驗值紀錄同步成功！');
    } catch (error) {
        console.error('背景同步單筆經驗值失敗:', error);
    }
}

export const onRequest = async (context) => {
    try {
        if (context.request.method !== 'POST') {
            return new Response('Invalid request method.', { status: 405 });
        }
        const { userId, expValue, reason } = await context.request.json();
        const db = context.env.DB;

        // ... (驗證邏輯不變)
        if (!userId || typeof userId !== 'string') {
            return new Response(JSON.stringify({ error: '無效的使用者 ID。' }), { status: 400 });
        }
        const exp = Number(expValue);
        if (isNaN(exp) || !Number.isInteger(exp) || exp <= 0 || exp > 1000) {
            return new Response(JSON.stringify({ error: '積分值必須是 1 到 1000 之間的正整數。' }), { status: 400 });
        }
        if (!reason || typeof reason !== 'string' || reason.trim().length === 0 || reason.length > 100) {
            return new Response(JSON.stringify({ error: '原因為必填，且長度不可超過 100 字。' }), { status: 400 });
        }

        const userStmt = db.prepare('SELECT level, current_exp FROM Users WHERE user_id = ?');
        let user = await userStmt.bind(userId).first();
        if (!user) {
            return new Response(JSON.stringify({ error: `找不到使用者 ID: ${userId}` }), { status: 404 });
        }
        
        let currentLevel = user.level;
        let currentExp = user.current_exp + exp;
        const requiredExp = 10;
        while (currentExp >= requiredExp) {
            currentExp -= requiredExp;
            currentLevel += 1;
        }

        // 【修正】將 ExpHistory 改為 Purchase_history
        await db.batch([
            db.prepare('UPDATE Users SET level = ?, current_exp = ? WHERE user_id = ?').bind(currentLevel, currentExp, userId),
            db.prepare('INSERT INTO Purchase_history (user_id, exp_added, reason) VALUES (?, ?, ?)').bind(userId, exp, reason)
        ]);
        
        // ... (背景同步邏輯不變)
        
        return new Response(JSON.stringify({ 
            success: true, 
            message: `成功新增 ${exp} 點積分。`,
            newLevel: currentLevel,
            newExp: currentExp
        }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });

    } catch (error) {
        console.error('Error in add-points API:', error);
        return new Response(JSON.stringify({ error: '伺服器內部錯誤，新增積分失敗。'}), { status: 500 });
    }
};