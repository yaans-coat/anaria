import "./env.js";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import http from "node:http";
import https from "node:https";
import { Readable } from "node:stream";
import { fileURLToPath } from "node:url";
import { json as expressJson } from "express";
import { env } from "./env.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/* ------------------------------------------------------------------ *
 * helpers
 * ------------------------------------------------------------------ */

const clientIp = (req) => {
    const forwarded = req.headers["x-forwarded-for"];
    if (typeof forwarded === "string" && forwarded.trim())
        return forwarded.split(",")[0].trim();
    return req.socket?.remoteAddress || "unknown";
};

// simple in memory sliding window limiter (per minute + per day buckets)
const buckets = new Map();
const consume = (key, perMinute, perDay) => {
    const now = Date.now();
    const minute = Math.floor(now / 60000);
    const day = Math.floor(now / 86400000);
    if (buckets.size > 4000) {
        for (const [k, b] of buckets) {
            if (b.day !== day)
                buckets.delete(k);
        }
    }
    let bucket = buckets.get(key);
    if (!bucket) {
        bucket = { minute: -1, minuteHits: 0, day: -1, dayHits: 0 };
        buckets.set(key, bucket);
    }
    if (bucket.minute !== minute) {
        bucket.minute = minute;
        bucket.minuteHits = 0;
    }
    if (bucket.day !== day) {
        bucket.day = day;
        bucket.dayHits = 0;
    }
    if (bucket.minuteHits >= perMinute)
        return { ok: false, scope: "minute" };
    if (bucket.dayHits >= perDay)
        return { ok: false, scope: "day" };
    bucket.minuteHits += 1;
    bucket.dayHits += 1;
    return {
        ok: true,
        minuteLeft: perMinute - bucket.minuteHits,
        dayLeft: perDay - bucket.dayHits
    };
};

const tooMany = (res, scope) => res.status(429).json({
    error: scope === "day"
        ? "daily limit reached — try again tomorrow so everyone gets a fair share."
        : "slow down a little and try again in a minute."
});

const fetchWithTimeout = (url, options = {}, ms = 20000) => {
    const signal = options.signal ?? AbortSignal.timeout(ms);
    return fetch(url, { ...options, signal });
};

const pipeUpstream = (upstream, res, headers = {}) => {
    if (!upstream.body) {
        res.status(upstream.status || 502).end();
        return;
    }
    for (const [name, value] of Object.entries(headers))
        res.setHeader(name, value);
    const type = upstream.headers.get("content-type");
    if (type)
        res.setHeader("content-type", type);
    const length = upstream.headers.get("content-length");
    if (length)
        res.setHeader("content-length", length);
    res.status(upstream.status || 200);
    const stream = Readable.fromWeb(upstream.body);
    stream.on("error", () => res.destroy());
    res.on("close", () => stream.destroy());
    stream.pipe(res);
};

/* ------------------------------------------------------------------ *
 * ai — openrouter proxy (key stays on the server, never sent to the client)
 * ------------------------------------------------------------------ */

// only free models are reachable, anything else is rejected before we
// ever talk to openrouter.
export const FREE_MODELS = [
    {
        id: "nvidia/nemotron-3-super-120b-a12b:free",
        label: "nemotron super 120b",
        blurb: "big all-rounder, best overall quality"
    },
    {
        id: "nvidia/nemotron-3-ultra-550b-a55b:free",
        label: "nemotron ultra 550b",
        blurb: "largest free model, a little slower"
    },
    {
        id: "nvidia/nemotron-3.5-lightning:free",
        label: "nemotron lightning",
        blurb: "fast answers, huge 1m context"
    },
    {
        id: "google/gemma-4-31b-it:free",
        label: "gemma 4 31b",
        blurb: "google model, balanced and friendly"
    },
    {
        id: "qwen/qwen3.8-27b:free",
        label: "qwen 3.8 27b",
        blurb: "good at reasoning, math and code"
    },
    {
        id: "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free",
        label: "nemotron nano reasoning",
        blurb: "small and quick, thinks before answering"
    },
    {
        id: "cohere/north-mini-code:free",
        label: "north mini code",
        blurb: "focused on code and technical help"
    }
];

// fair share limits, applied per ip and (when signed in) per cloudsync user
const AI_PER_MINUTE = 5;
const AI_PER_DAY = 40;
const AI_MAX_MESSAGES = 40;
const AI_MAX_MESSAGE_CHARS = 8000;
const AI_MAX_TOTAL_CHARS = 40000;
const AI_MAX_TOKENS = 900;

