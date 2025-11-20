// public/admin/modules/voucherManagement.js
import { api } from '../api.js';
import { ui } from '../ui.js';

let allVoucherTemplates = [];
let allProducts = [];
let allUsers = []; // 【新增】用於計算群發受眾
let membershipPlans = []; // 【新增】用於篩選選單
let allTags = []; // 【新增】用於篩選選單
let voucherDatepicker = null;


// --- 核心資料載入與處理 ---
async function loadDependencies() {
    try {
        // 平行載入所有必要資料
        const [templates, products, users, settings] = await Promise.all([
            api.getVoucherTemplates(),
            api.getProducts(),
            api.getUsers(),
            api.getSettings()
        ]);

        allVoucherTemplates = templates;
        allProducts = (products || []).filter(p => p.is_visible);
        allUsers = users || [];
        
        // 解析會員方案
        const plansSetting = settings.find(s => s.key === 'LOGIC_MEMBERSHIP_PLANS');
        membershipPlans = plansSetting && plansSetting.value ? JSON.parse(plansSetting.value) : [];
        
        // 提取所有使用過的標籤 (去重複)
        const tagsSet = new Set();
        allUsers.forEach(u => {
            if (u.tag) tagsSet.add(u.tag);
        });
        allTags = Array.from(tagsSet);

    } catch (error) {
        console.error("載入優惠券相依資料失敗:", error);
        ui.toast.error("資料載入不完整，部分功能可能受限。");
    }
}


//  渲染列表 
function renderVoucherList(templates) {
    const tbody = document.getElementById('voucher-list-tbody');
    if (!tbody) return;

    if (templates.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" style="text-align: center;">尚未建立任何優惠券樣板。</td></tr>';
        return;
    }

    tbody.innerHTML = templates.map(t => {
        let typeText = '';
        let valueText = '';
        switch (t.type) {
            case 'discount_fixed':
                typeText = '金額折扣';
                valueText = `$${t.value}`;
                break;
            case 'discount_percentage':
                typeText = '百分比折扣';
                valueText = `${t.value}% OFF`;
                break;
            case 'redeem_item':
                typeText = '物品兌換';
                valueText = t.redeem_item_name;
                break;
            default:
                typeText = t.type;
        }

        const dateRange = (t.valid_from && t.valid_to) ? `${t.valid_from} ~ ${t.valid_to}` : '永久有效';
        const statusText = t.is_active ? 
            '<span style="color: var(--color-success);">啟用</span>' : 
            '<span style="color: var(--color-secondary);">停用</span>';

        return `
            <tr>
                <td>
                    <div class="main-info">${t.title}</div>
                    <div class="sub-info">${t.internal_name}</div>
                </td>
                <td>${typeText}</td>
                <td>${valueText}</td>
                <td>${dateRange}</td>
                <td>${statusText}</td>
                <td class="actions-cell">
                    <button class="action-btn btn-mass-issue" data-template-id="${t.template_id}" style="background-color: var(--color-info);">群發</button>
                    <button class="action-btn btn-edit-voucher" data-template-id="${t.template_id}" style="background-color: var(--color-warning); color: #000;">編輯</button>
                    <button class="action-btn btn-delete-voucher" data-template-id="${t.template_id}" style="background-color: var(--color-danger);">刪除</button>
                </td>
            </tr>
        `;
    }).join('');
}

