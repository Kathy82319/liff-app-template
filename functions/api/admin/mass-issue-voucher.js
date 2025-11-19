// functions/api/admin/mass-issue-voucher.js

/**
 * 核心發券邏輯
 * @param {object} db - D1 資料庫實例
 * @param {number} templateId - 樣板 ID
 * @param {string} userId - 使用者 ID
 * @param {object} template - 樣板的詳細資料 (包含 .limit_per_user)
 * @returns {Promise<{success: boolean, reason: string}>}
 */
async function issueSingleVoucher(db, templateId, userId, template) {
    // 1. 檢查「每人限領」
    if (template.limit_per_user !== null && template.limit_per_user > 0) {
        try {
            const userCountResult = await db.prepare("SELECT COUNT(voucher_id) as count FROM UserVouchers WHERE template_id = ? AND user_id = ?")
                                             .bind(templateId, userId)
                                             .first();
            const userIssuedCount = userCountResult?.count || 0;
            if (userIssuedCount >= template.limit_per_user) {
                return { success: false, reason: 'exceeded_user_limit' };
            }
        } catch (e) {
            console.error(`[Mass Issue] 檢查用戶 ${userId} 限額失敗: ${e.message}`);
            return { success: false, reason: 'db_error_user_check' };
        }
    }

    // 2. 執行發送
    try {
        await db.prepare("INSERT INTO UserVouchers (template_id, user_id) VALUES (?, ?)")
              .bind(templateId, userId)
              .run();
        return { success: true, reason: 'issued' };
    } catch (e) {
        console.error(`[Mass Issue] 寫入用戶 ${userId} 優惠券失敗: ${e.message}`);
        return { success: false, reason: 'db_error_insert' };
    }
}

/**
 * 輔助函式：發送 LINE Push Message
 */
async function sendPushMessage(accessToken, userId, message) {
    if (!accessToken) {
        throw new Error("LINE_CHANNEL_ACCESS_TOKEN 未設定");
    }
    const response = await fetch('https://api.line.me/v2/bot/message/push', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
            to: userId,
            messages: [{ type: 'text', text: message }],
        }),
    });
    if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        console.error(`[sendPushMessage] LINE API Error for user ${userId}:`, response.status, JSON.stringify(errorData));
        throw new Error(`LINE API Error: ${response.status} ${JSON.stringify(errorData)}`);
    }
    console.log(`[sendPushMessage] 成功發送通知給 ${userId}`);
}


/**
 * 背景執行群發任務
 */
async function runMassIssueTask(context, templateId, userIds, sendNotification) {
    const db = context.env.DB;
    const lineToken = sendNotification ? context.env.LINE_CHANNEL_ACCESS_TOKEN : null; 
    
    console.log(`[Mass Issue Task] 開始為 ${userIds.length} 位使用者發送樣板 ID: ${templateId} (發送通知: ${sendNotification})`);

    try {
        // 1. 獲取樣板規則
        const template = await db.prepare("SELECT * FROM VoucherTemplates WHERE template_id = ? AND is_active = 1")
                               .bind(templateId)
                               .first();
        
        if (!template) {
            console.error(`[Mass Issue Task] 任務中止：樣板 ${templateId} 不存在或未啟用。`);
            return;
        }
        
        if (sendNotification && !lineToken) {
            console.error("[Mass Issue Task] 任務中止：已勾選發送通知，但伺服器未設定 LINE_CHANNEL_ACCESS_TOKEN");
            return;
        }

        // 2. 獲取「當前」已發行數量 (任務開始時的基準)
        const countResult = await db.prepare("SELECT COUNT(voucher_id) as count FROM UserVouchers WHERE template_id = ?")
                                    .bind(templateId)
                                    .first();
        
        let currentTotalIssued = countResult?.count || 0;
        const maxSupply = template.total_supply; 
        
        console.log(`[Mass Issue Task] 樣板 ${templateId}：總量上限 ${maxSupply === null ? '無限' : maxSupply}，目前已發行 ${currentTotalIssued}。`);

        // 3. 遍歷使用者並發送
        let issuedCountThisTask = 0;
        let notificationSentCount = 0;
        
        for (const userId of userIds) {
            // 在迴圈內部檢查總量
            if (maxSupply !== null && currentTotalIssued >= maxSupply) {
                console.warn(`[Mass Issue Task] 樣板 ${templateId} 已達總發行上限 (${maxSupply})。提前中止任務。`);
                break; // 總量已滿，停止發送
            }

            const result = await issueSingleVoucher(db, templateId, userId, template);
            
            if (result.success) {
                issuedCountThisTask++;
                currentTotalIssued++; // 更新計數器
                
                if (sendNotification) {
                    try {
                        const message = `🎁 您已收到一張新的優惠券：\n「${template.title}」\n\n請至會員中心「我的優惠券」頁面查看！`;
                        await sendPushMessage(lineToken, userId, message);
                        notificationSentCount++;
                    } catch (msgError) {
                        console.warn(`[Mass Issue Task] 成功發券給 ${userId}，但發送通知失敗: ${msgError.message}`);
                    }
                }
            } else if (result.reason === 'exceeded_user_limit') {
                console.log(`[Mass Issue Task] 略過 ${userId}：已達個人限領。`);
            } else {
                console.error(`[Mass Issue Task] 發券給 ${userId} 時發生資料庫錯誤: ${result.reason}`);
            }
        }
        
        console.log(`[Mass Issue Task] 任務完成：成功為 ${issuedCountThisTask} / ${userIds.length} 位使用者發送了樣板 ID: ${templateId}。`);

    } catch (error) {
        console.error(`[Mass Issue Task] 執行群發任務時發生嚴重錯誤: ${error.message}`);
    }
}


