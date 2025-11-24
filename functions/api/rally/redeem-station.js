// functions/api/rally/redeem-station.js
// 修正：強制將 required_stamps 轉換為 INTEGER，並使用 INSERT OR IGNORE 應對 DB 層級的 UNIQUE 錯誤。

export async function onRequest(context) {
    const { request, env } = context;
    const db = env.DB;
    const jsonHeaders = { 'Content-Type': 'application/json' };

    try {
        if (request.method !== 'POST') return new Response(JSON.stringify({ error: 'Method Not Allowed' }), { status: 405, headers: jsonHeaders });

        const body = await request.json();
        const { userId, partnerCode } = body;

        if (!userId || !partnerCode) return new Response(JSON.stringify({ error: '缺少必要參數。' }), { status: 400, headers: jsonHeaders });
        
        // 1. 驗證站點與活動 (關鍵修正：將 required_stamps 轉為 INTEGER)
        const station = await db.prepare(`
            SELECT 
                s.station_id, s.campaign_id, s.name AS station_name, s.expiry_date,
                c.title AS campaign_title, 
                CAST(c.required_stamps AS INTEGER) AS required_stamps, 
                c.reward_voucher_id, c.end_date, c.is_active AS campaign_active
            FROM RallyStations s
            JOIN RallyCampaigns c ON s.campaign_id = c.campaign_id
            WHERE s.unique_partner_code = ?1 AND s.is_active = 1
        `).bind(partnerCode).first();

        if (!station) return new Response(JSON.stringify({ error: '無效的 QR Code 或站點已停用。' }), { status: 404, headers: jsonHeaders });
        if (station.campaign_active !== 1) return new Response(JSON.stringify({ error: '此活動已結束。' }), { status: 403, headers: jsonHeaders });
        
        const now = new Date();
        if (station.end_date && new Date(station.end_date + 'T23:59:59') < now) return new Response(JSON.stringify({ error: '此活動已結束。' }), { status: 403, headers: jsonHeaders });
        if (station.expiry_date && new Date(station.expiry_date + 'T23:59:59') < now) return new Response(JSON.stringify({ error: '此站點的集點效期已截止。' }), { status: 403, headers: jsonHeaders });

        // 2. 獲取「當前集點卡」點數 (只看 is_archived = 0)
        const currentStats = await db.prepare(`
            SELECT COUNT(DISTINCT station_id) as stamp_count FROM UserRallyProgress 
            WHERE user_id = ?1 AND campaign_id = ?2 AND is_archived = 0
        `).bind(userId, station.campaign_id).first();
        
        const currentStamps = currentStats?.stamp_count || 0;

        // 3. 檢查集點卡是否已滿
        if (currentStamps >= station.required_stamps) {
             return new Response(JSON.stringify({ 
                success: false, 
                message: `您的集點卡已集滿！\n請返回集點地圖頁面，掃描「重置碼」啟用新卡，才能繼續集點。`, 
                status: 'card_full' 
            }), { status: 200, headers: jsonHeaders });
        }

        // 4. 檢查是否重複集點 (只檢查 is_archived = 0)
        const existingActiveProgress = await db.prepare(`
            SELECT progress_id FROM UserRallyProgress 
            WHERE user_id = ?1 AND campaign_id = ?2 AND station_id = ?3 AND is_archived = 0
        `).bind(userId, station.campaign_id, station.station_id).first();

        if (existingActiveProgress) {
            return new Response(JSON.stringify({ 
                success: false, 
                message: `您這張卡已經集過 "${station.station_name}" 了喔！`, 
                status: 'already_stamped' 
            }), { status: 200, headers: jsonHeaders });
        }
        
        // 5. 執行集點 (使用 INSERT OR IGNORE 應對 DB 層級的 UNIQUE 錯誤)
        const insertResult = await db.prepare(`
            INSERT OR IGNORE INTO UserRallyProgress (user_id, campaign_id, station_id, is_archived) 
            VALUES (?1, ?2, ?3, 0)
        `).bind(userId, station.campaign_id, station.station_id).run();

        // 6. 檢查 INSERT 結果 (確保真的有插入)
        if (insertResult.meta.changes === 0) {
             console.error(`[Rally] INSERT OR IGNORE 失敗，被舊的歸檔紀錄阻擋: ${userId}-${station.station_id}`);
             return new Response(JSON.stringify({ 
                success: false, 
                message: `集點失敗：此站點在您的紀錄中已存在。請聯繫店家掃描「重置碼」。`, 
                status: 'archived_conflict' 
            }), { status: 200, headers: jsonHeaders });
        }
        
        // 7. 成功後續處理
        const newStampCount = currentStamps + 1;
        let rewardMessage = `集點成功！\n目前進度：${newStampCount} / ${station.required_stamps}`;
        let prizeIssued = false;

        if (newStampCount === station.required_stamps) {
            
            // 獎勵邏輯 (確認是否達上限)
            const template = await db.prepare("SELECT limit_per_user, total_supply FROM VoucherTemplates WHERE template_id = ?")
                                   .bind(station.reward_voucher_id).first();

            if (template) {
                const userVoucherCount = await db.prepare("SELECT COUNT(*) as count FROM UserVouchers WHERE user_id = ? AND template_id = ?")
                                                 .bind(userId, station.reward_voucher_id).first();
                const totalIssuedCount = await db.prepare("SELECT COUNT(*) as count FROM UserVouchers WHERE template_id = ?")
                                                 .bind(station.reward_voucher_id).first();

                const currentCount = userVoucherCount?.count || 0;
                const globalCount = totalIssuedCount?.count || 0;
                const limit = template.limit_per_user || 1;
                const supply = template.total_supply;

                if (supply !== null && globalCount >= supply) {
                    rewardMessage = `恭喜集滿！\n但很抱歉，活動獎勵已全數兌換完畢。`;
                } else if (currentCount >= limit) {
                    rewardMessage = `集點成功！\n(您已達此獎勵的領取上限 ${limit} 張)`;
                } else {
                    // 發放獎勵
                    await db.prepare("INSERT INTO UserVouchers (template_id, user_id) VALUES (?, ?)").bind(station.reward_voucher_id, userId).run();
                    prizeIssued = true;
                    rewardMessage = `🎉 恭喜集滿 ${station.required_stamps} 點！\n獎勵優惠券已發送到您的帳戶。`;
                    
                    // [LINE 通知]
                    if (env.LINE_CHANNEL_ACCESS_TOKEN) {
                        const LIFF_BASE_ID = "2008032417-3yJQGaO6";
                        const flexMessage = {
                            to: userId,
                            messages: [{
                                type: "flex",
                                altText: "🎉 恭喜獲得集點獎勵！",
                                contents: {
                                    type: "bubble", layout: "vertical",
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
                                            { type: "button", style: "primary", height: "sm", action: { type: "uri", label: "查看我的優惠券", uri: `https://liff.line.me/${LIFF_BASE_ID}/#page-my-vouchers` }, color: "#58a6ff" }
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
                }
            }
        }
        
        // 8. 寫入後台日誌 (省略)
      
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