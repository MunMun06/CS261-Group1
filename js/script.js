const thaiWeekdays = ["อา.", "จ.", "อ.", "พ.", "พฤ.", "ศ.", "ส."];
const bookingFaculty = "คณะวิทยาศาสตร์และเทคโนโลยี";
const mockUser = window.mockUser = {
    fullname: "นายกขค งง",
    faculty: "คณะวิทยาศาสตร์และเทคโนโลยี",
    email: "member@example.com",
    userBookingsByDate: {}
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
    selectedTimes = [];

    timeSlots.forEach((time) => {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "time-slot";
        button.textContent = dayBookings[time] === "booked" ? `${time} · จองแล้ว` : time;
        button.disabled = dayBookings[time] === "booked";
        button.setAttribute("aria-pressed", "false");

        button.addEventListener("click", () => {
            const selectedIndex = selectedTimes.indexOf(time);
            if (selectedIndex >= 0) {
                selectedTimes.splice(selectedIndex, 1);
                button.classList.remove("is-selected");
                button.setAttribute("aria-pressed", "false");
            } else {
                const bookedHours = mockUser.userBookingsByDate[selectedDate] ?? 0;
                if (bookedHours + selectedTimes.length >= 2) {
                    showBookingMessage("คุณใช้สิทธิ์จองเต็มโควตา 2 ชั่วโมงต่อวันแล้ว", "error");
                    return;
                }

                selectedTimes.push(time);
                button.classList.add("is-selected");
                button.setAttribute("aria-pressed", "true");
            }
            bookingMessage.hidden = true;
        });

        timeSlotsContainer.append(button);
    });
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