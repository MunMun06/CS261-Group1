const thaiWeekdays = ["อา", "จ", "อ", "พ", "พฤ", "ศ", "ส"];
const OPEN_HOUR = 8;
const CLOSE_HOUR = 19;
const MAX_HOURS_PER_DAY = 2;

const openHours = Array.from({ length: CLOSE_HOUR - OPEN_HOUR }, (_, index) => OPEN_HOUR + index);

const dateList = document.querySelector("#date-list");
const dateMonth = document.querySelector("#date-month");
const courtDate = document.querySelector("#court-date");
const bookingModal = document.querySelector("#booking-modal");
const modalCourtName = document.querySelector("#modal-court-name");
const slotHeadingDate = document.querySelector("#slot-heading-date");
const timelineScroll = document.querySelector("#timeline-scroll");
const timeline = document.querySelector("#time-slots");
const bookingMessage = document.querySelector("#booking-message");
const timeSummary = document.querySelector("#time-summary");
const selectionLimit = document.querySelector("#selection-limit");
const quotaLabel = document.querySelector("#quota-label");
const quotaValue = document.querySelector("#quota-value");
const quotaBar = document.querySelector("#quota-bar");
const confirmButton = document.querySelector("#confirm-booking");
const clearButton = document.querySelector("#clear-selection");
const successBanner = document.querySelector("#success-banner");
const successMessage = document.querySelector("#success-message");

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
let myBookedHours = new Set();
let quotaUsed = 0;
// Bumped on every slot request, so a late answer for another court or date is dropped.
let slotRequest = 0;
let previewRequest = 0;
let dateAvailabilityRequest = 0;

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

function updateSlotHeadingDate() {
    slotHeadingDate.textContent = ` · ${longDateLabel(selectedDate)}`;
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
        weekday.textContent = key === todayKey ? "วันนี้" : thaiWeekdays[date.getDay()];

        const number = document.createElement("span");
        number.className = "date-number";
        number.textContent = date.getDate();

        const availability = document.createElement("span");
        availability.className = "date-availability";
        availability.textContent = "—";

        button.append(weekday, number, availability);
        button.addEventListener("click", () => selectDate(key));
        dateList.append(button);
    });

    dateMonth.textContent = monthRangeLabel(days[0], days.at(-1));
}

function renderDateAvailability(key, data) {
    const button = [...dateList.querySelectorAll(".date-button")]
        .find((dateButton) => dateButton.dataset.date === key);
    if (!button) {
        return;
    }

    const currentHour = new Date().getHours();
    const freeHours = data.slots.filter((slot) => {
        const hour = Number(slot.start.slice(0, 2));
        return slot.status === "available" && !(key === todayKey && hour <= currentHour);
    }).length;
    const availability = button.querySelector(".date-availability");
    availability.classList.remove("is-error");
    availability.classList.toggle("is-full", freeHours === 0);
    availability.removeAttribute("title");
    availability.textContent = freeHours ? `ว่าง ${freeHours} ชม.` : "เต็ม";
    button.setAttribute("aria-busy", "false");
    button.setAttribute("aria-label", `${longDateLabel(key)} ${freeHours ? `ว่าง ${freeHours} ชั่วโมง` : "เต็ม"}`);
}

async function refreshDateAvailability() {
    if (selectedCourt === null) {
        return;
    }

    const request = ++dateAvailabilityRequest;
    const courtId = selectedCourt;
    const buttons = [...dateList.querySelectorAll(".date-button")];
    buttons.forEach((button) => {
        const availability = button.querySelector(".date-availability");
        availability.classList.remove("is-error", "is-full");
        availability.removeAttribute("title");
        availability.textContent = "กำลังโหลด";
        button.setAttribute("aria-busy", "true");
        button.setAttribute("aria-label", `${longDateLabel(button.dataset.date)} กำลังโหลดเวลาว่าง`);
    });

    await Promise.all(buttons.map(async (button) => {
        const key = button.dataset.date;
        try {
            const data = await apiRequest(`/api/courts/${courtId}/slots?date=${key}`);
            if (request !== dateAvailabilityRequest || selectedCourt !== courtId) {
                return;
            }
            renderDateAvailability(key, data);
        } catch (error) {
            if (request !== dateAvailabilityRequest || selectedCourt !== courtId) {
                return;
            }
            const availability = button.querySelector(".date-availability");
            availability.classList.add("is-error");
            availability.textContent = "โหลดไม่ได้";
            availability.title = error.message;
            button.setAttribute("aria-busy", "false");
            button.setAttribute("aria-label", `${longDateLabel(key)} โหลดข้อมูลเวลาว่างไม่สำเร็จ`);
        }
    }));
}

