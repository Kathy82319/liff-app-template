// public/modules/pages/passwordModal.js

// 1. 初始化 (插入 HTML)
export function initPasswordModal() {
    if (document.getElementById('changePasswordModal')) return;

    const modalHtml = `
    <div id="changePasswordModal" class="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full hidden z-50">
        <div class="relative top-20 mx-auto p-5 border w-96 shadow-lg rounded-md bg-white">
            <div class="mt-3 text-center">
                <h3 class="text-lg font-medium text-gray-900">修改帳號與密碼</h3>
                <div class="mt-2 px-7 py-3 space-y-3">
                    <div class="text-left">
                        <label class="text-xs text-gray-500">新帳號 (留空則不修改)</label>
                        <input id="newUsernameInput" type="text" placeholder="輸入新帳號" class="px-3 py-2 border rounded w-full"/>
                    </div>
                    <div class="text-left">
                        <label class="text-xs text-gray-500">目前密碼 (必填)</label>
                        <input id="oldPasswordInput" type="password" placeholder="請輸入目前密碼" class="px-3 py-2 border rounded w-full"/>
                    </div>
                    <div class="text-left">
                        <label class="text-xs text-gray-500">新密碼 (留空則不修改)</label>
                        <input id="newPasswordInput" type="password" placeholder="輸入新密碼" class="px-3 py-2 border rounded w-full"/>
                    </div>
                </div>
                <div class="items-center px-4 py-3">
                    <button onclick="submitProfileUpdate()" class="px-4 py-2 bg-blue-500 text-white rounded w-full mb-2">確認修改</button>
                    <button onclick="document.getElementById('changePasswordModal').classList.add('hidden')" class="px-4 py-2 bg-gray-300 rounded w-full">取消</button>
                </div>
            </div>
        </div>
    </div>
    `;
    document.body.insertAdjacentHTML('beforeend', modalHtml);
}

// 2. 開啟視窗
export function openPasswordModal() {
    // 確保 HTML 存在
    initPasswordModal();
    const modal = document.getElementById('changePasswordModal');
    if (modal) modal.classList.remove('hidden');
}

// 3. 送出修改
export async function submitProfileUpdate() {
    const newUsername = document.getElementById('newUsernameInput').value;
    const oldPassword = document.getElementById('oldPasswordInput').value;
    const newPassword = document.getElementById('newPasswordInput').value;

    if (!oldPassword) { alert('請輸入目前密碼以確認身分'); return; }

    try {
        const token = localStorage.getItem('adminToken');
        const res = await fetch('/api/admin/auth/update-profile', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
            body: JSON.stringify({ newUsername, oldPassword, newPassword })
        });
        const data = await res.json();
        if (res.ok) {
            alert(data.message);
            document.getElementById('changePasswordModal').classList.add('hidden');
            // 如果改了帳號或密碼，強制登出
             if (newUsername || newPassword) {
                 localStorage.removeItem('adminToken');
                 window.location.href = '/admin-login.html';
             }
        } else {
            alert(data.error || '修改失敗');
        }
    } catch (e) {
        alert('系統錯誤');
    }
}

// 🟢 關鍵修正：將函式掛載到 window 物件，讓 HTML onclick 看得到
window.openPasswordModal = openPasswordModal;
window.submitProfileUpdate = submitProfileUpdate;