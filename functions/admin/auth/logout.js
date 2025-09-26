// functions/api/admin/auth/logout.js
export async function onRequest(context) {
    const headers = new Headers();
    headers.set('Set-Cookie', `AuthToken=; HttpOnly; Secure; Path=/; Max-Age=0; SameSite=Lax`);
    return new Response(JSON.stringify({ success: true }), { status: 200, headers: headers });
}