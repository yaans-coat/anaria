import * as storage from "./storage.js";
const text = (max = 200) => (value, fallback) => {
    const s = typeof value === "string" ? value.trim() : "";
    return s.length <= max ? s : fallback;
};
const bool = (value, fallback) => typeof value === "boolean" ? value : fallback;
const oneOf = (allowed) => (value, fallback) => allowed.includes(value) ? value : fallback;
const httpUrl = (value, fallback) => {
    const s = typeof value === "string" ? value.trim() : "";
    if (!s)
        return "";
    try {
        const url = new URL(s);
        return ["http:", "https:"].includes(url.protocol) ? url.href : fallback;
    }
    catch {
        return fallback;
    }
};
const searchTemplate = (value, fallback) => {
    const s = typeof value === "string" ? value.trim() : "";
    if (!s.includes("%s"))
        return fallback;
    try {
        const probe = new URL(s.replaceAll("%s", "test"));
        return ["http:", "https:"].includes(probe.protocol) ? s : fallback;
    }
    catch {
        return fallback;
    }
};
const transportIds = [
    "libcurl",
    "epoxy",
    "bare"
];
const wispUrl = (value, fallback) => {
    const s = typeof value === "string" ? value.trim() : "";
    if (!s)
        return "";
    try {
        const url = new URL(s);
        if (!["ws:", "wss:"].includes(url.protocol))
            return fallback;
        if (url.username || url.password || url.hash || s.includes("?"))
            return fallback;
        if (location.protocol === "https:" && url.protocol !== "wss:")
            return fallback;
        if (!url.pathname.endsWith("/"))
            url.pathname += "/";
        return url.href;
    }
    catch {
        return fallback;
    }
};
export const searchEngines = [
    {
        id: "duckduckgo",
        label: "DuckDuckGo",
        template: "https://duckduckgo.com/?q=%s"
    },
    {
        id: "brave",
        label: "Brave",
        template: "https://search.brave.com/search?q=%s"
    },
    {
        id: "startpage",
        label: "Startpage",
        template: "https://www.startpage.com/sp/search?query=%s"
    },
    { id: "bing", label: "Bing", template: "https://www.bing.com/search?q=%s" },
    {
        id: "google",
        label: "Google",
        template: "https://www.google.com/search?q=%s"
    }
];
const cloakIcon = (background, text) => `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" rx="5" fill="${background}"/><text x="16" y="22" text-anchor="middle" font-family="Arial,sans-serif" font-size="18" font-weight="700" fill="white">${text}</text></svg>`)}`;
export const cloakPresets = [
    { id: "custom", label: "Custom", title: "", favicon: "" },
    {
        id: "classroom",
        label: "Google Classroom",
        title: "Classes",
        favicon: cloakIcon("#1e8e3e", "C")
    },
    {
        id: "drive",
        label: "Google Drive",
        title: "My Drive - Google Drive",
        favicon: cloakIcon("#f9ab00", "D")
    },
    {
        id: "desmos",
        label: "Desmos",
        title: "Desmos | Graphing Calculator",
        favicon: cloakIcon("#2d70b3", "D")
    },
    {
        id: "docs",
        label: "Google Docs",
        title: "Google Docs",
        favicon: cloakIcon("#4285f4", "G")
    }
];
export const sections = [
    { id: "preferences", label: "preferences" },
    { id: "appearance", label: "appearance" },
    { id: "cloaking", label: "cloaking" },
    { id: "advanced", label: "advanced" }
];
const themeIds = [
    "anaria",
    "nord",
    "frost",
    "mint",
    "cappuccino",
    "latte",
    "mocha",
    "dracula",
    "catppuccin",
    "macchiato",
    "gruvbox",
    "solarized",
    "tokyo-night",
    "monokai",
    "one-dark",
    "rose-pine",
    "everforest",
    "palenight",
    "ayu",
    "github",
    "matrix",
    "cyberpunk",
    "synthwave",
    "ocean",
    "forest",
    "sakura",
    "grape",
    "ember",
    "midnight",
    "paper"
];
const labels = (id) => id.replace(/-/g, " ");
export const themeChoices = themeIds.map(id => ({
    value: id,
    label: id === "anaria" ? "anaria (default)" : labels(id)
}));
const choice = (list) => oneOf(list.map(item => item.value));
export const schema = {
    searchEngine: {
        section: "preferences",
        label: "search engine",
        default: "https://duckduckgo.com/?q=%s",
        validate: searchTemplate,
        options: searchEngines.map(engine => ({ value: engine.template, label: engine.label })),
        help: "used when what you typed is not a url. must contain %s."
    },
    homeUrl: {
        section: "preferences",
        label: "home page",
        default: "",
        validate: httpUrl,
        help: "opened for new tabs."
    },
    uiStyle: {
        section: "preferences",
        label: "ui style",
        default: "balanced",
        validate: choice([
            { value: "minimal", label: "minimal (icons only)" },
            { value: "balanced", label: "balanced (labels on hover)" },
            { value: "detailed", label: "detailed (icons + labels)" }
        ]),
        options: [
            { value: "minimal", label: "minimal (icons only)" },
            { value: "balanced", label: "balanced (labels on hover)" },
            { value: "detailed", label: "detailed (icons + labels)" }
        ],
        help: "how much detail the dock and buttons show."
    },
    notifications: {
        section: "preferences",
        label: "notifications",
        default: false,
        validate: bool,
        help: "desktop nudges for ai replies, syncs and errors."
    },
    theme: {
        section: "appearance",
        label: "theme",
        default: "anaria",
        validate: choice(themeChoices),
        options: themeChoices,
        help: "30 themes to pick from."
    },
    animations: {
        section: "appearance",
        label: "animations",
        default: true,
        validate: bool,
        help: "turn interface motion on or off."
    },
    snow: {
        section: "appearance",
        label: "snow",
        default: true,
        validate: bool,
        help: "falling snow on the home page."
    },
    background: {
        section: "appearance",
        label: "background",
        default: true,
        validate: bool,
        help: "the looping background image behind everything (with blur)."
    },
    animSpeed: {
        section: "appearance",
        label: "animation speed",
        default: "normal",
        validate: choice([
            { value: "slow", label: "slow" },
            { value: "normal", label: "normal" },
            { value: "fast", label: "fast" }
        ]),
        options: [
            { value: "slow", label: "slow" },
            { value: "normal", label: "normal" },
            { value: "fast", label: "fast" }
        ]
    },
    cloakPreset: {
        section: "cloaking",
        label: "preset",
        default: "custom",
        validate: oneOf([
            "custom",
            "classroom",
            "drive",
            "desmos",
            "docs"
        ]),
        help: "sets the tab title and icon. choose custom to fill them in yourself."
    },
    cloakTitle: {
        section: "cloaking",
        label: "tab title",
        default: "",
        validate: text(120)
    },
    cloakFavicon: {
        section: "cloaking",
        label: "tab icon url",
        default: "",
        validate: httpUrl
    },
    panicKey: {
        section: "cloaking",
        label: "panic key",
        default: "escape",
        validate: choice([
            { value: "none", label: "off" },
            { value: "escape", label: "escape" },
            { value: "f2", label: "f2" },
            { value: "f4", label: "f4" },
            { value: "f6", label: "f6" },
            { value: "`", label: "` (backtick)" }
        ]),
        options: [
            { value: "none", label: "off" },
            { value: "escape", label: "escape" },
            { value: "f2", label: "f2" },
            { value: "f4", label: "f4" },
            { value: "f6", label: "f6" },
            { value: "`", label: "` (backtick)" }
        ],
        help: "press it twice fast to bail out to the panic url."
    },
    panicUrl: {
        section: "cloaking",
        label: "panic url",
        default: "https://www.google.com",
        validate: httpUrl,
        help: "where the panic key sends you."
    },
    saveHistory: {
        section: "advanced",
        label: "save browsing history",
        default: true,
        validate: bool
    },
    saveCookies: {
        section: "advanced",
        label: "save cookies",
        default: true,
        validate: bool,
        help: "keeps cookies so they can ride along in your cloudsync export."
    },
    preloadSearch: {
        section: "advanced",
        label: "pre-load search engine",
        default: true,
        validate: bool,
        help: "warms the search engine up on idle so it opens faster."
    },
    transport: {
        section: "advanced",
        label: "transport",
        default: "libcurl",
        validate: oneOf(transportIds),
        options: transportIds.map(id => ({ value: id, label: id })),
        help: "how requests leave your browser."
    },
    wispUrl: {
        section: "advanced",
        label: "wisp server",
        default: "",
        validate: wispUrl,
        help: "blank uses this site's own server."
    }
};
export const defaults = Object.fromEntries(Object.entries(schema).map(([key, def]) => [key, def.default]));
const storeKey = "settings";
let current = null;
const listeners = new Set();
const validate = (raw) => {
    const out = {};
    const rejected = [];
    for (const [name, entry] of Object.entries(schema)) {
        const def = entry;
        const incoming = raw?.[name];
        if (incoming === undefined) {
            out[name] = def.default;
            continue;
        }
        const invalid = Symbol(name);
        const value = def.validate(incoming, invalid);
        if (value === invalid) {
            rejected.push(name);
            out[name] = def.default;
        }
        else {
            out[name] = value;
        }
    }
    return { settings: out, rejected };
};
export const load = () => {
    if (current)
        return current;
    current = validate(storage.read(storeKey, {})).settings;
    return current;
};
export const get = (name) => load()[name];
export const all = () => ({ ...load() });
export const set = (patch) => {
    const { settings, rejected } = validate({ ...load(), ...patch });
    current = settings;
    const persisted = storage.write(storeKey, settings);
    for (const fn of listeners)
        fn(settings, rejected);
    return { settings, rejected, persisted };
};
export const reset = () => {
    current = { ...defaults };
    const persisted = storage.write(storeKey, current);
    for (const fn of listeners)
        fn(current, []);
    return { settings: current, persisted };
};
export const onChange = (fn) => {
    listeners.add(fn);
    return () => listeners.delete(fn);
};
