// Headless soak test for the browser port: runs the real game loop with a
// tapping autopilot on a stub canvas, so every simulation and draw path is
// exercised without a browser. Between runs it also pokes the menu buttons
// (achievements list, sound switch) and the in-game home / menu buttons.
// `node test/soak.js [minutes]`
"use strict";
const TrappyFlump = require("../game.js");

const calls = { fillRect: 0, drawImage: 0 };
function stubCanvas(w, h) {
	const ctx = new Proxy({}, {
		get: (_, k) => (k === "fillStyle" || k === "imageSmoothingEnabled") ? undefined : function () { if (k in calls) calls[k]++; },
		set: () => true,
	});
	return { width: w, height: h, getContext: () => ctx };
}
const store = {}; // stands in for localStorage
const storage = { getItem: (k) => store[k] || null, setItem: (k, v) => { store[k] = v; } };

const minutes = parseFloat(process.argv[2] || "5");
const canvas = stubCanvas(TrappyFlump.WIDTH, TrappyFlump.HEIGHT);
const game = TrappyFlump.create(canvas, { makeCanvas: stubCanvas, storage });

let deaths = 0, frames = 0;
const seen = {};
const states = {};
const taps = { achievements: 0, sound: 0, home: 0, menu: 0 };
let soundOn = true;
game.on("dead", () => deaths++);
game.on("event", (e) => { seen[e.name] = (seen[e.name] || 0) + 1; });
game.on("sound", (on) => { soundOn = on; });
let smashed = 0, grabbed = 0;
game.on("smash", (n) => { smashed = Math.max(smashed, n); });
game.on("cash", (n) => { grabbed = Math.max(grabbed, n); });

const mid = (r) => [r.x + r.w / 2, r.y + r.h / 2];
const dt = 1 / 60;
let sinceDeath = 0, sinceFlap = 0, sinceEvent = 0, forced = 0, sinceMenu = 0, sinceHome = 0, pokedAt = -1;
for (let time = 0; time < minutes * 60; time += dt) {
	frames++;
	states[game.state] = (states[game.state] || 0) + 1;
	sinceFlap += dt;
	if (game.state === "menu") {
		// every other visit to the menu: open the achievements list and toggle
		// sound off and on again before flying; the rects come from the last draw
		const b = game.buttons;
		if (pokedAt !== deaths && b.achievements) {
			pokedAt = deaths;
			if (deaths % 2 === 1) {
				taps.achievements++;
				game.tap(...mid(b.achievements));
			} else {
				taps.sound++;
				game.tap(...mid(b.sound));
				if (!soundOn) game.tap(...mid(b.sound));
			}
		} else {
			game.flap();
		}
	} else if (game.state === "achievements") {
		sinceMenu += dt;
		if (sinceMenu > 0.5) { sinceMenu = 0; game.tap(64, 100); }   // anywhere goes back
	} else if (game.state === "dead") {
		sinceDeath += dt;
		// every third death leave through the MENU button instead of a retry tap
		const b = game.buttons;
		if (sinceDeath > 0.7 && deaths % 3 === 0 && b.menu && taps.menu < deaths) { taps.menu++; sinceDeath = 0; game.tap(...mid(b.menu)); }
		else if (sinceDeath > 2.5) { sinceDeath = 0; game.flap(); }   // long enough for the head to land and cry
	} else if (game.state === "play") {
		const gapInfo = game.nextGap;
		let centre = gapInfo ? gapInfo.y + gapInfo.gap / 2 : 90;
		if (game.event === "IMMUNITY") centre -= 20;   // aim into the pile on purpose: exercise bulldozing
		// keep the head's centre just above the gap centre; a flap lifts ~1.5 heads
		if (game.headY + 5.5 > centre - 2 && sinceFlap > 0.1) { sinceFlap = 0; game.flap(); }
		// force the rotation as well as rolling the dice, so a short run still sees every event
		sinceEvent += dt;
		if (!game.event && game.score >= 1 && sinceEvent > 1.5) { sinceEvent = 0; game.forceEvent(forced++); }
		// once in a while bail out with the home button
		sinceHome += dt;
		if (sinceHome > 45 && game.buttons.menu) { sinceHome = 0; taps.home++; game.tap(...mid(game.buttons.menu)); }
	}
	game.step(dt);
	game.draw();
}

const unlocked = game.unlocked;
console.log(JSON.stringify({ minutes, frames, deaths, best: game.best, events: seen, smashed, grabbed, unlocked, taps, states, draws: calls }, null, 2));
const missing = TrappyFlump.EVENTS.map((e) => e.name).filter((n) => !seen[n]);
if (missing.length) { console.error("events never seen:", missing); process.exit(1); }
if (game.best < 5) { console.error("autopilot never scored 5; physics or autopilot broken"); process.exit(1); }
if (!smashed) { console.error("IMMUNITY never bulldozed a pile"); process.exit(1); }
if (!grabbed) { console.error("STIMULUS never handed out a bill"); process.exit(1); }
if (!states.achievements) { console.error("achievements screen never opened"); process.exit(1); }
if (!unlocked.length) { console.error("no achievement unlocked"); process.exit(1); }
if (!soundOn) { console.error("sound switch left off"); process.exit(1); }
if (!taps.menu || !taps.home) { console.error("MENU / home buttons never hit:", taps); process.exit(1); }
if (JSON.parse(store["trappy-flump-achievements"]).length !== unlocked.length) { console.error("achievements not persisted"); process.exit(1); }
