// public/admin/modules/financialReports.js
import { api } from '../api.js';
import { ui } from '../ui.js';

let reportDateRangePicker = null;
let currentTransactions = [];
let currentPieDataRaw = {};
let charts = {}; 
let currentSummary = {}; // 儲存底部統計數據供 CSV 使用

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
            const isChecked = e.target.checked;
            const newStatus = isChecked ? 'paid' : 'unpaid';
            
            const tx = currentTransactions.find(t => t.booking_id == bookingId);
            if (tx) {
                tx._tempIsPaid = isChecked; 
                tx.payment_status = newStatus; 
            }

            updateTransactionSummary(currentTransactions);

            try {
                e.target.disabled = true; 
                await api.updatePaymentStatus(Number(bookingId), newStatus);
            } catch (error) {
                ui.toast.error('狀態更新失敗，請重試');
                e.target.checked = !isChecked;
                if(tx) tx._tempIsPaid = !isChecked;
                updateTransactionSummary(currentTransactions);
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
        currentPieDataRaw = data.charts.pieData;

        renderKPIs(data.kpi);
        renderRevenueChart(data.charts.monthly);
        updatePieChart('membership');
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

function renderRevenueChart(monthlyData) {
    if (typeof Chart === 'undefined') return;
    const canvas = document.getElementById('chart-revenue-trend');
    const parent = canvas.parentNode;
    canvas.width = parent.offsetWidth;
    canvas.height = parent.offsetHeight;

    const ctx = canvas.getContext('2d');
    if (charts.revenue) charts.revenue.destroy();

    const labels = monthlyData.map(d => d.month);
    const actualData = monthlyData.map(d => d.actual_revenue);
    const lostData = monthlyData.map(d => d.lost_revenue);

    charts.revenue = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [
                { label: '實際營收', data: actualData, backgroundColor: '#28a745', barPercentage: 0.6, categoryPercentage: 0.8 },
                { label: '取消/未入住損失', data: lostData, backgroundColor: '#dc3545', barPercentage: 0.6, categoryPercentage: 0.8 }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            devicePixelRatio: window.devicePixelRatio || 1,
            scales: {
                x: { stacked: false, grid: { display: false } },
                y: { beginAtZero: true, ticks: { callback: function(value) { if (value >= 1000) return '$' + value / 1000 + 'k'; return '$' + value; } } }
            },
            plugins: { legend: { position: 'top' }, tooltip: { callbacks: { label: function(context) { return context.dataset.label + ': $' + context.raw.toLocaleString(); } } } },
            animation: {
                onComplete: function () {
                    const chartInstance = this;
                    const ctx = chartInstance.ctx;
                    ctx.font = Chart.helpers.toFontString(12, 'normal', Chart.defaults.font.family);
                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'bottom';
                    this.data.datasets.forEach(function (dataset, i) {
                        const meta = chartInstance.getDatasetMeta(i);
                        meta.data.forEach(function (bar, index) {
                            const data = dataset.data[index];
                            if (data > 0) { ctx.fillStyle = dataset.backgroundColor; ctx.fillText('$' + data.toLocaleString(), bar.x, bar.y - 5); }
                        });
                    });
                }
            }
        }
    });
}

function updatePieChart(type) {
    if (typeof Chart === 'undefined') return;
    const ctx = document.getElementById('chart-pie-analysis').getContext('2d');
    const legendContainer = document.getElementById('chart-pie-legend');
    
    if (charts.pie) charts.pie.destroy();

    const rawData = currentPieDataRaw[type] || [];
    
    if (rawData.length === 0) {
        charts.pie = new Chart(ctx, {
            type: 'doughnut',
            data: { labels: ['無數據'], datasets: [{ data: [1], backgroundColor: ['#e9ecef'] }] },
            options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false }, tooltip: { enabled: false } } }
        });
        legendContainer.innerHTML = '<span style="color:#999;">無相關數據</span>';
        return;
    }

    const labels = rawData.map(d => d.label || '未分類');
    const values = rawData.map(d => d.value);
    const total = values.reduce((a, b) => a + b, 0);
    
    const backgroundColors = ['#17a2b8', '#ffc107', '#28a745', '#dc3545', '#6610f2', '#fd7e14', '#20c997', '#e83e8c'];

    charts.pie = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: labels,
            datasets: [{ data: values, backgroundColor: backgroundColors.slice(0, values.length) }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            devicePixelRatio: window.devicePixelRatio || 1,
            plugins: { legend: { display: false } }
        }
    });

    legendContainer.innerHTML = labels.map((label, index) => {
        const value = values[index];
        const percent = total > 0 ? Math.round((value / total) * 100) : 0;
        const color = backgroundColors[index % backgroundColors.length];
        return `<div style="display: flex; align-items: center; font-size: 0.85rem;"><span style="width: 12px; height: 12px; background-color: ${color}; display: inline-block; margin-right: 5px; border-radius: 2px;"></span><span>${label}: <strong>${value}</strong> (${percent}%)</span></div>`;
    }).join('');
}

