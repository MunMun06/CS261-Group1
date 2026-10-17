// Sample data until the booking API is ready. Replace with a fetch() call.
const LOCATION = "คณะวิทยาศาสตร์และเทคโนโลยี ศูนย์รังสิต";

const bookings = [
    { id: "TU-69101601", court: "สนามบาสเกตบอล สนามที่ 1", date: "2026-10-16", start: "18:00", end: "19:00", status: "pending" },
    { id: "TU-69101101", court: "สนามบาสเกตบอล สนามที่ 1", date: "2026-10-11", start: "18:00", end: "19:00", status: "checked-in", checkedInBy: "สแกนประตู A1" },
    { id: "TU-69101401", court: "สนามบาสเกตบอล สนามที่ 1", date: "2026-10-14", start: "17:00", end: "18:00", status: "cancelled" },
    { id: "TU-69101201", court: "สนามบาสเกตบอล สนามที่ 2", date: "2026-10-12", start: "16:00", end: "17:00", status: "no-show" },
    { id: "TU-69102001", court: "สนามบาสเกตบอล สนามที่ 2", date: "2026-10-20", start: "16:00", end: "18:00", status: "pending" },
];

const PAGE_SIZE = 10;

// Users can cancel until this long before the start time.
const CANCEL_CUTOFF_MINUTES = 60;

const statusLabels = {
    pending: "รอเช็คอิน",
    "checked-in": "เช็คอินแล้ว",
    cancelled: "ยกเลิกแล้ว",
    "no-show": "ไม่มาเช็คอิน",
};

const listElement = document.getElementById("history-list");
const emptyElement = document.getElementById("history-empty");
const summaryElement = document.getElementById("history-summary");
const paginationElement = document.getElementById("pagination");
const rangeElement = document.getElementById("pagination-range");
const pagesElement = document.getElementById("pagination-pages");
const pageTextElement = document.getElementById("pagination-page");
const cardTemplate = document.getElementById("booking-card-template");
const qrButtonTemplate = document.getElementById("qr-button-template");
const cancelButtonTemplate = document.getElementById("cancel-button-template");
const statusIcons = document.getElementById("status-icons-template").content;
const qrDialog = document.getElementById("qr-dialog");
const qrDialogCode = document.getElementById("qr-dialog-code");
const cancelDialog = document.getElementById("cancel-dialog");
const cancelDialogBooking = document.getElementById("cancel-dialog-booking");

let bookingToCancel = null;

const dateFormatter = new Intl.DateTimeFormat("th-TH", {
    weekday: "long",
    day: "numeric",
    month: "short",
    year: "numeric",
});

let currentPage = 1;

// "วันศุกร์ 16 ต.ค. 2569" (Intl adds "ที่" after the weekday, which the design drops)
function formatDate(isoDate) {
    const [year, month, day] = isoDate.split("-").map(Number);
    const parts = dateFormatter.formatToParts(new Date(year, month - 1, day));
    const part = (type) => parts.find((item) => item.type === type).value;
    return `${part("weekday")} ${part("day")} ${part("month")} ${part("year")}`;
}

function formatTime(booking) {
    const toMinutes = (time) => {
        const [hours, minutes] = time.split(":").map(Number);
        return hours * 60 + minutes;
    };
    const hours = (toMinutes(booking.end) - toMinutes(booking.start)) / 60;
    return `${booking.start} – ${booking.end} (${hours} ชม.)`;
}

function getStartTime(booking) {
    const [year, month, day] = booking.date.split("-").map(Number);
    const [hours, minutes] = booking.start.split(":").map(Number);
    return new Date(year, month - 1, day, hours, minutes);
}

// Newest first: later date, then later start time.
function sortBookings() {
    bookings.sort((a, b) => getStartTime(b) - getStartTime(a));
}

function canCancel(booking) {
    const minutesLeft = (getStartTime(booking) - Date.now()) / 60000;
    return booking.status === "pending" && minutesLeft >= CANCEL_CUTOFF_MINUTES;
}

function getDetail(booking) {
    if (booking.status === "checked-in") {
        return { label: "เช็คอินโดย", value: booking.checkedInBy };
    }
    if (booking.status === "cancelled") {
        return { label: "", value: "คืนโควตาประจำวันเรียบร้อยแล้ว" };
    }
    if (booking.status === "no-show") {
        return { label: "ไม่ได้เช็คอินภายใน 15 นาทีหลังเวลาเริ่ม", value: "ช่องเวลากลับมาว่างแล้ว" };
    }
    return { label: "รหัสจอง", value: `#${booking.id}` };
}

function createStatusBadge(status) {
    const badge = document.createElement("span");
    badge.className = `status-badge is-${status}`;
    badge.append(
        statusIcons.querySelector(`[data-status="${status}"]`).cloneNode(true),
        statusLabels[status],
    );
    return badge;
}

