document.addEventListener('DOMContentLoaded', () => {
    const form = document.getElementById('loginForm');
    const usernameInput = document.getElementById('username');
    const usernameLabel = document.getElementById('usernameLabel');
    const usernameError = document.getElementById('usernameError');
    const passwordInput = document.getElementById('passwordField');
    const passwordError = document.getElementById('passwordError');
    const togglePassword = document.getElementById('togglePassword');
    const loginButton = document.getElementById('btnLogin');
    const errorBox = document.getElementById('loginError');
    const errorText = document.getElementById('loginErrorText');
    let role = 'user';

    // 1. Student/staff tabs: staff log in with a staff username instead of a student ID.
    const tabs = document.querySelectorAll('.tab');
    tabs.forEach((tab) => {
        tab.addEventListener('click', () => {
            tabs.forEach((other) => {
                other.classList.toggle('active', other === tab);
                other.setAttribute('aria-pressed', String(other === tab));
            });
            role = tab.dataset.role;
            const staff = role === 'staff';
            usernameLabel.textContent = staff ? 'ชื่อผู้ใช้เจ้าหน้าที่' : 'ชื่อผู้ใช้ TU หรือรหัสนักศึกษา';
            usernameInput.placeholder = staff ? 'ชื่อผู้ใช้' : 'เช่น 6409xxxxxx';
            clearErrors();
        });
    });

    // 2. Show or hide the password.
    togglePassword.addEventListener('click', () => {
        const show = passwordInput.type === 'password';
        passwordInput.type = show ? 'text' : 'password';
        togglePassword.setAttribute('aria-label', show ? 'ซ่อนรหัสผ่าน' : 'แสดงรหัสผ่าน');
        togglePassword.classList.toggle('is-shown', show);
    });

    function markField(input, invalid) {
        input.classList.toggle('has-error', invalid);
        input.setAttribute('aria-invalid', String(invalid));
    }

    // The red box above the form, e.g. a wrong username or password.
    function showError(message, markFields) {
        errorText.textContent = message;
        errorBox.hidden = false;
        markField(usernameInput, markFields);
        markField(passwordInput, markFields);
    }

    function clearErrors() {
        errorBox.hidden = true;
        usernameError.hidden = true;
        passwordError.hidden = true;
        markField(usernameInput, false);
        markField(passwordInput, false);
    }

    // Where to go after login, by the account's role on the server (not the tab picked):
    // staff always land on the check-in pages, members on the member pages. A "next" page
    // is kept only when it belongs to that role, and only a page in this folder, e.g.
    // "history.html?page=2", so a link can't send users elsewhere.
    async function nextPage() {
        const next = new URLSearchParams(window.location.search).get('next') ?? '';
        const safeNext = /^[\w-]+\.html(\?[^#]*)?$/.test(next) && !next.startsWith('login');
        const checkInPage = next.startsWith('check-in-');
        let staff = false;
        try {
            staff = (await apiRequest('/api/auth/me')).role === 'staff';
        } catch {
            // Treated as a member; the member pages ask to log in again if needed.
        }
        if (staff) {
            return safeNext && checkInPage ? next : 'check-in-scan.html';
        }
        return safeNext && !checkInPage ? next : 'index.html';
    }

    // 3. Login: checks the TU username and password with POST /api/auth/login (js/api.js),
    //    which sets the session cookie, then goes back to the page that needed a login.
    form.addEventListener('submit', async (event) => {
        event.preventDefault();
        const username = usernameInput.value.trim();
        const password = passwordInput.value;

        clearErrors();
        if (!username || !password) {
            usernameError.textContent = role === 'staff'
                ? 'กรุณากรอกชื่อผู้ใช้'
                : 'กรุณากรอกชื่อผู้ใช้ TU หรือรหัสนักศึกษา';
            usernameError.hidden = Boolean(username);
            passwordError.hidden = Boolean(password);
            markField(usernameInput, !username);
            markField(passwordInput, !password);
            return;
        }

        loginButton.disabled = true;
        try {
            try {
                await apiRequest('/api/auth/login', {
                    method: 'POST',
                    body: { username, password },
                });
            } catch (error) {
                // No TU API key on this development machine yet: log in as a seeded
                // test account instead (A, B, C, D, S, S2). The server refuses this in
                // production or once the key is set, so real TU login takes over then.
                if (error.code !== 'TU_API_NOT_CONFIGURED') throw error;
                await apiRequest('/api/auth/dev-login', {
                    method: 'POST',
                    body: { username },
                });
            }
            window.location.href = await nextPage();
        } catch (error) {
            passwordInput.value = '';
            showError(error.message, error.code === 'INVALID_CREDENTIALS');
            loginButton.disabled = false;
        }
    });
});
