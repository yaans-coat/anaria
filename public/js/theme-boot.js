// first paint appearance boot — classic script so it runs before the body.
// the stored settings envelope is { __v, value } (see js/storage.js).
(function () {
	var apply = function () {
		var root = document.documentElement;
		var value = {};
		try {
			var raw = localStorage.getItem("anaria:settings");
			if (raw) value = JSON.parse(raw).value || {};
		} catch (error) {
			value = {};
		}
		root.dataset.theme = value.theme || "anaria";
		root.dataset.ui = value.uiStyle || "balanced";
		root.dataset.bg = value.background === false ? "off" : "on";
		var speed = value.animSpeed || "normal";
		root.dataset.anim = value.animations === false ? "off" : speed;
		root.style.setProperty(
			"--anim-multiplier",
			speed === "slow" ? "1.6" : speed === "fast" ? "0.6" : "1"
		);
	};
	window.__applyAppearance = apply;
	apply();
})();
