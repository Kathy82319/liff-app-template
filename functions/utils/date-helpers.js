// functions/api/utils/date-helpers.js - 日期輔助函式共用庫

/**
 * 取得指定日期範圍內的所有日期字串 (包含起日和迄日)
 * @param {string} startDateString - 起始日期 (e.g., '2025-11-20')
 * @param {string} endDateString - 結束日期 (e.g., '2025-11-22')
 * @returns {string[]} 日期字串陣列 (e.g., ['2025-11-20', '2025-11-21', '2025-11-22'])
 */
export function getDateRange(startDateString, endDateString) {
  const dateRange = [];
  // 為了避免時區問題，我們通常會將日期字串轉換為 UTC 0 點開始
  let currentDate = new Date(startDateString + 'T00:00:00Z');
  const endDate = new Date(endDateString + 'T00:00:00Z');

  // 確保日期有效
  if (isNaN(currentDate.getTime()) || isNaN(endDate.getTime())) {
      throw new Error("Invalid date input for getDateRange.");
  }

  while (currentDate <= endDate) {
    // 輸出 ISO 格式的日期部分
    dateRange.push(currentDate.toISOString().split('T')[0]);
    // 增加一天
    currentDate.setUTCDate(currentDate.getUTCDate() + 1);
  }
  return dateRange;
}

/**
 * 取得指定日期是星期幾
 * @param {string} dateString - 日期字串 (e.g., '2025-11-20')
 * @returns {number} 星期幾的數字 (0 = 星期日, 1 = 星期一, ..., 6 = 星期六)
 */
export function getDayOfWeek(dateString) {
  // 同樣使用 UTC 避免時區偏差
  const date = new Date(dateString + 'T00:00:00Z');
  if (isNaN(date.getTime())) {
      throw new Error("Invalid date input for getDayOfWeek.");
  }
  return date.getUTCDay(); // 0 = Sunday, 1 = Monday, ..., 6 = Saturday
}

// 您的專案可能還有其他重複的日期函式，請一併移入此檔案並加上 export
// 例如：
/*
export function isWeekend(dateString) {
    const day = getDayOfWeek(dateString);
    return day === 0 || day === 6;
}
*/