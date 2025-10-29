// functions/api/admin/create-news.js
export async function onRequest(context) {
  try {
    if (context.request.method !== 'POST') {
      return new Response('Invalid request method.', { status: 405 });
    }

    const body = await context.request.json();
    const { title, category, published_date, image_url, content, is_published } = body;

    // --- 【新增的驗證區塊】 ---
    const errors = [];
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

    const db = context.env.DB;
    
    const stmt = db.prepare(
      'INSERT INTO News (title, category, published_date, image_url, content, is_published) VALUES (?, ?, ?, ?, ?, ?) RETURNING id'
    );
    const result = await stmt.bind(title, category, published_date, image_url || '', content || '', is_published ? 1 : 0).first();

    const newsDataToSync = {
        id: result.id,
        title, category, published_date, image_url, content,
        is_published: is_published ? 'TRUE' : 'FALSE',
        created_at: new Date().toLocaleString('zh-TW', { timeZone: 'Asia/Taipei' })
    };
    
    return new Response(JSON.stringify({ success: true, message: '情報新增成功！', id: result.id }), {
      status: 201, headers: { 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error in create-news API:', error);
    return new Response(JSON.stringify({ error: '新增情報失敗。' }), { status: 500 });
  }
}