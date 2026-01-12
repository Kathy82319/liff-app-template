// functions/api/admin/auth/update-profile.js
import { verifyPassword, hashPassword } from '../../utils/auth-helpers';

export async function onRequestPost(context) {
    const { request, env, data } = context;
    const user = data.user; // 從 middleware 取得當前登入者

    try {
        const { newUsername, oldPassword, newPassword } = await request.json();

        if (!oldPassword) {
            return new Response(JSON.stringify({ error: '請輸入目前密碼以確認身分' }), { status: 400 });
        }

        // 1. 驗證舊密碼
        const currentUser = await env.DB.prepare('SELECT * FROM Users WHERE id = ?').bind(user.id).first();
        const isValid = await verifyPassword(oldPassword, currentUser.password);
        
        if (!isValid) {
            return new Response(JSON.stringify({ error: '目前密碼錯誤' }), { status: 403 });
        }

        // 2. 準備更新 SQL
        let sql = "UPDATE Users SET ";
        let params = [];
        let updates = [];

        // 如果有輸入新帳號
        if (newUsername && newUsername.trim() !== '') {
            updates.push("email = ?"); // 我們用 email 欄位存帳號
            params.push(newUsername.trim());
        }

        // 如果有輸入新密碼
        if (newPassword && newPassword.trim() !== '') {
            const newHash = await hashPassword(newPassword);
            updates.push("password = ?");
            params.push(newHash);
        }

        if (updates.length === 0) {
            return new Response(JSON.stringify({ error: '沒有任何變更' }), { status: 400 });
        }

        sql += updates.join(", ") + " WHERE id = ?";
        params.push(user.id);

        // 3. 執行更新
        await env.DB.prepare(sql).bind(...params).run();

        return new Response(JSON.stringify({ success: true, message: '更新成功！下次登入請使用新資料。' }), { status: 200 });

    } catch (err) {
        return new Response(JSON.stringify({ error: '更新失敗 (帳號可能已被使用)' }), { status: 500 });
    }
}