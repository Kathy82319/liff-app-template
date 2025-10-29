// functions/api/user.js
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
        real_name: '', 
        class: '無', 
        level: 1, 
        current_exp: 0, 
        tag: null, 
        perk: '無特殊優惠'
      };
      
      await db.prepare(
        'INSERT INTO Users (user_id, line_display_name, line_picture_url, real_name, class, level, current_exp, perk) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
      ).bind(newUser.user_id, newUser.line_display_name, newUser.line_picture_url, newUser.real_name, newUser.class, newUser.level, newUser.current_exp, newUser.perk).run();
 
      // 【新增】紀錄新使用者活動
      const activityStmt = db.prepare("INSERT INTO Activities (type, message, link) VALUES (?, ?, ?)");
      context.waitUntil(activityStmt.bind('new_user', `新顧客 ${newUser.line_display_name} 已加入`, '#users').run());
      
      return new Response(JSON.stringify({ ...newUser, expToNextLevel }), { status: 201, headers: { 'Content-Type': 'application/json' } });
    }
  } catch (error) {
    console.error('Error in user API:', error);
    return new Response(JSON.stringify({ error: '處理使用者資料失敗。'}), { status: 500 });
  }
}