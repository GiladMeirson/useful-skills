import React from 'react';
import {useCurrentFrame, useVideoConfig} from 'remotion';
import {dur, ease, tween} from '../lib/motion';

export type BlockTiming = {
	/** Local frame at which the block starts entering. */
	at?: number;
	/** Local frame by which the block has finished exiting. The exit starts EXIT frames earlier. */
	out?: number;
};

// The exit lasts about 75% of the base entrance (doctrine). In frames at 30 fps.
export const EXIT = Math.round(dur.base * 0.75);

/**
 * Block clock. `frame` is local to `at` and normalized to 30 fps, so internal delays
 * hold at any fps. `rise(delay, duration)` returns the 0..1 progress of an entrance and already
 * accounts for the exit: the same value closes the mask or retracts the stroke when `out` arrives.
 */
export const useBlock = (at = 0, out?: number) => {
	const abs = useCurrentFrame();
	const {fps} = useVideoConfig();
	const k = fps / 30;
	const frame = (abs - at) / k;
	const exit = out === undefined ? 0 : tween(abs, out - EXIT * k, EXIT * k, 0, 1, ease.exit);
	const rise = (delay = 0, length: number = dur.base, easing: (t: number) => number = ease.enter) =>
		Math.min(tween(frame, delay, length, 0, 1, easing), 1 - exit);
	return {frame, fps, k, exit, rise};
};

export const mix = (a: string, b: string, t: number) => `color-mix(in srgb, ${a} ${Math.round(t * 100)}%, ${b})`;
export const alpha = (c: string, a: number) => mix(c, 'transparent', a);

/** Surface entrance (window, device): rises and grows; opacity only covers the first 2 frames. */
export const surface = (p: number, u: number): React.CSSProperties => ({
	transform: `translateY(${(1 - p) * 56 * u}px) scale(${0.94 + 0.06 * p})`,
	opacity: Math.min(1, p * 3),
});

/** Trim path: spread onto a <path>, <line> or <circle>. Fully hidden at 0 so the round cap leaves no dot. */
export const trim = (p: number) => ({
	pathLength: 1,
	strokeDasharray: 1,
	strokeDashoffset: 1 - p,
	visibility: p < 0.002 ? ('hidden' as const) : ('visible' as const),
});

/** Wraps text into lines of up to `max` characters without breaking words. */
export const wrap = (text: string, max: number): string[] => {
	const lines: string[] = [];
	let cur = '';
	for (const w of text.split(/\s+/).filter(Boolean)) {
		if (cur && cur.length + 1 + w.length > max) {
			lines.push(cur);
			cur = w;
		} else {
			cur = cur ? `${cur} ${w}` : w;
		}
	}
	if (cur) lines.push(cur);
	return lines;
};

/** Single-line mask rise (baseline reveal). Bottom padding avoids clipping g, p and ç; top padding protects accents on Ã, É and Ç at tight leading. */
export const Rise: React.FC<{p: number; children: React.ReactNode; style?: React.CSSProperties}> = ({p, children, style}) => (
	<span style={{display: 'block', overflow: 'hidden', paddingBottom: '0.14em', marginBottom: '-0.14em', paddingTop: '0.34em', marginTop: '-0.34em', ...style}}>
		<span style={{display: 'block', transform: `translateY(${(1 - Math.min(1, Math.max(0, p))) * 150}%)`}}>{children}</span>
	</span>
);
