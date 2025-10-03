// public/admin/modules/pointsCenter.js
import { api } from '../api.js';
import { ui } from '../ui.js';

let html5QrCode = null; // QR Code 掃描器實例
let currentSelectedUserForPoints = null; // 當前選擇的使用者

// 重設頁面狀態
function resetPointsCenterPage() {
    currentSelectedUserForPoints = null;
    
    const userSearchInput = document.getElementById('user-search-input-points');
    const userSearchResults = document.getElementById('user-search-results');
    const pointsEntryForm = document.getElementById('points-entry-form');
    const selectedUserDisplay = document.getElementById('selected-user-display');
    const qrReader = document.getElementById('qr-reader');
    const pointsStatusMessage = document.getElementById('points-status-message');

    if (userSearchInput) userSearchInput.value = '';
    if (userSearchResults) userSearchResults.innerHTML = '';
    if (pointsEntryForm) pointsEntryForm.style.display = 'none';
    if (selectedUserDisplay) selectedUserDisplay.textContent = '請先從上方搜尋或掃碼選取顧客';
    if (pointsStatusMessage) pointsStatusMessage.textContent = '';
    
    // 停止可能正在運行的掃描器
    if (html5QrCode && html5QrCode.isScanning) {
        html5QrCode.stop().catch(err => console.error("停止掃描器失敗", err));
    }
    if (qrReader) qrReader.style.display = 'none';
}

// 處理使用者搜尋
async function handleUserSearchForPoints(query) {
    const userSearchResults = document.getElementById('user-search-results');
    if (!userSearchResults) return;

    if (query.length < 1) {
        userSearchResults.innerHTML = '';
        return;
    }

    try {
        const users = await api.searchUsers(query);
        userSearchResults.innerHTML = '';
        if (users.length === 0) {
            userSearchResults.innerHTML = '<li>找不到符合的顧客</li>';
        } else {
            users.forEach(user => {
                const li = document.createElement('li');
                li.textContent = `${user.nickname || user.line_display_name} (${user.user_id.substring(0, 15)}...)`;
                li.dataset.userId = user.user_id;
                li.dataset.userName = user.nickname || user.line_display_name;
                userSearchResults.appendChild(li);
            });
        }
    } catch (error) {
        console.error(error);
        userSearchResults.innerHTML = '<li>搜尋時發生錯誤</li>';
    }
}

// 選取使用者後的處理
function selectUserForPoints(user) {
    currentSelectedUserForPoints = user;

    const selectedUserDisplay = document.getElementById('selected-user-display');
    const pointsEntryForm = document.getElementById('points-entry-form');
    const userSearchResults = document.getElementById('user-search-results');
    const userSearchInput = document.getElementById('user-search-input-points');

    if (selectedUserDisplay) selectedUserDisplay.textContent = `${user.name} (${user.id})`;
    if (pointsEntryForm) pointsEntryForm.style.display = 'block';
    if (userSearchResults) userSearchResults.innerHTML = '';
    if (userSearchInput) userSearchInput.value = '';

    // 重設表單
    const form = document.getElementById('points-entry-form');
    if (form) {
        form.querySelector('#exp-input').value = '';
        form.querySelector('#reason-select').value = '消費回饋';
        form.querySelector('#custom-reason-input').value = '';
        form.querySelector('#custom-reason-input').style.display = 'none';
        form.querySelector('#points-status-message').textContent = '';
    }
}

// 啟動 QR Code 掃描
function startQrScanner() {
    const qrReader = document.getElementById('qr-reader');
    if (!qrReader) return;

    qrReader.style.display = 'block';
    if (html5QrCode && html5QrCode.isScanning) return;

    html5QrCode = new Html5Qrcode("qr-reader");
    const onScanSuccess = async (decodedText, decodedResult) => {
        await html5QrCode.stop();
        qrReader.style.display = 'none';
        
        // 掃到 ID 後，需要取得使用者完整資料
        try {
            // 由於 user-search API 也可以用 ID 查，直接複用
            const users = await api.searchUsers(decodedText);
            if (users && users.length > 0) {
                const user = users[0];
                selectUserForPoints({
                    id: user.user_id,
                    name: user.nickname || user.line_display_name
                });
            } else {
                alert('在資料庫中找不到此使用者！');
            }
        } catch (error) {
            alert(`查詢使用者時發生錯誤: ${error.message}`);
        }
    };

    html5QrCode.start({ facingMode: "environment" }, { fps: 10, qrbox: 250 }, onScanSuccess)
        .catch(err => alert('無法啟動相機，請檢查權限設定。'));
}

// 綁定事件監聽器
function setupEventListeners() {
    const page = document.getElementById('page-points');
    if (!page) return;

    const userSearchInput = document.getElementById('user-search-input-points');
    const userSearchResults = document.getElementById('user-search-results');
    const startScanBtn = document.getElementById('start-scan-btn');
    const submitExpBtn = document.getElementById('submit-exp-btn');
    const reasonSelect = document.getElementById('reason-select');
    const customReasonInput = document.getElementById('custom-reason-input');

    if (userSearchInput) {
        userSearchInput.addEventListener('input', (e) => handleUserSearchForPoints(e.target.value));
    }

    if (userSearchResults) {
        userSearchResults.addEventListener('click', (e) => {
            const li = e.target.closest('li');
            if (li && li.dataset.userId) {
                selectUserForPoints({
                    id: li.dataset.userId,
                    name: li.dataset.userName
                });
            }
        });
    }

    if (startScanBtn) {
        startScanBtn.addEventListener('click', startQrScanner);
    }

    if (reasonSelect && customReasonInput) {
        reasonSelect.addEventListener('change', () => {
            customReasonInput.style.display = (reasonSelect.value === 'other') ? 'block' : 'none';
        });
    }

    if (submitExpBtn) {
        submitExpBtn.addEventListener('click', async () => {
            if (!currentSelectedUserForPoints || !currentSelectedUserForPoints.id) {
                alert('錯誤：尚未選取顧客！');
                return;
            }

            const pointsStatusMessage = document.getElementById('points-status-message');
            const expInput = document.getElementById('exp-input');
            const expValue = Number(expInput.value);
            let reason = reasonSelect.value;
            if (reason === 'other') {
                reason = customReasonInput.value.trim();
            }

            if (!expValue || expValue <= 0 || !reason) {
                pointsStatusMessage.textContent = '錯誤：點數和原因皆為必填。';
                pointsStatusMessage.style.color = 'var(--color-danger)';
                return;
            }

            pointsStatusMessage.textContent = '正在處理中...';
            submitExpBtn.disabled = true;

            try {
                await api.addPoints({ userId: currentSelectedUserForPoints.id, expValue, reason });
                pointsStatusMessage.textContent = `成功為 ${currentSelectedUserForPoints.name} 新增 ${expValue} 點！`;
                pointsStatusMessage.style.color = 'var(--color-success)';
                expInput.value = '';
                // 成功後不清空已選使用者，方便連續發點
            } catch (error) {
                pointsStatusMessage.textContent = `新增失敗: ${error.message}`;
                pointsStatusMessage.style.color = 'var(--color-danger)';
            } finally {
                submitExpBtn.disabled = false;
            }
        });
    }
}

// 模組初始化函式
export const init = () => {
    resetPointsCenterPage();
    
    // 確保事件只被綁定一次
    const page = document.getElementById('page-points');
    if (page && !page.dataset.initialized) {
        setupEventListeners();
        page.dataset.initialized = 'true';
    }
};