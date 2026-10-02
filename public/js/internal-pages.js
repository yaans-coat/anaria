import { definePage, escapeHtml, listPages } from "./internal.js";
import { engine } from "./engine.js";
import * as visitLog from "./history.js";
import * as bookmarks from "./bookmarks.js";
import * as gamesPage from "./pages/games.js";
import * as moviesPage from "./pages/movies.js";
import * as musicPage from "./pages/music.js";
import * as aiPage from "./pages/ai.js";
import * as chatPage from "./pages/chat.js";
import * as cloudsyncPage from "./pages/cloudsync.js";
import * as staticPages from "./pages/static.js";

const destinations = [
    { url: "anaria://games", label: "games", note: "html5 games" },
    { url: "anaria://movies", label: "movies", note: "tmdb + vidsrc" },
    { url: "anaria://music", label: "music", note: "x8rr music api" },
    { url: "anaria://chat", label: "chat", note: "dm's + general" },
    { url: "anaria://ai", label: "ai", note: "free models" },
    { url: "anaria://cloudsync", label: "cloudsync", note: "account + export" }
];

// rotating greetings shown under the big title on the home page
const homeQuips = [
    "hiya!",
    "yello? banana?",
    "howdy.",
    "welcome!",
    "why do people even use gn-math (jokes no hate guys)",
    "it's.. anananananananananaririraaaaaa",
    "hallo madarlavars",
    "greetings beery, thanks for the leak ig?",
    "sydneyfig, beery and idk are goated",
    "love to ocean",
    "blackwaves's better long lost cousin",
    "javascript is such a beautiful coding language",
    "the social network, peak movie",
    "wanna watch a movie?",
    "let's play some games!!"
];

