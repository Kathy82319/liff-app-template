// functions/api/user.js
import { GoogleSpreadsheet } from 'google-spreadsheet';
import * as jose from 'jose';

// --- Google Sheets 工具函式 (保持不變) ---
async function getAccessToken(env) {
    const { GOOGLE_SERVICE_ACCOUNT_EMAIL, GOOGLE_PRIVATE_KEY } = env;
    if (!GOOGLE_SERVICE_ACCOUNT_EMAIL || !GOOGLE_PRIVATE_KEY) throw new Error('缺少 Google 服務帳號的環境變數。');
    
    const privateKey = await jose.importPKCS8(GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n'), 'RS256');
    const jwt = await new jose.SignJWT({ scope: 'https://www.googleapis.com/auth/spreadsheets' })
      .setProtectedHeader({ alg: 'RS256', typ: 'JWT' }).setIssuer(GOOGLE_SERVICE_ACCOUNT_EMAIL)
      .setAudience('https://oauth2.googleapis.com/token').setSubject(GOOGLE_SERVICE_ACCOUNT_EMAIL)
      .setIssuedAt().setExpirationTime('1h').sign(privateKey);

    const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: jwt }),
    });

    const tokenData = await tokenResponse.json();
    if (!tokenResponse.ok) throw new Error(`從 Google 取得 access token 失敗: ${tokenData.error_description || tokenData.error}`);
    return tokenData.access_token;
}

async function addRowToSheet(env, sheetName, rowData) {
    const { GOOGLE_SHEET_ID } = env;
    if (!GOOGLE_SHEET_ID) throw new Error('缺少 GOOGLE_SHEET_ID 環境變數。');

    const accessToken = await getAccessToken(env);
    const simpleAuth = { getRequestHeaders: () => ({ 'Authorization': `Bearer ${accessToken}` }) };
     
    const doc = new GoogleSpreadsheet(GOOGLE_SHEET_ID, simpleAuth);
    await doc.loadInfo();
    
    const sheet = doc.sheetsByTitle[sheetName];
    if (!sheet) throw new Error(`在 Google Sheets 中找不到名為 "${sheetName}" 的工作表。`);

    await sheet.addRow(rowData);
}
// --- 結束整合 Google Sheets 工具 ---

export async function onRequest(context) {
  try {
    if (context.request.method !== 'POST') {
      return new Response('Invalid request method.', { status: 405 });
    }
    const { userId, displayName, pictureUrl } = await context.request.json();
    if (!userId) {
      return new Response(JSON.stringify({ error: 'User ID is required.' }), { status: 400 });
    }
    const db = context.env.DB;
    
    let user = await db.prepare('SELECT * FROM Users WHERE user_id = ?').bind(userId).first();
    const expToNextLevel = 10;

    if (user) {
      // 【核心修正】如果使用者已存在，就更新他們最新的 LINE 名稱和頭像
      const stmt = db.prepare(
        'UPDATE Users SET line_display_name = ?, line_picture_url = ? WHERE user_id = ?'
      );
      await stmt.bind(displayName, pictureUrl, userId).run();
      
      // 重新獲取一次完整的 user 資料回傳給前端
      user = await db.prepare('SELECT * FROM Users WHERE user_id = ?').bind(userId).first();

      return new Response(JSON.stringify({ ...user, expToNextLevel }), { status: 200, headers: { 'Content-Type': 'application/json' } });

    } else {
      const newUser = {
        user_id: userId, 
        line_display_name: displayName || '未提供名稱',
        line_picture_url: pictureUrl || '',
        real_name: '', // 新增 real_name 預設值
        class: '無', 
        level: 1, 
        current_exp: 0, 
        tag: null, 
        perk: '無特殊優惠'
      };
      
      await db.prepare(
        'INSERT INTO Users (user_id, line_display_name, line_picture_url, real_name, class, level, current_exp, perk) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
      ).bind(newUser.user_id, newUser.line_display_name, newUser.line_picture_url, newUser.real_name, newUser.class, newUser.level, newUser.current_exp, newUser.perk).run();
      
      const sheetData = { ...newUser };
      delete sheetData.user_id;
      context.waitUntil(addRowToSheet(context.env, context.env.USERS_SHEET_NAME, sheetData));

      return new Response(JSON.stringify({ ...newUser, expToNextLevel }), { status: 201, headers: { 'Content-Type': 'application/json' } });
    }
  } catch (error) {
    console.error('Error in user API:', error);
    return new Response(JSON.stringify({ error: '處理使用者資料失敗。'}), { status: 500 });
  }
}