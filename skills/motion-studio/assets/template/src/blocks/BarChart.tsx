import React from 'react';
import {useFormat} from '../lib/format';
import {cascade, dur, ticker} from '../lib/motion';
import {C, FONT, type, LOCALE} from '../theme';
import {BlockTiming, Rise, mix, useBlock} from './shared';

export type Bar = {label: string; value: number};

/** Bars that grow from the baseline in cascade. One bar takes the accent; the others stay neutral. */
export const BarChart: React.FC<
	BlockTiming & {
		data: Bar[];
		/** Index of the highlighted bar. Default: the largest value. */
		highlight?: number;
		width?: number;
		height?: number;
		/** Top of the scale. Default: the largest value. */
		max?: number;
		format?: (v: number) => string;
		color?: string;
		accent?: string;
	}
> = ({data, highlight, width, height, max, format = (v) => v.toLocaleString(LOCALE), color = mix(C.ink, C.bg, 0.2), accent = C.accent, at = 0, out}) => {
	const {u, text} = useFormat();
	const {frame, rise} = useBlock(at, out);
	const w = width ?? text.w;
	const h = height ?? Math.min(text.h, w * 0.56);
	const n = data.length;
	const top = max ?? Math.max(...data.map((d) => d.value), 1);
	const hi = highlight ?? data.reduce((best, d, i) => (d.value > data[best].value ? i : best), 0);
	const labelH = type.label * u * 2;
	const valueH = type.body * u * 1.6;
	const plotH = h - labelH - valueH;
	const col = w / n;
	const barW = Math.min(col * 0.62, 180 * u);
	const r = 10 * u;
	return (
		<div style={{position: 'relative', width: w, height: h, fontFamily: FONT}}>
			{data.map((d, i) => {
				const start = 6 + cascade(i, n, 12);
				const g = rise(start, 18);
				const barH = Math.max(r, (d.value / top) * plotH);
				const focus = i === hi;
				return (
					<div key={i} style={{position: 'absolute', left: i * col, top: 0, width: col, height: h}}>
						<div style={{position: 'absolute', left: (col - barW) / 2, bottom: labelH, width: barW, height: barH, overflow: 'hidden'}}>
							<div
								style={{
									width: '100%',
									height: '100%',
									borderRadius: `${r}px ${r}px 0 0`,
									background: focus ? accent : color,
									// 102%: at 100% a subpixel line of the bar remains at the base before it enters.
									transform: `translateY(${(1 - g) * 102}%)`,
								}}
							/>
						</div>
						<div
							style={{
								position: 'absolute',
								left: 0,
								bottom: labelH + 12 * u,
								width: col,
								textAlign: 'center',
								transform: `translateY(${-barH * g}px)`,
								fontSize: (focus ? type.body : type.body * 0.82) * u,
								fontWeight: focus ? 700 : 500,
								lineHeight: 1.1,
								letterSpacing: '-0.02em',
								fontVariantNumeric: 'tabular-nums',
								color: focus ? C.ink : C.muted,
							}}
						>
							<Rise p={rise(start + 4, dur.base)}>{format(ticker(frame, start, 18, 0, d.value))}</Rise>
						</div>
						<div
							style={{
								position: 'absolute',
								left: 0,
								top: h - labelH + 18 * u,
								width: col,
								textAlign: 'center',
								fontSize: type.label * u,
								fontWeight: 500,
								lineHeight: 1.2,
								color: focus ? C.ink : C.muted,
							}}
						>
							<Rise p={rise(2 + cascade(i, n, 10), dur.base)}>{d.label}</Rise>
						</div>
					</div>
				);
			})}
			<div
				style={{
					position: 'absolute',
					left: 0,
					top: h - labelH,
					width: w,
					height: 2 * u,
					background: mix(C.ink, C.bg, 0.28),
					transform: `scaleX(${rise(0, dur.base)})`,
					transformOrigin: 'left center',
				}}
			/>
		</div>
	);
};
