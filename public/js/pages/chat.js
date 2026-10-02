import { definePage, escapeHtml } from "../internal.js";

const script = `
<script type="module">
	import * as storage from "/js/storage.js";

	const root = document.querySelector("[data-chat]");
	const gate = root.querySelector("[data-chat-gate]");
	const shell = root.querySelector("[data-chat-shell]");
	const side = root.querySelector("[data-chat-side]");
	const viewSel = root.querySelector("[data-chat-view]");
	const head = root.querySelector("[data-chat-head]");
	const friendsPage = root.querySelector("[data-chat-friends]");
	const log = root.querySelector("[data-chat-log]");
	const form = root.querySelector("[data-chat-form]");
	const input = root.querySelector("[data-chat-input]");
	const status = root.querySelector("[data-chat-status]");
	const friendForm = root.querySelector("[data-friend-form]");
	const friendInput = root.querySelector("[data-friend-input]");
	const friendStatus = root.querySelector("[data-friend-status]");
	const friendMatches = root.querySelector("[data-friend-matches]");
	const friendList = root.querySelector("[data-friend-list]");

	const escapeHtml = value => String(value).replace(/[&<>"]/g, c =>
		({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

	/* --------------------------------- icons --------------------------------- */
	const svgHash = \`<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9.6 3h2.1l-.5 4h3.9l.5-4h2.1l-.5 4H21v2h-4.1l-.4 3H19v2h-3.7l-.5 4h-2.1l.5-4H9.3l-.5 4H6.7l.5-4H4v-2h3.5l.4-3H4V7h4.1l.5-4zm.6 6-.4 3h4.1l.4-3h-4.1z"/></svg>\`;
	const svgSend = \`<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3.3 20.4l17.4-7.5c.8-.4.8-1.5 0-1.8L3.3 3.6c-.7-.3-1.4.2-1.3.9L3 11l10 1-10 1-1 6.5c-.1.7.6 1.2 1.3.9z"/></svg>\`;
	const svgUserPlus = \`<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zm0 2c-3.3 0-7 1.7-7 4.5V20h14v-2.5C16 14.7 12.3 13 9 13zm10-3V8h2v2h2v2h-2v2h-2v-2h-2v-2h2z"/></svg>\`;
	const svgMsg = \`<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3c5.5 0 10 3.6 10 8s-4.5 8-10 8c-1.2 0-2.4-.2-3.4-.5L4 20.5l1.4-3.6C3.6 15.6 2 13.5 2 11c0-4.4 4.5-8 10-8z"/></svg>\`;
	const svgX = \`<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18.3 5.7L12 12l6.3 6.3-1.4 1.4L10.6 13.4 5.7 18.3 4.3 16.9 10.6 12 4.3 5.7 5.7 4.3 12 10.6l4.9-4.9z"/></svg>\`;
	const svgPeople = \`<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zm8 0a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM8 13c-3 0-6 1.5-6 3.8V19h12v-2.2C14 14.5 11 13 8 13zm8 .3c-.7 0-1.4.1-2 .3 1.2.9 2 2 2 3.2V19h6v-2c0-2.1-2.7-3.7-6-3.7z"/></svg>\`;

	const account = () => storage.read("cloudsync", null);
	const state = {
		username: "",
		users: [],
		threads: [],
		friends: [],
		view: "global",
		channel: "general",
		messages: [],
		lastAt: 0,
		timer: null
	};

	const say = (message, bad = false) => {
		status.hidden = !message;
		status.textContent = message || "";
		status.classList.toggle("is-error", bad);
	};
	const friendSay = (message, bad = false) => {
		friendStatus.hidden = !message;
		friendStatus.textContent = message || "";
		friendStatus.classList.toggle("is-error", bad);
	};

	const api = async (path, options = {}) => {
		const info = account();
		const res = await fetch(path, {
			headers: { "content-type": "application/json", "x-anaria-session": info?.token || "" },
			...options
		});
		const data = await res.json().catch(() => ({}));
		if (!res.ok) throw new Error(data.error || ("request failed (" + res.status + ")"));
		return data;
	};

	/* ------------------------------- helpers -------------------------------- */
	const hue = name => {
		let h = 0;
		for (const ch of String(name)) h = (h * 31 + ch.charCodeAt(0)) % 360;
		return h;
	};
	const avatar = name => \`<span class="dc-avatar" style="--av:\${hue(name)}">\${escapeHtml(String(name).slice(0, 1).toUpperCase())}</span>\`;
	const fmtTime = at => {
		const d = new Date(at);
		const today = new Date();
		const time = d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
		return d.toDateString() === today.toDateString()
			? time
			: d.toLocaleDateString([], { month: "short", day: "numeric" }) + ", " + time;
	};
	const channelLabel = () => {
		if (state.channel === "general") return "general";
		return state.channel.slice(3);
	};

	/* ------------------------------- sidebar -------------------------------- */
	const renderSide = () => {
		if (state.view === "global") {
			side.innerHTML = \`
				<p class="dc-side__label">text channels</p>
				<button type="button" class="dc-row dc-row--channel\${state.channel === "general" ? " is-active" : ""}" data-channel="general">
					\${svgHash}<span>general</span>
				</button>\`;
			return;
		}
		side.innerHTML = \`
			<p class="dc-side__label">direct messages</p>
			\${state.threads.length
				? state.threads.map(name => \`
					<button type="button" class="dc-row dc-row--dm\${state.channel === "dm:" + name ? " is-active" : ""}" data-channel="dm:\${escapeHtml(name)}">
						\${avatar(name)}<span>\${escapeHtml(name)}</span>
					</button>\`).join("")
				: '<p class="empty">no dm\\\'s yet — add a friend first.</p>'}\`;
	};

	/* ------------------------------ friends view ---------------------------- */
	const renderFriendMatches = () => {
		const query = friendInput.value.trim().toLowerCase();
		if (!query) {
			friendMatches.innerHTML = "";
			return;
		}
		const matches = state.users
			.filter(name => name.toLowerCase() !== state.username.toLowerCase() &&
				name.toLowerCase().includes(query))
			.slice(0, 8);
		friendMatches.innerHTML = matches.length
			? matches.map(name => \`
				<li class="dc-friend">
					\${avatar(name)}
					<strong>\${escapeHtml(name)}</strong>
					<button type="button" class="icon-btn icon-btn--accent" data-add="\${escapeHtml(name)}" aria-label="add friend">\${svgUserPlus}</button>
				</li>\`).join("")
			: '<li class="empty">no users match that name.</li>';
	};

	const renderFriendList = () => {
		root.querySelector("[data-friend-total]").textContent = String(state.friends.length);
		friendList.innerHTML = state.friends.length
			? state.friends.map(name => \`
				<li class="dc-friend">
					\${avatar(name)}
					<strong>\${escapeHtml(name)}</strong>
					<button type="button" class="icon-btn" data-dm="\${escapeHtml(name)}" aria-label="message">\${svgMsg}</button>
					<button type="button" class="icon-btn icon-btn--danger" data-remove="\${escapeHtml(name)}" aria-label="remove friend">\${svgX}</button>
				</li>\`).join("")
			: '<li class="empty">no friends yet — search for someone above.</li>';
	};

	const addFriend = async raw => {
		const name = String(raw ?? friendInput.value).trim().toLowerCase();
		if (!name) return;
		if (name === state.username.toLowerCase()) {
			friendSay("that is you.", true);
			return;
		}
		if (state.friends.includes(name)) {
			friendSay(name + " is already your friend.", true);
			return;
		}
		try {
			const data = await api("/api/chat/friends", {
				method: "POST",
				body: JSON.stringify({ username: name })
			});
			state.friends = Array.isArray(data.friends) ? data.friends : [...state.friends, name];
			friendSay("added " + name + ".");
			friendInput.value = "";
			renderFriendMatches();
			renderFriendList();
		} catch (error) {
			friendSay(error.message, true);
		}
	};

	const removeFriend = async name => {
		try {
			const data = await api("/api/chat/friends", {
				method: "POST",
				body: JSON.stringify({ username: name, remove: true })
			});
			state.friends = Array.isArray(data.friends) ? data.friends : state.friends.filter(f => f !== name);
			friendSay("removed " + name + ".");
			renderFriendList();
		} catch (error) {
			friendSay(error.message, true);
		}
	};

	/* --------------------------------- log ---------------------------------- */
	const renderLog = () => {
		if (!state.channel) return;
		const isDm = state.channel.startsWith("dm:");
		const label = channelLabel();
		head.innerHTML = isDm
			? \`\${avatar(label)}<strong>\${escapeHtml(label)}</strong>\`
			: \`\${svgHash}<strong>\${escapeHtml(label)}</strong>\`;
		input.placeholder = "message " + (isDm ? "@" + label : "#" + label);
		const messages = state.messages || [];
		log.innerHTML = messages.length
			? messages.map((message, index) => {
				const prev = messages[index - 1];
				const grouped = Boolean(prev) && prev.from === message.from &&
					(message.at - prev.at) < 5 * 60 * 1000;
				const mine = message.from === state.username;
				return \`<div class="dc-msg\${grouped ? " dc-msg--grouped" : ""}\${mine ? " dc-msg--me" : ""}">
					\${grouped
						? \`<span class="dc-msg__spacer"><time>\${fmtTime(message.at)}</time></span>\`
						: avatar(message.from)}
					<div class="dc-msg__body">
						\${grouped
							? ""
							: \`<span class="dc-msg__meta"><strong>\${escapeHtml(message.from)}</strong><time>\${fmtTime(message.at)}</time></span>\`}
						<p>\${escapeHtml(message.text).replace(/\\n/g, "<br>")}</p>
					</div>
				</div>\`;
			}).join("")
			: '<p class="empty">no messages yet — say hi!</p>';
		log.scrollTop = log.scrollHeight;
	};

	/* ------------------------------ main switch ----------------------------- */
	const renderMain = () => {
		if (!state.channel) {
			head.innerHTML = \`\${svgPeople}<strong>friends</strong>\`;
			friendsPage.hidden = false;
			log.hidden = true;
			form.hidden = true;
			renderFriendMatches();
			renderFriendList();
			return;
		}
		friendsPage.hidden = true;
		log.hidden = false;
		form.hidden = false;
		renderLog();
	};

	const renderAll = () => {
		viewSel.value = state.view;
		renderSide();
		renderMain();
	};

	/* ------------------------------ pull + select --------------------------- */
	const pull = async (full = false) => {
		if (!state.channel) return;
		try {
			const query = "?channel=" + encodeURIComponent(state.channel) +
				(full ? "" : "&since=" + state.lastAt);
			const data = await api("/api/chat/pull" + query);
			if (data.channel !== state.channel) return;
			const fresh = data.messages || [];
			if (fresh.length) {
				state.messages = full ? fresh : [...state.messages, ...fresh];
				state.lastAt = Math.max(state.lastAt, ...fresh.map(m => m.at));
				if (state.messages.length > 200)
					state.messages = state.messages.slice(-200);
				renderLog();
			} else if (full) {
				state.messages = [];
				renderLog();
			}
		} catch (error) {
			say(error.message, true);
		}
	};

	const openChannel = async channel => {
		state.channel = channel;
		state.messages = [];
		state.lastAt = 0;
		if (channel === "general") state.view = "global";
		else if (channel.startsWith("dm:")) state.view = "friends";
		renderAll();
		say("");
		await pull(true);
	};

	const openDm = name => {
		if (!state.threads.includes(name)) state.threads.push(name);
		void openChannel("dm:" + name);
	};

	/* --------------------------------- boot --------------------------------- */
	const boot = async () => {
		const info = account();
		if (!info?.token) {
			gate.hidden = false;
			shell.hidden = true;
			return;
		}
		gate.hidden = true;
		shell.hidden = false;
		try {
			const data = await api("/api/chat/channels");
			state.username = data.username;
			state.users = data.users || [];
			state.threads = data.threads || [];
			state.friends = data.friends || [];
			root.querySelector(".dc-composer__send").innerHTML = svgSend;
			root.querySelector("#dc-users").innerHTML =
				state.users.map(name => \`<option value="\${escapeHtml(name)}">\`).join("");
			await openChannel("general");
			clearInterval(state.timer);
			state.timer = setInterval(() => pull(false), 4000);
		} catch (error) {
			say(error.message, true);
		}
	};

	viewSel.addEventListener("change", () => {
		state.view = viewSel.value;
		if (state.view === "global") {
			if (state.channel !== "general") void openChannel("general");
			else renderAll();
		} else {
			// stay in a dm when one is open, otherwise show the friends page
			if (state.channel?.startsWith("dm:")) renderAll();
			else {
				state.channel = null;
				state.messages = [];
				renderAll();
			}
		}
	});

	side.addEventListener("click", event => {
		const item = event.target.closest("[data-channel]");
		if (item) void openChannel(item.dataset.channel);
	});

	friendForm.addEventListener("submit", event => {
		event.preventDefault();
		void addFriend();
	});
	friendInput.addEventListener("input", renderFriendMatches);
	friendMatches.addEventListener("click", event => {
		const button = event.target.closest("[data-add]");
		if (button) void addFriend(button.dataset.add);
	});
	friendList.addEventListener("click", event => {
		const dm = event.target.closest("[data-dm]");
		if (dm) { openDm(dm.dataset.dm); return; }
		const remove = event.target.closest("[data-remove]");
		if (remove) void removeFriend(remove.dataset.remove);
	});

	form.addEventListener("submit", async event => {
		event.preventDefault();
		const text = input.value.trim();
		if (!text || !state.channel) return;
		input.value = "";
		try {
			const data = await api("/api/chat/send", {
				method: "POST",
				body: JSON.stringify({ channel: state.channel, text })
			});
			state.messages.push(data.message);
			state.lastAt = Math.max(state.lastAt, data.message.at);
			const from = data.message.from.toLowerCase();
			if (state.channel === "dm:" + from && !state.threads.includes(from)) {
				state.threads.push(from);
				renderSide();
			}
			renderLog();
			say("");
		} catch (error) {
			say(error.message, true);
		}
	});

	document.addEventListener("visibilitychange", () => {
		if (!document.hidden) void pull(false);
	});

	void boot();
	window.addEventListener("storage", event => {
		if (event.key === "anaria:cloudsync") void boot();
	});
<\/script>`;

