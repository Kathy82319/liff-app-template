// public/admin/modules/financialReports.js
import { api } from '../api.js';
import { ui } from '../ui.js';

let reportDateRangePicker = null;
let currentTransactions = [];
let currentPieDataRaw = {}; // 儲存圓餅圖原始數據
let charts = {}; 

// 初始化
export const init = async () => {
    const page = document.getElementById('page-reports');
    if (!page) return;

    if (!page.dataset.initialized) {
        setupEventListeners();
        initDateRangePicker();
        page.dataset.initialized = 'true';
    }

    loadReportData();
};

function initDateRangePicker() {
    const input = document.getElementById('report-date-range');
    const today = new Date();
    const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);
    const lastDay = new Date(today.getFullYear(), today.getMonth() + 1, 0);

    reportDateRangePicker = flatpickr(input, {
        mode: "range",
        dateFormat: "Y-m-d",
        defaultDate: [firstDay, lastDay],
        locale: "zh_tw",
        onChange: (selectedDates) => {
            if (selectedDates.length === 2) {
                loadReportData();
            }
        }
    });
}

function setupEventListeners() {
    document.getElementById('refresh-report-btn')?.addEventListener('click', loadReportData);
    document.getElementById('export-report-btn')?.addEventListener('click', exportToCSV);
    document.getElementById('chart-pie-select')?.addEventListener('change', (e) => {
        updatePieChart(e.target.value);
    });
    
    document.getElementById('report-transactions-tbody')?.addEventListener('change', async (e) => {
        if (e.target.classList.contains('payment-status-toggle')) {
            const bookingId = e.target.dataset.id;
            const newStatus = e.target.checked ? 'paid' : 'unpaid';
            try {
                e.target.disabled = true;
                await api.updatePaymentStatus(Number(bookingId), newStatus);
                ui.toast.success('付款狀態已更新');
                const tx = currentTransactions.find(t => t.booking_id == bookingId);
                if(tx) tx.payment_status = newStatus;
            } catch (error) {
                ui.toast.error('更新失敗');
                e.target.checked = !e.target.checked; 
            } finally {
                e.target.disabled = false;
            }
        }
    });
}

async function loadReportData() {
    const dates = reportDateRangePicker ? reportDateRangePicker.selectedDates : [];
    let startDate, endDate;

    if (dates.length === 2) {
        startDate = flatpickr.formatDate(dates[0], "Y-m-d");
        endDate = flatpickr.formatDate(dates[1], "Y-m-d");
    } else {
        const today = new Date();
        startDate = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().split('T')[0];
        endDate = new Date(today.getFullYear(), today.getMonth() + 1, 0).toISOString().split('T')[0];
    }

    document.getElementById('report-transactions-tbody').innerHTML = '<tr><td colspan="7" style="text-align: center;">數據計算中...</td></tr>';

    try {
        const data = await api.getFinancialReport(startDate, endDate);
        currentTransactions = data.transactions;
        currentPieDataRaw = data.charts.pieData; // 存起來供切換使用

        renderKPIs(data.kpi);
        renderRevenueChart(data.charts.monthly);
        updatePieChart('customer'); // 預設顯示新舊客
        renderTransactions(data.transactions);

    } catch (error) {
        console.error("Load Report Error:", error);
        ui.toast.error("讀取報表失敗：" + error.message);
    }
}

function renderKPIs(kpi) {
    document.getElementById('kpi-revenue').textContent = `$${kpi.revenue.toLocaleString()}`;
    document.getElementById('kpi-orders').textContent = kpi.orders;
    document.getElementById('kpi-aov').textContent = `$${kpi.aov.toLocaleString()}`;
    document.getElementById('kpi-liability').textContent = `$${kpi.liability.toLocaleString()}`;
    document.getElementById('kpi-occupancy').textContent = `${kpi.occupancy}%`;
}

