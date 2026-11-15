// Staff check-in pages. check-in-approval.html looks a booking up and checks it in;
// check-in-success.html and check-in-failed.html show the result for ?code=TU-...

const statusBadges = {
  pending: { className: 'badge-warning', label: 'รอเช็คอิน', icon: '<circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" />' },
  'checked-in': { className: 'badge-success', label: 'เช็คอินแล้ว', icon: '<path d="M20 6 9 17l-5-5" />' },
  cancelled: { className: 'badge-muted', label: 'ยกเลิกแล้ว', icon: '<path d="M18 6 6 18M6 6l12 12" />' },
  'no-show': { className: 'badge-danger', label: 'ไม่มาเช็คอิน', icon: '<path d="M18 6 6 18M6 6l12 12" />' },
};

// The error each finished status gives, so the failed page can explain it.
const finalStatusErrors = {
  cancelled: 'ALREADY_CANCELLED',
  'checked-in': 'ALREADY_CHECKED_IN',
  'no-show': 'ALREADY_NO_SHOW',
};

const failureDetails = {
  ALREADY_CANCELLED: { reason: 'การจองนี้ถูกยกเลิกแล้ว', detail: 'คืนโควตาประจำวันเรียบร้อยแล้ว' },
  ALREADY_NO_SHOW: { reason: 'ผู้จองไม่ได้เช็คอินภายใน 15 นาทีหลังเวลาเริ่ม', detail: 'ช่องเวลากลับมาว่างแล้ว' },
  ALREADY_CHECKED_IN: { reason: 'การจองนี้เช็คอินไปแล้ว', detail: null },
};

const dateFormatter = new Intl.DateTimeFormat('th-TH', { weekday: 'long', day: 'numeric', month: 'short', year: 'numeric' });

// "วันศุกร์ 16 ต.ค. 2569" (Intl adds "ที่" after the weekday, which the design drops)
function formatDate(isoDate) {
  const [year, month, day] = isoDate.split('-').map(Number);
  const parts = dateFormatter.formatToParts(new Date(year, month - 1, day));
  const part = (type) => parts.find((item) => item.type === type).value;
  return `${part('weekday')} ${part('day')} ${part('month')} ${part('year')}`;
}

// "18:00 – 19:00 (1 ชม.)"
function formatTime(booking) {
  const hours = Number(booking.end.slice(0, 2)) - Number(booking.start.slice(0, 2));
  return `${booking.start} – ${booking.end} (${hours} ชม.)`;
}

function setField(name, text) {
  const element = document.querySelector(`[data-field="${name}"]`);
  if (element) {
    element.textContent = text;
  }
  return element;
}

function setStatus(status) {
  const badge = document.querySelector('[data-field="status"]');
  const { className, label, icon } = statusBadges[status];
  badge.className = `badge ${className}`;
  badge.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icon}</svg>`;
  badge.append(label);
  badge.hidden = false;
}

// Check-in opens this long before the start time and closes this long after it.
const CHECKIN_WINDOW_MINUTES = 15;

function clock(date) {
  return date.toTimeString().slice(0, 5);
}

// "23 นาที", or "30 ชม. 22 นาที" when it is an hour or more.
function duration(minutes) {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours === 0) {
    return `${rest} นาที`;
  }
  return rest ? `${hours} ชม. ${rest} นาที` : `${hours} ชม.`;
}

// The orange box on the approval page: when check-in is open and how long is left.
function showCheckinWindow(booking) {
  const box = document.getElementById('checkinWindow');
  if (!box) {
    return;
  }
  const [year, month, day] = booking.date.split('-').map(Number);
  const [hours, minutes] = booking.start.split(':').map(Number);
  const start = new Date(year, month - 1, day, hours, minutes);
  const open = new Date(start.getTime() - CHECKIN_WINDOW_MINUTES * 60000);
  const close = new Date(start.getTime() + CHECKIN_WINDOW_MINUTES * 60000);
  const now = new Date();
  const minutesTo = (date) => Math.ceil((date - now) / 60000);

  setField('window', `ช่วงเวลาเช็คอิน ${clock(open)} – ${clock(close)}`);
  if (now < open) {
    setField('windowLeft', `เปิดเช็คอินอีก ${duration(minutesTo(open))}`);
  } else if (now <= close) {
    setField('windowLeft', `ตอนนี้ ${clock(now)} · เหลืออีก ${duration(minutesTo(close))}`);
  } else {
    setField('windowLeft', 'หมดเวลาเช็คอินแล้ว');
  }
  setField('windowOpen', clock(open));
  setField('windowStart', `เริ่ม ${clock(start)}`);
  setField('windowClose', clock(close));
  const progress = Math.min(1, Math.max(0, (now - open) / (close - open)));
  document.getElementById('checkinWindowBar').style.width = `${progress * 100}%`;
  box.hidden = false;
}

function fillBooking(booking) {
  setField('code', `#${booking.code}`);
  setField('name', booking.name);
  setField('studentId', `รหัสนักศึกษา ${booking.studentId}`);
  setField('court', booking.court);
  setField('date', formatDate(booking.date));
  setField('time', formatTime(booking));
  setStatus(booking.status);
  showCheckinWindow(booking);
}

