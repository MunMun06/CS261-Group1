// Staff QR scan page (check-in-scan.html). The camera reads the member's QR code, the
// server checks it (POST /api/staff/qr/scan), and a pending booking opens the approval
// page; a finished one (cancelled, already checked in, no-show) opens the failed page.

const SCAN_INTERVAL_MS = 150;
// The same unreadable code is ignored for this long, so one bad code shows one error.
const REPEAT_IGNORE_MS = 3000;
const OPEN_APPROVAL_DELAY_MS = 900;

const scanStatusErrors = {
    cancelled: "ALREADY_CANCELLED",
    "checked-in": "ALREADY_CHECKED_IN",
    "no-show": "ALREADY_NO_SHOW",
};

const recentLabels = {
    pending: { text: "รอยืนยัน", className: "badge-warning" },
    "checked-in": { text: "เช็คอินแล้ว", className: "badge-success" },
    cancelled: { text: "ยกเลิกแล้ว", className: "badge-muted" },
    "no-show": { text: "ไม่มาเช็คอิน", className: "badge-danger" },
    used: { text: "QR ถูกใช้งานแล้ว", className: "badge-danger" },
    invalid: { text: "QR ไม่ถูกต้อง", className: "badge-danger" },
};

const camera = document.getElementById("scanCamera");
const video = document.getElementById("scanVideo");
const frame = document.createElement("canvas");
const frameContext = frame.getContext("2d", { willReadFrequently: true });
const foundCode = document.getElementById("scanFoundCode");
const openApproval = document.getElementById("scanOpenApproval");
const blockedText = document.getElementById("scanBlockedText");
const scanMessage = document.getElementById("scanMessage");
const gateSelect = document.getElementById("scanGate");

let stream = null;
let detector = null;
let timer = null;
let busy = false;
let lastText = "";
let lastTextAt = 0;

// "scanning", "found", "blocked" or "starting": CSS shows the matching parts.
function setCameraState(state) {
    camera.dataset.state = state;
    camera.closest(".camera-panel").dataset.state = state;
}

function showMessage(text) {
    scanMessage.textContent = text;
    scanMessage.hidden = !text;
}

function stopCamera() {
    window.clearTimeout(timer);
    timer = null;
    if (stream) {
        stream.getTracks().forEach((track) => track.stop());
        stream = null;
    }
    video.srcObject = null;
}

function blockCamera(text) {
    stopCamera();
    blockedText.textContent = text;
    setCameraState("blocked");
}

// The browser's own QR reader when it has one (Chrome, Edge, Android), else jsQR.
async function readQr() {
    if (detector) {
        const codes = await detector.detect(video);
        return codes[0]?.rawValue ?? null;
    }
    // A smaller copy of the frame is enough for a QR code and much faster to read.
    const scale = Math.min(1, 640 / video.videoWidth);
    frame.width = Math.round(video.videoWidth * scale);
    frame.height = Math.round(video.videoHeight * scale);
    frameContext.drawImage(video, 0, 0, frame.width, frame.height);
    const image = frameContext.getImageData(0, 0, frame.width, frame.height);
    return window.jsQR(image.data, image.width, image.height, { inversionAttempts: "dontInvert" })?.data ?? null;
}

async function scanFrame() {
    timer = null;
    if (!stream || busy) {
        return;
    }
    if (video.readyState >= video.HAVE_CURRENT_DATA && video.videoWidth > 0) {
        try {
            const text = await readQr();
            const repeated = text === lastText && Date.now() - lastTextAt < REPEAT_IGNORE_MS;
            if (text && !repeated) {
                lastText = text;
                lastTextAt = Date.now();
                await handleScan(text);
            }
        } catch {
            // A frame that can't be read; try the next one.
        }
    }
    if (stream && !busy) {
        timer = window.setTimeout(scanFrame, SCAN_INTERVAL_MS);
    }
}

async function startCamera() {
    showMessage("");
    setCameraState("starting");
    if (!navigator.mediaDevices?.getUserMedia) {
        blockCamera("เบราว์เซอร์นี้เปิดกล้องไม่ได้ ลองเปิดหน้านี้ผ่าน localhost หรือ https หรือค้นหาด้วยรหัสจองแทน");
        return;
    }
    if (!detector && typeof window.jsQR !== "function") {
        blockCamera("โหลดตัวอ่าน QR Code ไม่ได้ ตรวจสอบอินเทอร์เน็ตแล้วลองอีกครั้ง หรือค้นหาด้วยรหัสจองแทน");
        return;
    }
    try {
        stream = await navigator.mediaDevices.getUserMedia({
            audio: false,
            video: { facingMode: { ideal: "environment" } },
        });
    } catch {
        blockCamera("อนุญาตให้เว็บไซต์ใช้กล้องในการตั้งค่าของเบราว์เซอร์ แล้วลองอีกครั้ง หรือค้นหาด้วยรหัสจองแทน");
        return;
    }
    video.srcObject = stream;
    try {
        await video.play();
    } catch {
        // Autoplay of a muted inline video is allowed; play() can still reject on teardown.
    }
    busy = false;
    setCameraState("scanning");
    scanFrame();
}

