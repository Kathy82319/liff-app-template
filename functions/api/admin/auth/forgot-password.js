// functions/api/admin/auth/forgot-password.js
import { hashPassword } from '../../utils/auth-helpers';

export async function onRequestPost(context) {
    const { request, env } = context;

    try {
        const { email } = await request.json();

        if (!email) {
            return new Response(JSON.stringify({ error: '請輸入 Email' }), { status: 400 });
        }

        // 1. 找使用者
        const user = await env.DB.prepare('SELECT * FROM Users WHERE email = ?').bind(email).first();

        if (!user) {
            // 為了安全，即使 Email 不存在也回傳成功 (避免被掃描帳號)，或者回傳模糊錯誤
            // 這裡為了方便測試，我們先回傳錯誤
            return new Response(JSON.stringify({ error: '找不到此 Email 的使用者' }), { status: 404 });
        }

        // 2. 生成臨時密碼 (8碼亂數)
        const tempPassword = Math.random().toString(36).slice(-8);

        // 3. 加密並更新資料庫
        const hashedPassword = await hashPassword(tempPassword);
        await env.DB.prepare('UPDATE Users SET password = ? WHERE id = ?')
            .bind(hashedPassword, user.id)
            .run();

        // 4. 發送通知 (優先使用 LINE，因為不需額外 Email 設定)
        let messageSent = false;
        let method = '';

        // --- 嘗試 1: LINE 通知 ---
        if (user.line_user_id && env.CHANNEL_ACCESS_TOKEN) {
            const lineResult = await sendLineMessage(env.CHANNEL_ACCESS_TOKEN, user.line_user_id, tempPassword);
            if (lineResult) {
                messageSent = true;
                method = 'LINE';
            }
        }

        // --- 嘗試 2: Email 通知 (如果您有設定 Brevo/SendGrid) ---
        // 需在 Cloudflare 後台設定變數: EMAIL_API_KEY
        if (!messageSent && env.EMAIL_API_KEY) {
            const emailResult = await sendEmail(env.EMAIL_API_KEY, email, tempPassword);
            if (emailResult) {
                messageSent = true;
                method = 'Email';
            }
        }

        if (messageSent) {
            return new Response(JSON.stringify({ 
                success: true, 
                message: `臨時密碼已發送至您的 ${method === 'LINE' ? 'LINE 聊天室' : 'Email 信箱'}，請查收後登入並修改密碼。` 
            }), { status: 200 });
        } else {
            // 如果都沒有發送成功 (例如沒有綁定 LINE 且沒有設定 Email API)
            // 在開發階段，我們可以暫時把密碼回傳 (正式上線請拿掉這一行!)
            console.log(`[DEBUG] Temp Password for ${email}: ${tempPassword}`);
            
            return new Response(JSON.stringify({ 
                error: '無法發送通知 (未綁定 LINE 且未設定 Email 服務)。請聯繫系統管理員。' 
            }), { status: 500 });
        }

    } catch (err) {
        console.error('Forgot Password Error:', err);
        return new Response(JSON.stringify({ error: '系統錯誤' }), { status: 500 });
    }
}

// 輔助函式：發送 LINE 訊息
async function sendLineMessage(token, userId, tempPassword) {
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

// 輔助函式：發送 Email (以 Brevo 為例，需申請免費 Key)
async function sendEmail(apiKey, toEmail, tempPassword) {
    try {
        // 這裡以 Brevo (Sendinblue) 為例
        const response = await fetch('https://api.brevo.com/v3/smtp/email', {
            method: 'POST',
            headers: {
                'accept': 'application/json',
                'api-key': apiKey,
                'content-type': 'application/json'
            },
            body: JSON.stringify({
                sender: { name: "系統管理員", email: "no-reply@yourdomain.com" },
                to: [{ email: toEmail }],
                subject: "重置密碼通知",
                htmlContent: `<p>您的臨時密碼是：<strong>${tempPassword}</strong></p><p>請登入後盡快修改。</p>`
            })
        });
        return response.ok;
    } catch (e) {
        console.error('Email Send Error:', e);
        return false;
    }
}