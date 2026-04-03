// functions/api/admin/auth/update-profile.js
import { verifyPassword, hashPassword } from '../../utils/auth-helpers.js';

export async function onRequestPost(context) {
    const { request, env, data } = context;
    // 修正：從 middleware 取得當前登入者，變數應為 adminUser
    const user = data.adminUser; 

    try {
        // 安全性檢查
        if (!user || !user.id) {
            return new Response(JSON.stringify({ error: '無法驗證身分，請重新登入' }), { status: 401 });
        }

        const { oldPassword, newPassword } = await request.json();

        if (!oldPassword || !newPassword) {
            return new Response(JSON.stringify({ error: '請輸入目前密碼與新密碼' }), { status: 400 });
        }

        // 1. 驗證舊密碼
        const currentUser = await env.DB.prepare('SELECT * FROM Users WHERE id = ?').bind(user.id).first();
        const isValid = await verifyPassword(oldPassword, currentUser.password);
        
        if (!isValid) {
            return new Response(JSON.stringify({ error: '目前密碼錯誤' }), { status: 403 });
        }

        // 2. 執行密碼更新
        const newHash = await hashPassword(newPassword);
        await env.DB.prepare("UPDATE Users SET password = ? WHERE id = ?").bind(newHash, user.id).run();

        return new Response(JSON.stringify({ success: true, message: '密碼更新成功！下次登入請使用新密碼。' }), { status: 200 });

    } catch (err) {
        console.error('Update profile error:', err);
        return new Response(JSON.stringify({ error: '系統發生錯誤，無法更新密碼' }), { status: 500 });
    }
}