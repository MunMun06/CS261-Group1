const thaiWeekdays = ["อา.", "จ.", "อ.", "พ.", "พฤ.", "ศ.", "ส."];
const bookingFaculty = "คณะวิทยาศาสตร์และเทคโนโลยี";
const mockUser = window.mockUser = {
    fullname: "นายกขค งง",
    faculty: "คณะวิทยาศาสตร์และเทคโนโลยี",
    email: "member@dome.tu.ac.th",
    userBookingsByDate: {}
};
const timeSlots = Array.from({ length: 6 }, (_, index) => {
    const startHour = 13 + index;
    return `${String(startHour).padStart(2, "0")}:00 - ${String(startHour + 1).padStart(2, "0")}:00`;
});
const mockSlots = window.mockSlots = {
    "court-1": {},
    "court-2": {}
};

function toDateKey(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
}

const todayKey = toDateKey(new Date());
let selectedDate = todayKey;
let selectedCourt = null;
let selectedTimes = [];

function renderDateList() {
    const dateList = document.querySelector("#date-list");
    const today = new Date();

    for (let offset = 0; offset < 7; offset += 1) {
        const date = new Date(today);
        date.setDate(today.getDate() + offset);

        const button = document.createElement("button");
        const weekday = thaiWeekdays[date.getDay()];
        button.type = "button";
        button.className = "date-button";
        button.dataset.date = toDateKey(date);
        button.setAttribute("aria-pressed", offset === 0 ? "true" : "false");
        button.setAttribute(
            "aria-label",
            `${weekday} ${date.toLocaleDateString("th-TH", { day: "numeric", month: "long" })}`
        );
        if (offset === 0) {
            button.classList.add("is-selected");
        }

        const weekdayLabel = document.createElement("span");
        weekdayLabel.className = "date-weekday";
        weekdayLabel.textContent = weekday;

        const dateNumber = document.createElement("span");
        dateNumber.className = "date-number";
        dateNumber.textContent = date.getDate();

        button.append(weekdayLabel, dateNumber);
        button.addEventListener("click", () => {
            selectDateButton(button);
        });

        dateList.append(button);
    }
}

function selectDateButton(selectedButton) {
    selectedDate = selectedButton.dataset.date;
    document.querySelectorAll(".date-button").forEach((dateButton) => {
        const isSelected = dateButton === selectedButton;
        dateButton.classList.toggle("is-selected", isSelected);
        dateButton.setAttribute("aria-pressed", String(isSelected));
    });
}

renderDateList();

document.querySelector("#user-fullname").textContent = mockUser.fullname;
document.querySelector("#user-faculty").textContent = mockUser.faculty;
document.querySelector("#user-email").textContent = mockUser.email;
document.querySelector("#drawer-fullname").textContent = mockUser.fullname;
document.querySelector("#drawer-faculty").textContent = mockUser.faculty;
document.querySelector("#drawer-email").textContent = mockUser.email;

const mobileMenuToggle = document.querySelector("#mobile-menu-toggle");
const mobileMenuDrawer = document.querySelector("#mobile-menu-drawer");
const mobileMenuBackdrop = document.querySelector("#mobile-menu-backdrop");

function setMobileMenuOpen(isOpen) {
    mobileMenuToggle.setAttribute("aria-expanded", String(isOpen));
    mobileMenuToggle.setAttribute("aria-label", isOpen ? "ปิดเมนู" : "เปิดเมนู");
    mobileMenuDrawer.setAttribute("aria-hidden", String(!isOpen));
    mobileMenuDrawer.inert = !isOpen;
    mobileMenuDrawer.classList.toggle("is-open", isOpen);
    mobileMenuBackdrop.classList.toggle("is-visible", isOpen);
    document.body.classList.toggle("mobile-menu-open", isOpen);

    if (isOpen) {
        document.querySelector("#mobile-menu-close").focus();
    } else {
        mobileMenuToggle.focus();
    }
}

