#!/usr/bin/env node
/* Per-scene render, with master patching, multiple formats per run and a render budget.

  node <skill>/scripts/render.cjs Showcase                          full render -> out/render.mp4
  node <skill>/scripts/render.cjs Showcase --scene fecho,abre       re-renders only these scenes and rebuilds the master
  node <skill>/scripts/render.cjs Showcase --formats reels,square,youtube     -> out/render-<format>.mp4
  node <skill>/scripts/render.cjs Showcase --draft                  half scale to out/draft.mp4, outside the budget
  node <skill>/scripts/render.cjs Showcase --remux                  only the audio changed: rebuilds the master without rendering anything
Run in the project folder, after mix.py. One bundle and one browser serve all scenes. Each scene in the score
becomes a segment in out/seg/<format>/; the master is the segments joined without re-encode, with the audio from timeline.audio.
--scene reuses other scenes' segments if their frame range has not changed. Changed code that several
scenes use (theme, component, block)? Run without --scene: patching only knows what you say changed.
Budget: the score's budget.full_renders (default 4). Once exceeded, the script refuses; --over "reason" unlocks it and the
reason is logged to out/ledger.json. Uses the graphics backend from out/gl.json (run gl.py once per project).
*/
const fs = require('fs');
const path = require('path');
const {createRequire} = require('module');
const {execFileSync} = require('child_process');

const args = process.argv.slice(2);
const opt = (name, def) => {
	const i = args.indexOf(`--${name}`);
	return i >= 0 ? args[i + 1] : def;
};
const flag = (name) => args.includes(`--${name}`);
const fail = (msg) => {
	console.error(msg);
	process.exit(1);
};
const comp = args[0] && !args[0].startsWith('--') ? args[0] : null;
if (!comp) fail('usage: node render.cjs <Composition> [--scene id,id] [--formats reels,square,youtube] [--draft] [--remux] [--over "reason"] [--props json] [--concurrency n]');

const proj = process.cwd();
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
const tlFile = path.resolve(opt('timeline', 'public/timeline.json'));
const tl = JSON.parse(fs.readFileSync(tlFile, 'utf8'));
const draft = flag('draft');
const remux = flag('remux');
const only = opt('scene') ? opt('scene').split(',') : null;
const formats = opt('formats') ? opt('formats').split(',') : [null];
const baseProps = JSON.parse(opt('props', '{}'));
for (const id of only || []) if (!tl.scenes.some((s) => s.id === id)) fail(`scene "${id}" does not exist in the score (${tl.scenes.map((s) => s.id).join(', ')})`);

const ledgerFile = path.join(proj, 'out/ledger.json');
const ledger = fs.existsSync(ledgerFile) ? JSON.parse(fs.readFileSync(ledgerFile, 'utf8')) : [];
const budget = (tl.budget || {}).full_renders || 4;
const spent = ledger.filter((e) => e.kind === 'full').length;
const full = !only && !draft && !remux;
if (full && spent >= budget && !opt('over')) {
	fail(`budget: ${spent} full renders already done, cap ${budget}. Check with stills (stills.cjs) or re-render just the scene (--scene id). To proceed anyway: --over "reason"`);
}

let gl = opt('gl', null);
const glFile = path.join(proj, 'out/gl.json');
if (!gl && fs.existsSync(glFile)) gl = JSON.parse(fs.readFileSync(glFile, 'utf8')).gl || null;
const ff = (a) => execFileSync('ffmpeg', ['-v', 'error', '-y', ...a], {stdio: ['ignore', 'ignore', 'inherit']});

