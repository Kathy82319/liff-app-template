// functions/api/get-boardgames.js
import { GoogleSpreadsheet } from 'google-spreadsheet';
import * as jose from 'jose';

// --- Google Sheets 工具函式 ---
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
async function getBoardGamesFromSheet(env) {
    // 【核心修正】改用新的環境變數名稱
    const { GOOGLE_SHEET_ID, PRODUCTS_SHEET_NAME } = env;
    if (!GOOGLE_SHEET_ID || !PRODUCTS_SHEET_NAME) throw new Error('缺少 GOOGLE_SHEET_ID 或 PRODUCTS_SHEET_NAME 環境變數。');

    const accessToken = await getAccessToken(env);
    const simpleAuth = { getRequestHeaders: () => ({ 'Authorization': `Bearer ${accessToken}` }) };
    
    const doc = new GoogleSpreadsheet(GOOGLE_SHEET_ID, simpleAuth);
    await doc.loadInfo();
    
    const sheet = doc.sheetsByTitle[PRODUCTS_SHEET_NAME];
    if (!sheet) throw new Error(`在 Google Sheets 中找不到名為 "${PRODUCTS_SHEET_NAME}" 的工作表。`);

    return await sheet.getRows();
}
// --- 同步邏輯 ---
async function runBoardgameSync(env) {
    const { DB } = env;

    const rows = await getBoardGamesFromSheet(env);
    if (rows.length === 0) {
        return { success: true, message: 'Google Sheet 中沒有桌遊資料可同步。' };
    }

    const stmt = DB.prepare(
        `INSERT INTO BoardGames (
            game_id, name, description, image_url, image_url_2, image_url_3, min_players, max_players,
            difficulty, tags, total_stock, for_rent_stock, for_sale_stock,
            rent_price, sale_price, deposit, late_fee_per_day, is_visible, display_order, supplementary_info
         )
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(game_id) DO UPDATE SET
           name = excluded.name, description = excluded.description, image_url = excluded.image_url,
           image_url_2 = excluded.image_url_2, image_url_3 = excluded.image_url_3,
           min_players = excluded.min_players, max_players = excluded.max_players, difficulty = excluded.difficulty,
           tags = excluded.tags, total_stock = excluded.total_stock, for_rent_stock = excluded.for_rent_stock,
           for_sale_stock = excluded.for_sale_stock, rent_price = excluded.rent_price, sale_price = excluded.sale_price,
           deposit = excluded.deposit, late_fee_per_day = excluded.late_fee_per_day,
           is_visible = excluded.is_visible, display_order = excluded.display_order, supplementary_info = excluded.supplementary_info`
    );

    const operations = rows.map(row => {
        const rowData = row.toObject();
        if (!rowData.game_id) return null;

        const isVisible = String(rowData.is_visible).toUpperCase() === 'TRUE' ? 1 : 0;
        const for_sale_stock = (Number(rowData.total_stock) || 0) - (Number(rowData.for_rent_stock) || 0);
        
        return stmt.bind(
            rowData.game_id,
            rowData.name || '',
            rowData.description || '',
            rowData.image_url || '',
            rowData.image_url_2 || '',
            rowData.image_url_3 || '',
            Number(rowData.min_players) || 1,
            Number(rowData.max_players) || 4,
            rowData.difficulty || '普通',
            rowData.tags || '',
            Number(rowData.total_stock) || 0,
            Number(rowData.for_rent_stock) || 0,
            for_sale_stock,
            Number(rowData.rent_price) || 0,
            Number(rowData.sale_price) || 0,
            Number(rowData.deposit) || 0,
            Number(rowData.late_fee_per_day) || 50,
            isVisible,
            Number(rowData.display_order) || 999,
            rowData.supplementary_info || ''
        );
    }).filter(op => op !== null);
    
    if (operations.length === 0) {
        return { success: true, message: '在 Google Sheet 中沒有找到包含有效 game_id 的資料可同步。' };
    }

    await DB.batch(operations);
    return { success: true, message: `成功從 Google Sheet 同步了 ${operations.length} 筆桌遊資料到資料庫。` };
}


// functions/api/get-products.js
export const onRequest = async (context) => {
    const { env } = context;
    const db = env.DB;

    try {
        if (context.request.method !== 'GET') {
            return new Response('Invalid request method.', { status: 405 });
        }
        
        // 【修正】將 BoardGames 改為 Products
        const stmt = db.prepare('SELECT * FROM Products ORDER BY display_order ASC');
        const { results } = await stmt.all();

        return new Response(JSON.stringify(results || []), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
        });

    } catch (error) {
        console.error(`Error in get-products API:`, error);
        return new Response(JSON.stringify({ error: '獲取產品列表失敗。', details: error.message }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' },
        });
    }
};