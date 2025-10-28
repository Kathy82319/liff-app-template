// functions/api/admin/update-news.js
export async function onRequest(context) {
  try {
    if (context.request.method !== 'POST') { //
      return new Response('Invalid request method.', { status: 405 }); //
    }

    const body = await context.request.json(); //
    const { id, title, category, published_date, image_url, content, is_published } = body; //

    // --- (驗證區塊保持不變) ---
    const errors = []; //
    if (!id || typeof id !== 'number') {
        errors.push('無效的情報 ID。');
    }
    if (!title || typeof title !== 'string' || title.trim().length === 0 || title.length > 100) {
        errors.push('標題為必填，且長度不可超過 100 字。');
    }
    if (!category || typeof category !== 'string' || category.trim().length === 0 || category.length > 50) {
        errors.push('分類為必填，且長度不可超過 50 字。');
    }
    if (!published_date || !/^\d{4}-\d{2}-\d{2}$/.test(published_date)) {
        errors.push('請提供有效的發布日期 (YYYY-MM-DD)。');
    }
    if (image_url && (typeof image_url !== 'string' || image_url.length > 2048)) {
        errors.push('圖片網址過長。');
    }
    if (content && (typeof content !== 'string' || content.length > 10000)) {
        errors.push('內文長度不可超過 10000 字。');
    }

    if (errors.length > 0) {
        return new Response(JSON.stringify({ error: errors.join(' ') }), { status: 400 });
    }
    // --- 【驗證區塊結束】 ---

const db = context.env.DB; //

    const stmt = db.prepare(
      'UPDATE News SET title = ?, category = ?, published_date = ?, image_url = ?, content = ?, is_published = ? WHERE id = ?'
    ); //
    const result = await stmt.bind(title, category, published_date, image_url || '', content || '', is_published ? 1 : 0, id).run(); //

    if (result.meta.changes === 0) { //
        return new Response(JSON.stringify({ error: `找不到 ID 為 ${id} 的情報。` }), { status: 404 }); //
    }


    return new Response(JSON.stringify({ success: true, message: '情報更新成功！' }), { //
      status: 200, headers: { 'Content-Type': 'application/json' }, //
    });

  } catch (error) {
    console.error('Error in update-news API:', error); //
    // --- 【修改】回傳詳細錯誤 ---
    return new Response(JSON.stringify({ error: '更新情報失敗。', details: error.message }), { status: 500, headers: { 'Content-Type': 'application/json' } }); //
  }
}