const normaliseMessages = (input) => {
    if (!Array.isArray(input) || input.length === 0)
        return null;
    const roles = new Set(["system", "user", "assistant"]);
    const out = [];
    for (const entry of input.slice(-AI_MAX_MESSAGES)) {
        if (!entry || typeof entry !== "object")
            continue;
        const role = typeof entry.role === "string" ? entry.role.trim() : "";
        const content = typeof entry.content === "string" ? entry.content : "";
        if (!roles.has(role) || !content.trim())
            continue;
        out.push({ role, content: content.slice(0, AI_MAX_MESSAGE_CHARS) });
    }
    if (!out.length)
        return null;
    if (!out.some(message => message.role === "user"))
        return null;
    const total = out.reduce((sum, message) => sum + message.content.length, 0);
    if (total > AI_MAX_TOTAL_CHARS)
        return null;
    return out;
};

const openrouterKey = () => env("OPENROUTER_API_KEY", "");

const handleAiChat = async (req, res) => {
    const key = openrouterKey();
    if (!key) {
        res.status(503).json({
            error: "ai is offline: the server has no OPENROUTER_API_KEY configured."
        });
        return;
    }
    const body = req.body ?? {};
    const model = typeof body.model === "string" ? body.model.trim() : "";
    if (!FREE_MODELS.some(entry => entry.id === model)) {
        res.status(400).json({ error: "unknown model", models: FREE_MODELS });
        return;
    }
    const messages = normaliseMessages(body.messages);
    if (!messages) {
        res.status(400).json({
            error: `send 1-${AI_MAX_MESSAGES} messages (max ${AI_MAX_MESSAGE_CHARS} chars each) including at least one from the user.`
        });
        return;
    }
    const ip = clientIp(req);
    const ipHit = consume(`ai:ip:${ip}`, AI_PER_MINUTE, AI_PER_DAY);
    if (!ipHit.ok)
        return tooMany(res, ipHit.scope);
    const username = typeof body.username === "string"
        ? body.username.trim().toLowerCase().slice(0, 24)
        : "";
    let usage = ipHit;
    if (username) {
        const userHit = consume(`ai:user:${username}`, AI_PER_MINUTE, AI_PER_DAY);
        if (!userHit.ok)
            return tooMany(res, userHit.scope);
        usage = {
            minuteLeft: Math.min(ipHit.minuteLeft, userHit.minuteLeft),
            dayLeft: Math.min(ipHit.dayLeft, userHit.dayLeft)
        };
    }
    let upstream;
    try {
        upstream = await fetchWithTimeout("https://openrouter.ai/api/v1/chat/completions", {
            method: "POST",
            headers: {
                "content-type": "application/json",
                authorization: `Bearer ${key}`,
                "http-referer": env("SITE_URL", "https://anaria.fun"),
                "x-title": "anaria"
            },
            body: JSON.stringify({
                model,
                messages,
                max_tokens: AI_MAX_TOKENS,
                temperature: 0.7
            })
        }, 60000);
    }
    catch (error) {
        res.status(502).json({ error: `could not reach openrouter: ${error.message}` });
        return;
    }
    const raw = await upstream.text();
    let parsed = null;
    try {
        parsed = JSON.parse(raw);
    }
    catch { }
    if (!upstream.ok) {
        const message = parsed?.error?.message ?? parsed?.message ?? raw.slice(0, 300);
        if (upstream.status === 429) {
            res.status(503).json({
                error: "that model is busy right now — wait a moment or pick another one."
            });
            return;
        }
        res.status(502).json({ error: `model failed: ${message}` });
        return;
    }
    const text = parsed?.choices?.[0]?.message?.content ?? "";
    if (!text.trim()) {
        res.status(503).json({ error: "the model returned nothing — try again or pick another one." });
        return;
    }
    res.json({
        text,
        model,
        usage: {
            minuteLeft: usage.minuteLeft,
            dayLeft: usage.dayLeft,
            limits: { perMinute: AI_PER_MINUTE, perDay: AI_PER_DAY }
        }
    });
};

/* ------------------------------------------------------------------ *
 * music — proxy in front of the x8rr/music backend
 * ------------------------------------------------------------------ */

const musicBase = () => env("MUSIC_API_URL", "http://localhost:2010").replace(/\/+$/, "");

const handleMusicError = (res, error) => res.status(502).json({
    error: "the music backend is offline.",
    detail: String(error?.message ?? error),
    hint: "run https://github.com/x8rr/music and set MUSIC_API_URL in .env"
});

