// public/admin/modules/rallyManagement.js
import { api } from '../api.js';
import { ui } from '../ui.js';
import { escapeHtml } from '../../utils.js';

let allCampaigns = [];
let allVoucherTemplates = [];
let campaignDatepicker = null;
let stationDatepicker = null;
let currentCampaignId = null; // 當前正在檢視的活動 ID

// 2. 新增一個動態獲取 URL 的函式 (或是直接在 render 時組裝)
function getLiffBaseUrl() {
    if (window.CONFIG && window.CONFIG.ENV && window.CONFIG.ENV.LIFF_ID) {
        return `https://liff.line.me/${window.CONFIG.ENV.LIFF_ID}`;
    }
    console.error("LIFF_ID not found in window.CONFIG");
    return "https://liff.line.me/UNKNOWN_ID";
}
// --- Helper: 渲染活動列表 ---

function renderCampaignList(campaigns) {
    const tbody = document.getElementById('campaign-list-tbody');
    if (!tbody) return;

    if (campaigns.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" style="text-align: center;">尚未建立任何集點活動。</td></tr>';
        return;
    }

    tbody.innerHTML = campaigns.map(c => {
        const statusText = c.is_active ? '<span style="color: var(--color-success);">啟用中</span>' : '<span style="color: var(--color-secondary);">已停用</span>';
        const dateRange = (c.start_date && c.end_date) ? `${c.start_date} ~ ${c.end_date}` : '永久有效';
        // 獎勵名稱如果是動態的，也建議消毒，雖然通常來自內部設定
        const rawRewardTitle = allVoucherTemplates.find(v => v.template_id == c.reward_voucher_id)?.title || `ID: ${c.reward_voucher_id}`;
        const safeReward = escapeHtml(rawRewardTitle);
        
        // 【安全修正】活動標題消毒
        const safeTitle = escapeHtml(c.title);

        // 判斷是否顯示「重置碼」按鈕
        let resetBtnHtml = '';
        if (c.can_repeat) {
            const resetLink = `${getLiffBaseUrl()}/#page-rally?action=reset&campaign_id=${c.campaign_id}`;
            resetBtnHtml = `<button class="action-btn btn-show-reset-qrcode" data-link="${resetLink}" style="background-color: #6f42c1; margin-right: 5px;">重置碼</button>`;
        }

        return `
            <tr data-campaign-id="${c.campaign_id}">
                <td>
                    ${safeTitle}
                    ${c.can_repeat ? '<span style="font-size:0.8em; background:#eee; padding:2px 5px; border-radius:4px; margin-left:5px;">可循環</span>' : ''}
                </td>
                <td>集滿 ${c.required_stamps} 點</td>
                <td>${safeReward}</td>
                <td>${dateRange}</td>
                <td>${statusText}</td>
                <td class="actions-cell">
                    ${resetBtnHtml} <button class="action-btn btn-view-stations" data-campaign-id="${c.campaign_id}" data-title="${safeTitle}" style="background-color: var(--color-info);">站點管理</button>
                    <button class="action-btn btn-edit-campaign" data-campaign-id="${c.campaign_id}" style="background-color: var(--color-warning); color: #000;">編輯</button>
                    <button class="action-btn btn-delete-campaign" data-campaign-id="${c.campaign_id}" style="background-color: var(--color-danger);">刪除</button>
                </td>
            </tr>
        `;
    }).join('');
}

// --- Helper: 渲染站點列表 ---
function renderStationList(stations, campaignTitle) {
    const tbody = document.getElementById('station-list-tbody');
    const titleEl = document.getElementById('current-campaign-title');
    if (!tbody || !titleEl) return;

    // 雖然 textContent 是安全的，但保持一致性是好習慣
    titleEl.textContent = `活動：${campaignTitle} 的站點管理`;

    if (stations.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" style="text-align: center;">此活動尚未建立任何站點。</td></tr>';
        return;
    }

    tbody.innerHTML = stations.map(s => {
        const statusText = s.is_active ? '<span style="color: var(--color-success);">啟用中</span>' : '<span style="color: var(--color-secondary);">已停用</span>';
        const expiryDate = s.expiry_date || '永久有效';
        
        // QR Code 連結
        const claimLink = `${getLiffBaseUrl()}/#page-rally?partner_code=${s.unique_partner_code}`;

        // 【安全修正】站點名稱與合作夥伴名稱消毒
        const safeName = escapeHtml(s.name);
        const safePartner = escapeHtml(s.partner_name || '無');

        return `
            <tr>
                <td><div class="main-info">${safeName}</div><div class="sub-info">${s.unique_partner_code}</div></td>
                <td>${safePartner}</td>
                <td>${expiryDate}</td>
                <td>${statusText}</td>
                <td class="actions-cell">
                    <button class="action-btn btn-show-qrcode" data-code="${s.unique_partner_code}" data-link="${claimLink}" style="background-color: var(--color-primary);">QR Code</button>
                </td>
                <td class="actions-cell">
                    <button class="action-btn btn-edit-station" data-station-id="${s.station_id}" style="background-color: var(--color-warning); color: #000;">編輯</button>
                    <button class="action-btn btn-delete-station" data-station-id="${s.station_id}" style="background-color: var(--color-danger);">刪除</button>
                </td>
            </tr>
        `;
    }).join('');
}

