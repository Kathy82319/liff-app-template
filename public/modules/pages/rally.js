// public/modules/pages/rally.js
import { api } from '../api.js';
import { state } from '../state.js';
import { router } from '../router.js'; // 引入 router 以便跳轉
import { ui } from '../ui.js';

// --- 模組內部狀態 ---
let html5QrCodeScanner = null;
let rallyData = { campaigns: [] };

// =================================================================
// 1. 初始化集點頁面 (Entry Point)
// =================================================================
export async function init() {
    console.log("初始化集點頁面 (rally.js with Reward Popup)");
    
    const listContainer = document.getElementById('rally-list-container');
    const loadingEl = document.getElementById('rally-campaign-loading');
    const qrScannerContainer = document.getElementById('rally-qr-scanner-container');
    const rallyAnimationModal = document.getElementById('rally-animation-modal');
    
    // 重置 UI 狀態
    if (loadingEl) loadingEl.style.display = 'block';
    if (listContainer) listContainer.style.display = 'none';
    if (qrScannerContainer) qrScannerContainer.style.display = 'none';
    if (rallyAnimationModal) rallyAnimationModal.style.display = 'none';

    // 確保掃描器已停止
    if (html5QrCodeScanner && html5QrCodeScanner.isScanning) {
        await stopScanner();
    }

    // 綁定「取消掃碼」按鈕
    const stopScanBtn = document.getElementById('stop-rally-scan-btn');
    if (stopScanBtn) {
        const newBtn = stopScanBtn.cloneNode(true);
        stopScanBtn.parentNode.replaceChild(newBtn, stopScanBtn);
        newBtn.addEventListener('click', stopScanner);
    }

    // 綁定彈窗「關閉」按鈕 (重新載入頁面以刷新進度)
    const closeModalBtn = document.getElementById('rally-modal-close-btn');
    if (closeModalBtn) {
        const newCloseBtn = closeModalBtn.cloneNode(true);
        closeModalBtn.parentNode.replaceChild(newCloseBtn, closeModalBtn);
        newCloseBtn.addEventListener('click', () => {
            const modal = document.getElementById('rally-animation-modal');
            if (modal) modal.style.display = 'none';
            init(); // 關閉後重新載入以更新介面
        });
    }

    // 載入資料
    try {
        await fetchRallyData();
        renderRallyPage();
    } catch (e) {
        console.error("Rally init failed", e);
        if(listContainer) {
            listContainer.innerHTML = `<p style="color:var(--color-danger); text-align:center; padding:20px;">載入失敗: ${e.message}</p>`;
            listContainer.style.display = 'block';
        }
    } finally {
        if (loadingEl) loadingEl.style.display = 'none';
    }
}

