import React, {useEffect, useState} from 'react';
import {continueRender, delayRender, getInputProps, useCurrentFrame, useVideoConfig} from 'remotion';

/**
 * Layout probe. Only acts when the still is requested with the `probe` prop (as scripts/stills.cjs does):
 * measures each text's box, size, color and visible fraction in the DOM and sends it to the browser log.
 * scripts/layout.py reads these measurements and fails text outside the safe area, clipped, overlapping, too
 * small or low-contrast. Mark ornamental text that may bleed off-frame with data-decor.
 */
export const Probe: React.FC = () => {
	const frame = useCurrentFrame();
	const {width, height} = useVideoConfig();
	const on = Boolean((getInputProps() as {probe?: boolean}).probe);
	const [handle] = useState(() => (on ? delayRender('probe') : null));
	useEffect(() => {
		if (!on || handle === null) return;
		const run = async () => {
			await document.fonts.ready;
			const marker = document.getElementById('emd-probe');
			const stage = marker?.parentElement;
			if (!marker || !stage) return;
			const sr = stage.getBoundingClientRect();
			const k = width / (sr.width || width);
			const items: unknown[] = [];
			const walker = document.createTreeWalker(stage, NodeFilter.SHOW_TEXT);
			for (let n = walker.nextNode(); n; n = walker.nextNode()) {
				const el = n.parentElement;
				if (!n.textContent?.trim() || !el || el.closest('[data-decor]')) continue;
				// Measure the text node, not the element: parent and child with their own text become separate boxes.
				const range = document.createRange();
				range.selectNode(n);
				const full = range.getBoundingClientRect();
				if (full.width < 2 || full.height < 2) continue;
				const cs = getComputedStyle(el);
				const isSvg = (el as Element) instanceof SVGElement;
				const elBox = el.getBoundingClientRect();
				const ratio = isSvg ? ((el as unknown as SVGGraphicsElement).getScreenCTM?.()?.a ?? 1) : (el as HTMLElement).offsetHeight ? elBox.height / (el as HTMLElement).offsetHeight : 1;
				const fontPx = parseFloat(cs.fontSize) * ratio;
				// A line box has the height of the font's content area (up to 1.5 em in a condensed face), much taller
				// than the glyph. To judge clipping and visibility use the middle 1.2 em band: fits accents and descenders.
				const band = full.height <= fontPx * 1.7 ? Math.min(full.height, fontPx * 1.2) : full.height;
				const b = {left: full.left, right: full.right, width: full.width, top: full.top + (full.height - band) / 2, bottom: full.bottom - (full.height - band) / 2, height: band};
				let op = 1;
				let blur = 0;
				// The frame edge is not applied here: text that leaves the frame still counts, and layout.py fails it.
				let [l, t, r, bt] = [-1e9, -1e9, 1e9, 1e9];
				for (let a: Element | null = el; a && a !== stage; a = a.parentElement) {
					const s = getComputedStyle(a);
					op *= s.visibility === 'hidden' || s.display === 'none' ? 0 : parseFloat(s.opacity);
					const m = /blur\(([\d.]+)px\)/.exec(s.filter);
					if (m) blur = Math.max(blur, parseFloat(m[1]));
					const inset = /^inset\(([^)]+)\)/.exec(s.clipPath);
					if (a !== el && (s.overflow !== 'visible' || s.clipPath !== 'none') && !inset) {
						const ar = a.getBoundingClientRect();
						[l, t, r, bt] = [Math.max(l, ar.left), Math.max(t, ar.top), Math.min(r, ar.right), Math.min(bt, ar.bottom)];
					}
					if (inset) {
						// clip-path: inset(top right bottom left) on the element itself or an ancestor (clip reveal).
						const ar = a.getBoundingClientRect();
						const v = inset[1].split(/\s+/).filter((x) => /^[\d.]/.test(x));
						const [it, ir, ib, il] = [v[0], v[1] ?? v[0], v[2] ?? v[0], v[3] ?? v[1] ?? v[0]].map((x, i) => (x.endsWith('%') ? (parseFloat(x) / 100) * (i % 2 ? ar.width : ar.height) : parseFloat(x)));
						[l, t, r, bt] = [Math.max(l, ar.left + il), Math.max(t, ar.top + it), Math.min(r, ar.right - ir), Math.min(bt, ar.bottom - ib)];
					}
				}
				const vis = (Math.max(0, Math.min(b.right, r) - Math.max(b.left, l)) * Math.max(0, Math.min(b.bottom, bt) - Math.max(b.top, t))) / (b.width * b.height);
				const svg = isSvg;
				items.push({
					text: n.textContent.trim().slice(0, 48),
					x: Math.round((b.left - sr.left) * k),
					y: Math.round((b.top - sr.top) * k),
					w: Math.round(b.width * k),
					h: Math.round(b.height * k),
					font: Math.round(fontPx * k * 10) / 10,
					weight: Number(cs.fontWeight) || 400,
					family: cs.fontFamily.split(',')[0].replace(/["']/g, '').trim(),
					// only scripts with case count: Hebrew/Arabic/CJK text equals its own uppercase but is not "all caps"
					upper: cs.textTransform === 'uppercase' || (/(\p{Lu}|\p{Ll}).*(\p{Lu}|\p{Ll})/u.test(n.textContent) && n.textContent === n.textContent.toUpperCase() && n.textContent !== n.textContent.toLowerCase()),
					ls: Math.round(((parseFloat(cs.letterSpacing) || 0) / (parseFloat(cs.fontSize) || 1)) * 1000) / 1000,
					color: svg && cs.fill !== 'none' ? cs.fill : cs.color,
					op: Math.round(op * 100) / 100,
					vis: Math.round(vis * 100) / 100,
					blur,
				});
			}
			// console.debug: stills.cjs reads it via onBrowserLog and Remotion does not echo the line to the terminal.
			console.debug(`__EMD_LAYOUT__${JSON.stringify({frame, width, height, items})}`);
		};
		run().finally(() => continueRender(handle));
	}, [on, handle, frame, width, height]);
	return on ? <div id="emd-probe" style={{display: 'none'}} /> : null;
};
