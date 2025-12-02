// public/owner/api.js
import { displayInlineError } from './ui.js'; // 引用 UI 模組處理錯誤顯示

export async function fetchData(url, options = {}) {
    const skipGlobalError = options.skipGlobalError || false; 
    
    try {
        const defaultOptions = { credentials: 'same-origin' }; // 確保帶上 Cookie
        const finalOptions = { 
            ...defaultOptions, 
            ...options,
            headers: { 
                ...defaultOptions.headers, 
                ...options.headers 
            } 
        };

        const response = await fetch(url, finalOptions);
        
        // 處理 204 No Content
        if (response.status === 204) return { success: true };

        // 處理非 200-299 的錯誤狀態
        if (!response.ok) {
            const errorText = await response.text();
            let errorMsg = `API 錯誤 (${response.status})`;
            try {
                // 嘗試解析 JSON 錯誤訊息
                const errorJson = JSON.parse(errorText);
                if (errorJson.error) errorMsg = errorJson.error;
            } catch (e) {
                // 解析失敗則使用原始文字
                if (errorText) errorMsg += `: ${errorText.substring(0, 100)}`;
            }
            throw new Error(errorMsg);
        }

        const text = await response.text();
        try {
            return JSON.parse(text);
        } catch (e) {
                console.warn(`API ${url} 回應非 JSON:`, text.substring(0, 50));
                throw new Error(`伺服器回應格式錯誤 (非 JSON)`);
        }
    } catch (error) {
        console.error("[fetchData Error]", error);
        
        // 只有在「沒有」設定 skipGlobalError 時才彈出視窗
        if (!skipGlobalError) {
            alert(`操作失敗：${error.message}`);
            
            // 嘗試顯示在當前 Tab 的錯誤區塊 (如果有的話)
            const activeTabId = document.querySelector('.tab-content.active')?.id || 'loading-view';
            if (activeTabId !== 'loading-view') {
                    // 避免在 loading 畫面顯示錯誤文字
                    displayInlineError(error.message, 'activity-list-content'); 
            }
        }
        // 務必將錯誤繼續拋出，讓呼叫者 (如 main) 可以 catch 到並停止 loading
        throw error; 
    }
}