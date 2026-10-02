import { engine } from "./engine.js";
import { resolveInput, formatForDisplay, isDirectGameUrl } from "./url.js";
import * as settings from "./settings.js";
import * as visitLog from "./history.js";
import * as bookmarks from "./bookmarks.js";
import * as internal from "./internal.js";
import { registerInternalPages } from "./internal-pages.js";
import { applyCloak } from "./cloak.js";
import * as settingsUi from "./settings-ui.js";

const $ = (selector) => document.querySelector(selector);
const addressBar = $("#address");
const frames = $("#frames");
const status = $("#status");

// short urls — / {url}/g {url}/mov {url}/msc {url}/c {url}/a {url}/contact
// {url}/tos {url}/p {url}/dmca {url}/cloudsync {url}/settings
const pageToPath = {
    home: "/",
    games: "/g",
    movies: "/mov",
    music: "/msc",
    chat: "/c",
    ai: "/a",
    contact: "/contact",
    tos: "/tos",
    p: "/p",
    dmca: "/dmca",
    cloudsync: "/cloudsync",
    settings: "/settings"
};
const pathToPage = Object.fromEntries(Object.entries(pageToPath).map(([page, path]) => [path, page]));

let addressBarFocused = false;
addressBar.addEventListener("focus", () => (addressBarFocused = true));
addressBar.addEventListener("blur", () => (addressBarFocused = false));

registerInternalPages();

const frame = document.createElement("iframe");
frame.className = "frame frame--active";
frames.append(frame);

let session = null;
let sessionPending = null;
const state = { url: "", loading: false };
const internalHistory = new internal.InternalHistory();
const visited = [];
let visitedIndex = -1;

const record = (url) => {
    state.url = url;
    if (visited[visitedIndex] === url)
        return;
    const existing = visited.lastIndexOf(url, visitedIndex - 1);
    if (existing >= 0) {
        visitedIndex = existing;
        return;
    }
    visited.splice(visitedIndex + 1);
    visited.push(url);
    visitedIndex = visited.length - 1;
};

const canGoBack = () => visitedIndex > 0;
const canGoForward = () => visitedIndex >= 0 && visitedIndex < visited.length - 1;
const goBack = () => {
    if (!canGoBack())
        return null;
    return visited[--visitedIndex] ?? null;
};
const goForward = () => {
    if (!canGoForward())
        return null;
    return visited[++visitedIndex] ?? null;
};

/* --------------------- direct frames for local games ---------------------- */
// /g/… (already loopback-aliased by resolveInput) skips the scramjet session:
// a plain iframe at the alias host loads stylesheets and nested game iframes
// natively, while remaining cross-origin from this shell. /src/… stays on
// scramjet so its external cdn refs keep going through the proxy.
let directFrame = null;
let directActive = false;

const showDirect = (url) => {
    if (directFrame && directFrame.getAttribute("src") === url) {
        directFrame.remove();
        directFrame = null;
    }
    if (!directFrame) {
        const el = document.createElement("iframe");
        el.className = "frame";
        el.allowFullscreen = true;
        el.addEventListener("load", () => {
            if (!directActive)
                return;
            state.loading = false;
            render();
        });
        frames.append(el);
        directFrame = el;
    }
    directActive = true;
    frame.classList.remove("frame--active");
    directFrame.classList.add("frame--active");
    state.loading = true;
    directFrame.src = url;
    render();
};

const showMain = () => {
    if (!directActive)
        return;
    directActive = false;
    directFrame?.classList.remove("frame--active");
    frame.classList.add("frame--active");
};

const ensureSession = async () => {
    if (session)
        return session;
    if (sessionPending)
        return sessionPending;
    sessionPending = engine.createSession(frame, {
        url: url => {
            if (directActive || frame.srcdoc)
                return;
            record(url);
            if (settings.get("saveHistory"))
                visitLog.record(url);
            render();
        },
        loading: () => {
            if (directActive)
                return;
            state.loading = true;
            render();
        },
        ready: () => {
            if (directActive)
                return;
            state.loading = false;
            render();
        },
        error: error => {
            state.loading = false;
            setStatus(error?.message ?? String(error));
        },
        escape: url => void navigate(url)
    });
    try {
        session = await sessionPending;
    }
    finally {
        sessionPending = null;
    }
    return session;
};

