// Shared by every page: calls to the TU Basket Booking API (app/main.py).

// Docker's frontend container and the API on port 8000 both answer /api on the page's
// own origin. Editor preview servers (VS Code Live Server, Vite, JetBrains) and pages
// opened as files have no /api, so they call the API on port 8000 instead.
const PREVIEW_SERVER_PORTS = ["5500", "5173", "63342"];
const API_BASE =
    window.location.protocol === "file:" || PREVIEW_SERVER_PORTS.includes(window.location.port)
        ? "http://localhost:8000"
        : "";

// Thai text for the API's error codes.
const apiErrorMessages = {
    NETWORK_ERROR: "เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ กรุณาลองใหม่อีกครั้ง",
    INVALID_INPUT: "ข้อมูลไม่ถูกต้อง",
    SLOT_TAKEN: "ช่วงเวลานี้มีคนจองแล้ว",
    BOOKING_BUSY: "มีผู้จองพร้อมกันจำนวนมาก กรุณาลองใหม่อีกครั้ง",
    SLOT_IN_PAST: "ช่วงเวลานี้เริ่มไปแล้ว",
    QUOTA_EXCEEDED: "คุณใช้สิทธิ์จองเต็มโควตา 2 ชั่วโมงต่อวันแล้ว",
    FACULTY_NOT_ALLOWED: "สิทธิ์จองสนามนี้จำกัดสำหรับนักศึกษาคณะวิทยาศาสตร์และเทคโนโลยี",
    STUDENT_SESSION_REQUIRED: "กรุณาออกจากระบบแล้วเข้าสู่ระบบใหม่เพื่ออัปเดตข้อมูลคณะก่อนจอง",
    STUDENT_SESSION_STALE: "ข้อมูลคณะไม่เป็นปัจจุบัน กรุณาออกจากระบบแล้วเข้าสู่ระบบใหม่",
    STUDENT_REGISTRY_UNAVAILABLE: "ตรวจสอบข้อมูลคณะไม่ได้ กรุณาออกจากระบบแล้วเข้าสู่ระบบใหม่",
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
    CANCEL_TOO_LATE: "ยกเลิกได้ถึง 1 ชั่วโมงก่อนเวลาเริ่มเท่านั้น",
    INVALID_QR: "QR Code นี้ไม่ใช่ QR Code การจองของระบบ",
    UNAUTHORIZED:"กรุณาเข้าสู่ระบบก่อนใช้งาน",
    FORBIDDEN: "บัญชีนี้ไม่มีสิทธิ์ใช้งานส่วนของเจ้าหน้าที่",
    INVALID_CREDENTIALS: "ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง",
    TU_API_NOT_CONFIGURED: "ระบบยังไม่ได้ตั้งค่า TU API กรุณาแจ้งผู้ดูแลระบบ",
    TU_API_UNAVAILABLE: "ไม่สามารถเชื่อมต่อระบบยืนยันตัวตนของมหาวิทยาลัยได้ กรุณาลองใหม่อีกครั้งภายหลัง",
    TU_API_TIMEOUT: "ไม่สามารถเชื่อมต่อระบบยืนยันตัวตนของมหาวิทยาลัยได้ กรุณาลองใหม่อีกครั้งภายหลัง",
    TU_API_ERROR: "ไม่สามารถเชื่อมต่อระบบยืนยันตัวตนของมหาวิทยาลัยได้ กรุณาลองใหม่อีกครั้งภายหลัง",
    TU_API_INVALID_RESPONSE: "ไม่สามารถเชื่อมต่อระบบยืนยันตัวตนของมหาวิทยาลัยได้ กรุณาลองใหม่อีกครั้งภายหลัง",
    TU_API_KEY_UNAUTHORIZED: "ระบบยังตั้งค่า TU API ไม่ถูกต้อง กรุณาแจ้งผู้ดูแลระบบ",
    TU_API_KEY_FORBIDDEN:"ระบบยังตั้งค่า TU API ไม่ถูกต้อง กรุณาแจ้งผู้ดูแลระบบ",
    TU_API_REQUEST_ERROR: "ระบบยืนยันตัวตนไม่รับคำขอนี้ กรุณาลองใหม่อีกครั้ง",
};

// Sends a signed-out user to the login page, which brings them back here afterwards.
function redirectToLogin() {
    const here = window.location.pathname.split("/").pop() + window.location.search;
    window.location.href = `login.html?next=${encodeURIComponent(here)}`;
}

class ApiError extends Error {
    constructor(code, status) {
        super(apiErrorMessages[code] ?? "เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง");
        this.code = code;
        this.status = status;
    }
}

let studentSessionPromise;

// apiRequest("/api/history?page=2") or apiRequest("/api/bookings", { method: "POST", body: {...} }).
// Resolves to the JSON body; rejects with an ApiError.
async function apiRequest(path, { method = "GET", body } = {}) {
    if (
        path === "/api/history" ||
        path.startsWith("/api/history?") ||
        path === "/api/bookings" ||
        /^\/api\/bookings\/[^/]+\/cancel$/.test(path)
    ) {
        await ensureStudentSession();
    }
    return apiRequestRaw(path, { method, body });
}

async function ensureStudentSession() {
    if (!studentSessionPromise) {
        studentSessionPromise = apiRequestRaw("/api/session/start", { method: "POST" })
            .catch((error) => {
                studentSessionPromise = undefined;
                throw error;
            });
    }
    return studentSessionPromise;
}

async function apiRequestRaw(path, { method = "GET", body } = {}) {
    let response;
    try {
        response = await fetch(`${API_BASE}${path}`, {
            method,
            // Sends the session cookie from login, also when a dev server runs on another port.
            credentials: "include",
            headers: body ? { "Content-Type": "application/json" } : {},
            body: body ? JSON.stringify(body) : undefined,
        });
    } catch {
        throw new ApiError("NETWORK_ERROR", 0);
    }
    const data = await response.json().catch(() => null);
    if (!response.ok) {
        const code = data?.error?.code ?? "HTTP_ERROR";
        // No session, or it expired: log in again instead of showing an error.
        if (code === "UNAUTHORIZED") {
            redirectToLogin();
            // Never settles, so the page shows no error while the browser leaves it.
            return new Promise(() => {});
        }
        throw new ApiError(code, response.status);
    }
    return data;
}
