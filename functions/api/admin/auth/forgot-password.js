// functions/api/admin/auth/forgot-password.js
import { hashPassword } from '../../utils/auth-helpers.js';

export async function onRequestPost(context) {
    const { request, env } = context;

    try {
        const { username } = await request.json(); // 前端傳來的帳號

        if (!username) {
            return new Response(JSON.stringify({ error: '請輸入帳號' }), { status: 400 });
        }

        // 🟢 修改點：使用 id 欄位來搜尋 (取代 email)
        const user = await env.DB.prepare('SELECT * FROM Users WHERE id = ?').bind(username).first();

        if (!user) {
            return new Response(JSON.stringify({ error: '找不到此帳號' }), { status: 404 });
        }

        // 檢查是否綁定 LINE (如果您的表格有 line_user_id)
        if (!user.line_user_id) {
            return new Response(JSON.stringify({ error: '此帳號未綁定 LINE，無法發送密碼。' }), { status: 400 });
        }

        // 生成與更新密碼
        const tempPassword = Math.floor(100000 + Math.random() * 900000).toString();
        const hashedPassword = await hashPassword(tempPassword);
        
        // 🟢 修改點：確保 Where 條件正確
        await env.DB.prepare('UPDATE Users SET password = ? WHERE id = ?')
            .bind(hashedPassword, user.id)
            .run();

        // 發送 LINE
        const lineResult = await sendLineMessage(env.CHANNEL_ACCESS_TOKEN, user.line_user_id, tempPassword);

        if (lineResult) {
            return new Response(JSON.stringify({ 
                success: true, 
                message: `臨時密碼已發送至您的 LINE。` 
            }), { status: 200 });
        } else {
            return new Response(JSON.stringify({ error: 'LINE 發送失敗' }), { status: 500 });
        }

    } catch (err) {
        return new Response(JSON.stringify({ error: `系統錯誤: ${err.message}` }), { status: 500 });
    }
}

// 輔助函式保持不變
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
                messages: [{ type: 'text', text: `【重置密碼】\n臨時密碼：${tempPassword}` }]
            })
        });
        return response.ok;
    } catch (e) { return false; }
}