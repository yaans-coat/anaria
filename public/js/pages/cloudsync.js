import { definePage, escapeHtml } from "../internal.js";

const script = `
<script type="module">
	import * as storage from "/js/storage.js";
	import { collect, download, applyImported } from "/js/export.js";

	const root = document.querySelector("[data-cloud]");
	const status = root.querySelector("[data-cloud-status]");
	const sessionBox = root.querySelector("[data-cloud-session]");
	const authBox = root.querySelector("[data-cloud-auth]");

	const escapeHtml = value => String(value).replace(/[&<>"']/g, c =>
		({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

	const accountKey = "cloudsync";
	const account = () => storage.read(accountKey, null) || null;
	const storeAccount = value => storage.write(accountKey, value);
	const say = (message, bad = false) => {
		status.hidden = false;
		status.textContent = message;
		status.classList.toggle("is-error", bad);
	};

	const sessionHtml = info => \`
		<div class="panel">
			<h2>signed in as \${escapeHtml(info.username)}</h2>
			<p class="dim">last sync: \${info.lastSync ? new Date(info.lastSync).toLocaleString() : "never"}</p>
			<div class="actions">
				<button type="button" class="btn btn--primary" data-sync-push>sync now (upload)</button>
				<button type="button" class="btn" data-sync-pull>download from cloud</button>
				<button type="button" class="btn" data-export>download my data (json)</button>
				<button type="button" class="btn" data-import>import json</button>
				<button type="button" class="btn" data-logout>log out</button>
				<button type="button" class="btn btn--danger" data-delete>delete account</button>
			</div>
		</div>
		<input type="file" accept="application/json" data-import-file hidden>\`;

	const render = () => {
		const info = account();
		sessionBox.hidden = !info;
		authBox.hidden = Boolean(info);
		if (info) sessionBox.innerHTML = sessionHtml(info);
	};

	const api = async (path, options = {}) => {
		const res = await fetch(path, {
			headers: { "content-type": "application/json" },
			...options
		});
		const data = await res.json().catch(() => ({}));
		if (!res.ok) throw new Error(data.error || ("request failed (" + res.status + ")"));
		return data;
	};

	root.addEventListener("submit", async event => {
		const form = event.target.closest("[data-auth-form]");
		if (!form) return;
		event.preventDefault();
		const username = form.querySelector("[name=username]").value.trim();
		const passcode = form.querySelector("[name=passcode]").value;
		const mode = form.dataset.authForm;
		if (mode === "register" && passcode !== form.querySelector("[name=confirm]").value) {
			say("passcodes do not match.", true);
			return;
		}
		say("working...");
		try {
			const data = await api("/api/sync/" + mode, {
				method: "POST",
				body: JSON.stringify({
					username,
					passcode,
					data: mode === "register" ? { bootstrappedAt: Date.now() } : undefined
				})
			});
			storeAccount({
				username: data.username || username,
				passcode,
				token: data.token,
				lastSync: Date.now()
			});
			say(mode === "register" ? "account created — you are in." : "welcome back.");
			render();
		} catch (error) {
			say(error.message, true);
		}
	});

	root.addEventListener("click", async event => {
		const info = account();
		const click = selector => event.target.closest(selector);

		if (click("[data-export]")) {
			download(\`anaria-\${info?.username || "data"}.json\`, collect());
			say("your data was downloaded as json.");
			return;
		}
		if (click("[data-import]")) {
			root.querySelector("[data-import-file]").click();
			return;
		}
		if (!info) return;

		if (click("[data-sync-push]")) {
			say("uploading...");
			try {
				const data = await api("/api/sync/push", {
					method: "POST",
					body: JSON.stringify({ token: info.token, data: collect() })
				});
				info.lastSync = data.updatedAt || Date.now();
				storeAccount(info);
				say("synced to the cloud.");
				render();
			} catch (error) {
				say(error.message, true);
			}
			return;
		}
		if (click("[data-sync-pull]")) {
			say("downloading...");
			try {
				const data = await api("/api/sync/pull?token=" + encodeURIComponent(info.token));
				if (!applyImported(data.data)) throw new Error("cloud payload looked wrong");
				info.lastSync = Date.now();
				storeAccount(info);
				say("cloud data applied — reloading...");
				setTimeout(() => location.reload(), 800);
			} catch (error) {
				say(error.message, true);
			}
			return;
		}
		if (click("[data-logout]")) {
			try { await api("/api/sync/logout", { method: "POST", body: JSON.stringify({ token: info.token }) }); } catch { }
			storeAccount(null);
			say("logged out.");
			render();
			return;
		}
		if (click("[data-delete]")) {
			const passcode = prompt("enter your passcode to delete the account");
			if (passcode === null) return;
			try {
				await api("/api/sync/delete", {
					method: "POST",
					body: JSON.stringify({ token: info.token, passcode })
				});
				storeAccount(null);
				say("account deleted.");
				render();
			} catch (error) {
				say(error.message, true);
			}
		}
	});

	root.addEventListener("change", async event => {
		const file = event.target.closest("[data-import-file]");
		if (!file || !file.files?.[0]) return;
		try {
			const payload = JSON.parse(await file.files[0].text());
			if (!applyImported(payload)) throw new Error("that file is not an anaria export");
			say("imported — reloading...");
			setTimeout(() => location.reload(), 800);
		} catch (error) {
			say(error.message, true);
		}
	});

	render();
<\/script>`;

export const register = () => definePage("cloudsync", {
    title: "cloudsync",
    render: () => `
	<main class="internal" data-cloud>
		<header class="page-head">
			<h1>cloudsync</h1>
			<p>username + passcode. your data travels with you — and you can take it all as json whenever you want.</p>
		</header>
		<p class="status-line" data-cloud-status hidden></p>
		<section data-cloud-auth>
			<form class="panel" data-auth-form="login">
				<h2>sign in</h2>
				<label class="field">username<input type="text" name="username" autocomplete="username" required></label>
				<label class="field">passcode<input type="password" name="passcode" autocomplete="current-password" required></label>
				<div class="actions"><button type="submit" class="btn btn--primary">sign in</button></div>
			</form>
			<form class="panel" data-auth-form="register">
				<h2>create account</h2>
				<label class="field">username<input type="text" name="username" autocomplete="username" required></label>
				<label class="field">passcode<input type="password" name="passcode" autocomplete="new-password" required></label>
				<label class="field">repeat passcode<input type="password" name="confirm" autocomplete="new-password" required></label>
				<div class="actions"><button type="submit" class="btn btn--primary">create</button></div>
			</form>
		</section>
		<section data-cloud-session hidden></section>
		<section class="panel">
			<h2>local data</h2>
			<p class="dim">everything anaria keeps on this device: settings, themes, history, cookies, games played, ai chats, saved music and chat threads.</p>
			<div class="actions">
				<button type="button" class="btn" data-export>download my data (json)</button>
			</div>
		</section>
		${script}
	</main>`
});