const handleMusicSearch = async (req, res) => {
    const query = String(req.query.q ?? "").trim().slice(0, 200);
    const limit = req.query.limit;
    const source = req.query.source;
    if (!query) {
        res.status(400).json({ error: "missing q" });
        return;
    }
    const hit = consume(`music:${clientIp(req)}`, 60, 1500);
    if (!hit.ok)
        return tooMany(res, hit.scope);
    try {
        const upstreamUrl = new URL(`${musicBase()}/api/music/search`);
        upstreamUrl.searchParams.set("q", encodeURIComponent(query));
        if (limit) upstreamUrl.searchParams.set("limit", String(limit));
        if (source) upstreamUrl.searchParams.set("source", String(source));
        const upstream = await fetchWithTimeout(upstreamUrl.toString(), {}, 20000);
        const text = await upstream.text();
        res.status(upstream.status)
            .setHeader("content-type", upstream.headers.get("content-type") || "application/json")
            .setHeader("cache-control", "no-store")
            .send(text);
    }
    catch (error) {
        handleMusicError(res, error);
    }
};

const handleMusicStream = async (req, res) => {
    const target = new URL(`${musicBase()}/api/music/stream`);
    let hasId = false;
    for (const [name, value] of Object.entries(req.query)) {
        if (!/^[a-z0-9_]{1,32}$/i.test(name))
            continue;
        const flat = Array.isArray(value) ? value[0] : value;
        target.searchParams.set(name, String(flat ?? "").slice(0, 300));
        if (name === "id")
            hasId = true;
    }
    if (!hasId) {
        res.status(400).json({ error: "missing id" });
        return;
    }
    const hit = consume(`music:${clientIp(req)}`, 60, 1500);
    if (!hit.ok)
        return tooMany(res, hit.scope);
    try {
        const upstream = await fetchWithTimeout(target.href, {}, 60000);
        if (!upstream.ok) {
            const text = await upstream.text();
            res.status(upstream.status).type("json").send(text);
            return;
        }
        pipeUpstream(upstream, res, { "cache-control": "no-store" });
    }
    catch (error) {
        handleMusicError(res, error);
    }
};

/* ------------------------------------------------------------------ *
 * games — the local anaria-local collection plus the gmshelf catalogs
 * (seraph, truffled, ckv, ugs). catalog json lives on github, game files
 * are streamed through /src/<source>/… so content types stay correct.
 * ------------------------------------------------------------------ */

const GAME_SOURCES = [
    { id: "seraph", repo: "gmshelf/seraph", file: "seraph.json" },
    { id: "truffled", repo: "gmshelf/truffled", file: "truffled.json" },
    { id: "ckv", repo: "gmshelf/ckv", file: "ckv.json" },
    { id: "ugs", repo: "gmshelf/ugs", file: "ugs.json" }
];
const GAMES_DIR = path.join(__dirname, "g");
const CATALOG_TTL = 60 * 60 * 1000;
const LOCAL_TTL = 5 * 60 * 1000;
const gameCache = new Map();

const withImage = (sourceId, raw) => typeof raw === "string" &&
    raw.startsWith("/") && !raw.includes("..") && !raw.includes("\\")
    ? `/src/${sourceId}${raw}`
    : "";

const cleanRemoteList = (sourceId, data) => {
    const list = Array.isArray(data) ? data
        : Array.isArray(data?.games) ? data.games
            : [];
    const out = [];
    const seen = new Set();
    for (const entry of list) {
        if (!entry || typeof entry !== "object")
            continue;
        const name = String(entry.name ?? "").trim().slice(0, 120);
        const raw = String(entry.url ?? "").trim();
        if (!name || !raw.startsWith("/") || raw.includes("..") || raw.includes("\\"))
            continue;
        if (seen.has(raw))
            continue;
        seen.add(raw);
        out.push({
            name,
            url: `/src/${sourceId}${raw}`,
            img: withImage(sourceId, entry.img)
        });
    }
    return out;
};

const readLocalGames = () => {
    let entries = [];
    try {
        entries = fs.readdirSync(GAMES_DIR, { withFileTypes: true });
    }
    catch {
        return [];
    }
    const games = [];
    for (const dir of entries) {
        if (!dir.isDirectory())
            continue;
        let entryFile = null;
        for (const candidate of ["index.html", "game.html", "index.htm"]) {
            if (fs.existsSync(path.join(GAMES_DIR, dir.name, candidate))) {
                entryFile = candidate;
                break;
            }
        }
        if (!entryFile)
            continue;
        const title = dir.name.replace(/[-_]+/g, " ").trim() || dir.name;
        games.push({
            name: title,
            url: `/g/${encodeURIComponent(dir.name)}/${entryFile}`,
            img: ""
        });
    }
    games.sort((a, b) => a.name.localeCompare(b.name));
    return games;
};

