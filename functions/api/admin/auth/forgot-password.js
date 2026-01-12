// functions/api/admin/auth/forgot-password.js
import { hashPassword } from '../../utils/auth-helpers.js';

export async function onRequestPost(context) {
    const { request, env } = context;

    try {
        // 前端傳來的雖然 key 叫 email，但實際內容是 "帳號"
        const { email: username } = await request.json();

        if (!username) {
            return new Response(JSON.stringify({ error: '請輸入帳號' }), { status: 400 });
        }

        // 1. 找使用者 (用 email 欄位搜尋帳號)
        const user = await env.DB.prepare('SELECT * FROM Users WHERE email = ?').bind(username).first();

        if (!user) {
            // 為了安全，通常會建議回傳模糊訊息，但依照您的需求：「帳號輸入錯誤就不傳」
            // 這裡我們直接回傳錯誤讓前端知道
            return new Response(JSON.stringify({ error: '找不到此帳號' }), { status: 404 });
        }

        // 2. 檢查是否綁定 LINE
        if (!user.line_user_id) {
            return new Response(JSON.stringify({ error: '此帳號尚未綁定 LINE，無法發送密碼。' }), { status: 400 });
        }

        // 3. 生成臨時密碼 (6碼數字，方便手機輸入)
        const tempPassword = Math.floor(100000 + Math.random() * 900000).toString();

        // 4. 加密並更新資料庫
        const hashedPassword = await hashPassword(tempPassword);
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
            return new Response(JSON.stringify({ error: 'LINE 發送失敗，請檢查系統設定' }), { status: 500 });
        }

    } catch (err) {
        console.error('Forgot Password Error:', err);
        return new Response(JSON.stringify({ error: '系統錯誤' }), { status: 500 });
    }
}

// 輔助函式：發送 LINE 訊息
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
        console.error('LINE Send Error:', e);
        return false;
    }
}