// functions/api/admin/mass-issue-voucher.js

/**
 * 核心發券邏輯 (保持不變)
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
 * 輔助函式：發送 LINE Push Message (保持不變)
 */
async function sendPushMessage(accessToken, userId, message) {
    // ... (此函式內容不變) ...
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
 * @param {object} context - Cloudflare context
 * @param {number} templateId - 樣板 ID
 * @param {Array<string>} userIds - 目標使用者 ID 列表
 * @param {boolean} sendNotification - 是否發送通知
 */
// --- ▼▼▼ 修正：重寫 runMassIssueTask 邏輯 ▼▼▼ ---
async function runMassIssueTask(context, templateId, userIds, sendNotification) {
    const db = context.env.DB;
    const lineToken = sendNotification ? context.env.LINE_CHANNEL_ACCESS_TOKEN : null; 
    
    console.log(`[Mass Issue Task] 開始為 ${userIds.length} 位使用者發送樣板 ID: ${templateId} (發送通知: ${sendNotification})`);

    try {
        // 1. 獲取樣板規則 (只需查詢一次)
        const template = await db.prepare("SELECT * FROM VoucherTemplates WHERE template_id = ? AND is_active = 1")
                               .bind(templateId)
                               .first();
        
        if (!template) {
            console.error(`[Mass Issue Task] 任務中止：樣板 ${templateId} 不存在或未啟用。`);
            return;
        }
        
        // 檢查 Token (這段邏輯在主線程已做過，但在背景任務中再次確認)
        if (sendNotification && !lineToken) {
            console.error("[Mass Issue Task] 任務中止：已勾選發送通知，但伺服器未設定 LINE_CHANNEL_ACCESS_TOKEN");
            return;
        }

        // 2. 獲取「當前」已發行數量
        const countResult = await db.prepare("SELECT COUNT(voucher_id) as count FROM UserVouchers WHERE template_id = ?")
                                    .bind(templateId)
                                    .first();
        
        // 這是我們在這個任務開始時的計數器
        let currentTotalIssued = countResult?.count || 0;
        const maxSupply = template.total_supply; // e.g., 20
        
        console.log(`[Mass Issue Task] 樣板 ${templateId}：總量上限 ${maxSupply === null ? '無限' : maxSupply}，目前已發行 ${currentTotalIssued}。`);

        // 3. 遍歷使用者並發送
        let issuedCountThisTask = 0;
        let notificationSentCount = 0;
        
        for (const userId of userIds) {
            
            // --- 核心修正：在迴圈*內部*檢查總量 ---
            if (maxSupply !== null && currentTotalIssued >= maxSupply) {
                console.warn(`[Mass Issue Task] 樣板 ${templateId} 已達總發行上限 (${maxSupply})。提前中止任務。`);
                break; // 總量已滿，停止發送
            }

            // 檢查「每人限領」(由 issueSingleVoucher 處理)
            const result = await issueSingleVoucher(db, templateId, userId, template);
            
            if (result.success) {
                // 如果發券成功
                issuedCountThisTask++;
                currentTotalIssued++; // <-- 關鍵：更新我們的即時計數器
                
                // 檢查是否發送通知
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
                // 如果只是超過「每人限領」，我們不視為錯誤，但也不發通知
                console.log(`[Mass Issue Task] 略過 ${userId}：已達個人限領。`);
            } else {
                // 其他資料庫錯誤
                console.error(`[Mass Issue Task] 發券給 ${userId} 時發生資料庫錯誤: ${result.reason}`);
            }
        }
        
        console.log(`[Mass Issue Task] 任務完成：成功為 ${issuedCountThisTask} / ${userIds.length} 位使用者發送了樣板 ID: ${templateId}。成功發送 ${notificationSentCount} 則通知。`);

    } catch (error) {
        console.error(`[Mass Issue Task] 執行群發任務時發生嚴重錯誤: ${error.message}`);
    }
}
// --- ▲▲▲ 修正結束 ▲▲▲ ---


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

        // 1. 驗證輸入 (不變)
        if (!templateId || !filterType || filterValue === undefined || filterValue === null) {
            return new Response(JSON.stringify({ error: '缺少樣板 ID、篩選類型或篩選值' }), { status: 400 });
        }
        // ... (其他驗證不變) ...
        const validFilterTypes = ['class', 'tag', 'level_gt'];
        if (!validFilterTypes.includes(filterType)) {
            return new Response(JSON.stringify({ error: '無效的篩選類型' }), { status: 400 });
        }

        // --- ▼▼▼ 修正：在啟動背景任務前，先檢查 LINE Token 是否存在 ▼▼▼ ---
        if (sendNotification && !context.env.LINE_CHANNEL_ACCESS_TOKEN) {
            console.error("[Mass Issue API] 請求群發並通知，但伺服器未設定 LINE_CHANNEL_ACCESS_TOKEN");
            // 立即回傳 500 錯誤，而不是默默失敗
            return new Response(JSON.stringify({ 
                error: '無法啟動任務：已勾選發送通知，但伺服器未設定 LINE Channel Access Token。' 
            }), { 
                status: 500, // Internal Server Error
                headers: { 'Content-Type': 'application/json' }
            });
        }
        // --- ▲▲▲ 修正結束 ▲▲▲ ---

        // 2. 根據篩選器建立查詢 (不變)
        let userQuery;
        const queryParams = [filterValue];
        
        switch (filterType) {
            case 'class':
                userQuery = "SELECT user_id FROM Users WHERE class = ?";
                break;
            case 'tag':
                userQuery = "SELECT user_id FROM Users WHERE tag = ?";
                break;
            case 'level_gt':
                const level = Number(filterValue);
                if (!Number.isInteger(level) || level < 1) {
                    return new Response(JSON.stringify({ error: '等級篩選值必須是大於 0 的整數' }), { status: 400 });
                }
                userQuery = "SELECT user_id FROM Users WHERE level >= ?";
                break;
        }

        // 3. 查詢目標使用者 (不變)
        const { results: users } = await db.prepare(userQuery).bind(...queryParams).all();
        
        if (!users || users.length === 0) {
            return new Response(JSON.stringify({ error: '找不到符合此篩選條件的顧客' }), { status: 404 });
        }
        
        const userIds = users.map(u => u.user_id);

        // 4. 啟動背景任務 (不變)
        context.waitUntil(runMassIssueTask(context, Number(templateId), userIds, sendNotification));

        // 5. 立即回傳 (不變)
        return new Response(JSON.stringify({ 
            success: true, 
            message: `群發任務已啟動，目標 ${userIds.length} 位顧客。` 
        }), { 
            status: 202, // 202 Accepted
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