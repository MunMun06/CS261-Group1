document.addEventListener('DOMContentLoaded', () => {
  const btnConfirmCheckin = document.getElementById('btnConfirmCheckin');
  const btnScanNext = document.getElementById('btnScanNext');
  const btnSearch = document.getElementById('btnSearch');
  const searchInput = document.getElementById('searchInput');

  if (btnConfirmCheckin) {
    btnConfirmCheckin.addEventListener('click', () => {
      window.location.href = 'check-in-success.html';
    });
  }

  if (btnScanNext) {
    btnScanNext.addEventListener('click', () => {
      window.location.href = 'check-in-approval.html';
    });
  }

  if (btnSearch && searchInput) {
    btnSearch.addEventListener('click', () => {
      const code = searchInput.value.trim();
      if (!code) return alert('กรุณากรอกรหัสจอง');
      
      if (code === 'TU-69101401') {
        window.location.href = 'check-in-failed.html';
      } else {
        window.location.href = 'check-in-success.html';
      }
    });
  }
});