// =================================================================
// 2. 資料獲取
// =================================================================
async function fetchRallyData() {
    const campaigns = await api.getRallyCampaigns(state.userProfile.userId);
    
    if (!campaigns || campaigns.length === 0) {
         rallyData.campaigns = [];
         return;
    }

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

    // 排序：進行中 > 已完成未領 > 已完成已領 > 過期
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
        return b.campaign_id - a.campaign_id;
    });

    listContainer.innerHTML = rallyData.campaigns.map((campaign, index) => {
        const progressList = Array.isArray(campaign.userProgress) ? campaign.userProgress : [];
        const activeStamps = progressList.filter(p => p.is_archived !== 1);
        const stampedIds = new Set(activeStamps.map(p => p.station_id));
        
        const currentStamps = stampedIds.size;
        const totalStamps = campaign.required_stamps;
        const progressPercent = Math.min(100, Math.round((currentStamps / totalStamps) * 100));
        const isCompleted = currentStamps >= totalStamps;
        const isGlobalExhausted = (campaign.voucher_total_supply !== null) && (campaign.voucher_issued_count >= campaign.voucher_total_supply);
        const hasUserRedeemed = campaign.user_has_redeemed === 1;

        const now = new Date();
        const isExpired = campaign.end_date && new Date(campaign.end_date + 'T23:59:59') < now;

        let badgeClass = 'badge-active'; 
        let badgeText = '進行中';
        let expiryText = campaign.end_date ? `截止: ${campaign.end_date}` : '永久有效';
        let btnHtml = '';
        let instructionHtml = '';
        let isDimmed = false;

        if (isExpired) {
            badgeClass = 'badge-expired'; badgeText = '已結束'; isDimmed = true;
            btnHtml = `<button class="cta-button" disabled style="background-color: #999;">活動已結束</button>`;
        } else if (isCompleted) {
            if (hasUserRedeemed) {
                badgeClass = 'badge-completed'; badgeText = '已完成';
                if (campaign.can_repeat === 1) {
                    btnHtml = `<button class="cta-button btn-start-scan" data-action="reset" data-campaign-id="${campaign.campaign_id}" style="background-color: var(--color-info);">🔄 掃描重置碼 (開啟新卡)</button>`;
                    instructionHtml = `<div style="margin-top: 10px; font-size: 0.9rem; color: var(--color-text-primary);"><strong>🎉 恭喜完成！</strong><br>您已獲得獎勵。請掃描店家的「重置 QR Code」開啟新的一輪。</div>`;
                } else {
                    isDimmed = true;
                    btnHtml = `<button class="cta-button" disabled style="background-color: var(--color-success); opacity: 0.8;">🎉 獎勵已發放</button>`;
                }
            } else {
                if (isGlobalExhausted) {
                    badgeClass = 'badge-exhausted'; badgeText = '獎勵已發完';
                    btnHtml = `<button class="cta-button" disabled style="background-color: #999; cursor: not-allowed;">來晚了一步</button>`;
                } else {
                    btnHtml = `<button class="cta-button btn-manual-redeem" data-campaign-id="${campaign.campaign_id}" style="background-color: var(--color-warning);">⚠️ 點此補領獎勵</button>`;
                    instructionHtml = `<div style="margin-top: 10px; font-size: 0.9rem; color: var(--color-warning);">系統偵測您已集滿但尚未收到獎勵，請點擊按鈕嘗試補領。</div>`;
                }
            }
        } else {
            if (isGlobalExhausted) {
                badgeClass = 'badge-exhausted'; badgeText = '已額滿'; isDimmed = true;
                btnHtml = `<button class="cta-button" disabled style="background-color: #999; cursor: not-allowed;">獎勵已兌換完畢</button>`;
            } else {
                badgeClass = 'badge-active'; badgeText = '進行中';
                btnHtml = `<button class="cta-button btn-start-scan" data-action="stamp" data-campaign-id="${campaign.campaign_id}" style="background-color: var(--color-accent);">📸 掃描集點</button>`;
            }
        }

        const stationsHtml = (campaign.stations || []).map(s => {
            const isCollected = stampedIds.has(s.station_id);
            const stationDataSafe = JSON.stringify(s).replace(/'/g, "&#39;");
            return `<div class="mini-station-card ${isCollected ? 'collected' : ''}" data-station='${stationDataSafe}' data-collected="${isCollected}"><div>${s.name}</div></div>`;
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
                        <div class="rally-meta"><span>${expiryText}</span><span>${currentStamps} / ${totalStamps} 點</span></div>
                        <div class="rally-progress-track"><div class="rally-progress-fill" style="width: ${progressPercent}%"></div></div>
                    </div>
                    <div class="rally-arrow">▼</div>
                </div>
                <div class="rally-card-body">
                    <div class="rally-body-content">
                        <div class="rally-desc">${campaign.description || '無活動說明'}</div>
                        <h4 style="margin: 10px 0; color: var(--color-text-secondary);">集點關卡 (點擊查看詳情)</h4>
                        <div class="rally-stations-grid">${stationsHtml}</div>
                        ${instructionHtml}
                        <div style="margin-top: 20px;">${btnHtml}</div>
                    </div>
                </div>
            </div>
        `;
    }).join('');

    // 綁定事件
    listContainer.querySelectorAll('.btn-start-scan').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            startScanner(btn.dataset.action, btn.dataset.campaignId);
        });
    });

    listContainer.querySelectorAll('.btn-manual-redeem').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            e.stopPropagation();
            alert("請再次掃描此活動任一站點的 QR Code，系統將自動補發獎勵。");
            startScanner('stamp', btn.dataset.campaignId);
        });
    });

    listContainer.querySelectorAll('.mini-station-card').forEach(card => {
        card.addEventListener('click', (e) => {
            e.stopPropagation();
            try {
                openStationMissionModal(JSON.parse(card.dataset.station), card.dataset.collected === 'true');
            } catch (err) { console.error(err); }
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
    
    // 初始化畫面狀態：隱藏列表，顯示掃描區塊
    if (listContainer) listContainer.style.display = 'none';
    if (scannerContainer) scannerContainer.style.display = 'block';
    if (qrReaderDiv) qrReaderDiv.innerHTML = '';
    
    // 恢復標準提示文字與置中樣式
    if (statusMsg) {
        statusMsg.textContent = (action === 'reset') ? '請掃描店家的「重置 QR Code」...' : '請對準站點 QR Code 進行集點...';
        statusMsg.style.color = 'var(--color-text-primary)';
        statusMsg.style.textAlign = 'center';
        statusMsg.style.fontSize = '1rem';
    }

    // 優先嘗試使用 LINE LIFF 的原生掃碼器
    if (typeof liff !== 'undefined' && liff.isInClient() && liff.scanCodeV2) {
        try {
            const result = await liff.scanCodeV2();
            if (result && result.value) {
                // 掃描成功，將結果交給原本的處理邏輯
                handleScanResult(result.value, action, campaignId);
            }
            return; // 成功結束後跳出函式
        } catch (err) {
            console.log("LIFF 原生掃描取消或失敗，退回網頁版相機", err);
            // 如果顧客按了取消或發生錯誤，繼續往下執行備用的網頁相機
        }
    }

    // --- 以下為原本的 Html5Qrcode 備用邏輯 (適用於用一般瀏覽器開啟時) ---
    if (typeof Html5Qrcode === 'undefined') {
        alert("掃碼元件載入失敗，請重新整理頁面。");
        stopScanner();
        return;
    }

    html5QrCodeScanner = new Html5Qrcode("rally-qr-reader");
    try {
        await html5QrCodeScanner.start(
            { facingMode: "environment" }, 
            { fps: 10, qrbox: 250 }, 
            async (decodedText) => {
                await stopScanner(); 
                handleScanResult(decodedText, action, campaignId);
            },
            (errorMessage) => { 
                // 忽略持續性的畫面捕捉錯誤，避免干擾效能
            }
        );
    } catch (err) {
        console.error("啟動相機失敗:", err);
        if (statusMsg) {
            statusMsg.textContent = `無法啟動相機。請檢查權限設定或更換瀏覽器。\n(${err.message || err.name})`;
            statusMsg.style.color = 'var(--color-danger)';
        }
    }
}


export async function stopScanner() {
    const scannerContainer = document.getElementById('rally-qr-scanner-container');
    const listContainer = document.getElementById('rally-list-container');
    if (html5QrCodeScanner) {
        try {
            if (html5QrCodeScanner.isScanning) await html5QrCodeScanner.stop();
            html5QrCodeScanner.clear();
        } catch (e) { console.warn(e); }
        html5QrCodeScanner = null;
    }
    if (scannerContainer) scannerContainer.style.display = 'none';
    if (listContainer) listContainer.style.display = 'block';
}

// =================================================================
// 5. 掃描結果處理 (包含獎勵判斷)
// =================================================================
async function handleScanResult(text, expectedAction, expectedCampaignId) {
    showRallyResultModal('loading', '處理中...', '正在驗證 QR Code...');

    let partnerCode = null;
    try {
        const url = new URL(text);
        let searchParams = url.searchParams;
        if (url.hash.includes('?')) {
            const hashParts = url.hash.split('?');
            if (hashParts.length > 1) searchParams = new URLSearchParams(hashParts[1]);
        }
        partnerCode = searchParams.get('partner_code') || searchParams.get('rally_station_code') || text;
    } catch (e) { partnerCode = text; }

    try {
        if (expectedAction === 'reset') {
            const res = await api.resetRallyCard({
                userId: state.userProfile.userId,
                campaignId: Number(expectedCampaignId),
                resetToken: partnerCode
            });
            if (res.success) showRallyResultModal('success', '重置成功！', res.message);
            else throw new Error(res.error || '重置失敗');
        
        } else {
            if (!partnerCode) throw new Error("無法辨識的 QR Code (無代碼)。");

            const res = await api.redeemRallyStation({
                userId: state.userProfile.userId,
                partnerCode: partnerCode
            });

            if (res.success) {
                // 【關鍵恢復】判斷 status === 'reward_issued'
                const rewardIssued = (res.status === 'reward_issued');
                const title = rewardIssued ? '🎉 獲得獎勵！' : '集點成功！';
                showRallyResultModal('success', title, res.message, rewardIssued);
            } else {
                if (res.status === 'already_stamped') showRallyResultModal('error', '重複集點', res.message);
                else if (res.status === 'card_full') showRallyResultModal('error', '集點卡已滿', res.message);
                else throw new Error(res.error || '集點失敗');
            }
        }
    } catch (err) {
        let msg = (err.message || '未知錯誤').replace('系統錯誤: ', '').replace('Fetch failed: ', '');
        showRallyResultModal('error', '操作失敗', msg);
    }
}

// =================================================================
// 6. 顯示結果 Modal (含獎勵按鈕)
// =================================================================
function showRallyResultModal(stateType, title, message, rewardIssued = false) {
    const modal = document.getElementById('rally-animation-modal');
    const iconEl = document.getElementById('rally-modal-icon');
    const titleEl = document.getElementById('rally-animation-title');
    const messageEl = document.getElementById('rally-animation-message');
    const actionBtn = document.getElementById('rally-modal-action-btn');
    const closeBtn = document.getElementById('rally-modal-close-btn');

    if (!modal) return;

    titleEl.textContent = title;
    messageEl.textContent = message;
    
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
        
        // 【關鍵恢復】如果發放了獎勵，顯示按鈕並綁定跳轉
        if (rewardIssued && actionBtn) {
            actionBtn.style.display = 'block';
            actionBtn.textContent = '查看我的獎勵';
            actionBtn.style.backgroundColor = 'var(--color-primary)';
            actionBtn.onclick = () => {
                modal.style.display = 'none';
                router.navigate('page-my-vouchers'); // 使用 router 跳轉
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