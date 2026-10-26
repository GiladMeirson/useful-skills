import React from 'react';
import {useFormat} from '../lib/format';
import {dur, easeX, ticker} from '../lib/motion';
import {C, FONT, type, LOCALE} from '../theme';
import {BlockTiming, Rise, useBlock} from './shared';

/** Hero number that counts up to the value and settles, with a label below. */
export const StatCounter: React.FC<
	BlockTiming & {
		value: number;
		from?: number;
		prefix?: string;
		suffix?: string;
		label?: string;
		decimals?: number;
		/** Number size in px of the 1080 frame (multiplied by u). */
		size?: number;
		align?: 'left' | 'center' | 'right';
		/** Frames (at 30 fps) the counter takes to arrive. */
		count?: number;
		color?: string;
		accent?: string;
	}
> = ({value, from = 0, prefix, suffix, label, decimals = 0, size = 240, align = 'left', count = 34, color = C.ink, accent = C.accent, at = 0, out}) => {
	const {u} = useFormat();
	const {frame, rise} = useBlock(at, out);
	const pow = 10 ** decimals;
	const fmt = (v: number) => v.toLocaleString(LOCALE, {minimumFractionDigits: decimals, maximumFractionDigits: decimals});
	const live = ticker(frame, 3, count, from * pow, value * pow) / pow;
	const side = {fontSize: '0.46em', fontWeight: 700, letterSpacing: '-0.02em'};
	return (
		<div style={{display: 'inline-block', fontFamily: FONT, textAlign: align}}>
			<Rise p={rise(3, dur.slow, easeX.emphasized)}>
				<div
					style={{
						display: 'inline-flex',
						alignItems: 'baseline',
						fontSize: size * u,
						fontWeight: 800,
						lineHeight: 1,
						letterSpacing: '-0.045em',
						fontVariantNumeric: 'tabular-nums',
						whiteSpace: 'nowrap',
						color,
					}}
				>
					{prefix ? <span style={{...side, marginRight: '0.16em', color: C.muted}}>{prefix}</span> : null}
					{/* The invisible final value reserves the width: the number does not push the layout while counting. */}
					<span style={{display: 'inline-grid'}}>
						<span aria-hidden style={{gridArea: '1 / 1', visibility: 'hidden'}}>
							{fmt(value)}
						</span>
						<span style={{gridArea: '1 / 1', textAlign: align === 'left' ? 'left' : 'right'}}>{fmt(live)}</span>
					</span>
					{suffix ? <span style={{...side, marginLeft: '0.1em', color: accent}}>{suffix}</span> : null}
				</div>
			</Rise>
			{label ? (
				<div style={{marginTop: size * u * 0.1, fontSize: type.body * u, fontWeight: 500, lineHeight: 1.2, color: C.muted}}>
					<Rise p={rise(10, dur.base)}>{label}</Rise>
				</div>
			) : null}
		</div>
	);
};
