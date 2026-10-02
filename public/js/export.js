import * as settings from "./settings.js";
import * as visitLog from "./history.js";
import * as bookmarks from "./bookmarks.js";

const readRaw = (name) => {
    try {
        const raw = localStorage.getItem(`anaria:${name}`);
        if (raw === null)
            return null;
        const parsed = JSON.parse(raw);
        return parsed && typeof parsed === "object" && "__v" in parsed
            ? parsed.value
            : parsed;
    }
    catch {
        return null;
    }
};

const localNames = () => {
    const names = [];
    try {
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key?.startsWith("anaria:"))
                names.push(key.slice("anaria:".length));
        }
    }
    catch { }
    return [...new Set(names)];
};

// everything a person owns, in one json file
export const collect = () => {
    const account = readRaw("cloudsync") ?? {};
    const data = {};
    for (const name of localNames())
        data[name] = readRaw(name);
    return {
        app: "anaria",
        version: 3,
        exportedAt: new Date().toISOString(),
        username: account.username ?? "",
        password: account.passcode ?? "",
        settings: settings.all(),
        theme: settings.get("theme"),
        browsingHistory: visitLog.all(),
        cookies: settings.get("saveCookies") ? document.cookie : "",
        bookmarks: bookmarks.all(),
        gamesPlayed: data.gamesPlayed ?? [],
        aiChats: data.aiChats ?? null,
        musicSaved: data.musicSaved ?? [],
        chats: data.chats ?? null,
        cloudsync: data.cloudsync ?? null,
        data
    };
};

export const download = (filename, payload) => {
    try {
        const blob = new Blob([JSON.stringify(payload, null, "\t")], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = filename;
        document.body.append(link);
        link.click();
        link.remove();
        setTimeout(() => URL.revokeObjectURL(url), 5000);
        return true;
    }
    catch {
        return false;
    }
};

export const applyImported = (payload) => {
    if (!payload || typeof payload !== "object" || typeof payload.data !== "object" || !payload.data)
        return false;
    try {
        for (const [name, value] of Object.entries(payload.data)) {
            if (value === null || value === undefined)
                continue;
            localStorage.setItem(`anaria:${name}`, JSON.stringify({ __v: 1, value }));
        }
        return true;
    }
    catch {
        return false;
    }
};

export default { collect, download, applyImported };
