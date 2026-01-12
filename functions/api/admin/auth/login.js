// functions/api/admin/auth/login.js
import { verifyPassword, generateToken } from '../../utils/auth-helpers.js';

export async function onRequestPost(context) {
    const { request, env } = context;

    try {
        // 前端傳來的 key 可能是 "email" (配合舊代碼) 或 "username"
        // 我們統一接收，並視為 "accountId"
        const body = await request.json();
        const accountId = body.username || body.email; // 兼容兩種寫法
        const password = body.password;

        if (!accountId || !password) {
            return new Response(JSON.stringify({ error: '請輸入帳號與密碼' }), { status: 400 });
        }

        // 🟢 修改點：使用 id 欄位來搜尋使用者 (取代 email)
        const user = await env.DB.prepare('SELECT * FROM Users WHERE id = ?').bind(accountId).first();

        if (!user) {
            return new Response(JSON.stringify({ error: '帳號或密碼錯誤' }), { status: 401 });
        }

        // 驗證密碼
        const isValid = await verifyPassword(password, user.password);

        if (!isValid) {
            return new Response(JSON.stringify({ error: '帳號或密碼錯誤' }), { status: 401 });
        }

        if (user.role !== 'admin') {
            return new Response(JSON.stringify({ error: '權限不足' }), { status: 403 });
        }

        // 產生 Token
        const token = await generateToken({ 
            id: user.id, 
            role: user.role 
        }, env.JWT_SECRET);

        return new Response(JSON.stringify({ 
            success: true,
            token: token,
            user: { id: user.id, role: user.role }
        }), { 
            status: 200,
            headers: { 'Content-Type': 'application/json' }
        });

    } catch (err) {
        return new Response(JSON.stringify({ error: '系統錯誤' }), { status: 500 });
    }
}