// svg glyphs only — no letters, no emoji
const quickSites = [
    { label: "youtube", url: "https://www.youtube.com", path: "M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z" },
    { label: "tiktok", url: "https://www.tiktok.com", path: "M12.525.02c1.31-.02 2.61-.01 3.91-.02.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-.93-.01 2.92.01 5.84-.02 8.75-.08 1.4-.54 2.79-1.35 3.94-1.31 1.92-3.58 3.17-5.91 3.21-1.43.08-2.86-.31-4.08-1.03-2.02-1.19-3.44-3.37-3.65-5.71-.02-.5-.03-1-.01-1.49.18-1.9 1.12-3.72 2.58-4.96 1.66-1.44 3.98-2.13 6.15-1.72.02 1.48-.04 2.96-.04 4.44-.99-.32-2.15-.23-3.02.37-.63.41-1.11 1.04-1.36 1.75-.21.51-.15 1.07-.14 1.61.24 1.64 1.82 3.02 3.5 2.87 1.12-.01 2.19-.66 2.77-1.61.19-.33.4-.67.41-1.06.1-1.79.06-3.57.07-5.36.01-4.03-.01-8.05.02-12.07z" },
    { label: "geforce now", url: "https://play.geforcenow.com", path: "M8.948 8.798v-1.43a6.7 6.7 0 0 1 .424-.018c3.922-.124 6.493 3.374 6.493 3.374s-2.774 3.851-5.75 3.851c-.398 0-.787-.062-1.158-.185v-4.346c1.528.185 1.837.857 2.747 2.385l2.04-1.714s-1.492-1.952-4-1.952a6.016 6.016 0 0 0-.796.035m0-4.735v2.138l.424-.027c5.45-.185 9.01 4.47 9.01 4.47s-4.08 4.964-8.33 4.964c-.37 0-.733-.035-1.095-.097v1.325c.3.035.61.062.91.062 3.957 0 6.82-2.023 9.593-4.408.459.371 2.34 1.263 2.73 1.652-2.633 2.208-8.772 3.984-12.253 3.984-.335 0-.653-.018-.971-.053v1.864H24V4.063zm0 10.326v1.131c-3.657-.654-4.673-4.46-4.673-4.46s1.758-1.944 4.673-2.262v1.237H8.94c-1.528-.186-2.73 1.245-2.73 1.245s.68 2.412 2.739 3.11M2.456 10.9s2.164-3.197 6.5-3.533V6.201C4.153 6.59 0 10.653 0 10.653s2.35 6.802 8.948 7.42v-1.237c-4.84-.6-6.492-5.936-6.492-5.936z" },
    { label: "now.gg", url: "https://now.gg", path: "M4 4h16a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-6l-4 4v-4H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2zm4.5 4.5v3H10v1.5h1.5V15h1.5v-2H14.5V11.5H16V10h-1.5V8.5H13V10h-1.5V8.5zm6 0a1.5 1.5 0 1 1 0 3 1.5 1.5 0 0 1 0-3z" },
    { label: "github", url: "https://github.com", path: "M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12" },
    { label: "x", url: "https://x.com", path: "M14.234 10.162 22.977 0h-2.072l-7.591 8.824L7.251 0H.258l9.168 13.343L.258 24H2.33l8.016-9.318L16.749 24h6.993zm-2.837 3.299-.929-1.329L3.076 1.56h3.182l5.965 8.532.929 1.329 7.754 11.09h-3.182z" },
    { label: "reddit", url: "https://www.reddit.com", path: "M12 0C5.373 0 0 5.373 0 12c0 3.314 1.343 6.314 3.515 8.485l-2.286 2.286C.775 23.225 1.097 24 1.738 24H12c6.627 0 12-5.373 12-12S18.627 0 12 0Zm4.388 3.199c1.104 0 1.999.895 1.999 1.999 0 1.105-.895 2-1.999 2-.946 0-1.739-.657-1.947-1.539v.002c-1.147.162-2.032 1.15-2.032 2.341v.007c1.776.067 3.4.567 4.686 1.363.473-.363 1.064-.58 1.707-.58 1.547 0 2.802 1.254 2.802 2.802 0 1.117-.655 2.081-1.601 2.531-.088 3.256-3.637 5.876-7.997 5.876-4.361 0-7.905-2.617-7.998-5.87-.954-.447-1.614-1.415-1.614-2.538 0-1.548 1.255-2.802 2.803-2.802.645 0 1.239.218 1.712.585 1.275-.79 2.881-1.291 4.64-1.365v-.01c0-1.663 1.263-3.034 2.88-3.207.188-.911.993-1.595 1.959-1.595Zm-8.085 8.376c-.784 0-1.459.78-1.506 1.797-.047 1.016.64 1.429 1.426 1.429.786 0 1.371-.369 1.418-1.385.047-1.017-.553-1.841-1.338-1.841Zm7.406 0c-.786 0-1.385.824-1.338 1.841.047 1.017.634 1.385 1.418 1.385.785 0 1.473-.413 1.426-1.429-.046-1.017-.721-1.797-1.506-1.797Zm-3.703 4.013c-.974 0-1.907.048-2.77.135-.147.015-.241.168-.183.305.483 1.154 1.622 1.964 2.953 1.964 1.33 0 2.47-.81 2.953-1.964.057-.137-.037-.29-.184-.305-.863-.087-1.795-.135-2.769-.135Z" },
    { label: "wikipedia", url: "https://www.wikipedia.org", path: "M12.09 13.119c-.936 1.932-2.217 4.548-2.853 5.728-.616 1.074-1.127.931-1.532.029-1.406-3.321-4.293-9.144-5.651-12.409-.251-.601-.441-.987-.619-1.139-.181-.15-.554-.24-1.122-.271C.103 5.033 0 4.982 0 4.898v-.455l.052-.045c.924-.005 5.401 0 5.401 0l.051.045v.434c0 .119-.075.176-.225.176l-.564.031c-.485.029-.727.164-.727.436 0 .135.053.33.166.601 1.082 2.646 4.818 10.521 4.818 10.521l.136.046 2.411-4.81-.482-1.067-1.658-3.264s-.318-.654-.428-.872c-.728-1.443-.712-1.518-1.447-1.617-.207-.023-.313-.05-.313-.149v-.468l.06-.045h4.292l.113.037v.451c0 .105-.076.15-.227.15l-.308.047c-.792.061-.661.381-.136 1.422l1.582 3.252 1.758-3.504c.293-.64.233-.801.111-.947-.07-.084-.305-.22-.812-.24l-.201-.021c-.052 0-.098-.015-.145-.051-.045-.031-.067-.076-.067-.129v-.427l.061-.045c1.247-.008 4.043 0 4.043 0l.059.045v.436c0 .121-.059.178-.193.178-.646.03-.782.095-1.023.439-.12.186-.375.589-.646 1.039l-2.301 4.273-.065.135 2.792 5.712.17.048 4.396-10.438c.154-.422.129-.722-.064-.895-.197-.172-.346-.273-.857-.295l-.42-.016c-.061 0-.105-.014-.152-.045-.043-.029-.072-.075-.072-.119v-.436l.059-.045h4.961l.041.045v.437c0 .119-.074.18-.209.18-.648.03-1.127.18-1.443.421-.314.255-.557.616-.736 1.067 0 0-4.043 9.258-5.426 12.339-.525 1.007-1.053.917-1.503-.031-.571-1.171-1.773-3.786-2.646-5.71l.053-.036z" },
    { label: "discord", url: "https://discord.com/app", path: "M20.317 4.3698a19.7913 19.7913 0 00-4.8851-1.5152.0741.0741 0 00-.0785.0371c-.211.3753-.4447.8648-.6083 1.2495-1.8447-.2762-3.68-.2762-5.4868 0-.1636-.3933-.4058-.8742-.6177-1.2495a.077.077 0 00-.0785-.037 19.7363 19.7363 0 00-4.8852 1.515.0699.0699 0 00-.0321.0277C.5334 9.0458-.319 13.5799.0992 18.0578a.0824.0824 0 00.0312.0561c2.0528 1.5076 4.0413 2.4228 5.9929 3.0294a.0777.0777 0 00.0842-.0276c.4616-.6304.8731-1.2952 1.226-1.9942a.076.076 0 00-.0416-.1057c-.6528-.2476-1.2743-.5495-1.8722-.8923a.077.077 0 01-.0076-.1277c.1258-.0943.2517-.1923.3718-.2914a.0743.0743 0 01.0776-.0105c3.9278 1.7933 8.18 1.7933 12.0614 0a.0739.0739 0 01.0785.0095c.1202.099.246.1981.3728.2924a.077.077 0 01-.0066.1276 12.2986 12.2986 0 01-1.873.8914.0766.0766 0 00-.0407.1067c.3604.698.7719 1.3628 1.225 1.9932a.076.076 0 00.0842.0286c1.961-.6067 3.9495-1.5219 6.0023-3.0294a.077.077 0 00.0313-.0552c.5004-5.177-.8382-9.6739-3.5485-13.6604a.061.061 0 00-.0312-.0286zM8.02 15.3312c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9555-2.4189 2.157-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.9555 2.4189-2.1569 2.4189zm7.9748 0c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9554-2.4189 2.1569-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.946 2.4189-2.1568 2.4189Z" },
    { label: "twitch", url: "https://www.twitch.tv", path: "M11.571 4.714h1.715v5.143H11.57zm4.715 0H18v5.143h-1.714zM6 0L1.714 4.286v15.428h5.143V24l4.286-4.286h3.428L22.286 12V0zm14.571 11.143l-3.428 3.428h-3.429l-3 3v-3H6.857V1.714h13.714Z" }
];