const currentSession = () => session;
const currentUrl = () => state.url;
const currentTitle = () => state.url;
const isLoading = () => state.loading;

const startUrl = () => {
    const configured = settings.get("homeUrl");
    if (configured)
        return configured;
    return internal.homeUrl;
};

const searchTemplate = () => settings.get("searchEngine");

/* --------------------------- short url handling --------------------------- */

const normaliseInput = (input) => {
    if (typeof input !== "string")
        return input;
    const trimmed = input.trim();
    if (pathToPage[trimmed])
        return `anaria://${pathToPage[trimmed]}`;
    return input;
};

const syncPath = (url, options = {}) => {
    if (options.keepPath)
        return;
    const name = internal.isInternal(url) ? internal.pageName(url) : null;
    const path = name ? pageToPath[name] : null;
    if (!path)
        return;
    try {
        if (options.record === false) {
            if (location.pathname !== path)
                history.replaceState(null, "", path);
        }
        else if (location.pathname !== path) {
            history.pushState(null, "", path);
        }
    }
    catch { }
};

/* ------------------------------ settings modal ---------------------------- */

let settingsReturnPath = null;
const settingsToggle = $("#settings-toggle");

const openSettings = (category) => {
    if (settingsUi.isOpen())
        return;
    const currentPath = internal.isInternal(state.url)
        ? (pageToPath[internal.pageName(state.url)] ?? null)
        : null;
    settingsReturnPath = location.pathname === "/settings"
        ? (currentPath ?? "/")
        : location.pathname;
    if (location.pathname !== "/settings") {
        try {
            history.pushState(null, "", "/settings");
        }
        catch { }
    }
    settingsToggle.setAttribute("aria-expanded", "true");
    settingsUi.open(category, () => {
        settingsToggle.setAttribute("aria-expanded", "false");
        // only rewind the url when nothing else moved it already
        if (location.pathname === "/settings") {
            try {
                history.replaceState(null, "", settingsReturnPath || "/");
            }
            catch { }
        }
        settingsReturnPath = null;
        render();
    });
};

const closeSettings = () => settingsUi.close();

settingsToggle.addEventListener("click", () => {
    if (settingsUi.isOpen())
        closeSettings();
    else
        openSettings();
});

addEventListener("anaria:open", (event) => {
    const url = event?.detail?.url;
    if (typeof url === "string")
        void navigate(url);
});

addEventListener("anaria:action", (event) => {
    const action = event?.detail?.action;
    switch (action) {
        case "clear-history":
            setStatus(visitLog.clear()
                ? "history cleared."
                : "history cleared for this session, but browser storage is unavailable.");
            break;
        case "reset-settings":
            setStatus("settings reset.");
            break;
    }
});

/* ------------------------------ embed player ------------------------------ */
// movies (and anything internal) can ask for a proxied player that opens
// inside the current page — it gets its own scramjet session so the main
// view (and its history) stays untouched.

let embedRoot = null;
let embedSession = null;
let embedPending = null;

const closeEmbed = () => {
    if (embedRoot)
        embedRoot.hidden = true;
};

const openEmbed = async (url, title) => {
    if (!embedRoot) {
        embedRoot = document.createElement("div");
        embedRoot.className = "embed";
        embedRoot.hidden = true;
        embedRoot.innerHTML = `
			<header class="embed__head">
				<strong class="embed__title">player</strong>
				<button type="button" class="embed__close" aria-label="close player">
					<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
				</button>
			</header>
			<iframe class="embed__frame" allow="autoplay; fullscreen; encrypted-media; picture-in-picture; clipboard-write" allowfullscreen title="player"></iframe>`;
        frames.append(embedRoot);
        embedRoot.querySelector(".embed__close").addEventListener("click", closeEmbed);
    }
    embedRoot.querySelector(".embed__title").textContent = title || "player";
    embedRoot.hidden = false;
    embedPending ??= engine.createSession(embedRoot.querySelector(".embed__frame"), {
        loading: () => setStatus("Loading"),
        ready: () => {
            if (status.textContent === "Loading")
                setStatus("");
        },
        error: error => {
            setStatus(error?.message ?? String(error));
        }
    });
    try {
        if (!embedSession)
            embedSession = await embedPending;
    }
    catch (error) {
        embedPending = null;
        embedRoot.hidden = true;
        setStatus(error?.message ?? String(error));
        return;
    }
    embedSession.go(url);
};