const localCatalog = () => {
    const cached = gameCache.get("anaria-local");
    if (cached && Date.now() - cached.at < LOCAL_TTL)
        return cached.games;
    const entry = { at: Date.now(), games: readLocalGames() };
    gameCache.set("anaria-local", entry);
    return entry.games;
};

const fetchCatalog = async (source) => {
    const cached = gameCache.get(source.id);
    if (cached && Date.now() - cached.at < CATALOG_TTL)
        return cached.games;
    const upstream = await fetchWithTimeout(
        `https://raw.githubusercontent.com/${source.repo}/main/${source.file}`,
        {},
        15000
    );
    if (!upstream.ok)
        throw new Error(`${source.id} catalog responded ${upstream.status}`);
    const games = cleanRemoteList(source.id, await upstream.json());
    gameCache.set(source.id, { at: Date.now(), games });
    return games;
};

const handleGames = async (req, res) => {
    const hit = consume(`games:${clientIp(req)}`, 30, 600);
    if (!hit.ok)
        return tooMany(res, hit.scope);
    const local = localCatalog();
    const remote = await Promise.allSettled(GAME_SOURCES.map(fetchCatalog));
    const sources = [];
    let total = 0;
    GAME_SOURCES.forEach((source, index) => {
        const settled = remote[index];
        if (settled.status === "fulfilled") {
            sources.push({
                id: source.id,
                label: source.id,
                count: settled.value.length,
                games: settled.value
            });
            total += settled.value.length;
        }
        else {
            sources.push({
                id: source.id,
                label: source.id,
                count: 0,
                games: [],
                error: "source offline"
            });
        }
    });
    sources.push({
        id: "anaria-local",
        label: "anaria-local",
        count: local.length,
        games: local
    });
    total += local.length;
    res.setHeader("cache-control", "no-store");
    res.json({ ok: true, sources, total });
};

// content types github raw serves as text/plain (html above all) — map them
// ourselves so proxied games render instead of downloading as plain text.
const SRC_TYPES = {
    html: "text/html; charset=utf-8",
    htm: "text/html; charset=utf-8",
    js: "text/javascript; charset=utf-8",
    mjs: "text/javascript; charset=utf-8",
    css: "text/css; charset=utf-8",
    json: "application/json; charset=utf-8",
    map: "application/json; charset=utf-8",
    txt: "text/plain; charset=utf-8",
    xml: "application/xml; charset=utf-8",
    svg: "image/svg+xml",
    png: "image/png",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    gif: "image/gif",
    webp: "image/webp",
    ico: "image/x-icon",
    woff: "font/woff",
    woff2: "font/woff2",
    ttf: "font/ttf",
    otf: "font/otf",
    mp3: "audio/mpeg",
    ogg: "audio/ogg",
    wav: "audio/wav",
    mp4: "video/mp4",
    webm: "video/webm",
    wasm: "application/wasm",
    pdf: "application/pdf"
};

const handleSrcFile = async (req, res) => {
    const source = GAME_SOURCES.find(entry => entry.id === String(req.params.source));
    const rest = String(req.params[0] ?? "");
    if (!source ||
        !rest ||
        rest.includes("..") ||
        rest.includes("\\") ||
        !/^[A-Za-z0-9][A-Za-z0-9._\-/ ]*$/.test(rest)) {
        res.status(400).json({ error: "bad game path" });
        return;
    }
    const hit = consume(`src:${clientIp(req)}`, 600, 8000);
    if (!hit.ok)
        return tooMany(res, hit.scope);
    try {
        const upstream = await fetchWithTimeout(
            `https://raw.githubusercontent.com/${source.repo}/main/${rest}`,
            {},
            30000
        );
        if (!upstream.ok || !upstream.body) {
            res.status(upstream.status || 502).end();
            return;
        }
        const type = SRC_TYPES[path.extname(rest).toLowerCase().slice(1)] ||
            (upstream.headers.get("content-type") || "application/octet-stream");
        res.setHeader("content-type", type);
        res.setHeader("cache-control", "public, max-age=86400");
        res.setHeader("cross-origin-resource-policy", "cross-origin");
        res.status(upstream.status || 200);
        const stream = Readable.fromWeb(upstream.body);
        stream.on("error", () => res.destroy());
        res.on("close", () => stream.destroy());
        stream.pipe(res);
    }
    catch (error) {
        res.status(502).json({ error: `game file failed: ${error.message}` });
    }
};

/* ------------------------------------------------------------------ *
 * tmdb — server side proxy so the key lives in .env (fallback: inline)
 * ------------------------------------------------------------------ */

