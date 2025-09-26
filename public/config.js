/**
 * =================================================================
 * 全域中央設定檔 (Global Application Configuration)
 * =================================================================
 * 此檔案為整個應用程式的「總控制面板」。
 * 修改此處的設定，即可快速為不同行業的店家部署客製化版本。
 *
 * !! 注意 !!
 * 此檔案將會被前端直接讀取，請勿在此存放任何敏感資訊，
 * 例如 API 金鑰、密碼、加密密鑰等。
 * 敏感資訊必須存放在 Cloudflare 的環境變數中。
 */

window.APP_CONFIG = {
  // =================================================================
  // 1. 功能開關 (FEATURES)
  // 控制核心功能的啟用與否。true 為啟用，false 為停用。
  // 前後端都會讀取這些開關，動態調整介面與 API 功能。
  // =================================================================
  FEATURES: {
    // 是否啟用會員積分/等級系統？
    // 若為 false，將隱藏所有等級、積分相關介面，以及後台的掃碼加點功能。
    ENABLE_MEMBERSHIP_SYSTEM: true,

    // 是否啟用產品/服務的「租借」功能？
    // 這通常適用於實體商品、器材、場地等。
    // 若為 false，將隱藏租借相關的所有介面與邏輯。
    ENABLE_RENTAL_SYSTEM: true,

    // 是否啟用線上預約系統？
    // 適用於服務、課程、場地預約。
    ENABLE_BOOKING_SYSTEM: true,

    // 是否啟用線上金流支付功能？(未來擴充)
    // 若為 true，在結帳或預約頁面會顯示「線上支付」按鈕。
    ENABLE_PAYMENT_GATEWAY: false,

    // 是否啟用購物車與線上訂單功能？(未來擴充)
    ENABLE_SHOPPING_CART: false,
    
    // 是否啟用簡易分析儀表板？
    ENABLE_ANALYTICS_SYSTEM: true,
  },

  // =================================================================
  // 2. 商業術語 (TERMS)
  // 定義整個應用程式中顯示的客製化文字。
  // =================================================================
  TERMS: {
    // 店家或品牌的名稱
    BUSINESS_NAME: "範例商店",

    // 系統中對「產品」或「服務」的總稱。
    // 範例：商品 / 課程 / 器材 / 場地 / 桌遊
    PRODUCT_NAME: "產品",
    PRODUCT_CATALOG_TITLE: "產品型錄", // LIFF 中顯示產品列表的頁籤/頁面標題

    // 系統中對「會員」或「使用者」的稱呼。
    // 範例：會員 / 顧客 / 學員 / 冒險者
    MEMBER_NAME: "會員",
    MEMBER_PROFILE_TITLE: "會員中心", // LIFF 中顯示會員資料的頁籤/頁面標題

    // 與會員積分/點數系統相關的術語 (如果 ENABLE_MEMBERSHIP_SYSTEM 為 true)
    POINTS_NAME: "積分", // 範例：積分 / 點數 / 經驗值

    // 與預約系統相關的術語 (如果 ENABLE_BOOKING_SYSTEM 為 true)
    BOOKING_NAME: "預約",
    BOOKING_PAGE_TITLE: "線上預約", // LIFF 中預約頁面的標題

    // 與租借系統相關的術語 (如果 ENABLE_RENTAL_SYSTEM 為 true)
    RENTAL_NAME: "租借",
  },

  // =================================================================
  // 3. 業務邏輯 (LOGIC)
  // 存放可配置的業務規則與數值。
  // =================================================================
  LOGIC: {
    // 預設的租借天數 (如果 ENABLE_RENTAL_SYSTEM 為 true)
    RENTAL_DEFAULT_DAYS: 3,

    // 預約時段的間隔（分鐘） (如果 ENABLE_BOOKING_SYSTEM 為 true)
    BOOKING_SLOT_MINUTES: 60,

    // 會員等級定義 (如果 ENABLE_MEMBERSHIP_SYSTEM 為 true)
    // 格式: { level: 等級名稱, threshold: 升級所需積分 }
    MEMBERSHIP_LEVELS: [
      { level: 1, name: "入門", threshold: 0 },
      { level: 2, name: "常客", threshold: 1000 },
      { level: 3, name: "VIP", threshold: 5000 },
    ],
  },
};