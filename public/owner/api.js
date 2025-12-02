// public/owner/api.js
import { displayInlineError } from './ui.js';

async function fetchData(url, options = {}) {
    const skipGlobalError = options.skipGlobalError || false; 
    
    try {
        const defaultOptions = { credentials: 'same-origin' }; 
        const finalOptions = { 
            ...defaultOptions, 
            ...options,
            headers: { 
                ...defaultOptions.headers, 
                ...options.headers 
            } 
        };

        const response = await fetch(url, finalOptions);
        
        if (response.status === 204) return { success: true };

        if (!response.ok) {
            const errorText = await response.text();
            let errorMsg = `API 錯誤 (${response.status})`;
            try {
                const errorJson = JSON.parse(errorText);
                if (errorJson.error) errorMsg = errorJson.error;
            } catch (e) {}
            throw new Error(errorMsg);
        }

        const text = await response.text();
        try {
            return JSON.parse(text);
        } catch (e) {
            throw new Error(`伺服器回應格式錯誤`);
        }
    } catch (error) {
        console.error("[fetchData Error]", error);
        if (!skipGlobalError) {
            alert(`操作失敗：${error.message}`);
            const activeTabId = document.querySelector('.tab-content.active')?.id || 'loading-view';
            if (activeTabId !== 'loading-view') {
                displayInlineError(error.message, 'activity-list-content'); 
            }
        }
        throw error; 
    }
}

// 【修正重點】將函式包裝在 api 物件中匯出，讓 app.js 可以用 api.fetchData 呼叫
export const api = {
    fetchData
};