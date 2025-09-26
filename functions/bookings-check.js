// functions/api/bookings-check.js
import { GoogleSpreadsheet } from 'google-spreadsheet';
import * as jose from 'jose';

// 輔助函式 getDailyBookingLimit 保持不變
async function getDailyBookingLimit(env, date) {
    // ... 此函式內容不變 ...
    const { GOOGLE_SERVICE_ACCOUNT_EMAIL, GOOGLE_PRIVATE_KEY, GOOGLE_SHEET_ID, SETTINGS_SHEET_NAME } = env;
    const DEFAULT_LIMIT = 4;
    if (!SETTINGS_SHEET_NAME) return DEFAULT_LIMIT;
    try {
        const privateKey = await jose.importPKCS8(GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n'), 'RS256');
        const jwt = await new jose.SignJWT({ scope: 'https://www.googleapis.com/auth/spreadsheets.readonly' })
          .setProtectedHeader({ alg: 'RS256', typ: 'JWT' }).setIssuer(GOOGLE_SERVICE_ACCOUNT_EMAIL)
          .setAudience('https://oauth2.googleapis.com/token').setSubject(GOOGLE_SERVICE_ACCOUNT_EMAIL)
          .setIssuedAt().setExpirationTime('1h').sign(privateKey);
        const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
          method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: jwt }),
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


// 【** 關鍵修正：函式改名並調整回傳內容 **】
async function getEnabledDates(db) {
    try {
        const { results } = await db.prepare("SELECT disabled_date FROM BookingSettings").all();
        // 邏輯上回傳的是 "enabled dates"
        return results.map(row => row.disabled_date);
    } catch (error) {
        console.error("讀取可預約日期失敗:", error);
        return [];
    }
}

export async function onRequest(context) {
  try {
    const url = new URL(context.request.url);
    const date = url.searchParams.get('date');
    const db = context.env.DB;

    // 如果請求是為了獲取整個月份的設定
    if (url.searchParams.has('month-init')) {
        const enabledDates = await getEnabledDates(db);
        // 回傳的 JSON key 改為 enabledDates
        return new Response(JSON.stringify({ enabledDates }), {
            status: 200, headers: { 'Content-Type': 'application/json' }
        });
    }
    
    // 既有的單日查詢邏輯 (這部分不用變)
    if (!date) {
      return new Response(JSON.stringify({ error: '缺少日期參數。' }), { status: 400 });
    }
    const dailyLimit = await getDailyBookingLimit(context.env, date);
    
    const stmt = db.prepare(
      "SELECT SUM(tables_occupied) as total_tables_booked FROM Bookings WHERE booking_date = ? AND (status = 'confirmed' OR status = 'checked-in')"
    );
    const result = await stmt.bind(date).first();
    const tablesBooked = result ? (result.total_tables_booked || 0) : 0;
    const tablesAvailable = dailyLimit - tablesBooked;
    
    return new Response(JSON.stringify({
        date: date,
        limit: dailyLimit,
        booked: tablesBooked,
        available: tablesAvailable > 0 ? tablesAvailable : 0
    }), {
      status: 200, headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    console.error('Error in bookings-check API:', error);
    return new Response(JSON.stringify({ error: '查詢預約狀況失敗。' }), { status: 500 });
  }
}