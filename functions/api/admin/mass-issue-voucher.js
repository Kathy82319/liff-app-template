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
        // 可能是資料庫錯誤，例如 UNIQUE 限制 (雖然我們應該在上面擋掉)
        return { success: false, reason: 'db_error_insert' };
    }
}


/**
 * 背景執行群發任務
 * @param {object} context - Cloudflare context
 * @param {number} templateId - 樣板 ID
 * @param {Array<string>} userIds - 目標使用者 ID 列表
 */
async function runMassIssueTask(context, templateId, userIds) {
    const db = context.env.DB;
    console.log(`[Mass Issue Task] 開始為 ${userIds.length} 位使用者發送樣板 ID: ${templateId}`);

    try {
        // 1. 獲取樣板規則 (只需查詢一次)
        const template = await db.prepare("SELECT * FROM VoucherTemplates WHERE template_id = ? AND is_active = 1")
                               .bind(templateId)
                               .first();
        
        if (!template) {
            console.error(`[Mass Issue Task] 任務中止：樣板 ${templateId} 不存在或未啟用。`);
            return;
        }

        // 2. 檢查「發行總量」 (只需檢查一次)
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
            
            // 如果剩餘數量少於目標人數，只取剩餘數量的目標
            if (userIds.length > remainingSupply) {
                console.warn(`[Mass Issue Task] 樣板 ${templateId} 剩餘 ${remainingSupply} 張，但目標為 ${userIds.length} 人。將只發送給前 ${remainingSupply} 位符合資格的使用者。`);
                userIds = userIds.slice(0, remainingSupply);
            }
        }

        // 3. 遍歷使用者並發送
        let issuedCount = 0;
        for (const userId of userIds) {
            const result = await issueSingleVoucher(db, templateId, userId, template);
            if (result.success) {
                issuedCount++;
            }
            // 我們不為 "exceeded_user_limit" 停下，因為這在群發中是正常情況
        }
        console.log(`[Mass Issue Task] 任務完成：成功為 ${issuedCount} / ${userIds.length} 位使用者發送了樣板 ID: ${templateId}`);

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

        const { templateId, filterType, filterValue } = await request.json();

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
                // 確保等級是大於等於 1 的整數
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

        // 4. 啟動背景任務
        context.waitUntil(runMassIssueTask(context, Number(templateId), userIds));

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