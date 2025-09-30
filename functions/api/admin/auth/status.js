// functions/api/admin/auth/status.js

export async function onRequest(context) {
    // 這個 API 的主要目的是通過 admin middleware 的驗證
    // 如果 middleware 驗證成功 (代表 token 有效)，就會執行到這裡
    // 如果驗證失敗，middleware 會直接回傳 401，不會進到這段程式碼

    // 從 middleware 取得已驗證的使用者資訊並回傳
    const user = context.data.user;

    if (user) {
        return new Response(JSON.stringify({ loggedIn: true, userId: user.userId, role: user.role }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
        });
    } else {
        // 雖然理論上不會執行到這裡，但作為一個保險措施
        return new Response(JSON.stringify({ loggedIn: false, error: 'User data not found in context' }), {
            status: 401,
            headers: { 'Content-Type': 'application/json' },
        });
    }
}