/* -------------------------------- navigate -------------------------------- */

const navigate = async (input, options = {}) => {
    closeEmbed();
    const { url, kind } = resolveInput(normaliseInput(input), searchTemplate());
    switch (kind) {
        case "empty":
            return;
        case "blocked":
            setStatus("That address cannot be opened through the proxy.");
            return;
        case "external":
            location.assign(url);
            return;
        case "internal": {
            const name = internal.pageName(url);
            if (name === "settings") {
                openSettings();
                return;
            }
            if (settingsUi.isOpen())
                closeSettings();
            const html = internal.render(url);
            if (html === null || html.length === 0)
                return;
            if (options.record !== false) {
                internalHistory.push(url);
                record(url);
            }
            else
                state.url = url;
            showMain();
            frame.removeAttribute("src");
            // Set srcdoc only if we have valid HTML content; fall back to src attribute
            if (typeof html === "string" && html.trim().length > 0) {
                frame.srcdoc = html;
            } else {
                frame.src = "data:text/html;charset=utf-8," + encodeURIComponent(html || "");
            }
            syncPath(url, options);
            render();
            return;
        }
        default: {
            setStatus("");
            internalHistory.clear();
            if (isDirectGameUrl(url)) {
                if (options.record === false)
                    state.url = url;
                else
                    record(url);
                showDirect(url);
                render();
                return;
            }
            showMain();
            frame.removeAttribute("srcdoc");
            await ensureSession();
            if (options.record === false)
                state.url = url;
            else
                record(url);
            session.go(url);
            render();
        }
    }
};

const refreshInternalPages = (names) => {
    if (internal.isInternal(currentUrl()) &&
        names.includes(internal.pageName(currentUrl()) ?? "")) {
        void navigate(currentUrl(), { record: false });
    }
};

visitLog.onChange(() => refreshInternalPages(["history"]));
bookmarks.onChange(() => refreshInternalPages(["bookmarks"]));

addEventListener("message", event => {
    if (event.origin !== location.origin)
        return;
    if (!internal.isInternal(currentUrl()))
        return;
    if (event.source !== frame.contentWindow)
        return;
    const data = event.data;
    if (!data || typeof data !== "object")
        return;
    switch (data.type) {
        case "internal:open":
            if (typeof data.url === "string")
                void navigate(data.url);
            break;
        case "internal:embed":
            if (typeof data.url === "string")
                void openEmbed(data.url, typeof data.title === "string" ? data.title : "");
            break;
        case "internal:action":
            switch (data.action) {
                case "clear-history":
                    setStatus(visitLog.clear()
                        ? "history cleared."
                        : "history cleared for this session, but browser storage is unavailable.");
                    void navigate(currentUrl());
                    break;
                case "reset-settings": {
                    const { persisted } = settings.reset();
                    void applyTransport();
                    applyCloak();
                    window.__applyAppearance?.();
                    setStatus(persisted
                        ? "settings reset."
                        : "reset for this session, but browser storage is unavailable.");
                    void navigate(currentUrl());
                    break;
                }
            }
            break;
        case "internal:notify":
            if (!settings.get("notifications"))
                break;
            if (!("Notification" in window) || Notification.permission !== "granted")
                break;
            try {
                new Notification(String(data.title ?? "anaria"), {
                    body: String(data.body ?? ""),
                    silent: false
                });
            }
            catch { }
            break;
    }
});

/* -------------------------------- transport -------------------------------- */

const applyTransport = async () => {
    try {
        await engine.setTransport?.({
            kind: settings.get("transport"),
            wisp: settings.get("wispUrl")
        });
    }
    catch (error) {
        setStatus(`Could not switch transport: ${error.message}`);
    }
};

settings.onChange(() => {
    void applyTransport();
    applyCloak();
    window.__applyAppearance?.();
});

/* --------------------------------- render --------------------------------- */

