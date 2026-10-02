import { definePage, escapeHtml } from "../internal.js";

/* --------------------------------- icons --------------------------------- */
const svgHeart = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21s-7.5-4.7-9.7-9C.9 8.9 2.6 5.3 6.1 4.6c2-.4 4 .4 5.1 2 1.1-1.6 3.1-2.4 5.1-2 3.5.7 5.2 4.3 3.8 7.4C19.5 16.3 12 21 12 21z"/></svg>';
const svgHeartOff = '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M12 20.5S5 16.2 3 12.3C1.6 9.5 3.1 6.4 6.2 5.8c1.8-.4 3.6.4 4.6 1.9l1.2 1.7 1.2-1.7c1-1.5 2.8-2.3 4.6-1.9 3.1.6 4.6 3.7 3.2 6.5-2 3.9-9 8.2-9 8.2z"/></svg>';
const svgPlay = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5.5v13l11-6.5z"/></svg>';
const svgPause = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 5h3.4v14H7zm6.6 0H17v14h-3.4z"/></svg>';
const svgBack = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5V2L7 6l5 4V7a6 6 0 1 1-6 6H4a8 8 0 1 0 8-8z"/></svg>';
const svgFwd = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5V2l5 4-5 4V7a6 6 0 1 0 6 6h2a8 8 0 1 1-8-8z"/></svg>';
const svgLoop = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 9l6 6-6 6"/></svg>';
const svgLoopOff = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 9l4 4-4 4"/></svg>';

/* --------------------------------- state --------------------------------- */
let activeTab = "search";
let currentResults = [];
let current = null;
let musicSource = "youtube";
let loopMode = "off";

/* --------------------------------- likes --------------------------------- */
const likedKey = "musicLiked";
function loadLiked() {
	var raw = localStorage.getItem(likedKey);
	if (Array.isArray(raw)) return JSON.parse(raw);
	var legacy = localStorage.getItem("musicSaved");
	var list = legacy ? JSON.parse(legacy) : [];
	if (list.length) localStorage.setItem(likedKey, JSON.stringify(list));
	return list;
}
function isLiked(track) {
	return loadLiked().some(function(item) {
		return String(item.id) === String(track.id);
	});
}
function toggleLike(track) {
	var items = loadLiked();
	var index = items.findIndex(function(item) {
		return String(item.id) === String(track.id);
	});
	if (index >= 0) items.splice(index, 1);
	else items.unshift(track);
	localStorage.setItem(likedKey, JSON.stringify(items));
	var likedCountEl = document.querySelector("[data-liked-count]");
	if (likedCountEl) likedCountEl.textContent = String(items.length);
	if (activeTab === "liked") {
		var listEl = document.querySelector("[data-music-results]");
		if (listEl) wireList(loadLiked());
	} else {
		refreshState();
	}
}

/* --------------------------------- rows ---------------------------------- */
function artHtml(track, cls) {
	var firstLetter = (track.title || "?").slice(0, 1).toUpperCase();
	var artwork = track.artwork ? '<img src="' + escapeHtml(track.artwork) + '" alt="" loading="lazy" onerror="this.remove()">' : "";
	return '<span class="' + cls + '" data-letter="' + escapeHtml(firstLetter) + '">' + artwork + '</span>';
}
function trackRow(track, index) {
	return '<li class="mp-row" data-index="' + index + '">' +
		artHtml(track, "mp-row__art") +
		'<div class="mp-row__meta">' +
			'<strong>' + escapeHtml(track.title || "untitled") + '</strong>' +
			'<span class="dim">' + escapeHtml(track.artist || "unknown artist") + '</span>' +
		'</div>' +
		'<button type="button" class="icon-btn mp-like" data-like data-track="' + escapeHtml(JSON.stringify(track)) + '" aria-label="like"></button>' +
		'<button type="button" class="icon-btn icon-btn--accent mp-row__play" data-rowplay aria-label="play">' + svgPlay + '</button>' +
	'</li>';
}
function albumRow(album, index) {
	var cover = album.cover ? '<img src="' + escapeHtml(album.cover) + '" alt="" style="width:100%;height:100%;object-fit:cover;">' : '<div style="height:100%;width:100%;background:var(--line);"></div>';
	return '<li class="al-row" data-index="' + index + '">' +
		'<span class="al-art" style="width:48px;height:48px;border-radius:8px;background:var(--bg-alt);color:var(--accent);display:grid;place-items:center;font-weight:700;overflow:hidden;">' + cover + '</span>' +
		'<div class="al-meta">' +
			'<strong style="font-size:13px;">' + escapeHtml(album.title || "unknown") + '</strong>' +
			'<span class="dim" style="font-size:11px;">' + escapeHtml(album.artist || "unknown artist") + '</span>' +
		'</div>' +
	'</li>';
}
function artistRow(artist, index) {
	var picture = artist.picture ? '<img src="' + escapeHtml(artist.picture) + '" alt="" style="width:100%;height:100%;object-fit:cover;">' : '<div style="width:100%;height:100%;background:var(--line);"></div>';
	return '<li class="art-row" data-index="' + index + '">' +
		'<span class="art-pic" style="width:48px;height:48px;border-radius:50%;background:var(--bg-alt);color:var(--fg-dim);font-size:11px;font-weight:700;display:grid;place-items:center;overflow:hidden;">' + picture + '</span>' +
		'<div class="art-meta">' +
			'<strong style="font-size:13px;">' + escapeHtml(artist.name || "unknown") + '</strong>' +
		'</div>' +
	'</li>';
}