//  ▼▼▼ ：渲染「公開領取」列表 ▼▼▼ 
// --- 頁面渲染: 2. 公開領取 (卡片化 + QR Code) ---
function renderPublicVoucherList(templates) {
    const container = document.getElementById('public-vouchers-container');
    if (!container) return;

    const publicTemplates = templates.filter(t => t.is_public && t.is_active);
    
    if (publicTemplates.length === 0) {
        container.innerHTML = '<p style="color: var(--color-text-light); padding: 20px; text-align: center; background: #f9f9f9;">目前沒有「已啟用」且設定為「公開領取」的優惠券。<br>請至「樣板管理」新增或修改。</p>';
        return;
    }

    container.innerHTML = ''; // 清空

    publicTemplates.forEach(t => {
        const claimUrl = `${window.location.origin}/claim?voucher_code=${t.public_claim_code}`;
        let valueDisplay = '';
        if(t.type === 'discount_fixed') valueDisplay = `$${t.value}`;
        else if(t.type === 'discount_percentage') valueDisplay = `${t.value}% OFF`;
        else valueDisplay = '兌換券';

        // 建立卡片 DOM
        const card = document.createElement('div');
        card.className = 'voucher-marketing-card';
        card.innerHTML = `
            <div class="vm-preview-section">
                <div class="vm-coupon-stub">
                    <div class="vm-coupon-title">${t.title}</div>
                    <div class="vm-coupon-value">${valueDisplay}</div>
                    <div class="vm-coupon-expiry">代碼: ${t.public_claim_code}</div>
                </div>
                <p style="margin-top: 15px; font-size: 0.9rem; opacity: 0.9;">
                    <small>預覽樣式</small>
                </p>
            </div>
            <div class="vm-tools-section">
                <div class="vm-tool-row">
                    <span class="vm-tool-label">推廣連結</span>
                    <input type="text" class="vm-link-input" value="${claimUrl}" readonly>
                    <button class="action-btn btn-copy-claim-link" data-url="${claimUrl}" style="background-color: var(--color-secondary);">複製</button>
                </div>
                <div class="vm-tool-row">
                    <span class="vm-tool-label">QR Code</span>
                    <div id="qrcode-${t.template_id}" class="vm-qrcode-container"></div>
                    <div style="display: flex; flex-direction: column; gap: 5px;">
                         <span style="font-size: 0.8rem; color: #666;">客人掃描即可領取</span>
                         </div>
                </div>
            </div>
        `;
        container.appendChild(card);

        // 生成 QR Code
        setTimeout(() => {
            const qrContainer = document.getElementById(`qrcode-${t.template_id}`);
            if (qrContainer && typeof QRCode !== 'undefined') {
                qrContainer.innerHTML = ''; // 確保清空
                new QRCode(qrContainer, {
                    text: claimUrl,
                    width: 90,
                    height: 90,
                    colorDark : "#000000",
                    colorLight : "#ffffff",
                    correctLevel : QRCode.CorrectLevel.H
                });
            }
        }, 100);
    });
}

