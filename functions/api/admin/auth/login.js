import { verifyPassword, generateToken } from '../../utils/auth-helpers';

export async function onRequestPost(context) {
    const { request, env } = context;

    try {
        // 1. 取得前端傳來的帳號 (email) 與密碼
        const { email, password } = await request.json();

        if (!email || !password) {
            return new Response(JSON.stringify({ error: '請輸入帳號與密碼' }), { status: 400 });
        }

        // 2. 從資料庫尋找使用者
        // 注意：這裡假設您的資料庫表名為 Users，且 email 欄位唯一
        const user = await env.DB.prepare('SELECT * FROM Users WHERE email = ?').bind(email).first();

        if (!user) {
            // 為了安全，找不到使用者時也回傳模糊的錯誤訊息
            return new Response(JSON.stringify({ error: '帳號或密碼錯誤' }), { status: 401 });
        }

        // 3. 驗證密碼
        const isValid = await verifyPassword(password, user.password);

        if (!isValid) {
            return new Response(JSON.stringify({ error: '帳號或密碼錯誤' }), { status: 401 });
        }

        // ==========================================
        // 🔴 安全修正：檢查是否為管理員 (Admin Check)
        // ==========================================
        if (user.role !== 'admin') {
            return new Response(JSON.stringify({ error: '權限不足：僅限管理員登入' }), { 
                status: 403,
                headers: { 'Content-Type': 'application/json' }
            });
        }
        // ==========================================

        // 4. 產生 JWT Token
        // 這裡通常會把使用者 ID 和 Role 放入 Token 中
        const token = await generateToken({ 
            id: user.id, 
            email: user.email, 
            role: user.role 
        }, env.JWT_SECRET);

        // 5. 回傳成功與 Token
        return new Response(JSON.stringify({ 
            success: true,
            token: token,
            user: {
                id: user.id,
                email: user.email,
                name: user.name,
                role: user.role
            }
        }), { 
            status: 200,
            headers: { 'Content-Type': 'application/json' }
        });

    } catch (err) {
        console.error('Login Error:', err);
        return new Response(JSON.stringify({ error: '系統發生錯誤，請稍後再試' }), { status: 500 });
    }
}