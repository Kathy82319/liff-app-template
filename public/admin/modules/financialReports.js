// public/admin/modules/financialReports.js
import { api } from '../api.js';
import { ui } from '../ui.js';

let reportDateRangePicker = null;
let currentTransactions = [];
let charts = {}; // 存放 Chart.js 實例

// 初始化
export const init = async () => {
    const page = document.getElementById('page-reports');
    if (!page) return;

    if (!page.dataset.initialized) {
        setupEventListeners();
        initDateRangePicker();
        page.dataset.initialized = 'true';
    }

    // 預設載入本月
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
    
    // 對帳 Toggle 事件委派
    document.getElementById('report-transactions-tbody')?.addEventListener('change', async (e) => {
        if (e.target.classList.contains('payment-status-toggle')) {
            const bookingId = e.target.dataset.id;
            const newStatus = e.target.checked ? 'paid' : 'unpaid';
            
            try {
                e.target.disabled = true;
                await api.updatePaymentStatus(Number(bookingId), newStatus);
                ui.toast.success('付款狀態已更新');
                
                // 更新本地數據，避免重新整理
                const tx = currentTransactions.find(t => t.booking_id == bookingId);
                if(tx) tx.payment_status = newStatus;

            } catch (error) {
                ui.toast.error('更新失敗');
                e.target.checked = !e.target.checked; // 回復
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
        // Fallback
        const today = new Date();
        startDate = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().split('T')[0];
        endDate = new Date(today.getFullYear(), today.getMonth() + 1, 0).toISOString().split('T')[0];
    }

    // UI Loading
    document.getElementById('report-transactions-tbody').innerHTML = '<tr><td colspan="7" style="text-align: center;">數據計算中...</td></tr>';

    try {
        const data = await api.getFinancialReport(startDate, endDate);
        currentTransactions = data.transactions; // 存起來供 CSV 使用

        renderKPIs(data.kpi);
        renderCharts(data.charts);
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

function renderCharts(chartData) {
    if (typeof Chart === 'undefined') return;

    // 1. 年度營收堆疊圖
    const ctxRevenue = document.getElementById('chart-revenue-trend').getContext('2d');
    if (charts.revenue) charts.revenue.destroy();

    const labels = chartData.monthly.map(d => d.month);
    const actualData = chartData.monthly.map(d => d.actual_revenue);
    const lostData = chartData.monthly.map(d => d.lost_revenue);

    charts.revenue = new Chart(ctxRevenue, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [
                { label: '實際營收', data: actualData, backgroundColor: '#28a745' },
                { label: '取消/未入住損失', data: lostData, backgroundColor: '#dc3545' }
            ]
        },
        options: {
            responsive: true,
            scales: {
                x: { stacked: true },
                y: { stacked: true }
            }
        }
    });

    // 2. 新舊客佔比 (Pie)
    const ctxCustomer = document.getElementById('chart-customer-seg').getContext('2d');
    if (charts.customer) charts.customer.destroy();

    const newCount = chartData.customers.find(c => c.type === 'New')?.count || 0;
    const returningCount = chartData.customers.find(c => c.type === 'Returning')?.count || 0;

    charts.customer = new Chart(ctxCustomer, {
        type: 'doughnut',
        data: {
            labels: ['新客', '熟客'],
            datasets: [{
                data: [newCount, returningCount],
                backgroundColor: ['#17a2b8', '#ffc107']
            }]
        },
        options: { responsive: true, maintainAspectRatio: false }
    });
}

function renderTransactions(list) {
    const tbody = document.getElementById('report-transactions-tbody');
    if (list.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" style="text-align: center;">此區間無交易紀錄。</td></tr>';
        return;
    }

    tbody.innerHTML = list.map(item => {
        const isTopup = item.type === 'topup';
        const date = new Date(item.booking_date).toLocaleDateString();
        const amountStyle = isTopup ? 'color: green; font-weight: bold;' : '';
        const typeLabel = isTopup ? '<span class="status-tag" style="background:#28a745">儲值</span>' : '<span class="status-tag" style="background:#007bff">預約</span>';
        
        // 對帳開關 (只有預約且非取消狀態才顯示)
        let toggleHtml = '-';
        if (!isTopup && item.status !== 'cancelled') {
            const isPaid = item.payment_status === 'paid';
            toggleHtml = `
                <label class="switch" style="transform: scale(0.8);">
                    <input type="checkbox" class="payment-status-toggle" data-id="${item.booking_id}" ${isPaid ? 'checked' : ''}>
                    <span class="slider"></span>
                </label>
            `;
        }

        return `
            <tr>
                <td>${date}</td>
                <td>${typeLabel}</td>
                <td>${isTopup ? '後台加值' : `#${item.booking_id}`}</td>
                <td>${item.contact_name || '未知'}</td>
                <td style="${amountStyle}">$${item.total_amount}</td>
                <td>${item.status}</td>
                <td>${toggleHtml}</td>
            </tr>
        `;
    }).join('');
}

function exportToCSV() {
    if (!currentTransactions || currentTransactions.length === 0) {
        ui.toast.error('無資料可匯出');
        return;
    }

    const headers = ["日期", "類型", "單號", "顧客", "金額", "狀態", "付款標記"];
    const rows = currentTransactions.map(item => [
        item.booking_date,
        item.type === 'topup' ? '儲值' : '預約',
        item.booking_id,
        item.contact_name || '',
        item.total_amount,
        item.status,
        item.payment_status === 'paid' ? '已收款' : '未收款'
    ]);

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