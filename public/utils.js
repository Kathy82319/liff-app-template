/**
 * HTML 跳脫函式 (XSS 防護)
 * 將 <, >, &, ", ' 等特殊符號轉換為安全編碼
 * @param {string} unsafe - 可能包含惡意代碼的原始字串
 * @returns {string} 安全的字串
 */
export function escapeHtml(unsafe) {
    if (typeof unsafe !== 'string') return unsafe;
    return unsafe
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}