// --- 主 API 處理函式 ---
export async function onRequest(context) {
    const { request, env } = context;
    const db = env.DB;

    try {
        if (request.method !== 'POST') {
            return new Response(JSON.stringify({ error: '無效的請求方法' }), { status: 405 });
        }

        const body = await request.json();
        const { templateId, filterType, filterValue } = body;
        const sendNotification = body.sendNotification || false;

        // 1. 基本驗證
        if (!templateId || !filterType || filterValue === undefined || filterValue === null) {
            return new Response(JSON.stringify({ error: '缺少樣板 ID、篩選類型或篩選值' }), { status: 400 });
        }

        // --- 【新增】2. 預先檢查優惠券總量 (在查詢使用者前先擋下) ---
        const template = await db.prepare("SELECT title, total_supply, is_active FROM VoucherTemplates WHERE template_id = ?").bind(templateId).first();
        
        if (!template) {
             return new Response(JSON.stringify({ error: '優惠券樣板不存在' }), { status: 404 });
        }
        if (!template.is_active) {
             return new Response(JSON.stringify({ error: '此優惠券樣板已停用，無法發送。' }), { status: 400 });
        }

        let supplyWarning = "";

        if (template.total_supply !== null) {
             const countResult = await db.prepare("SELECT COUNT(voucher_id) as count FROM UserVouchers WHERE template_id = ?").bind(templateId).first();
             const currentCount = countResult?.count || 0;
             
             // 如果已額滿，直接報錯
             if (currentCount >= template.total_supply) {
                  return new Response(JSON.stringify({ 
                      error: `發送失敗：此優惠券已達總發行上限 (${template.total_supply} 張)，目前已發出 ${currentCount} 張。` 
                  }), { status: 409 }); // 409 Conflict
             }

             // 準備剩餘數量資訊
             const remaining = template.total_supply - currentCount;
             supplyWarning = ` (注意：剩餘發行量僅剩 ${remaining} 張，將依序發送至額滿為止)`;
        }
        // --- 檢查結束 ---

        // 3. 檢查 LINE Token (若需要通知)
        if (sendNotification && !context.env.LINE_CHANNEL_ACCESS_TOKEN) {
            return new Response(JSON.stringify({ 
                error: '無法啟動任務：已勾選發送通知，但伺服器未設定 LINE Channel Access Token。' 
            }), { status: 500 });
        }

        // 4. 查詢目標使用者
        let userQuery;
        const queryParams = [filterValue];
        switch (filterType) {
            case 'class': userQuery = "SELECT user_id FROM Users WHERE class = ?"; break;
            case 'tag': userQuery = "SELECT user_id FROM Users WHERE tag = ?"; break;
            case 'level_gt':
                const level = Number(filterValue);
                if (!Number.isInteger(level) || level < 1) return new Response(JSON.stringify({ error: '等級篩選值必須是大於 0 的整數' }), { status: 400 });
                userQuery = "SELECT user_id FROM Users WHERE level >= ?";
                break;
            default: return new Response(JSON.stringify({ error: '無效的篩選類型' }), { status: 400 });
        }

        const { results: users } = await db.prepare(userQuery).bind(...queryParams).all();
        
        if (!users || users.length === 0) {
            return new Response(JSON.stringify({ error: '找不到符合此篩選條件的顧客' }), { status: 404 });
        }
        
        const userIds = users.map(u => u.user_id);

        // --- 【新增】如果目標人數 > 剩餘數量，強化警告訊息 ---
        if (template.total_supply !== null) {
            const countResult = await db.prepare("SELECT COUNT(voucher_id) as count FROM UserVouchers WHERE template_id = ?").bind(templateId).first();
            const currentCount = countResult?.count || 0;
            const remaining = template.total_supply - currentCount;
            
            if (userIds.length > remaining) {
                supplyWarning = `\n⚠️ 警告：目標顧客有 ${userIds.length} 位，但優惠券僅剩 ${remaining} 張！\n系統將隨機或依序發送直到額滿。`;
            }
        }

        // 5. 啟動背景任務
        context.waitUntil(runMassIssueTask(context, Number(templateId), userIds, sendNotification));

        // 6. 回傳成功 (包含警告訊息)
        return new Response(JSON.stringify({ 
            success: true, 
            message: `群發任務已啟動，目標包含 ${userIds.length} 位顧客。${supplyWarning}` 
        }), { 
            status: 202,
            headers: { 'Content-Type': 'application/json' }
        });

    } catch (error) {
        console.error('Mass Issue API Error:', error);
        return new Response(JSON.stringify({ error: '啟動群發任務時發生錯誤', details: error.message }), { 
            status: 500,
            headers: { 'Content-Type': 'application/json' }
        });
    }
}