const TMDB_FALLBACK_KEY = "fc0fd9e27929f6a0f00adfc6653b4d59";

const handleTmdb = async (req, res) => {
    const rest = "/" + String(req.params[0] ?? "").replace(/^\/+/, "");
    if (rest.length < 2 || rest.includes("..") || !/^\/[A-Za-z0-9/_\-.]+$/.test(rest)) {
        res.status(400).json({ error: "bad tmdb path" });
        return;
    }
    const hit = consume(`tmdb:${clientIp(req)}`, 90, 2000);
    if (!hit.ok)
        return tooMany(res, hit.scope);
    const url = new URL(`https://api.themoviedb.org/3${rest}`);
    for (const [name, value] of Object.entries(req.query)) {
        if (!/^[a-z0-9_]{1,32}$/i.test(name))
            continue;
        const flat = Array.isArray(value) ? value[0] : value;
        url.searchParams.set(name, String(flat ?? "").slice(0, 300));
    }
    url.searchParams.set("api_key", env("TMDB_API_KEY", TMDB_FALLBACK_KEY));
    if (!url.searchParams.has("language"))
        url.searchParams.set("language", "en-US");
    try {
        const upstream = await fetchWithTimeout(url.href, {}, 20000);
        const text = await upstream.text();
        res.status(upstream.status)
            .setHeader("content-type", "application/json; charset=utf-8")
            .setHeader("cache-control", "public, max-age=3600")
            .send(text);
    }
    catch (error) {
        res.status(502).json({ status_message: `tmdb unreachable: ${error.message}` });
    }
};

/* ------------------------------------------------------------------ *
 * tmdb images — same origin so the coep header never blocks posters
 * ------------------------------------------------------------------ */

const TMDB_IMAGE_WIDTHS = new Set([
    "w92", "w154", "w185", "w342", "w500", "w780", "original"
]);

const handleTmdbImage = async (req, res) => {
    const file = String(req.query.path ?? "");
    const width = String(req.query.w ?? "w500");
    if (!/^\/[A-Za-z0-9_-]+\.(jpe?g|png|webp|gif|svg)$/i.test(file)) {
        res.status(400).json({ error: "bad image path" });
        return;
    }
    if (!TMDB_IMAGE_WIDTHS.has(width)) {
        res.status(400).json({ error: "bad image size" });
        return;
    }
    const hit = consume(`img:${clientIp(req)}`, 300, 4000);
    if (!hit.ok)
        return tooMany(res, hit.scope);
    try {
        const upstream = await fetchWithTimeout(`https://image.tmdb.org/t/p/${width}${file}`, {}, 20000);
        if (!upstream.ok) {
            res.status(upstream.status).end();
            return;
        }
        pipeUpstream(upstream, res, { "cache-control": "public, max-age=86400" });
    }
    catch (error) {
        res.status(502).json({ error: `image failed: ${error.message}` });
    }
};

/* ------------------------------------------------------------------ *
 * cloudsync — username + passcode, simple by design
 * ------------------------------------------------------------------ */

const dataDir = path.join(__dirname, "data");
const usersFile = path.join(dataDir, "users.json");
const MAX_SYNC_BYTES = 1_500_000;
const SESSION_TTL = 1000 * 60 * 60 * 24 * 7;
const USERNAME_RE = /^[a-z0-9_.-]{3,24}$/i;

