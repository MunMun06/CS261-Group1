// Sample data until the booking API is ready. Replace with a fetch() call.
const bookings = [
    { id: "BK-0012", court: "สนาม 1", date: "2026-10-20", time: "16:00 - 17:00", status: "upcoming" },
    { id: "BK-0011", court: "สนาม 2", date: "2026-10-18", time: "18:00 - 19:00", status: "upcoming" },
    { id: "BK-0009", court: "สนาม 1", date: "2026-10-10", time: "17:00 - 18:00", status: "completed" },
    { id: "BK-0007", court: "สนาม 3", date: "2026-10-05", time: "15:00 - 16:00", status: "cancelled" },
    { id: "BK-0004", court: "สนาม 2", date: "2026-09-28", time: "19:00 - 20:00", status: "completed" },
];

const statusLabels = {
    upcoming: "กำลังจะถึง",
    completed: "เสร็จสิ้น",
    cancelled: "ยกเลิกแล้ว",
};

const listElement = document.getElementById("history-list");
const emptyElement = document.getElementById("history-empty");
const filterTabs = document.querySelectorAll(".filter-tab");

let currentFilter = "all";

function formatDate(isoDate) {
    return new Date(isoDate).toLocaleDateString("th-TH", {
        day: "numeric",
        month: "short",
        year: "numeric",
    });
}

function createCell(content) {
    const cell = document.createElement("td");
    if (content instanceof Node) {
        cell.append(content);
    } else {
        cell.textContent = content;
    }
    return cell;
}

function createRow(booking) {
    const row = document.createElement("tr");

    const badge = document.createElement("span");
    badge.className = `status-badge is-${booking.status}`;
    badge.textContent = statusLabels[booking.status];

    let action = "";
    if (booking.status === "upcoming") {
        action = document.createElement("button");
        action.className = "cancel-button";
        action.type = "button";
        action.textContent = "ยกเลิกการจอง";
        action.addEventListener("click", () => cancelBooking(booking.id));
    }

    row.append(
        createCell(booking.id),
        createCell(booking.court),
        createCell(formatDate(booking.date)),
        createCell(booking.time),
        createCell(badge),
        createCell(action),
    );
    return row;
}

function renderHistory() {
    const visible = bookings.filter(
        (booking) => currentFilter === "all" || booking.status === currentFilter,
    );

    listElement.replaceChildren(...visible.map(createRow));
    emptyElement.hidden = visible.length > 0;
}

function cancelBooking(bookingId) {
    if (!confirm(`ต้องการยกเลิกการจอง ${bookingId} ใช่หรือไม่?`)) {
        return;
    }
    const booking = bookings.find((item) => item.id === bookingId);
    booking.status = "cancelled";
    renderHistory();
}

filterTabs.forEach((tab) => {
    tab.addEventListener("click", () => {
        currentFilter = tab.dataset.filter;
        filterTabs.forEach((other) => {
            const isActive = other === tab;
            other.classList.toggle("is-active", isActive);
            other.setAttribute("aria-selected", String(isActive));
        });
        renderHistory();
    });
});

renderHistory();