function createCard(booking) {
    const card = cardTemplate.content.firstElementChild.cloneNode(true);
    const detail = getDetail(booking);

    card.classList.add(`is-${booking.status}`);
    card.querySelector(".booking-court").textContent = booking.court;
    card.querySelector(".booking-date").textContent = formatDate(booking.date);
    card.querySelector(".booking-time").textContent = formatTime(booking);
    card.querySelector(".booking-place").textContent = LOCATION;
    const label = card.querySelector(".detail-label");
    label.textContent = detail.label;
    label.hidden = !detail.label;
    card.querySelector(".detail-value").textContent = detail.value;
    card.querySelector(".status-badge").replaceWith(createStatusBadge(booking.status));

    const side = card.querySelector(".booking-side");
    if (booking.status === "pending") {
        const qrButton = qrButtonTemplate.content.firstElementChild.cloneNode(true);
        qrButton.addEventListener("click", () => showQrCode(booking));
        side.append(qrButton);
    }
    if (canCancel(booking)) {
        const cancelButton = cancelButtonTemplate.content.firstElementChild.cloneNode(true);
        cancelButton.addEventListener("click", () => askToCancel(booking));
        side.append(cancelButton);
    }
    return card;
}

function showQrCode(booking) {
    qrDialogCode.textContent = `#${booking.id}`;
    qrDialog.showModal();
}

function askToCancel(booking) {
    bookingToCancel = booking;
    cancelDialogBooking.textContent =
        `${booking.court} · ${formatDate(booking.date)} · ${formatTime(booking)}`;
    cancelDialog.returnValue = "";
    cancelDialog.showModal();
}

// TODO: call POST /api/bookings/{code}/cancel when the API is ready.
function cancelBooking(booking) {
    booking.status = "cancelled";
    renderHistory();
}

cancelDialog.addEventListener("close", () => {
    if (cancelDialog.returnValue === "confirm" && bookingToCancel) {
        cancelBooking(bookingToCancel);
    }
    bookingToCancel = null;
});

// Page numbers to show: first, last, and the neighbours of the current page.
// null marks a gap, e.g. [1, 2, 3, null, 7].
function getPageNumbers(totalPages) {
    const pages = [];
    for (let page = 1; page <= totalPages; page += 1) {
        const isEdge = page === 1 || page === totalPages;
        const isNear = Math.abs(page - currentPage) <= 1 || (currentPage === 1 && page === 3);
        if (isEdge || isNear) {
            pages.push(page);
        } else if (pages[pages.length - 1] !== null) {
            pages.push(null);
        }
    }
    return pages;
}

function createPageButton(label, page, options = {}) {
    const button = document.createElement("button");
    button.className = "page-button";
    button.type = "button";
    button.disabled = Boolean(options.disabled);
    if (options.ariaLabel) {
        button.setAttribute("aria-label", options.ariaLabel);
    }
    if (page === currentPage && !options.ariaLabel) {
        button.setAttribute("aria-current", "page");
    }
    if (label instanceof Node) {
        button.append(label);
    } else {
        button.textContent = label;
    }
    button.addEventListener("click", () => goToPage(page));
    return button;
}

function createArrow(direction) {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("width", "16");
    svg.setAttribute("height", "16");
    svg.setAttribute("viewBox", "0 0 16 16");
    svg.setAttribute("fill", "none");
    svg.setAttribute("aria-hidden", "true");
    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("d", direction === "prev" ? "M10 12 6 8l4-4" : "m6 12 4-4-4-4");
    path.setAttribute("stroke", "currentColor");
    path.setAttribute("stroke-width", "1.67");
    svg.append(path);
    return svg;
}

function renderPagination(totalPages, firstIndex, lastIndex) {
    const rangeText = `${firstIndex}–${lastIndex}`;
    summaryElement.textContent = `แสดง ${rangeText} จาก ${bookings.length} รายการ`;

    const strong = document.createElement("strong");
    strong.textContent = rangeText;
    rangeElement.replaceChildren("แสดง ", strong, ` จาก ${bookings.length} รายการ`);
    pageTextElement.textContent = `หน้า ${currentPage} จาก ${totalPages}`;

    const buttons = getPageNumbers(totalPages).map((page) => {
        if (page === null) {
            const gap = document.createElement("span");
            gap.className = "page-ellipsis";
            gap.textContent = "…";
            return gap;
        }
        return createPageButton(String(page), page);
    });

    pagesElement.replaceChildren(
        createPageButton(createArrow("prev"), currentPage - 1, {
            ariaLabel: "หน้าก่อนหน้า",
            disabled: currentPage === 1,
        }),
        ...buttons,
        createPageButton(createArrow("next"), currentPage + 1, {
            ariaLabel: "หน้าถัดไป",
            disabled: currentPage === totalPages,
        }),
    );
}

function renderHistory() {
    const totalPages = Math.max(1, Math.ceil(bookings.length / PAGE_SIZE));
    const start = (currentPage - 1) * PAGE_SIZE;
    const visible = bookings.slice(start, start + PAGE_SIZE);

    listElement.replaceChildren(...visible.map(createCard));
    emptyElement.hidden = visible.length > 0;
    paginationElement.hidden = visible.length === 0;
    summaryElement.hidden = visible.length === 0;

    if (visible.length > 0) {
        renderPagination(totalPages, start + 1, start + visible.length);
    }
}

function goToPage(page) {
    currentPage = page;
    renderHistory();
    window.scrollTo({ top: 0, behavior: "smooth" });
}

sortBookings();
renderHistory();
