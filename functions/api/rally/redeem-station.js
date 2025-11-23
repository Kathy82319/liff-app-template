import { customAlphabet } from 'nanoid';

export async function onRequest(context) {
    const { request, env } = context;
    const db = env.DB;

    try {
        if (request.method !== 'POST') {
            return new Response(JSON.stringify({ error: '無效的請求方法' }), { status: 405 });
        }

        const { userId, partnerCode } = await request.json();

        if (!userId || !partnerCode) {
            return new Response(JSON.stringify({ error: '缺少使用者 ID 或夥伴代碼。' }), { status: 400 });
        }
        
        // 1. 查找站點與所屬活動
        const stationStmt = db.prepare(`
            SELECT 
                s.station_id, s.campaign_id, s.name AS station_name, s.expiry_date,
                c.title AS campaign_title, c.required_stamps, c.reward_voucher_id, c.end_date, c.is_active AS campaign_active
            FROM RallyStations s
            JOIN RallyCampaigns c ON s.campaign_id = c.campaign_id
            WHERE s.unique_partner_code = ?1 AND s.is_active = 1
        `);
        const station = await stationStmt.bind(partnerCode).first();

        if (!station) {
            return new Response(JSON.stringify({ error: '此集點站點代碼無效或未啟用。' }), { status: 404 });
        }
        
        // 2. 驗證活動狀態與效期
        if (station.campaign_active !== 1) {
             return new Response(JSON.stringify({ error: `活動 "${station.campaign_title}" 已暫停或結束。` }), { status: 403 });
        }
        const now = new Date();
        if (station.end_date && new Date(station.end_date + 'T23:59:59') < now) {
             return new Response(JSON.stringify({ error: `活動 "${station.campaign_title}" 已於 ${station.end_date} 結束。` }), { status: 403 });
        }
        if (station.expiry_date && new Date(station.expiry_date + 'T23:59:59') < now) {
             return new Response(JSON.stringify({ error: `此站點的集點效期已於 ${station.expiry_date} 截止。` }), { status: 403 });
        }
        
        // 3. 檢查用戶是否已集過此站點
        const progressCheckStmt = db.prepare(`
            SELECT progress_id FROM UserRallyProgress 
            WHERE user_id = ?1 AND campaign_id = ?2 AND station_id = ?3
        `);
        const existingProgress = await progressCheckStmt.bind(userId, station.campaign_id, station.station_id).first();

        if (existingProgress) {
            return new Response(JSON.stringify({ success: false, message: `您已集過站點 "${station.station_name}"。`, status: 'already_stamped' }), { status: 200 });
        }

        // 4. 執行集點 (寫入進度)
        const insertProgressStmt = db.prepare(`
            INSERT INTO UserRallyProgress (user_id, campaign_id, station_id) 
            VALUES (?1, ?2, ?3)
        `);
        await insertProgressStmt.bind(userId, station.campaign_id, station.station_id).run();

        // 5. 檢查集點數量是否達標
        const currentStampCountStmt = db.prepare(`
            SELECT COUNT(station_id) as stamp_count FROM UserRallyProgress 
            WHERE user_id = ?1 AND campaign_id = ?2
        `);
        const { stamp_count } = await currentStampCountStmt.bind(userId, station.campaign_id).first();
        
        let rewardMessage = `集點成功！您已集滿 ${stamp_count} / ${station.required_stamps} 點。`;
        let prizeIssued = false;

        // 6. 達標且獎勵尚未發放
        if (stamp_count >= station.required_stamps) {
            
            // 檢查獎勵是否已發放 (避免重複發放獎勵)
            const rewardCheckStmt = db.prepare(`
                SELECT voucher_id FROM UserVouchers 
                WHERE user_id = ?1 AND template_id = ?2 AND source = 'rally_campaign'
            `);
            const existingReward = await rewardCheckStmt.bind(userId, station.reward_voucher_id).first();

            if (!existingReward) {
                // --- 獎勵發放邏輯 ---
                const issueVoucherStmt = db.prepare("INSERT INTO UserVouchers (template_id, user_id, source) VALUES (?, ?, ?)");
                await issueVoucherStmt.bind(station.reward_voucher_id, userId, 'rally_campaign').run();
                
                rewardMessage = `恭喜您集滿 ${station.required_stamps} 點！活動獎勵已發放到您的優惠券帳戶中。`;
                prizeIssued = true;
            }
        }
        
        // 7. 寫入活動紀錄 (Admin 用)
        const activityStmt = db.prepare("INSERT INTO Activities (type, message, link) VALUES (?, ?, ?)");
        const activityMsg = `顧客 ${userId} 成功集點 "${station.station_name}"，總進度 ${stamp_count} / ${station.required_stamps}`;
        const activityLink = `#rally-${station.campaign_id}`;
        context.waitUntil(activityStmt.bind('new_stamp', activityMsg, activityLink).run());
      
        return new Response(JSON.stringify({ 
            success: true, 
            message: rewardMessage,
            status: prizeIssued ? 'reward_issued' : 'stamped',
            current_stamps: stamp_count,
            required_stamps: station.required_stamps
        }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
        });

    } catch (error) {
        console.error('Error in rally/redeem-station API:', error);
        return new Response(JSON.stringify({ error: '集點失敗', details: error.message }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' },
        });
    }
}