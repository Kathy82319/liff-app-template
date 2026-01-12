// functions/api/admin/reset-default-admin.js
import { hashPassword } from '../../utils/auth-helpers';

export async function onRequest(context) {
    const { env } = context;

    try {
        // 1. 設定預設值
        const defaultUser = 'admin';
        const defaultPass = '333221';
        
        // 2. 計算密碼雜湊 (確保跟登入時的演算法一致)
        const hashedPassword = await hashPassword(defaultPass);

        // 3. 執行資料庫操作
        // 先刪除舊的 admin (如果有的話)，避免衝突
        await env.DB.prepare("DELETE FROM Users WHERE email = 'admin' OR role = 'admin'").run();

        // 插入新的預設管理員
        // 我們暫時用 'email' 這個欄位來存 'admin' 這個帳號名稱
        const info = await env.DB.prepare(
            "INSERT INTO Users (name, email, password, role) VALUES (?, ?, ?, ?)"
        )
        .bind('預設管理員', defaultUser, hashedPassword, 'admin')
        .run();

        return new Response(JSON.stringify({
            success: true,
            message: `成功！帳號已重置。請使用 帳號: ${defaultUser} / 密碼: ${defaultPass} 登入。`
        }), { 
            status: 200,
            headers: { 'Content-Type': 'application/json' }
        });

    } catch (err) {
        return new Response(JSON.stringify({ error: err.message }), { status: 500 });
    }
}