let database = null;
const loadDb = () => {
    if (database)
        return database;
    try {
        database = JSON.parse(fs.readFileSync(usersFile, "utf8"));
    }
    catch {
        database = null;
    }
    if (!database || typeof database !== "object")
        database = {};
    database.users ??= {};
    database.sessions ??= {};
    const now = Date.now();
    for (const [token, session] of Object.entries(database.sessions)) {
        if (!session || session.expires < now)
            delete database.sessions[token];
    }
    return database;
};
const saveDb = () => {
    fs.mkdirSync(dataDir, { recursive: true });
    const tmp = `${usersFile}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(database, null, "\t"));
    fs.renameSync(tmp, usersFile);
};
const hashPasscode = (passcode, salt) => crypto
    .scryptSync(String(passcode), salt, 64)
    .toString("hex");
const issueToken = (username) => {
    const db = loadDb();
    const token = crypto.randomBytes(32).toString("hex");
    db.sessions[token] = {
        username,
        expires: Date.now() + SESSION_TTL
    };
    saveDb();
    return token;
};
const sessionUser = (req) => {
    const token = String(req.body?.token ??
        req.query.token ??
        req.headers["x-anaria-session"] ??
        "").trim();
    if (!/^[a-f0-9]{64}$/.test(token))
        return null;
    const db = loadDb();
    const session = db.sessions[token];
    if (!session || session.expires < Date.now()) {
        if (session)
            delete db.sessions[token];
        return null;
    }
    session.expires = Date.now() + SESSION_TTL;
    return { token, username: session.username };
};

const handleRegister = (req, res) => {
    const hit = consume(`sync:${clientIp(req)}`, 20, 200);
    if (!hit.ok)
        return tooMany(res, hit.scope);
    const username = String(req.body?.username ?? "").trim();
    const passcode = String(req.body?.passcode ?? "");
    if (!USERNAME_RE.test(username)) {
        res.status(400).json({ error: "username must be 3-24 letters, numbers, dots, dashes or underscores." });
        return;
    }
    if (passcode.length < 4 || passcode.length > 64) {
        res.status(400).json({ error: "passcode must be 4-64 characters." });
        return;
    }
    const db = loadDb();
    const key = username.toLowerCase();
    if (db.users[key]) {
        res.status(409).json({ error: "that username is taken." });
        return;
    }
    const salt = crypto.randomBytes(16).toString("hex");
    db.users[key] = {
        username,
        salt,
        hash: hashPasscode(passcode, salt),
        createdAt: Date.now(),
        updatedAt: Date.now(),
        data: typeof req.body?.data === "object" && req.body.data ? req.body.data : {}
    };
    const token = issueToken(username);
    saveDb();
    res.json({ ok: true, token, username });
};

const handleLogin = (req, res) => {
    const username = String(req.body?.username ?? "").trim();
    const passcode = String(req.body?.passcode ?? "");
    const hit = consume(`login:${clientIp(req)}`, 10, 60);
    const nameHit = consume(`login-name:${username.toLowerCase()}`, 10, 60);
    if (!hit.ok || !nameHit.ok)
        return tooMany(res, "minute");
    const db = loadDb();
    const record = db.users[username.toLowerCase()];
    if (!record || record.hash !== hashPasscode(passcode, record.salt)) {
        res.status(401).json({ error: "wrong username or passcode." });
        return;
    }
    const token = issueToken(record.username);
    res.json({
        ok: true,
        token,
        username: record.username,
        data: record.data ?? {},
        updatedAt: record.updatedAt ?? 0
    });
};

const handlePush = (req, res) => {
    const session = sessionUser(req);
    if (!session) {
        res.status(401).json({ error: "sign in first." });
        return;
    }
    const data = req.body?.data;
    if (typeof data !== "object" || data === null || Array.isArray(data)) {
        res.status(400).json({ error: "data must be an object." });
        return;
    }
    if (JSON.stringify(data).length > MAX_SYNC_BYTES) {
        res.status(413).json({ error: "that sync payload is too large." });
        return;
    }
    const db = loadDb();
    const record = db.users[session.username.toLowerCase()];
    if (!record) {
        res.status(401).json({ error: "account no longer exists." });
        return;
    }
    record.data = data;
    record.updatedAt = Date.now();
    saveDb();
    res.json({ ok: true, updatedAt: record.updatedAt });
};

const handlePull = (req, res) => {
    const session = sessionUser(req);
    if (!session) {
        res.status(401).json({ error: "sign in first." });
        return;
    }
    const db = loadDb();
    const record = db.users[session.username.toLowerCase()];
    if (!record) {
        res.status(401).json({ error: "account no longer exists." });
        return;
    }
    res.json({
        ok: true,
        username: record.username,
        data: record.data ?? {},
        updatedAt: record.updatedAt ?? 0
    });
};

const handleLogout = (req, res) => {
    const session = sessionUser(req);
    const db = loadDb();
    if (session && db.sessions[session.token]) {
        delete db.sessions[session.token];
        saveDb();
    }
    res.json({ ok: true });
};

const handleDelete = (req, res) => {
    const session = sessionUser(req);
    if (!session) {
        res.status(401).json({ error: "sign in first." });
        return;
    }
    const passcode = String(req.body?.passcode ?? "");
    const db = loadDb();
    const key = session.username.toLowerCase();
    const record = db.users[key];
    if (!record || record.hash !== hashPasscode(passcode, record.salt)) {
        res.status(401).json({ error: "wrong passcode." });
        return;
    }
    delete db.users[key];
    for (const [token, entry] of Object.entries(db.sessions)) {
        if (entry?.username?.toLowerCase() === key)
            delete db.sessions[token];
    }
    saveDb();
    res.json({ ok: true });
};

/* ------------------------------------------------------------------ *
 * chat — server side channels (general + private dms), gated behind
 * cloudsync sessions so your threads follow your account
 * ------------------------------------------------------------------ */

const chatFile = path.join(dataDir, "chat.json");
const CHAT_MAX_MESSAGE = 600;
const CHAT_MAX_PER_CHANNEL = 500;
const CHAT_PER_MINUTE = 30;
const CHAT_PER_DAY = 600;

let chatDb = null;
const loadChat = () => {
    if (chatDb)
        return chatDb;
    try {
        chatDb = JSON.parse(fs.readFileSync(chatFile, "utf8"));
    }
    catch {
        chatDb = null;
    }
    if (!chatDb || typeof chatDb !== "object")
        chatDb = {};
    if (!Array.isArray(chatDb.general))
        chatDb.general = [];
    if (!chatDb.dms || typeof chatDb.dms !== "object")
        chatDb.dms = {};
    return chatDb;
};
const saveChat = () => {
    fs.mkdirSync(dataDir, { recursive: true });
    const tmp = `${chatFile}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(chatDb, null, "\t"));
    fs.renameSync(tmp, chatFile);
};
const dmKey = (a, b) => [String(a).toLowerCase(), String(b).toLowerCase()].sort().join("|");
const trimChannel = (list) => {
    while (list.length > CHAT_MAX_PER_CHANNEL)
        list.shift();
    return list;
};
// "general" or "dm:<registered username>" — resolved against the signed in user
const resolveChannel = (raw, me) => {
    const channel = String(raw ?? "").trim().toLowerCase();
    if (channel === "general")
        return { channel: "general", key: "general" };
    const match = /^dm:([a-z0-9_.-]{3,24})$/.exec(channel);
    if (!match)
        return null;
    const db = loadDb();
    const record = db.users[match[1]];
    if (!record || record.username.toLowerCase() === me.toLowerCase())
        return null;
    return { channel: `dm:${record.username.toLowerCase()}`, key: `dm:${dmKey(me, record.username)}` };
};

