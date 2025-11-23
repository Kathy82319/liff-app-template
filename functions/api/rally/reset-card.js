// functions/api/rally/reset-card.js

export async function onRequest(context) {
    const { request, env } = context;
    const db = env.DB;
    const jsonHeaders = { 'Content-Type': 'application/json' };

    try {
        if (request.method !== 'POST') {
            return new Response(JSON.stringify({ error: 'Method Not Allowed' }), { status: 405, headers: jsonHeaders });
        }

        const body = await request.json();
        const { userId, campaignId, resetToken } = body; // resetToken 預留給未來做更嚴格的驗證

        if (!userId || !campaignId) {
            return new Response(JSON.stringify({ error: '缺少必要參數。' }), { status: 400, headers: jsonHeaders });
        }

        // 1. 檢查活動是否允許重複 (can_repeat)
        const campaign = await db.prepare("SELECT title, can_repeat FROM RallyCampaigns WHERE campaign_id = ?")
                                 .bind(campaignId).first();
        
        if (!campaign) return new Response(JSON.stringify({ error: '找不到此活動。' }), { status: 404, headers: jsonHeaders });
        
        if (campaign.can_repeat !== 1) {
             return new Response(JSON.stringify({ error: '此活動設定為不可重複參加。' }), { status: 403, headers: jsonHeaders });
        }

        // 2. 執行封存 (Archive)
        // 將該用戶在此活動下，所有未封存 (is_archived=0) 的紀錄，更新為 1
        const result = await db.prepare(`
            UPDATE UserRallyProgress 
            SET is_archived = 1 
            WHERE user_id = ?1 AND campaign_id = ?2 AND is_archived = 0
        `).bind(userId, campaignId).run();

        if (result.meta.changes === 0) {
             // 如果沒有任何紀錄被更新，代表已經是空的，或者根本沒玩過
             return new Response(JSON.stringify({ 
                 success: true, 
                 message: '您的集點卡已經是空的，無需重置。' 
             }), { status: 200, headers: jsonHeaders });
        }

        // 3. 寫入日誌
        context.waitUntil(db.prepare("INSERT INTO Activities (type, message, link) VALUES (?, ?, ?)")
            .bind('reset_card', `顧客 ${userId.substring(0, 8)}... 重置了活動 "${campaign.title}" 的集點卡`, '#rally')
            .run());

        return new Response(JSON.stringify({ 
            success: true, 
            message: '新集點卡已啟用！\n您可以開始新一輪的集點了。' 
        }), { status: 200, headers: jsonHeaders });

    } catch (error) {
        console.error('Error in rally/reset-card API:', error);
        return new Response(JSON.stringify({ error: '重置失敗', details: error.message }), { status: 500, headers: jsonHeaders });
    }
}