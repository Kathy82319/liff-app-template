// functions/api/get-products.js (修正後)
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

// --- 【已修正】函式改名並調整邏輯 ---
async function getProductsFromSheet(env) {
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

// --- 【已修正】同步邏輯以符合新的 Products 表 ---
async function runProductSync(env) {
    const { DB } = env;
    const rows = await getProductsFromSheet(env);
    if (rows.length === 0) {
        return { success: true, message: 'Google Sheet 中沒有產品資料可同步。' };
    }

    const stmt = DB.prepare(
        `INSERT INTO Products (
            product_id, name, description, category, tags, images, is_visible, display_order,
            inventory_management_type, stock_quantity, stock_status, price_type, price, price_options,
            spec_1_name, spec_1_value, spec_2_name, spec_2_value, spec_3_name, spec_3_value,
            spec_4_name, spec_4_value, spec_5_name, spec_5_value
         )
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(product_id) DO UPDATE SET
           name=excluded.name, description=excluded.description, category=excluded.category, tags=excluded.tags,
           images=excluded.images, is_visible=excluded.is_visible, display_order=excluded.display_order,
           inventory_management_type=excluded.inventory_management_type, stock_quantity=excluded.stock_quantity,
           stock_status=excluded.stock_status, price_type=excluded.price_type, price=excluded.price, price_options=excluded.price_options,
           spec_1_name=excluded.spec_1_name, spec_1_value=excluded.spec_1_value, spec_2_name=excluded.spec_2_name, spec_2_value=excluded.spec_2_value,
           spec_3_name=excluded.spec_3_name, spec_3_value=excluded.spec_3_value, spec_4_name=excluded.spec_4_name, spec_4_value=excluded.spec_4_value,
           spec_5_name=excluded.spec_5_name, spec_5_value=excluded.spec_5_value`
    );

    const operations = rows.map(row => {
        const d = row.toObject();
        if (!d.product_id) return null;
        return stmt.bind(
            d.product_id, d.name || '', d.description || '', d.category || '', d.tags || '',
            d.images || '[]', String(d.is_visible).toUpperCase() === 'TRUE' ? 1 : 0, Number(d.display_order) || 999,
            d.inventory_management_type || 'none', Number(d.stock_quantity) || null, d.stock_status || null,
            d.price_type || 'simple', Number(d.price) || null, d.price_options || null,
            d.spec_1_name || null, d.spec_1_value || null, d.spec_2_name || null, d.spec_2_value || null,
            d.spec_3_name || null, d.spec_3_value || null, d.spec_4_name || null, d.spec_4_value || null,
            d.spec_5_name || null, d.spec_5_value || null
        );
    }).filter(op => op !== null);

    if (operations.length === 0) {
        return { success: true, message: '在 Google Sheet 中沒有找到包含有效 product_id 的資料可同步。' };
    }

    await DB.batch(operations);
    return { success: true, message: `成功從 Google Sheet 同步了 ${operations.length} 筆產品資料到資料庫。` };
}

// --- API Endpoint 邏輯 ---
export async function onRequest(context) {
    const { request, env } = context;
    const db = env.DB;

    try {
        if (request.method === 'GET') {
            const stmt = db.prepare('SELECT * FROM Products ORDER BY display_order ASC');
            const { results } = await stmt.all();
            return new Response(JSON.stringify(results || []), {
                status: 200, headers: { 'Content-Type': 'application/json' },
            });
        }
        if (request.method === 'POST') {
             const result = await runProductSync(env);
             return new Response(JSON.stringify(result), { status: 200, headers: { 'Content-Type': 'application/json' } });
        }
        return new Response('Invalid request method.', { status: 405 });

    } catch (error) {
        console.error(`Error in get-products API:`, error);
        return new Response(JSON.stringify({ error: '獲取或同步產品列表失敗。', details: error.message }), {
            status: 500, headers: { 'Content-Type': 'application/json' },
        });
    }
}