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
document.addEventListener('DOMContentLoaded', () => {
    // 1. ระบบสลับ Tab (นักศึกษา/บุคลากร กับ เจ้าหน้าที่สนาม)
    const tabs = document.querySelectorAll('.tab');
    
    tabs.forEach(tab => {
        tab.addEventListener('click', function() {
            // ลบคลาส active ออกจากทุก tab
            tabs.forEach(t => t.classList.remove('active'));
            // เพิ่มคลาส active ให้กับ tab ที่ถูกคลิก
            this.classList.add('active');
            
            // หมายเหตุ: เนื่องจากองค์ประกอบเหมือนกัน จึงแค่สลับสถานะปุ่ม
            // แต่ถ้าอนาคตต้องการเปลี่ยนข้อความ Placeholder สามารถดักเงื่อนไข if (this.textContent === '...') ตรงนี้ได้
        });
    });

    // 2. ระบบเปิด/ปิด การมองเห็นรหัสผ่าน (ไอคอนดวงตา)
    const togglePassword = document.getElementById('togglePassword');
    const passwordField = document.getElementById('passwordField');

    if (togglePassword && passwordField) {
        togglePassword.addEventListener('click', function() {
            // สลับ type ของ input ระหว่าง password กับ text
            const type = passwordField.getAttribute('type') === 'password' ? 'text' : 'password';
            passwordField.setAttribute('type', type);
            
            // สลับไอคอนตาเปิด/ตาปิด
            this.classList.toggle('fa-eye');
            this.classList.toggle('fa-eye-slash');
        });
    }
});