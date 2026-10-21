const thaiWeekdays = ["อา", "จ", "อ", "พ", "พฤ", "ศ", "ส"];
const OPEN_HOUR = 8;
const CLOSE_HOUR = 19;
const MAX_HOURS_PER_DAY = 2;
const HOUR_HEIGHT = 64;

const openHours = Array.from({ length: CLOSE_HOUR - OPEN_HOUR }, (_, index) => OPEN_HOUR + index);

const dateList = document.querySelector("#date-list");
const dateMonth = document.querySelector("#date-month");
const courtDate = document.querySelector("#court-date");
const bookingModal = document.querySelector("#booking-modal");
const modalCourtName = document.querySelector("#modal-court-name");
const modalBookingDate = document.querySelector("#modal-booking-date");
const timelineScroll = document.querySelector("#timeline-scroll");
const timeline = document.querySelector("#time-slots");
const bookingMessage = document.querySelector("#booking-message");
const timeSummary = document.querySelector("#time-summary");
const quotaLabel = document.querySelector("#quota-label");
const quotaValue = document.querySelector("#quota-value");
const quotaBar = document.querySelector("#quota-bar");
const confirmButton = document.querySelector("#confirm-booking");

function toDateKey(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
}

function fromDateKey(key) {
    const [year, month, day] = key.split("-").map(Number);
    return new Date(year, month - 1, day);
}

const todayKey = toDateKey(new Date());
let selectedDate = todayKey;
let selectedCourt = null;
// Start hours the user picked, sorted. They don't have to be next to each other: [13, 15]
let selectedHours = [];
// From GET /api/courts/{id}/slots for the open court and date.
let bookedHours = new Set();
let quotaUsed = 0;
// Bumped on every slot request, so a late answer for another court or date is dropped.
let slotRequest = 0;

const monthFormatter = new Intl.DateTimeFormat("th-TH", { month: "short" });
const yearFormatter = new Intl.DateTimeFormat("th-TH", { year: "numeric" });
const longWeekdayFormatter = new Intl.DateTimeFormat("th-TH", { weekday: "long" });

function hourLabel(hour) {
    return `${String(hour).padStart(2, "0")}:00`;
}

function rangeLabel(startHour, length) {
    return `${hourLabel(startHour)} – ${hourLabel(startHour + length)}`;
}

// "อา 19 ต.ค."
function shortDateLabel(key) {
    const date = fromDateKey(key);
    return `${thaiWeekdays[date.getDay()]} ${date.getDate()} ${monthFormatter.format(date)}`;
}

// "วันอาทิตย์ 19 ต.ค."
function longDateLabel(key) {
    const date = fromDateKey(key);
    return `${longWeekdayFormatter.format(date)} ${date.getDate()} ${monthFormatter.format(date)}`;
}

// "ต.ค. 2569", or "ต.ค. – พ.ย. 2569" when the 7 days cross a month.
function monthRangeLabel(first, last) {
    const year = yearFormatter.format(last).replace(/\D/g, "");
    const firstMonth = monthFormatter.format(first);
    const lastMonth = monthFormatter.format(last);
    return firstMonth === lastMonth ? `${firstMonth} ${year}` : `${firstMonth} – ${lastMonth} ${year}`;
}

function renderDateList() {
    const today = new Date();
    const days = Array.from({ length: 7 }, (_, offset) => {
        const date = new Date(today);
        date.setDate(today.getDate() + offset);
        return date;
    });

    days.forEach((date) => {
        const key = toDateKey(date);
        const button = document.createElement("button");
        button.type = "button";
        button.className = "date-button";
        button.dataset.date = key;
        button.setAttribute("aria-pressed", String(key === selectedDate));
        button.setAttribute("aria-label", longDateLabel(key));
        button.classList.toggle("is-selected", key === selectedDate);

        const weekday = document.createElement("span");
        weekday.className = "date-weekday";
        weekday.textContent = thaiWeekdays[date.getDay()];

        const number = document.createElement("span");
        number.className = "date-number";
        number.textContent = date.getDate();

        button.append(weekday, number);
        button.addEventListener("click", () => selectDate(key));
        dateList.append(button);
    });

    dateMonth.textContent = monthRangeLabel(days[0], days.at(-1));
}

function selectDate(key) {
    selectedDate = key;
    dateList.querySelectorAll(".date-button").forEach((button) => {
        const isSelected = button.dataset.date === key;
        button.classList.toggle("is-selected", isSelected);
        button.setAttribute("aria-pressed", String(isSelected));
    });
    courtDate.textContent = `${key === todayKey ? "วันนี้ · " : ""}${shortDateLabel(key)}`;
}

function usedQuota() {
    return quotaUsed;
}

