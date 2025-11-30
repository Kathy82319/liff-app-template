// public/modules/pages/rally.js
import { api } from '../api.js';
import { state } from '../state.js';
import { ui } from '../ui.js';

// --- 模組內部狀態 ---
let html5QrCodeScanner = null;
let rallyData = { campaigns: [] };

// =================================================================
// 1. 初始化集點頁面 (Entry Point)
// =================================================================
export async function init() {
    console.log("初始化集點頁面 (rally.js)");
    
    // 1. 取得 DOM 元素
    const listContainer = document.getElementById('rally-list-container');
    const loadingEl = document.getElementById('rally-campaign-loading');
    const qrScannerContainer = document.getElementById('rally-qr-scanner-container');
    const rallyAnimationModal = document.getElementById('rally-animation-modal');
    
    // 2. 重置 UI 狀態
    if (loadingEl) loadingEl.style.display = 'block';
    if (listContainer) listContainer.style.display = 'none';
    if (qrScannerContainer) qrScannerContainer.style.display = 'none';
    if (rallyAnimationModal) rallyAnimationModal.style.display = 'none';

    // 確保掃描器已停止
    if (html5QrCodeScanner && html5QrCodeScanner.isScanning) {
        await stopScanner();
    }

    // 3. 綁定按鈕事件 (全域一次性綁定或每次重新綁定)
    const stopScanBtn = document.getElementById('stop-rally-scan-btn');
    if (stopScanBtn) {
        // 移除舊監聽器 (使用 cloneNode 技巧)
        const newBtn = stopScanBtn.cloneNode(true);
        stopScanBtn.parentNode.replaceChild(newBtn, stopScanBtn);
        newBtn.addEventListener('click', stopScanner);
    }

    const closeModalBtn = document.getElementById('rally-modal-close-btn');
    if (closeModalBtn) {
        const newCloseBtn = closeModalBtn.cloneNode(true);
        closeModalBtn.parentNode.replaceChild(newCloseBtn, closeModalBtn);
        newCloseBtn.addEventListener('click', () => {
            const modal = document.getElementById('rally-animation-modal');
            if (modal) modal.style.display = 'none';
            // 關閉後重新載入資料以更新畫面
            init(); 
        });
    }

    // 4. 載入資料
    try {
        await fetchRallyData();
        renderRallyPage();
    } catch (e) {
        console.error("Rally init failed", e);
        if(listContainer) listContainer.innerHTML = `<p style="color:var(--color-danger); text-align:center; padding:20px;">載入失敗: ${e.message}</p>`;
        if(listContainer) listContainer.style.display = 'block';
    } finally {
        if (loadingEl) loadingEl.style.display = 'none';
    }
}

// =================================================================
// 2. 資料獲取
// =================================================================
async function fetchRallyData() {
    // 1. 獲取活動列表 (帶上 userId 以檢查領獎狀態)
    const campaigns = await api.getRallyCampaigns(state.userProfile.userId);
    
    if (!campaigns || campaigns.length === 0) {
         rallyData.campaigns = [];
         return;
    }

    // 2. 平行獲取每個活動的「站點」和「進度」
    // 這一步是必要的，因為列表 API 通常只回傳活動摘要，不含站點詳情
    const fullCampaignsData = await Promise.all(campaigns.map(async (campaign) => {
        try {
            const [stations, progress] = await Promise.all([
                api.getRallyStations(campaign.campaign_id),
                api.getRallyProgress(state.userProfile.userId, campaign.campaign_id)
            ]);
            
            return {
                ...campaign,
                stations: stations,
                userProgress: progress
            };
        } catch (e) {
            console.error(`載入活動 ${campaign.campaign_id} 詳情失敗`, e);
            return null;
        }
    }));

    // 過濾掉載入失敗的項目
    rallyData.campaigns = fullCampaignsData.filter(c => c !== null);
}