/* --------------------------------- streamUrl --------------------------------- */
function streamUrl(track) {
	var params = "id=" + String(track.id);
	if (track.isrc) params += "&isrc=" + String(track.isrc);
	params += "&source=" + musicSource;
	if (track.title) params += "&title=" + String(track.title);
	if (track.artist) params += "&artist=" + String(track.artist);
	if (track.duration) params += "&duration=" + String(track.duration);
	return "/api/music/stream?" + params;
}

/* --------------------------------- fmtTime --------------------------------- */
function fmtTime(seconds) {
	if (!Number.isFinite(seconds)) return "0:00";
	var m = Math.floor(seconds / 60);
	var s = Math.floor(seconds % 60);
	return m + ":" + String(s).padStart(2, "0");
}

/* -------------------------------- player --------------------------------- */
function play(track) {
	current = track;
	var audioEl = document.querySelector("[data-audio]");
	if (audioEl) {
		audioEl.src = streamUrl(track);
		audioEl.play().catch(function() {
			var statusEl = document.querySelector("[data-music-status]");
			if (statusEl) {
				statusEl.hidden = false;
				statusEl.textContent = "press play to start audio.";
			}
		});
	}
	var nowTitleEl = document.querySelector("[data-now-title]");
	var nowArtistEl = document.querySelector("[data-now-artist]");
	var nowArtEl = document.querySelector("[data-now-art]");
	if (nowTitleEl) nowTitleEl.textContent = track.title || "untitled";
	if (nowArtistEl) nowArtistEl.textContent = track.artist || "unknown artist";
	if (nowArtEl) {
		var firstLetter = (track.title || "?").slice(0, 1).toUpperCase();
		nowArtEl.dataset.letter = firstLetter;
		nowArtEl.innerHTML = track.artwork
			? '<img src="' + escapeHtml(track.artwork) + '" alt="" onerror="this.remove;">'
			: "";
	}
	refreshState();
}
function toggleCurrent(track) {
	if (current && String(current.id) === String(track.id)) {
		var audioEl = document.querySelector("[data-audio]");
		if (audioEl) {
			if (audioEl.paused) audioEl.play().catch(function() {});
			else audioEl.pause();
		}
	} else {
		play(track);
	}
}
function refreshState() {
	var currentEl = current;
	for (var i = 0; i < currentResults.length; i++) {
		var row = document.querySelector(".mp-row[data-index='" + i + "']");
		if (!row) continue;
		var track = currentResults[i];
		if (!track) continue;
		var isCurrent = currentEl && String(currentEl.id) === String(track.id);
		row.classList.toggle("is-current", Boolean(isCurrent));
		var likeBtn = row.querySelector("[data-like]");
		if (likeBtn) {
			var liked = isLiked(track);
			likeBtn.classList.toggle("is-liked", liked);
			likeBtn.innerHTML = liked ? svgHeart : svgHeartOff;
		}
		var playBtn = row.querySelector("[data-rowplay]");
		if (playBtn) playBtn.innerHTML = isCurrent && !paused ? svgPause : svgPlay;
	}
	if (currentEl) {
		var liked = isLiked(currentEl);
		var nowLikeEl = document.querySelector("[data-now-like]");
		if (nowLikeEl) {
			nowLikeEl.classList.toggle("is-liked", liked);
			nowLikeEl.innerHTML = liked ? svgHeart : svgHeartOff;
		}
	}
	var playBtnEl = document.querySelector("[data-player-play]");
	if (playBtnEl) {
		playBtnEl.innerHTML = paused ? svgPlay : svgPause;
		playBtnEl.classList.toggle("is-playing", !paused);
	}
}

/* -------------------------------- wireList --------------------------------- */
function wireList(items) {
	currentResults = items;
	var listEl = document.querySelector("[data-music-results]");
	if (!listEl) return;
	var html = "";
	if (items.length > 0) {
		for (var i = 0; i < items.length; i++) {
			html += trackRow(items[i], i);
		}
	} else {
		html = '<li class="empty">nothing here yet.</li>';
	}
	listEl.innerHTML = html;
	refreshState();
}

/* -------------------------------- event delegation -------------------------------- */
document.addEventListener("click", function(event) {
	var row = event.target.closest(".mp-row");
	if (!row) return;
	var idx = Number(row.dataset.index);
	var track = currentResults[idx];
	if (!track) return;
	if (event.target.closest("[data-like]")) {
		toggleLike(track);
		return;
	}
	if (event.target.closest("[data-rowplay]")) {
		toggleCurrent(track);
		return;
	}
	play(track);
});

