const thaiWeekdays = ["อา.", "จ.", "อ.", "พ.", "พฤ.", "ศ.", "ส."];

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