// 1. 年度營收 (直條圖) - 修正寬度與並排
function renderRevenueChart(monthlyData) {
    if (typeof Chart === 'undefined') return;
    const ctx = document.getElementById('chart-revenue-trend').getContext('2d');
    if (charts.revenue) charts.revenue.destroy();

    const labels = monthlyData.map(d => d.month);
    const actualData = monthlyData.map(d => d.actual_revenue);
    const lostData = monthlyData.map(d => d.lost_revenue);

    charts.revenue = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [
                { label: '實際營收', data: actualData, backgroundColor: '#28a745', maxBarThickness: 40 },
                { label: '取消/未入住損失', data: lostData, backgroundColor: '#dc3545', maxBarThickness: 40 }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                x: { stacked: false }, // 並排顯示
                y: { beginAtZero: true }
            }
        }
    });
}

// 2. 圓餅圖 - 動態切換與自定義圖例
function updatePieChart(type) {
    if (typeof Chart === 'undefined') return;
    const ctx = document.getElementById('chart-pie-analysis').getContext('2d');
    const legendContainer = document.getElementById('chart-pie-legend');
    
    if (charts.pie) charts.pie.destroy();

    const rawData = currentPieDataRaw[type] || [];
    
    // 處理數據為空的情況
    if (rawData.length === 0) {
        // 繪製一個空的圓餅圖或顯示文字
        // 這裡簡單處理：畫一個灰色的
        charts.pie = new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: ['無數據'],
                datasets: [{ data: [1], backgroundColor: ['#e9ecef'] }]
            },
            options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false }, tooltip: { enabled: false } } }
        });
        legendContainer.innerHTML = '<span style="color:#999;">無相關數據</span>';
        return;
    }

    const labels = rawData.map(d => d.label || '未分類');
    const values = rawData.map(d => d.value);
    const total = values.reduce((a, b) => a + b, 0);
    
    // 產生顏色
    const backgroundColors = [
        '#17a2b8', '#ffc107', '#28a745', '#dc3545', '#6610f2', '#fd7e14', '#20c997', '#e83e8c'
    ];

    charts.pie = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: labels,
            datasets: [{
                data: values,
                backgroundColor: backgroundColors.slice(0, values.length)
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false } // 隱藏預設圖例，改用自定義
            }
        }
    });

    // 生成自定義圖例 (包含百分比)
    legendContainer.innerHTML = labels.map((label, index) => {
        const value = values[index];
        const percent = total > 0 ? Math.round((value / total) * 100) : 0;
        const color = backgroundColors[index % backgroundColors.length];
        return `
            <div style="display: flex; align-items: center; font-size: 0.85rem;">
                <span style="width: 12px; height: 12px; background-color: ${color}; display: inline-block; margin-right: 5px; border-radius: 2px;"></span>
                <span>${label}: <strong>${value}</strong> (${percent}%)</span>
            </div>
        `;
    }).join('');
}

