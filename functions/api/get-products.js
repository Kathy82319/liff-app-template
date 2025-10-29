// functions/api/get-products.js (Google Sheet Sync Removed)

export async function onRequest(context) {
    const { request, env } = context;
    const db = env.DB;

    try {
        // --- Handle GET requests ONLY ---
        if (request.method === 'GET') {
            console.log("[get-products API] Handling GET request..."); // Add log
            const stmt = db.prepare('SELECT * FROM Products ORDER BY display_order ASC');
            const { results } = await stmt.all();
            console.log(`[get-products API] Fetched ${results?.length || 0} products from D1.`); // Add log
            return new Response(JSON.stringify(results || []), {
                status: 200, headers: { 'Content-Type': 'application/json' },
            });
        }

        // --- Block POST requests ---
        if (request.method === 'POST') {
             console.warn("[get-products API] Received POST request - Sync is disabled."); // Add log
             // Return an error or a message indicating sync is disabled
             return new Response(JSON.stringify({ success: false, message: 'Google Sheet synchronization is disabled.' }), {
                  status: 405, // Method Not Allowed
                  headers: { 'Content-Type': 'application/json' }
             });
        }

        // --- Handle other methods ---
        console.warn(`[get-products API] Received invalid method: ${request.method}`); // Add log
        return new Response('Invalid request method.', { status: 405 });

    } catch (error) {
        console.error(`Error in get-products API:`, error);
        return new Response(JSON.stringify({ error: '獲取產品列表失敗。', details: error.message }), {
            status: 500, headers: { 'Content-Type': 'application/json' },
        });
    }
}