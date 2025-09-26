// functions/api/bookings-create.js
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

// ** START: 修正問題 2 - 補上完整的函式 **
async function getDailyBookingLimit(env, date) {
    const { GOOGLE_SERVICE_ACCOUNT_EMAIL, GOOGLE_PRIVATE_KEY, GOOGLE_SHEET_ID, SETTINGS_SHEET_NAME } = env;
    const DEFAULT_LIMIT = 4; // 預設上限

    if (!SETTINGS_SHEET_NAME) return DEFAULT_LIMIT;

    try {
        const privateKey = await jose.importPKCS8(GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n'), 'RS256');
        const jwt = await new jose.SignJWT({ scope: 'https://www.googleapis.com/auth/spreadsheets.readonly' })
          .setProtectedHeader({ alg: 'RS256', typ: 'JWT' }).setIssuer(GOOGLE_SERVICE_ACCOUNT_EMAIL)
          .setAudience('https://oauth2.googleapis.com/token').setSubject(GOOGLE_SERVICE_ACCOUNT_EMAIL)
          .setIssuedAt().setExpirationTime('1h').sign(privateKey);
        
        const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
          method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type-jwt-bearer', assertion: jwt }),
        });
        if (!tokenResponse.ok) throw new Error('Auth failed');
        const tokenData = await tokenResponse.json();
        const accessToken = tokenData.access_token;
        
        const simpleAuth = { getRequestHeaders: () => ({ 'Authorization': `Bearer ${accessToken}` }) };
        const doc = new GoogleSpreadsheet(GOOGLE_SHEET_ID, simpleAuth);
        await doc.loadInfo();

        const sheet = doc.sheetsByTitle[SETTINGS_SHEET_NAME];
        if (!sheet) return DEFAULT_LIMIT;

        const rows = await sheet.getRows();
        const setting = rows.find(row => row.get('date') === date);
        
        return setting ? Number(setting.get('booking_limit')) : DEFAULT_LIMIT;
    } catch (error) {
        console.error("讀取 Google Sheet 每日設定失敗:", error);
        return DEFAULT_LIMIT;
    }
}
// ** END: 修正問題 2 **

export async function onRequest(context) {
  try {
    if (context.request.method !== 'POST') {
      return new Response('Invalid request method.', { status: 405 });
    }
    const { userId, bookingDate, timeSlot, numOfPeople, contactName, contactPhone } = await context.request.json();
    if (!userId || !bookingDate || !timeSlot || !numOfPeople || numOfPeople <= 0 || !contactName || !contactPhone) {
      return new Response(JSON.stringify({ error: '所有預約欄位皆為必填。' }), { status: 400 });
    }

    const PEOPLE_PER_TABLE = 4;
    const tablesNeeded = Math.ceil(numOfPeople / PEOPLE_PER_TABLE);

    const db = context.env.DB;
    // const dailyLimit = await getDailyBookingLimit(context.env, bookingDate); // 若您有每日上限功能，請取消註解此行

    const checkStmt = db.prepare("SELECT SUM(tables_occupied) as total_tables_booked FROM Bookings WHERE booking_date = ? AND status = 'confirmed'");
    const currentBooking = await checkStmt.bind(bookingDate).first();
    const tablesAlreadyBooked = currentBooking.total_tables_booked || 0;

    // if ((tablesAlreadyBooked + tablesNeeded) > dailyLimit) { // 若您有每日上限功能，請取消註解此區塊
    //   return new Response(JSON.stringify({ error: `抱歉，${bookingDate} 當日剩餘桌數不足以容納您的預約。` }), { status: 409 });
    // }

    const insertStmt = db.prepare(
      'INSERT INTO Bookings (user_id, contact_name, contact_phone, booking_date, time_slot, num_of_people, tables_occupied) VALUES (?, ?, ?, ?, ?, ?, ?)'
    );
    await insertStmt.bind(userId, contactName, contactPhone, bookingDate, timeSlot, numOfPeople, tablesNeeded).run();

    // 背景同步至 Google Sheet
    const newBooking = await context.env.DB.prepare('SELECT * FROM Bookings ORDER BY booking_id DESC LIMIT 1').first();
    if (newBooking) {
        context.waitUntil(
            addRowToSheet(context.env, '預約紀錄', newBooking)
            .catch(err => console.error("背景同步新增預約失敗:", err))
        );
    }

    const message = `🎉 預約成功！\n\n` + `姓名：${contactName}\n電話：${contactPhone}\n` + `日期：${bookingDate}\n時段：${timeSlot}\n` + `人數：${numOfPeople} 人 (預計 ${tablesNeeded} 桌)\n\n` + `感謝您的預約，我們到時見！`;

    return new Response(JSON.stringify({ success: true, message: '預約成功！', confirmationMessage: message }), { status: 201 });
  } catch (error) {
    console.error('Error in bookings-create API:', error);
    return new Response(JSON.stringify({ error: '建立預約失敗。', details: error.message }), { status: 500 });
  }
}