const handleChatChannels = (req, res) => {
    const session = sessionUser(req);
    if (!session) {
        res.status(401).json({ error: "sign in to cloudsync first so your chats follow your account." });
        return;
    }
    const db = loadDb();
    const me = session.username.toLowerCase();
    const chat = loadChat();
    const record = db.users[me];
    const users = Object.values(db.users)
        .map(entry => entry.username)
        .filter(name => name.toLowerCase() !== me)
        .sort((a, b) => a.localeCompare(b));
    const threads = [...new Set(Object.keys(chat.dms)
        .filter(key => key.split("|").includes(me))
        .map(key => key.split("|").find(part => part !== me)))];
    const friends = Array.isArray(record?.friends)
        ? record.friends.filter(name => db.users[name])
        : [];
    res.setHeader("cache-control", "no-store");
    res.json({ ok: true, username: session.username, users, threads, friends });
};

// add or remove a friend — both sides keep their own list
const handleFriends = (req, res) => {
    const session = sessionUser(req);
    if (!session) {
        res.status(401).json({ error: "sign in to cloudsync first." });
        return;
    }
    const db = loadDb();
    const me = session.username.toLowerCase();
    const record = db.users[me];
    if (!record) {
        res.status(401).json({ error: "account no longer exists." });
        return;
    }
    const hit = consume(`friends:${me}`, 30, 300);
    if (!hit.ok)
        return tooMany(res, hit.scope);
    const target = String(req.body?.username ?? "").trim().toLowerCase();
    if (!/^[a-z0-9_.-]{3,24}$/.test(target) || !db.users[target] || target === me) {
        res.status(400).json({ error: "no such user." });
        return;
    }
    if (!Array.isArray(record.friends))
        record.friends = [];
    if (req.body?.remove) {
        record.friends = record.friends.filter(name => name !== target);
    }
    else if (!record.friends.includes(target)) {
        if (record.friends.length >= 200)
            record.friends.shift();
        record.friends.push(target);
    }
    saveDb();
    res.json({ ok: true, friends: record.friends });
};

const handleChatPull = (req, res) => {
    const session = sessionUser(req);
    if (!session) {
        res.status(401).json({ error: "sign in to cloudsync first so your chats follow your account." });
        return;
    }
    const resolved = resolveChannel(req.query.channel, session.username);
    if (!resolved) {
        res.status(400).json({ error: "no such channel." });
        return;
    }
    const since = Number(req.query.since) || 0;
    const chat = loadChat();
    const list = resolved.key === "general"
        ? chat.general
        : (chat.dms[resolved.key] ?? []);
    const messages = since > 0
        ? list.filter(message => message.at > since)
        : list.slice(-80);
    res.setHeader("cache-control", "no-store");
    res.json({ ok: true, channel: resolved.channel, messages });
};

