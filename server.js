import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import { createRequire } from "node:module";
import { scramjetPath } from "@mercuryworkshop/scramjet/path";
import { server as wisp } from "@mercuryworkshop/wisp-js/server";
import { createBareServer } from "@tomphttp/bare-server-node";
import ipaddr from "ipaddr.js";
import { registerApi } from "./api.js";
// the local game collection (/g/…) and the github content proxy (/src/…) are
// served by this very server — let the wisp tunnel reach loopback targets so
// games can load through scramjet instead of being refused as ssrf
wisp.options.allow_loopback_ips = true;
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const staticRoot = path.join(__dirname, "public");
const app = express();
app.use((_req, res, next) => {
    res.setHeader("Cross-Origin-Opener-Policy", "same-origin");
    res.setHeader("Cross-Origin-Embedder-Policy", "require-corp");
    // proxied pages live on the loopback alias (localhost ⇄ 127.0.0.1) and
    // load each other's assets directly — under coep those cross-origin
    // subresources need an explicit corp header to be accepted
    res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
    next();
});
registerApi(app);
const require = createRequire(import.meta.url);
const dirOf = (specifier) => path.dirname(require.resolve(specifier));
app.use("/scram/", express.static(scramjetPath));
app.use("/utils/", express.static(dirOf("@mercuryworkshop/scramjet-utils")));
app.use("/controller/", express.static(dirOf("@mercuryworkshop/scramjet-controller")));
app.use("/libcurl/", express.static(dirOf("@mercuryworkshop/libcurl-transport")));
app.use("/epoxy/", express.static(dirOf("@mercuryworkshop/epoxy-transport")));
app.use("/baremod/", express.static(dirOf("@mercuryworkshop/bare-transport")));
// the looping background image (settings → appearance → background)
app.use("/github", express.static(path.join(__dirname, "github")));
app.use(express.static(staticRoot, {
    setHeaders(res, filePath) {
        if (path.basename(filePath).endsWith("sw.js")) {
            res.setHeader("Cache-Control", "no-cache");
        }
    }
}));
// short urls: / {url}/g {url}/mov {url}/msc {url}/c {url}/a {url}/contact
// {url}/tos {url}/p {url}/dmca {url}/cloudsync {url}/settings
// "/" is served by express.static (index.html)
const appRoutes = [
    "/g",
    "/mov",
    "/msc",
    "/c",
    "/a",
    "/contact",
    "/tos",
    "/p",
    "/dmca",
    "/cloudsync",
    "/settings"
];
const indexHtml = path.join(staticRoot, "index.html");
for (const route of appRoutes) {
    app.get(route, (_req, res) => res.sendFile(indexHtml));
}
// the portal pages in the local collection share a site root (g/): /style.css,
// /media/… and the nav chrome were captured once at that root, while game files
// live inside each folder. map root-absolute urls into the game's own folder
// when the file is there, and fall back to the shared root when it isn't —
// a few folders hold the *game's* css under the same name (never styles the
// portal), so the shared chrome wins in that case too. relative urls pass
// through untouched.
const gameRoot = path.join(__dirname, "g");
const portalRef = /((?:href|src|poster|action|data-src|data-url)\s*=\s*["'])\/(?!\/)([^"'<>]*)/gi;
const portalCssCache = new Map();
const stylesPortalChrome = (file) => {
    let known = portalCssCache.get(file);
    if (known === undefined) {
        try {
            known = fs.readFileSync(file, "utf8").includes(".nav");
        }
        catch {
            known = false;
        }
        portalCssCache.set(file, known);
    }
    return known;
};
app.use((req, res, next) => {
    if (req.method !== "GET")
        return next();
    const match = /^\/g\/([^/?#]+)(\/[^?#]*)?$/.exec(req.path);
    if (!match)
        return next();
    const slug = decodeURIComponent(match[1]);
    let page = (match[2] || "/").replace(/^\//, "");
    if (page === "" || page.endsWith("/"))
        page += "index.html";
    if (!page.endsWith(".html"))
        return next();
    const dir = path.resolve(gameRoot, slug);
    const file = path.resolve(dir, page);
    if (file !== dir && !file.startsWith(dir + path.sep))
        return next();
    fs.readFile(file, "utf8", (error, html) => {
        if (error)
            return next();
        const base = `/g/${encodeURIComponent(slug)}/`;
        res.setHeader("Content-Type", "text/html; charset=utf-8");
        res.setHeader("Cache-Control", "no-cache");
        res.send(html.replace(portalRef, (whole, pre, rel) => {
            const relPath = rel.split(/[?#]/)[0];
            let prefix = base;
            if (relPath) {
                const inFolder = path.resolve(dir, relPath);
                const inRoot = path.resolve(gameRoot, relPath);
                const folderOk = inFolder.startsWith(dir + path.sep) && fs.existsSync(inFolder);
                const rootOk = inRoot.startsWith(gameRoot + path.sep) && fs.existsSync(inRoot);
                const isStyle = /(^|\/)style\.css$/i.test(relPath);
                if (rootOk && (!folderOk || (isStyle && !stylesPortalChrome(inFolder))))
                    prefix = "/g/";
            }
            return `${pre}${prefix}${rel}`;
        }));
    });
});
// anaria-local games live next to server.js — mounted after the exact "/g"
// short url so the app route always wins
app.use("/g", express.static(path.join(__dirname, "g"), {
    fallthrough: true,
    index: "index.html",
    setHeaders(res, filePath) {
        if (filePath.endsWith(".html")) {
            res.setHeader("Cache-Control", "no-cache");
        }
    }
}));
const bareServer = createBareServer("/bare/", {
    filterRemote(url) {
        const hostname = url.hostname.replace(/^\[|\]$/g, "");
        if (ipaddr.isValid(hostname) &&
            ipaddr.parse(hostname).range() !== "unicast") {
            throw new RangeError("Forbidden IP");
        }
    },
    connectionLimiter: {
        maxConnectionsPerIP: 2000,
        windowDuration: 60,
        blockDuration: 10
    }
});
const handleRequest = (req, res) => {
    if (bareServer.shouldRoute(req)) {
        bareServer.routeRequest(req, res);
        return;
    }
    app(req, res);
};
const server = http.createServer(handleRequest);
server.on("upgrade", (req, socket, head) => {
    if (bareServer.shouldRoute(req)) {
        bareServer.routeUpgrade(req, socket, head);
        return;
    }
    const wispPath = new URL(req.url ?? "/", "http://localhost").pathname;
    if (wispPath === "/wisp/") {
        req.url = wispPath;
        wisp.routeRequest(req, socket, head);
        return;
    }
    // scramjet's libcurl transport offers an h2c (http/2) upgrade on every
    // request — we only speak http/1.1, so answer it as a plain request.
    // curl falls back to http/1.1 when it doesn't get a 101 back; dropping
    // the socket here made proxied loopback content fail with curl error 52.
    if (head?.length)
        socket.unshift(head);
    const res = new http.ServerResponse(req);
    res.assignSocket(socket);
    app(req, res);
});
const listenWithFallback = (target, startPort, attempts = 20) => {
    let port = startPort;
    let left = attempts;
    const onError = (error) => {
        if (error.code !== "EADDRINUSE" || left-- <= 0) {
            console.error(`Could not listen on port ${port}: ${error.message}`);
            process.exit(1);
        }
        console.warn(`Port ${port} is in use, trying ${port + 1}...`);
        port += 1;
        target.listen(port);
    };
    target.on("error", onError);
    target.listen(port, () => {
        target.off("error", onError);
        process.send?.({ type: "listening", port });
        console.log(process.env.BACKEND_ONLY
            ? `Backend listening on http://localhost:${port}`
            : `Anaria listening on http://localhost:${port}`);
    });
};
const port = Number(process.env.PORT) || Number("8080");
listenWithFallback(server, port);
for (const signal of ["SIGINT", "SIGTERM"]) {
    process.on(signal, () => server.close(() => process.exit(0)));
}
