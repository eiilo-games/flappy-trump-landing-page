/* Trappy Flump, browser edition.
 *
 * A port of mobile/scripts/game.gd in the trappy-flump repository (itself
 * a port of terminal/flappy.py).
 * Same sprites, physics, breaking-news events, menus and drawing, on a
 * 128x228 logical canvas that the page scales up with nearest-neighbour
 * filtering. Ads and Play Games do not exist here: there is no AD CONTINUE
 * or PRIVACY button, and achievements live in localStorage instead of Play.
 *
 * Exposes window.TrappyFlump = { create(canvas, opts), mount(canvas) } in the
 * browser and module.exports in Node (test/soak.js runs the game headless).
 *
 * The game never touches audio. It emits events (see `emit` calls) that
 * audio.js listens to, and it mirrors the sound/music switches it is told
 * about with setAudio() so the menu buttons draw in the right state.
 */
(function (root, factory) {
	if (typeof module === "object" && module.exports) module.exports = factory();
	else root.TrappyFlump = factory();
})(typeof self !== "undefined" ? self : this, function () {
	"use strict";

	// ------------------------------------------------------------ colours --
	const SKY_TOP = [70, 160, 242], SKY_BOT = [178, 228, 255], SUN = [255, 238, 130];
	const CLOUD = [252, 253, 255], CLOUD_SHADE = [219, 232, 246];
	const HILL_FAR = [148, 206, 132], HILL_NEAR = [114, 186, 104];
	const GRASS = [102, 190, 48], GRASS_LIGHT = [148, 222, 86], GRASS_DARK = [58, 118, 30];
	const DIRT_A = [230, 196, 124], DIRT_B = [212, 176, 102], DIRT_LINE = [160, 124, 70];
	const WHITE = [255, 255, 255], INK = [48, 42, 36];
	// the title: gold and white words, navy outline, red drop shadow
	const GOLD = [255, 214, 72], NAVY = [28, 44, 110], TITLE_RED = [214, 36, 48];
	const TITLE_FILLS = [GOLD, WHITE];
	const RING = [[-1, 0], [1, 0], [0, -1], [0, 1], [-1, -1], [1, -1], [-1, 1], [1, 1]];
	const GO_COLOR = [255, 116, 50], GO_SHADOW = [110, 34, 10];
	const PANEL_FILL = [233, 208, 146], PANEL_EDGE = [103, 74, 38];
	const PANEL_LIGHT = [250, 241, 214], PANEL_TEXT = [103, 74, 38];
	const NEW_BEST = [214, 60, 40], WAR_SKY = [74, 40, 52], STORM_SKY = [96, 104, 120];
	const RAIN = [196, 214, 236], DARK = [4, 4, 14];
	const SPARK = [[255, 255, 255], [255, 240, 120], [255, 200, 80]];
	const BILL_BITS = [[120, 200, 120], [214, 240, 202]];   // cash-burst confetti
	const GOLD_SHADOW = [150, 92, 20], BTN_OFF = [200, 176, 128];
	// dark wood: the menu's best-score panel and the achievements header
	const PANEL_DARK = [74, 50, 28], PANEL_DARK_EDGE = [36, 24, 12], PANEL_DARK_LIGHT = [128, 92, 54];

	// [edge, paper, face, face stripe, shade, "$" ink, band, band shade]
	const CASH_STYLES = {
		usd: [[20, 58, 28], [214, 240, 202], [88, 172, 98], [70, 150, 82],
			[40, 104, 50], [24, 76, 36], [238, 208, 118], [170, 128, 52]],
		cny: [[72, 14, 14], [250, 210, 190], [206, 52, 48], [180, 40, 40],
			[128, 24, 24], [90, 12, 12], [250, 214, 90], [200, 150, 40]],
	};

	const rgb = (c) => "rgb(" + c[0] + "," + c[1] + "," + c[2] + ")";
	const lerpc = (a, b, t) => [
		Math.round(a[0] + (b[0] - a[0]) * t),
		Math.round(a[1] + (b[1] - a[1]) * t),
		Math.round(a[2] + (b[2] - a[2]) * t),
	];

	// ------------------------------------------------------------ sprites --
	const HEAD_W = 12, HEAD_H = 11;
	const HEAD_PAL = {
		k: [56, 36, 20], H: [255, 224, 92], h: [226, 178, 40], S: [244, 172, 112],
		s: [216, 132, 86], W: [255, 255, 255], B: [36, 70, 150], M: [168, 62, 56],
		R: [214, 34, 40], N: [30, 44, 92],
	};
	const HEAD_FRAMES = [
		[".kkkkkkkkkkk", "kHHHHHHHHHHk", "kHHhhHHHHHhk", "kHhhSSSSSSHk", "kSSSSSSSkkSk",
			"kSSSSSSSWBsk", "kSSSSSSSSSsk", "kSSSSSSSMMSk", ".kSSSSSSSSk.", ".kNNWRWNNNk.", "kNNNWWRWWNNk"],
		["..kkkkkkkk..", ".kHHHHHHHHk.", "kHHhhHHHHHHk", "kHhhSSSSHHHk", "kSSSSSSSkkHk",
			"kSSSSSSSWBsk", "kSSSSSSSSSsk", "kSSSSSSSMMSk", ".kSSSSSSssk.", ".kNNWRWNNNk.", "kNNNWWRWWNNk"],
		["...kkkkkkk..", "..kHHHHHHHk.", ".kHhhHHHHHHk", "kHhhSSSSHHHk", "kSSSSSSSHHHk",
			"kSSSSSSSWBsk", "kSSSSSSSSSsk", "kSSSSSSSkMSk", ".kSSSSSSSSk.", ".kNNWRWNNNk.", "kNNNWWRWWNNk"],
	];

	// The same head bawling on the game-over screen: eyes squeezed shut, mouth
	// open in a wail, a tear running down the cheek. Same size as HEAD_FRAMES
	// so the crash face morphs into it without a pop.
	const CRY_PAL = {
		k: [56, 36, 20], H: [255, 224, 92], h: [226, 178, 40], S: [244, 172, 112],
		s: [216, 132, 86], W: [255, 255, 255], M: [168, 62, 56], m: [96, 28, 30],
		R: [214, 34, 40], N: [30, 44, 92], C: [150, 206, 255],
	};
	const CRY_FRAMES = [
		["...kkkkkkk..", "..kHHHHHHHk.", ".kHhhHHHHHHk", "kHhhSSSSHHHk", "kSSSSSSSHHHk",
			"kSSSSSSSkksk", "kSSSSSSSSCsk", "kSSSSSkmmSSk", ".kSSSSkmmSk.", ".kNNWRWNNNk.", "kNNNWWRWWNNk"],
		["...kkkkkkk..", "..kHHHHHHHk.", ".kHhhHHHHHHk", "kHhhSSSSHHHk", "kSSSSSSSHHHk",
			"kSSSSSSSkksk", "kSSSSSSSSSsk", "kSSSSSkmmCSk", ".kSSSSkmmCk.", ".kNNWRWNNNk.", "kNNNWWRWWNNk"],
	];

	const LAUGH_W = 14, LAUGH_H = 16;
	const LAUGH_PAL = {
		k: [52, 36, 24], H: [242, 216, 124], h: [204, 170, 72], S: [250, 214, 180],
		L: [206, 48, 68], T: [255, 255, 255], M: [128, 26, 40], P: [58, 108, 200], p: [38, 76, 150],
	};
	const LAUGH_FRAMES = [
		["...kkkkkkkk...", "..kHHHHHHHHk..", ".kHHHHHHHHHHk.", ".kHHhHHHHhHHk.", "kHHhSSSSSShHHk",
			"kHhSSSSSSSShHk", "kHhSkkSSkkSShk", "kHhSSSSSSSShHk", "kHhSSLLLLLShHk", ".kSSLTTTTTLSk.",
			".kSSLMMMMMLSk.", "..kSSLLLLLSk..", "...kSSSSSSk...", ".kPPPkSSkPPPk.", "kPPPPPTTPPPPPk", "kPPPPpPPPPpPPk"],
		["..............", "...kkkkkkkk...", "..kHHHHHHHHk..", ".kHHhHHHHhHHk.", ".kHhSSSSSShHk.",
			"kHhSSSSSSSShHk", "kHhSkkSSkkSShk", "kHhSSSSSSSShHk", "kHhSSLLLLLShHk", ".kSSLTTTTTLSk.",
			".kSSSLLLLLSSk.", "..kSSSSSSSSk..", "...kSSSSSSk...", ".kPPPkSSkPPPk.", "kPPPPPTTPPPPPk", "kPPPPpPPPPpPPk"],
	];

	const MISSILE_W = 10, MISSILE_H = 3;
	const MISSILE_PAL = {
		k: [40, 40, 44], R: [222, 48, 40], G: [176, 180, 188], g: [120, 124, 134],
		F: [255, 214, 60], f: [255, 132, 30],
	};
	const MISSILE_FRAMES = [
		["..kkkkkkk.", "RRGGGGGGkF", "..kggggkf."],
		["..kkkkkkk.", "RRGGGGGGkf", "..kggggkFF"],
	];

	const DOLLAR = ["##.", ".#.", ".##"];

	// a loose bill for the STIMULUS event
	const BILL_W = 7, BILL_H = 5;
	const BILL_PAL = { k: [20, 58, 28], F: [132, 206, 132], d: [40, 104, 50] };
	const BILL = [".kkkkk.", "kFFdFFk", "kFdddFk", "kFFdFFk", ".kkkkk."];

	// 3x5 body font: A-Z, 0-9, space and the "/" of the achievements tally
	const FONT = {
		"0": ["###", "#.#", "#.#", "#.#", "###"], "1": [".#.", "##.", ".#.", ".#.", "###"],
		"2": ["###", "..#", "###", "#..", "###"], "3": ["###", "..#", ".##", "..#", "###"],
		"4": ["#.#", "#.#", "###", "..#", "..#"], "5": ["###", "#..", "###", "..#", "###"],
		"6": ["###", "#..", "###", "#.#", "###"], "7": ["###", "..#", "..#", "..#", "..#"],
		"8": ["###", "#.#", "###", "#.#", "###"], "9": ["###", "#.#", "###", "..#", "###"],
		A: [".#.", "#.#", "###", "#.#", "#.#"], B: ["##.", "#.#", "##.", "#.#", "##."],
		C: ["###", "#..", "#..", "#..", "###"], D: ["##.", "#.#", "#.#", "#.#", "##."],
		E: ["###", "#..", "##.", "#..", "###"], F: ["###", "#..", "##.", "#..", "#.."],
		G: ["###", "#..", "#.#", "#.#", "###"], H: ["#.#", "#.#", "###", "#.#", "#.#"],
		I: ["###", ".#.", ".#.", ".#.", "###"], J: ["..#", "..#", "..#", "#.#", "###"],
		K: ["#.#", "#.#", "##.", "#.#", "#.#"], L: ["#..", "#..", "#..", "#..", "###"],
		M: ["#.#", "###", "###", "#.#", "#.#"], N: ["##.", "#.#", "#.#", "#.#", "#.#"],
		O: ["###", "#.#", "#.#", "#.#", "###"], P: ["###", "#.#", "###", "#..", "#.."],
		Q: ["###", "#.#", "#.#", "###", "..#"], R: ["###", "#.#", "##.", "#.#", "#.#"],
		S: ["###", "#..", "###", "..#", "###"], T: ["###", ".#.", ".#.", ".#.", ".#."],
		U: ["#.#", "#.#", "#.#", "#.#", "###"], V: ["#.#", "#.#", "#.#", "#.#", ".#."],
		W: ["#.#", "#.#", "#.#", "###", "#.#"], X: ["#.#", "#.#", ".#.", "#.#", "#.#"],
		Y: ["#.#", "#.#", ".#.", ".#.", ".#."], Z: ["###", "..#", ".#.", "#..", "###"],
		"/": ["..#", "..#", ".#.", "#..", "#.."],
	};

	// 5x7 display font for the menu's best score: digits plus the letters of
	// "BEST". Wider strokes and round shapes read as a headline next to the
	// 3x5 body font.
	const BIG_FONT = {
		"0": [".###.", "#...#", "#..##", "#.#.#", "##..#", "#...#", ".###."],
		"1": ["..#..", ".##..", "..#..", "..#..", "..#..", "..#..", ".###."],
		"2": [".###.", "#...#", "....#", "...#.", "..#..", ".#...", "#####"],
		"3": ["####.", "....#", "....#", ".###.", "....#", "....#", "####."],
		"4": ["...#.", "..##.", ".#.#.", "#..#.", "#####", "...#.", "...#."],
		"5": ["#####", "#....", "####.", "....#", "....#", "#...#", ".###."],
		"6": [".###.", "#....", "#....", "####.", "#...#", "#...#", ".###."],
		"7": ["#####", "....#", "...#.", "..#..", ".#...", ".#...", ".#..."],
		"8": [".###.", "#...#", "#...#", ".###.", "#...#", "#...#", ".###."],
		"9": [".###.", "#...#", "#...#", ".####", "....#", "....#", ".###."],
		B: ["####.", "#...#", "#...#", "####.", "#...#", "#...#", "####."],
		E: ["#####", "#....", "#....", "####.", "#....", "#....", "#####"],
		S: [".####", "#....", "#....", ".###.", "....#", "....#", "####."],
		T: ["#####", "..#..", "..#..", "..#..", "..#..", "..#..", "..#.."],
	};

	// 9x9 icons for the menu buttons
	const ICONS = {
		sound: ["...#.....", "..##.....", ".###..#..", "####...#.", "####.#.#.", "####...#.", ".###..#..", "..##.....", "...#....."],
		music: ["....####.", "....#..##", "....#....", "....#....", "....#....", "....#....", ".####....", "#####....", ".###....."],
		trophy: ["#########", "#.#####.#", "#.#####.#", ".#.###.#.", "..#####..", "...###...", "....#....", "...###...", ".#######."],
		home: ["....#....", "...###..#", "..#####.#", ".#######.", "#########", ".#######.", ".##...##.", ".##...##.", ".##...##."],
	};

	// ------------------------------------------------------------- events --
	// Same table as scripts/events.gd; see that file for the key meanings.
	const EVENTS = [
		{ name: "INFLATION", sub: "PILES SWELL", color: [206, 66, 26], dur: 9.0, gap: 0.80, w: 1.5, achievement: "survive_inflation" },
		{ name: "CHINA TARIFFS", sub: "RED PILES  FAST", color: [178, 22, 30], dur: 9.0, speed: 1.35, style: "cny", achievement: "survive_tariffs" },
		{ name: "WAR", sub: "INCOMING MISSILES", color: [60, 34, 40], dur: 10.0, missiles: true, sky: true, achievement: "survive_war" },
		{ name: "RATE CUT", sub: "EVERYTHING FLOATS", color: [28, 128, 62], dur: 9.0, grav: 0.55, flap: 0.8, gap: 1.2 },
		{ name: "ELECTION", sub: "DOUBLE POINTS", color: [30, 70, 176], dur: 9.0, points: 2, speed: 1.15 },
		{ name: "IMMUNITY", sub: "UNTOUCHABLE", color: [176, 120, 16], dur: 8.0, star: true, speed: 1.3 },
		{ name: "SHUTDOWN", sub: "LIGHTS OUT", color: [40, 40, 58], dur: 8.0, dark: true, achievement: "survive_shutdown" },
		{ name: "STIMULUS", sub: "FREE MONEY", color: [22, 140, 90], dur: 9.0, bills: true },
		{ name: "HURRICANE", sub: "GUSTS", color: [70, 96, 122], dur: 9.0, storm: true, achievement: "survive_hurricane" },
	];
	const BANNER_T = 2.6, EVENT_MIN_SCORE = 3, EVENT_COOLDOWN = 3, EVENT_CHANCE = 0.45;
	// IMMUNITY: the head cycles these hues; it stutters back to normal near the end
	const STAR_HUES = [[255, 64, 64], [255, 168, 40], [255, 240, 64], [80, 230, 96], [72, 150, 255], [204, 84, 240]];
	const STAR_TINT = 0.55, STAR_RATE = 15, STAR_WARN_T = 1.5;
	// SHUTDOWN: how black, and the soft rim of the spotlight in px
	const DARK_ALPHA = 0.86, DARK_EDGE = 10;
	// STIMULUS: seconds between bills
	const BILL_MIN_T = 0.5, BILL_MAX_T = 0.9;
	// HURRICANE: down/updraught acceleration as a fraction of gravity (updraughts are
	// gentler: the player can only ever push up), gust cycle, raindrops per px of width
	const GUST_DOWN = 0.75, GUST_UP = 0.45, GUST_PERIOD = 1.7, RAIN_PER_PX = 0.25;

	// Signed gust strength in [-1, 1] (negative lifts); two sines that never line up.
	function gust(age) {
		const a = 2 * Math.PI * age / GUST_PERIOD;
		return clamp(0.62 * Math.sin(a) + 0.42 * Math.sin(2.3 * a + 1.0), -1, 1);
	}
	function gustAccel(age) { const gu = gust(age); return gu * (gu < 0 ? GUST_UP : GUST_DOWN); }
	function starPalette(pal, hue) {
		const out = {};
		for (const k in pal) out[k] = lerpc(pal[k], hue, STAR_TINT);
		return out;
	}

	// ------------------------------------------------------- achievements --
	// Same list as scripts/play_services.gd, in the order the in-game screen
	// shows them. Unlocks persist in localStorage.
	const ACHIEVEMENTS = [
		{ key: "first_pile", title: "FIRST PILE", desc: "PASS ONE PILE OF CASH" },
		{ key: "score_25", title: "TWENTY FIVE", desc: "SCORE 25 IN ONE RUN" },
		{ key: "score_50", title: "FIFTY", desc: "SCORE 50 IN ONE RUN" },
		{ key: "score_100", title: "ONE HUNDRED", desc: "SCORE 100 IN ONE RUN" },
		{ key: "survive_inflation", title: "INFLATION PROOF", desc: "OUTLAST AN INFLATION" },
		{ key: "survive_tariffs", title: "TARIFF DODGER", desc: "OUTLAST CHINA TARIFFS" },
		{ key: "survive_war", title: "WAR SURVIVOR", desc: "OUTLAST A WAR" },
		{ key: "survive_shutdown", title: "LIGHTS ON", desc: "OUTLAST A SHUTDOWN" },
		{ key: "survive_hurricane", title: "STORM RIDER", desc: "OUTLAST A HURRICANE" },
		{ key: "bulldozer", title: "BULLDOZER", desc: "SMASH 5 PILES IN ONE RUN" },
		{ key: "windfall", title: "WINDFALL", desc: "GRAB 10 BILLS IN ONE RUN" },
	];

	const WING_SEQ = [1, 0, 1, 2];
	const MAX_DT = 1 / 15;
	const GROW_T = 0.6;      // seconds the landed head takes to roll over and grow into the crier
	const BEST_KEY = "trappy-flump-best";
	const UNLOCKED_KEY = "trappy-flump-achievements";

	// ------------------------------------------------------------ helpers --
	const idiv = (a, b) => Math.trunc(a / b);
	const clamp = (v, lo, hi) => Math.min(Math.max(v, lo), hi);
	const randf = (lo, hi) => lo + Math.random() * (hi - lo);
	const randi = (lo, hi) => lo + Math.floor(Math.random() * (hi - lo + 1));
	const textW = (s, scale) => Math.max(0, (s.length * 4 - 1) * (scale || 1));
	const bigTextW = (s, scale) => Math.max(0, (s.length * 6 - 1) * (scale || 1));

	// Tappable rects are {x, y, w, h} or null when hidden (Godot's empty Rect2).
	const R = (x, y, w, h) => ({ x: x, y: y, w: w, h: h });
	const grow = (r, n) => R(r.x - n, r.y - n, r.w + 2 * n, r.h + 2 * n);
	const hasPoint = (r, x, y) => !!r && x >= r.x && y >= r.y && x < r.x + r.w && y < r.y + r.h;
	const intersects = (a, b) => !!a && !!b && a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;

	function makeSprite(makeCanvas, lines, pal) {
		const h = lines.length, w = lines[0].length;
		const cv = makeCanvas(w, h);
		const c = cv.getContext("2d");
		for (let y = 0; y < h; y++) {
			for (let x = 0; x < w; x++) {
				const ch = lines[y][x];
				if (ch === ".") continue;
				c.fillStyle = rgb(pal[ch]);
				c.fillRect(x, y, 1, 1);
			}
		}
		return cv;
	}

	// Sky gradient with the sun baked in; tintAmt > 0 darkens toward tint.
	function makeSky(makeCanvas, w, h, gy, tint, tintAmt) {
		const cv = makeCanvas(w, h);
		const c = cv.getContext("2d");
		for (let y = 0; y < h; y++) {
			let col = lerpc(SKY_TOP, SKY_BOT, Math.min(1, y / Math.max(1, gy)));
			if (tintAmt > 0) col = lerpc(col, tint, tintAmt);
			c.fillStyle = rgb(col);
			c.fillRect(0, y, w, 1);
		}
		const sx = Math.trunc(w * 0.80), sy = Math.trunc(h * 0.10), r = Math.max(4, idiv(h, 13));
		const sun = tintAmt <= 0 ? SUN : lerpc(SUN, tint, tintAmt * 0.6);
		for (let y = Math.max(0, sy - r - 2); y < Math.min(h, sy + r + 3); y++) {
			let sky = lerpc(SKY_TOP, SKY_BOT, Math.min(1, y / Math.max(1, gy)));
			if (tintAmt > 0) sky = lerpc(sky, tint, tintAmt);
			for (let x = Math.max(0, sx - r - 2); x < Math.min(w, sx + r + 3); x++) {
				const d2 = (x - sx) * (x - sx) + (y - sy) * (y - sy);
				if (d2 <= r * r) c.fillStyle = rgb(sun);
				else if (d2 <= (r + 2) * (r + 2)) c.fillStyle = rgb(lerpc(sky, sun, 0.45));
				else continue;
				c.fillRect(x, y, 1, 1);
			}
		}
		return cv;
	}

	// The SHUTDOWN spotlight: clear inside radius r, fading to alpha black over edge px.
	function makeSpotlight(makeCanvas, r, edge, alpha) {
		const d = (r + edge) * 2;
		const cv = makeCanvas(d, d);
		const c = cv.getContext("2d");
		const cc = r + edge - 0.5;
		for (let y = 0; y < d; y++) {
			for (let x = 0; x < d; x++) {
				const dist = Math.sqrt((x - cc) * (x - cc) + (y - cc) * (y - cc));
				const a = clamp((dist - r) / edge, 0, 1) * alpha;
				if (a <= 0) continue;
				c.fillStyle = "rgba(" + DARK[0] + "," + DARK[1] + "," + DARK[2] + "," + a.toFixed(3) + ")";
				c.fillRect(x, y, 1, 1);
			}
		}
		return cv;
	}

	// One 91 px period of the ground strip (grass every 7 px, dirt every 13).
	const GROUND_PERIOD = 91;
	function makeGround(makeCanvas, gh) {
		const cv = makeCanvas(GROUND_PERIOD, gh);
		const c = cv.getContext("2d");
		for (let d = 0; d < gh; d++) {
			for (let x = 0; x < GROUND_PERIOD; x++) {
				let col;
				if (d === 0) col = GRASS_DARK;
				else if (d <= 2) col = x % 7 < 3 ? GRASS_LIGHT : GRASS;
				else if (d === 3) col = DIRT_LINE;
				else col = (x + d * 3) % 13 < 7 ? DIRT_A : DIRT_B;
				c.fillStyle = rgb(col);
				c.fillRect(x, d, 1, 1);
			}
		}
		return cv;
	}

	// =================================================================== game
	function create(canvas, opts) {
		opts = opts || {};
		const makeCanvas = opts.makeCanvas || function (w, h) {
			const cv = document.createElement("canvas");
			cv.width = w; cv.height = h;
			return cv;
		};
		const storage = opts.storage || (typeof localStorage !== "undefined" ? localStorage : null);
		const ctx = canvas.getContext("2d");
		ctx.imageSmoothingEnabled = false;

		// ---- world geometry ----
		let W = 128, H = 228, ground_h = 28, gy = 200, ph = 200;
		const top = 0;   // the phone's camera cutout inset; nothing to avoid here
		let g = 0, flap_v = 0, max_fall = 0, speed0 = 0;
		let pipe_w = 14, spacing = 80, gap = 46, bird_x = 43, mscale = 1;
		const bundle_h = 5;
		let bundle_jitter = [];
		let clouds = [];

		// ---- textures ----
		let sky_tex, sky_war_tex, sky_storm_tex, ground_tex, spot_tex, spot_r = 56;
		const head_tex = HEAD_FRAMES.map((f) => makeSprite(makeCanvas, f, HEAD_PAL));
		const star_tex = STAR_HUES.map((hue) => HEAD_FRAMES.map((f) => makeSprite(makeCanvas, f, starPalette(HEAD_PAL, hue))));
		const cry_tex = CRY_FRAMES.map((f) => makeSprite(makeCanvas, f, CRY_PAL));
		const laugh_tex = LAUGH_FRAMES.map((f) => makeSprite(makeCanvas, f, LAUGH_PAL));
		const missile_tex = MISSILE_FRAMES.map((f) => makeSprite(makeCanvas, f, MISSILE_PAL));
		const bill_tex = makeSprite(makeCanvas, BILL, BILL_PAL);

		// ---- run state ----
		let state = "menu"; // menu | achievements | play | paused | dead
		let t = 0, world_x = 0, flash = 0, dead_t = 0;
		let land_t = -1;    // dead_t at which the tumbling head hit the ground (-1: airborne)
		let new_best = false, best = loadBest(), score = 0;
		let pipes = []; // {x, gap_y, scored, w, gap, style, smashed}
		let vy = 0, by = 0, wing = 0;
		const unlocked = loadUnlocked();   // achievement key -> true
		const audio = { sound: true, music: false };   // mirrored from audio.js for the menu buttons

		// ---- events ----
		let event = null, event_t = 0, event_age = 0, ev_cool = 0, last_event = "";
		let missiles = []; // {x, y}
		let missile_t = 0;
		let bills = [], bill_t = 0;      // STIMULUS: {x, y, phase}
		let rain = [];                   // HURRICANE: {x, y}
		let sparks = [], spark_t = 0;    // {x, y, vx, vy, life, kind, ci}; kind 0 sparkle, 1 bill bit
		let smashed = 0, grabbed = 0;    // per run: piles bulldozed, bills grabbed

		// ---- tappable HUD rects (null when hidden) ----
		let sound_rect = null;           // menu: sound on/off
		let music_rect = null;           // menu: music on/off
		let achievements_rect = null;    // menu: the achievements list
		let menu_rect = null;            // play, paused, dead: back to the menu

		const listeners = {};
		function emit(name, arg) { (listeners[name] || []).forEach((fn) => fn(arg)); }

		function loadBest() {
			try { return parseInt(storage && storage.getItem(BEST_KEY), 10) || 0; } catch (e) { return 0; }
		}
		function saveBest(v) {
			try { storage && storage.setItem(BEST_KEY, String(v)); } catch (e) { /* private mode */ }
		}
		function loadUnlocked() {
			const out = {};
			try {
				const keys = JSON.parse((storage && storage.getItem(UNLOCKED_KEY)) || "[]");
				for (const a of ACHIEVEMENTS) if (keys.indexOf(a.key) >= 0) out[a.key] = true;
			} catch (e) { /* nothing saved, or garbage */ }
			return out;
		}
		function saveUnlocked() {
			try { storage && storage.setItem(UNLOCKED_KEY, JSON.stringify(Object.keys(unlocked))); } catch (e) { /* private mode */ }
		}
		function unlock(key) {
			if (unlocked[key]) return;
			unlocked[key] = true;
			saveUnlocked();
			emit("achievement", key);
		}
		function unlockedCount() { return Object.keys(unlocked).length; }

		// ------------------------------------------------------- world setup
		function setupWorld() {
			W = canvas.width; H = canvas.height;
			ground_h = Math.max(8, idiv(H, 9));
			gy = H - ground_h;
			ph = gy;
			// Physics and the gap are in head units, not playfield units: the head is
			// a fixed 11 px whatever the screen, so the feel matches the phone.
			g = HEAD_H * 40.0;
			flap_v = -HEAD_H * 10.8;
			max_fall = HEAD_H * 22.0;
			speed0 = Math.max(40.0, W * 0.40);
			pipe_w = clamp(idiv(W, 10), 12, 18);
			spacing = Math.max(pipe_w * 4.6, W * 0.55);
			gap = HEAD_H * 4;
			bird_x = Math.trunc(W * 0.30);
			mscale = ph >= 160 ? 2 : 1;

			bundle_jitter = [];
			for (let i = 0; i < 64; i++) bundle_jitter.push([-1, 0, 0, 1][randi(0, 3)]);

			sky_tex = makeSky(makeCanvas, W, H, gy, WAR_SKY, 0.0);
			sky_war_tex = makeSky(makeCanvas, W, H, gy, WAR_SKY, 0.55);
			sky_storm_tex = makeSky(makeCanvas, W, H, gy, STORM_SKY, 0.5);
			ground_tex = makeGround(makeCanvas, ground_h);
			spot_r = clamp(Math.trunc(ph * 0.28), 36, 72);
			spot_tex = makeSpotlight(makeCanvas, spot_r, DARK_EDGE, DARK_ALPHA);

			const n = Math.max(3, idiv(W, 48));
			clouds = [];
			for (let i = 0; i < n; i++) {
				clouds.push({
					x: randf(0, W),
					y: randf(H * 0.05, H * 0.40),
					r: randf(5.0, Math.min(14.0, Math.max(6.0, H / 11.0))),
					s: randf(0.25, 0.55),
				});
			}
		}

		function newRun() {
			score = 0; pipes = []; vy = 0; by = ph * 0.42; wing = 0;
			new_best = false;
			event = null; event_t = 0; event_age = 0; ev_cool = EVENT_COOLDOWN; last_event = "";
			missiles = []; missile_t = 0;
			bills = []; bill_t = 0; rain = []; sparks = []; spark_t = 0; smashed = 0; grabbed = 0;
		}

		// ------------------------------------------------------------- input
		// A tap at canvas coordinates: the HUD buttons first, then a flap.
		// Keys tap at (-1, -1), which is outside every button.
		function tap(x, y) {
			if (state === "menu" && hasPoint(sound_rect, x, y)) {
				setAudio(!audio.sound, audio.music);
				emit("sound", audio.sound);
				return;
			}
			if (state === "menu" && hasPoint(music_rect, x, y)) {
				setAudio(audio.sound, !audio.music);
				emit("music", audio.music);
				return;
			}
			if (state === "menu" && hasPoint(achievements_rect, x, y)) {
				emit("ui");
				state = "achievements";
				return;
			}
			if (state === "achievements") {
				emit("ui");
				state = "menu";
				return;
			}
			if (state !== "menu" && hasPoint(menu_rect, x, y)) {
				restart();
				return;
			}
			flap();
		}

		function flap() {
			switch (state) {
				case "menu":
					state = "play"; newRun(); vy = flap_v; emit("start"); emit("flap"); break;
				case "play":
					vy = flap_v * ev("flap", 1.0); wing = 0; emit("flap"); break;
				case "paused":
					state = "play"; emit("resume"); break;
				case "dead":
					if (dead_t > 0.5) { restart(); flap(); }
					break;
			}
		}
		function restart() { state = "menu"; flash = 0; newRun(); emit("menu"); }
		function pause() { if (state === "play") { state = "paused"; emit("pause"); } }
		function setAudio(sound, music) { audio.sound = !!sound; audio.music = !!music; }

		function die(cause) {
			state = "dead"; flash = 0.14; dead_t = 0; land_t = -1;
			vy = -HEAD_H * 4.0;          // little death hop
			if (score > best) { best = score; new_best = true; saveBest(best); }
			emit("dead", { score: score, best: best, newBest: new_best, cause: cause || "pile" });
		}

		// ------------------------------------------------------------ events
		function ev(key, def) { return event && event[key] !== undefined ? event[key] : def; }
		function startEvent(e) {
			event = e; event_t = e.dur; event_age = 0; last_event = e.name; missile_t = 0.6; bill_t = 0.4;
			if (e.storm) makeRain();
			emit("event", e);
		}
		function endEvent() {
			const n = event.name;
			if (event.achievement) unlock(event.achievement);
			event = null; ev_cool = EVENT_COOLDOWN; missiles = []; rain = [];
			emit("eventEnd", n);
		}
		function makeRain() {
			rain = [];
			for (let i = 0; i < Math.trunc(W * RAIN_PER_PX); i++) rain.push({ x: randf(0, W + 60), y: randf(-ph, gy) });
		}
		// A loose bill drifts in from the right, somewhere a thumb can reach from
		// the last gap. Skipped while a pile is still crossing the spawn column.
		function spawnBill() {
			let base = ph * 0.5;
			if (pipes.length) {
				const last = pipes[pipes.length - 1];
				if (last.x + last.w > W - 8) return;
				base = last.gap_y + last.gap * 0.5;
			}
			const y = clamp(base + randf(-ph * 0.25, ph * 0.25), 8, ph - BILL_H * mscale - 8);
			bills.push({ x: W + 2.0, y: y, phase: Math.random() * 2 * Math.PI });
		}
		function burst(x, y, n, kind) {
			for (let i = 0; i < n; i++) {
				sparks.push({
					x: x, y: y,
					vx: kind === 1 ? randf(-30, 70) : randf(-40, 40),
					vy: kind === 1 ? randf(-110, 10) : randf(-50, 50),
					life: randf(0.35, 0.7), kind: kind, ci: randi(0, 2),
				});
			}
		}
		function maybeEvent() {
			if (event || score < EVENT_MIN_SCORE) return;
			if (ev_cool > 0) { ev_cool--; return; }
			if (Math.random() < EVENT_CHANCE) {
				const pool = EVENTS.filter((e) => e.name !== last_event);
				startEvent(pool[randi(0, pool.length - 1)]);
			}
		}

		function spawnPile() {
			const pg = clamp(Math.trunc(gap * ev("gap", 1.0)), HEAD_H + 8, ph - 10);
			const w = clamp(Math.trunc(pipe_w * ev("w", 1.0)), 6, idiv(W, 5));
			const m = 5;
			let lo = m, hi = Math.max(m, ph - pg - m);
			// Portrait screens are tall relative to the head, so cap how far the gap
			// can move between consecutive piles; a thumb can only climb so fast.
			if (pipes.length) {
				const prev = pipes[pipes.length - 1].gap_y;
				const reach = Math.trunc(ph * 0.45);
				lo = clamp(prev - reach, m, hi);
				hi = clamp(prev + reach, lo, hi);
			}
			pipes.push({ x: W + 2.0, gap_y: randi(lo, hi), scored: false, w: w, gap: pg, style: ev("style", "usd"), smashed: false });
		}

		// -------------------------------------------------------- simulation
		function curSpeed() { return speed0 * (1.0 + Math.min(score, 40) * 0.01) * ev("speed", 1.0); }

		function moveClouds(dt, f) {
			for (const c of clouds) {
				c.x -= (speed0 * 0.25 * c.s * f + 1.5 * c.s) * dt;
				if (c.x < -c.r * 3) { c.x = W + c.r * 3; c.y = randf(H * 0.05, H * 0.40); }
			}
		}
		// Rain streaks across with the scroll and leans with the gust.
		function moveRain(dt, sp) {
			const lean = ev("storm", false) ? gust(event_age) : 0;
			for (const d of rain) {
				d.x -= (sp * 1.6 + 40) * dt;
				d.y += (110 + 50 * lean) * dt;
				if (d.y >= gy || d.x < -4) { d.x = randf(0, W + 60); d.y = randf(-12, -3); }
			}
		}
		function moveSparks(dt, sp) {
			for (const k of sparks) {
				k.x += (k.vx - sp * 0.6) * dt;
				if (k.kind === 1) k.vy += g * 0.6 * dt;   // bill bits flutter down
				k.y += k.vy * dt;
				k.life -= dt;
			}
			sparks = sparks.filter((k) => k.life > 0);
		}

		function update(dt) {
			t += dt;
			if (flash > 0) flash -= dt;

			if (state === "menu" || state === "achievements") {
				world_x += speed0 * 0.35 * dt; wing += dt * 7; moveClouds(dt, 0.3);
				return;
			}
			if (state === "paused") return;
			if (state === "dead") {
				dead_t += dt; moveClouds(dt, 0.05); moveRain(dt, 0); moveSparks(dt, 0);
				if (land_t < 0) {
					vy = Math.min(vy + g * dt, max_fall);
					by += vy * dt;
					if (by + HEAD_H >= gy) { by = gy - HEAD_H; land_t = dead_t; }
				}
				return;
			}

			// --- playing ---
			const sp = curSpeed();
			world_x += sp * dt;
			wing += dt * (vy < 0 ? 16 : 7);
			moveClouds(dt, ev("storm", false) ? 3.0 : 0.5);
			moveRain(dt, sp);
			moveSparks(dt, sp);

			if (event) {
				event_t -= dt; event_age += dt;
				if (event_t <= 0) endEvent();
			}

			for (const p of pipes) p.x -= sp * dt;
			while (pipes.length && pipes[0].x < -pipes[0].w - 6) pipes.shift();
			if (!pipes.length || pipes[pipes.length - 1].x < W - spacing) spawnPile();

			for (const p of pipes) {
				if (!p.scored && p.x + p.w < bird_x) {
					p.scored = true;
					score += ev("points", 1);
					emit("score", score);
					scoreMilestones();
					maybeEvent();
				}
			}

			// WAR: missiles stream in from the right, faster than the scroll
			if (ev("missiles", false)) {
				missile_t -= dt;
				if (missile_t <= 0) {
					missile_t = randf(0.55, 1.0);
					missiles.push({ x: W + 2.0, y: randf(2, ph - MISSILE_H * mscale - 2) });
					emit("missile");
				}
			}
			for (const m of missiles) m.x -= sp * 1.7 * dt;
			missiles = missiles.filter((m) => m.x > -MISSILE_W * mscale - 2);

			// STIMULUS: loose bills drift in; they stay collectable after the event
			if (ev("bills", false)) {
				bill_t -= dt;
				if (bill_t <= 0) { bill_t = randf(BILL_MIN_T, BILL_MAX_T); spawnBill(); }
			}
			for (const b of bills) b.x -= sp * dt;
			bills = bills.filter((b) => b.x > -BILL_W * mscale - 2);

			// IMMUNITY: a sparkle trail behind the head
			if (ev("star", false)) {
				spark_t -= dt;
				while (spark_t <= 0) {
					spark_t += 0.045;
					sparks.push({ x: bird_x + randf(0, HEAD_W), y: by + randf(0, HEAD_H),
						vx: randf(-12, 12), vy: randf(-16, 16), life: 0.35, kind: 0, ci: randi(0, 2) });
				}
			}

			if (ev("storm", false)) vy += g * gustAccel(event_age) * dt;
			vy = Math.min(vy + g * ev("grav", 1.0) * dt, max_fall);
			by += vy * dt;
			if (by < -3) { by = -3; vy = 0; }

			// collisions (hitbox slightly smaller than the sprite, feels fairer)
			if (by + HEAD_H >= gy) { by = gy - HEAD_H; die("ground"); return; }
			const rx = bird_x + 2, ry = by + 1, rw = HEAD_W - 4, rh = HEAD_H - 2;
			const star = ev("star", false);
			const hx = bird_x + HEAD_W * 0.5, hy = by + HEAD_H * 0.5;
			for (const p of pipes) {
				if (rx < p.x + p.w && rx + rw > p.x) {
					if (ry < p.gap_y || ry + rh > p.gap_y + p.gap) {
						if (!star) { die("pile"); return; }
						if (!p.smashed) {            // bulldoze through: one burst per pile
							p.smashed = true; smashed++;
							burst(hx, hy, 12, 1);
							emit("smash", smashed);
							if (smashed >= 5) unlock("bulldozer");
						}
					}
				}
			}
			let keep = [];
			for (const m of missiles) {
				if (rx < m.x + (MISSILE_W - 1) * mscale && rx + rw > m.x &&
					ry < m.y + MISSILE_H * mscale && ry + rh > m.y) {
					if (!star) { die("missile"); return; }
					burst(m.x + MISSILE_W * mscale * 0.5, m.y, 10, 0);
					emit("missileSmash");
					continue;
				}
				keep.push(m);
			}
			missiles = keep;
			const bw = BILL_W * mscale, bh = BILL_H * mscale;
			keep = [];
			for (const b of bills) {
				const byy = b.y + Math.sin(t * 6.0 + b.phase) * 2.0;
				if (rx < b.x + bw && rx + rw > b.x && ry < byy + bh && ry + rh > byy) {
					score += 1; grabbed++;
					burst(b.x + bw * 0.5, byy + bh * 0.5, 6, 0);
					emit("cash", grabbed);
					scoreMilestones();
					if (grabbed >= 10) unlock("windfall");
					continue;
				}
				keep.push(b);
			}
			bills = keep;
		}

		function scoreMilestones() {
			if (score >= 1) unlock("first_pile");
			if (score >= 25) unlock("score_25");
			if (score >= 50) unlock("score_50");
			if (score >= 100) unlock("score_100");
		}

		// ----------------------------------------------------------- drawing
		function rect(x, y, w, h, col) { ctx.fillStyle = rgb(col); ctx.fillRect(x, y, w, h); }

		// A "#"/"." grid in the current fillStyle, scaled by whole pixels.
		function drawGrid(rows, x, y, scale) {
			for (let r = 0; r < rows.length; r++) {
				const row = rows[r];
				for (let c = 0; c < row.length; c++) {
					if (row[c] === "#") ctx.fillRect(x + c * scale, y + r * scale, scale, scale);
				}
			}
		}

		function drawText(s, x, y, color, scale, shadow) {
			scale = scale || 1;
			if (shadow) drawText(s, x + scale, y + scale, shadow, scale);
			x = Math.floor(x); y = Math.floor(y);
			ctx.fillStyle = rgb(color);
			for (let i = 0; i < s.length; i++) {
				const ch = s[i];
				if (ch === " ") continue;
				drawGrid(FONT[ch] || FONT["0"], x + i * 4 * scale, y, scale);
			}
		}
		function drawTextC(s, cx, y, color, scale, shadow) {
			drawText(s, cx - idiv(textW(s, scale), 2), y, color, scale, shadow);
		}
		function drawBigText(s, x, y, color, scale, shadow) {
			scale = scale || 1;
			if (shadow) drawBigText(s, x + scale, y + scale, shadow, scale);
			x = Math.floor(x); y = Math.floor(y);
			ctx.fillStyle = rgb(color);
			for (let i = 0; i < s.length; i++) {
				const ch = s[i];
				if (ch === " ") continue;
				drawGrid(BIG_FONT[ch] || BIG_FONT["0"], x + i * 6 * scale, y, scale);
			}
		}
		function drawBigTextC(s, cx, y, color, scale, shadow) {
			drawBigText(s, cx - idiv(bigTextW(s, scale), 2), y, color, scale, shadow);
		}
		// The game title: first word gold, second white, a 1 px navy outline and
		// the same outlined shape shifted down-right in red as the drop shadow.
		function drawTitle(s, cx, y, scale) {
			const x = cx - idiv(textW(s, scale), 2);
			for (const d of RING) drawText(s, x + scale + d[0], y + scale + d[1], TITLE_RED, scale);
			drawText(s, x + scale, y + scale, TITLE_RED, scale);
			for (const d of RING) drawText(s, x + d[0], y + d[1], NAVY, scale);
			for (let i = 0, w = 0; i < s.length; i++) {
				if (s[i] === " ") w++;
				else drawText(s[i], x + i * 4 * scale, y, TITLE_FILLS[w % 2], scale);
			}
		}

		function drawIcon(name, x, y, color, shadow) {
			x = Math.floor(x); y = Math.floor(y);
			if (shadow) { ctx.fillStyle = rgb(shadow); drawGrid(ICONS[name], x + 1, y + 1, 1); }
			ctx.fillStyle = rgb(color);
			drawGrid(ICONS[name], x, y, 1);
		}
		// Bevelled wooden panel, the game-over box style.
		function drawPanel(r, fill, edge, light) {
			fill = fill || PANEL_FILL; edge = edge || PANEL_EDGE; light = light || PANEL_LIGHT;
			rect(r.x - 1, r.y - 1, r.w + 2, r.h + 2, edge);
			rect(r.x, r.y, r.w, r.h, fill);
			rect(r.x, r.y, r.w, 1, light);
			rect(r.x, r.y, 1, r.h, light);
			rect(r.x, r.y + r.h - 1, r.w, 1, lerpc(edge, fill, 0.5));
		}
		// Square icon button. Off state: dim fill, dim icon, red slash.
		function drawIconButton(r, name, on) {
			on = on !== false;
			drawPanel(r, on ? PANEL_FILL : BTN_OFF);
			const ix = r.x + (r.w - 9) / 2, iy = r.y + (r.h - 9) / 2;
			drawIcon(name, ix, iy, on ? PANEL_TEXT : lerpc(PANEL_EDGE, BTN_OFF, 0.4));
			if (!on) {
				for (let i = 0; i < 11; i++) rect(Math.floor(ix) - 1 + i, Math.floor(iy) + 9 - i, 1, 1, NEW_BEST);
			}
		}
		// Text button in the "AD CONTINUE" style.
		function drawTextButton(r, label, fill, text, shadow) {
			rect(r.x - 1, r.y - 1, r.w + 2, r.h + 2, PANEL_EDGE);
			rect(r.x, r.y, r.w, r.h, fill || GO_COLOR);
			drawTextC(label, r.x + r.w / 2, r.y + 4, text || WHITE, 1, shadow || GO_SHADOW);
		}

		function draw() {
			ctx.drawImage(ev("sky", false) ? sky_war_tex : ev("storm", false) ? sky_storm_tex : sky_tex, 0, 0);
			drawClouds();
			drawHills();
			if (state !== "menu" && state !== "achievements") drawPiles();
			drawGround();

			const mf = missile_tex[Math.trunc(t * 12) % 2];
			for (const m of missiles) {
				ctx.drawImage(mf, Math.floor(m.x), Math.floor(m.y), MISSILE_W * mscale, MISSILE_H * mscale);
			}
			for (const b of bills) {
				ctx.drawImage(bill_tex, Math.floor(b.x), Math.floor(b.y + Math.sin(t * 6.0 + b.phase) * 2.0), BILL_W * mscale, BILL_H * mscale);
			}

			if (state === "achievements") {
				// the list covers the middle; no head
			} else if (state === "menu") {
				const bob = Math.sin(t * 3.0) * 3;
				const frame = head_tex[WING_SEQ[Math.trunc(wing) % 4]];
				ctx.drawImage(frame, idiv(W - HEAD_W * 2, 2), Math.trunc(ph * 0.36 + bob), HEAD_W * 2, HEAD_H * 2);
			} else if (state === "dead") {
				drawDeadHead();
			} else {
				ctx.drawImage(headFrame(), bird_x, Math.floor(by));
			}

			drawSparks();
			for (const d of rain) rect(Math.floor(d.x), Math.floor(d.y), 1, 3, RAIN);
			if (ev("dark", false) && (state === "play" || state === "paused")) drawSpotlight();

			drawHud();
			if (flash > 0) rect(0, 0, W, H, WHITE);
		}

		// The flying head; during IMMUNITY it strobes through every colour, and
		// stutters back to normal in the last moments so the player sees it ending.
		function headFrame() {
			const f = WING_SEQ[Math.trunc(wing) % 4];
			if (ev("star", false) && (event_t > STAR_WARN_T || Math.trunc(t * 10) % 2 === 0)) {
				return star_tex[Math.trunc(t * STAR_RATE) % star_tex.length][f];
			}
			return head_tex[f];
		}

		function drawSparks() {
			for (const k of sparks) {
				const x = Math.floor(k.x), y = Math.floor(k.y);
				if (k.kind === 1) { rect(x, y, 2, 2, BILL_BITS[k.ci % 2]); continue; }
				const c = SPARK[k.ci];
				rect(x, y, 1, 1, c);
				if (k.life > 0.15) {              // fresh sparkles are little crosses
					rect(x - 1, y, 1, 1, c); rect(x + 1, y, 1, 1, c);
					rect(x, y - 1, 1, 1, c); rect(x, y + 1, 1, 1, c);
				}
			}
		}

		// SHUTDOWN: everything but a circle around the head goes dark. The soft
		// circle is a texture; the rest is four rects of the same black.
		function drawSpotlight() {
			const re = spot_r + DARK_EDGE;
			const cx = Math.floor(bird_x + HEAD_W * 0.5), cy = Math.floor(by + HEAD_H * 0.5);
			ctx.drawImage(spot_tex, cx - re, cy - re);
			ctx.fillStyle = "rgba(" + DARK[0] + "," + DARK[1] + "," + DARK[2] + "," + DARK_ALPHA + ")";
			if (cy - re > 0) ctx.fillRect(0, 0, W, cy - re);
			if (cy + re < H) ctx.fillRect(0, cy + re, W, H - (cy + re));
			if (cx - re > 0) ctx.fillRect(0, cy - re, cx - re, re * 2);
			if (cx + re < W) ctx.fillRect(cx + re, cy - re, W - (cx + re), re * 2);
		}

		// Flattened circles rasterised a row at a time so the edges stay crisp.
		function fillEllipse(cx, cy, r, col) {
			const ry = r / 1.7;
			ctx.fillStyle = rgb(col);
			for (let dy = -Math.ceil(ry); dy <= Math.ceil(ry); dy++) {
				const k = 1 - (dy * dy) / (ry * ry);
				if (k <= 0) continue;
				const hw = r * Math.sqrt(k);
				ctx.fillRect(Math.round(cx - hw), cy + dy, Math.round(hw * 2), 1);
			}
		}
		function drawClouds() {
			for (const c of clouds) {
				const blobs = [[0, 0, c.r], [-c.r * 0.9, c.r * 0.30, c.r * 0.70], [c.r * 0.9, c.r * 0.28, c.r * 0.66]];
				for (const b of blobs) {
					const ox = Math.floor(c.x + b[0]), oy = Math.floor(c.y + b[1]);
					fillEllipse(ox, oy + 1, b[2], CLOUD_SHADE);
					fillEllipse(ox, oy - 1, b[2], CLOUD);
				}
			}
		}

		function drawHills() {
			const off = world_x;
			ctx.fillStyle = rgb(HILL_FAR);
			for (let x = 0; x <= W; x++) {
				const u1 = x + off * 0.35;
				const h1 = Math.max(1, Math.trunc(ph * (0.20 + 0.10 * Math.sin(u1 * 0.035) + 0.06 * Math.sin(u1 * 0.013 + 1.7))));
				ctx.fillRect(x, gy - h1, 1, h1 + 2);
			}
			ctx.fillStyle = rgb(HILL_NEAR);
			for (let x = 0; x <= W; x++) {
				const u2 = x + off * 0.6;
				const h2 = Math.max(1, Math.trunc(ph * (0.10 + 0.07 * Math.sin(u2 * 0.05 + 3.0) + 0.04 * Math.sin(u2 * 0.021))));
				ctx.fillRect(x, gy - h2, 1, h2 + 2);
			}
		}

		// One strapped bundle of bills with its top-left at (x0, y0).
		function drawBundle(x0, y0, w, h, band, jit_i, style) {
			if (h < 2) return;
			const pal = CASH_STYLES[style];
			x0 += bundle_jitter[((jit_i % 64) + 64) % 64];
			if (x0 + w < 0 || x0 >= W || y0 + h < 0 || y0 >= gy) return;
			rect(x0, y0, w, h, pal[0]);                                    // outline
			if (h >= 3) rect(x0 + 1, y0 + 1, w - 2, 1, pal[1]);            // paper edges
			if (h >= 5) {
				rect(x0 + 1, y0 + 2, w - 2, h - 4, pal[2]);                // face
				rect(x0 + 1, y0 + h - 2, w - 2, 1, pal[4]);                // underside
				if (w >= 12) {
					for (let x = x0 + 3; x < x0 + w - 1; x += 3) rect(x, y0 + 2, 1, h - 4, pal[3]);   // engraving stripes
				}
				if (band) {
					const bx = x0 + idiv(w, 2) - 1;
					rect(bx, y0 + 2, 1, h - 4, pal[6]);
					rect(bx + 1, y0 + 2, 1, h - 4, pal[7]);
				}
				if (w >= 10) { ctx.fillStyle = rgb(pal[5]); drawGrid(DOLLAR, x0 + 2, y0 + 2, 1); }
			} else if (h >= 4) {
				rect(x0 + 1, y0 + 2, w - 2, h - 3, pal[2]);
			}
		}

		// Obstacles: a pile of cash rising from the ground and another stacked
		// down from the top of the screen, with a gap between.
		function drawPiles() {
			const bh = bundle_h;
			for (const p of pipes) {
				const px = Math.trunc(p.x), gap_y = p.gap_y, w = p.w, pg = p.gap, st = p.style;
				if (px + w + 2 < 0 || px - 2 >= W) continue;
				const seed = idiv(Math.trunc(p.x + world_x), 7);       // stable jitter per obstacle
				// top pile: the bundle touching the gap is the wide "cap" one
				let y = gap_y - bh, i = 0;
				drawBundle(px - 2, y, w + 4, bh, true, seed + i, st);
				y -= bh; i++;
				while (y + bh > 0) { drawBundle(px, y, w, bh, i % 3 === 0, seed + i, st); y -= bh; i++; }
				// bottom pile: from the gap down to the ground
				y = gap_y + pg; i = 32;
				drawBundle(px - 2, y, w + 4, bh, true, seed + i, st);
				y += bh; i++;
				while (y < gy) { drawBundle(px, y, w, Math.min(bh, gy - y), i % 3 === 0, seed + i, st); y += bh; i++; }
			}
		}

		function drawGround() {
			const off = Math.trunc(world_x) % GROUND_PERIOD;
			for (let x = -off; x < W; x += GROUND_PERIOD) ctx.drawImage(ground_tex, x, gy);
		}

		// Sprite scale for the two figures on the game-over screen. The crier
		// is a bare head, so it gets one step more to match the laugher's height.
		function figureScale() { return (W >= 120 && ph >= 120) ? 2 : 1; }
		function crierScale() { return figureScale() + 1; }
		// Where the crying head ends up: bottom-left corner, mirroring the laugher.
		function crierRect() {
			const cs = crierScale();
			return R(2 * cs, gy - HEAD_H * cs, HEAD_W * cs, HEAD_H * cs);
		}

		// The player after death. Airborne: the crash face tumbles until it is
		// upside down. Landed: it rolls back upright while sliding to the
		// bottom-left corner and growing to the figure scale, then bawls there.
		function drawDeadHead() {
			const hw = HEAD_W * 0.5, hh = HEAD_H * 0.5;
			if (land_t < 0) {
				const ang = Math.min(dead_t * 5.0, Math.PI);
				ctx.save();
				ctx.translate(bird_x + hw, Math.floor(by) + hh);
				ctx.rotate(ang);
				ctx.drawImage(head_tex[2], -hw, -hh);
				ctx.restore();
				return;
			}
			const u = clamp((dead_t - land_t) / GROW_T, 0, 1);
			const target = crierRect();
			if (u >= 1) {
				const frame = cry_tex[Math.trunc(t * 4) % 2];
				const sob = Math.trunc(t * 8) % 2;   // heaving shoulders
				ctx.drawImage(frame, target.x, target.y + sob, target.w, target.h);
				return;
			}
			const e = 1 - (1 - u) * (1 - u);         // ease out
			const fromX = bird_x + hw, fromY = gy - HEAD_H + hh;
			const toX = target.x + target.w / 2, toY = target.y + target.h / 2;
			const cx = fromX + (toX - fromX) * e, cy = fromY + (toY - fromY) * e;
			const sc = 1 + (crierScale() - 1) * e;
			const ang = Math.PI + Math.PI * e;        // keep rolling forward to upright
			ctx.save();
			ctx.translate(Math.floor(cx), Math.floor(cy));
			ctx.rotate(ang);
			ctx.scale(sc, sc);
			ctx.drawImage(head_tex[2], -hw, -hh);
			ctx.restore();
		}

		// Speech bubble with a tail, centred on cxAnchor just above topY.
		// Skipped when it would run into the score panel.
		function drawBubble(msg, cxAnchor, topY, panel) {
			const tw = textW(msg, 1);
			const tx = clamp(cxAnchor - idiv(tw, 2), 3, W - tw - 3);
			const ty = topY - 10 + (Math.trunc(t * 6) % 2);
			const bx = tx - 2, bby = ty - 2, bw = tw + 4, bh = 9;
			if (bby > 0 && !intersects(R(bx, bby, bw, bh), panel)) {
				rect(bx - 1, bby, bw + 2, bh, INK);
				rect(bx, bby - 1, bw, bh + 2, INK);
				rect(bx, bby, bw, bh, WHITE);
				rect(bx + idiv(bw, 2) - 1, bby + bh, 2, 1, WHITE);
				rect(bx + idiv(bw, 2) - 2, bby + bh + 1, 4, 1, INK);
				drawText(msg, tx, ty, INK, 1);
			}
		}

		function drawLaugher(px0, py0, pw, phh) {
			const ls = figureScale();
			const frame = laugh_tex[Math.trunc(t * 6) % 2];
			const lw = LAUGH_W * ls, lh = LAUGH_H * ls;
			const lx = W - lw - 3 * ls, ly = gy - lh;
			ctx.drawImage(frame, lx, ly, lw, lh);
			const panel = R(px0 - 1, py0 - 1, pw + 2, phh + 2);
			if (dead_t > 0.25) {
				const msg = Math.trunc(t * 3) % 2 === 0 ? "HA HA HA" : "HA HA";
				drawBubble(msg, lx + idiv(lw, 2), ly, panel);
			}
			// the crier's sob bubble, once the head has settled in the corner
			if (land_t >= 0 && dead_t - land_t >= GROW_T) {
				const cr = crierRect();
				const sob = Math.trunc(t * 3) % 2 === 0 ? "WAAAH" : "SOB";
				drawBubble(sob, Math.trunc(cr.x + cr.w / 2), cr.y, panel);
			}
		}

		// Breaking-news bar while the event is fresh, then a small label with a
		// draining timer. Returns the y where the score should go.
		function drawEventHud() {
			const e = event, col = e.color, cx = idiv(W, 2);
			if (event_age < BANNER_T) {
				const ts = W >= 100 ? 2 : 1;
				const h = top + 2 + 5 * ts + 2 + 13;
				rect(0, 0, W, h, col);
				rect(0, h, W, 1, INK);
				let y = top + 2;
				drawTextC("BREAKING NEWS", cx, y, WHITE, 1);
				y += 7;
				const blink = Math.trunc(event_age * 8) % 4 !== 3;
				drawTextC(e.name, cx, y, blink ? WHITE : col, ts, INK);
				y += 5 * ts + 1;
				drawTextC(e.sub, cx, y, WHITE, 1);
				return h + 3;
			}
			const tw = textW(e.name, 1);
			drawText(e.name, 3, top + 2, WHITE, 1, INK);
			const frac = event_t / e.dur;
			rect(3, top + 9, tw + 1, 2, INK);
			rect(3, top + 9, Math.trunc((tw + 1) * frac), 2, lerpc(col, WHITE, 0.35));
			return top + 3;
		}

		function drawHud() {
			const cx = idiv(W, 2);
			switch (state) {
				case "menu":
					menu_rect = null;
					drawTitle("TRAPPY FLUMP", cx, top + Math.trunc(ph * 0.08), 2);
					if (Math.trunc(t * 2) % 2 === 0) drawTextC("TAP TO FLAP", cx, Math.trunc(ph * 0.66), WHITE, 1, INK);
					drawMenuBottom(cx);
					break;
				case "achievements":
					drawAchievements(cx);
					break;
				case "play":
				case "paused": {
					let sy = top + 3;
					if (event) sy = drawEventHud();
					drawTextC(String(score), cx, sy, WHITE, 3, INK);
					if (state === "paused") {
						ctx.fillStyle = "rgba(0,0,0,0.45)";
						ctx.fillRect(0, 0, W, H);
						drawTextC("PAUSED", cx, Math.trunc(ph * 0.40), WHITE, 2, INK);
						drawTextC("TAP TO RESUME", cx, Math.trunc(ph * 0.40) + 14, WHITE, 1, INK);
					}
					// small home button in the corner; the tap rect is padded for thumbs
					const hb = R(W - 15, top + 2, 13, 13);
					drawIconButton(hb, "home");
					menu_rect = grow(hb, 3);
					break;
				}
				case "dead":
					drawGameOver(cx);
					break;
			}
		}

		// Menu bottom: sound, music and achievements buttons in a row, and the
		// best score on a panel standing on the grass.
		function drawMenuBottom(cx) {
			const num = String(best);
			const pw = Math.max(bigTextW(num, 2), textW("BEST SCORE")) + 12;
			const phh = 3 + 5 + 3 + 14 + 3;
			const pr = R(cx - idiv(pw, 2), gy - 3 - phh, pw, phh);
			// dark wood so the gold number reads from across the room
			drawPanel(pr, PANEL_DARK, PANEL_DARK_EDGE, PANEL_DARK_LIGHT);
			drawTextC("BEST SCORE", cx, pr.y + 3, PANEL_LIGHT);
			drawBigTextC(num, cx, pr.y + 11, GOLD, 2, PANEL_DARK_EDGE);

			const bs = 15, gp = 6;
			const x0 = cx - idiv(3 * bs + 2 * gp, 2);
			const ry = pr.y - 6 - bs;
			const sr = R(x0, ry, bs, bs);
			const mr = R(x0 + bs + gp, ry, bs, bs);
			const ar = R(x0 + 2 * (bs + gp), ry, bs, bs);
			drawIconButton(sr, "sound", audio.sound);
			drawIconButton(mr, "music", audio.music);
			drawIconButton(ar, "trophy");
			sound_rect = grow(sr, 2);
			music_rect = grow(mr, 2);
			achievements_rect = grow(ar, 2);
		}

		// In-game achievements list. Any tap goes back to the menu.
		function drawAchievements(cx) {
			const rows = ACHIEVEMENTS;
			const row_h = rows.length <= 9 ? 15 : 14;
			const head_h = 13;
			const pw = W - 8;
			const phh = head_h + row_h * rows.length + 4;
			const y0 = clamp(idiv(ph - phh, 2) - 8, 8, 24);
			const x0 = cx - idiv(pw, 2);
			const pr = R(x0, y0, pw, phh);
			drawPanel(pr);
			// dark header strip with the title and the tally
			rect(x0, y0, pw, head_h, PANEL_DARK);
			rect(x0, y0 + head_h, pw, 1, PANEL_DARK_EDGE);
			drawText("ACHIEVEMENTS", x0 + 4, y0 + 4, GOLD, 1, PANEL_DARK_EDGE);
			const tally = unlockedCount() + "/" + rows.length;
			drawText(tally, x0 + pw - 4 - textW(tally, 1), y0 + 4, PANEL_LIGHT);
			let y = y0 + head_h + 3;
			const dim = lerpc(PANEL_EDGE, PANEL_FILL, 0.45);
			const desc_on = lerpc(PANEL_EDGE, PANEL_FILL, 0.25);
			for (const a of rows) {
				const on = !!unlocked[a.key];
				drawIcon("trophy", x0 + 4, y + 2, on ? GOLD : dim, on ? GOLD_SHADOW : null);
				drawText(a.title, x0 + 17, y, on ? PANEL_TEXT : dim);
				drawText(a.desc, x0 + 17, y + 7, on ? desc_on : dim);
				y += row_h;
			}
			if (Math.trunc(t * 2) % 2 === 0) drawTextC("TAP TO GO BACK", cx, y0 + phh + 6, WHITE, 1, INK);
		}

		function drawGameOver(cx) {
			drawTextC("GAME OVER", cx, top + Math.trunc(ph * 0.10), GO_COLOR, 2, GO_SHADOW);
			const s = W >= 100 ? 2 : 1;
			const l1 = "SCORE " + score, l2 = "BEST " + best;
			const tw = Math.max(textW(l1, s), textW(l2, s));
			const pad = 4 * s;
			const pw = tw + pad * 2;
			const phh = 10 * s + 3 * s + pad * 2;
			const x0 = cx - idiv(pw, 2);
			const y0 = Math.trunc(ph * 0.30);

			drawLaugher(x0, y0, pw, phh);
			rect(x0 - 1, y0 - 1, pw + 2, phh + 2, PANEL_EDGE);
			rect(x0, y0, pw, phh, PANEL_FILL);
			rect(x0, y0, pw, 1, PANEL_LIGHT);
			rect(x0, y0, 1, phh, PANEL_LIGHT);
			drawTextC(l1, cx, y0 + pad, PANEL_TEXT, s);
			drawTextC(l2, cx, y0 + pad + 8 * s, PANEL_TEXT, s);
			if (new_best) drawTextC("NEW BEST", cx, y0 + phh + 3, NEW_BEST, 1, PANEL_LIGHT);

			// MENU under the panel, once the death has landed
			menu_rect = null;
			if (dead_t > 0.5) {
				const my = y0 + phh + 16;
				const mw = textW("MENU", 1) + 12;
				const mr = R(cx - idiv(mw, 2), my, mw, 13);
				drawTextButton(mr, "MENU", PANEL_FILL, PANEL_TEXT, PANEL_LIGHT);
				menu_rect = grow(mr, 2);
			}

			if (dead_t > 0.5 && Math.trunc(t * 2) % 2 === 0) drawTextC("TAP TO RETRY", cx, Math.trunc(ph * 0.80), WHITE, 1, INK);
		}

		// -------------------------------------------------------------- api
		setupWorld();
		newRun();

		return {
			tap: tap,
			flap: flap,
			restart: restart,
			pause: pause,
			setAudio: setAudio,
			step: function (dt) { update(Math.min(dt, MAX_DT)); },
			draw: draw,
			on: function (name, fn) { (listeners[name] = listeners[name] || []).push(fn); },
			get state() { return state; },
			get score() { return score; },
			get best() { return best; },
			get event() { return event ? event.name : ""; },
			get unlocked() { return Object.keys(unlocked); },
			// tests: start EVENTS[i] now (ignores score and cooldown)
			forceEvent: function (i) { if (state === "play" && !event) startEvent(EVENTS[i % EVENTS.length]); },
			get headY() { return by; },
			get nextGap() {
				for (const p of pipes) if (p.x + p.w >= bird_x) return { x: p.x, y: p.gap_y, gap: p.gap };
				return null;
			},
			// tests: the tappable HUD rects as last drawn (null when hidden)
			get buttons() { return { sound: sound_rect, music: music_rect, achievements: achievements_rect, menu: menu_rect }; },
		};
	}

	// Wires a canvas up to the page: pointer + keyboard input, rAF loop,
	// pause when the tab hides. Returns the game object.
	function mount(canvas) {
		const game = create(canvas);
		let focused = false;
		// pointer position in the canvas's own 128x228 pixels
		function canvasPoint(e) {
			const r = canvas.getBoundingClientRect();
			return [(e.clientX - r.left) * canvas.width / r.width, (e.clientY - r.top) * canvas.height / r.height];
		}
		canvas.addEventListener("pointerdown", function (e) {
			e.preventDefault();
			focused = true;
			canvas.focus({ preventScroll: true });
			const p = canvasPoint(e);
			game.tap(p[0], p[1]);
		});
		document.addEventListener("pointerdown", function (e) {
			if (!canvas.contains(e.target)) focused = false;
		});
		document.addEventListener("keydown", function (e) {
			if (e.repeat) return;
			const active = focused || document.activeElement === canvas;
			if (!active) return;
			if (e.code === "Space" || e.code === "ArrowUp" || e.code === "KeyW") {
				e.preventDefault(); game.tap(-1, -1);
			} else if (e.code === "KeyR") {
				e.preventDefault(); game.restart();
			}
		});
		document.addEventListener("visibilitychange", function () { if (document.hidden) game.pause(); });
		window.addEventListener("blur", function () { game.pause(); });
		// Keys stop reaching the game once the canvas loses focus, so pause
		// rather than let a run die to a keyboard that has gone quiet.
		canvas.addEventListener("blur", function () { focused = false; game.pause(); });

		let last = 0;
		function frame(now) {
			const dt = last ? (now - last) / 1000 : 0;
			last = now;
			game.step(dt);
			game.draw();
			requestAnimationFrame(frame);
		}
		requestAnimationFrame(frame);
		return game;
	}

	// FONT and the title colours are exported for tools/title.js, which renders
	// the site's header title from the same grid as the in-game one.
	return { create: create, mount: mount, EVENTS: EVENTS, ACHIEVEMENTS: ACHIEVEMENTS, WIDTH: 128, HEIGHT: 228,
		FONT: FONT, TITLE: { fills: TITLE_FILLS, outline: NAVY, shadow: TITLE_RED, ring: RING } };
});
