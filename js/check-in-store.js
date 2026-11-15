// Shared by the staff check-in pages: what this device remembers between pages.
// - The gate this device checks people in at ("A1"), chosen on the scan page.
// - The QR token just scanned, so the approval page can send it with the check-in.
// - Today's recent scans, listed on the scan page.

const CHECKIN_GATES = ["A1", "A2", "B1"];
const GATE_KEY = "tuBasket.checkinGate";
const QR_KEY = "tuBasket.scannedQr";
const SCANS_KEY = "tuBasket.recentScans";
const MAX_RECENT_SCANS = 5;

// Storage can be blocked (private mode, strict settings); then nothing is remembered.
function readStored(storage, key) {
    try {
        return JSON.parse(storage.getItem(key));
    } catch {
        return null;
    }
}

function writeStored(storage, key, value) {
    try {
        storage.setItem(key, JSON.stringify(value));
    } catch {
        // Not remembered; the pages still work.
    }
}

function getCheckinGate() {
    const gate = readStored(localStorage, GATE_KEY);
    return CHECKIN_GATES.includes(gate) ? gate : CHECKIN_GATES[0];
}

function setCheckinGate(gate) {
    writeStored(localStorage, GATE_KEY, gate);
}

// Kept for this tab only: the token proves the member showed their QR code.
function rememberScannedQr(code, qrToken) {
    writeStored(sessionStorage, QR_KEY, { code, qrToken });
}

function scannedQrFor(code) {
    const scanned = readStored(sessionStorage, QR_KEY);
    return scanned && scanned.code === code ? scanned.qrToken : null;
}

function forgetScannedQr() {
    try {
        sessionStorage.removeItem(QR_KEY);
    } catch {
        // Nothing stored.
    }
}

function todayKey() {
    const now = new Date();
    const pad = (number) => String(number).padStart(2, "0");
    return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

// Today's scans, newest first.
function recentScans() {
    const scans = readStored(localStorage, SCANS_KEY);
    return Array.isArray(scans) ? scans.filter((scan) => scan.day === todayKey()) : [];
}

// result: "pending", "checked-in", "cancelled", "no-show", "used" (scanned again after
// check-in) or "invalid" (not one of our QR codes).
function saveScan(scan) {
    const time = new Date().toTimeString().slice(0, 5);
    const scans = [{ ...scan, day: todayKey(), time }, ...recentScans()];
    writeStored(localStorage, SCANS_KEY, scans.slice(0, MAX_RECENT_SCANS));
}

// After a check-in, the scan of that booking now shows "เช็คอินแล้ว".
function markScanCheckedIn(code) {
    const scans = recentScans();
    const scan = scans.find((item) => item.code === code && item.result === "pending");
    if (scan) {
        scan.result = "checked-in";
        writeStored(localStorage, SCANS_KEY, scans);
    }
}
