// functions/api/update-user-profile.js
import { GoogleSpreadsheet } from 'google-spreadsheet';
import * as jose from 'jose';

async function syncProfileUpdateToSheet(env, userData) {
    try {
        console.log(`背景任務：開始同步使用者 ${userData.userId} 的個人資料...`);
        const {
          GOOGLE_SERVICE_ACCOUNT_EMAIL,
          GOOGLE_PRIVATE_KEY,
          GOOGLE_SHEET_ID,
          USERS_SHEET_NAME
        } = env;

        if (!USERS_SHEET_NAME) {
            console.error('背景同步(Profile Update)失敗：缺少 USERS_SHEET_NAME 環境變數。');
            return;
        }

        const privateKey = await jose.importPKCS8(GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n'), 'RS256');
        const jwt = await new jose.SignJWT({ scope: 'https://www.googleapis.com/auth/spreadsheets' })
          .setProtectedHeader({ alg: 'RS256', typ: 'JWT' })
          .setIssuer(GOOGLE_SERVICE_ACCOUNT_EMAIL)
          .setAudience('https://oauth2.googleapis.com/token')
          .setSubject(GOOGLE_SERVICE_ACCOUNT_EMAIL)
          .setIssuedAt()
          .setExpirationTime('1h')
          .sign(privateKey);

        const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: jwt }),
        });

        if (!tokenResponse.ok) throw new Error('背景同步(Profile Update)：從 Google 取得 access token 失敗。');
        const tokenData = await tokenResponse.json();
        const accessToken = tokenData.access_token;
        
        const simpleAuth = { getRequestHeaders: () => ({ 'Authorization': `Bearer ${accessToken}` }) };
        const doc = new GoogleSpreadsheet(GOOGLE_SHEET_ID, simpleAuth);
        await doc.loadInfo();

        const sheet = doc.sheetsByTitle[USERS_SHEET_NAME];
        if (!sheet) throw new Error(`背景同步(Profile Update)：找不到名為 "${USERS_SHEET_NAME}" 的工作表。`);

        const rows = await sheet.getRows();
        const userRow = rows.find(row => row.get('user_id') === userData.userId);

        if (userRow) {
            userRow.assign({
                'real_name': userData.realName, // 同步 real_name
                'nickname': userData.nickname,
                'phone': userData.phone,
                'email': userData.email,
                'preferred_games': userData.preferredGames,
                'line_display_name': userData.displayName,
                'line_picture_url': userData.pictureUrl
            });
            
            await userRow.save();
            console.log(`背景任務：成功更新使用者 ${userData.userId} 在 Google Sheet 的資料。`);
        } else {
            console.warn(`背景任務：在 Google Sheet 中找不到 user_id 為 ${userData.userId} 的使用者，無法更新。`);
        }

    } catch (error) {
        console.error('背景同步使用者個人資料失敗:', error);
    }
}


export async function onRequest(context) {
  try {
    if (context.request.method !== 'POST') {
      return new Response('Invalid request method.', { status: 405 });
    }

    const body = await context.request.json();
    const { userId, realName, nickname, phone, email, preferredGames, displayName, pictureUrl } = body;

    // --- 【新增的驗證區塊】 ---
    const errors = [];
    if (!userId || typeof userId !== 'string') {
        errors.push('無效的使用者 ID。');
    }
    if (!nickname || typeof nickname !== 'string' || nickname.trim().length === 0 || nickname.length > 50) {
        errors.push('暱稱為必填，且長度不可超過 50 字。');
    }
    if (!phone || !/^\d{10}$/.test(phone)) {
        errors.push('請輸入有效的 10 碼手機號碼。');
    }
    if (realName && typeof realName !== 'string' || realName.length > 50) {
        errors.push('真實姓名長度不可超過 50 字。');
    }
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        errors.push('請輸入有效的電子信箱格式。');
    }
    if (displayName === undefined || pictureUrl === undefined) {
        errors.push('缺少必要的 LINE 使用者資訊。');
    }

    if (errors.length > 0) {
        return new Response(JSON.stringify({ error: errors.join(' ') }), {
            status: 400, headers: { 'Content-Type': 'application/json' },
        });
    }
    // --- 【驗證區塊結束】 ---

    const db = context.env.DB;
    
    const preferredGamesString = Array.isArray(preferredGames) ? preferredGames.join(',') : preferredGames || '未提供';

    const stmt = db.prepare(
      'UPDATE Users SET real_name = ?, nickname = ?, phone = ?, email = ?, preferred_games = ?, line_display_name = ?, line_picture_url = ? WHERE user_id = ?'
    );
    const result = await stmt.bind(
        realName || '',
        nickname, 
        phone, 
        email || '',
        preferredGamesString,
        displayName,
        pictureUrl,
        userId
    ).run();
    
    if (result.meta.changes === 0) {
      return new Response(JSON.stringify({ error: `找不到使用者 ID: ${userId}，無法更新資料。` }), {
        status: 404, headers: { 'Content-Type': 'application/json' },
      });
    }

    const userDataToSync = { userId, realName: realName || '', nickname, phone, email: email || '', preferredGames: preferredGamesString, displayName, pictureUrl };
    context.waitUntil(syncProfileUpdateToSheet(context.env, userDataToSync));

    return new Response(JSON.stringify({ 
        success: true, 
        message: '成功更新冒險者登錄資料！' 
    }), {
      status: 200, headers: { 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error in update-user-profile API:', error);
    const errorResponse = { error: '伺服器內部錯誤，更新資料失敗。', details: error.message };
    return new Response(JSON.stringify(errorResponse), {
      status: 500, headers: { 'Content-Type': 'application/json' },
    });
  }
}