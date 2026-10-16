const thaiWeekdays = ["อา.", "จ.", "อ.", "พ.", "พฤ.", "ศ.", "ส."];
const bookingFaculty = "คณะวิทยาศาสตร์และเทคโนโลยี";
const mockUser = window.mockUser = {
    fullname: "นายกขค งง",
    faculty: bookingFaculty,
    email: "member@example.com"
};
const timeSlots = ["16:00 - 17:00", "17:00 - 18:00", "18:00 - 19:00", "19:00 - 20:00"];
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
mockSlots["court-1"][todayKey] = { "17:00 - 18:00": "booked" };
mockSlots["court-2"][todayKey] = { "19:00 - 20:00": "booked" };

let selectedDate = todayKey;
let selectedCourt = null;
let selectedTime = null;

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
            selectedDate = button.dataset.date;
            dateList.querySelectorAll(".date-button").forEach((dateButton) => {
                const isSelected = dateButton === button;
                dateButton.classList.toggle("is-selected", isSelected);
                dateButton.setAttribute("aria-pressed", String(isSelected));
            });
        });

        dateList.append(button);
    }
}

renderDateList();

document.querySelector("#user-fullname").textContent = mockUser.fullname;
document.querySelector("#user-faculty").textContent = mockUser.faculty;
document.querySelector("#user-email").textContent = mockUser.email;

const bookingModal = document.querySelector("#booking-modal");
const modalCourtName = document.querySelector("#modal-court-name");
const modalBookingDate = document.querySelector("#modal-booking-date");
const timeSlotsContainer = document.querySelector("#time-slots");
const bookingMessage = document.querySelector("#booking-message");

function showBookingMessage(message, type) {
    bookingMessage.textContent = message;
    bookingMessage.className = `booking-message is-${type}`;
    bookingMessage.hidden = false;
}

function renderTimeSlots() {
    const courtBookings = mockSlots[selectedCourt] ?? {};
    const dayBookings = courtBookings[selectedDate] ?? {};
    timeSlotsContainer.replaceChildren();
    selectedTime = null;

    timeSlots.forEach((time) => {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "time-slot";
        button.textContent = dayBookings[time] === "booked" ? `${time} · จองแล้ว` : time;
        button.disabled = dayBookings[time] === "booked";

        button.addEventListener("click", () => {
            selectedTime = time;
            timeSlotsContainer.querySelectorAll(".time-slot").forEach((slotButton) => {
                slotButton.classList.toggle("is-selected", slotButton === button);
                slotButton.setAttribute("aria-pressed", String(slotButton === button));
            });
            bookingMessage.hidden = true;
        });

        timeSlotsContainer.append(button);
    });
}

document.querySelectorAll(".btn-select-court").forEach((button) => {
    button.addEventListener("click", () => {
        selectedCourt = button.dataset.court;
        selectedTime = null;
        bookingMessage.hidden = true;
        modalCourtName.textContent = button.closest(".court-card").querySelector("h3").textContent;
        modalBookingDate.textContent = new Date(`${selectedDate}T00:00:00`).toLocaleDateString("th-TH", {
            weekday: "long",
            day: "numeric",
            month: "long",
            year: "numeric"
        });
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

    if (!selectedTime) {
        showBookingMessage("กรุณาเลือกช่วงเวลาที่ต้องการจอง", "error");
        return;
    }

    mockSlots[selectedCourt][selectedDate] ??= {};
    mockSlots[selectedCourt][selectedDate][selectedTime] = "booked";
    renderTimeSlots();
    bookingModal.close();
});