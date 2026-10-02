import { definePage, escapeHtml } from "../internal.js";

const script = `
<script type="module">
	import * as storage from "/js/storage.js";

	const root = document.querySelector("[data-ai]");
	const form = root.querySelector("[data-ai-form]");
	const input = root.querySelector("[data-ai-input]");
	const log = root.querySelector("[data-ai-log]");
	const modelSelect = root.querySelector("[data-ai-model]");
	const usage = root.querySelector("[data-ai-usage]");
	const status = root.querySelector("[data-ai-status]");
	const clearBtn = root.querySelector("[data-ai-clear]");

	const escapeHtml = value => String(value).replace(/[&<>"']/g, c =>
		({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

	const chatKey = "aiChats";
	const load = () => {
		const raw = storage.read(chatKey, null);
		return raw && Array.isArray(raw.messages)
			? raw
			: { model: "", messages: [], updatedAt: 0 };
	};
	const save = state => {
		state.updatedAt = Date.now();
		storage.write(chatKey, state);
	};
	let state = load();

	const render = () => {
		if (!state.messages.length) {
			log.innerHTML = '<p class="empty">ask me anything — free models, fair usage limits.</p>';
			return;
		}
		log.innerHTML = state.messages
			.map(message => \`<div class="bubble bubble--\${message.role}">
				<span class="bubble__who">\${message.role === "user" ? "you" : "ai"}</span>
				<p>\${escapeHtml(message.content).replace(/\\n/g, "<br>")}</p>
			</div>\`)
			.join("");
		log.scrollTop = log.scrollHeight;
	};
	render();

	const setUsage = usageInfo => {
		if (!usageInfo) { usage.textContent = ""; return; }
		usage.textContent = \`\${usageInfo.minuteLeft}/\${usageInfo.limits.perMinute} left this minute · \${usageInfo.dayLeft}/\${usageInfo.limits.perDay} left today\`;
	};

	const notify = (title, body) => {
		try {
			parent.postMessage({ type: "internal:notify", title, body }, parent.location.origin);
		} catch { }
	};

	const ask = async payload => {
		let lastError = null;
		// one retry — flaky networks occasionally drop the first attempt
		for (let attempt = 0; attempt < 2; attempt++) {
			try {
				const res = await fetch("/api/ai/chat", {
					method: "POST",
					headers: { "content-type": "application/json" },
					body: JSON.stringify(payload)
				});
				const data = await res.json().catch(() => ({}));
				if (!res.ok)
					throw Object.assign(new Error(data.error || "request failed"), { http: res.status });
				return data;
			}
			catch (error) {
				lastError = error;
				// only network drops are worth retrying — http errors (limits, bad
				// model) would just be repeated and burn quota
				const networkDrop = !error?.http;
				if (attempt === 0 && networkDrop) {
					await new Promise(resolve => setTimeout(resolve, 900));
					continue;
				}
				break;
			}
		}
		throw lastError;
	};

	form.addEventListener("submit", async event => {
		event.preventDefault();
		const text = input.value.trim();
		if (!text) return;
		input.value = "";
		state.messages.push({ role: "user", content: text });
		render();
		status.hidden = false;
		status.textContent = "thinking...";
		const model = modelSelect.value;
		state.model = model;
		save(state);
		try {
			const data = await ask({
				model,
				messages: state.messages.slice(-20),
				username: (storage.read("cloudsync", {}) || {}).username || ""
			});
			const reply = (data.text || "").trim() || "the model returned nothing.";
			state.messages.push({ role: "assistant", content: reply });
			setUsage(data.usage);
			notify("anaria ai", reply.slice(0, 120));
		} catch (error) {
			state.messages.push({ role: "assistant", content: \`error: \${String(error.message || error).toLowerCase()}\` });
		} finally {
			save(state);
			render();
			status.hidden = true;
			status.textContent = "";
			input.focus();
		}
	});

	clearBtn.addEventListener("click", () => {
		state = { model: modelSelect.value, messages: [], updatedAt: Date.now() };
		save(state);
		render();
	});

	input.addEventListener("keydown", event => {
		if (event.key === "Enter" && event.shiftKey) {
			event.preventDefault();
			input.value += "\\n";
		}
	});

	(async () => {
		try {
			const res = await fetch("/api/ai/models");
			const data = await res.json();
			const models = Array.isArray(data.models) ? data.models : [];
			modelSelect.innerHTML = models
				.map(model => \`<option value="\${escapeHtml(model.id)}">\${escapeHtml(model.label)} — \${escapeHtml(model.blurb)}</option>\`)
				.join("");
			if (state.model && models.some(model => model.id === state.model))
				modelSelect.value = state.model;
			if (data.limits)
				usage.textContent = \`\${data.limits.perMinute} msgs/min · \${data.limits.perDay} msgs/day for everyone\`;
		} catch {
			modelSelect.innerHTML = '<option>ai unavailable</option>';
		}
	})();
<\/script>`;

export const register = () => definePage("ai", {
    title: "ai",
    render: () => `
	<main class="internal internal--wide page-with-player" data-ai>
		<header class="page-head">
			<h1>ai</h1>
			<p>free openrouter models with fair usage caps for everyone.</p>
		</header>
		<div class="toolbar-inline">
			<select data-ai-model aria-label="model"></select>
			<span class="dim" data-ai-usage></span>
			<button type="button" class="btn" data-ai-clear>clear chat</button>
		</div>
		<div class="chatlog" data-ai-log></div>
		<p class="status-line" data-ai-status hidden></p>
		<form class="toolbar-inline" data-ai-form>
			<input type="text" data-ai-input placeholder="send a message..." aria-label="message" autocomplete="off">
			<button type="submit" class="btn btn--primary">send</button>
		</form>
		${script}
	</main>`
});
