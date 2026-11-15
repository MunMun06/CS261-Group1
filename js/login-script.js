document.addEventListener('DOMContentLoaded', () => {
    console.log("Login script loaded");

    // 1. Tab Switching Logic
    const tabs = document.querySelectorAll('.tab');
    
    tabs.forEach(tab => {
        tab.addEventListener('click', function() {
            // Remove 'active' class from all tabs
            tabs.forEach(t => t.classList.remove('active'));
            // Add 'active' class to the clicked tab
            this.classList.add('active');
        });
    });

    // 2. Password Visibility Toggle Logic
    const togglePasswordIcons = document.querySelectorAll('.toggle-password');
    
    togglePasswordIcons.forEach(icon => {
        icon.addEventListener('click', function() {
            // Find the associated password input field.
            // Assuming the icon and input are siblings within the same container.
            const passwordInput = this.parentElement.querySelector('input');
            
            if (passwordInput && passwordInput.tagName === 'INPUT') {
                // Toggle input type between 'password' and 'text'
                if (passwordInput.type === 'password') {
                    passwordInput.type = 'text';
                    // Update icon to eye-slash (assuming FontAwesome classes)
                    this.classList.remove('fa-eye');
                    this.classList.add('fa-eye-slash'); 
                } else {
                    passwordInput.type = 'password';
                    // Update icon back to eye (assuming FontAwesome classes)
                    this.classList.remove('fa-eye-slash');
                    this.classList.add('fa-eye');
                }
            }
        });
    });

    // 3. Login: checks the TU username and password with POST /api/auth/login (js/api.js),
    //    which sets the session cookie, then goes back to the page that needed a login.
    const form = document.getElementById('loginForm');
    const usernameInput = document.getElementById('username');
    const passwordInput = document.getElementById('passwordField');
    const loginButton = document.getElementById('btnLogin');
    const errorBox = document.getElementById('loginError');
    const errorText = document.getElementById('loginErrorText');

    function showError(message, markFields) {
        errorText.textContent = message;
        errorBox.hidden = false;
        usernameInput.classList.toggle('has-error', markFields);
        passwordInput.classList.toggle('has-error', markFields);
    }

    function clearError() {
        errorBox.hidden = true;
        usernameInput.classList.remove('has-error');
        passwordInput.classList.remove('has-error');
    }

    // Only a page in this folder, e.g. "history.html?page=2", so a link can't send users elsewhere.
    function nextPage() {
        const next = new URLSearchParams(window.location.search).get('next') ?? '';
        return /^[\w-]+\.html(\?[^#]*)?$/.test(next) && !next.startsWith('login')
            ? next
            : 'index.html';
    }

    form.addEventListener('submit', async (event) => {
        event.preventDefault();
        const username = usernameInput.value.trim();
        const password = passwordInput.value;
        if (!username || !password) {
            showError('กรุณากรอกชื่อผู้ใช้และรหัสผ่าน', true);
            return;
        }

        clearError();
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
            window.location.href = nextPage();
        } catch (error) {
            passwordInput.value = '';
            showError(error.message, error.code === 'INVALID_CREDENTIALS');
            loginButton.disabled = false;
        }
    });
});