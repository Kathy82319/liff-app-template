// functions/api/admin/reset-default-admin.js
import { hashPassword } from '../utils/auth-helpers.js';

export async function onRequest(context) {
    const { env } = context;

    try {
        const defaultUser = 'admin';
        const defaultPass = '333221';
        
        // 計算密碼雜湊
        const hashedPassword = await hashPassword(defaultPass);

        // 1. 先檢查帳號是否存在
        const existingUser = await env.DB.prepare("SELECT id FROM Users WHERE email = ?").bind(defaultUser).first();

        if (existingUser) {
            // A. 如果存在 -> 執行 UPDATE (更新密碼與權限，不刪除人)
            await env.DB.prepare(
                "UPDATE Users SET password = ?, role = 'admin', name = '預設管理員' WHERE email = ?"
            )
            .bind(hashedPassword, defaultUser)
            .run();
        } else {
            // B. 如果不存在 -> 執行 INSERT (新增)
            await env.DB.prepare(
                "INSERT INTO Users (name, email, password, role) VALUES (?, ?, ?, ?)"
            )
            .bind('預設管理員', defaultUser, hashedPassword, 'admin')
            .run();
        }

        return new Response(JSON.stringify({
            success: true,
            message: `成功！帳號已重置。請使用 帳號: ${defaultUser} / 密碼: ${defaultPass} 登入。`
        }), { 
            status: 200,
            headers: { 'Content-Type': 'application/json' }
        });

    } catch (err) {
        return new Response(JSON.stringify({ error: `重置失敗: ${err.message}` }), { status: 500 });
    }
}