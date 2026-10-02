import { definePage, escapeHtml } from "../internal.js";

// tmdb goes through /api/tmdb so the key stays on the server
const TMDB = "/api/tmdb";
// vidsrc.ru docs: /movie/{tmdbId} and /tv/{tmdbId}/{season}/{episode}
// optional params: autoplay, colour, autonextepisode, backbutton, logo, pausescreen, idlecheck
const VIDSRC = "https://vidsrc.ru";

const script = `
<script type="module">
	const TMDB = ${JSON.stringify(TMDB)};
	const VIDSRC = ${JSON.stringify(VIDSRC)};

	const root = document.querySelector("[data-movies]");
	const results = root.querySelector("[data-results]");
	const detail = root.querySelector("[data-detail]");
	const searchInput = root.querySelector("[data-movie-search]");
	const status = root.querySelector("[data-movie-status]");

	const escapeHtml = value => String(value).replace(/[&<>"']/g, c =>
		({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

	const api = async (path, params = {}) => {
		const query = new URLSearchParams({ language: "en-US" });
		for (const [name, value] of Object.entries(params))
			query.set(name, String(value));
		const res = await fetch(TMDB + path + "?" + query.toString());
		const data = await res.json().catch(() => ({}));
		if (!res.ok || data.success === false) {
			if (data.status_code === 7) {
				throw new Error("tmdb rejected the api key — the key likely still needs activating: open your tmdb account's api settings and click the confirmation link in the activation email.");
			}
			throw new Error(data.status_message || ("tmdb " + res.status));
		}
		return data;
	};

	const poster = (item, size = "w342") =>
		item.poster_path ? \`/api/img?path=\${encodeURIComponent(item.poster_path)}&w=\${size}\` : "";

	const backdrop = (item, size = "w780") =>
		item.backdrop_path ? \`/api/img?path=\${encodeURIComponent(item.backdrop_path)}&w=\${size}\` : "";

	const year = (item) => (item.release_date || item.first_air_date || "").slice(0, 4) || "—";

	const mediaType = (item) => item.media_type || (item.first_air_date ? "tv" : "movie");

	const star = \`<svg class="glyph" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2l2.9 6.3 6.9.8-5.1 4.7 1.4 6.8L12 17.2l-6.1 3.4 1.4-6.8L2.2 9.1l6.9-.8L12 2z"/></svg>\`;
	const rating = (item) => \`\${star} \${Number(item.vote_average || 0).toFixed(1)}\`;

	const cardHtml = (item, index) => \`
		<article class="card card--poster" data-index="\${index}">
			<img class="card__img" loading="lazy" src="\${poster(item)}" alt="">
			<div class="card__body">
				<h3>\${escapeHtml(item.title || item.name || "untitled")}</h3>
				<p class="dim">\${year(item)} · \${rating(item)}</p>
			</div>
		</article>\`;

	let currentResults = [];

	const renderResults = (items, heading) => {
		currentResults = items;
		root.querySelector("[data-heading]").textContent = heading;
		detail.hidden = true;
		results.hidden = false;
		if (!items.length) {
			results.innerHTML = '<p class="empty">nothing found.</p>';
			return;
		}
		results.innerHTML = items.map(cardHtml).join("");
	};

	const playerUrl = (item, season, episode) => {
		const base = mediaType(item) === "tv"
			? \`\${VIDSRC}/embed/tv/\${item.id}/\${season}/\${episode}\`
			: \`\${VIDSRC}/embed/movie/\${item.id}\`;
		const params = new URLSearchParams({
			autoplay: "true",
			colour: "00ff9d",
			pausescreen: "true"
		});
		if (mediaType(item) === "tv") params.set("autonextepisode", "true");
		return base + "?" + params.toString();
	};

	const openDetail = (item) => {
		results.hidden = true;
		detail.hidden = false;
		const isTv = mediaType(item) === "tv";
		const title = item.title || item.name || "untitled";
		detail.innerHTML = \`
			<button type="button" class="btn" data-back><svg class="glyph" viewBox="0 0 24 24" aria-hidden="true"><path d="M14.7 5.3a1 1 0 0 1 0 1.4L9.4 12l5.3 5.3a1 1 0 0 1-1.4 1.4l-6-6a1 1 0 0 1 0-1.4l6-6a1 1 0 0 1 1.4 0z"/></svg> back</button>
			<div class="detail" style="\${backdrop(item) ? \`background-image:linear-gradient(to bottom, rgba(0,0,0,.35), var(--bg)), url(\${backdrop(item, "w780")})\` : ""}">
				<img class="detail__poster" src="\${poster(item, "w500")}" alt="">
				<div class="detail__meta">
					<h2>\${escapeHtml(title)}</h2>
					<p class="dim">\${year(item)} · \${rating(item)} · \${isTv ? "tv show" : "movie"}</p>
					<p class="overview">\${escapeHtml(item.overview || "no overview available.")}</p>
					\${isTv ? \`
						<div class="episode-picker">
							<label>season <input type="number" min="1" value="1" data-season></label>
							<label>episode <input type="number" min="1" value="1" data-episode></label>
						</div>\` : ""}
					<div class="actions">
						<button type="button" class="btn btn--primary" data-play><svg class="glyph" viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5.5v13a1 1 0 0 0 1.5.87l11-6.5a1 1 0 0 0 0-1.74l-11-6.5A1 1 0 0 0 8 5.5z"/></svg> play</button>
						<a class="btn" target="_blank" rel="noreferrer" data-openlink href="#">open player in new tab</a>
					</div>
				</div>
			</div>\`;

		const syncLink = () => {
			const season = Number(detail.querySelector("[data-season]")?.value || 1);
			const episode = Number(detail.querySelector("[data-episode]")?.value || 1);
			detail.querySelector("[data-openlink]").href = playerUrl(item, season, episode);
		};
		syncLink();
		detail.querySelector("[data-back]").addEventListener("click", () => {
			detail.hidden = true;
			results.hidden = false;
		});
		detail.querySelectorAll("input[data-season], input[data-episode]")
			.forEach(input => input.addEventListener("input", syncLink));
		detail.querySelector("[data-play]").addEventListener("click", () => {
			const season = Number(detail.querySelector("[data-season]")?.value || 1);
			const episode = Number(detail.querySelector("[data-episode]")?.value || 1);
			const url = playerUrl(item, season, episode);
			// proxied player that opens inside this page (see app.js openEmbed)
			parent.postMessage({ type: "internal:embed", url, title }, parent.location.origin);
			syncLink();
		});
		syncLink();
		detail.scrollIntoView({ behavior: "smooth", block: "start" });
	};

	results.addEventListener("click", event => {
		const card = event.target.closest(".card");
		if (!card) return;
		const item = currentResults[Number(card.dataset.index)];
		if (item) openDetail(item);
	});

	const loadTrending = async () => {
		status.hidden = false;
		status.textContent = "loading...";
		try {
			const data = await api("/trending/all/week");
			renderResults((data.results || []).filter(item => item.media_type !== "person"), "trending this week");
		} catch (error) {
			results.innerHTML = \`<p class="empty">could not reach tmdb: \${escapeHtml(error.message)}</p>\`;
		} finally {
			status.hidden = true;
		}
	};

	const runSearch = async () => {
		const query = searchInput.value.trim();
		if (!query) { void loadTrending(); return; }
		status.hidden = false;
		status.textContent = "searching...";
		try {
			const data = await api("/search/multi", { query, include_adult: "false" });
			renderResults((data.results || []).filter(item => item.media_type !== "person"), \`results for "\${query}"\`);
		} catch (error) {
			results.innerHTML = \`<p class="empty">search failed: \${escapeHtml(error.message)}</p>\`;
		} finally {
			status.hidden = true;
		}
	};

	root.querySelector("[data-movie-form]").addEventListener("submit", event => {
		event.preventDefault();
		void runSearch();
	});
	root.querySelector("[data-trending]").addEventListener("click", () => {
		searchInput.value = "";
		void loadTrending();
	});

	void loadTrending();
<\/script>`;

export const register = () => definePage("movies", {
    title: "movies",
    render: () => `
	<main class="internal internal--wide" data-movies>
		<header class="page-head">
			<h1>movies</h1>
			<p>search tmdb, stream through vidsrc.</p>
		</header>
		<form class="toolbar-inline" data-movie-form>
			<input type="search" data-movie-search placeholder="search movies and tv..." aria-label="search movies and tv">
			<button type="submit" class="btn btn--primary">search</button>
			<button type="button" class="btn" data-trending>trending</button>
		</form>
		<p class="status-line" data-movie-status hidden></p>
		<h2 data-heading>trending this week</h2>
		<section class="grid grid--posters" data-results></section>
		<section data-detail hidden></section>
		${script}
	</main>`
});