// [新增] 輔助函式：產生下拉選單選項文字
function getVoucherLabel(v) {
    let typeStr = '';
    let valueStr = '';
    switch (v.type) {
        case 'discount_fixed': typeStr = '折抵'; valueStr = `$${v.value}`; break;
        case 'discount_percentage': typeStr = '折扣'; valueStr = `${v.value}%`; break;
        case 'redeem_item': typeStr = '兌換'; valueStr = v.redeem_item_name; break;
    }
    const limitStr = (v.total_supply !== null) ? `[限量 ${v.total_supply}]` : '[無限量]';
    return `${limitStr} ${v.title} - ${typeStr} ${valueStr}`;
}

// --- Helper: 開啟活動編輯 Modal ---
function openCampaignModal(campaign = null) {
    const form = document.getElementById('edit-campaign-form');
    const modalTitle = document.getElementById('modal-campaign-title');
    const rewardSelect = document.getElementById('campaign-reward-voucher'); // 抓取 Select 元素

    if (!form || !modalTitle || !rewardSelect) return;

    form.reset();
    document.getElementById('edit-campaign-id').value = campaign?.campaign_id || '';
    modalTitle.textContent = campaign ? '編輯集點活動' : '新增集點活動';

    // --- 1. 填充優惠券下拉選單 ---
    rewardSelect.innerHTML = '<option value="">-- 請選擇獎勵優惠券 --</option>';
    
    // 過濾出「啟用中」的優惠券 (也可以不過濾，看需求，這裡建議只列出 active 的)
    const availableVouchers = allVoucherTemplates.filter(v => v.is_active);
    
    availableVouchers.forEach(v => {
        const option = document.createElement('option');
        option.value = v.template_id;
        option.textContent = getVoucherLabel(v);
        // 將限量資訊存在 dataset 中，方便監聽事件讀取
        if (v.total_supply !== null) {
            option.dataset.totalSupply = v.total_supply;
        }
        rewardSelect.appendChild(option);
    });

    // --- 2. 綁定變更事件 (限量防呆警告) ---
    // 移除舊的監聽器避免重複綁定 (雖然 openCampaignModal 每次都會重置 innerHTML option，但 element 本身還在)
    const newRewardSelect = rewardSelect.cloneNode(true);
    rewardSelect.parentNode.replaceChild(newRewardSelect, rewardSelect);
    
    newRewardSelect.addEventListener('change', async (e) => {
        const selectedOption = e.target.options[e.target.selectedIndex];
        const totalSupply = selectedOption.dataset.totalSupply;

        if (totalSupply) {
            // 觸發防呆警告
            const confirmed = await ui.confirm(
                `⚠️ 警告：您選擇的優惠券設有『發行限量』(上限 ${totalSupply} 張)！\n\n建議改用『無限量』的優惠券或者活動說明中標註『數量有限，換完為止』。\n\n是否繼續？`
            );
            
            if (!confirmed) {
                e.target.value = ""; // 使用者取消，重置選擇
            }
        }
    });

    if (campaignDatepicker) campaignDatepicker.destroy();
    
    if (campaign) {
        document.getElementById('campaign-title').value = campaign.title;
        document.getElementById('campaign-description').value = campaign.description || '';
        document.getElementById('campaign-required-stamps').value = campaign.required_stamps;
        
        // 設定選單的值
        newRewardSelect.value = campaign.reward_voucher_id;
        
        document.getElementById('campaign-can-repeat').checked = !!campaign.can_repeat;
        document.getElementById('campaign-is-active').checked = !!campaign.is_active;

        let defaultDates = [];
        if (campaign.start_date) defaultDates.push(campaign.start_date);
        if (campaign.end_date) defaultDates.push(campaign.end_date);
        
        campaignDatepicker = flatpickr("#campaign-dates", { 
            mode: "range", 
            dateFormat: "Y-m-d",
            locale: "zh_tw",
            defaultDate: defaultDates
        });
    } else {
         document.getElementById('campaign-can-repeat').checked = false;
         campaignDatepicker = flatpickr("#campaign-dates", { mode: "range", dateFormat: "Y-m-d", locale: "zh_tw" });
    }

    ui.showModal('#edit-campaign-modal');
}

