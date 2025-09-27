// functions/api/admin/get-avatar.js
export async function onRequest(context) {
  try {
    const { request, env } = context;
    const url = new URL(request.url);
    const userId = url.searchParams.get('userId');

    if (!userId) {
      return new Response('Missing userId parameter', { status: 400 });
    }

    const db = env.DB;
    const user = await db.prepare("SELECT line_picture_url FROM Users WHERE user_id = ?").bind(userId).first();
    const imageUrl = user?.line_picture_url;

    // --- 【安全強化】主機名稱白名單 ---
    const ALLOWED_HOSTNAMES = ['profile.line-scdn.net'];
    let isValidUrl = false;
    if (imageUrl) {
        try {
            const parsedUrl = new URL(imageUrl);
            if (ALLOWED_HOSTNAMES.includes(parsedUrl.hostname)) {
                isValidUrl = true;
            }
        } catch (e) { /* URL 格式不正確，忽略 */ }
    }

    if (isValidUrl) {
      const imageResponse = await fetch(imageUrl);
      if (imageResponse.ok) {
        return new Response(imageResponse.body, {
          headers: {
            'Content-Type': imageResponse.headers.get('Content-Type') || 'image/jpeg',
            'Cache-Control': 'public, max-age=86400'
          },
        });
      }
    }

    const placeholderAvatar = '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100" viewBox="0 0 24 24" fill="#E0E0E0"><path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/></svg>';
    return new Response(placeholderAvatar, { headers: { 'Content-Type': 'image/svg+xml' } });

  } catch (error) {
    console.error('Error in get-avatar API:', error);
    return new Response('Error fetching avatar', { status: 500 });
  }
}