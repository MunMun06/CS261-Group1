// Shared by every page: calls to the TU Basket Booking API (app/main.py).

// The API serves these pages itself on port 8000; any other dev server talks to it there.
const API_BASE = window.location.port === "8000" ? "" : "http://localhost:8000";

// Thai text for the API's error codes.
const apiErrorMessages = {
    NETWORK_ERROR: "เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ กรุณาลองใหม่อีกครั้ง",
    INVALID_INPUT: "ข้อมูลไม่ถูกต้อง",
    SLOT_TAKEN: "ช่วงเวลานี้มีคนจองแล้ว",
    BOOKING_BUSY: "มีผู้จองพร้อมกันจำนวนมาก กรุณาลองใหม่อีกครั้ง",
    SLOT_IN_PAST: "ช่วงเวลานี้เริ่มไปแล้ว",
    QUOTA_EXCEEDED: "คุณใช้สิทธิ์จองเต็มโควตา 2 ชั่วโมงต่อวันแล้ว",
    MAX_HOURS: "จองได้ครั้งละ 1–2 ชั่วโมง",
    OUTSIDE_OPEN_HOURS: "สนามเปิด 08:00 – 19:00",
    DATE_OUT_OF_RANGE: "จองล่วงหน้าได้สูงสุด 7 วัน",
    COURT_NOT_FOUND: "ไม่พบสนามนี้",
    BOOKING_NOT_FOUND: "ไม่พบรหัสจองนี้",
    ALREADY_CANCELLED: "การจองนี้ถูกยกเลิกแล้ว",
    ALREADY_CHECKED_IN: "การจองนี้เช็คอินไปแล้ว",
    ALREADY_NO_SHOW: "ผู้จองไม่ได้เช็คอินภายในเวลาที่กำหนด",
    CHECKIN_TOO_EARLY: "เช็คอินได้ตั้งแต่ 15 นาทีก่อนเวลาเริ่ม",
    CHECKIN_TOO_LATE: "เลยเวลาเช็คอิน (15 นาทีหลังเวลาเริ่ม) แล้ว",
};

class ApiError extends Error {
    constructor(code, status) {
        super(apiErrorMessages[code] ?? "เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง");
        this.code = code;
        this.status = status;
    }
}

// apiRequest("/api/history?page=2") or apiRequest("/api/bookings", { method: "POST", body: {...} }).
// Resolves to the JSON body; rejects with an ApiError.
async function apiRequest(path, { method = "GET", body } = {}) {
    let response;
    try {
        response = await fetch(`${API_BASE}${path}`, {
            method,
            headers: body ? { "Content-Type": "application/json" } : {},
            body: body ? JSON.stringify(body) : undefined,
        });
    } catch {
        throw new ApiError("NETWORK_ERROR", 0);
    }
    const data = await response.json().catch(() => null);
    if (!response.ok) {
        throw new ApiError(data?.error?.code ?? "HTTP_ERROR", response.status);
    }
    return data;
}