// --- 頁面渲染: 3. 指定群發 (引導式 UI) ---
function renderMassIssueUI(templates) {
    const container = document.getElementById('mass-issue-container');
    if (!container) return;

    // 篩選可用樣板
    const activeTemplates = templates.filter(t => t.is_active);
    let templateOptions = '<option value="">-- 請選擇優惠券 --</option>';
    activeTemplates.forEach(t => {
        templateOptions += `<option value="${t.template_id}">${t.title} (${t.internal_name})</option>`;
    });

    container.innerHTML = `
        <div class="mass-issue-dashboard">
            <div class="mi-step-box">
                <div class="mi-step-title"><span class="mi-step-badge">1</span> 鎖定目標客群</div>
                
                <div class="form-group">
                    <label>篩選依據:</label>
                    <select id="mi-filter-type">
                        <option value="">-- 請選擇 --</option>
                        <option value="all">全體顧客 (${allUsers.length} 人)</option>
                        <option value="class">會員方案</option>
                        <option value="tag">標籤</option>
                        <option value="level_gt">等級大於等於</option>
                    </select>
                </div>

                <div class="form-group" id="mi-filter-value-container" style="display: none;">
                    <label id="mi-filter-value-label">篩選值:</label>
                    <div id="mi-filter-value-wrapper">
                        </div>
                </div>

                <div class="audience-summary" id="mi-audience-summary">
                    請先選擇篩選條件
                </div>
            </div>

            <div class="mi-step-box">
                <div class="mi-step-title"><span class="mi-step-badge">2</span> 選擇優惠券與通知</div>
                
                <div class="form-group">
                    <label>要發送的優惠券:</label>
                    <select id="mi-template-select">${templateOptions}</select>
                </div>

                <div class="form-group" style="margin-top: 15px; padding-top: 15px; border-top: 1px dashed #ddd;">
                    <label style="display: flex; align-items: center; cursor: pointer;">
                        <input type="checkbox" id="mi-send-notification" checked style="width: auto; margin-right: 8px;">
                        同時發送 LINE 通知訊息
                    </label>
                    <small style="color: #888; display: block; margin-top: 5px;">若取消勾選，優惠券仍會存入帳戶，但顧客不會收到主動通知。</small>
                </div>

                <button id="btn-preview-mass-issue" class="action-btn" style="width: 100%; margin-top: 20px; background-color: var(--color-primary); font-size: 1rem; padding: 12px;">預覽並確認發送</button>
            </div>
        </div>
    `;

    // 綁定事件：篩選類型變更
    const typeSelect = document.getElementById('mi-filter-type');
    const valueContainer = document.getElementById('mi-filter-value-container');
    const valueWrapper = document.getElementById('mi-filter-value-wrapper');
    const summaryBox = document.getElementById('mi-audience-summary');

    typeSelect.addEventListener('change', () => {
        const type = typeSelect.value;
        valueWrapper.innerHTML = ''; // 清空
        summaryBox.textContent = '計算中...';
        summaryBox.style.background = '#e3f2fd';
        summaryBox.style.color = '#0d47a1';

        if (type === '') {
            valueContainer.style.display = 'none';
            summaryBox.textContent = '請先選擇篩選條件';
            return;
        }

        if (type === 'all') {
            valueContainer.style.display = 'none';
            updateAudienceCount(allUsers.length); // 全體
            return;
        }

        valueContainer.style.display = 'block';

        if (type === 'class') {
            let html = '<select id="mi-filter-value-input">';
            html += '<option value="">-- 選擇方案 --</option>';
            membershipPlans.forEach(p => { html += `<option value="${p.planName}">${p.planName}</option>`; });
            html += '</select>';
            valueWrapper.innerHTML = html;
        } else if (type === 'tag') {
            let html = '<select id="mi-filter-value-input">';
            html += '<option value="">-- 選擇標籤 --</option>';
            allTags.forEach(t => { html += `<option value="${t}">${t}</option>`; });
            html += '</select>';
            valueWrapper.innerHTML = html;
        } else if (type === 'level_gt') {
            valueWrapper.innerHTML = '<input type="number" id="mi-filter-value-input" min="1" placeholder="例如 5">';
        }

        // 綁定值的變更事件以即時計算
        const inputEl = document.getElementById('mi-filter-value-input');
        if (inputEl) {
            inputEl.addEventListener('change', calculateAudience);
            inputEl.addEventListener('input', calculateAudience); // 針對 input number
        }
        // 初始計算 (若是 select 預設為空，計算結果應為 0)
        calculateAudience();
    });

    // 綁定「預覽並確認」按鈕
    document.getElementById('btn-preview-mass-issue').addEventListener('click', handleMassIssuePreview);
}

// --- 邏輯輔助: 計算受眾人數 ---
function calculateAudience() {
    const type = document.getElementById('mi-filter-type').value;
    const summaryBox = document.getElementById('mi-audience-summary');
    
    if (type === 'all') {
        updateAudienceCount(allUsers.length);
        return allUsers.length;
    }

    const inputEl = document.getElementById('mi-filter-value-input');
    if (!inputEl) return 0;
    
    const value = inputEl.value;
    if (!value) {
        summaryBox.textContent = '請選擇/輸入篩選值';
        return 0;
    }

    // 執行前端篩選計算
    let count = 0;
    if (type === 'class') {
        count = allUsers.filter(u => u.class === value).length;
    } else if (type === 'tag') {
        count = allUsers.filter(u => u.tag === value).length;
    } else if (type === 'level_gt') {
        count = allUsers.filter(u => u.level >= Number(value)).length;
    }

    updateAudienceCount(count);
    return count;
}

