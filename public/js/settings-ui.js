import * as settings from "./settings.js";
import { applyCloak, cloakValues } from "./cloak.js";
import { collect, download } from "./export.js";

const icons = {
    preferences: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14.7 6.3a4.5 4.5 0 0 0-6 5.6L3 17.6V21h3.4l5.7-5.7a4.5 4.5 0 0 0 5.6-6l-2.9 2.9-2.5-.5-.5-2.5 2.9-2.9z"/></svg>`,
    appearance: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M17.6 2.4l4 4-9.9 9.9-4-4 9.9-9.9zM7.6 12.4L4 16c-.8.8-.8 2.1 0 2.9l1.6 1.6c.8.8 2.1.8 2.9 0l3.6-3.6-4.5-4.5z"/></svg>`,
    cloaking: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2a8 8 0 0 0-8 8v11l2.5-2 2.5 2 2.5-2 2.5 2 2.5-2 2.5 2V10a8 8 0 0 0-8-8zm-3.2 8.2a1.6 1.6 0 1 1 0-3.2 1.6 1.6 0 0 1 0 3.2zm6.4 0a1.6 1.6 0 1 1 0-3.2 1.6 1.6 0 0 1 0 3.2z"/></svg>`,
    advanced: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M13.6 2.2l8.2 8.2-2.4 2.4-2-2-3.3 3.3 1.4 4.4-2.1 2.1-8.6-8.6 2.1-2.1 4.4 1.4 3.3-3.3-2-2 2.4-2.4 4.6 4.6-1 1 1.9 1.9 1-1 1.6 1.6-1.9 1.9-6-6-3.4 3.4 2.7 2.7-2.6 2.6-5.7-5.7 2.6-2.6 2.7 2.7 3.4-3.4-4.4-4.4L13.6 2.2z"/></svg>`,
    credits: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21s-8-4.9-8-11a4.5 4.5 0 0 1 8-2.8A4.5 4.5 0 0 1 20 10c0 6.1-8 11-8 11z"/></svg>`,
    close: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>`
};

const categories = [
    { id: "preferences", label: "preferences" },
    { id: "appearance", label: "appearance" },
    { id: "cloaking", label: "cloaking" },
    { id: "advanced", label: "advanced" },
    { id: "credits", label: "credits" }
];

const creditsText = `credits!

lyra.zip - inspo for anaria which lyra was formley waves which was inspo blackwaves
selenite.cc - ui/ux inspo
GitHub - html5 games and also other ubgs
bog from truffled.lol - gave me the help and support i needed
gmshelf - the game sources (seraph, truffled, ckv, ugs)
x8rr/music - the music backend

official repo - github.com/yaans-coat/anariav3

that's it! bye! (˶>⩊<˶)'`;

let root = null;
let content = null;
let activeCategory = "preferences";
let lastPath = null;
let closeHandler = null;

const escapeHtml = (value) => String(value).replace(/[&<>"']/g, char => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
})[char]);

const controlFor = (name, def, value) => {
    const id = `settings-${name}`;
    if (def.options) {
        return `<select id="${id}" data-setting="${name}">${def.options
            .map(option => `<option value="${escapeHtml(option.value)}"${option.value === value ? " selected" : ""}>${escapeHtml(option.label)}</option>`)
            .join("")}</select>`;
    }
    if (typeof def.default === "boolean") {
        return `<button type="button" class="switch${value ? " switch--on" : ""}" role="switch"
			aria-checked="${value ? "true" : "false"}" data-setting="${name}" data-bool="1">
			<span class="switch__knob"></span>
		</button>`;
    }
    const type = ["homeUrl", "wispUrl", "cloakFavicon", "panicUrl"].includes(name) ? "url" : "text";
    return `<input id="${id}" type="${type}" data-setting="${name}" value="${escapeHtml(value ?? "")}"
		autocomplete="off" spellcheck="false">`;
};

const fieldRow = (name, def) => {
    const current = settings.get(name);
    return `<div class="field">
		<label for="settings-${name}">${escapeHtml(def.label)}</label>
		<div class="field__control">${controlFor(name, def, current)}</div>
		${def.help ? `<p class="field__help">${escapeHtml(def.help)}</p>` : ""}
	</div>`;
};

const renderCloakingExtra = () => {
    const { title, favicon } = cloakValues();
    return `<div class="actions">
		<button type="button" data-blank="about:blank" data-cloak-title="${escapeHtml(title)}" data-cloak-favicon="${escapeHtml(favicon)}">open in about:blank</button>
		<button type="button" data-blank="blob" data-cloak-title="${escapeHtml(title)}" data-cloak-favicon="${escapeHtml(favicon)}">open as blob</button>
	</div>`;
};

const renderAdvancedExtra = () => `<div class="actions">
	<button type="button" data-go="anaria://history">history</button>
	<button type="button" data-go="anaria://bookmarks">bookmarks</button>
	<button type="button" data-action="export-data">download my data</button>
	<button type="button" data-action="clear-history">clear history</button>
	<button type="button" data-action="reset-settings">reset settings</button>
</div>`;

const renderCategory = (id) => {
    if (id === "credits") {
        return `<div class="credits">
			<pre>${escapeHtml(creditsText)}</pre>
			<p class="credits__sign">- desooo - yaans 2026</p>
		</div>`;
    }
    const def = settings.schema;
    const rows = Object.entries(def)
        .filter(([, entry]) => entry.section === id)
        .map(([name, entry]) => fieldRow(name, entry))
        .join("");
    const extra = id === "cloaking"
        ? renderCloakingExtra()
        : id === "advanced"
            ? renderAdvancedExtra()
            : "";
    return `<form data-live-form>${rows}${extra}</form>`;
};

const refresh = () => {
    content.innerHTML = renderCategory(activeCategory);
    for (const button of root.querySelectorAll(".settings-modal__nav button")) {
        button.classList.toggle("modal__nav-item--active", button.dataset.cat === activeCategory);
    }
};

const applySideEffects = (name) => {
    window.__applyAppearance?.();
    if (["cloakPreset", "cloakTitle", "cloakFavicon"].includes(name))
        applyCloak();
    if (name === "notifications" && settings.get("notifications") &&
        "Notification" in window && Notification.permission === "default") {
        void Notification.requestPermission().catch(() => { });
    }
};

const onLiveChange = (target) => {
    const name = target.dataset.setting;
    if (!name || !(name in settings.schema))
        return;
    let value;
    if (target.dataset.bool) {
        value = target.getAttribute("aria-checked") !== "true";
    }
    else {
        value = target.value;
    }
    const { rejected } = settings.set({ [name]: value });
    if (rejected.length) {
        target.value = settings.get(name);
    }
    if (target.dataset.bool) {
        const next = settings.get(name);
        target.setAttribute("aria-checked", String(next));
        target.classList.toggle("switch--on", next);
    }
    applySideEffects(name);
};

const openBlank = (kind, title, favicon) => {
    const src = location.href;
    const fill = (doc) => {
        doc.title = title || "new tab";
        doc.body.replaceChildren();
        if (favicon) {
            const link = doc.createElement("link");
            link.rel = "icon";
            link.href = favicon;
            doc.head.append(link);
        }
        const style = doc.createElement("style");
        style.textContent = "html,body{margin:0;height:100%;overflow:hidden;background:#0b0b0f}iframe{width:100%;height:100%;border:0;display:block}";
        doc.head.append(style);
        const frame = doc.createElement("iframe");
        frame.src = src;
        frame.allow = "autoplay; fullscreen; clipboard-read; clipboard-write";
        doc.body.append(frame);
    };
    if (kind === "about:blank") {
        const tab = window.open("about:blank", "_blank");
        if (tab)
            fill(tab.document);
        else
            close();
        return;
    }
    const doc = document.implementation.createHTMLDocument(title || "new tab");
    fill(doc);
    const url = URL.createObjectURL(new Blob(["<!doctype html>" + doc.documentElement.outerHTML], { type: "text/html" }));
    const tab = window.open(url, "_blank");
    if (!tab) {
        URL.revokeObjectURL(url);
        close();
    }
};

const wireEvents = () => {
    root.querySelector(".settings-modal__close").addEventListener("click", () => close());
    root.querySelector(".settings-modal__backdrop").addEventListener("click", () => close());
    for (const button of root.querySelectorAll(".settings-modal__nav button")) {
        button.addEventListener("click", () => {
            activeCategory = button.dataset.cat;
            refresh();
        });
    }
    content.addEventListener("click", (event) => {
        const blank = event.target.closest("[data-blank]");
        if (blank) {
            openBlank(blank.dataset.blank, blank.dataset.cloakTitle, blank.dataset.cloakFavicon);
            return;
        }
        const go = event.target.closest("[data-go]");
        if (go) {
            close();
            window.dispatchEvent(new CustomEvent("anaria:open", { detail: { url: go.dataset.go } }));
            return;
        }
        const toggle = event.target.closest("[data-bool]");
        if (toggle) {
            onLiveChange(toggle);
            return;
        }
        const action = event.target.closest("[data-action]");
        if (action) {
            runAction(action.dataset.action);
        }
    });
    content.addEventListener("change", (event) => {
        const target = event.target.closest("[data-setting]");
        if (target && !target.dataset.bool)
            onLiveChange(target);
    });
    content.addEventListener("submit", (event) => event.preventDefault());
    addEventListener("keydown", (event) => {
        if (event.key === "Escape" && isOpen())
            close();
    });
};

const runAction = (action) => {
    switch (action) {
        case "export-data":
            download("anaria-data.json", collect());
            break;
        case "clear-history":
            window.dispatchEvent(new CustomEvent("anaria:action", { detail: { action: "clear-history" } }));
            break;
        case "reset-settings":
            settings.reset();
            window.__applyAppearance?.();
            applyCloak();
            window.dispatchEvent(new CustomEvent("anaria:action", { detail: { action: "reset-settings" } }));
            refresh();
            break;
    }
};

const ensure = () => {
    if (root)
        return;
    root = document.createElement("div");
    root.className = "settings-modal";
    root.hidden = true;
    root.innerHTML = `
		<div class="settings-modal__backdrop"></div>
		<div class="settings-modal__panel" role="dialog" aria-modal="true" aria-label="settings">
			<header class="settings-modal__head">
				<strong>settings</strong>
				<button type="button" class="settings-modal__close" aria-label="close">${icons.close}</button>
			</header>
			<div class="settings-modal__body">
				<nav class="settings-modal__nav">
					${categories.map((category, index) => `
						<button type="button" data-cat="${category.id}"${index === 0 ? ` class="modal__nav-item--active"` : ""}>
							${icons[category.id]}
							<span>${category.label}</span>
						</button>`).join("")}
				</nav>
				<div class="settings-modal__content"></div>
			</div>
		</div>`;
    document.body.append(root);
    content = root.querySelector(".settings-modal__content");
    wireEvents();
};

export const isOpen = () => Boolean(root && !root.hidden);

export const open = (category = "preferences", onClosed = null) => {
    ensure();
    activeCategory = categories.some(item => item.id === category) ? category : "preferences";
    closeHandler = onClosed;
    lastPath = location.pathname;
    refresh();
    root.hidden = false;
    document.documentElement.dataset.settings = "open";
    content.querySelector("select, input, button")?.focus?.();
};

export const close = () => {
    if (!root || root.hidden)
        return;
    root.hidden = true;
    delete document.documentElement.dataset.settings;
    const handler = closeHandler;
    closeHandler = null;
    handler?.();
};

export default { open, close, isOpen };