// =================================================================
// 3. 渲染邏輯
// =================================================================
function renderRallyPage() {
    const listContainer = document.getElementById('rally-list-container');
    if (!listContainer) return;

    if (rallyData.campaigns.length === 0) {
        listContainer.style.display = 'block';
        listContainer.innerHTML = '<p style="text-align:center; color:var(--color-text-secondary); padding:20px;">目前沒有進行中的集點活動。</p>';
        return;
    }

    listContainer.style.display = 'block';

    // --- 排序邏輯 ---
    // 進行中 > 已完成未領獎 > 已完成已領獎 > 已結束
    rallyData.campaigns.sort((a, b) => {
        const isDimmed = (campaign) => {
            const progressList = Array.isArray(campaign.userProgress) ? campaign.userProgress : [];
            const activeStamps = progressList.filter(p => p.is_archived !== 1);
            const uniqueStamps = new Set(activeStamps.map(p => p.station_id)).size;
            const isCompleted = uniqueStamps >= campaign.required_stamps;
            const hasRedeemed = campaign.user_has_redeemed === 1;
            
            const now = new Date();
            const isExpired = campaign.end_date && new Date(campaign.end_date + 'T23:59:59') < now;
            
            if (isExpired) return true;
            if (isCompleted && hasRedeemed && campaign.can_repeat !== 1) return true;
            return false;
        };

        const aDimmed = isDimmed(a);
        const bDimmed = isDimmed(b);

        if (aDimmed && !bDimmed) return 1;
        if (!aDimmed && bDimmed) return -1;
        return b.campaign_id - a.campaign_id; // 同狀態依 ID 排序
    });

    // --- 生成 HTML ---
    listContainer.innerHTML = rallyData.campaigns.map((campaign, index) => {
        // 1. 計算進度
        const progressList = Array.isArray(campaign.userProgress) ? campaign.userProgress : [];
        const activeStamps = progressList.filter(p => p.is_archived !== 1);
        const stampedIds = new Set(activeStamps.map(p => p.station_id));
        
        const currentStamps = stampedIds.size;
        const totalStamps = campaign.required_stamps;
        const progressPercent = Math.min(100, Math.round((currentStamps / totalStamps) * 100));
        const isCompleted = currentStamps >= totalStamps;
        
        const isGlobalExhausted = (campaign.voucher_total_supply !== null) && 
                                  (campaign.voucher_issued_count >= campaign.voucher_total_supply);
        const hasUserRedeemed = campaign.user_has_redeemed === 1;

        // 檢查過期
        const now = new Date();
        const isExpired = campaign.end_date && new Date(campaign.end_date + 'T23:59:59') < now;

        // 2. 狀態樣式邏輯
        let badgeClass = 'badge-active'; // 這些 class 需在 CSS 定義
        let badgeText = '進行中';
        let expiryText = campaign.end_date ? `截止: ${campaign.end_date}` : '永久有效';
        let btnHtml = '';
        let instructionHtml = '';
        let isDimmed = false;

        if (isExpired) {
            badgeClass = 'badge-expired';
            badgeText = '已結束';
            isDimmed = true;
            btnHtml = `<button class="cta-button" disabled style="background-color: #999;">活動已結束</button>`;
        } else if (isCompleted) {
            if (hasUserRedeemed) {
                // 已領獎
                badgeClass = 'badge-completed';
                badgeText = '已完成';
                
                if (campaign.can_repeat === 1) {
                    // 可重複：顯示重置按鈕 (連結包含 action=reset)
                    // 這裡的連結是給使用者看的提示，實際操作是點按鈕
                    // 我們將 action=reset 埋在按鈕 data 屬性中
                    btnHtml = `<button class="cta-button btn-start-scan" data-action="reset" data-campaign-id="${campaign.campaign_id}" style="background-color: var(--color-info);">🔄 掃描重置碼 (開啟新卡)</button>`;
                    instructionHtml = `<div style="margin-top: 10px; font-size: 0.9rem; color: var(--color-text-primary);">
                        <strong>🎉 恭喜完成！</strong><br>您已獲得獎勵。請掃描店家的「重置 QR Code」將卡片歸檔並開始新的一輪。
                    </div>`;
                } else {
                    // 不可重複
                    isDimmed = true;
                    btnHtml = `<button class="cta-button" disabled style="background-color: var(--color-success); opacity: 0.8;">🎉 獎勵已發放</button>`;
                    instructionHtml = `<div style="margin-top: 10px; font-size: 0.9rem; color: var(--color-success);">您已完成此活動並獲得獎勵。</div>`;
                }

            } else {
                // 已集滿 但 未領獎 (補領機制)
                if (isGlobalExhausted) {
                    badgeClass = 'badge-exhausted';
                    badgeText = '獎勵已發完';
                    btnHtml = `<button class="cta-button" disabled style="background-color: #999; cursor: not-allowed;">來晚了一步</button>`;
                    instructionHtml = `<div style="margin-top: 10px; font-size: 0.9rem; color: var(--color-danger);">⚠️ 限量獎勵已全數兌換完畢。</div>`;
                } else {
                    // 自動觸發領獎失敗的補救按鈕 (實際上是重新觸發一次集點 API，後端會判斷已滿並發券)
                    // 為了方便，我們這裡使用一個特殊的按鈕直接呼叫 API，或者再次掃描任意站點
                    // 但最直覺的是顯示「點此領取」
                    btnHtml = `<button class="cta-button btn-manual-redeem" data-campaign-id="${campaign.campaign_id}" style="background-color: var(--color-warning);">⚠️ 點此補領獎勵</button>`;
                    instructionHtml = `<div style="margin-top: 10px; font-size: 0.9rem; color: var(--color-warning);">系統偵測您已集滿但尚未收到獎勵，請點擊按鈕嘗試補領。</div>`;
                }
            }
        } else {
            // 未集滿
            if (isGlobalExhausted) {
                badgeClass = 'badge-exhausted';
                badgeText = '已額滿';
                isDimmed = true;
                btnHtml = `<button class="cta-button" disabled style="background-color: #999; cursor: not-allowed;">獎勵已兌換完畢</button>`;
            } else {
                badgeClass = 'badge-active';
                badgeText = '進行中';
                btnHtml = `<button class="cta-button btn-start-scan" data-action="stamp" data-campaign-id="${campaign.campaign_id}" style="background-color: var(--color-accent);">📸 掃描集點</button>`;
            }
        }

        // 3. 渲染站點 (九宮格小卡)
        const stationsHtml = (campaign.stations || []).map(s => {
            const isCollected = stampedIds.has(s.station_id);
            // 將站點資料轉為 JSON 字串，以便傳遞給 Modal
            // 這裡簡單處理單引號問題
            const stationDataSafe = JSON.stringify(s).replace(/'/g, "&#39;");
            
            return `
                <div class="mini-station-card ${isCollected ? 'collected' : ''}" data-station='${stationDataSafe}' data-collected="${isCollected}">
                    <div>${s.name}</div>
                </div>
            `;
        }).join('');

        const isExpanded = (index === 0 && !isDimmed) ? 'expanded' : '';
        const dimmedClass = isDimmed ? 'dimmed' : '';

        return `
            <div class="rally-card ${isExpanded} ${dimmedClass}" id="rally-card-${campaign.campaign_id}">
                <div class="rally-card-header" onclick="document.getElementById('rally-card-${campaign.campaign_id}').classList.toggle('expanded')">
                    <div class="rally-info">
                        <div style="display:flex; align-items:center;">
                            <div class="rally-title">${campaign.title}</div>
                            <div class="rally-badge ${badgeClass}">${badgeText}</div>
                        </div>
                        <div class="rally-meta">
                            <span>${expiryText}</span>
                            <span>${currentStamps} / ${totalStamps} 點</span>
                        </div>
                        <div class="rally-progress-track">
                            <div class="rally-progress-fill" style="width: ${progressPercent}%"></div>
                        </div>
                    </div>
                    <div class="rally-arrow">▼</div>
                </div>

                <div class="rally-card-body">
                    <div class="rally-body-content">
                        <div class="rally-desc">${campaign.description || '無活動說明'}</div>
                        
                        <h4 style="margin: 10px 0; color: var(--color-text-secondary);">集點關卡 (點擊查看詳情)</h4>
                        <div class="rally-stations-grid">
                            ${stationsHtml}
                        </div>
                        
                        ${instructionHtml}

                        <div style="margin-top: 20px;">
                            ${btnHtml}
                        </div>
                    </div>
                </div>
            </div>
        `;
    }).join('');

    // 5. 綁定事件 (掃描、補領、站點詳情)
    
    // 綁定「掃描集點 / 掃描重置」按鈕
    listContainer.querySelectorAll('.btn-start-scan').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const action = btn.dataset.action; // 'stamp' or 'reset'
            const campaignId = btn.dataset.campaignId;
            startScanner(action, campaignId);
        });
    });

    // 綁定「補領獎勵」按鈕 (模擬集點動作，觸發後端檢查)
    listContainer.querySelectorAll('.btn-manual-redeem').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            e.stopPropagation();
            const campaignId = btn.dataset.campaignId;
            // 這裡我們需要一個觸發點。
            // 由於後端 redeem-station 需要 partnerCode，但補領通常是因為「最後一站掃了但沒領到」。
            // 比較好的做法是後端提供一個 claim-rally-reward API。
            // 但為了相容現有架構，我們可以提示使用者「請再次掃描任一站點 QR Code 以觸發系統檢查」。
            // 或者，如果後端 redeem-station 允許重複掃描 (不寫入 progress 但檢查獎勵)，則可運作。
            // 這裡暫時引導掃描。
            alert("請再次掃描此活動任一站點的 QR Code，系統將補發獎勵給您。");
            startScanner('stamp', campaignId);
        });
    });

    // 綁定「站點小卡」點擊 (顯示任務詳情)
    listContainer.querySelectorAll('.mini-station-card').forEach(card => {
        card.addEventListener('click', (e) => {
            e.stopPropagation();
            try {
                const station = JSON.parse(card.dataset.station);
                const isCollected = card.dataset.collected === 'true';
                openStationMissionModal(station, isCollected);
            } catch (err) {
                console.error("解析站點資料失敗", err);
            }
        });
    });
}

