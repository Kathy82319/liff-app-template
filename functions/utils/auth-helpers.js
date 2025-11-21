// functions/utils/auth-helpers.js - JWT 驗證輔助函式
import * as jose from 'jose';

/**
 * 驗證 JWT Token 的有效性
 * @param {string} token - 待驗證的 JWT
 * @param {string} secret - JWT 簽署的密鑰 (來自環境變數)
 * @returns {Promise<object>} 解碼後的 Payload
 */
export async function verifyAuthToken(token, secret) {
    if (!token || !secret) {
        throw new Error("Missing token or JWT secret.");
    }

    const secretKey = new TextEncoder().encode(secret);
    
    // JWT 驗證，需與您在 /api/admin/auth/login.js 中設定的 issuer/audience 一致
    const { payload } = await jose.jwtVerify(token, secretKey, {
        issuer: 'urn:tabletop-product:issuer',
        audience: 'urn:tabletop-product:audience',
    });
    
    return payload;
}