// functions/api/admin/mass-issue-voucher.js

/**
 * 核心發券邏輯 (從 issue-voucher.js 抽離並修改)
 * @param {object} db - D1 資料庫實例
 * @param {number} templateId - 樣板 ID
 * @param {string} userId - 使用者 ID
 * @param {object} template - 樣板的詳細資料 (包含 .total_supply, .limit_per_user)
 * @returns {Promise<{success: boolean, reason: string}>}
 */
async function issueSingleVoucher(db, templateId, userId, template) {
    // ... (此輔助函式內容不變) ...
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

// --- ▼▼▼ 新增：發送 LINE 訊息的輔助函式 ▼▼▼ ---
/**
 * 輔助函式：發送 LINE Push Message
 * @param {string} accessToken - LINE Channel Access Token
 * @param {string} userId - 目標使用者 ID
 * @param {string} message - 要發送的文字訊息
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
// --- ▲▲▲ 新增結束 ▲▲▲ ---


/**
 * 背景執行群發任務
 * @param {object} context - Cloudflare context
 * @param {number} templateId - 樣板 ID
 * @param {Array<string>} userIds - 目標使用者 ID 列表
 * @param {boolean} sendNotification - 是否發送通知
 */
// --- ▼▼▼ 修改：runMassIssueTask 函式簽章與內部邏輯 ▼▼▼ ---
async function runMassIssueTask(context, templateId, userIds, sendNotification) {
    const db = context.env.DB;
    // 只有在需要時才獲取 token
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
        
        // --- 新增：如果需要發送通知，但 Token 不存在，則中止 ---
        if (sendNotification && !lineToken) {
            console.error("[Mass Issue Task] 任務中止：已勾選發送通知，但伺服器未設定 LINE_CHANNEL_ACCESS_TOKEN");
            return;
        }
        // --- 新增結束 ---

        // 2. 檢查「發行總量」 (邏輯不變)
        if (template.total_supply !== null && template.total_supply > 0) {
            const countResult = await db.prepare("SELECT COUNT(voucher_id) as count FROM UserVouchers WHERE template_id = ?")
                                        .bind(templateId)
                                        .first();
            const issuedCount = countResult?.count || 0;
            const remainingSupply = template.total_supply - issuedCount;

            if (remainingSupply <= 0) {
                console.error(`[Mass Issue Task] 任務中止：樣板 ${templateId} 已達總發行上限。`);
                return;
            }
            
            if (userIds.length > remainingSupply) {
                console.warn(`[Mass Issue Task] 樣板 ${templateId} 剩餘 ${remainingSupply} 張，但目標為 ${userIds.length} 人。將只發送給前 ${remainingSupply} 位符合資格的使用者。`);
                userIds = userIds.slice(0, remainingSupply);
            }
        }

        // 3. 遍歷使用者並發送
        let issuedCount = 0;
        let notificationSentCount = 0; // <-- 追蹤通知
        
        for (const userId of userIds) {
            const result = await issueSingleVoucher(db, templateId, userId, template);
            if (result.success) {
                issuedCount++;
                
                // --- 修改：如果發券成功 *且* 需要通知 ---
                if (sendNotification) {
                    try {
                        const message = `🎁 您已收到一張新的優惠券：\n「${template.title}」\n\n請至會員中心「我的優惠券」頁面查看！`;
                        await sendPushMessage(lineToken, userId, message);
                        notificationSentCount++;
                    } catch (msgError) {
                        // 即使通知失敗，券也已經發了，所以只記錄警告
                        console.warn(`[Mass Issue Task] 成功發券給 ${userId}，但發送通知失敗: ${msgError.message}`);
                    }
                }
                // --- 修改結束 ---
            }
            // 我們不為 "exceeded_user_limit" 停下，因為這在群發中是正常情況
        }
        console.log(`[Mass Issue Task] 任務完成：成功為 ${issuedCount} / ${userIds.length} 位使用者發送了樣板 ID: ${templateId}。成功發送 ${notificationSentCount} 則通知。`);

    } catch (error) {
        console.error(`[Mass Issue Task] 執行群發任務時發生嚴重錯誤: ${error.message}`);
    }
}
// --- ▲▲▲ 修改結束 ▲▲▲ ---


// --- 主 API 處理函式 ---
export async function onRequest(context) {
    const { request, env } = context;
    const db = env.DB;

    try {
        if (request.method !== 'POST') {
            return new Response(JSON.stringify({ error: '無效的請求方法' }), { status: 405 });
        }

        // --- ▼▼▼ 修改：讀取 sendNotification ▼▼▼ ---
        const body = await request.json();
        const { templateId, filterType, filterValue } = body;
        const sendNotification = body.sendNotification || false; // 讀取新值，預設為 false
        // --- ▲▲▲ 修改結束 ▲▲▲ ---

        // 1. 驗證輸入
        if (!templateId || !filterType || filterValue === undefined || filterValue === null) {
            return new Response(JSON.stringify({ error: '缺少樣板 ID、篩選類型或篩選值' }), { status: 400 });
        }
        
        const validFilterTypes = ['class', 'tag', 'level_gt'];
        if (!validFilterTypes.includes(filterType)) {
            return new Response(JSON.stringify({ error: '無效的篩選類型' }), { status: 400 });
        }

        // 2. 根據篩選器建立查詢
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

        // 3. 查詢目標使用者
        const { results: users } = await db.prepare(userQuery).bind(...queryParams).all();
        
        if (!users || users.length === 0) {
            return new Response(JSON.stringify({ error: '找不到符合此篩選條件的顧客' }), { status: 404 });
        }
        
        const userIds = users.map(u => u.user_id);

        // --- ▼▼▼ 修改：傳遞 sendNotification 到背景任務 ▼▼▼ ---
        // 4. 啟動背景任務
        context.waitUntil(runMassIssueTask(context, Number(templateId), userIds, sendNotification));
        // --- ▲▲▲ 修改結束 ▲▲▲ ---

        // 5. 立即回傳
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