function renderTransactions(list) {
    const tbody = document.getElementById('report-transactions-tbody');
    
    if (list.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" style="text-align: center;">此區間無交易紀錄。</td></tr>';
        updateTransactionSummary(list); 
        return;
    }

    const statusMap = { 'confirmed': '已確認', 'cancelled': '已取消', 'no-show': '未到', 'checked-in': '已報到', 'completed': '完成' };

    tbody.innerHTML = list.map(item => {
        const isTopup = item.type === 'topup';
        const date = new Date(item.booking_date).toLocaleDateString();
        const amountStyle = isTopup ? 'color: green; font-weight: bold;' : '';
        const typeLabel = isTopup ? '<span class="status-tag" style="background:#28a745">儲值</span>' : '<span class="status-tag" style="background:#007bff">訂單</span>';
        const statusText = statusMap[item.status] || item.status;

        // 核心修正：對帳開關預設邏輯
        let isPaid = false;
        if (isTopup) {
            isPaid = true;
        } else {
            if (item.payment_status === 'paid') {
                isPaid = true;
            } else if (item.payment_status === 'unpaid') {
                isPaid = false;
            } else {
                // DB 無紀錄 (NULL)，預設邏輯：
                // 狀態為 'confirmed' 或 'checked-in' 預設為 TRUE
                // 狀態為 'cancelled' 或 'no-show' 預設為 FALSE (修正處)
                isPaid = (item.status === 'confirmed' || item.status === 'checked-in');
            }
        }

        item._tempIsPaid = isPaid; 

        let toggleHtml = '-';
        if (!isTopup) {
            toggleHtml = `
                <label class="switch" style="transform: scale(0.8);">
                    <input type="checkbox" class="payment-status-toggle" data-id="${item.booking_id}" ${isPaid ? 'checked' : ''}>
                    <span class="slider"></span>
                </label>
            `;
        } else {
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

    updateTransactionSummary(list);
}

function updateTransactionSummary(list) {
    const tfoot = document.getElementById('report-transactions-tfoot');
    if (!tfoot) return;

    let topupCount = 0, topupAmount = 0;
    let cancelCount = 0, cancelAmount = 0;
    let noshowCount = 0, noshowAmount = 0;
    let paidOrderCount = 0, paidOrderAmount = 0;
    let hasPaidCancelOrNoShow = false; // 標記是否有已付款的取消/未到單

    list.forEach(item => {
        if (item.type === 'topup') {
            topupCount++;
            topupAmount += item.total_amount;
        } else {
            if (item.status === 'cancelled') {
                cancelCount++;
                cancelAmount += item.total_amount;
                // 檢查是否有已付款的取消單
                if (item._tempIsPaid) hasPaidCancelOrNoShow = true;
            } else if (item.status === 'no-show') {
                noshowCount++;
                noshowAmount += item.total_amount;
                // 檢查是否有已付款的未到單
                if (item._tempIsPaid) hasPaidCancelOrNoShow = true;
            }

            if (item._tempIsPaid) {
                paidOrderCount++;
                paidOrderAmount += item.total_amount;
            }
        }
    });

    currentSummary = {
        topupCount, topupAmount,
        cancelCount, cancelAmount,
        noshowCount, noshowAmount,
        paidOrderCount, paidOrderAmount,
        hasPaidCancelOrNoShow // 存入 summary 供 CSV 使用
    };

    const summaryHtml = `
        <tr>
            <td colspan="7" style="padding: 15px; background-color: #f8f9fa; border-top: 2px solid #dee2e6;">
                <div style="display: flex; justify-content: space-between; flex-wrap: wrap; gap: 15px; font-size: 0.95rem;">
                    <div style="color: #28a745;">
                        <strong>儲值單：</strong>${topupCount} 筆 
                        <span style="margin-left: 5px;"><strong>儲值總金額：</strong>$${topupAmount.toLocaleString()}</span>
                    </div>
                    <div style="color: #dc3545;">
                        <strong>取消：</strong>${cancelCount} 筆 
                        <span style="margin-left: 5px;"><strong>取消金額：</strong>$${cancelAmount.toLocaleString()}</span>
                    </div>
                    <div style="color: #ffc107; color: #856404;">
                        <strong>未到：</strong>${noshowCount} 筆 
                        <span style="margin-left: 5px;"><strong>未到金額：</strong>$${noshowAmount.toLocaleString()}</span>
                    </div>
                    <div style="color: #007bff; border-left: 2px solid #dee2e6; padding-left: 15px;">
                        <strong>訂單數量：</strong>${paidOrderCount} 筆 
                        <span style="margin-left: 5px; font-size: 1.1em;"><strong>訂單金額：</strong>$${paidOrderAmount.toLocaleString()}</span>
                    </div>
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

    const statusMap = { 'confirmed': '已確認', 'cancelled': '已取消', 'no-show': '未到', 'completed': '完成', 'checked-in': '已報到' };

    // --- 核心修正：CSV 排版 ---
    // 第一部分：明細表 (左邊)
    // 第二部分：統計摘要 (右邊，從 I 欄開始)
    
    // 準備表頭
    const headers = [
        "日期", "類型", "單號", "顧客", "金額", "狀態", "付款標記", // A-G
        "", // H (空格)
        "統計摘要", "", "數量", "金額" // I-L
    ];

    // 準備資料列
    const rows = [];
    const maxRows = Math.max(currentTransactions.length, 6); // 至少預留 6 行給右側統計

    for (let i = 0; i < maxRows; i++) {
        const row = [];
        
        // --- 左側：交易明細 ---
        if (i < currentTransactions.length) {
            const item = currentTransactions[i];
            const isTopup = item.type === 'topup';
            const isPaid = item._tempIsPaid; // 直接使用畫面狀態

            row.push(
                item.booking_date,
                isTopup ? '儲值' : '訂單',
                item.booking_id,
                item.contact_name || '',
                item.total_amount,
                statusMap[item.status] || item.status,
                isPaid ? '已收款' : '未收款'
            );
        } else {
            // 填充空值
            row.push("", "", "", "", "", "", "");
        }

        // --- 中間分隔 ---
        row.push(""); // H 欄

        // --- 右側：統計摘要 (手動排版) ---
        if (i === 0) {
            row.push("已確認訂單", "", currentSummary.paidOrderCount + "筆", "$" + currentSummary.paidOrderAmount);
        } else if (i === 1) {
            row.push("儲值單", "", currentSummary.topupCount + "筆", "$" + currentSummary.topupAmount);
        } else if (i === 2) {
            row.push("取消", "", currentSummary.cancelCount + "筆", "$" + currentSummary.cancelAmount);
        } else if (i === 3) {
            row.push("未到", "", currentSummary.noshowCount + "筆", "$" + currentSummary.noshowAmount);
        } else if (i === 4) {
            row.push("當月金額統計", "", currentTransactions.length + "筆", "$" + (currentSummary.paidOrderAmount + currentSummary.topupAmount)); // 簡單加總所有訂單+儲值 (依需求可調整)
            // 這裡的邏輯比較模糊，我先假設是「所有已收款」的總和 (訂單+儲值)
            // 如果您指的是「原始訂單總額 (不管有沒有收)」，請告訴我，我可以改
        } else if (i === 5) {
            // 條件顯示：如果有已付款的取消/未到單
            if (currentSummary.hasPaidCancelOrNoShow) {
                row.push("當月金額統計(含取消/未到)", "", "", "$" + currentSummary.paidOrderAmount); // 這裡的 paidOrderAmount 已經包含所有勾選的單
            } else {
                row.push("", "", "", "");
            }
        } else {
            row.push("", "", "", "");
        }

        rows.push(row);
    }

    let csvContent = "data:text/csv;charset=utf-8,\uFEFF";
    csvContent += headers.join(",") + "\r\n";
    rows.forEach(rowArray => {
        const row = rowArray.map(cell => {
            if (cell === null || cell === undefined) return "";
            return `"${cell}"`;
        }).join(",");
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