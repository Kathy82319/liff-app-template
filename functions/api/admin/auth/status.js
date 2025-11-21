// functions/api/admin/auth/status.js

export async function onRequest(context) {
    // 修改：讀取 'adminUser' 而不是 'user'
    const user = context.data.adminUser; // <--- 關鍵修正

    if (user) {
        return new Response(JSON.stringify({ loggedIn: true, userId: user.userId, role: user.role }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
        });
    } else {
        return new Response(JSON.stringify({ loggedIn: false, error: 'User context missing' }), {
            status: 401,
            headers: { 'Content-Type': 'application/json' },
        });
    }
}