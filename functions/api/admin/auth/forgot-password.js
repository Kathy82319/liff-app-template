// functions/api/admin/auth/forgot-password.js
import { hashPassword } from '../../utils/auth-helpers.js';

export async function onRequestPost(context) {
    const { request, env } = context;

    try {
        // 🟢 修改點：前端現在會傳送 { "username": "admin" }
        const { username } = await request.json();

        if (!username) {
            return new Response(JSON.stringify({ error: '請輸入帳號' }), { status: 400 });
        }

        // 1. 找使用者 (用 email 欄位搜尋帳號，因為我們把帳號存在 email 欄位)
        const user = await env.DB.prepare('SELECT * FROM Users WHERE email = ?').bind(username).first();

        if (!user) {
            return new Response(JSON.stringify({ error: '找不到此帳號' }), { status: 404 });
        }

        // 2. 檢查是否綁定 LINE
        if (!user.line_user_id) {
            return new Response(JSON.stringify({ error: '此帳號尚未綁定 LINE，無法發送密碼。' }), { status: 400 });
        }

        // 3. 生成臨時密碼 (6碼數字)
        const tempPassword = Math.floor(100000 + Math.random() * 900000).toString();

        // 4. 加密並更新資料庫
        const hashedPassword = await hashPassword(tempPassword);
        
        // 🟢 因為第一步重建了表格，現在 id 欄位一定存在，這行不會再報錯了
        await env.DB.prepare('UPDATE Users SET password = ? WHERE id = ?')
            .bind(hashedPassword, user.id)
            .run();

        // 5. 發送 LINE 通知
        const lineResult = await sendLineMessage(env.CHANNEL_ACCESS_TOKEN, user.line_user_id, tempPassword);

        if (lineResult) {
            return new Response(JSON.stringify({ 
                success: true, 
                message: `臨時密碼已發送至您的 LINE，請查收。` 
            }), { status: 200 });
        } else {
            return new Response(JSON.stringify({ error: 'LINE 發送失敗，請檢查 Token 是否正確' }), { status: 500 });
        }

    } catch (err) {
        console.error('Forgot Password Error:', err);
        return new Response(JSON.stringify({ error: `系統錯誤: ${err.message}` }), { status: 500 });
    }
}

// 輔助函式維持不變...
async function sendLineMessage(token, userId, tempPassword) {
    if (!token) return false;
    try {
        const response = await fetch('https://api.line.me/v2/bot/message/push', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({
                to: userId,
                messages: [{
                    type: 'text',
                    text: `【重置密碼通知】\n您的臨時密碼是：${tempPassword}\n請使用此密碼登入後，盡快修改您的密碼。`
                }]
            })
        });
        return response.ok;
    } catch (e) {
        return false;
    }
}