function updateAudienceCount(count) {
    const summaryBox = document.getElementById('mi-audience-summary');
    if (count > 0) {
        summaryBox.innerHTML = `預計發送對象： <span style="font-size: 1.2em;">${count}</span> 人`;
        summaryBox.style.background = '#e8f5e9'; // 綠底
        summaryBox.style.color = '#2e7d32';
    } else {
        summaryBox.textContent = '沒有符合條件的顧客';
        summaryBox.style.background = '#ffebee'; // 紅底
        summaryBox.style.color = '#c62828';
    }
}

// --- 邏輯輔助: 處理發送預覽與確認 ---
async function handleMassIssuePreview() {
    const type = document.getElementById('mi-filter-type').value;
    const templateId = document.getElementById('mi-template-select').value;
    const sendNotification = document.getElementById('mi-send-notification').checked;
    
    // 1. 驗證
    if (!templateId) return ui.toast.error('請選擇優惠券樣板！');
    if (!type) return ui.toast.error('請選擇篩選條件！');

    let value = '';
    let count = 0;
    
    if (type === 'all') {
        count = allUsers.length;
    } else {
        value = document.getElementById('mi-filter-value-input')?.value;
        if (!value) return ui.toast.error('請選擇或輸入篩選值！');
        count = calculateAudience(); // 重新確認一次
    }

    if (count === 0) return ui.toast.error('沒有符合條件的發送對象，無法執行。');

    // 2. 取得樣板名稱顯示用
    const templateName = allVoucherTemplates.find(t => t.template_id == templateId)?.title || '未知券';
    
    // 3. 顯示確認 Modal (使用 ui.confirm)
    const confirmMsg = `
        【確認群發任務】\n
        🎫 優惠券：${templateName}\n
        👥 對象：${type === 'all' ? '全體顧客' : `篩選「${value}」`} (約 ${count} 人)\n
        🔔 通知：${sendNotification ? '發送 LINE 訊息' : '靜默發送 (不通知)'}\n
        \n確定要執行嗎？
    `;

    if (await ui.confirm(confirmMsg)) {
        await executeMassIssue(templateId, type, value, sendNotification);
    }
}

async function executeMassIssue(templateId, filterType, filterValue, sendNotification) {
    const btn = document.getElementById('btn-preview-mass-issue');
    btn.disabled = true;
    btn.textContent = '任務啟動中...';

    try {
        // 針對 'all' 類型的處理：後端 API 其實沒有 'all' 這個 filterType
        // 我們可以轉成 level_gt = 0 (包含所有人) 或者修改後端 API
        // 這裡我們用一個小技巧：傳送 level_gt = 0
        let apiFilterType = filterType;
        let apiFilterValue = filterValue;
        
        if (filterType === 'all') {
            apiFilterType = 'level_gt';
            apiFilterValue = 0;
        }

        const result = await api.massIssueVoucher({
            templateId: Number(templateId),
            filterType: apiFilterType,
            filterValue: apiFilterValue,
            sendNotification: sendNotification
        });

        ui.toast.success(result.message || '群發任務已在背景啟動！');
        
        // 重置表單
        document.getElementById('mi-filter-type').selectedIndex = 0;
        document.getElementById('mi-template-select').selectedIndex = 0;
        document.getElementById('mi-filter-value-container').style.display = 'none';
        document.getElementById('mi-audience-summary').textContent = '請先選擇篩選條件';
        document.getElementById('mi-audience-summary').style.background = '#e3f2fd';

    } catch (error) {
        ui.toast.error(`群發失敗: ${error.message}`);
    } finally {
        btn.disabled = false;
        btn.textContent = '預覽並確認發送';
    }
}