export const register = () => definePage("chat", {
    title: "chat",
    render: () => `
	<main class="internal internal--wide dc-page" data-chat>
		<header class="page-head">
			<h1>chat</h1>
			<p>anaria's own chat — a shared global channel, dm's and friends. runs on your cloudsync account.</p>
		</header>
		<p class="status-line" data-chat-status hidden></p>
		<section data-chat-gate hidden>
			<div class="panel">
				<h2>sign in to chat</h2>
				<p class="dim">chat needs a cloudsync account so your dm's and friends travel with you.</p>
				<div class="actions">
					<button type="button" class="btn btn--primary" data-open="anaria://cloudsync">open cloudsync</button>
				</div>
			</div>
		</section>
		<div class="dc" data-chat-shell hidden>
			<aside class="dc-side">
				<div class="dc-switch">
					<select data-chat-view aria-label="switch chat view">
						<option value="global">global chat</option>
						<option value="friends">friends</option>
					</select>
				</div>
				<div class="dc-side__body" data-chat-side></div>
			</aside>
			<section class="dc-main">
				<header class="dc-head" data-chat-head></header>
				<div class="dc-friends" data-chat-friends hidden>
					<form class="dc-addfriend" data-friend-form>
						<input type="text" data-friend-input placeholder="find a user to add..." aria-label="find a user" autocomplete="off" list="dc-users">
						<button type="submit" class="btn btn--primary">add friend</button>
					</form>
					<p class="status-line" data-friend-status hidden></p>
					<ul class="dc-friendlist" data-friend-matches></ul>
					<p class="dc-side__label">friends — <span data-friend-total>0</span></p>
					<ul class="dc-friendlist" data-friend-list></ul>
					<datalist id="dc-users"></datalist>
				</div>
				<div class="dc-log" data-chat-log></div>
				<form class="dc-composer" data-chat-form>
					<input type="text" data-chat-input placeholder="message #general" aria-label="message" autocomplete="off">
					<button type="submit" class="dc-composer__send" aria-label="send">${"" /* icon injected */}</button>
				</form>
			</section>
		</div>
		${script}
	</main>`
});