// --- Helper: 開啟站點編輯 Modal ---
function openStationModal(station = null) {
    const form = document.getElementById('edit-station-form');
    const modalTitle = document.getElementById('modal-station-title');
    if (!form || !modalTitle || !currentCampaignId) return;

    form.reset();
    document.getElementById('edit-station-id').value = station?.station_id || '';
    document.getElementById('station-campaign-id').value = currentCampaignId;
    modalTitle.textContent = station ? '編輯站點' : '新增站點';

    if (stationDatepicker) stationDatepicker.destroy();
    
    // 站點日期選擇器 (單日)
    stationDatepicker = flatpickr("#station-expiry-date", { 
        mode: "single", 
        dateFormat: "Y-m-d",
        locale: "zh_tw",
        defaultDate: station?.expiry_date || null
    });

    if (station) {
        document.getElementById('station-name').value = station.name;
        document.getElementById('station-partner-name').value = station.partner_name || '';
        document.getElementById('station-description').value = station.description || '';
        document.getElementById('station-validation-info').value = station.partner_validation_info || '';
        document.getElementById('station-partner-code').value = station.unique_partner_code;
        document.getElementById('station-is-active').checked = !!station.is_active;
    } else {
        document.getElementById('station-partner-code').value = ''; // 新增時留空讓後端自動生成
    }

    ui.showModal('#edit-station-modal');
}


// --- 核心事件處理函式 ---

// 處理活動表單提交
async function handleCampaignSubmit(event) {
    event.preventDefault();
    const saveButton = event.target.querySelector('button[type="submit"]');
    saveButton.disabled = true;
    saveButton.textContent = '儲存中...';

    const dates = campaignDatepicker.selectedDates;
    const campaign_id = document.getElementById('edit-campaign-id').value;

    let startDate = dates.length > 0 ? flatpickr.formatDate(dates[0], "Y-m-d") : null;
    let endDate = null;
    if (dates.length === 2) {
         endDate = flatpickr.formatDate(dates[1], "Y-m-d");
    } else if (dates.length === 1) {
         endDate = startDate;
    }

    const payload = {
        campaign_id: campaign_id ? Number(campaign_id) : null,
        title: document.getElementById('campaign-title').value,
        description: document.getElementById('campaign-description').value,
        required_stamps: document.getElementById('campaign-required-stamps').value,
        reward_voucher_id: document.getElementById('campaign-reward-voucher').value,
        start_date: startDate,
        end_date: endDate,
        
        // [新增] 傳送 can_repeat 的值
        can_repeat: document.getElementById('campaign-can-repeat').checked,
        
        is_active: document.getElementById('campaign-is-active').checked,
    };
    
    try {
        if (payload.campaign_id) await api.updateRallyCampaign(payload);
        else await api.createRallyCampaign(payload);

        ui.toast.success('集點活動儲存成功！');
        ui.hideModal('#edit-campaign-modal');
        await init(); 
    } catch (error) {
        ui.toast.error(`儲存失敗: ${error.message}`);
    } finally {
        saveButton.disabled = false;
        saveButton.textContent = '儲存活動';
    }
}