function selectDate(key) {
    selectedDate = key;
    dateList.querySelectorAll(".date-button").forEach((button) => {
        const isSelected = button.dataset.date === key;
        button.classList.toggle("is-selected", isSelected);
        button.setAttribute("aria-pressed", String(isSelected));
    });
    const date = fromDateKey(key);
    const period = key === todayKey ? "ข้อมูลช่วงว่างของวันนี้" : "ข้อมูลช่วงว่างของวันที่เลือก";
    courtDate.textContent = `${period} · ${shortDateLabel(key)} ${yearFormatter.format(date)}`;
    document.querySelectorAll(".availability-date-label").forEach((label) => {
        label.textContent = "กำลังโหลดช่วงเวลาว่าง";
        label.classList.remove("is-full");
    });
    document.querySelectorAll("[data-preview-court]").forEach((preview) => {
        preview.setAttribute("aria-label", `ช่วงเวลาว่าง ${shortDateLabel(key)}`);
    });
    refreshCourtPreviews();

    if (bookingModal.open && selectedCourt !== null) {
        refreshActiveCourtDate();
    }
}

async function refreshCourtPreviews() {
    const request = ++previewRequest;
    const date = selectedDate;
    const previews = [...document.querySelectorAll("[data-preview-court]")];
    previews.forEach((preview) => {
        preview.replaceChildren();
        preview.setAttribute("aria-busy", "true");
    });

    await Promise.all(previews.map(async (preview) => {
        const courtId = Number(preview.dataset.previewCourt);
        try {
            const data = await apiRequest(`/api/courts/${courtId}/slots?date=${date}`);
            if (request !== previewRequest) {
                return;
            }
            const booked = new Set(
                data.slots.filter((slot) => slot.status === "booked").map((slot) => Number(slot.start.slice(0, 2)))
            );
            const currentHour = new Date().getHours();
            const availableCount = openHours.filter((hour) =>
                !booked.has(hour) && (date !== todayKey || hour > currentHour)
            ).length;
            const dayLabel = date === todayKey ? "วันนี้" : shortDateLabel(date);
            const label = preview.parentElement.querySelector(".availability-date-label");
            label.textContent = availableCount
                ? `${dayLabel}ว่าง ${availableCount} จาก ${openHours.length} ช่วง`
                : `${dayLabel}เต็มแล้ว`;
            label.classList.toggle("is-full", availableCount === 0);
            const scaleLabels = preview.parentElement.querySelectorAll(".availability-scale span");
            scaleLabels[0].textContent = hourLabel(OPEN_HOUR);
            scaleLabels[1].textContent = hourLabel(OPEN_HOUR + Math.floor(openHours.length / 2));
            scaleLabels[2].textContent = hourLabel(CLOSE_HOUR);
            const fragment = document.createDocumentFragment();
            openHours.forEach((hour) => {
                const slot = document.createElement("span");
                const isPastHour = date === todayKey && hour <= currentHour;
                const status = booked.has(hour) ? "is-booked" : isPastHour ? "is-past" : "is-free";
                slot.className = `availability-slot ${status}`;
                slot.title = `${hourLabel(hour)} – ${hourLabel(hour + 1)} · ${booked.has(hour) ? "จองแล้ว" : isPastHour ? "หมดเวลา" : "ว่าง"}`;
                slot.setAttribute("aria-label", slot.title);
                fragment.append(slot);
            });
            preview.replaceChildren(fragment);
            preview.setAttribute("aria-busy", "false");
        } catch (error) {
            if (request !== previewRequest) {
                return;
            }
            const message = document.createElement("span");
            message.className = "availability-error";
            message.textContent = "โหลดข้อมูลช่วงเวลาว่างไม่สำเร็จ";
            message.title = error.message;
            message.setAttribute("role", "alert");
            preview.replaceChildren(message);
            preview.parentElement.querySelector(".availability-date-label").textContent =
                "โหลดข้อมูลช่วงว่างไม่สำเร็จ";
            preview.setAttribute("aria-busy", "false");
        }
    }));
}

async function refreshActiveCourtDate() {
    selectedHours = [];
    bookingMessage.hidden = true;
    updateSlotHeadingDate();
    confirmButton.disabled = true;
    timeline.replaceChildren();
    if (await loadSlots()) {
        confirmButton.disabled = false;
        renderTimeline();
    }
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
        return myBookedHours.has(hour) ? "ของคุณ" : "ไม่ว่าง";
    }
    return isPast(hour) ? "หมดเวลา" : null;
}

function showBookingMessage(message, type) {
    bookingMessage.textContent = message;
    bookingMessage.className = `booking-message is-${type}`;
    bookingMessage.hidden = false;
}

function textSpan(className, text) {
    const span = document.createElement("span");
    span.className = className;
    span.textContent = text;
    return span;
}