const render = () => {
    const url = currentUrl();
    if (!addressBarFocused)
        addressBar.value = url ? formatForDisplay(url) : "";
    $("#back").disabled = !canGoBack();
    $("#forward").disabled = !canGoForward();
    $("#reload").disabled = !currentSession() && !internal.isInternal(url);
    const star = $("#bookmark");
    const bookmarkable = /^https?:/i.test(url);
    star.disabled = !bookmarkable;
    star.setAttribute("aria-pressed", String(bookmarkable ? bookmarks.has(url) : false));
    const page = internal.isInternal(url) ? internal.pageName(url) : null;
    for (const button of document.querySelectorAll(".dock__btn[data-page]")) {
        button.classList.toggle("dock__btn--active", Boolean(page) && button.dataset.page === page);
    }
    if (isLoading())
        setStatus("Loading");
    else if (status.textContent === "Loading")
        setStatus("");
};

const setStatus = (message) => {
    status.textContent = message ?? "";
    status.hidden = !message;
};

/* ------------------------------- toolbar ---------------------------------- */

$("#omnibox").addEventListener("submit", event => {
    event.preventDefault();
    addressBar.blur();
    void navigate(addressBar.value);
});
$("#back").addEventListener("click", () => {
    const url = goBack();
    if (url)
        void navigate(url, { record: false });
});
$("#forward").addEventListener("click", () => {
    const url = goForward();
    if (url)
        void navigate(url, { record: false });
});
$("#reload").addEventListener("click", () => {
    if (internal.isInternal(currentUrl())) {
        void navigate(currentUrl());
        return;
    }
    if (directActive) {
        // cross-origin frame can't be reloaded in place — recreate it
        showDirect(currentUrl());
        return;
    }
    currentSession()?.reload();
});
$("#bookmark").addEventListener("click", () => {
    const url = currentUrl();
    if (!/^https?:/i.test(url))
        return;
    bookmarks.toggle(url, currentTitle());
    render();
});
bookmarks.onChange(() => render());

/* ---------------------------------- dock ---------------------------------- */

for (const button of document.querySelectorAll(".dock [data-open]")) {
    button.addEventListener("click", () => void navigate(button.dataset.open));
}
for (const button of document.querySelectorAll(".dock [data-settings]")) {
    button.addEventListener("click", () => openSettings());
}

/* ------------------------------- panic key -------------------------------- */

let panicAt = 0;
addEventListener("keydown", (event) => {
    const configured = settings.get("panicKey");
    if (!configured || configured === "none")
        return;
    if (event.key?.toLowerCase() !== String(configured).toLowerCase())
        return;
    const now = Date.now();
    if (now - panicAt < 700) {
        panicAt = 0;
        const target = settings.get("panicUrl");
        if (target)
            location.replace(target);
    }
    else {
        panicAt = now;
    }
});

/* ----------------------------- browser history ---------------------------- */

addEventListener("popstate", () => {
    if (settingsUi.isOpen()) {
        if (location.pathname !== "/settings") {
            closeSettings();
            const page = pathToPage[location.pathname];
            if (page && `anaria://${page}` !== state.url)
                void navigate(`anaria://${page}`, { record: false });
        }
        return;
    }
    const page = pathToPage[location.pathname];
    if (!page)
        return;
    const url = `anaria://${page}`;
    if (url !== state.url)
        void navigate(url, { record: false });
});

/* ------------------------------ preload search ---------------------------- */

const warmUp = () => {
    if (!settings.get("preloadSearch"))
        return;
    const idle = window.requestIdleCallback ?? ((fn) => setTimeout(fn, 1200));
    idle(() => {
        void ensureSession();
        try {
            const origin = new URL(searchTemplate().replace("%s", "test")).origin;
            if (!document.querySelector(`link[data-preload][href="${origin}"]`)) {
                const link = document.createElement("link");
                link.rel = "preconnect";
                link.href = origin;
                link.dataset.preload = "1";
                document.head.append(link);
            }
        }
        catch { }
    });
};

/* ---------------------------------- boot ---------------------------------- */

applyCloak();

const bootPage = pathToPage[location.pathname];
if (bootPage === "settings") {
    void navigate(startUrl(), { keepPath: true });
    openSettings();
}
else if (bootPage) {
    void navigate(`anaria://${bootPage}`);
}
else {
    void navigate(startUrl());
}

void applyTransport();
engine.init().catch(() => setStatus("Could not reach the proxy backend."));
warmUp();
render();