function openVoucherModal(template = null) {
    const form = document.getElementById('edit-voucher-form');
    const modalTitle = document.getElementById('modal-voucher-title');
    if (!form || !modalTitle) return;

    form.reset();
    document.getElementById('edit-voucher-id').value = '';
    
    //  填充「適用項目」下拉選單 
    const productContainer = document.getElementById('voucher-applicable-products');
    if (productContainer) {
        productContainer.innerHTML = ''; // 清空舊選項
        if (allProducts.length === 0) {
            productContainer.innerHTML = '<p style="color: var(--color-text-light); font-size: 0.9em;">沒有可用的產品項目。</p>';
        } else {
            // 動態產生 Checkbox 列表
            allProducts.forEach(p => {
                const itemDiv = document.createElement('div');
                itemDiv.innerHTML = `
                    <label>
                        <input type="checkbox" name="applicable_product_ids" value="${p.product_id}">
                        ${p.name}
                    </label>
                `;
                productContainer.appendChild(itemDiv);
            });
        }
    }

    //  初始化日期選擇器 
    if (voucherDatepicker) voucherDatepicker.destroy();
    voucherDatepicker = flatpickr("#voucher-valid-dates", {
        mode: "range",
        dateFormat: "Y-m-d",
        locale: "zh_tw"
    });

    //  重置所有動態 UI 
    document.getElementById('voucher-value-group').style.display = 'none';
    document.getElementById('voucher-redeem-group').style.display = 'none';
    document.getElementById('voucher-public-code-group').style.display = 'none';
    document.querySelectorAll('#voucher-applicable-weekdays input').forEach(cb => cb.checked = true);
    document.getElementById('voucher-is-active').checked = true;
    document.getElementById('voucher-is-public').checked = false;


    if (template) {
        //  編輯模式 
        modalTitle.textContent = '編輯優惠券樣板';
        document.getElementById('edit-voucher-id').value = template.template_id;
        document.getElementById('voucher-internal-name').value = template.internal_name;
        document.getElementById('voucher-title').value = template.title;
        document.getElementById('voucher-type').value = template.type;
        
        // 觸發類型變更，以顯示正確的數值欄位
        handleVoucherTypeChange(template.type);
        document.getElementById('voucher-value').value = template.value || '';
        document.getElementById('voucher-redeem-item-name').value = template.redeem_item_name || '';

        document.getElementById('voucher-min-spend').value = template.min_spend || 0;
        
        // 設定日期
        if (template.valid_from && template.valid_to) {
            voucherDatepicker.setDate([template.valid_from, template.valid_to]);
        }

        // 設定適用項目 (多選)
        if (Array.isArray(template.applicable_product_ids)) {
            // 遍歷容器中所有的 checkbox
            productContainer.querySelectorAll('input[type="checkbox"]').forEach(checkbox => {
                // 如果 checkbox 的 value 存在於 template.applicable_product_ids 陣列中，就勾選它
                if (template.applicable_product_ids.includes(checkbox.value)) {
                    checkbox.checked = true;
                }
            });
        }
        
        // 設定適用星期
        const days = template.applicable_days_of_week || [0,1,2,3,4,5,6];
        document.querySelectorAll('#voucher-applicable-weekdays input').forEach(cb => {
            cb.checked = days.includes(Number(cb.value));
        });

        // 發行規則
        document.getElementById('voucher-total-supply').value = template.total_supply || '';
        document.getElementById('voucher-limit-per-user').value = template.limit_per_user || 1;
        document.getElementById('voucher-is-public').checked = !!template.is_public;
        
        // 觸發公開領取變更，以顯示代碼欄位
        handlePublicClaimChange(!!template.is_public);
        document.getElementById('voucher-public-claim-code').value = template.public_claim_code || '';
        document.getElementById('voucher-is-active').checked = !!template.is_active;

    } else {
        //  模式 
        modalTitle.textContent = '建立新優惠券樣板';
        // (所有欄位已在 form.reset() 和 UI 重置中清空)
    }

    ui.showModal('#edit-voucher-modal');
}