// One row per hour: the hour on its line, then a slot that says whether it's free.
function slotRow(hour, slot) {
    const row = document.createElement("div");
    row.className = "slot-row";
    const label = textSpan("slot-hour", hourLabel(hour));
    label.setAttribute("aria-hidden", "true");
    const cell = document.createElement("div");
    cell.className = "slot-cell";
    if (slot) {
        cell.append(slot);
    } else {
        row.classList.add("slot-row-end");
    }
    row.append(label, cell);
    return row;
}

function renderTimeline() {
    const rows = openHours.map((hour) => {
        const slot = document.createElement("button");
        slot.type = "button";
        slot.dataset.hour = hour;
        const range = rangeLabel(hour, 1);
        const unavailable = unavailableLabel(hour);
        let status;
        if (unavailable) {
            slot.className = `time-slot ${myBookedHours.has(hour) ? "is-mine" : "is-taken"}`;
            slot.disabled = true;
            status = unavailable;
        } else if (selectedHours.includes(hour)) {
            slot.className = "time-slot is-selected";
            slot.setAttribute("aria-pressed", "true");
            slot.addEventListener("click", () => unpickHour(hour));
            status = "เลือกแล้ว ✓";
        } else {
            slot.className = "time-slot is-free";
            slot.setAttribute("aria-pressed", "false");
            slot.addEventListener("click", () => pickHour(hour));
            status = "ว่าง";
        }
        slot.setAttribute("aria-label", `${hourLabel(hour)} ถึง ${hourLabel(hour + 1)} ${status}`);
        slot.append(textSpan("slot-time", range), textSpan("slot-status", status));
        return slotRow(hour, slot);
    });
    timeline.replaceChildren(...rows, slotRow(CLOSE_HOUR, null));
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
    const picked = selectedHours.length;
    timeSummary.textContent = picked
        ? ranges.map(({ start, length }) => rangeLabel(start, length)).join(", ")
        : "ยังไม่ได้เลือก";
    timeSummary.classList.toggle("is-empty", picked === 0);
    selectionLimit.textContent = picked
        ? `${longDateLabel(selectedDate)} · ${picked} ชม.`
        : `แตะช่วงที่ว่าง เลือกได้รวมไม่เกิน ${MAX_HOURS_PER_DAY} ชม./วัน`;

    const used = usedQuota();
    quotaLabel.textContent = selectedDate === todayKey ? "โควตาวันนี้" : "โควตาวันที่เลือก";
    quotaValue.textContent = `${used + picked}/${MAX_HOURS_PER_DAY} ชม.`;
    [...quotaBar.children].forEach((segment, index) => {
        segment.classList.toggle("is-used", index < used);
        segment.classList.toggle("is-picked", index >= used && index < used + picked);
    });
    clearButton.disabled = picked === 0;
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

function clearSelectedHours() {
    selectedHours = [];
    bookingMessage.hidden = true;
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
        myBookedHours = new Set(
            data.slots
                .filter((slot) => slot.status === "booked" && slot.mine === true)
                .map((slot) => Number(slot.start.slice(0, 2)))
        );
        quotaUsed = data.quotaUsed;
        renderDateAvailability(selectedDate, data);
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
    myBookedHours = new Set();
    quotaUsed = 0;
    bookingMessage.hidden = true;
    confirmButton.disabled = true;
    modalCourtName.textContent = button.closest(".court-card").querySelector("h3").textContent;
    updateSlotHeadingDate();
    timeline.replaceChildren();
    bookingModal.showModal();
    refreshDateAvailability();

    if (!(await loadSlots())) {
        return;
    }
    confirmButton.disabled = false;
    renderTimeline();

    // Start the timeline at the first free hour.
    const firstFree = timeline.querySelector(".time-slot.is-free");
    timelineScroll.scrollTop = firstFree ? Math.max(0, firstFree.closest(".slot-row").offsetTop - 90) : 0;
}

// Each run of picked hours is one booking: [13, 14, 16] → 13:00 for 2 hours, 16:00 for 1 hour.
async function confirmBooking() {
    if (selectedHours.length === 0) {
        showBookingMessage("กรุณาเลือกช่วงเวลาที่ต้องการจอง", "error");
        return;
    }

    const completedCourtName = modalCourtName.textContent;
    const completedDate = longDateLabel(selectedDate);
    const completedRanges = groupHours(selectedHours).map(({ start, length }) => rangeLabel(start, length));
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

    successMessage.textContent = `${completedCourtName} · ${completedDate} · ${completedRanges.join(", ")}`;
    successBanner.hidden = false;
    refreshDateAvailability();
    refreshCourtPreviews();
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
clearButton.addEventListener("click", clearSelectedHours);
document.querySelector("#success-dismiss").addEventListener("click", () => {
    successBanner.hidden = true;
});

renderDateList();
selectDate(selectedDate);
