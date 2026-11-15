// Shared by every page: the header navigation.
// Phones and tablets open the menu drawer from the hamburger button. From 1024px wide the
// header shows the same links next to the signed-in user instead, and logout sits in a
// pop-up under the user. That navigation is built here from the drawer, so each page keeps
// one copy of the links.

const DESKTOP_NAV = window.matchMedia("(min-width: 1024px)");

// The first letter to show in the avatar circle, e.g. "ภ" for "ภณวรรชน์". Thai leading
// vowels such as "เ" are skipped, so "เจ้าหน้าที่" shows "จ".
function initialOf(name) {
    return Array.from(name).find((char) => /[ก-ฮA-Za-z0-9]/.test(char)) ?? "?";
}

async function logOut() {
    try {
        await apiRequest("/api/auth/logout", { method: "POST" });
    } catch {
        // Go to the login page anyway: the session may already be gone.
    }
    window.location.href = "login.html";
}

function buildHeaderNav(menuDrawer) {
    const nav = document.createElement("nav");
    nav.className = "header-nav";
    nav.setAttribute("aria-label", "เมนูหลัก");
    for (const drawerLink of menuDrawer.querySelectorAll(".drawer-nav .drawer-link:not(.is-danger)")) {
        const link = document.createElement("a");
        link.className = "header-link";
        link.href = drawerLink.getAttribute("href");
        if (drawerLink.hasAttribute("aria-current")) {
            link.setAttribute("aria-current", "page");
        }
        const label = document.createElement("span");
        label.textContent = drawerLink.textContent.trim();
        link.append(drawerLink.querySelector(".drawer-link-icon svg").cloneNode(true), label);
        nav.append(link);
    }
    return nav;
}

// The user's profile on the right of the header. Clicking it opens a small pop-up with the
// full name, faculty, email and the logout button.
function buildHeaderAccount(menuDrawer) {
    const account = document.createElement("div");
    account.className = "header-account";
    account.innerHTML = `
        <button class="header-profile" type="button" aria-expanded="false"
                aria-controls="header-popup" aria-haspopup="true">
            <span class="header-avatar" aria-hidden="true"></span>
            <span class="header-user">
                <span class="header-user-name"></span>
                <span class="header-user-faculty"></span>
            </span>
            <svg class="header-chevron" width="16" height="16" viewBox="0 0 24 24" fill="none"
                 stroke="currentColor" stroke-width="2" stroke-linecap="round"
                 stroke-linejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>
        </button>
        <div class="header-popup" id="header-popup" hidden>
            <div class="header-popup-user">
                <span class="header-avatar" aria-hidden="true"></span>
                <span class="header-popup-text">
                    <span class="header-popup-name"></span>
                    <span class="header-popup-faculty"></span>
                    <span class="header-popup-email"></span>
                </span>
            </div>
            <button class="header-logout" type="button">ออกจากระบบ</button>
        </div>`;

    const profile = account.querySelector(".header-profile");
    const popup = account.querySelector(".header-popup");
    const logoutButton = account.querySelector(".header-logout");
    const logoutIcon = menuDrawer.querySelector(".drawer-link.is-danger .drawer-link-icon svg");
    logoutButton.prepend(logoutIcon.cloneNode(true));
    logoutButton.addEventListener("click", logOut);

    const setOpen = (open) => {
        popup.hidden = !open;
        profile.setAttribute("aria-expanded", String(open));
    };
    profile.addEventListener("click", () => setOpen(popup.hidden));

    // Close on a click anywhere else, on Esc, or when the window narrows to the hamburger.
    document.addEventListener("click", (event) => {
        if (!popup.hidden && !account.contains(event.target)) {
            setOpen(false);
        }
    });
    document.addEventListener("keydown", (event) => {
        if (event.key === "Escape" && !popup.hidden) {
            setOpen(false);
            profile.focus();
        }
    });
    DESKTOP_NAV.addEventListener("change", () => setOpen(false));

    return account;
}

function showUser(user, account) {
    document.getElementById("drawer-user-name").textContent = user.name;
    document.getElementById("drawer-user-faculty").textContent = user.faculty;
    document.getElementById("drawer-user-email").textContent = user.email;
    for (const avatar of account.querySelectorAll(".header-avatar")) {
        avatar.textContent = initialOf(user.name);
    }
    account.querySelector(".header-user-name").textContent = user.name;
    account.querySelector(".header-user-faculty").textContent = user.faculty;
    account.querySelector(".header-popup-name").textContent = user.name;
    account.querySelector(".header-popup-faculty").textContent = user.faculty;
    account.querySelector(".header-popup-email").textContent = user.email;
    account.querySelector(".header-profile").setAttribute("aria-label", `บัญชีผู้ใช้: ${user.name}`);
    account.classList.add("is-loaded");
}

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

    // Widening the window to desktop hides the hamburger, so close a drawer left open.
    DESKTOP_NAV.addEventListener("change", (event) => {
        if (event.matches && menuDrawer.open) {
            menuDrawer.close();
        }
    });

    const drawerLogout = menuDrawer.querySelector(".drawer-link.is-danger");
    drawerLogout.addEventListener("click", (event) => {
        event.preventDefault();
        logOut();
    });

    const account = buildHeaderAccount(menuDrawer);
    const divider = document.createElement("span");
    divider.className = "header-divider";
    divider.setAttribute("aria-hidden", "true");
    menuButton.before(buildHeaderNav(menuDrawer), divider, account);

    // Signed out: apiRequest sends the browser to the login page.
    apiRequest("/api/auth/me")
        .then((user) => showUser(user, account))
        .catch(() => {});
}

setUpMenu();
