// functions/api/admin/reset-default-admin.js
import { hashPassword } from '../utils/auth-helpers.js';

export async function onRequest(context) {
    const { env } = context;

    try {
        const targetId = 'admin'; // 將 ID 直接當作帳號
        const targetPass = '333221';
        
        // 1. 加密密碼
        const hashedPassword = await hashPassword(targetPass);

        // 2. 檢查此 ID 是否存在
        const existingUser = await env.DB.prepare("SELECT * FROM Users WHERE id = ?").bind(targetId).first();

        if (existingUser) {
            // A. 存在 -> 只更新密碼與角色 (不更新 name/email 因為欄位不存在)
            await env.DB.prepare(
                "UPDATE Users SET password = ?, role = 'admin' WHERE id = ?"
            )
            .bind(hashedPassword, targetId)
            .run();
        } else {
            // B. 不存在 -> 新增 (只寫入 id, password, role)
            // 🟢 這裡移除了 name 和 email 欄位
            await env.DB.prepare(
                "INSERT INTO Users (id, password, role) VALUES (?, ?, ?)"
            )
            .bind(targetId, hashedPassword, 'admin')
            .run();
        }

        return new Response(JSON.stringify({
            success: true,
            message: `修復成功！\n帳號 (ID): ${targetId}\n密碼: ${targetPass}`
        }), { 
            status: 200,
            headers: { 'Content-Type': 'application/json' }
        });

    } catch (err) {
        return new Response(JSON.stringify({ 
            error: `資料庫錯誤: ${err.message}`,
            detail: "請確認 Users 表格有 id (TEXT), password, role 欄位"
        }), { status: 500 });
    }
}