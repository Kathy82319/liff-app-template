// public/admin/modules/financialReports.js
import { api } from '../api.js';
import { ui } from '../ui.js';
import { escapeHtml } from '../../utils.js';

let reportDateRangePicker = null;
let currentTransactions = [];
let currentPieDataRaw = {};
let charts = {}; 
let currentSummary = {}; 

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
    
    // --- 對帳開關監聽器 ---
    document.getElementById('report-transactions-tbody')?.addEventListener('change', async (e) => {
        if (e.target.classList.contains('payment-status-toggle')) {
            const bookingId = e.target.dataset.id;
            const isChecked = e.target.checked;
            const newStatus = isChecked ? 'paid' : 'unpaid';
            
            // 1. 立即更新本地快取 (讓 UI 反應更即時)
            const tx = currentTransactions.find(t => t.booking_id == bookingId);
            if (tx) {
                tx._tempIsPaid = isChecked; 
                tx.payment_status = newStatus; 
            }
            updateTransactionSummary(currentTransactions);

            // 2. 呼叫 API 並顯示儲存狀態
            try {
                e.target.disabled = true; // 鎖定防止連點
                
                await api.updatePaymentStatus(Number(bookingId), newStatus);
                
                ui.toast.success(`單號 #${String(bookingId).padStart(5, '0')} 對帳狀態已儲存！`); 
                console.log(`Booking #${bookingId} payment status saved as ${newStatus}`);

            } catch (error) {
                // 失敗時回滾
                console.error("Payment status update failed:", error);
                ui.toast.error(`儲存失敗，請重試：${error.message}`);
                e.target.checked = !isChecked; // 開關彈回原狀
                if(tx) tx._tempIsPaid = !isChecked; // 資料回滾
                updateTransactionSummary(currentTransactions);
            } finally {
                e.target.disabled = false; // 解鎖
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

        // --- 1. 對帳開關邏輯 ---
        let isPaid = false;
        if (isTopup) {
            isPaid = true;
        } else {
            if (item.payment_status === 'paid') {
                isPaid = true;
            } else if (item.payment_status === 'unpaid') {
                isPaid = false;
            } else {
                if (['confirmed', 'checked-in', 'completed'].includes(item.status)) {
                    isPaid = true;
                } else {
                    isPaid = false;
                }
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

        // --- 2. 顯示項目內容 ---
        const bookingIdDisplay = isTopup ? '後台加值' : `#${String(item.booking_id).padStart(5, '0')}`;
        
        // 【安全修正】對動態內容進行消毒
        const safeSummary = escapeHtml(item.item_summary || '');
        const safeContact = escapeHtml(item.contact_name || '未知');

        const contentDisplay = `
            <div>${bookingIdDisplay}</div>
            <div style="font-size: 0.85em; color: #666; margin-top: 4px;">${safeSummary}</div>
        `;

        return `
            <tr>
                <td>${date}</td>
                <td>${typeLabel}</td>
                <td>${contentDisplay}</td>
                <td>${safeContact}</td>
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
    let hasPaidCancelOrNoShow = false; 

    list.forEach(item => {
        if (item.type === 'topup') {
            topupCount++;
            topupAmount += item.total_amount;
        } else {
            if (item.status === 'cancelled') {
                cancelCount++;
                cancelAmount += item.total_amount;
                if (item._tempIsPaid) hasPaidCancelOrNoShow = true;
            } else if (item.status === 'no-show') {
                noshowCount++;
                noshowAmount += item.total_amount;
                if (item._tempIsPaid) hasPaidCancelOrNoShow = true;
            }

            // 只有被標記為「已收款」的訂單才計入營收統計
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
        hasPaidCancelOrNoShow 
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
                    <div style="color: #856404;">
                        <strong>未到：</strong>${noshowCount} 筆 
                        <span style="margin-left: 5px;"><strong>未到金額：</strong>$${noshowAmount.toLocaleString()}</span>
                    </div>
                    <div style="color: #007bff; border-left: 2px solid #dee2e6; padding-left: 15px;">
                        <strong>有效收款訂單：</strong>${paidOrderCount} 筆 
                        <span style="margin-left: 5px; font-size: 1.1em;"><strong>實收金額：</strong>$${paidOrderAmount.toLocaleString()}</span>
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

    const headers = [
        "日期", "類型", "單號", "內容", "顧客", "金額", "狀態", "付款標記", 
        "", 
        "統計摘要", "", "數量", "金額" 
    ];

    const rows = [];
    const maxRows = Math.max(currentTransactions.length, 6); 

    for (let i = 0; i < maxRows; i++) {
        const row = [];
        
        if (i < currentTransactions.length) {
            const item = currentTransactions[i];
            const isTopup = item.type === 'topup';
            const isPaid = item._tempIsPaid; 
            
            // 【修改】CSV 匯出也補零，使用 #00000 格式
            const bookingIdStr = isTopup ? '' : `#${String(item.booking_id).padStart(5, '0')}`;

            row.push(
                item.booking_date,
                isTopup ? '儲值' : '訂單',
                bookingIdStr,
                item.item_summary || '', // 加入內容欄位
                item.contact_name || '',
                item.total_amount,
                statusMap[item.status] || item.status,
                isPaid ? '已收款' : '未收款'
            );
        } else {
            row.push("", "", "", "", "", "", "", "");
        }

        row.push(""); 

        if (i === 0) {
            row.push("已確認訂單", "", currentSummary.paidOrderCount + "筆", "$" + currentSummary.paidOrderAmount);
        } else if (i === 1) {
            row.push("儲值單", "", currentSummary.topupCount + "筆", "$" + currentSummary.topupAmount);
        } else if (i === 2) {
            row.push("取消", "", currentSummary.cancelCount + "筆", "$" + currentSummary.cancelAmount);
        } else if (i === 3) {
            row.push("未到", "", currentSummary.noshowCount + "筆", "$" + currentSummary.noshowAmount);
        } else if (i === 4) {
            row.push("當月實收總計", "", currentTransactions.length + "筆", "$" + currentSummary.paidOrderAmount); 
        } else if (i === 5) {
            if (currentSummary.hasPaidCancelOrNoShow) {
                row.push("(含取消/未到收款)", "", "", ""); 
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
            const cellStr = String(cell).replace(/"/g, '""'); 
            return `"${cellStr}"`;
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