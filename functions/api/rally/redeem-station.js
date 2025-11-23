// functions/api/rally/redeem-station.js

export async function onRequest(context) {
    const { request, env } = context;
    const db = env.DB;

    // 標準 JSON 回應標頭
    const jsonHeaders = { 'Content-Type': 'application/json' };

    try {
        if (request.method !== 'POST') {
            return new Response(JSON.stringify({ error: 'Method Not Allowed' }), { status: 405, headers: jsonHeaders });
        }

        const body = await request.json();
        const { userId, partnerCode } = body;

        if (!userId || !partnerCode) {
            return new Response(JSON.stringify({ error: '缺少使用者 ID 或夥伴代碼。' }), { status: 400, headers: jsonHeaders });
        }
        
        // 1. 驗證站點與活動
        const station = await db.prepare(`
            SELECT 
                s.station_id, s.campaign_id, s.name AS station_name, s.expiry_date,
                c.title AS campaign_title, c.required_stamps, c.reward_voucher_id, c.end_date, c.is_active AS campaign_active
            FROM RallyStations s
            JOIN RallyCampaigns c ON s.campaign_id = c.campaign_id
            WHERE s.unique_partner_code = ?1 AND s.is_active = 1
        `).bind(partnerCode).first();

        if (!station) {
            return new Response(JSON.stringify({ error: '無效的 QR Code 或站點已停用。' }), { status: 404, headers: jsonHeaders });
        }
        
        if (station.campaign_active !== 1) {
             return new Response(JSON.stringify({ error: '此活動已結束。' }), { status: 403, headers: jsonHeaders });
        }

        // 2. 檢查是否重複集點
        const existingProgress = await db.prepare(`
            SELECT progress_id FROM UserRallyProgress 
            WHERE user_id = ?1 AND campaign_id = ?2 AND station_id = ?3
        `).bind(userId, station.campaign_id, station.station_id).first();

        if (existingProgress) {
            return new Response(JSON.stringify({ 
                success: false, 
                message: `您已經集過 "${station.station_name}" 了喔！`, 
                status: 'already_stamped' 
            }), { status: 200, headers: jsonHeaders });
        }

        // 3. 執行集點
        await db.prepare(`
            INSERT INTO UserRallyProgress (user_id, campaign_id, station_id) 
            VALUES (?1, ?2, ?3)
        `).bind(userId, station.campaign_id, station.station_id).run();

        // 4. 計算當前總點數
        const { stamp_count } = await db.prepare(`
            SELECT COUNT(station_id) as stamp_count FROM UserRallyProgress 
            WHERE user_id = ?1 AND campaign_id = ?2
        `).bind(userId, station.campaign_id).first();
        
        let rewardMessage = `集點成功！\n目前進度：${stamp_count} / ${station.required_stamps}`;
        let prizeIssued = false;

        // 5. 檢查是否達標 (>= 要求點數)
        if (stamp_count >= station.required_stamps) {
            
            // 檢查是否已經發過這個獎勵 (使用 template_id 和 user_id 檢查)
            // 注意：這裡移除了 source = 'rally_campaign' 的檢查，以確保相容性
            const existingReward = await db.prepare(`
                SELECT voucher_id FROM UserVouchers 
                WHERE user_id = ?1 AND template_id = ?2
            `).bind(userId, station.reward_voucher_id).first();

            if (!existingReward) {
                // --- 發放獎勵 (移除 source 欄位) ---
                await db.prepare("INSERT INTO UserVouchers (template_id, user_id) VALUES (?, ?)")
                      .bind(station.reward_voucher_id, userId)
                      .run();
                
                rewardMessage = `🎉 恭喜集滿 ${station.required_stamps} 點！\n獎勵優惠券已發送至您的帳戶。`;
                prizeIssued = true;

                // --- 新增：發送 LINE 推播通知 ---
                if (env.LINE_CHANNEL_ACCESS_TOKEN) {
                    const pushMessage = {
                        to: userId,
                        messages: [{
                            type: "flex",
                            altText: "🎉 恭喜獲得集點獎勵！",
                            contents: {
                                type: "bubble",
                                body: {
                                    type: "box",
                                    layout: "vertical",
                                    contents: [
                                        { type: "text", text: "🎉 集點任務完成！", weight: "bold", color: "#1DB446", size: "sm" },
                                        { type: "text", text: "恭喜獲得獎勵優惠券", weight: "bold", size: "xl", margin: "md", wrap: true },
                                        { type: "text", text: `您已完成「${station.campaign_title}」活動，優惠券已存入您的帳戶。`, size: "sm", color: "#666666", margin: "md", wrap: true }
                                    ]
                                }
                            }
                        }]
                    };
                    
                    context.waitUntil(
                        fetch('https://api.line.me/v2/bot/message/push', {
                            method: 'POST',
                            headers: {
                                'Content-Type': 'application/json',
                                'Authorization': `Bearer ${env.LINE_CHANNEL_ACCESS_TOKEN}`,
                            },
                            body: JSON.stringify(pushMessage),
                        }).catch(err => console.error("LINE Push Failed:", err))
                    );
                }

            } else {
                rewardMessage = `集點成功！\n(您之前已領取過此活動獎勵)`;
            }
        }
        
        // 6. 寫入後台活動日誌
        context.waitUntil(db.prepare("INSERT INTO Activities (type, message, link) VALUES (?, ?, ?)")
            .bind('new_stamp', `顧客 ${userId.substring(0, 8)}... 集點 "${station.station_name}" (${stamp_count}/${station.required_stamps})`, '#rally')
            .run());
      
        return new Response(JSON.stringify({ 
            success: true, 
            message: rewardMessage,
            status: prizeIssued ? 'reward_issued' : 'stamped',
            current_stamps: stamp_count,
            required_stamps: station.required_stamps
        }), { status: 200, headers: jsonHeaders });

    } catch (error) {
        console.error('Error in rally/redeem-station API:', error);
        return new Response(JSON.stringify({ error: '系統錯誤，請稍後再試', details: error.message }), {
            status: 500, headers: jsonHeaders 
        });
    }
}