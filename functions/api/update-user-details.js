// functions/api/update-user-details.js
import { GoogleSpreadsheet } from 'google-spreadsheet';
import * as jose from 'jose';

// --- Google Sheets 工具函式 ---
async function getAccessToken(env) {
    const { GOOGLE_SERVICE_ACCOUNT_EMAIL, GOOGLE_PRIVATE_KEY } = env;
    if (!GOOGLE_SERVICE_ACCOUNT_EMAIL || !GOOGLE_PRIVATE_KEY) throw new Error('缺少 Google 服務帳號的環境變數。');
    
    const formattedPrivateKey = GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n');
    const privateKey = await jose.importPKCS8(formattedPrivateKey, 'RS256');

    const jwt = await new jose.SignJWT({ scope: 'https://www.googleapis.com/auth/spreadsheets' })
      .setProtectedHeader({ alg: 'RS256', typ: 'JWT' }).setIssuer(GOOGLE_SERVICE_ACCOUNT_EMAIL)
      .setAudience('https://oauth2.googleapis.com/token').setSubject(GOOGLE_SERVICE_ACCOUNT_EMAIL)
      .setIssuedAt().setExpirationTime('1h').sign(privateKey);

    // ** START: 關鍵修正 - 手動建立請求 Body **
    const grantType = 'urn:ietf:params:oauth:grant-type:jwt-bearer';
    const body = `grant_type=${encodeURIComponent(grantType)}&assertion=${encodeURIComponent(jwt)}`;

    const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body,
    });
    // ** END: 關鍵修正 **

    const tokenData = await tokenResponse.json();
    if (!tokenResponse.ok) {
        console.error("[Auth] 從 Google 獲取 Access Token 失敗，詳細錯誤:", tokenData);
        throw new Error(`從 Google 取得 access token 失敗: ${tokenData.error_description || tokenData.error}`);
    }
    return tokenData.access_token;
}

// ** START: 關鍵修正 - 強化 updateRowInSheet 函式 **
async function updateRowInSheet(env, sheetName, matchColumn, matchValue, updateData) {
    const { GOOGLE_SHEET_ID } = env;
    if (!GOOGLE_SHEET_ID) throw new Error('缺少 GOOGLE_SHEET_ID 環境變數。');

    const accessToken = await getAccessToken(env);
    const simpleAuth = { getRequestHeaders: () => ({ 'Authorization': `Bearer ${accessToken}` }) };
    
    const doc = new GoogleSpreadsheet(GOOGLE_SHEET_ID, simpleAuth);
    await doc.loadInfo();
    
    const sheet = doc.sheetsByTitle[sheetName];
    if (!sheet) throw new Error(`在 Google Sheets 中找不到名為 "${sheetName}" 的工作表。`);

    // 預先載入儲存格資料，這對後續的 .save() 很重要
    await sheet.loadCells();
    const rows = await sheet.getRows();
    const rowToUpdate = rows.find(row => row.get(matchColumn) == matchValue);

    if (rowToUpdate) {
        console.log(`[背景任務] 找到要更新的列 (User: ${matchValue})，準備寫入新資料...`);
        // 使用 .assign() 方法一次性更新所有欄位，比 .set() 更穩定
        rowToUpdate.assign(updateData);
        // 呼叫 save() 將變更寫回 Google Sheet
        await rowToUpdate.save();
        console.log(`[背景任務] 成功更新 Google Sheet 中的使用者: ${matchValue}`);
    } else {
        console.warn(`[背景任務] 在工作表 "${sheetName}" 中找不到 ${matchColumn} 為 "${matchValue}" 的資料列，無法更新。`);
    }
}
// ** END: 關鍵修正 **

// --- 主要 API 邏輯 ---
export async function onRequest(context) {
  try {
    if (context.request.method !== 'POST') {
      return new Response('Invalid request method.', { status: 405 });
    }

    const body = await context.request.json();
    const { userId, level, current_exp, tag, user_class, perk, notes } = body;

    // --- 【最重要的驗證區塊】 ---
    const errors = [];
    if (!userId || typeof userId !== 'string') errors.push('無效的使用者 ID。');
    
    const levelNum = Number(level);
    if (isNaN(levelNum) || !Number.isInteger(levelNum) || levelNum < 1) {
        errors.push('等級必須是大於 0 的整數。');
    }
    
    const expNum = Number(current_exp);
    if (isNaN(expNum) || !Number.isInteger(expNum) || expNum < 0) {
        errors.push('經驗值必須是非負整數。');
    }
    
    if (tag && (typeof tag !== 'string' || tag.length > 50)) {
        errors.push('標籤長度不可超過 50 字。');
    }
    if (user_class && (typeof user_class !== 'string' || user_class.length > 50)) {
        errors.push('職業名稱長度不可超過 50 字。');
    }
    if (perk && (typeof perk !== 'string' || perk.length > 100)) {
        errors.push('福利內容長度不可超過 100 字。');
    }
    if (notes && (typeof notes !== 'string' || notes.length > 500)) {
        errors.push('備註長度不可超過 500 字。');
    }

    if (errors.length > 0) {
        return new Response(JSON.stringify({ error: errors.join(' ') }), { status: 400 });
    }
    // --- 【驗證區塊結束】 ---

    const db = context.env.DB;

    const stmt = db.prepare('UPDATE Users SET level = ?, current_exp = ?, tag = ?, class = ?, perk = ?, notes = ? WHERE user_id = ?');
    const result = await stmt.bind(levelNum, expNum, tag, user_class, perk, notes || '', userId).run();

    if (result.meta.changes === 0) {
      return new Response(JSON.stringify({ error: `在 D1 中找不到使用者 ID: ${userId}，無法更新資料。` }), {
        status: 404
      });
    }

    const dataToSync = {
        level: levelNum,
        current_exp: expNum,
        tag: tag,
        class: user_class,
        perk: perk,
        notes: notes || ''
    };

    context.waitUntil(
        updateRowInSheet(context.env, '使用者列表', 'user_id', userId, dataToSync)
        .catch(err => console.error(`背景同步 Google Sheet 失敗 (使用者: ${userId}):`, err))
    );

    return new Response(JSON.stringify({ success: true, message: '成功更新使用者資料！' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error in update-user-details API:', error);
    return new Response(JSON.stringify({ error: '更新資料失敗。' }), {
      status: 500,
    });
  }
}