mobileMenuToggle.addEventListener("click", () => setMobileMenuOpen(true));
document.querySelector("#mobile-menu-close").addEventListener("click", () => setMobileMenuOpen(false));
mobileMenuBackdrop.addEventListener("click", () => setMobileMenuOpen(false));
document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && mobileMenuDrawer.classList.contains("is-open")) {
        setMobileMenuOpen(false);
    }
});

const bookingModal = document.querySelector("#booking-modal");
const modalCourtName = document.querySelector("#modal-court-name");
const modalBookingDate = document.querySelector("#modal-booking-date");
const timeSlotsContainer = document.querySelector("#time-slots");
const bookingMessage = document.querySelector("#booking-message");
const timeSummary = document.querySelector("#time-summary");
const timelineHours = document.querySelector("#timeline-hours");

timeSlots.forEach((time) => {
    const hourLabel = document.createElement("span");
    hourLabel.className = "timeline-hour";
    hourLabel.textContent = time.slice(0, 5);
    timelineHours.append(hourLabel);
});
const endHourLabel = document.createElement("span");
endHourLabel.className = "timeline-hour timeline-hour-end";
endHourLabel.textContent = timeSlots.at(-1).slice(8, 13);
timelineHours.append(endHourLabel);

function showBookingMessage(message, type) {
    bookingMessage.textContent = message;
    bookingMessage.className = `booking-message is-${type}`;
    bookingMessage.hidden = false;
}

function getSlotIndex(time) {
    return timeSlots.indexOf(time);
}

function formatSlotRange(startIndex, length) {
    const start = timeSlots[startIndex].slice(0, 5);
    const end = timeSlots[startIndex + length - 1].slice(8, 13);
    return `${start} - ${end}`;
}

function updateTimeSummary() {
    if (selectedTimes.length === 0) {
        timeSummary.textContent = "ยังไม่ได้เลือกเวลา";
        return;
    }

    const indices = selectedTimes.map(getSlotIndex).sort((first, second) => first - second);
    const ranges = [];
    let rangeStart = indices[0];
    let previous = indices[0];

    indices.slice(1).forEach((index) => {
        if (index !== previous + 1) {
            ranges.push({ start: rangeStart, length: previous - rangeStart + 1 });
            rangeStart = index;
        }
        previous = index;
    });
    ranges.push({ start: rangeStart, length: previous - rangeStart + 1 });

    timeSummary.textContent = ranges
        .map(({ start, length }) => `${formatSlotRange(start, length)} (${length} ชม.)`)
        .join(", ");
}

function createTimelineSlot({ startIndex, length, booked = false, selected = false, onClick }) {
    const button = document.createElement("button");
    const range = formatSlotRange(startIndex, length);
    button.type = "button";
    button.className = "time-slot";
    button.style.gridRow = `${startIndex + 1} / span ${length}`;
    button.setAttribute("aria-pressed", String(selected));

    if (booked) {
        button.textContent = `${range} · จองแล้ว`;
        button.disabled = true;
    } else {
        const content = document.createElement("span");
        content.className = "time-slot-content";

        const text = document.createElement("span");
        text.className = "time-slot-text";

        const status = document.createElement("strong");
        status.className = "time-slot-status";
        status.textContent = selected ? range : "ว่าง";

        const detail = document.createElement("span");
        detail.className = "time-slot-detail";
        detail.textContent = selected
            ? `${length} ชม. · แตะเพื่อ${length > 1 ? "ลดเวลา" : "ยกเลิก"}`
            : range;

        const icon = document.createElement("span");
        icon.className = `time-slot-icon${selected ? " is-check" : ""}`;
        icon.setAttribute("aria-hidden", "true");
        icon.textContent = selected ? "✓" : "+";

        text.append(status, detail);
        content.append(text, icon);
        button.append(content);

        if (selected) {
            button.classList.add("is-selected");
        }
        button.addEventListener("click", onClick);
    }

    timeSlotsContainer.append(button);
}

