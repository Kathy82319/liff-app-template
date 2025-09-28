// functions/api/admin/reset-demo-data.js (專門清空資料庫的)

export async function onRequest(context) {
    try {
        if (context.request.method !== 'POST') {
            return new Response(JSON.stringify({ error: '無效的請求方法' }), { status: 405 });
        }

        const db = context.env.DB;

        // 我們將會清空交易性質的資料表，但保留 Users 和 Products 等基礎資料
        const tablesToClear = [
            'Bookings',
            'Rentals',
            'Purchasehistory'
        ];

        const operations = tablesToClear.map(tableName => 
            db.prepare(`DELETE FROM ${tableName}`)
        );

        // 使用 batch 一次性執行所有刪除操作
        await db.batch(operations);

        return new Response(JSON.stringify({ success: true, message: '所有展示資料已成功清空' }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
        });

    } catch (error) {
        console.error('Error in reset-demo-data API:', error);
        return new Response(JSON.stringify({ error: '重置資料時發生錯誤', details: error.message }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' },
        });
    }
}