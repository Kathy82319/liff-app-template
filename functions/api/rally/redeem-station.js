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

        // 2. [新增] 檢查「當前集點卡」是否已集滿 (防偷跑)
        // 如果 is_archived = 0 的點數已經夠了，就不能再掃其他點，必須先去重置
        const currentStats = await db.prepare(`
            SELECT COUNT(station_id) as stamp_count FROM UserRallyProgress 
            WHERE user_id = ?1 AND campaign_id = ?2 AND is_archived = 0
        `).bind(userId, station.campaign_id).first();
        
        const currentStamps = currentStats?.stamp_count || 0;

        // 如果已經集滿了 (>= 需求)，且使用者試圖掃描 (不管是新點還是舊點)，都提示要去換卡
        // 例外：如果是掃描最後一點的那一刻，currentStamps 會是 required - 1 (因為還沒寫入)，所以這裡判斷 >= required
        if (currentStamps >= station.required_stamps) {
             return new Response(JSON.stringify({ 
                success: false, 
                message: `您的集點卡已集滿！\n請返回民宿櫃台啟用新卡，才能繼續集點。`, 
                status: 'card_full' 
            }), { status: 200, headers: jsonHeaders });
        }

        // 3. [修改] 檢查是否重複集點 (只檢查 is_archived = 0)
        // 這樣如果上一輪 (is_archived=1) 掃過這個點，這一輪 (is_archived=0) 還是可以再掃
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

        // 4. [修改] 執行集點 (預設 is_archived = 0)
        await db.prepare(`
            INSERT INTO UserRallyProgress (user_id, campaign_id, station_id, is_archived) 
            VALUES (?1, ?2, ?3, 0)
        `).bind(userId, station.campaign_id, station.station_id).run();

        // 更新集點後的點數
        const newStampCount = currentStamps + 1;
        
        let rewardMessage = `集點成功！\n目前進度：${newStampCount} / ${station.required_stamps}`;
        let prizeIssued = false;

        // 5. 檢查是否達標 (剛好集滿的那一刻)
        if (newStampCount === station.required_stamps) {
            
            // [雙重鎖] 1. 讀取優惠券樣板設定
            const template = await db.prepare("SELECT limit_per_user, total_supply FROM VoucherTemplates WHERE template_id = ?")
                                   .bind(station.reward_voucher_id).first();

            if (template) {
                // [雙重鎖] 2. 檢查個人領取上限
                const userVoucherCount = await db.prepare("SELECT COUNT(*) as count FROM UserVouchers WHERE user_id = ? AND template_id = ?")
                                                 .bind(userId, station.reward_voucher_id).first();
                
                // [雙重鎖] 3. 檢查總發行量
                const totalIssuedCount = await db.prepare("SELECT COUNT(*) as count FROM UserVouchers WHERE template_id = ?")
                                                 .bind(station.reward_voucher_id).first();

                const currentCount = userVoucherCount?.count || 0;
                const globalCount = totalIssuedCount?.count || 0;
                const limit = template.limit_per_user || 1;
                const supply = template.total_supply; // null 表示無限

                // 庫存與上限檢查
                if (supply !== null && globalCount >= supply) {
                    rewardMessage = `恭喜集滿！\n但很抱歉，活動獎勵已全數兌換完畢。`;
                } else if (currentCount >= limit) {
                    rewardMessage = `集點成功！\n(您已達此獎勵的領取上限 ${limit} 張)`;
                } else {
                    // 發放獎勵
                    await db.prepare("INSERT INTO UserVouchers (template_id, user_id) VALUES (?, ?)")
                          .bind(station.reward_voucher_id, userId).run();
                    
                    rewardMessage = `🎉 恭喜集滿 ${station.required_stamps} 點！\n獎勵優惠券已發送至您的帳戶。`;
                    prizeIssued = true;

                    // 發送 LINE 通知
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
                                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${env.LINE_CHANNEL_ACCESS_TOKEN}` },
                                body: JSON.stringify(pushMessage),
                            }).catch(console.error)
                        );
                    }
                }
            }
        }
        
        // 6. 寫入後台日誌
        context.waitUntil(db.prepare("INSERT INTO Activities (type, message, link) VALUES (?, ?, ?)")
            .bind('new_stamp', `顧客 ${userId.substring(0, 8)}... 集點 "${station.station_name}" (${newStampCount}/${station.required_stamps})`, '#rally')
            .run());
      
        return new Response(JSON.stringify({ 
            success: true, 
            message: rewardMessage,
            status: prizeIssued ? 'reward_issued' : 'stamped',
            current_stamps: newStampCount,
            required_stamps: station.required_stamps
        }), { status: 200, headers: jsonHeaders });

    } catch (error) {
        console.error('Error in rally/redeem-station API:', error);
        return new Response(JSON.stringify({ error: '系統錯誤', details: error.message }), { status: 500, headers: jsonHeaders });
    }
}