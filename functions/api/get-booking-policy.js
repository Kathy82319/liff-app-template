// functions/api/get-booking-policy.js

// --- 複製固定草稿 ID ---
const FIXED_DRAFT_IDS = {
    POLICY: 1,
};

// --- 複製預設內容 ---
const DEFAULT_POLICY_CONTENT = JSON.stringify({
    cancellationPolicy: "請聯繫店家確認取消政策。",
    checkInInstructions: "請聯繫店家確認入住須知。"
});

export async function onRequest(context) {
    const { env } = context;
    const db = env.DB;

    try {
        if (context.request.method !== 'GET') {
            return new Response(JSON.stringify({ error: '僅允許 GET 請求' }), { status: 405 });
        }

        const stmt = db.prepare("SELECT content FROM MessageDrafts WHERE draft_id = ?");
        const policyDraft = await stmt.bind(FIXED_DRAFT_IDS.POLICY).first();

        let policyData;
        let contentToParse = DEFAULT_POLICY_CONTENT; // Start with default

        if (policyDraft && policyDraft.content) {
             contentToParse = policyDraft.content; // Use DB content if available
        } else {
             console.warn(`[get-booking-policy] Draft ID ${FIXED_DRAFT_IDS.POLICY} not found or content is empty. Using default.`);
        }

        try {
            policyData = JSON.parse(contentToParse);
             // Basic validation: ensure expected keys exist, even if empty
             policyData.cancellationPolicy = policyData.cancellationPolicy || '';
             policyData.checkInInstructions = policyData.checkInInstructions || '';
        } catch (e) {
            console.error(`[get-booking-policy] Failed to parse policy content (ID: ${FIXED_DRAFT_IDS.POLICY}). Error:`, e, "Content:", contentToParse);
             // Parsing failed, return default structure with error message
             policyData = JSON.parse(DEFAULT_POLICY_CONTENT); // Start fresh with default structure
             policyData.cancellationPolicy = `[讀取政策時發生錯誤，請聯繫店家]`;
             policyData.checkInInstructions = `[讀取須知時發生錯誤，請聯繫店家]`;
        }

        return new Response(JSON.stringify(policyData), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
        });

    } catch (error) {
        console.error('Error in get-booking-policy API:', error);
        // Return default structure on general API error
        const defaultResponse = JSON.parse(DEFAULT_POLICY_CONTENT);
        defaultResponse.cancellationPolicy = `[讀取政策時發生伺服器錯誤]`;
        defaultResponse.checkInInstructions = `[讀取須知時發生伺服器錯誤]`;
        return new Response(JSON.stringify(defaultResponse), {
            status: 500, // Internal Server Error
            headers: { 'Content-Type': 'application/json' },
        });
    }
}