import { definePage, escapeHtml } from "../internal.js";

const blocks = (sections) => sections
    .map(section => `<h2>${escapeHtml(section[0])}</h2>${section[1]}`)
    .join("");

const page = (title, intro, sections) => definePage(title, {
    title,
    render: () => `
	<main class="internal">
		<header class="page-head">
			<h1>${escapeHtml(title)}</h1>
			<p>${escapeHtml(intro)}</p>
		</header>
		${blocks(sections)}
	</main>`
});

export const register = () => {
    page("tos", "the deal between you and anaria.", [
        ["using anaria", `<p>anaria is a browser proxy and a small collection of tools. by using it you agree to
			use it politely: no attacking other people, no illegal content, no trying to break the service
			for everyone else.</p>`],
        ["your account", `<p>cloudsync accounts are a simple username and passcode. they exist only so your
			settings and data can follow you around. you can delete your account at any time from the
			cloudsync page, and you can download everything we store as json.</p>`],
        ["third party sites", `<p>anaria lets you reach other websites. those sites have their own rules —
			we do not control them and we are not responsible for what lives there.</p>`],
        ["changes", `<p>features change as the project grows. when these terms change materially the date at
			the bottom of this page is updated.</p>`],
        ["last updated", `<p class="dim">october 2026</p>`]
    ]);

    page("p", "how anaria treats your data.", [
        ["what we store", `<p>anaria runs mostly in your browser. history, bookmarks, settings, themes,
			games played, ai chats, saved music and chat threads live in your browser's local storage
			unless you switch on cloudsync.</p>`],
        ["cloudsync", `<p>if you create an account, your username, a salted hash of your passcode and a
			synced copy of your data are stored on the anaria server. we never see your passcode in plain
			text, and you can wipe the account whenever you like.</p>`],
        ["api keys", `<p>the openrouter key used for ai and the tmdb key used for movie metadata both
			stay on the server and are never shipped to your browser.</p>`],
        ["browsing history and cookies", `<p>you decide whether history and cookies are kept — both toggles
			live in settings, under advanced. clearing them removes them from this device immediately.</p>`],
        ["no selling", `<p>anaria does not sell data. there are no ad networks, no trackers and no analytics
			beacons baked into the app.</p>`],
        ["last updated", `<p class="dim">october 2026</p>`]
    ]);

    page("dmca", "how to reach us about content.", [
        ["what this is", `<p>anaria is a proxy: it displays content that already lives on the public
			internet, at the request of the person browsing. we do not host, store or index movies, music,
			games or any other media.</p>`],
        ["filing a request", `<p>if you believe content you own is being reached through anaria and you want
			it addressed, send a notice with:</p>
			<ul>
				<li>your name and contact details</li>
				<li>the exact url(s) in question</li>
				<li>proof that you own the material</li>
				<li>a statement that the notice is accurate</li>
			</ul>`],
        ["what happens next", `<p>we review valid notices and, where appropriate, block the specific url from
			being routed through the proxy. we keep a record of the request.</p>`],
        ["contact", `<p>legal notices go to
			<a href="mailto:yawning.yaans@gmail.com">yawning.yaans@gmail.com</a> — or open
			<a href="#" data-open="anaria://contact">anaria://contact</a> for all contact options.</p>`],
        ["last updated", `<p class="dim">october 2026</p>`]
    ]);

    page("contact", "how to reach the anaria team.", [
        ["github", `<p>the official anaria repository lives at
			<a href="https://github.com/yaans-coat/anariav3" data-open="https://github.com/yaans-coat/anariav3">https://github.com/yaans-coat/anariav3</a> —
			report bugs, request features or just follow development there. this is the best place for
			anything that is not legal.</p>`],
        ["email", `<p>for legal matters only (dmca, takedowns, law enforcement, privacy):<br>
			<a href="mailto:yawning.yaans@gmail.com">yawning.yaans@gmail.com</a></p>
			<p class="dim">please do not email for general support or questions — use github instead,
			so answers help everyone.</p>`],
        ["last updated", `<p class="dim">october 2026</p>`]
    ]);
};