function goToFailed(code, status) {
    const params = new URLSearchParams({ code, error: scanStatusErrors[status] });
    window.location.href = `check-in-failed.html?${params}`;
}

async function handleScan(text) {
    busy = true;
    showMessage("");
    let booking;
    try {
        booking = await apiRequest("/api/staff/qr/scan", { method: "POST", body: { qrData: text } });
    } catch (error) {
        if (error.code === "INVALID_QR") {
            saveScan({ code: null, result: "invalid" });
            renderRecentScans();
        }
        showMessage(error.message);
        busy = false;
        return;
    }

    if (booking.status !== "pending") {
        saveScan({
            code: booking.code,
            court: booking.court,
            start: booking.start,
            end: booking.end,
            result: booking.status === "checked-in" ? "used" : booking.status,
        });
        stopCamera();
        goToFailed(booking.code, booking.status);
        return;
    }

    saveScan({ code: booking.code, court: booking.court, start: booking.start, end: booking.end, result: "pending" });
    rememberScannedQr(booking.code, booking.qrToken);
    stopCamera();
    const approvalUrl = `check-in-approval.html?${new URLSearchParams({ code: booking.code })}`;
    foundCode.textContent = `#${booking.code}`;
    openApproval.href = approvalUrl;
    setCameraState("found");
    renderRecentScans();
    // "ไม่ต้องกดปุ่ม": the approval page opens by itself.
    window.setTimeout(() => {
        window.location.href = approvalUrl;
    }, OPEN_APPROVAL_DELAY_MS);
}

function renderRecentScans() {
    const list = document.getElementById("recentScans");
    const scans = recentScans();
    document.getElementById("recentEmpty").hidden = scans.length > 0;
    list.replaceChildren(...scans.map((scan) => {
        const item = document.createElement("li");
        const text = document.createElement("div");
        const code = document.createElement("p");
        code.className = "recent-code";
        code.textContent = scan.code ? `#${scan.code}` : "QR Code ไม่รู้จัก";
        const detail = document.createElement("p");
        detail.className = "recent-detail";
        const when = scan.start ? `${scan.court.replace("สนามบาสเกตบอล ", "")} · ${scan.start} – ${scan.end} · ` : "";
        detail.textContent = `${when}สแกน ${scan.time}`;
        text.append(code, detail);
        const label = recentLabels[scan.result] ?? recentLabels.invalid;
        const badge = document.createElement("span");
        badge.className = `badge ${label.className}`;
        badge.textContent = label.text;
        item.append(text, badge);
        return item;
    }));
}

function showGate() {
    const gate = gateSelect.value;
    document.getElementById("scanGateLabel").textContent = `ประตู ${gate}`;
    document.getElementById("recentGate").textContent = `วันนี้ · ประตู ${gate}`;
}

function setUpScanPage() {
    gateSelect.value = getCheckinGate();
    showGate();
    gateSelect.addEventListener("change", () => {
        setCheckinGate(gateSelect.value);
        showGate();
    });

    document.getElementById("scanSearch").addEventListener("submit", (event) => {
        event.preventDefault();
        const code = document.getElementById("scanLookup").value.trim().replace(/^#/, "").toUpperCase();
        if (code) {
            window.location.href = `check-in-approval.html?${new URLSearchParams({ code })}`;
        }
    });
    document.getElementById("scanRetry").addEventListener("click", startCamera);

    // Turn the camera off when the page is hidden, and back on when it returns.
    document.addEventListener("visibilitychange", () => {
        if (document.hidden) {
            stopCamera();
        } else if (camera.dataset.state === "scanning") {
            startCamera();
        }
    });
    window.addEventListener("pagehide", stopCamera);

    if ("BarcodeDetector" in window) {
        try {
            detector = new window.BarcodeDetector({ formats: ["qr_code"] });
        } catch {
            detector = null;
        }
    }
    renderRecentScans();
    startCamera();
}

document.addEventListener("DOMContentLoaded", setUpScanPage);