const homeScript = `
<script type="module">
	const quips = ${JSON.stringify(homeQuips)};
	const quipEl = document.querySelector("[data-home-quip]");
	const canvas = document.querySelector("[data-home-snow]");
	const form = document.querySelector("[data-home-search]");
	const input = form?.querySelector("input");

	// shuffle so the greetings always show up in a random order
	let order = [];
	const reshuffle = () => {
		order = [...quips];
		for (let i = order.length - 1; i > 0; i--) {
			const j = Math.floor(Math.random() * (i + 1));
			[order[i], order[j]] = [order[j], order[i]];
		}
	};
	reshuffle();
	let quipIndex = 0;
	const nextQuip = () => {
		if (quipIndex >= order.length) { reshuffle(); quipIndex = 0; }
		if (quipEl) quipEl.textContent = order[quipIndex++];
	};
	nextQuip();
	setInterval(nextQuip, 4200);

	const readSnow = () => {
		try {
			const raw = localStorage.getItem("anaria:settings");
			const value = raw ? (JSON.parse(raw).value || {}) : {};
			return value.snow !== false;
		} catch { return true; }
	};

	// falling snow, only when the setting is on
	let flakes = [];
	let running = false;
	let ctx = null;
	const resize = () => {
		if (!canvas) return;
		canvas.width = canvas.offsetWidth;
		canvas.height = canvas.offsetHeight;
	};
	const spawn = () => ({
		x: Math.random() * (canvas?.width || 1),
		y: -8 - Math.random() * (canvas?.height || 300),
		r: 1 + Math.random() * 2.4,
		speed: .35 + Math.random() * .8,
		drift: (Math.random() - .5) * .4,
		alpha: .35 + Math.random() * .55
	});
	const tick = () => {
		if (!running || !canvas) return;
		ctx = ctx || canvas.getContext("2d");
		ctx.clearRect(0, 0, canvas.width, canvas.height);
		for (const flake of flakes) {
			flake.y += flake.speed;
			flake.x += flake.drift;
			if (flake.y > canvas.height + 6) Object.assign(flake, spawn(), { y: -6 });
			ctx.globalAlpha = flake.alpha;
			ctx.fillStyle = "#eaf3ff";
			ctx.beginPath();
			ctx.arc(flake.x, flake.y, flake.r, 0, Math.PI * 2);
			ctx.fill();
		}
		ctx.globalAlpha = 1;
		requestAnimationFrame(tick);
	};
	const syncSnow = () => {
		const on = readSnow();
		if (on && !running) {
			running = true;
			resize();
			if (!flakes.length)
				flakes = Array.from({ length: 70 }, spawn);
			requestAnimationFrame(tick);
		} else if (!on) {
			running = false;
			ctx?.clearRect(0, 0, canvas?.width || 0, canvas?.height || 0);
		}
	};
	addEventListener("resize", () => { if (running) { resize(); if (!flakes.length) flakes = Array.from({ length: 70 }, spawn); } });
	syncSnow();
	// settings toggles write to localStorage — pick the change up live
	setInterval(syncSnow, 1200);

	form?.addEventListener("submit", event => {
		event.preventDefault();
		const text = (input?.value || "").trim();
		if (!text) return;
		if (input) input.value = "";
		parent.postMessage({ type: "internal:open", url: text }, parent.location.origin);
	});
<\/script>`;

