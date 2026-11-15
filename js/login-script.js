document.addEventListener('DOMContentLoaded', () => {
  const togglePassword = document.getElementById('togglePassword');
  const passwordField = document.getElementById('passwordField');
  const btnLogin = document.getElementById('btnLogin');
  const usernameInput = document.getElementById('username');

  if (togglePassword && passwordField) {
    togglePassword.addEventListener('click', function () {
      const type = passwordField.getAttribute('type') === 'password' ? 'text' : 'password';
      passwordField.setAttribute('type', type);
      this.classList.toggle('fa-eye');
      this.classList.toggle('fa-eye-slash');
    });
  }

  if (btnLogin) {
    btnLogin.addEventListener('click', (e) => {
      e.preventDefault();
      const username = usernameInput ? usernameInput.value.trim() : '';
      if (username === '6409612345') {
        window.location.href = 'login-error.html';
      } else {
        alert('เข้าสู่ระบบสำเร็จ');
      }
    });
  }
});