//  處理 Modal 內的動態 UI 
function handleVoucherTypeChange(type) {
    const valueGroup = document.getElementById('voucher-value-group');
    const redeemGroup = document.getElementById('voucher-redeem-group');
    
    valueGroup.style.display = (type === 'discount_fixed' || type === 'discount_percentage') ? 'block' : 'none';
    redeemGroup.style.display = (type === 'redeem_item') ? 'block' : 'none';
}

function handlePublicClaimChange(isPublic) {
    const codeGroup = document.getElementById('voucher-public-code-group');
    codeGroup.style.display = isPublic ? 'block' : 'none';
}

//  處理表單提交 
async function handleFormSubmit(event) {
    event.preventDefault();
    const saveButton = event.target.querySelector('button[type="submit"]');
    saveButton.disabled = true;
    saveButton.textContent = '儲存中...';

    const template_id = document.getElementById('edit-voucher-id').value;
    
    //  收集適用項目 (多選) 
    const applicable_product_ids = Array.from(
        document.querySelectorAll('#voucher-applicable-products input[type="checkbox"]:checked')
    ).map(cb => cb.value);
    
    // 收集適用星期
    const applicable_days_of_week = Array.from(document.querySelectorAll('#voucher-applicable-weekdays input:checked')).map(cb => Number(cb.value));

    // 收集日期
    const dates = voucherDatepicker.selectedDates;
    const valid_from = dates.length > 0 ? flatpickr.formatDate(dates[0], "Y-m-d") : null;
    const valid_to = dates.length > 1 ? flatpickr.formatDate(dates[1], "Y-m-d") : (dates.length > 0 ? flatpickr.formatDate(dates[0], "Y-m-d") : null); // 如果只選一天，開始結束設同一天

    const payload = {
        template_id: template_id ? Number(template_id) : null,
        internal_name: document.getElementById('voucher-internal-name').value,
        title: document.getElementById('voucher-title').value,
        type: document.getElementById('voucher-type').value,
        value: document.getElementById('voucher-value').value,
        redeem_item_name: document.getElementById('voucher-redeem-item-name').value,
        min_spend: document.getElementById('voucher-min-spend').value,
        valid_from: valid_from,
        valid_to: valid_to,
        applicable_product_ids: applicable_product_ids,
        applicable_days_of_week: applicable_days_of_week,
        total_supply: document.getElementById('voucher-total-supply').value,
        limit_per_user: document.getElementById('voucher-limit-per-user').value,
        is_public: document.getElementById('voucher-is-public').checked,
        public_claim_code: document.getElementById('voucher-public-claim-code').value,
        is_active: document.getElementById('voucher-is-active').checked,
    };

    try {
        if (payload.template_id) {
            await api.updateVoucherTemplate(payload);
        } else {
            await api.createVoucherTemplate(payload);
        }
        ui.toast.success('樣板儲存成功！');
        ui.hideModal('#edit-voucher-modal');
        await init(); // 重新載入列表
    } catch (error) {
        ui.toast.error(`儲存失敗: ${error.message}`);
    } finally {
        saveButton.disabled = false;
        saveButton.textContent = '儲存樣板';
    }
}

//  處理刪除 
async function handleDelete(templateId) {
    if (!templateId) return;
    
    //  ▼▼▼ 修正：更新提示文字 ▼▼▼ 
    const confirmed = await ui.confirm('確定要刪除或停用此樣板嗎？\n\n(注意：如果此樣板已被發行，它將被設為「停用」而不是永久刪除。)');
    if (!confirmed) return;

    try {
        // 呼叫的 API 保持 (api.deleteVoucherTemplate)
        const result = await api.deleteVoucherTemplate(Number(templateId));
        
        // 顯示後端回傳的訊息
        ui.toast.success(result.message || '操作成功！'); 
        //  ▲▲▲ 修正結束 ▲▲▲ 
        
        await init(); // 重新載入列表
    } catch (error) {
        ui.toast.error(`操作失敗: ${error.message}`);
    }
}

