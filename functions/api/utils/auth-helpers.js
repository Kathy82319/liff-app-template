// functions/api/utils/auth-helpers.js
import * as jose from 'jose';

/**
 * 1. 驗證 JWT Token (Middleware 用)
 */
export async function verifyAuthToken(token, secret) {
    if (!token || !secret) {
        throw new Error("Missing token or JWT secret.");
    }
    const secretKey = new TextEncoder().encode(secret);
    
    // 這裡我們放寬驗證條件，只要簽章正確就通過，減少設定錯誤導致的麻煩
    const { payload } = await jose.jwtVerify(token, secretKey);
    return payload;
}

/**
 * 2. 產生 JWT Token (Login 用)
 */
export async function generateToken(payload, secret) {
    const secretKey = new TextEncoder().encode(secret);
    return await new jose.SignJWT(payload)
        .setProtectedHeader({ alg: 'HS256' })
        .setIssuedAt()
        .setExpirationTime('24h') // 設定 24 小時過期
        .sign(secretKey);
}

/**
 * 3. 密碼雜湊 (註冊、忘記密碼、修改密碼 用)
 * 使用 SHA-256 將密碼轉為亂碼
 */
export async function hashPassword(password) {
    const msgBuffer = new TextEncoder().encode(password);
    const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    // 轉成 16 進位字串
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * 4. 驗證密碼 (Login 用)
 * 比較 "輸入密碼的雜湊值" 與 "資料庫存的雜湊值" 是否相同
 */
export async function verifyPassword(inputPassword, storedHash) {
    const inputHash = await hashPassword(inputPassword);
    return inputHash === storedHash;
}