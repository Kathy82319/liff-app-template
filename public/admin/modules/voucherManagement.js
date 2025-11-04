// public/admin/modules/voucherManagement.js
import { api } from '../api.js';
import { ui } from '../ui.js';

let allVoucherTemplates = [];
let allProducts = []; // 快取所有產品，用於「適用項目」下拉選單
let voucherDatepicker = null;

// --- 渲染列表 ---
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

// --- 開啟 Modal ---
function openVoucherModal(template = null) {
    const form = document.getElementById('edit-voucher-form');
    const modalTitle = document.getElementById('modal-voucher-title');
    if (!form || !modalTitle) return;

    form.reset();
    document.getElementById('edit-voucher-id').value = '';
    
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

    // --- 初始化日期選擇器 ---
    if (voucherDatepicker) voucherDatepicker.destroy();
    voucherDatepicker = flatpickr("#voucher-valid-dates", {
        mode: "range",
        dateFormat: "Y-m-d",
        locale: "zh_tw"
    });

    // --- 重置所有動態 UI ---
    document.getElementById('voucher-value-group').style.display = 'none';
    document.getElementById('voucher-redeem-group').style.display = 'none';
    document.getElementById('voucher-public-code-group').style.display = 'none';
    document.querySelectorAll('#voucher-applicable-weekdays input').forEach(cb => cb.checked = true);
    document.getElementById('voucher-is-active').checked = true;
    document.getElementById('voucher-is-public').checked = false;


    if (template) {
        // --- 編輯模式 ---
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

        // ▼▼▼ 修正 2：修改「設定適用項目」的邏輯 ▼▼▼
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
        // --- 新增模式 ---
        modalTitle.textContent = '建立新優惠券樣板';
        // (所有欄位已在 form.reset() 和 UI 重置中清空)
    }

    ui.showModal('#edit-voucher-modal');
}

// --- 處理 Modal 內的動態 UI ---
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

// --- 處理表單提交 ---
async function handleFormSubmit(event) {
    event.preventDefault();
    const saveButton = event.target.querySelector('button[type="submit"]');
    saveButton.disabled = true;
    saveButton.textContent = '儲存中...';

    const template_id = document.getElementById('edit-voucher-id').value;
    
    // --- ▼▼▼ 修正 3：修改「收集適用項目」的邏輯 ▼▼▼ ---
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

// --- 處理刪除 ---
async function handleDelete(templateId) {
    if (!templateId) return;
    
    // TODO: 未來這裡要改成檢查是否已發送
    const confirmed = await ui.confirm('確定要刪除這個樣板嗎？此操作無法復原。');
    if (!confirmed) return;

    try {
        await api.deleteVoucherTemplate(Number(templateId));
        ui.toast.success('樣板刪除成功！');
        await init(); // 重新載入列表
    } catch (error) {
        ui.toast.error(`刪除失敗: ${error.message}`);
    }
}

// --- 綁定事件 ---
function setupEventListeners() {
    const page = document.getElementById('page-vouchers');
    if (!page || page.dataset.initialized === 'true') return;

    // --- ▼▼▼ 新增：子分頁切換邏輯 ▼▼▼ ---
    const subTabsContainer = document.getElementById('voucher-sub-tabs');
    subTabsContainer?.addEventListener('click', (e) => {
        if (e.target.matches('.settings-tab')) {
            // 移除舊的 active
            subTabsContainer.querySelector('.active')?.classList.remove('active');
            e.target.classList.add('active');
            
            // 隱藏所有 content
            page.querySelectorAll('.settings-tab-content').forEach(content => {
                content.classList.remove('active');
            });
            
            // 顯示目標 content
            const targetContent = document.getElementById(e.target.dataset.target);
            if (targetContent) {
                targetContent.classList.add('active');
            }
        }
    });
    // --- ▲▲▲ 新增結束 ▲▲▲ ---

    // "建立新樣板" 按鈕
    document.getElementById('add-voucher-btn')?.addEventListener('click', () => {
        openVoucherModal(null);
    });

    // 列表事件委派 (編輯 / 刪除 / 群發)
    const tbody = document.getElementById('voucher-list-tbody');
    tbody?.addEventListener('click', (e) => {
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

    // Modal 表單事件
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

// --- 初始化 ---
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
        
        renderVoucherList(allVoucherTemplates);
        setupEventListeners();
        
    } catch (error) {
        console.error('初始化優惠券樣板頁面失敗:', error);
        tbody.innerHTML = `<tr><td colspan="6" style="color: red; text-align: center;">讀取失敗: ${error.message}</td></tr>`;
    }
};