// =================================================================
// 4. 掃描器邏輯
// =================================================================
async function startScanner(action, campaignId) {
    const scannerContainer = document.getElementById('rally-qr-scanner-container');
    const listContainer = document.getElementById('rally-list-container');
    const qrReaderDiv = document.getElementById('rally-qr-reader');
    const statusMsg = document.getElementById('rally-status-message');
    
    if (listContainer) listContainer.style.display = 'none';
    if (scannerContainer) scannerContainer.style.display = 'block';
    
    // 提示文字
    if (statusMsg) {
        statusMsg.textContent = (action === 'reset') 
            ? '請掃描店家的「重置 QR Code」...' 
            : '請對準站點 QR Code 進行集點...';
        statusMsg.style.color = 'var(--color-text-primary)';
    }
    if (qrReaderDiv) qrReaderDiv.innerHTML = '';

    // 檢查庫是否存在
    if (typeof Html5Qrcode === 'undefined') {
        alert("掃碼元件載入失敗，請重新整理頁面。");
        stopScanner();
        return;
    }

    html5QrCodeScanner = new Html5Qrcode("rally-qr-reader");
    
    const config = { fps: 10, qrbox: 250 };
    
    try {
        await html5QrCodeScanner.start(
            { facingMode: "environment" }, 
            config, 
            async (decodedText) => {
                // 掃描成功 callback
                await stopScanner(); // 先停止掃描
                handleScanResult(decodedText, action, campaignId);
            },
            (errorMessage) => { 
                // 掃描中錯誤 (通常忽略)
            }
        );
    } catch (err) {
        console.error("啟動相機失敗:", err);
        if (statusMsg) {
            statusMsg.textContent = `❌ 無法啟動相機。請檢查瀏覽器權限。\n(${err})`;
            statusMsg.style.color = 'var(--color-danger)';
        }
        // 保持在掃描介面顯示錯誤，或者讓使用者手動取消
    }
}

