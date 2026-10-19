// Shared by every page: the menu drawer that opens from the header's hamburger button.

// Sample signed-in user until login is ready.
const currentUser = {
    name: "ภณวรรชน์ โขงเขตต์",
    faculty: "คณะวิทยาศาสตร์และเทคโนโลยี",
    email: "stu6409****@dome.tu.ac.th",
};

function setUpMenu() {
    const menuButton = document.getElementById("menu-button");
    const menuDrawer = document.getElementById("menu-drawer");

    menuButton.addEventListener("click", () => {
        menuDrawer.showModal();
        menuButton.setAttribute("aria-expanded", "true");
    });
    document.getElementById("drawer-close").addEventListener("click", () => menuDrawer.close());

    // The panel fills the dialog, so a click on the dialog itself landed on the backdrop.
    menuDrawer.addEventListener("click", (event) => {
        if (event.target === menuDrawer) {
            menuDrawer.close();
        }
    });

    // Also fires when Esc closes the drawer.
    menuDrawer.addEventListener("close", () => menuButton.setAttribute("aria-expanded", "false"));

    document.getElementById("drawer-user-name").textContent = currentUser.name;
    document.getElementById("drawer-user-faculty").textContent = currentUser.faculty;
    document.getElementById("drawer-user-email").textContent = currentUser.email;
}

setUpMenu();