//  ▼▼▼ ：處理群發提交的函式 ▼▼▼ 
async function handleMassIssueSubmit(event) {
    const button = event.target;
    const templateId = document.getElementById('mass-issue-template-select')?.value;
    const filterType = document.getElementById('mass-issue-filter-type')?.value;
    const filterValue = document.getElementById('mass-issue-filter-value')?.value;
    const sendNotification = document.getElementById('mass-issue-send-notification')?.checked || false;
    // 1. 前端驗證
    if (!templateId) {
        ui.toast.error('請選擇要發送的優惠券樣板！');
        return;
    }
    if (!filterType) {
        ui.toast.error('請選擇一個篩選條件類型！');
        return;
    }
    if (filterValue === null || filterValue.trim() === '') {
        ui.toast.error('請輸入篩選值！');
        return;
    }

    // 2. 顯示確認彈窗
    const selectedTemplateText = document.getElementById('mass-issue-template-select').options[document.getElementById('mass-issue-template-select').selectedIndex].text;
    const selectedFilterText = document.getElementById('mass-issue-filter-type').options[document.getElementById('mass-issue-filter-type').selectedIndex].text;

    const notificationText = sendNotification ? "\n\n向所有符合資格的顧客「發送一則通知訊息」。" : "\n\n(注意：此為靜默發送，顧客不會收到通知)";
    const confirmed = await ui.confirm(`【注意!】\n\n您確定要將優惠券「${selectedTemplateText}」發送給所有「${selectedFilterText}」為「${filterValue}」的顧客嗎？${notificationText}\n\n此操作無法復原。`);
    if (!confirmed) return;

    // 3. 呼叫 API
    button.disabled = true;
    button.textContent = '任務啟動中...';

    try {
        const result = await api.massIssueVoucher({
            templateId: Number(templateId),
            filterType: filterType,
            filterValue: filterValue,
            sendNotification: sendNotification
        });

        // 顯示 API 的立即回傳訊息 (202 Accepted)
        ui.toast.success(result.message || '群發任務已啟動');
        
        // 重置輸入框
        document.getElementById('mass-issue-filter-value').value = '';
        document.getElementById('mass-issue-filter-type').selectedIndex = 0;
        document.getElementById('mass-issue-template-select').selectedIndex = 0;
        document.getElementById('mass-issue-send-notification').checked = true; // 恢復預設勾選

    } catch (error) {
        // 顯示 API 回傳的錯誤 (4xx / 5xx)
        ui.toast.error(`群發失敗: ${error.message}`);
    } finally {
        button.disabled = false;
        button.textContent = '執行群發';
    }
}