// Today's hours that have already started can't be booked.
function isPast(hour) {
    return selectedDate === todayKey && hour <= new Date().getHours();
}

// Why an hour can't be picked, or null when it's free.
function unavailableLabel(hour) {
    if (bookedHours.has(hour)) {
        return "จองแล้ว";
    }
    return isPast(hour) ? "หมดเวลา" : null;
}

function showBookingMessage(message, type) {
    bookingMessage.textContent = message;
    bookingMessage.className = `booking-message is-${type}`;
    bookingMessage.hidden = false;
}

function svgIcon(path, size) {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("width", size);
    svg.setAttribute("height", size);
    svg.setAttribute("viewBox", "0 0 14 14");
    svg.setAttribute("fill", "none");
    svg.setAttribute("aria-hidden", "true");
    const line = document.createElementNS("http://www.w3.org/2000/svg", "path");
    line.setAttribute("d", path);
    line.setAttribute("stroke", "currentColor");
    line.setAttribute("stroke-width", "1.6");
    line.setAttribute("stroke-linecap", "round");
    line.setAttribute("stroke-linejoin", "round");
    svg.append(line);
    return svg;
}

const PLUS_ICON = "M7 2.9v8.2M2.9 7h8.2";
const CHECK_ICON = "m3.9 7.2 2.3 2.3 4.9-4.9";

function textSpan(className, text) {
    const span = document.createElement("span");
    span.className = className;
    span.textContent = text;
    return span;
}

// Each slot sits on the hour lines: 8px gap above and below, 64px per hour.
function placeSlot(element, startHour, length) {
    element.style.top = `${(startHour - OPEN_HOUR) * HOUR_HEIGHT + 12}px`;
    element.style.height = `${length * HOUR_HEIGHT - 8}px`;
    timeline.append(element);
}

function renderTimeline() {
    timeline.replaceChildren();
    timeline.style.height = `${openHours.length * HOUR_HEIGHT + 20}px`;

    [...openHours, CLOSE_HOUR].forEach((hour, index) => {
        const line = document.createElement("div");
        line.className = "timeline-line";
        line.style.top = `${index * HOUR_HEIGHT}px`;
        line.setAttribute("aria-hidden", "true");
        line.append(textSpan("", hourLabel(hour)));
        timeline.append(line);
    });

    let index = 0;
    while (index < openHours.length) {
        const hour = openHours[index];
        const label = unavailableLabel(hour);

        if (label) {
            let length = 1;
            while (hour + length < CLOSE_HOUR && unavailableLabel(hour + length) === label) {
                length += 1;
            }
            const slot = document.createElement("div");
            slot.className = "time-slot is-booked";
            slot.append(textSpan("slot-status", label), textSpan("slot-range", rangeLabel(hour, length)));
            placeSlot(slot, hour, length);
            index += length;
            continue;
        }

        // Each picked hour is its own block, so tapping it cancels exactly that hour.
        if (selectedHours.includes(hour)) {
            const slot = document.createElement("button");
            slot.type = "button";
            slot.className = "time-slot is-selected";
            slot.setAttribute("aria-pressed", "true");
            slot.setAttribute("aria-label", `${rangeLabel(hour, 1)} เลือกแล้ว แตะเพื่อยกเลิก`);
            const text = document.createElement("span");
            text.className = "slot-selected-text";
            text.append(textSpan("slot-selected-range", rangeLabel(hour, 1)), textSpan("slot-selected-detail", "แตะเพื่อยกเลิก"));
            const icon = textSpan("slot-icon", "");
            icon.append(svgIcon(CHECK_ICON, 18));
            slot.append(text, icon);
            slot.addEventListener("click", () => unpickHour(hour));
            placeSlot(slot, hour, 1);
            index += 1;
            continue;
        }

        const slot = document.createElement("button");
        slot.type = "button";
        slot.className = "time-slot is-free";
        slot.setAttribute("aria-label", `เลือก ${rangeLabel(hour, 1)}`);
        const icon = textSpan("slot-icon", "");
        icon.append(svgIcon(PLUS_ICON, 14));
        slot.append(textSpan("slot-status", "ว่าง"), textSpan("slot-range", rangeLabel(hour, 1)), icon);
        slot.addEventListener("click", () => pickHour(hour));
        placeSlot(slot, hour, 1);
        index += 1;
    }

    renderSummary();
}

// [13, 14, 16] → [{ start: 13, length: 2 }, { start: 16, length: 1 }]
function groupHours(hours) {
    const ranges = [];
    hours.forEach((hour) => {
        const last = ranges.at(-1);
        if (last && last.start + last.length === hour) {
            last.length += 1;
        } else {
            ranges.push({ start: hour, length: 1 });
        }
    });
    return ranges;
}

