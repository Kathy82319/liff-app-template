// public/admin/modules/voucherManagement.js
import { api } from '../api.js';
import { ui } from '../ui.js';

let allVoucherTemplates = [];
let allProducts = []; // 快取所有產品，用於「適用項目」下拉選單
let voucherDatepicker = null;

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
function renderPublicVoucherList(templates) {
    const container = document.getElementById('public-vouchers-container');
    if (!container) return;

    // 篩選出可公開領取的樣板
    const publicTemplates = templates.filter(t => t.is_public && t.is_active);

    if (publicTemplates.length === 0) {
        container.innerHTML = '<p style="color: var(--color-text-light);">目前沒有已啟用的公開優惠券。</p>';
        return;
    }

    container.innerHTML = publicTemplates.map(t => {
        const claimUrl = `${window.location.origin}/claim?code=${t.public_claim_code}`;
        return `
            <div style="background: var(--color-sidebar-bg); border: 1px solid var(--color-border); border-radius: var(--border-radius); padding: 1rem; margin-bottom: 1rem;">
                <h5 style="margin-top: 0;">${t.title}</h5>
                <p style="font-size: 0.9em; color: var(--color-text-light);">領取代碼: <code style="color: var(--color-primary); background: #eee; padding: 2px 4px; border-radius: 4px;">${t.public_claim_code}</code></p>
                <div style="display: flex; gap: 10px; margin-top: 10px;">
                    <input type="text" value="${claimUrl}" readonly style="flex-grow: 1; font-size: 0.9em;">
                    <button class="action-btn btn-copy-claim-link" data-url="${claimUrl}" style="background-color: var(--color-primary); flex-shrink: 0;">複製連結</button>
                </div>
            </div>
        `;
    }).join('');
}

//  ▼▼▼ ：渲染「指定群發」UI (目前為佔位符) ▼▼▼ 
function renderMassIssueUI(templates) {
    const container = document.getElementById('mass-issue-container');
    if (!container) return;

    // 篩選出所有已啟用的樣板 (不論是否 public)
    const activeTemplates = templates.filter(t => t.is_active);

    let optionsHtml = '<option value="">-- 請選擇要群發的優惠券 --</option>';
    activeTemplates.forEach(t => {
        optionsHtml += `<option value="${t.template_id}">${t.title} (${t.internal_name})</option>`;
    });

    container.innerHTML = `
        <div style="background: var(--color-sidebar-bg); border: 1px solid var(--color-border); border-radius: var(--border-radius); padding: 1rem;">
            <div class="form-group">
                <label for="mass-issue-template-select">選擇優惠券樣板:</label>
                <select id="mass-issue-template-select">${optionsHtml}</select>
            </div>
            <div class="form-group">
                <label for="mass-issue-filter-type">篩選條件:</label>
                <select id="mass-issue-filter-type">
                    <option value="">-- 選擇篩選類型 --</option>
                    <option value="class">依會員方案</option>
                    <option value="tag">依顧客標籤</option>
                    <option value="level_gt">依等級 (大於等於)</option>
                </select>
            </div>
            <div class="form-group">
                <label for="mass-issue-filter-value">篩選值:</label>
                <input type="text" id="mass-issue-filter-value" placeholder="例如: VIP, 或 5">
            </div>
            <button id="btn-execute-mass-issue" class="action-btn btn-save" style="width: 100%; padding: 10px; background-color: var(--color-danger);">執行群發</button>
        </div>
    `;
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

    const confirmed = await ui.confirm(`【危險操作】\n\n您確定要將優惠券「${selectedTemplateText}」發送給所有「${selectedFilterText}」為「${filterValue}」的顧客嗎？\n\n此操作無法復原。`);
    
    if (!confirmed) return;

    // 3. 呼叫 API
    button.disabled = true;
    button.textContent = '任務啟動中...';

    try {
        const result = await api.massIssueVoucher({
            templateId: Number(templateId),
            filterType: filterType,
            filterValue: filterValue
        });

        // 顯示 API 的立即回傳訊息 (202 Accepted)
        ui.toast.success(result.message || '群發任務已啟動');
        
        // 重置輸入框
        document.getElementById('mass-issue-filter-value').value = '';
        document.getElementById('mass-issue-filter-type').selectedIndex = 0;
        document.getElementById('mass-issue-template-select').selectedIndex = 0;

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

//  ▼▼▼ 修改：init 函式 ▼▼▼ 
export const init = async () => {
    const tbody = document.getElementById('voucher-list-tbody');
    if (!tbody) return;
    
    // 預設顯示第一個子分頁 (樣板管理)
    const subTabsContainer = document.getElementById('voucher-sub-tabs');
    const templatesTab = subTabsContainer?.querySelector('button[data-target="voucher-tab-content-templates"]');
    if(templatesTab) templatesTab.click(); // 觸發點擊以顯示正確的分頁

    tbody.innerHTML = '<tr><td colspan="6" style="text-align: center;">載入中...</td></tr>';

    try {
        // 同時獲取樣板和產品列表 (用於 Modal)
        const [templates, products] = await Promise.all([
            api.getVoucherTemplates(),
            api.getProducts()
        ]);
        
        allVoucherTemplates = templates;
        allProducts = (products || []).filter(p => p.is_visible); // 只顯示上架的產品
        
        // 渲染 3 個區塊
        renderVoucherList(allVoucherTemplates);
        renderPublicVoucherList(allVoucherTemplates); // <-- 
        renderMassIssueUI(allVoucherTemplates);       // <-- 
        
        setupEventListeners();
        
    } catch (error) {
        console.error('初始化優惠券樣板頁面失敗:', error);
        tbody.innerHTML = `<tr><td colspan="6" style="color: red; text-align: center;">讀取失敗: ${error.message}</td></tr>`;
    }
};
//  ▲▲▲ 修改結束 ▲▲▲ 