function clearBooking() {
  ['code', 'name', 'studentId', 'court', 'date', 'time'].forEach((name) => setField(name, '—'));
  document.querySelector('[data-field="status"]').hidden = true;
  const box = document.getElementById('checkinWindow');
  if (box) {
    box.hidden = true;
  }
}

function getBooking(code) {
  return apiRequest(`/api/staff/bookings/${encodeURIComponent(code)}`);
}

function goToResult(page, code, errorCode) {
  const params = new URLSearchParams({ code });
  if (errorCode) {
    params.set('error', errorCode);
  }
  window.location.href = `${page}?${params}`;
}

function setUpApproval() {
  const searchInput = document.getElementById('searchInput');
  const gateInput = document.getElementById('checkinPoint');
  const message = document.getElementById('checkinMessage');
  // Code of the booking on screen. QR scanning is not in this sprint, so staff search by code.
  let currentCode = null;

  function showMessage(text) {
    message.textContent = text;
    message.classList.add('text-danger');
    message.hidden = false;
  }

  async function lookUp() {
    // History shows codes as "#TU-69101601", so a pasted "#" is dropped.
    const code = searchInput.value.trim().replace(/^#/, '').toUpperCase();
    if (!code) {
      showMessage('กรุณากรอกรหัสจอง');
      return;
    }

    let booking;
    try {
      booking = await getBooking(code);
    } catch (error) {
      currentCode = null;
      clearBooking();
      showMessage(error.message);
      return;
    }
    if (booking.status !== 'pending') {
      goToResult('check-in-failed.html', booking.code, finalStatusErrors[booking.status]);
      return;
    }
    // A booking typed in by hand is not the one whose QR code was scanned.
    if (scannedQrFor(booking.code) === null) {
      forgetScannedQr();
    }
    currentCode = booking.code;
    fillBooking(booking);
    searchInput.value = '';
    message.hidden = true;
  }

  async function confirmCheckin() {
    if (!currentCode) {
      showMessage('กรุณาค้นหาด้วยรหัสจองก่อน');
      return;
    }
    // The field reads "ประตู A1"; the API stores the gate name, "A1".
    const gate = gateInput.value.trim().replace(/^ประตู\s*/, '');
    // Opened from the scan page: send the QR token too, so the server checks the code.
    const qrToken = scannedQrFor(currentCode);
    try {
      await apiRequest(`/api/staff/bookings/${encodeURIComponent(currentCode)}/checkin`, {
        method: 'POST',
        body: qrToken ? { gate, qrToken } : { gate },
      });
    } catch (error) {
      if (failureDetails[error.code]) {
        goToResult('check-in-failed.html', currentCode, error.code);
      } else {
        showMessage(error.message);
      }
      return;
    }
    markScanCheckedIn(currentCode);
    forgetScannedQr();
    goToResult('check-in-success.html', currentCode);
  }

  clearBooking();
  gateInput.value = `ประตู ${getCheckinGate()}`;
  document.getElementById('btnSearch').addEventListener('click', lookUp);
  searchInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      lookUp();
    }
  });
  document.getElementById('btnConfirmCheckin').addEventListener('click', confirmCheckin);

  // Opened from the scan page or its search box: look the booking up straight away.
  const code = new URLSearchParams(window.location.search).get('code');
  if (code) {
    searchInput.value = code;
    lookUp();
  } else {
    searchInput.focus();
  }
}

async function setUpResult() {
  const params = new URLSearchParams(window.location.search);
  const code = params.get('code');
  if (!code) {
    clearBooking();
    return;
  }

  let booking;
  try {
    booking = await getBooking(code);
  } catch (error) {
    clearBooking();
    setField('failReason', error.message);
    return;
  }
  fillBooking(booking);
  setField('checkedInAt', booking.checkedInAt ? booking.checkedInAt.slice(11, 16) : '—');
  setField('checkedInBy', booking.checkedInBy ?? '—');

  const errorCode = params.get('error');
  if (errorCode) {
    const failure = failureDetails[errorCode];
    setField('failReason', failure?.reason ?? apiErrorMessages[errorCode] ?? 'เช็คอินไม่สำเร็จ');
    const detail = failure?.detail ?? booking.checkedInBy;
    const detailElement = setField('failDetail', detail ?? '');
    if (detailElement) {
      detailElement.parentElement.hidden = !detail;
    }
  }
}

document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('#btnScanNext').forEach((button) => {
    button.addEventListener('click', () => {
      window.location.href = 'check-in-scan.html';
    });
  });

  if (document.getElementById('btnConfirmCheckin')) {
    setUpApproval();
  } else {
    setUpResult();
  }
});