// 3. 交易列表與統計
function renderTransactions(list) {
    const tbody = document.getElementById('report-transactions-tbody');
    const tfoot = document.getElementById('report-transactions-tfoot');
    
    if (list.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" style="text-align: center;">此區間無交易紀錄。</td></tr>';
        tfoot.innerHTML = '';
        return;
    }

    // 狀態翻譯對照表
    const statusMap = {
        'confirmed': '已確認',
        'cancelled': '已取消',
        'no-show': '未到',
        'checked-in': '已報到', // 相容舊資料
        'completed': '完成'
    };

    let totalTopup = 0;
    let totalOrder = 0;
    let statusSummary = {}; // { '已確認': 總金額, ... }

    tbody.innerHTML = list.map(item => {
        const isTopup = item.type === 'topup';
        const date = new Date(item.booking_date).toLocaleDateString();
        const amountStyle = isTopup ? 'color: green; font-weight: bold;' : '';
        const typeLabel = isTopup ? '<span class="status-tag" style="background:#28a745">儲值</span>' : '<span class="status-tag" style="background:#007bff">訂單</span>';
        
        // 翻譯狀態
        const statusText = statusMap[item.status] || item.status;

        // 統計計算
        if (isTopup) {
            totalTopup += item.total_amount;
        } else {
            totalOrder += item.total_amount;
            // 依狀態統計金額
            if (!statusSummary[statusText]) statusSummary[statusText] = 0;
            statusSummary[statusText] += item.total_amount;
        }

        // 對帳開關邏輯：
        // 1. 儲值 (topup) 固定為已收款 (item.status=completed)
        // 2. 訂單：若 payment_status 為空，則 'confirmed' 預設視為已付，'cancelled/no-show' 視為未付
        let isPaid = false;
        if (isTopup) {
            isPaid = true; // 儲值紀錄視為已收款
        } else {
            if (item.payment_status) {
                isPaid = item.payment_status === 'paid';
            } else {
                // 預設邏輯
                isPaid = (item.status === 'confirmed' || item.status === 'checked-in');
            }
        }

        let toggleHtml = '-';
        // 只有訂單且非取消狀態才顯示開關 (取消的訂單通常不收款，除非有訂金邏輯，這裡簡化隱藏)
        if (!isTopup && item.status !== 'cancelled') {
            toggleHtml = `
                <label class="switch" style="transform: scale(0.8);">
                    <input type="checkbox" class="payment-status-toggle" data-id="${item.booking_id}" ${isPaid ? 'checked' : ''}>
                    <span class="slider"></span>
                </label>
            `;
        } else if (isTopup) {
             toggleHtml = '<span style="color:green;">✔</span>';
        }

        return `
            <tr>
                <td>${date}</td>
                <td>${typeLabel}</td>
                <td>${isTopup ? '後台加值' : `#${item.booking_id}`}</td>
                <td>${item.contact_name || '未知'}</td>
                <td style="${amountStyle}">$${item.total_amount}</td>
                <td>${statusText}</td>
                <td>${toggleHtml}</td>
            </tr>
        `;
    }).join('');

    // 生成底部統計 HTML
    let summaryHtml = `
        <tr>
            <td colspan="4" style="text-align: right;">總計：</td>
            <td colspan="3">
                <div style="color: green;">儲值總額: $${totalTopup}</div>
                <div style="color: #007bff;">訂單總額: $${totalOrder}</div>
                <div style="font-size: 0.85em; color: #666; margin-top: 5px;">
                    (含: ${Object.entries(statusSummary).map(([k, v]) => `${k} $${v}`).join(', ')})
                </div>
            </td>
        </tr>
    `;
    tfoot.innerHTML = summaryHtml;
}

function exportToCSV() {
    if (!currentTransactions || currentTransactions.length === 0) {
        ui.toast.error('無資料可匯出');
        return;
    }

    const statusMap = { 'confirmed': '已確認', 'cancelled': '已取消', 'no-show': '未到', 'completed': '完成' };

    const headers = ["日期", "類型", "單號", "顧客", "金額", "狀態", "付款標記"];
    const rows = currentTransactions.map(item => {
        const isTopup = item.type === 'topup';
        // 重複一次預設付款邏輯以確保 CSV 一致
        let isPaid = false;
        if (isTopup) isPaid = true;
        else if (item.payment_status) isPaid = item.payment_status === 'paid';
        else isPaid = (item.status === 'confirmed');

        return [
            item.booking_date,
            isTopup ? '儲值' : '訂單',
            item.booking_id,
            item.contact_name || '',
            item.total_amount,
            statusMap[item.status] || item.status,
            isPaid ? '已收款' : '未收款'
        ];
    });

    let csvContent = "data:text/csv;charset=utf-8,\uFEFF";
    csvContent += headers.join(",") + "\r\n";
    rows.forEach(rowArray => {
        const row = rowArray.map(cell => `"${cell}"`).join(",");
        csvContent += row + "\r\n";
    });

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `financial_report_${new Date().toISOString().slice(0,10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}