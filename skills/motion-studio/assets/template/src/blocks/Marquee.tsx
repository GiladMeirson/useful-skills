import React from 'react';
import {AbsoluteFill} from 'remotion';
import {useFormat} from '../lib/format';
import {dur, ease, loopPhase} from '../lib/motion';
import {C, FONT, type} from '../theme';
import {BlockTiming, mix, useBlock} from './shared';

/**
 * Seamless looping text band. The strip is two identical halves and advances one text repetition every
 * `period` frames: frame `period` equals frame 0, so it loops when the period divides the scene.
 * It is ornamental (data-decor): it bleeds off-frame and is excluded from safe-area measurement.
 */
export const Marquee: React.FC<
	BlockTiming & {
		items: string[];
		/** outline: subtle outline for backgrounds. solid: filled text. band: accent band, for transitions. */
		variant?: 'outline' | 'solid' | 'band';
		/** Letter fill color in outline mode. Must match the background behind the band. */
		fill?: string;
		/** Frames for the text to travel one full repetition. */
		period?: number;
		direction?: 1 | -1;
		/** Band center in px from the top. Default: frame middle. */
		y?: number;
		rotate?: number;
		fontSize?: number;
		color?: string;
		accent?: string;
	}
> = ({items, variant = 'outline', fill = C.bg, period = 150, direction = 1, y, rotate = 0, fontSize = type.hero, color, accent = C.accent, at = 0, out}) => {
	const {u, width, height} = useFormat();
	const {frame, rise, k} = useBlock(at, out);
	const size = fontSize * u;
	const band = variant === 'band';
	const ink = color ?? (band ? C.bg : variant === 'solid' ? C.ink : mix(C.ink, C.bg, 0.3));
	// Generous estimate of one repetition's width, only to decide how many fit in a half.
	const unit = items.reduce((n, t) => n + t.length * 0.5 + 1.2, 0) * size;
	const reps = Math.max(1, Math.ceil((width * 1.3) / unit));
	const phase = loopPhase(frame * k, period);
	const shift = ((direction > 0 ? phase : 1 - phase) / reps) * 50;
	const open = rise(0, dur.base, ease.settle);
	const half = (h: number) => (
		<div key={h} style={{display: 'flex', flexShrink: 0}}>
			{Array.from({length: reps}, (_, r) =>
				items.map((t, i) => (
					<div key={`${r}-${i}`} style={{display: 'flex', alignItems: 'center', flexShrink: 0}}>
						{/* In outline mode the fill covers the inner stroke: variable fonts have overlapping contours that would show. */}
						<span style={variant === 'outline' ? {color: fill, WebkitTextStroke: `${4 * u}px ${ink}`, paintOrder: 'stroke fill'} : {color: ink}}>{t}</span>
						<span style={{width: size * 0.16, height: size * 0.16, margin: `0 ${size * 0.4}px`, borderRadius: size, background: variant === 'solid' ? accent : ink, flexShrink: 0}} />
					</div>
				)),
			)}
		</div>
	);
	return (
		<AbsoluteFill data-decor style={{pointerEvents: 'none', overflow: 'hidden'}}>
			<div
				style={{
					position: 'absolute',
					left: -width * 0.1,
					width: width * 1.2,
					top: y ?? height / 2,
					transform: `translateY(-50%) rotate(${rotate}deg)`,
					clipPath: `inset(${(1 - open) * 50}% 0)`,
					background: band ? accent : 'transparent',
					padding: band ? `${size * 0.18}px 0` : 0,
					fontFamily: FONT,
					fontSize: size,
					fontWeight: 800,
					lineHeight: 1.1,
					letterSpacing: '-0.035em',
					whiteSpace: 'nowrap',
				}}
			>
				<div style={{display: 'flex', width: 'max-content', transform: `translateX(${-shift}%)`}}>{[0, 1].map(half)}</div>
			</div>
		</AbsoluteFill>
	);
};