function renderTimeSlots() {
    const courtBookings = mockSlots[selectedCourt] ?? {};
    const dayBookings = courtBookings[selectedDate] ?? {};
    timeSlotsContainer.replaceChildren();
    let index = 0;

    while (index < timeSlots.length) {
        const currentTime = timeSlots[index];
        const isBooked = dayBookings[currentTime] === "booked";
        const isSelected = selectedTimes.includes(currentTime);
        let span = 1;

        if (isBooked || isSelected) {
            while (index + span < timeSlots.length) {
                const nextTime = timeSlots[index + span];
                const sameState = isBooked
                    ? dayBookings[nextTime] === "booked"
                    : selectedTimes.includes(nextTime) && dayBookings[nextTime] !== "booked";
                if (!sameState) {
                    break;
                }
                span += 1;
            }
        }

        const chosenSlots = timeSlots.slice(index, index + span);
        createTimelineSlot({
            startIndex: index,
            length: span,
            booked: isBooked,
            selected: isSelected,
            onClick: () => {
                if (isSelected) {
                    const timeToRemove = chosenSlots.at(-1);
                    selectedTimes = selectedTimes.filter((time) => time !== timeToRemove);
                } else {
                    const bookedHours = mockUser.userBookingsByDate[selectedDate] ?? 0;
                    if (bookedHours + selectedTimes.length >= 2) {
                        showBookingMessage("คุณใช้สิทธิ์จองเต็มโควตา 2 ชั่วโมงต่อวันแล้ว", "error");
                        return;
                    }
                    selectedTimes.push(currentTime);
                }

                bookingMessage.hidden = true;
                renderTimeSlots();
            }
        });
        index += span;
    }

    updateTimeSummary();
}

document.querySelectorAll(".btn-select-court").forEach((button) => {
    button.addEventListener("click", () => {
        if (mockUser.faculty !== bookingFaculty) {
            alert("ขออภัย: สงวนสิทธิ์การจองสนามสำหรับนักศึกษาคณะวิทยาศาสตร์และเทคโนโลยีเท่านั้น");
            return;
        }

        selectedCourt = button.dataset.court;
        selectedTimes = [];
        bookingMessage.hidden = true;
        document.querySelector("#confirm-booking").disabled = false;
        modalCourtName.textContent = button.closest(".court-card").querySelector("h3").textContent;
        const selectedDateObject = new Date(`${selectedDate}T00:00:00`);
        modalBookingDate.textContent = `${selectedDateObject.toLocaleDateString("en-US", {
            weekday: "short",
            day: "numeric",
            month: "short"
        })} · 13:00 - 19:00`;
        renderTimeSlots();
        bookingModal.showModal();
    });
});

document.querySelector("#modal-close").addEventListener("click", () => bookingModal.close());

document.querySelector("#confirm-booking").addEventListener("click", () => {
    if (mockUser.faculty !== bookingFaculty) {
        showBookingMessage(
            "ขออภัย: สงวนสิทธิ์การจองสนามสำหรับนักศึกษาคณะวิทยาศาสตร์และเทคโนโลยีเท่านั้น",
            "error"
        );
        return;
    }

    if (selectedTimes.length === 0) {
        showBookingMessage("กรุณาเลือกช่วงเวลาที่ต้องการจอง", "error");
        return;
    }

    mockSlots[selectedCourt][selectedDate] ??= {};
    selectedTimes.forEach((time) => {
        mockSlots[selectedCourt][selectedDate][time] = "booked";
    });
    mockUser.userBookingsByDate[selectedDate] =
        (mockUser.userBookingsByDate[selectedDate] ?? 0) + selectedTimes.length;
    renderTimeSlots();
    showBookingMessage("จองสนามสำเร็จเรียบร้อยแล้ว!", "success");
    document.querySelector("#confirm-booking").disabled = true;
    timeSlotsContainer.querySelectorAll(".time-slot").forEach((button) => {
        button.disabled = true;
    });
    window.setTimeout(() => bookingModal.close(), 1200);
});