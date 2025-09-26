// functions/api/admin/create-rental.js
import { GoogleSpreadsheet } from 'google-spreadsheet';
import * as jose from 'jose';

// ** Google Sheets 工具函式 **
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
      body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type-jwt-bearer', assertion: jwt }),
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

async function updateRowInSheet(env, sheetName, matchColumn, matchValue, updateData) {
    const { GOOGLE_SHEET_ID } = env;
    if (!GOOGLE_SHEET_ID) throw new Error('缺少 GOOGLE_SHEET_ID 環境變數。');
    const accessToken = await getAccessToken(env);
    const simpleAuth = { getRequestHeaders: () => ({ 'Authorization': `Bearer ${accessToken}` }) };
    const doc = new GoogleSpreadsheet(GOOGLE_SHEET_ID, simpleAuth);
    await doc.loadInfo();
    const sheet = doc.sheetsByTitle[sheetName];
    if (!sheet) throw new Error(`在 Google Sheets 中找不到名為 "${sheetName}" 的工作表。`);
    const rows = await sheet.getRows();
    const rowToUpdate = rows.find(row => row.get(matchColumn) == matchValue);
    if (rowToUpdate) {
        rowToUpdate.assign(updateData);
        await rowToUpdate.save();
    } else {
        console.warn(`在工作表 "${sheetName}" 中找不到 ${matchColumn} 為 "${matchValue}" 的資料列，無法更新。`);
    }
}

export async function onRequest(context) {
  try {
    if (context.request.method !== 'POST') {
      return new Response('Invalid request method.', { status: 405 });
    }

    const body = await context.request.json();
    const { 
        userId, gameIds, dueDate, name, phone,
        rentPrice, deposit, lateFeePerDay 
    } = body;

    // --- 【新增的驗證區塊】 ---
    const errors = [];
    if (!userId || typeof userId !== 'string') errors.push('必須選擇一位有效的會員。');
    if (!gameIds || !Array.isArray(gameIds) || gameIds.length === 0) errors.push('必須至少選擇一款租借的遊戲。');
    if (!dueDate || !/^\d{4}-\d{2}-\d{2}$/.test(dueDate)) errors.push('無效的歸還日期格式。');
    if (!name || typeof name !== 'string' || name.trim().length === 0 || name.length > 50) errors.push('租借人姓名為必填，且長度不可超過 50 字。');
    if (!phone || !/^\d{10}$/.test(phone)) errors.push('請輸入有效的 10 碼手機號碼。');

    const rentPriceNum = Number(rentPrice);
    const depositNum = Number(deposit);
    const lateFeeNum = Number(lateFeePerDay);

    if (isNaN(rentPriceNum) || rentPriceNum < 0) errors.push('租金必須是有效的非負數。');
    if (isNaN(depositNum) || depositNum < 0) errors.push('押金必須是有效的非負數。');
    if (isNaN(lateFeeNum) || lateFeeNum < 0) errors.push('每日逾期費必須是有效的非負數。');

    if (errors.length > 0) {
        return new Response(JSON.stringify({ error: errors.join(' ') }), { status: 400 });
    }
    // --- 【驗證區塊結束】 ---

    const db = context.env.DB;
    const allGameNames = [];
    const dbOperations = [];
    let createdRentalIds = [];
    
    for (const gameId of gameIds) {
        const game = await db.prepare('SELECT name, for_rent_stock FROM BoardGames WHERE game_id = ?').bind(gameId).first();
        if (!game) throw new Error(`找不到 ID 為 ${gameId} 的遊戲。`);
        if (game.for_rent_stock <= 0) throw new Error(`《${game.name}》目前已無可租借庫存。`);
        
        allGameNames.push(game.name);

        const insertStmt = db.prepare(
            `INSERT INTO Rentals (user_id, game_id, due_date, name, phone, rent_price, deposit, late_fee_per_day) 
             VALUES (?, ?, ?, ?, ?, ?, ?, ?) RETURNING rental_id`
        );
        
        dbOperations.push(insertStmt.bind(
            userId, gameId, dueDate, name, phone, rentPriceNum, depositNum, lateFeeNum
        ));
        
            const updateStmt = db.prepare('UPDATE Products SET for_rent_stock = for_rent_stock - 1 WHERE game_id = ?');
            dbOperations.push(updateStmt.bind(gameId));
    }
    
    const results = await db.batch(dbOperations);
    
    results.forEach(result => {
        if (result.results && result.results.length > 0 && result.results[0].rental_id) {
            createdRentalIds.push(result.results[0].rental_id);
        }
    });

    const rentalDateStr = new Date().toISOString().split('T')[0];
    const rentalDuration = Math.round((new Date(dueDate) - new Date(rentalDateStr)) / (1000 * 60 * 60 * 24));

    const message = `🎉 租借資訊確認\n\n` +
                    `姓名：${name}\n` +
                    `電話：${phone}\n` +
                    `日期：${rentalDateStr}\n` +
                    `租借時間：${rentalDuration}天\n` +
                    `歸還日期：${dueDate}\n` +
                    `租借遊戲：\n- ${allGameNames.join('\n- ')}\n\n` +
                    `本次租金：$${rentPriceNum}\n` +
                    `收取押金：$${depositNum}\n\n` +
                    `租借規則：\n` +
                    `1. 收取遊戲押金，於歸還桌遊、確認內容物無誤後退還。\n` +
                    `2. 內容物需現場清點，若歸還時有缺少或損毀，將不退還押金。\n` +
                    `3. 最短租期為3天，租借當日即算第一天。\n` +
                    `4. 逾期歸還，每逾期一天將從押金扣除 ${lateFeeNum} 元。\n\n` +
                    `如上面資訊沒有問題，請回覆「ok」並視為同意租借規則。\n`+
                    `感謝您的預約！`;

    context.waitUntil(/* ... 您的背景同步邏輯 ... */);

    return new Response(JSON.stringify({ success: true, message: '租借紀錄已建立，庫存已更新！' }), {
      status: 201,
      headers: { 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error in create-rental API:', error);
    return new Response(JSON.stringify({ error: `建立租借紀錄失敗: ${error.message}` }), {
      status: 500,
    });
  }
}