const handleChatSend = (req, res) => {
    const session = sessionUser(req);
    if (!session) {
        res.status(401).json({ error: "sign in to cloudsync first so your chats follow your account." });
        return;
    }
    const hit = consume(`chat:${session.username.toLowerCase()}`, CHAT_PER_MINUTE, CHAT_PER_DAY);
    if (!hit.ok)
        return tooMany(res, hit.scope);
    const resolved = resolveChannel(req.body?.channel, session.username);
    if (!resolved) {
        res.status(400).json({ error: "no such channel." });
        return;
    }
    const text = String(req.body?.text ?? "")
        .replace(/[\r\n]+/g, " ")
        .trim()
        .slice(0, CHAT_MAX_MESSAGE);
    if (!text) {
        res.status(400).json({ error: "empty message." });
        return;
    }
    const chat = loadChat();
    const list = resolved.key === "general"
        ? chat.general
        : (chat.dms[resolved.key] ??= []);
    const message = {
        id: `${Date.now().toString(36)}-${crypto.randomBytes(4).toString("hex")}`,
        from: session.username,
        text,
        at: Date.now()
    };
    list.push(message);
    trimChannel(list);
    saveChat();
    res.json({
        ok: true,
        message,
        usage: { minuteLeft: hit.minuteLeft, dayLeft: hit.dayLeft }
    });
};

/* ------------------------------------------------------------------ *
 * registration
 * ------------------------------------------------------------------ */

export const registerApi = (app) => {
    // harden only the api surface, static/proxy behaviour stays untouched
    app.use("/api", (req, res, next) => {
        res.setHeader("X-Content-Type-Options", "nosniff");
        res.setHeader("Cross-Origin-Resource-Policy", "same-origin");
        next();
    });
    app.use(expressJson({ limit: "2mb" }));

    app.get("/api/health", (_req, res) => res.json({ ok: true }));
    app.get("/api/ai/models", (_req, res) => res.json({
        models: FREE_MODELS,
        limits: { perMinute: AI_PER_MINUTE, perDay: AI_PER_DAY }
    }));
    app.post("/api/ai/chat", handleAiChat);
    app.get("/api/music/search", handleMusicSearch);
    app.get("/api/music/stream", handleMusicStream);
    app.get("/api/music/artist/:id", async (req, res) => {
        const { id } = req.params;
        try {
            const upstream = await fetchWithTimeout(`${musicBase()}/api/music/artist/${id}`, {}, 30000);
            if (!upstream.ok) {
                const text = await upstream.text();
                return res.status(upstream.status).type("json").send({ error: text || "artist not found" });
            }
            const data = await upstream.json();
            res.json(data);
        }
        catch (error) {
            handleMusicError(res, error);
        }
    });
    app.get("/api/music/artist/:id/similar", async (req, res) => {
        const { id } = req.params;
        try {
            const upstream = await fetchWithTimeout(`${musicBase()}/api/music/artist/${id}/similar`, {}, 30000);
            if (!upstream.ok) {
                const text = await upstream.text();
                return res.status(upstream.status).type("json").send({ error: text || "similar not found" });
            }
            const data = await upstream.json();
            res.json(data);
        }
        catch (error) {
            handleMusicError(res, error);
        }
    });
    app.get("/api/music/album/:id", async (req, res) => {
        const { id } = req.params;
        try {
            const upstream = await fetchWithTimeout(`${musicBase()}/api/music/album/${id}`, {}, 30000);
            if (!upstream.ok) {
                const text = await upstream.text();
                return res.status(upstream.status).type("json").send({ error: text || "album not found" });
            }
            const data = await upstream.json();
            res.json(data);
        }
        catch (error) {
            handleMusicError(res, error);
        }
    });
    app.get("/api/games", handleGames);
    app.get("/src/:source/*", handleSrcFile);
    app.get("/api/tmdb/*", handleTmdb);
    app.get("/api/img", handleTmdbImage);
    app.post("/api/sync/register", handleRegister);
    app.post("/api/sync/login", handleLogin);
    app.post("/api/sync/push", handlePush);
    app.get("/api/sync/pull", handlePull);
    app.post("/api/sync/logout", handleLogout);
    app.post("/api/sync/delete", handleDelete);
    app.get("/api/chat/channels", handleChatChannels);
    app.get("/api/chat/pull", handleChatPull);
    app.post("/api/chat/send", handleChatSend);
    app.post("/api/chat/friends", handleFriends);
};

// node's http/https keepalive agents for upstream api calls
http.globalAgent.keepAlive = true;
https.globalAgent.keepAlive = true;
