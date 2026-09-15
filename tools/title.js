// Renders the game's title lettering as an SVG for the site header.
// Same 3x5 grid and the same rules as drawTitle() in game.js: gold and white
// words, a 1 px navy outline, and the outlined shape shifted down-right in
// red as the drop shadow. One SVG pixel is one game pixel; the page scales
// it by a whole number.  `node tools/title.js > title.svg`
"use strict";
const TF = require("../game.js");
const TEXT = process.argv[2] || "TRAPPY FLUMP";
const { FONT, TITLE } = TF;
const hex = (c) => "#" + c.map((v) => v.toString(16).padStart(2, "0")).join("");

// paint into a sparse pixel map; later paints win, as on the canvas
const px = new Map();
const put = (x, y, col) => px.set(x + "," + y, col);
function text(s, ox, oy, col) {
	for (let i = 0; i < s.length; i++) {
		const rows = FONT[s[i]];
		if (!rows) continue;
		for (let r = 0; r < 5; r++) for (let c = 0; c < 3; c++) if (rows[r][c] === "#") put(ox + i * 4 + c, oy + r, col);
	}
}
for (const d of TITLE.ring) text(TEXT, 1 + d[0], 1 + d[1], TITLE.shadow);
text(TEXT, 1, 1, TITLE.shadow);
for (const d of TITLE.ring) text(TEXT, d[0], d[1], TITLE.outline);
for (let i = 0, w = 0; i < TEXT.length; i++) {
	if (TEXT[i] === " ") w++;
	else text(TEXT[i], i * 4, 0, TITLE.fills[w % 2]);
}

// bounds, then one path per colour made of horizontal runs
let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
for (const k of px.keys()) {
	const [x, y] = k.split(",").map(Number);
	x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y);
}
const paths = new Map();
for (let y = y0; y <= y1; y++) {
	for (let x = x0; x <= x1; x++) {
		const col = px.get(x + "," + y);
		if (!col) continue;
		let w = 1;
		while (px.get((x + w) + "," + y) === col) w++;
		const key = hex(col);
		paths.set(key, (paths.get(key) || "") + "M" + x + " " + y + "h" + w + "v1h-" + w + "z");
		x += w - 1;
	}
}
const W = x1 - x0 + 1, H = y1 - y0 + 1;
let out = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="' + x0 + " " + y0 + " " + W + " " + H + '" width="' + W + '" height="' + H + '" shape-rendering="crispEdges" role="img" aria-label="' + TEXT + '">';
for (const [col, d] of paths) out += '<path fill="' + col + '" d="' + d + '"/>';
out += "</svg>\n";
process.stdout.write(out);
