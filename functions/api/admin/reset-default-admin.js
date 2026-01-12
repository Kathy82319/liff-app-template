// functions/api/admin/reset-default-admin.js
import { hashPassword } from '../utils/auth-helpers.js';

export async function onRequest(context) {
    const { env } = context;

    try {
        const defaultUser = 'admin';
        const defaultPass = '333221';
        
        // 1. 加密密碼
        const hashedPassword = await hashPassword(defaultPass);

        // 2. 生成一個固定的 ID (因為您的欄位是 TEXT，我們手動給值)
        const adminId = 'admin_001'; 

        // 3. 檢查帳號是否存在 (用 email 欄位當帳號)
        const existingUser = await env.DB.prepare("SELECT * FROM Users WHERE email = ?").bind(defaultUser).first();

        if (existingUser) {
            // A. 如果存在 -> 強制更新 ID, 密碼, 角色
            await env.DB.prepare(
                "UPDATE Users SET password = ?, role = 'admin', id = ? WHERE email = ?"
            )
            .bind(hashedPassword, adminId, defaultUser)
            .run();
        } else {
            // B. 如果不存在 -> 新增一筆，並明確寫入 ID
            await env.DB.prepare(
                "INSERT INTO Users (id, name, email, password, role) VALUES (?, ?, ?, ?, ?)"
            )
            .bind(adminId, '預設管理員', defaultUser, hashedPassword, 'admin')
            .run();
        }

        return new Response(JSON.stringify({
            success: true,
            message: `修復成功！\n帳號: ${defaultUser}\n密碼: ${defaultPass}\nID已設定為: ${adminId}`
        }), { 
            status: 200,
            headers: { 'Content-Type': 'application/json' }
        });

    } catch (err) {
        return new Response(JSON.stringify({ 
            error: `資料庫錯誤: ${err.message}`,
            detail: "請確認 Users 表格是否有 id (TEXT) 和 email 欄位"
        }), { status: 500 });
    }
}