// 處理站點表單提交
async function handleStationSubmit(event) {
    event.preventDefault();
    const saveButton = event.target.querySelector('button[type="submit"]');
    saveButton.disabled = true;
    saveButton.textContent = '儲存中...';

    const station_id = document.getElementById('edit-station-id').value;
    const expiryDate = stationDatepicker.selectedDates.length > 0 ? flatpickr.formatDate(stationDatepicker.selectedDates[0], "Y-m-d") : null;

    const payload = {
        station_id: station_id ? Number(station_id) : null,
        campaign_id: Number(document.getElementById('station-campaign-id').value),
        name: document.getElementById('station-name').value,
        partner_name: document.getElementById('station-partner-name').value,
        description: document.getElementById('station-description').value,
        partner_validation_info: document.getElementById('station-validation-info').value,
        unique_partner_code: document.getElementById('station-partner-code').value,
        expiry_date: expiryDate,
        is_active: document.getElementById('station-is-active').checked,
    };
    
    try {
        if (payload.station_id) await api.updateRallyStation(payload);
        else await api.createRallyStation(payload);

        ui.toast.success('集點站點儲存成功！');
        ui.hideModal('#edit-station-modal');
        await loadStationsForCampaign(payload.campaign_id, document.getElementById('current-campaign-title').textContent.replace('活動：', '').replace(' 的站點管理', '')); 
    } catch (error) {
        ui.toast.error(`儲存失敗: ${error.message}`);
    } finally {
        saveButton.disabled = false;
        saveButton.textContent = '儲存站點';
    }
}


// 載入並渲染站點列表
async function loadStationsForCampaign(campaignId, campaignTitle) {
    currentCampaignId = campaignId;
    document.getElementById('campaign-list-section').style.display = 'none';
    document.getElementById('station-management-section').style.display = 'block';
    
    document.getElementById('station-list-tbody').innerHTML = '<tr><td colspan="6" style="text-align: center;">載入中...</td></tr>';
    
    try {
        const stations = await api.getRallyStations(campaignId);
        renderStationList(stations, campaignTitle);
    } catch(e) {
        ui.toast.error(`載入站點列表失敗: ${e.message}`);
        document.getElementById('station-list-tbody').innerHTML = `<tr><td colspan="6" style="text-align: center; color: var(--color-danger);">載入失敗: ${e.message}</td></tr>`;
    }
}

// 顯示 QR Code Modal
function showQrcodeModal(code, link) {
    const qrcodeContainer = document.getElementById('qrcode-container-rally');
    if (qrcodeContainer) {
        qrcodeContainer.innerHTML = '';
        new QRCode(qrcodeContainer, {
            text: link,
            width: 300,
            height: 300,
        });
    }
    document.getElementById('qrcode-station-code').textContent = `代碼: ${code}`;
    
    const copyButton = document.getElementById('copy-claim-link-btn');
    if(copyButton) {
        copyButton.onclick = () => {
             if (navigator.clipboard) {
                navigator.clipboard.writeText(link).then(() => ui.toast.success('連結已複製！'));
            } else {
                ui.toast.error('瀏覽器不支援自動複製');
            }
        };
    }
    ui.showModal('#qrcode-display-modal');
}


