// functions/api/admin/auth/change-password.js
import { verifyPassword, hashPassword } from '../../utils/auth-helpers';

export async function onRequestPost(context) {
    const { request, env, data } = context;

    // 1. 確保使用者已登入 (透過 Middleware 驗證)
    const user = data.user;
    if (!user) {
        return new Response(JSON.stringify({ error: '未授權的操作' }), { status: 401 });
    }

    try {
        const { oldPassword, newPassword } = await request.json();

        if (!oldPassword || !newPassword) {
            return new Response(JSON.stringify({ error: '請輸入舊密碼與新密碼' }), { status: 400 });
        }

        // 2. 從資料庫取出當前使用者的完整資料 (包含密碼 Hash)
        const currentUserRecord = await env.DB.prepare('SELECT * FROM Users WHERE id = ?')
            .bind(user.id)
            .first();

        if (!currentUserRecord) {
            return new Response(JSON.stringify({ error: '找不到使用者資料' }), { status: 404 });
        }

        // 3. 驗證舊密碼是否正確
        const isOldPasswordValid = await verifyPassword(oldPassword, currentUserRecord.password);
        if (!isOldPasswordValid) {
            return new Response(JSON.stringify({ error: '舊密碼不正確' }), { status: 403 });
        }

        // 4. 將新密碼加密
        const newPasswordHash = await hashPassword(newPassword);

        // 5. 更新資料庫
        await env.DB.prepare('UPDATE Users SET password = ? WHERE id = ?')
            .bind(newPasswordHash, user.id)
            .run();

        return new Response(JSON.stringify({ success: true, message: '密碼修改成功，下次登入請使用新密碼' }), { 
            status: 200,
            headers: { 'Content-Type': 'application/json' }
        });

    } catch (err) {
        console.error('Change Password Error:', err);
        return new Response(JSON.stringify({ error: '系統發生錯誤' }), { status: 500 });
    }
}