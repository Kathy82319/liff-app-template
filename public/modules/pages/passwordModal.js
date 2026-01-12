// public/admin/modules/passwordModal.js

export function initPasswordModal() {
    // 檢查是否已經存在 Modal，避免重複建立
    if (document.getElementById('changePasswordModal')) return;

    const modalHtml = `
    <div id="changePasswordModal" class="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full hidden z-50">
        <div class="relative top-20 mx-auto p-5 border w-96 shadow-lg rounded-md bg-white">
            <div class="mt-3 text-center">
                <h3 class="text-lg leading-6 font-medium text-gray-900">修改密碼</h3>
                <div class="mt-2 px-7 py-3">
                    <input id="oldPasswordInput" type="password" placeholder="目前密碼" class="mb-3 px-3 py-2 border rounded w-full"/>
                    <input id="newPasswordInput" type="password" placeholder="新密碼" class="mb-3 px-3 py-2 border rounded w-full"/>
                    <input id="confirmPasswordInput" type="password" placeholder="確認新密碼" class="mb-3 px-3 py-2 border rounded w-full"/>
                </div>
                <div class="items-center px-4 py-3">
                    <button id="btnConfirmChangePw" class="px-4 py-2 bg-blue-500 text-white text-base font-medium rounded-md w-full shadow-sm hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-300">
                        確認修改
                    </button>
                    <button id="btnCancelChangePw" class="mt-3 px-4 py-2 bg-gray-300 text-black text-base font-medium rounded-md w-full shadow-sm hover:bg-gray-400 focus:outline-none">
                        取消
                    </button>
                </div>
            </div>
        </div>
    </div>
    `;
    document.body.insertAdjacentHTML('beforeend', modalHtml);

    // 綁定事件
    document.getElementById('btnCancelChangePw').addEventListener('click', closePasswordModal);
    document.getElementById('btnConfirmChangePw').addEventListener('click', submitPasswordChange);
}

export function openPasswordModal() {
    document.getElementById('changePasswordModal').classList.remove('hidden');
}

function closePasswordModal() {
    document.getElementById('changePasswordModal').classList.add('hidden');
    // 清空輸入框
    document.getElementById('oldPasswordInput').value = '';
    document.getElementById('newPasswordInput').value = '';
    document.getElementById('confirmPasswordInput').value = '';
}

async function submitPasswordChange() {
    const oldPassword = document.getElementById('oldPasswordInput').value;
    const newPassword = document.getElementById('newPasswordInput').value;
    const confirmPassword = document.getElementById('confirmPasswordInput').value;

    if (!oldPassword || !newPassword) {
        alert('請填寫所有欄位');
        return;
    }

    if (newPassword !== confirmPassword) {
        alert('兩次輸入的新密碼不一致');
        return;
    }

    const btn = document.getElementById('btnConfirmChangePw');
    const originalText = btn.innerText;
    btn.innerText = '處理中...';
    btn.disabled = true;

    try {
        const token = localStorage.getItem('adminToken'); // 假設您的 Token 存在這裡
        const response = await fetch('/api/admin/auth/change-password', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ oldPassword, newPassword })
        });

        const result = await response.json();

        if (response.ok) {
            alert('密碼修改成功！');
            closePasswordModal();
        } else {
            alert(result.error || '修改失敗');
        }
    } catch (error) {
        console.error(error);
        alert('系統錯誤，請稍後再試');
    } finally {
        btn.innerText = originalText;
        btn.disabled = false;
    }
}