export async function stopScanner() {
    const scannerContainer = document.getElementById('rally-qr-scanner-container');
    const listContainer = document.getElementById('rally-list-container');
    
    if (html5QrCodeScanner) {
        try {
            if (html5QrCodeScanner.isScanning) {
                await html5QrCodeScanner.stop();
            }
            html5QrCodeScanner.clear();
        } catch (e) {
            console.warn("Scanner stop warning:", e);
        }
        html5QrCodeScanner = null;
    }
    
    if (scannerContainer) scannerContainer.style.display = 'none';
    if (listContainer) listContainer.style.display = 'block';
}

// =================================================================
// 5. 掃描結果處理
// =================================================================
async function handleScanResult(text, expectedAction, expectedCampaignId) {
    // 顯示 Loading Modal
    showRallyResultModal('loading', '處理中...', '正在驗證 QR Code...');

    // 解析 QR Code
    // 格式可能為: https://...?partner_code=ABC&action=reset&campaign_id=1
    // 或單純代碼: ABC
    let partnerCode = null;
    let qrAction = null;
    let qrCampaignId = null;

    try {
        const url = new URL(text);
        // 處理 hash 中的參數 (LIFF 特性)
        let searchParams = url.searchParams;
        if (url.hash.includes('?')) {
            const hashParts = url.hash.split('?');
            if (hashParts.length > 1) {
                searchParams = new URLSearchParams(hashParts[1]);
            }
        }
        
        partnerCode = searchParams.get('partner_code') || searchParams.get('rally_station_code');
        qrAction = searchParams.get('action');
        qrCampaignId = searchParams.get('campaign_id');
        
    } catch (e) {
        // 非 URL，視為純代碼
        partnerCode = text;
    }

    try {
        // --- 情境 A: 執行重置 (Reset) ---
        if (expectedAction === 'reset') {
            // 驗證 QR 碼是否包含 reset 意圖 (簡單驗證)
            // 實際上後端只認 API 呼叫，這裡是前端防呆
            // 我們假設重置 QR Code 內容至少要是 "RESET" 或是特定的 URL
            // 為了寬容度，如果用戶掃描了正確的活動重置碼 (含有 action=reset & campaign_id=...)
            
            // 呼叫重置 API
            const res = await api.resetRallyCard({
                userId: state.userProfile.userId,
                campaignId: Number(expectedCampaignId),
                resetToken: partnerCode // 將掃到的內容傳給後端備查
            });
            
            if (res.success) {
                showRallyResultModal('success', '重置成功！', res.message);
                init(); // 重新載入列表
            } else {
                throw new Error(res.error || '重置失敗');
            }
        
        } 
        // --- 情境 B: 執行集點 (Stamp) ---
        else {
            if (!partnerCode) throw new Error("無法辨識的 QR Code (無代碼)。");

            const res = await api.redeemRallyStation({
                userId: state.userProfile.userId,
                partnerCode: partnerCode
            });

            if (res.success) {
                const rewardIssued = res.status === 'reward_issued';
                const title = rewardIssued ? '🎉 獲得獎勵！' : '集點成功！';
                showRallyResultModal('success', title, res.message, rewardIssued);
                init(); // 重新載入列表
            } else {
                // 處理特定的業務邏輯錯誤狀態 (如已集過)
                if (res.status === 'already_stamped') {
                    showRallyResultModal('error', '重複集點', res.message);
                } else if (res.status === 'card_full') {
                    showRallyResultModal('error', '集點卡已滿', res.message);
                } else {
                    throw new Error(res.error || '集點失敗');
                }
            }
        }

    } catch (err) {
        console.error("Scan API Error:", err);
        let msg = err.message || '未知錯誤';
        // 移除一些技術性的前綴
        msg = msg.replace('系統錯誤: ', '').replace('Fetch failed: ', '');
        showRallyResultModal('error', '操作失敗', msg);
    }
}

