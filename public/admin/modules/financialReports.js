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
            
            // 1. 立即更新本地數據模型
            const tx = currentTransactions.find(t => t.booking_id == bookingId);
            if (tx) {
                tx._tempIsPaid = isChecked; 
                tx.payment_status = newStatus; 
            }

            // 2. 立即重新計算底部統計
            updateTransactionSummary(currentTransactions);

            // 3. 背景發送 API
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
        updatePieChart('membership'); // 預設顯示會員方案，測試修正效果
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

// 1. 年度營收 (直條圖) - 強制設定 Canvas 尺寸以解決模糊
function renderRevenueChart(monthlyData) {
    if (typeof Chart === 'undefined') return;
    const canvas = document.getElementById('chart-revenue-trend');
    const parent = canvas.parentNode;
    
    // 強制重設 Canvas 大小以匹配容器
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
                { 
                    label: '實際營收', 
                    data: actualData, 
                    backgroundColor: '#28a745', 
                    barPercentage: 0.6, 
                    categoryPercentage: 0.8 
                },
                { 
                    label: '取消/未入住損失', 
                    data: lostData, 
                    backgroundColor: '#dc3545', 
                    barPercentage: 0.6,
                    categoryPercentage: 0.8
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            devicePixelRatio: window.devicePixelRatio || 1, 
            scales: {
                x: { stacked: false, grid: { display: false } }, 
                y: { 
                    beginAtZero: true,
                    ticks: {
                        callback: function(value) {
                            if (value >= 1000) return '$' + value / 1000 + 'k';
                            return '$' + value;
                        }
                    }
                }
            },
            plugins: {
                legend: { position: 'top' },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            return context.dataset.label + ': $' + context.raw.toLocaleString();
                        }
                    }
                }
            },
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
                            if (data > 0) { 
                                ctx.fillStyle = dataset.backgroundColor; 
                                ctx.fillText('$' + data.toLocaleString(), bar.x, bar.y - 5);
                            }
                        });
                    });
                }
            }
        }
    });
}

// 2. 圓餅圖
function updatePieChart(type) {
    if (typeof Chart === 'undefined') return;
    const ctx = document.getElementById('chart-pie-analysis').getContext('2d');
    const legendContainer = document.getElementById('chart-pie-legend');
    
    if (charts.pie) charts.pie.destroy();

    const rawData = currentPieDataRaw[type] || [];
    
    if (rawData.length === 0) {
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
            devicePixelRatio: window.devicePixelRatio || 1,
            plugins: {
                legend: { display: false }
            }
        }
    });

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

// 3. 交易列表
function renderTransactions(list) {
    const tbody = document.getElementById('report-transactions-tbody');
    
    if (list.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" style="text-align: center;">此區間無交易紀錄。</td></tr>';
        updateTransactionSummary(list); 
        return;
    }

    const statusMap = {
        'confirmed': '已確認', 'cancelled': '已取消', 'no-show': '未到', 'checked-in': '已報到', 'completed': '完成'
    };

    tbody.innerHTML = list.map(item => {
        const isTopup = item.type === 'topup';
        const date = new Date(item.booking_date).toLocaleDateString();
        const amountStyle = isTopup ? 'color: green; font-weight: bold;' : '';
        const typeLabel = isTopup ? '<span class="status-tag" style="background:#28a745">儲值</span>' : '<span class="status-tag" style="background:#007bff">訂單</span>';
        const statusText = statusMap[item.status] || item.status;

        // 決定對帳開關的初始狀態
        let isPaid = false;
        if (isTopup) {
            isPaid = true; // 儲值單永遠是已收
        } else {
            if (item.payment_status === 'paid') {
                isPaid = true;
            } else if (item.payment_status === 'unpaid') {
                isPaid = false;
            } else {
                // DB 無紀錄，預設邏輯：
                // 狀態為 'confirmed' 或 'checked-in' 預設為 TRUE
                // 狀態為 'cancelled' 或 'no-show' 預設為 FALSE
                isPaid = (item.status === 'confirmed' || item.status === 'checked-in');
            }
        }

        // 將計算出的狀態寫回 list 物件，這是 CSV 匯出正確的關鍵
        item._tempIsPaid = isPaid; 

        let toggleHtml = '-';
        if (!isTopup) {
            // 所有訂單狀態都顯示開關，但初始狀態依據上方邏輯決定
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

// 計算並更新底部統計
function updateTransactionSummary(list) {
    const tfoot = document.getElementById('report-transactions-tfoot');
    if (!tfoot) return;

    let topupCount = 0;
    let topupAmount = 0;
    let cancelCount = 0;
    let cancelAmount = 0;
    let noshowCount = 0;
    let noshowAmount = 0;
    
    let paidOrderCount = 0; 
    let paidOrderAmount = 0; 

    list.forEach(item => {
        if (item.type === 'topup') {
            topupCount++;
            topupAmount += item.total_amount;
        } else {
            if (item.status === 'cancelled') {
                cancelCount++;
                cancelAmount += item.total_amount;
            } else if (item.status === 'no-show') {
                noshowCount++;
                noshowAmount += item.total_amount;
            }

            // 關鍵：只統計目前被視為「已收款」的訂單 (包含手動勾選的取消單)
            if (item._tempIsPaid) {
                paidOrderCount++;
                paidOrderAmount += item.total_amount;
            }
        }
    });

    // 儲存統計數據供 CSV 使用
    currentSummary = {
        topupCount, topupAmount,
        cancelCount, cancelAmount,
        noshowCount, noshowAmount,
        paidOrderCount, paidOrderAmount
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

    const headers = ["日期", "類型", "單號", "顧客", "金額", "狀態", "付款標記"];
    
    // 1. 交易明細列
    const rows = currentTransactions.map(item => {
        const isTopup = item.type === 'topup';
        
        // 關鍵修正：直接使用 _tempIsPaid (前端當前畫面狀態)，而非重新計算邏輯
        // 這確保了 CSV 匯出結果與使用者在畫面上看到的完全一致
        const isPaid = item._tempIsPaid;

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

    // 2. 加入底部統計列
    csvContent += "\r\n"; // 空一行
    csvContent += "統計摘要\r\n";
    csvContent += `儲值單,${currentSummary.topupCount}筆,儲值總金額,$${currentSummary.topupAmount}\r\n`;
    csvContent += `取消,${currentSummary.cancelCount}筆,取消金額,$${currentSummary.cancelAmount}\r\n`;
    csvContent += `未到,${currentSummary.noshowCount}筆,未到金額,$${currentSummary.noshowAmount}\r\n`;
    csvContent += `訂單數量(已確認收款),${currentSummary.paidOrderCount}筆,訂單金額(已確認收款),$${currentSummary.paidOrderAmount}\r\n`;

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `financial_report_${new Date().toISOString().slice(0,10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}