export const registerInternalPages = () => {
    definePage("home", {
        title: "new tab",
        render: () => `
		<main class="internal internal--wide home-page">
			<canvas class="home-snow" data-home-snow aria-hidden="true"></canvas>
			<section class="home-hero">
				<div class="home-window" aria-hidden="true">
					<span class="home-window__dots"><i></i><i></i><i></i></span>
					<span class="home-window__pill">
						<svg viewBox="0 0 24 24"><path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm0 2.4c1.6 0 3.7 3.6 4.3 9.2-.7.5-2.5 6.6-4.3 6.6s-3.6-6.1-4.3-6.6C8.3 8 10.4 4.4 12 4.4zM4.3 10.9c1.4-.5 4.6.7 6.7 2.6-.9 3-1.9 5.5-2.7 6.5A8.6 8.6 0 0 1 4.3 10.9zm15.4 0a8.6 8.6 0 0 1-3.9 9.1c-.8-1-1.8-3.5-2.7-6.5 2.1-1.9 5.3-3.1 6.7-2.6z"/></svg>
					</span>
				</div>
				<h1 class="home-title">anariav3!</h1>
				<p class="home-quip" data-home-quip></p>
				<form class="home-search" data-home-search role="search">
					<svg class="home-search__icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M10 2a8 8 0 1 0 4.9 14.32l4.39 4.39 1.42-1.42-4.39-4.39A8 8 0 0 0 10 2zm0 2a6 6 0 1 1 0 12 6 6 0 0 1 0-12z"/></svg>
					<input type="text" placeholder="search or enter address" autocomplete="off" autocapitalize="off" spellcheck="false" aria-label="search">
					<button type="submit" class="home-search__go" aria-label="go">
						<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M13 5l7 7-7 7v-4.5H4v-5h9V5z"/></svg>
					</button>
				</form>
				<div class="quicksites">
					${quickSites
            .map(site => `
						<a class="quicksite" href="${site.url}" data-open="${site.url}" title="${escapeHtml(site.label)}" aria-label="${escapeHtml(site.label)}">
							<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${site.path}"/></svg>
						</a>`)
            .join("")}
				</div>
			</section>
			${homeScript}
		</main>`
    });

    definePage("about", {
        title: "about",
        render: () => {
            const sj = window.$scramjet;
            const facts = [
                ["engine", "Scramjet"],
                ["version", sj?.versionInfo?.version ?? "2.0.67-alpha.2"],
                [
                    "transport",
                    engine.getTransport?.().kind ?? "libcurl"
                ],
                ["cross-origin isolated", crossOriginIsolated ? "yes" : "no"],
                [
                    "service worker",
                    navigator.serviceWorker?.controller?.scriptURL ??
                        "not controlling"
                ],
                ["repo", `<a href="https://github.com/yaans-coat/anariav3" data-open="https://github.com/yaans-coat/anariav3">github.com/yaans-coat/anariav3</a>`]
            ];
            return `
		<main class="internal">
			<h1>about</h1>
			<ul>
				${facts
                    .map(([k, v]) => `<li>${escapeHtml(k)}: <span class="dim">${v.startsWith("<a") ? v : escapeHtml(v)}</span></li>`)
                    .join("")}
			</ul>
			<h2>short urls</h2>
			<ul>
				${[
        "/", "/g", "/mov", "/msc", "/c", "/a",
        "/contact", "/tos", "/p", "/dmca", "/cloudsync", "/settings"
    ].map(path => `<li><a href="#" data-open="${path}">${path === "/" ? "/ (home)" : path}</a></li>`).join("")}
			</ul>
		</main>`;
        }
    });

    definePage("history", {
        title: "history",
        render: () => {
            const groups = visitLog.grouped();
            if (!groups.length) {
                return `<main class="internal"><h1>history</h1><p>empty</p></main>`;
            }
            return `
		<main class="internal">
			<h1>history</h1>
			<div class="actions"><button type="button" data-action="clear-history">clear</button></div>
			${groups
                .map(group => `
				<h2>${escapeHtml(group.day)}</h2>
				<ul>
					${group.items
                    .map(entry => `<li><a href="#" data-open="${escapeHtml(entry.url)}">${escapeHtml(entry.title || entry.url)}</a> <span class="dim">${escapeHtml(entry.url)}</span></li>`)
                    .join("")}
				</ul>`)
                .join("")}
		</main>`;
        }
    });

    definePage("bookmarks", {
        title: "bookmarks",
        render: () => {
            const items = bookmarks.all();
            if (!items.length) {
                return `<main class="internal"><h1>bookmarks</h1><p>use the bookmark button to add one</p></main>`;
            }
            return `
		<main class="internal">
			<h1>bookmarks</h1>
			<ul>
				${items
                    .map(item => `<li><a href="#" data-open="${escapeHtml(item.url)}">${escapeHtml(item.title)}</a> <span class="dim">${escapeHtml(item.url)}</span></li>`)
                    .join("")}
			</ul>
		</main>`;
        }
    });

    gamesPage.register();
    moviesPage.register();
    musicPage.register();
    aiPage.register();
    chatPage.register();
    cloudsyncPage.register();
    staticPages.register();
};

export { listPages };