// =================================================================
// 6. UI 輔助函式
// =================================================================

// 顯示結果 Modal (Loading / Success / Error)
function showRallyResultModal(stateType, title, message, rewardIssued = false) {
    const modal = document.getElementById('rally-animation-modal');
    const iconEl = document.getElementById('rally-modal-icon');
    const titleEl = document.getElementById('rally-animation-title');
    const messageEl = document.getElementById('rally-animation-message');
    const actionBtn = document.getElementById('rally-modal-action-btn');
    const closeBtn = document.getElementById('rally-modal-close-btn');

    if (!modal) return;

    // 設定內容
    titleEl.textContent = title;
    messageEl.textContent = message;
    
    // 設定樣式與按鈕
    if (stateType === 'loading') {
        iconEl.innerHTML = '⏳'; 
        iconEl.style.animation = 'spin 1s infinite linear'; 
        titleEl.style.color = 'var(--color-primary)';
        if(actionBtn) actionBtn.style.display = 'none';
        if(closeBtn) closeBtn.style.display = 'none';
    } else if (stateType === 'success') {
        iconEl.innerHTML = '✅';
        iconEl.style.animation = '';
        titleEl.style.color = 'var(--color-success)';
        
        if (rewardIssued && actionBtn) {
            actionBtn.style.display = 'block';
            actionBtn.textContent = '查看我的獎勵';
            actionBtn.style.backgroundColor = 'var(--color-primary)';
            // 點擊跳轉到優惠券頁
            // 注意：這裡需要 import router，但 router 在上層，避免循環引用，可以使用 window.location.hash
            actionBtn.onclick = () => {
                modal.style.display = 'none';
                window.location.hash = '#my-vouchers'; // 簡單跳轉
            };
        } else {
            if(actionBtn) actionBtn.style.display = 'none';
        }
        if(closeBtn) closeBtn.style.display = 'block';
    } else { // error
        iconEl.innerHTML = '❌';
        iconEl.style.animation = '';
        titleEl.style.color = 'var(--color-danger)';
        if(actionBtn) actionBtn.style.display = 'none';
        if(closeBtn) closeBtn.style.display = 'block';
    }
    
    modal.style.display = 'flex';
}

// 開啟站點任務詳情 Modal (純展示)
function openStationMissionModal(station, isCollected) {
    const modal = document.getElementById('station-mission-modal');
    if (!modal) return;

    document.getElementById('mission-modal-title').textContent = station.name || '站點詳情';
    document.getElementById('mission-validation-info').textContent = station.partner_validation_info || '親臨現場掃描 QR Code 即可集點。';
    document.getElementById('mission-partner-name').textContent = station.partner_name || '未提供位置資訊';
    document.getElementById('mission-description').textContent = station.description || '無';
    document.getElementById('mission-expiry').textContent = station.expiry_date || '永久有效';

    const badge = document.getElementById('mission-status-badge');
    if (isCollected) {
        badge.textContent = '✅ 任務已達成';
        badge.style.backgroundColor = 'var(--color-success)';
    } else {
        badge.textContent = '🔒 任務未完成';
        badge.style.backgroundColor = '#6c757d';
    }

    modal.style.display = 'flex';
}