//  綁定事件 
function setupEventListeners() {
    const page = document.getElementById('page-vouchers');
    if (!page || page.dataset.initialized === 'true') return;

    //  子分頁切換邏輯 () 
    const subTabsContainer = document.getElementById('voucher-sub-tabs');
    subTabsContainer?.addEventListener('click', (e) => {
        if (e.target.matches('.settings-tab')) {
            subTabsContainer.querySelector('.active')?.classList.remove('active');
            e.target.classList.add('active');
            
            page.querySelectorAll('.settings-tab-content').forEach(content => {
                content.classList.remove('active');
            });
            
            const targetContent = document.getElementById(e.target.dataset.target);
            if (targetContent) {
                targetContent.classList.add('active');
            }
        }
    });

    // "建立新樣板" 按鈕 ()
    document.getElementById('add-voucher-btn')?.addEventListener('click', () => {
        openVoucherModal(null);
    });

    // 列表事件委派 (編輯 / 刪除 / 群發) ()
    const tbody = document.getElementById('voucher-list-tbody');
    tbody?.addEventListener('click', (e) => {
        // ( ... 編輯、刪除按鈕邏輯 ... )
        const editBtn = e.target.closest('.btn-edit-voucher');
        if (editBtn) {
            const id = editBtn.dataset.templateId;
            const template = allVoucherTemplates.find(t => t.template_id == id);
            if (template) openVoucherModal(template);
            return;
        }

        const deleteBtn = e.target.closest('.btn-delete-voucher');
        if (deleteBtn) {
            handleDelete(deleteBtn.dataset.templateId);
            return;
        }
        
        const issueBtn = e.target.closest('.btn-mass-issue');
        if (issueBtn) {
            // ▼▼▼ 修改：點擊群發時，切換到「發送中心」子分頁 ▼▼▼
            const targetTab = document.querySelector('#voucher-sub-tabs button[data-target="voucher-tab-content-issuance"]');
            if(targetTab) {
                targetTab.click(); // 模擬點擊
                ui.toast.info('請在「發送中心」頁面執行群發操作。');
                // 未來：可以將 templateId 帶過去
            }
        }
    });

    // 公開領取區的複製按鈕
    const publicContainer = document.getElementById('public-vouchers-container');
    publicContainer?.addEventListener('click', (e) => {
        if (e.target.matches('.btn-copy-claim-link')) {
            const url = e.target.dataset.url;
            navigator.clipboard.writeText(url).then(() => ui.toast.success('連結已複製！'));
        }
    });

    //  ▼▼▼ ：「發送中心」事件委派 ▼▼▼ 
    const issuanceTab = document.getElementById('voucher-tab-content-issuance');
    issuanceTab?.addEventListener('click', (e) => {
        // 處理「複製連結」 ()
        const copyBtn = e.target.closest('.btn-copy-claim-link');
        if (copyBtn) {
            const url = copyBtn.dataset.url;
            if (navigator.clipboard) {
                navigator.clipboard.writeText(url).then(() => {
                    ui.toast.success('領取連結已複製！');
                }).catch(err => {
                    ui.toast.error('複製失敗');
                });
            } else {
                ui.toast.error('您的瀏覽器不支援自動複製');
            }
            return;
        }
        
        // 處理「執行群發」
        const massIssueBtn = e.target.closest('#btn-execute-mass-issue');
        if (massIssueBtn) {
            // ▼▼▼ 修改：呼叫新的處理函式 ▼▼▼
            handleMassIssueSubmit(e); 
            // ▲▲▲ 修改結束 ▲▲▲
            return;
        }
    });
    //  ▲▲▲ 修改結束 ▲▲▲ 

    // Modal 表單事件 ()
    const form = document.getElementById('edit-voucher-form');
    form?.addEventListener('submit', handleFormSubmit);

    // Modal 內的動態 UI 觸發
    document.getElementById('voucher-type')?.addEventListener('change', (e) => {
        handleVoucherTypeChange(e.target.value);
    });
    document.getElementById('voucher-is-public')?.addEventListener('change', (e) => {
        handlePublicClaimChange(e.target.checked);
    });

    page.dataset.initialized = 'true';
}

// --- Init ---
export const init = async () => {
    const tbody = document.getElementById('voucher-list-tbody');
    if (!tbody) return;

    // 預設分頁
    const subTabsContainer = document.getElementById('voucher-sub-tabs');
    const templatesTab = subTabsContainer?.querySelector('button[data-target="voucher-tab-content-templates"]');
    if(templatesTab) templatesTab.click(); 

    tbody.innerHTML = '<tr><td colspan="6" style="text-align: center;">載入中...</td></tr>';

    // 1. 載入所有資料
    await loadDependencies();

    // 2. 渲染畫面
    renderVoucherList(allVoucherTemplates);
    renderPublicVoucherList(allVoucherTemplates);
    renderMassIssueUI(allVoucherTemplates);
    
    // 3. 綁定事件 (如果需要)
    const page = document.getElementById('page-vouchers');
    if (page && !page.dataset.initialized) {
        // setupEventListeners(); // 請確認已包含完整的 CRUD 綁定
        page.dataset.initialized = 'true';
    }
};