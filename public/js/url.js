export const internalScheme = "anaria:";
const looksLikeUrl = /^(?:(?:(?:\d{1,3}\.){3}\d{1,3}|\[[0-9a-f:.]+\]|[^\s/?#@]+\.[^\s/?#@.]{2,})(?::\d+)?(?:[/?#]\S*)?)$/iu;
const proxyableSchemes = new Set(["http:", "https:"]);
const isLoopback = (hostname) => {
    const host = hostname.toLowerCase().replace(/^\[|\]$/g, "");
    if (host === "localhost" || host.endsWith(".localhost"))
        return true;
    if (host === "::1" || host === "::")
        return true;
    const mapped = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/.exec(host);
    const octets = (mapped ? mapped[1] : host).split(".");
    if (octets.length !== 4)
        return false;
    if (!octets.every(part => /^\d{1,3}$/.test(part) && Number(part) < 256))
        return false;
    return Number(octets[0]) === 127 || octets.join(".") === "0.0.0.0";
};
const blockedSchemes = new Set([
    "javascript:",
    "data:",
    "vbscript:",
    "file:",
    "blob:",
    "filesystem:"
]);
// our own server hosts game files under /g/… and /src/… — those are content,
// not the app shell, so they may pass the loopback guard
const isGameContentPath = (pathname) => /^\/(?:g|src)\//.test(pathname);
// scramjet hard-refuses to proxy same-origin targets ("the site has obtained
// a reference to the real origin"). game content is served by this same
// server, so route it through the loopback alias — localhost ⇄ 127.0.0.1 —
// which keeps it cross-origin from the app shell while hitting the same box.
const aliasGameUrl = (parsed) => {
    if (!isLoopback(parsed.hostname) || !isGameContentPath(parsed.pathname))
        return parsed.href;
    if (parsed.hostname.toLowerCase() !== location.hostname.toLowerCase())
        return parsed.href; // already on the other loopback host
    parsed.hostname = location.hostname === "localhost" ? "127.0.0.1" : "localhost";
    return parsed.href;
};
// local game content opens in a plain frame instead of the scramjet session —
// scramjet's loopback path drops parse-time stylesheets and nested iframe
// navigations, which kills the portal pages under /g/… . a direct frame at the
// alias host (127.0.0.1 ⇄ localhost) loads everything natively while staying
// cross-origin from the app shell, so isolation is preserved either way.
// /src/… stays on scramjet: those pages pull external cdn assets, which must
// keep going through the proxy rather than leaking the real address.
export const isDirectGameUrl = (url) => {
    try {
        const parsed = new URL(url);
        return proxyableSchemes.has(parsed.protocol) &&
            isLoopback(parsed.hostname) &&
            /^\/g\//.test(parsed.pathname);
    }
    catch {
        return false;
    }
};
export const resolveInput = (input, searchTemplate) => {
    const text = String(input ?? "").trim();
    if (!text)
        return { url: "", kind: "empty" };
    if (text.slice(0, internalScheme.length).toLowerCase() === internalScheme) {
        return { url: text, kind: "internal" };
    }
    // bare paths (/src/…, /g/…) point at content our own server serves —
    // resolve them against the current origin instead of searching for them
    if (text.startsWith("/") && !text.startsWith("//")) {
        return resolveInput(location.origin + text, searchTemplate);
    }
    if (looksLikeUrl.test(text)) {
        try {
            const parsed = new URL(`https://${text}`);
            if (isLoopback(parsed.hostname) && !isGameContentPath(parsed.pathname))
                return { url: "", kind: "blocked" };
            if (!parsed.username && !parsed.password)
                return { url: aliasGameUrl(parsed), kind: "url" };
        }
        catch { }
    }
    if (isLoopback(text.split(/[:/?#]/)[0] ?? "")) {
        const at = text.search(/[/?#]/);
        if (at >= 0 && isGameContentPath(text.slice(at))) {
            return resolveInput(`http://${text}`, searchTemplate);
        }
        return { url: "", kind: "blocked" };
    }
    if (/^[a-z][a-z0-9+.-]*:/i.test(text)) {
        try {
            const parsed = new URL(text);
            if (parsed.username ||
                parsed.password ||
                blockedSchemes.has(parsed.protocol) ||
                (proxyableSchemes.has(parsed.protocol) &&
                    isLoopback(parsed.hostname) &&
                    !isGameContentPath(parsed.pathname))) {
                return { url: "", kind: "blocked" };
            }
            return proxyableSchemes.has(parsed.protocol)
                ? { url: aliasGameUrl(parsed), kind: "url" }
                : { url: parsed.href, kind: "external" };
        }
        catch {
            return { url: "", kind: "blocked" };
        }
    }
    return {
        url: searchTemplate.replace("%s", encodeURIComponent(text)),
        kind: "search"
    };
};
export const formatForDisplay = (url) => {
    try {
        const parsed = new URL(url);
        if (parsed.protocol === internalScheme)
            return parsed.href;
        const host = parsed.host.replace(/^www\./, "");
        const rest = parsed.pathname === "/" ? "" : parsed.pathname;
        return host + rest + parsed.search + parsed.hash;
    }
    catch {
        return url;
    }
};
export const originOf = (url) => {
    try {
        return new URL(url).origin;
    }
    catch {
        return "";
    }
};
