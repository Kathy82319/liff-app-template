const statusFilter = url.searchParams.get('status');
    // --- ▼▼▼ 新增詳細 Debug Log ▼▼▼ ---
    if (statusFilter) {
        console.log(`[API get-bookings v8 DEBUG] Raw statusFilter: "${statusFilter}"`);
        console.log(`[API get-bookings v8 DEBUG] typeof statusFilter: ${typeof statusFilter}`);
        console.log(`[API get-bookings v8 DEBUG] statusFilter length: ${statusFilter.length}`);
        // 比較字串本身的 Character Code
        const filterCodes = Array.from(statusFilter).map(char => char.charCodeAt(0)).join(',');
        const literalCodes = Array.from('checked-in').map(char => char.charCodeAt(0)).join(',');
        console.log(`[API get-bookings v8 DEBUG] statusFilter char codes: [${filterCodes}]`);
        console.log(`[API get-bookings v8 DEBUG] "checked-in" char codes: [${literalCodes}]`);
        console.log(`[API get-bookings v8 DEBUG] Strict comparison (=== 'checked-in'): ${statusFilter === 'checked-in'}`);
        // 嘗試 trim 後比較
        const trimmedStatusFilter = statusFilter.trim();
        console.log(`[API get-bookings v8 DEBUG] Trimmed statusFilter: "${trimmedStatusFilter}"`);
        console.log(`[API get-bookings v8 DEBUG] Trimmed comparison (=== 'checked-in'): ${trimmedStatusFilter === 'checked-in'}`);
    } else {
        console.log(`[API get-bookings v8 DEBUG] statusFilter is null or empty.`);
    }
    // --- ▲▲▲ Debug Log 結束 ▲▲▲ ---

    // ... (後續的 if/else if 判斷邏輯保持 v7 版本不變) ...
    let query = "SELECT b.* FROM Bookings b"; // Alias table
    const conditions = [];
    const queryParams = [];

    // --- 1. Status Filter (使用 trim() 增強判斷 v8) ---
    const trimmedStatusFilter = statusFilter ? statusFilter.trim() : null; // <<<< 使用 Trimmed 版本比較

    if (trimmedStatusFilter && trimmedStatusFilter !== 'all') {
        // Log 進入哪個分支
        if (trimmedStatusFilter === 'today') {
            console.log("[API get-bookings v8 DEBUG] Matched: today");
            conditions.push("b.booking_date = date('now', 'localtime')");
            conditions.push("b.status IN ('confirmed', 'checked-in', 'no-show')");
        } else if (trimmedStatusFilter === 'all_upcoming') {
            console.log("[API get-bookings v8 DEBUG] Matched: all_upcoming");
            conditions.push("b.booking_date >= date('now', 'localtime')");
            conditions.push("b.status IN ('confirmed', 'checked-in', 'no-show')");
        } else if (trimmedStatusFilter === 'confirmed') {
             console.log("[API get-bookings v8 DEBUG] Matched: confirmed");
             conditions.push("b.booking_date >= date('now', 'localtime')");
             conditions.push(`b.status = ?${queryParams.length + 1}`);
             queryParams.push('confirmed');
        } else if (trimmedStatusFilter === 'checked-in') {
             console.log("[API get-bookings v8 DEBUG] Matched: checked-in"); // <<<< 預期這裡會 Log
             conditions.push(`b.status = ?${queryParams.length + 1}`);
             queryParams.push('checked-in');
        } else if (trimmedStatusFilter === 'no-show') {
             console.log("[API get-bookings v8 DEBUG] Matched: no-show");
             conditions.push(`b.status = ?${queryParams.length + 1}`);
             queryParams.push('no-show');
        } else if (trimmedStatusFilter === 'cancelled') {
             console.log("[API get-bookings v8 DEBUG] Matched: cancelled");
             conditions.push(`b.status = ?${queryParams.length + 1}`);
             queryParams.push('cancelled');
        } else {
             // 只有在真的無法匹配時才 Log 警告
             console.warn(`[API get-bookings v8] Could not match trimmed status filter: "${trimmedStatusFilter}"`);
        }
    } else if (!trimmedStatusFilter) {
        console.log("[API get-bookings v8 DEBUG] Status filter is null, empty, or 'all'. No status condition added.");
    }
    // ... (後續的日期和搜尋條件、SQL 執行等保持不變) ...