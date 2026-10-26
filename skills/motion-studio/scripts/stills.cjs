#!/usr/bin/env node
/* Batch stills: one bundle and one browser for all frames (the CLI rebuilds both on every `remotion still`).

  node <skill>/scripts/stills.cjs Showcase --timeline public/timeline.json     start, middle and end of each scene
  node <skill>/scripts/stills.cjs Showcase --times 1.2,3.5,7                   instants in seconds
  node <skill>/scripts/stills.cjs Showcase --frames 45,90 --scale 1 --out out/sf
  node <skill>/scripts/stills.cjs Showcase --format reels --out out/stills-reels     another format, same composition
Run in the project folder. Writes f<frame>.png, index.json and layout.json to --out (default out/stills); the contact
sheet comes from `contact_sheet.py --stills out/stills`, no MP4 needed, and `layout.py out/stills` measures the text.
layout.json comes from the composition's <Probe /> (box, size, color and visibility of each DOM text).
Uses the backend from out/gl.json when present. --max caps stills per call (default: the score's budget.stills,
or 30): exceeding the cap requires an explicit --max. Each call is logged to out/ledger.json.
*/
const fs = require('fs');
const path = require('path');
const {createRequire} = require('module');

const args = process.argv.slice(2);
const opt = (name, def) => {
	const i = args.indexOf(`--${name}`);
	return i >= 0 ? args[i + 1] : def;
};
const comp = args[0] && !args[0].startsWith('--') ? args[0] : null;
const proj = process.cwd();
const out = path.resolve(opt('out', 'out/stills'));
const scale = Number(opt('scale', '0.5'));
const par = Number(opt('parallel', '4'));

const fail = (msg) => {
	console.error(msg);
	process.exit(1);
};
if (!comp) fail('usage: node stills.cjs <Composition> [--timeline file | --times s,s | --frames n,n] [--format reels] [--scale 0.5] [--out out/stills] [--max 30] [--gl backend]');
const inputProps = {...JSON.parse(opt('props', '{}')), probe: true};
if (opt('format')) inputProps.format = opt('format');

const req = createRequire(path.join(proj, 'package.json'));
let bundler, renderer;
try {
	bundler = req('@remotion/bundler');
	renderer = req('@remotion/renderer');
} catch (e) {
	fail('@remotion/bundler and @remotion/renderer not found in the project: run npm install in the video folder');
}

const entry = ['src/index.ts', 'src/index.tsx', 'src/index.js', 'src/index.jsx'].map((p) => path.join(proj, p)).find((p) => fs.existsSync(p));
if (!entry) fail('src/index.ts not found in the current folder');

let gl = opt('gl', null);
const glFile = path.join(proj, 'out/gl.json');
if (!gl && fs.existsSync(glFile)) gl = JSON.parse(fs.readFileSync(glFile, 'utf8')).gl || null;

(async () => {
	const serveUrl = await bundler.bundle({entryPoint: entry, publicDir: path.join(proj, 'public')});
	// The bundle copies the whole public folder to the system temp dir: without this, each run leaves hundreds of MB behind.
	process.on('exit', () => {
		try {
			fs.rmSync(serveUrl, {recursive: true, force: true});
		} catch (e) {}
	});
	const browser = await renderer.openBrowser('chrome', {logLevel: 'error', ...(process.env.REMOTION_BROWSER_EXECUTABLE ? {browserExecutable: process.env.REMOTION_BROWSER_EXECUTABLE} : {}), ...(gl ? {chromiumOptions: {gl}} : {})});
	const composition = await renderer.selectComposition({serveUrl, id: comp, puppeteerInstance: browser, inputProps});
	const {fps, durationInFrames} = composition;

	let times;
	let budget = 30;
	const tlFile = path.resolve(opt('timeline', 'public/timeline.json'));
	if (fs.existsSync(tlFile)) budget = (JSON.parse(fs.readFileSync(tlFile, 'utf8')).budget || {}).stills || budget;
	if (opt('frames')) {
		times = opt('frames').split(',').map((f) => Number(f) / fps);
	} else if (opt('times')) {
		times = opt('times').split(',').map(Number);
	} else {
		const tl = JSON.parse(fs.readFileSync(tlFile, 'utf8'));
		times = tl.scenes.flatMap((s) => [s.start + 0.15, (s.start + s.end) / 2, s.end - 0.15]);
	}
	const frames = [...new Set(times.map((t) => Math.min(Math.max(Math.round(t * fps), 0), durationInFrames - 1)))];

	const max = Number(opt('max', budget));
	if (frames.length > max) fail(`${frames.length} stills exceed the cap of ${max} per run: look at fewer frames (--times) or pass --max ${frames.length} and say why`);

	fs.mkdirSync(out, {recursive: true});
	for (const f of fs.readdirSync(out)) if (/^f\d+\.png$/.test(f) || f === 'index.json' || f === 'layout.json') fs.unlinkSync(path.join(out, f));
	const layout = {};
	const onBrowserLog = (log) => {
		const i = log.text.indexOf('__EMD_LAYOUT__');
		if (i < 0) return;
		try {
			const m = JSON.parse(log.text.slice(i + 14));
			layout[m.frame] = m;
		} catch (e) {}
	};
	const index = frames.map((frame) => ({frame, t: Number((frame / fps).toFixed(3)), file: `f${String(frame).padStart(5, '0')}.png`}));
	let next = 0;
	await Promise.all(
		Array.from({length: Math.max(1, Math.min(par, index.length))}, async () => {
			while (next < index.length) {
				const it = index[next++];
				await renderer.renderStill({composition, serveUrl, frame: it.frame, scale, output: path.join(out, it.file), puppeteerInstance: browser, inputProps, onBrowserLog, onLog: () => {}, logLevel: 'error'});
			}
		}),
	);
	await browser.close({silent: true});
	const {width, height} = composition;
	fs.writeFileSync(path.join(out, 'index.json'), JSON.stringify({composition: comp, fps, scale, width, height, format: inputProps.format || null, stills: index}, null, 1));
	const probed = Object.keys(layout).length;
	fs.writeFileSync(path.join(out, 'layout.json'), JSON.stringify({composition: comp, fps, width, height, frames: index.map((it) => ({...it, items: (layout[it.frame] || {}).items || null}))}));
	const ledgerFile = path.join(proj, 'out/ledger.json');
	const ledger = fs.existsSync(ledgerFile) ? JSON.parse(fs.readFileSync(ledgerFile, 'utf8')) : [];
	ledger.push({at: new Date().toISOString(), kind: 'stills', composition: comp, format: inputProps.format || null, count: index.length});
	fs.writeFileSync(ledgerFile, JSON.stringify(ledger, null, 1));
	console.log(JSON.stringify({out: path.relative(proj, out), stills: index.length, layout: probed ? `${probed} frames measured` : 'no <Probe /> in the composition: layout.py has nothing to measure', gl: gl || 'default'}));
	process.exit(0);
})().catch((e) => fail(e && e.stack ? e.stack : String(e)));
