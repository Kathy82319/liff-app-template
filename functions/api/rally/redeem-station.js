// functions/api/rally/redeem-station.js

export async function onRequest(context) {
    const { request, env } = context;
    const db = env.DB;
    const jsonHeaders = { 'Content-Type': 'application/json' };

    try {
        if (request.method !== 'POST') return new Response(JSON.stringify({ error: 'Method Not Allowed' }), { status: 405, headers: jsonHeaders });

        const body = await request.json();
        const { userId, partnerCode } = body;

        if (!userId || !partnerCode) return new Response(JSON.stringify({ error: '缺少必要參數。' }), { status: 400, headers: jsonHeaders });
        
        // 1. 驗證站點與活動
        const station = await db.prepare(`
            SELECT 
                s.station_id, s.campaign_id, s.name AS station_name, s.expiry_date,
                c.title AS campaign_title, c.required_stamps, c.reward_voucher_id, c.end_date, c.is_active AS campaign_active
            FROM RallyStations s
            JOIN RallyCampaigns c ON s.campaign_id = c.campaign_id
            WHERE s.unique_partner_code = ?1 AND s.is_active = 1
        `).bind(partnerCode).first();

        if (!station) return new Response(JSON.stringify({ error: '無效的 QR Code 或站點已停用。' }), { status: 404, headers: jsonHeaders });
        if (station.campaign_active !== 1) return new Response(JSON.stringify({ error: '此活動已結束。' }), { status: 403, headers: jsonHeaders });
        
        const now = new Date();
        if (station.end_date && new Date(station.end_date + 'T23:59:59') < now) return new Response(JSON.stringify({ error: '此活動已結束。' }), { status: 403, headers: jsonHeaders });
        if (station.expiry_date && new Date(station.expiry_date + 'T23:59:59') < now) return new Response(JSON.stringify({ error: '此站點的集點效期已截止。' }), { status: 403, headers: jsonHeaders });


        // 2. 【核心修正】檢查「當前集點卡」進度 (只看 is_archived = 0)
        const currentStats = await db.prepare(`
            SELECT COUNT(station_id) as stamp_count FROM UserRallyProgress 
            WHERE user_id = ?1 AND campaign_id = ?2 AND is_archived = 0
        `).bind(userId, station.campaign_id).first();
        
        const currentStamps = currentStats?.stamp_count || 0;


        // 3. 檢查是否重複集點 (只檢查 is_archived = 0)
        const existingProgress = await db.prepare(`
            SELECT progress_id FROM UserRallyProgress 
            WHERE user_id = ?1 AND campaign_id = ?2 AND station_id = ?3 AND is_archived = 0
        `).bind(userId, station.campaign_id, station.station_id).first();

        if (existingProgress) {
            return new Response(JSON.stringify({ 
                success: false, 
                message: `您這張卡已經集過 "${station.station_name}" 了喔！`, 
                status: 'already_stamped' 
            }), { status: 200, headers: jsonHeaders });
        }
        
        // 4. [新增] 檢查集點卡是否已滿 (放在這裡才能確保重複集點檢查優先)
        // 如果已滿，且不是重複集點，則提示需要重置
        if (currentStamps >= station.required_stamps) {
             return new Response(JSON.stringify({ 
                success: false, 
                message: `您的集點卡已集滿！\n請掃描店家的「重置 QR Code」啟用新卡，才能繼續集點。`, 
                status: 'card_full' 
            }), { status: 200, headers: jsonHeaders });
        }
        

        // 5. 執行集點 (寫入進度，預設 is_archived = 0)
        await db.prepare(`
            INSERT INTO UserRallyProgress (user_id, campaign_id, station_id, is_archived) 
            VALUES (?1, ?2, ?3, 0)
        `).bind(userId, station.campaign_id, station.station_id).run();

        // 更新集點後的點數 (現在確定是 currentStamps + 1)
        const newStampCount = currentStamps + 1;
        
        let rewardMessage = `集點成功！\n目前進度：${newStampCount} / ${station.required_stamps}`;
        let prizeIssued = false;

        // 6. 檢查是否達標 (剛好集滿的那一刻)
        if (newStampCount === station.required_stamps) {
            
            // 檢查是否已發放 (避免重複發放獎勵)
            const rewardCheckStmt = db.prepare(`
                SELECT voucher_id FROM UserVouchers 
                WHERE user_id = ?1 AND template_id = ?2 AND source = 'rally_campaign' AND is_used = 0
            `);
            const existingReward = await rewardCheckStmt.bind(userId, station.reward_voucher_id).first();

            if (!existingReward) {
                // --- 獎勵發放邏輯 ---
                await db.prepare("INSERT INTO UserVouchers (template_id, user_id, source) VALUES (?, ?, ?)")
                      .bind(station.reward_voucher_id, userId, 'rally_campaign').run();
                
                rewardMessage = `🎉 恭喜集滿 ${station.required_stamps} 點！\n獎勵優惠券已發送到您的帳戶。`;
                prizeIssued = true;
                
                // [新增] 發送 LINE 通知
                if (env.LINE_CHANNEL_ACCESS_TOKEN) {
                    const LIFF_BASE_ID = "2008032417-3yJQGaO6";
                    const flexMessage = {
                        to: userId,
                        messages: [{
                            type: "flex",
                            altText: "🎉 恭喜獲得集點獎勵！",
                            contents: {
                                type: "bubble",
                                body: {
                                    type: "box", layout: "vertical",
                                    contents: [
                                        { type: "text", text: "🎉 集點任務完成！", weight: "bold", color: "#1DB446", size: "sm" },
                                        { type: "text", text: "恭喜獲得獎勵優惠券", weight: "bold", size: "xl", margin: "md", wrap: true },
                                        { type: "text", text: `您已完成「${station.campaign_title}」活動。`, size: "sm", color: "#666666", margin: "md", wrap: true }
                                    ]
                                },
                                footer: {
                                    type: "box", layout: "vertical", spacing: "sm",
                                    contents: [
                                        { type: "button", style: "primary", height: "sm", action: { type: "uri", label: "查看我的優惠券", uri: `https://liff.line.me/${LIFF_BASE_ID}/#my-vouchers` }, color: "#58a6ff" }
                                    ], flex: 0
                                }
                            }
                        }]
                    };
                    context.waitUntil(
                        fetch('https://api.line.me/v2/bot/message/push', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${env.LINE_CHANNEL_ACCESS_TOKEN}` },
                            body: JSON.stringify(flexMessage),
                        }).catch(console.error)
                    );
                }
            } else {
                 rewardMessage = `恭喜集滿！\n但獎勵已發放或達領取上限。`;
            }
        }
        
        // 7. 寫入後台日誌
        const activityMsg = `顧客 ${userId.substring(0, 8)}... 集點 "${station.station_name}"，總進度 ${newStampCount} / ${station.required_stamps}`;
        context.waitUntil(db.prepare("INSERT INTO Activities (type, message, link) VALUES (?, ?, ?)")
            .bind('new_stamp', activityMsg, `#rally-${station.campaign_id}`).run());
      
        return new Response(JSON.stringify({ 
            success: true, 
            message: rewardMessage,
            status: prizeIssued ? 'reward_issued' : 'stamped',
            current_stamps: newStampCount,
            required_stamps: station.required_stamps
        }), { status: 200, headers: jsonHeaders });

    } catch (error) {
        console.error('Error in rally/redeem-station API:', error);
        return new Response(JSON.stringify({ error: '集點失敗', details: error.message }), { status: 500, headers: jsonHeaders });
    }
}