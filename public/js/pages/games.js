import { definePage, escapeHtml } from "../internal.js";

const script = `
<script type="module">
	import * as storage from "/js/storage.js";

	const escapeHtml = value => String(value).replace(/[&<>"']/g, c =>
		({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

	const grid = document.querySelector("[data-grid]");
	const chipsHost = document.querySelector("[data-sources]");
	const countEl = document.querySelector("[data-source-count]");
	const statusEl = document.querySelector("[data-source-status]");
	const search = document.querySelector("[data-game-search]");

	let catalog = null;
	let active = storage.read("gamesSource", "all");
	if (typeof active !== "string") active = "all";

	/* ------------------------------ recently played ------------------------------ */
	const recentKey = "gamesPlayed";
	const loadRecent = () => {
		const raw = storage.read(recentKey, []);
		return Array.isArray(raw) ? raw : [];
	};
	const recordPlay = (title, url) => {
		const list = loadRecent();
		const existing = list.find(entry => entry.url === url);
		if (existing) {
			existing.plays = (existing.plays || 0) + 1;
			existing.at = Date.now();
		} else {
			list.unshift({ title, url, plays: 1, at: Date.now() });
		}
		storage.write(recentKey, list.slice(0, 200));
		renderRecent();
	};
	const renderRecent = () => {
		const host = document.querySelector("[data-recent]");
		if (!host) return;
		const list = loadRecent().slice(0, 6);
		host.hidden = !list.length;
		host.querySelector(".recent__list").innerHTML = list
			.map(entry => \`<li><a href="#" data-open="\${escapeHtml(entry.url)}">\${escapeHtml(entry.title)}</a> <span class="dim">x\${entry.plays}</span></li>\`)
			.join("");
	};

	/* ------------------------------ sources + grid ------------------------------ */
	const activeSource = () => catalog
		? (active === "all" ? null : catalog.sources.find(s => s.id === active) ?? null)
		: null;

	const renderChips = () => {
		if (!catalog) return;
		const sources = [
			{ id: "all", label: "all", count: catalog.total },
			...catalog.sources.map(s => ({ id: s.id, label: s.label, count: s.count }))
		];
		chipsHost.innerHTML = sources.map(source => \`
			<button type="button" class="src-chip\${source.id === active ? " src-chip--on" : ""}" data-src="\${escapeHtml(source.id)}">
				<span>\${escapeHtml(source.label)}</span><b>\${source.count}</b>
			</button>\`).join("");
		const src = activeSource();
		countEl.textContent = src
			? \`\${src.count} games in \${src.label} · \${catalog.total} total\`
			: \`\${catalog.total} games across \${catalog.sources.length} sources\`;
	};

	const cardHtml = game => \`
		<article class="card" data-open="\${escapeHtml(game.url)}" data-name="\${escapeHtml(game.name)}">
			<div class="card__art" data-letter="\${escapeHtml(game.name.slice(0, 1).toUpperCase())}" aria-hidden="true">\${game.img ? \`<img src="\${escapeHtml(game.img)}" loading="lazy" alt="" onerror="this.remove()">\` : ""}</div>
			<div class="card__body">
				<h3>\${escapeHtml(game.name)}</h3>
				<p class="dim">\${escapeHtml(game.source)}</p>
			</div>
			<span class="card__play">play</span>
		</article>\`;

	const renderGrid = () => {
		if (!catalog) return;
		const needle = search.value.trim().toLowerCase();
		const items = [];
		for (const source of catalog.sources) {
			if (active !== "all" && source.id !== active) continue;
			for (const game of source.games) {
				items.push({
					name: game.name,
					url: game.url,
					img: game.img || "",
					source: source.label
				});
			}
		}
		const visible = needle
			? items.filter(game => game.name.toLowerCase().includes(needle) ||
				game.source.toLowerCase().includes(needle))
			: items;
		grid.innerHTML = visible.length
			? visible.map(cardHtml).join("")
			: '<p class="empty">no games match that filter.</p>';
		if (needle) {
			countEl.textContent = \`\${visible.length} matching · \${catalog.total} games in total\`;
		} else {
			const src = activeSource();
			countEl.textContent = src
				? \`\${src.count} games in \${src.label} · \${catalog.total} total\`
				: \`\${catalog.total} games across \${catalog.sources.length} sources\`;
		}
	};

	chipsHost.addEventListener("click", event => {
		const chip = event.target.closest(".src-chip");
		if (!chip) return;
		active = chip.dataset.src || "all";
		storage.write("gamesSource", active);
		renderChips();
		renderGrid();
	});

	search.addEventListener("input", renderGrid);

	// whole card is the play target — record it for the recent list
	document.addEventListener("click", event => {
		const card = event.target.closest(".card[data-name]");
		if (!card) return;
		recordPlay(card.dataset.name, card.dataset.open);
	});

	/* --------------------------------- boot --------------------------------- */
	const load = async () => {
		try {
			const res = await fetch("/api/games");
			const data = await res.json();
			if (!res.ok || !data.ok) throw new Error(data.error || "could not load sources");
			catalog = data;
			if (active !== "all" && !data.sources.some(s => s.id === active)) active = "all";
			statusEl.hidden = true;
			renderChips();
			renderGrid();
		} catch (error) {
			statusEl.hidden = false;
			statusEl.textContent = "game sources failed to load: " + error.message;
			grid.innerHTML = '<p class="empty">no games to show right now.</p>';
		}
	};
	load();
	renderRecent();
<\/script>`;

export const register = () => definePage("games", {
    title: "games",
    render: () => `
	<main class="internal internal--wide">
		<header class="page-head">
			<h1>games</h1>
			<p>seraph, truffled, ckv, ugs and the anaria-local collection — played through the proxy.</p>
		</header>
		<div class="toolbar-inline">
			<input type="search" data-game-search placeholder="filter games..." aria-label="filter games">
		</div>
		<div class="src-bar">
			<div class="src-chips" data-sources></div>
			<p class="src-count dim" data-source-count></p>
			<p class="status-line" data-source-status hidden></p>
		</div>
		<section class="recent" data-recent hidden>
			<h2>recently played</h2>
			<ul class="recent__list"></ul>
		</section>
		<section class="grid" data-grid>
			<p class="dim">loading game sources...</p>
		</section>
		${script}
	</main>`
});