function setupEventListeners() {
    const page = document.getElementById('page-rally');
    if (!page || page.dataset.initialized === 'true') return;

    // 1. 活動列表區塊事件
    page.addEventListener('click', async (e) => {
        const target = e.target;
        const campaignId = target.dataset.campaignId;

        if (target.id === 'add-campaign-btn') {
            openCampaignModal();
        } else if (target.matches('.btn-show-reset-qrcode')) {
            const link = target.dataset.link;
            document.getElementById('qrcode-modal-title').textContent = '活動重置 QR Code';
            document.getElementById('qrcode-station-code').textContent = '用途：掃描此碼可清空集點卡，開始新的一輪。';
            showQrcodeModal('RESET', link);
        } else if (target.matches('.btn-edit-campaign')) {
            const campaign = allCampaigns.find(c => c.campaign_id == campaignId);
            if (campaign) openCampaignModal(campaign);
        } else if (target.matches('.btn-delete-campaign')) {
            const confirmed = await ui.confirm('確定要刪除此集點活動嗎？此操作將同時刪除所有相關站點及用戶集點紀錄，**無法復原**。');
            if (confirmed) {
                try {
                    await api.deleteRallyCampaign(Number(campaignId));
                    ui.toast.success('活動已刪除！');
                    await init();
                } catch (error) { ui.toast.error(`刪除失敗: ${error.message}`); }
            }
        } else if (target.matches('.btn-view-stations')) {
            const title = target.dataset.title;
            await loadStationsForCampaign(Number(campaignId), title);
        }
    });

    // 2. 站點管理區塊事件 [修改：刪除按鈕邏輯]
    const stationSection = document.getElementById('station-management-section');
    if (stationSection) {
        stationSection.addEventListener('click', async (e) => {
            const target = e.target;
            const stationId = target.dataset.stationId;

            if (target.id === 'back-to-campaigns-btn') {
                document.getElementById('campaign-list-section').style.display = 'block';
                document.getElementById('station-management-section').style.display = 'none';
                currentCampaignId = null;
            } else if (target.id === 'add-station-btn') {
                openStationModal();
            } else if (target.matches('.btn-edit-station')) {
                const stationList = await api.getRallyStations(currentCampaignId); 
                const station = stationList.find(s => s.station_id == stationId);
                if (station) openStationModal(station);
            } else if (target.matches('.btn-delete-station')) {
                // 定義刪除函式
                const executeStationDelete = async (force = false) => {
                    console.log(`[Delete Station] Executing delete for ID: ${stationId}, Force: ${force}`);
                    try {
                        // 呼叫 API
                        await api.deleteRallyStation(Number(stationId), force);
                        ui.toast.success('站點已刪除！');
                        
                        // 刪除成功後重新載入列表
                        const titleEl = document.getElementById('current-campaign-title');
                        const title = titleEl ? titleEl.textContent.replace(/^活動：| 的站點管理$/g, '') : '';
                        if (currentCampaignId) await loadStationsForCampaign(currentCampaignId, title);

                    } catch (error) {
                        console.error("[Delete Station] Error:", error);
                        // 檢查是否為「影響人數」的錯誤 (409)
                        if (error.data && error.data.error === 'affected_users') {
                            const confirmForce = await ui.confirm(`⚠️ 警告：${error.data.message}\n\n這些使用者的進度將會倒退或消失。\n確定要強制刪除嗎？`);
                            if (confirmForce) {
                                console.log("[Delete Station] User confirmed force delete.");
                                await executeStationDelete(true); // 遞迴呼叫，強制刪除
                            } else {
                                console.log("[Delete Station] User cancelled force delete.");
                            }
                        } else {
                            ui.toast.error(`刪除失敗: ${error.message}`);
                        }
                    }
                };

                // 初次呼叫 (非強制)
                const confirmed = await ui.confirm('確定要刪除此站點嗎？');
                if (confirmed) {
                    executeStationDelete(false); // 第一次嘗試 (非強制)
                }
            } else if (target.matches('.btn-show-qrcode')) {
                document.getElementById('qrcode-modal-title').textContent = '站點集點 QR Code';
                document.getElementById('qrcode-station-code').textContent = `代碼: ${target.dataset.code}`;
                showQrcodeModal(target.dataset.code, target.dataset.link);
            }
        });
    }

    // 3. Modal 表單提交 (保持不變)
    const editCampaignForm = document.getElementById('edit-campaign-form');
    if (editCampaignForm) {
        editCampaignForm.removeEventListener('submit', handleCampaignSubmit); 
        editCampaignForm.addEventListener('submit', handleCampaignSubmit);
    }
    
    const editStationForm = document.getElementById('edit-station-form');
    if (editStationForm) {
        editStationForm.removeEventListener('submit', handleStationSubmit);
        editStationForm.addEventListener('submit', handleStationSubmit);
    }

    page.dataset.initialized = 'true';
}

export const init = async () => {
    console.log("[RallyManagement Init] Starting...");
    const tbody = document.getElementById('campaign-list-tbody');
    if (!tbody) return;

    tbody.innerHTML = '<tr><td colspan="6" style="text-align: center;">正在載入活動列表...</td></tr>';
    
    // 隱藏站點區塊
    document.getElementById('campaign-list-section').style.display = 'block';
    document.getElementById('station-management-section').style.display = 'none';

    try {
        // 並行載入所有活動和優惠券樣板
        const [campaigns, vouchers] = await Promise.all([
            api.getRallyCampaigns(),
            api.getVoucherTemplates()
        ]);
        
        // --- 修正：確保 campaigns 是陣列 ---
        allCampaigns = Array.isArray(campaigns) ? campaigns : []; 
        allVoucherTemplates = vouchers;
        
        renderCampaignList(allCampaigns);

        setupEventListeners();
    } catch (error) {
        console.error('集點管理初始化失敗:', error);
        tbody.innerHTML = `<tr><td colspan="6" style="color: red; text-align: center;">載入失敗: ${error.message}</td></tr>`;
    }
};