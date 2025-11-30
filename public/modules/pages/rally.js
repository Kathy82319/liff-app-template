// public/modules/pages/rally.js
import { api } from '../api.js';
import { state } from '../state.js';
import { ui } from '../ui.js';

let html5QrCodeScanner = null;

export async function init() {
    const listContainer = document.getElementById('rally-list-container');
    const loadingEl = document.getElementById('rally-campaign-loading');
    
    if (loadingEl) loadingEl.style.display = 'block';
    if (listContainer) listContainer.style.display = 'none';

    // 綁定關閉按鈕
    const stopScanBtn = document.getElementById('stop-rally-scan-btn');
    if (stopScanBtn && !stopScanBtn.dataset.bound) {
        stopScanBtn.addEventListener('click', stopScanner);
        stopScanBtn.dataset.bound = 'true';
    }

    try {
        // 1. 獲取活動列表
        const campaigns = await api.getRallyCampaigns(state.userProfile.userId);
        
        if (campaigns.length === 0) {
            if(listContainer) listContainer.innerHTML = '<p style="text-align:center;">目前沒有活動。</p>';
            return;
        }

        // 2. 平行獲取詳細資料 (站點 & 進度)
        const fullData = await Promise.all(campaigns.map(async (c) => {
            const [stations, progress] = await Promise.all([
                api.getRallyStations(c.campaign_id),
                api.getRallyProgress(state.userProfile.userId, c.campaign_id)
            ]);
            return { ...c, stations, userProgress: progress };
        }));

        renderList(fullData);
        if (listContainer) listContainer.style.display = 'block';

    } catch (e) {
        console.error("Rally init failed", e);
        if(listContainer) listContainer.innerHTML = '<p style="color:red; text-align:center;">載入失敗</p>';
    } finally {
        if (loadingEl) loadingEl.style.display = 'none';
    }
}

function renderList(campaigns) {
    const container = document.getElementById('rally-list-container');
    if (!container) return;

    container.innerHTML = campaigns.map(c => {
        // 計算進度
        const activeStamps = (c.userProgress || []).filter(p => p.is_archived !== 1);
        const stampedIds = new Set(activeStamps.map(p => p.station_id));
        const current = stampedIds.size;
        const total = c.required_stamps;
        const percent = Math.min(100, (current / total) * 100);
        const isCompleted = current >= total;
        
        let btnHtml = `<button class="cta-button btn-start-scan" data-id="${c.campaign_id}" style="background:var(--color-accent);">📸 掃描集點</button>`;
        if (isCompleted) {
            btnHtml = `<button class="cta-button" disabled style="background:#ccc;">已完成</button>`;
            // 如果可重複，顯示重置按鈕邏輯 (略)
        }

        const stationsHtml = (c.stations || []).map(s => {
            const isGot = stampedIds.has(s.station_id);
            return `<div class="mini-station-card ${isGot ? 'collected' : ''}"><div>${s.name}</div></div>`;
        }).join('');

        return `
        <div class="rally-card expanded">
            <div class="rally-card-header">
                <div class="rally-title">${c.title}</div>
                <div class="rally-meta">${current} / ${total} 點</div>
                <div class="rally-progress-track"><div class="rally-progress-fill" style="width:${percent}%"></div></div>
            </div>
            <div class="rally-card-body" style="max-height: 1000px;">
                <div class="rally-body-content">
                    <div class="rally-desc">${c.description || ''}</div>
                    <div class="rally-stations-grid">${stationsHtml}</div>
                    <div style="margin-top:20px;">${btnHtml}</div>
                </div>
            </div>
        </div>`;
    }).join('');

    // 綁定掃描按鈕
    container.querySelectorAll('.btn-start-scan').forEach(btn => {
        btn.addEventListener('click', () => startScanner(btn.dataset.id));
    });
}

async function startScanner(campaignId) {
    const scannerContainer = document.getElementById('rally-qr-scanner-container');
    const listContainer = document.getElementById('rally-list-container');
    
    if (listContainer) listContainer.style.display = 'none';
    if (scannerContainer) scannerContainer.style.display = 'block';

    html5QrCodeScanner = new Html5Qrcode("rally-qr-reader");
    html5QrCodeScanner.start(
        { facingMode: "environment" },
        { fps: 10, qrbox: 250 },
        async (decodedText) => {
            await stopScanner();
            handleScanResult(decodedText, campaignId);
        },
        (err) => {}
    );
}

async function stopScanner() {
    if (html5QrCodeScanner) {
        await html5QrCodeScanner.stop().catch(() => {});
        html5QrCodeScanner.clear();
        html5QrCodeScanner = null;
    }
    document.getElementById('rally-qr-scanner-container').style.display = 'none';
    document.getElementById('rally-list-container').style.display = 'block';
}

async function handleScanResult(text, campaignId) {
    // 解析 QR Code 參數 (partner_code)
    let partnerCode = text;
    try {
        const url = new URL(text);
        partnerCode = url.searchParams.get('partner_code') || text;
    } catch(e) {}

    // 顯示 Modal (Loading)
    const modal = document.getElementById('rally-animation-modal');
    modal.style.display = 'flex';
    document.getElementById('rally-animation-message').textContent = '驗證中...';

    try {
        const res = await api.redeemRallyStation({ userId: state.userProfile.userId, partnerCode });
        // 成功
        document.getElementById('rally-animation-message').textContent = res.message;
        document.getElementById('rally-modal-icon').textContent = '✅';
        // 刷新列表
        init();
    } catch (err) {
        document.getElementById('rally-animation-message').textContent = err.message;
        document.getElementById('rally-modal-icon').textContent = '❌';
    }
    
    // 綁定關閉
    document.getElementById('rally-modal-close-btn').onclick = () => {
        modal.style.display = 'none';
    };
}