(async () => {
	const t0 = Date.now();
	const serveUrl = await bundler.bundle({entryPoint: entry, publicDir: path.join(proj, 'public')});
	// The bundle copies the whole public folder to the system temp dir: without this, each run leaves hundreds of MB behind.
	process.on('exit', () => {
		try {
			fs.rmSync(serveUrl, {recursive: true, force: true});
		} catch (e) {}
	});
	const browser = await renderer.openBrowser('chrome', {logLevel: 'error', ...(process.env.REMOTION_BROWSER_EXECUTABLE ? {browserExecutable: process.env.REMOTION_BROWSER_EXECUTABLE} : {}), ...(gl ? {chromiumOptions: {gl}} : {})});
	const outputs = [];
	let frames = 0;
	for (const format of formats) {
		const inputProps = {...baseProps, ...(format ? {format} : {})};
		const composition = await renderer.selectComposition({serveUrl, id: comp, puppeteerInstance: browser, inputProps});
		const {fps, durationInFrames} = composition;
		const dir = path.join(proj, 'out/seg', draft ? 'draft' : format || 'main');
		fs.mkdirSync(dir, {recursive: true});
		const manFile = path.join(dir, 'manifest.json');
		const man = fs.existsSync(manFile) ? JSON.parse(fs.readFileSync(manFile, 'utf8')) : {};
		const done = [];
		const list = [];
		for (const [i, s] of tl.scenes.entries()) {
			const a = Math.round(s.start * fps);
			const b = Math.min(i + 1 < tl.scenes.length ? Math.round(tl.scenes[i + 1].start * fps) : durationInFrames, durationInFrames) - 1;
			const file = path.join(dir, `${String(i).padStart(2, '0')}_${s.id}.mp4`);
			const same = man[s.id] && man[s.id].a === a && man[s.id].b === b && fs.existsSync(file);
			if (remux && !same) fail(`--remux: the segment for scene ${s.id} does not exist or its range changed; run without --remux`);
			if (!remux && (!only || only.includes(s.id) || !same)) {
				if (only && !only.includes(s.id)) console.error(`scene ${s.id}: frame range changed, re-rendering it too`);
				await renderer.renderMedia({
					composition, serveUrl, codec: 'h264', outputLocation: file, frameRange: [a, b], muted: true, inputProps,
					colorSpace: 'bt709', puppeteerInstance: browser, logLevel: 'error', scale: draft ? 0.5 : 1,
					...(opt('concurrency') ? {concurrency: Number(opt('concurrency'))} : {}), ...(gl ? {chromiumOptions: {gl}} : {}),
				});
				man[s.id] = {a, b};
				done.push(s.id);
				frames += b - a + 1;
			}
			list.push(`file '${file.replace(/'/g, "'\\''")}'`);
		}
		for (const id of Object.keys(man)) if (!tl.scenes.some((s) => s.id === id)) delete man[id];
		fs.writeFileSync(manFile, JSON.stringify(man, null, 1));
		fs.writeFileSync(path.join(dir, 'list.txt'), list.join('\n'));
		const out = path.join(proj, 'out', draft ? `draft${format ? `-${format}` : ''}.mp4` : `render${format ? `-${format}` : ''}.mp4`);
		const audio = tl.audio ? path.join(path.dirname(tlFile), tl.audio) : null;
		const mux = ['-f', 'concat', '-safe', '0', '-i', path.join(dir, 'list.txt')];
		if (audio && fs.existsSync(audio)) {
			// AAC produces peaks above the WAV (measured: up to 2 dB on heavily amplified speech). A limiter 1 dB below
			// the mix ceiling keeps the MP4 peak within what qa.py requires, without touching loudness.
			const tp = ((tl.loudness || {}).tp ?? -3) - 1;
			mux.push('-i', audio, '-map', '0:v:0', '-map', '1:a:0', '-af', `alimiter=limit=${Math.pow(10, tp / 20).toFixed(3)}:attack=5:release=80:level=false`, '-c:a', 'aac', '-b:a', '192k', '-ar', '48000', '-t', String(durationInFrames / fps));
		}
		else console.error('no audio: timeline.audio does not exist (run mix.py first)');
		ff([...mux, '-c:v', 'copy', '-movflags', '+faststart', out]);
		outputs.push({format: format || 'score', out: path.relative(proj, out), cenas_refeitas: done, cenas_reaproveitadas: tl.scenes.length - done.length});
	}
	await browser.close({silent: true});
	const sec = Math.round((Date.now() - t0) / 100) / 10;
	ledger.push({at: new Date().toISOString(), kind: draft ? 'draft' : remux ? 'remux' : full ? 'full' : 'scene', composition: comp, formats: formats.filter(Boolean), scenes: only, frames, sec, ...(opt('over') ? {over: opt('over')} : {})});
	fs.mkdirSync(path.dirname(ledgerFile), {recursive: true});
	fs.writeFileSync(ledgerFile, JSON.stringify(ledger, null, 1));
	console.log(JSON.stringify({outputs, frames, sec, gl: gl || 'default', renders_completos: `${spent + (full ? 1 : 0)} of ${budget}`}));
	process.exit(0);
})().catch((e) => fail(e && e.stack ? e.stack : String(e)));