/* -------------------------------- now-like --------------------------------- */
var nowLikeEl = document.querySelector("[data-now-like]");
if (nowLikeEl) {
	nowLikeEl.addEventListener("click", function() {
		if (current) toggleLike(current);
	});
}

/* -------------------------------- tabs --------------------------------- */
function showTab(name) {
	activeTab = name;
	var tabs = document.querySelectorAll("[data-music-tab]");
	for (var i = 0; i < tabs.length; i++) {
		tabs[i].classList.toggle("is-active", tabs[i].dataset.musicTab === name);
	}
	var form = document.querySelector("[data-music-form]");
	if (form) form.hidden = name !== "search";
	if (name === "liked") {
		wireList(loadLiked());
	} else if (name === "search" && currentResults.length === 0) {
		var listEl = document.querySelector("[data-music-results]");
		if (listEl) listEl.innerHTML = '<li class="empty">search for something to play.</li>';
	}
}
var tabsEl = document.querySelectorAll("[data-music-tab]");
for (var i = 0; i < tabsEl.length; i++) {
	tabsEl[i].addEventListener("click", function() {
		showTab(this.dataset.musicTab);
	});
}

/* -------------------------------- search --------------------------------- */
function search() {
	var inputEl = document.querySelector("[data-music-search]");
	if (!inputEl) return;
	var query = inputEl.value.trim();
	if (!query) return;
	var statusEl = document.querySelector("[data-music-status]");
	if (statusEl) {
		statusEl.hidden = false;
		statusEl.textContent = "searching...";
	}
	var listEl = document.querySelector("[data-music-results]");
	if (listEl) listEl.innerHTML = '<li class="empty">searching...</li>';
	try {
		var xhr = new XMLHttpRequest();
		xhr.onreadystatechange = function() {
			if (xhr.readyState === 4) {
				if (xhr.status === 200) {
					try {
						var data = JSON.parse(xhr.responseText);
						var items = data.items || [];
						wireList(items);
						if (statusEl) {
							if (items.length === 0) statusEl.textContent = "no results.";
							else statusEl.hidden = true;
						}
					} catch(e) {
						if (listEl) listEl.innerHTML = '<li class="empty">' + escapeHtml(e.message) + '</li>';
						if (statusEl) statusEl.hidden = true;
					}
				} else {
					if (listEl) listEl.innerHTML = '<li class="empty">search failed.</li>';
					if (statusEl) statusEl.hidden = true;
				}
			}
		};
		xhr.open("GET", "/api/music/search?q=" + encodeURIComponent(query) + "&source=tidal&limit=20", true);
		xhr.send();
	} catch (error) {
		if (listEl) listEl.innerHTML = '<li class="empty">' + escapeHtml(error.message) + '</li>';
		if (statusEl) statusEl.hidden = true;
	}
};
var formEl = document.querySelector("[data-music-form]");
if (formEl) formEl.onsubmit = function(event) {
	event.preventDefault();
	search();
};

export const register = () => definePage("music", {
    title: "music",
    render: () => `<main class="internal internal--wide mp" data-music>
		<header class="page-head">
			<h1>music</h1>
			<p>powered by the x8rr/music api. <span data-liked-count>0</span> liked.</p>
		</header>
		<div class="tabs-row">
			<button type="button" class="tab-btn is-active" data-music-tab="search">search</button>
			<button type="button" class="tab-btn" data-music-tab="liked">liked songs</button>
		</div>
		<form class="toolbar-inline" data-music-form>
			<input type="search" data-music-search placeholder="what do you want to listen to?" aria-label="search for a track">
			<button type="submit" class="btn btn--primary">search</button>
		</form>
		<p class="status-line" data-music-status hidden></p>
		<ul class="tracks mp-list" data-music-results></ul>
		<div class="mp-player" data-player hidden>
			<span class="mp-player__art" data-now-art data-letter="?"></span>
			<div class="mp-player__meta">
				<strong data-now-title>nothing yet</strong>
				<span class="dim" data-now-artist></span>
			</div>
			<button type="button" class="icon-btn mp-like" data-now-like aria-label="like"></button>
			<div class="mp-player__transport">
				<button type="button" class="icon-btn" data-back10 aria-label="back 10 seconds"></button>
				<button type="button" class="icon-btn icon-btn--accent mp-player__play" data-player-play aria-label="play"></button>
				<button type="button" class="icon-btn" data-fwd10 aria-label="forward 10 seconds"></button>
				<button type="button" class="icon-btn" data-source-toggle aria-label="playback source" title="play via youtube"></button>
				<button type="button" class="icon-btn" data-loop-btn aria-label="loop" title="loop off"></button>
				<select data-speed-select aria-label="playback speed">
					<option value="1">1x</option>
				</select>
			</div>
			<div class="mp-player__timeline">
				<div class="mp-seek" data-seek><span data-seek-fill></span></div>
				<span class="mp-player__time dim" data-time>0:00 / 0:00</span>
			</div>
			<label class="mp-player__vol">
				<span class="dim">volume</span>
				<input type="range" min="0" max="1" step="0.01" value="1" data-volume aria-label="volume">
			</label>
			<audio data-audio preload="none"></audio>
		</div>
	</main>`
});
