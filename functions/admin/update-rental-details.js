// functions/api/admin/update-rental-details.js
import { GoogleSpreadsheet } from 'google-spreadsheet';
import * as jose from 'jose';
// --- 內建 Google Sheets 工具 (用於背景同步) ---
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
    const { rentalId, dueDate, lateFeeOverride } = body;

    // --- 【新增的驗證區塊】 ---
    const errors = [];
    if (!rentalId || !Number.isInteger(rentalId)) {
        errors.push('缺少有效的租借 ID。');
    }
    if (dueDate && !/^\d{4}-\d{2}-\d{2}$/.test(dueDate)) {
        errors.push('無效的歸還日期格式。');
    }
    const feeOverrideNum = Number(lateFeeOverride);
    if (lateFeeOverride !== undefined && lateFeeOverride !== null && lateFeeOverride !== '' && (isNaN(feeOverrideNum) || feeOverrideNum < 0)) {
        errors.push('手動覆寫金額必須是有效的非負數。');
    }

    if (errors.length > 0) {
        return new Response(JSON.stringify({ error: errors.join(' ') }), { status: 400 });
    }
    // --- 【驗證區塊結束】 ---

    const db = context.env.DB;
    const updates = [];
    const params = [];

    if (dueDate) {
        updates.push("due_date = ?");
        params.push(dueDate);
    }

    if (lateFeeOverride !== undefined) {
        updates.push("late_fee_override = ?");
        const valueToSet = (lateFeeOverride === '' || lateFeeOverride === null) ? null : feeOverrideNum;
        params.push(valueToSet);
    }

    if (updates.length === 0) {
        return new Response(JSON.stringify({ success: true, message: '沒有提供任何要更新的資料。' }), { status: 200 });
    }

    params.push(rentalId);

    const stmt = db.prepare(`UPDATE Rentals SET ${updates.join(', ')} WHERE rental_id = ?`);
    const result = await stmt.bind(...params).run();

    if (result.meta.changes === 0) {
      return new Response(JSON.stringify({ error: `找不到租借 ID: ${rentalId}，無法更新。` }), { status: 404 });
    }

    const dataToSync = {};
    if (dueDate) dataToSync.due_date = dueDate;
    if (lateFeeOverride !== undefined) dataToSync.late_fee_override = (lateFeeOverride === '' || lateFeeOverride === null) ? '' : feeOverrideNum;

    context.waitUntil(
        updateRowInSheet(context.env, '桌遊租借者', 'rental_id', rentalId, dataToSync)
        .catch(err => console.error("背景同步更新租借詳情失敗:", err))
    );

    return new Response(JSON.stringify({ success: true, message: '成功更新租借資訊！' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error in update-rental-details API:', error);
    return new Response(JSON.stringify({ error: '更新租借資訊失敗。' }), { status: 500 });
  }
}