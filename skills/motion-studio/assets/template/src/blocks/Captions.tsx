import React, {useMemo} from 'react';
import {AbsoluteFill, useCurrentFrame, useVideoConfig} from 'remotion';
import {useFormat} from '../lib/format';
import {ease, tween} from '../lib/motion';
import {C, FONT} from '../theme';
import {Rise} from './shared';

export type CaptionWord = {word: string; start: number; end: number};
export type CaptionPage = {lines: CaptionWord[][]; start: number; end: number};

const chars = (ws: CaptionWord[]) => ws.reduce((n, w) => n + w.word.length, 0) + Math.max(0, ws.length - 1);

/**
 * Groups words into pages of up to `maxLines` lines of `perLine` characters.
 * A page closes at sentence end, on a long pause or when full; the two lines come out balanced.
 */
export const paginate = (words: CaptionWord[], perLine: number, maxLines = 2, gap = 0.6): CaptionPage[] => {
	const pages: CaptionPage[] = [];
	let cur: CaptionWord[] = [];
	const flush = () => {
		if (!cur.length) return;
		let lines: CaptionWord[][] = [cur];
		if (chars(cur) > perLine && maxLines > 1) {
			let best = 1;
			let score = Infinity;
			for (let i = 1; i < cur.length; i++) {
				const a = chars(cur.slice(0, i));
				const b = chars(cur.slice(i));
				if (a <= perLine && b <= perLine && Math.abs(a - b) < score) {
					best = i;
					score = Math.abs(a - b);
				}
			}
			lines = [cur.slice(0, best), cur.slice(best)];
		}
		pages.push({lines, start: cur[0].start, end: cur[cur.length - 1].end});
		cur = [];
	};
	// Fits in `maxLines` lines? Fill line by line, as the browser would.
	const fits = (ws: CaptionWord[]) => {
		let used = 1;
		let n = 0;
		for (const w of ws) {
			const add = (n ? 1 : 0) + w.word.length;
			if (n && n + add > perLine) {
				used++;
				n = w.word.length;
			} else {
				n += add;
			}
		}
		return used <= maxLines;
	};
	words.forEach((w, i) => {
		if (cur.length && !fits([...cur, w])) {
			// Page full: close at the last comma so the remainder does not become an orphan word on the next page.
			const comma = cur.map((c) => /[,;:]$/.test(c.word)).lastIndexOf(true);
			const rest = comma >= 0 && comma < cur.length - 1 ? cur.slice(comma + 1) : [];
			if (rest.length) cur = cur.slice(0, comma + 1);
			flush();
			cur = rest;
		}
		cur.push(w);
		const next = words[i + 1];
		if (!next || /[.!?…]$/.test(w.word) || next.start - w.end > gap) flush();
	});
	return pages;
};

/**
 * Paged captions: up to 2 lines inside the text safe area, with the spoken word in the accent.
 * `words` in absolute video seconds. Inside a <Sequence from>, pass `offsetSec` as the
 * narration start minus the sequence start, same as <KineticWords>.
 */
export const Captions: React.FC<{
	words: CaptionWord[];
	offsetSec?: number;
	/** Max characters per line. The block reduces it automatically when the safe width cannot fit it. */
	maxChars?: number;
	fontSize?: number;
	position?: 'bottom' | 'center' | 'top';
	color?: string;
	accent?: string;
	/** Color of a band behind each line. Use over live footage or busy backgrounds, where a shadow cannot guarantee contrast. */
	plate?: string;
}> = ({words, offsetSec = 0, maxChars = 36, fontSize = 56, position = 'bottom', color = C.ink, accent = C.accent, plate}) => {
	const frame = useCurrentFrame();
	const {fps} = useVideoConfig();
	const {u, text} = useFormat();
	const size = fontSize * u;
	// Average character width at weight 700: 0.6 em covers Inter and most grotesques.
	const perLine = Math.max(8, Math.min(maxChars, Math.floor(text.w / (size * 0.6))));
	const pages = useMemo(() => paginate(words, perLine), [words, perLine]);
	const t = frame / fps - offsetSec;
	const lead = 0.08;
	const idx = pages.findIndex((p, i) => {
		const until = pages[i + 1] ? Math.min(pages[i + 1].start - lead, p.end + 0.9) : p.end + 0.5;
		return t >= p.start - lead && t < Math.max(until, p.start + 0.5);
	});
	if (idx < 0) return null;
	const page = pages[idx];
	const since = (t - (page.start - lead)) * 30;
	const anchor = position === 'bottom' ? text.y + text.h : position === 'top' ? text.y : text.y + text.h / 2;
	const shift = position === 'bottom' ? '-100%' : position === 'top' ? '0%' : '-50%';
	return (
		<AbsoluteFill style={{pointerEvents: 'none'}}>
			<div
				style={{
					position: 'absolute',
					left: text.x,
					top: anchor,
					width: text.w,
					transform: `translateY(${shift})`,
					textAlign: 'center',
					fontFamily: FONT,
					fontSize: size,
					fontWeight: 700,
					lineHeight: 1.2,
					letterSpacing: '-0.02em',
					color,
					textShadow: plate ? undefined : `0 ${2 * u}px ${14 * u}px rgba(0, 0, 0, 0.45)`,
				}}
			>
				{page.lines.map((line, li) => (
					<Rise key={`${idx}-${li}`} p={tween(since, li * 2, 6, 0, 1, ease.sharp)} style={{whiteSpace: 'nowrap'}}>
						<span style={plate ? {display: 'inline-block', background: plate, padding: '0.1em 0.34em'} : undefined}>
							{line.map((w, wi) => {
								const spoken = t >= w.start - 0.02 && t < w.end + 0.06;
								return (
									<span key={wi} style={{color: spoken ? accent : color}}>
										{wi ? ' ' : ''}
										{w.word}
									</span>
								);
							})}
						</span>
					</Rise>
				))}
			</div>
		</AbsoluteFill>
	);
};