function renderSummary() {
    const ranges = groupHours(selectedHours);
    timeSummary.replaceChildren(
        ...(ranges.length === 0
            ? ["ยังไม่ได้เลือก"]
            : ranges.map(({ start, length }) => textSpan("summary-range", rangeLabel(start, length))))
    );
    timeSummary.classList.toggle("is-empty", ranges.length === 0);
    timeSummary.classList.toggle("is-multiple", ranges.length > 1);

    const used = usedQuota() + selectedHours.length;
    quotaLabel.textContent = selectedDate === todayKey ? "ใช้โควตาวันนี้" : "ใช้โควตาวันที่เลือก";
    quotaValue.textContent = `${used}/${MAX_HOURS_PER_DAY} ชม.`;
    [...quotaBar.children].forEach((segment, index) => {
        segment.classList.toggle("is-used", index < used);
    });
}

// Any free hour can be picked, next to the others or not, up to the daily quota.
function pickHour(hour) {
    bookingMessage.hidden = true;
    if (usedQuota() + selectedHours.length + 1 > MAX_HOURS_PER_DAY) {
        showBookingMessage(`คุณใช้สิทธิ์จองเต็มโควตา ${MAX_HOURS_PER_DAY} ชั่วโมงต่อวันแล้ว`, "error");
        return;
    }
    selectedHours = [...selectedHours, hour].sort((a, b) => a - b);
    renderTimeline();
}

function unpickHour(hour) {
    bookingMessage.hidden = true;
    selectedHours = selectedHours.filter((picked) => picked !== hour);
    renderTimeline();
}

// Loads which hours are taken and how much quota is used. Resolves to false if it failed.
async function loadSlots() {
    const request = ++slotRequest;
    try {
        const data = await apiRequest(`/api/courts/${selectedCourt}/slots?date=${selectedDate}`);
        if (request !== slotRequest) {
            return false;
        }
        bookedHours = new Set(
            data.slots.filter((slot) => slot.status === "booked").map((slot) => Number(slot.start.slice(0, 2)))
        );
        quotaUsed = data.quotaUsed;
        return true;
    } catch (error) {
        if (request === slotRequest) {
            showBookingMessage(error.message, "error");
        }
        return false;
    }
}

async function openBooking(button) {
    selectedCourt = Number(button.dataset.court);
    selectedHours = [];
    bookedHours = new Set();
    quotaUsed = 0;
    bookingMessage.hidden = true;
    confirmButton.disabled = true;
    modalCourtName.textContent = button.closest(".court-card").querySelector("h3").textContent;
    modalBookingDate.textContent = longDateLabel(selectedDate);
    timeline.replaceChildren();
    bookingModal.showModal();

    if (!(await loadSlots())) {
        return;
    }
    confirmButton.disabled = false;
    renderTimeline();

    // Start the timeline at the first free hour.
    const firstFree = openHours.find((hour) => !unavailableLabel(hour)) ?? OPEN_HOUR;
    timelineScroll.scrollTop = Math.max(0, (firstFree - OPEN_HOUR) * HOUR_HEIGHT - 8);
}

// Each run of picked hours is one booking: [13, 14, 16] → 13:00 for 2 hours, 16:00 for 1 hour.
async function confirmBooking() {
    if (selectedHours.length === 0) {
        showBookingMessage("กรุณาเลือกช่วงเวลาที่ต้องการจอง", "error");
        return;
    }

    confirmButton.disabled = true;
    bookingMessage.hidden = true;
    let failure = null;
    for (const { start, length } of groupHours(selectedHours)) {
        try {
            await apiRequest("/api/bookings", {
                method: "POST",
                body: { courtId: selectedCourt, date: selectedDate, start: hourLabel(start), durationHours: length },
            });
        } catch (error) {
            failure = error;
            break;
        }
    }

    // Show what the server has now, including any range that was booked before a failure.
    selectedHours = [];
    const loaded = await loadSlots();
    renderTimeline();
    if (failure) {
        showBookingMessage(failure.message, "error");
        confirmButton.disabled = !loaded;
        return;
    }

    showBookingMessage("จองสนามสำเร็จเรียบร้อยแล้ว!", "success");
    timeline.querySelectorAll(".time-slot").forEach((slot) => {
        slot.disabled = true;
    });
    window.setTimeout(() => bookingModal.close(), 1200);
}

document.querySelectorAll(".btn-select-court").forEach((button) => {
    button.addEventListener("click", () => openBooking(button));
});
document.querySelector("#modal-close").addEventListener("click", () => bookingModal.close());
// A click on the dialog itself (outside the panel) landed on the backdrop.
bookingModal.addEventListener("click", (event) => {
    if (event.target === bookingModal) {
        bookingModal.close();
    }
});
confirmButton.addEventListener("click", confirmBooking);

renderDateList();
selectDate(selectedDate);
