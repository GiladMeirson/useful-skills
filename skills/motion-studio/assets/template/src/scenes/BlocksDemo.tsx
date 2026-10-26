import React from 'react';
import {AbsoluteFill, Sequence, useCurrentFrame, useVideoConfig} from 'remotion';
import {
	BarChart,
	Callout,
	Captions,
	CaptionWord,
	Checklist,
	CodeWindow,
	Cursor,
	DeviceFrame,
	Donut,
	LineChart,
	LogoSting,
	LowerThird,
	Marquee,
	QuoteCard,
	Rise,
	StatCounter,
	Steps,
	mix,
	useBlock,
} from '../blocks';
import {Probe} from '../components/Probe';
import {useFormat} from '../lib/format';
import {dur, ease, pop, springs} from '../lib/motion';
import {C, FONT, MONO} from '../theme';

// Block library showcase: one block at a time, with clearly placeholder data.
// Times in frames at 30 fps. `IN` is the breath after the cut; each block exits on its own before its slot ends.
const IN = 6;
// ease.exit packs the motion into the last frames: blocks finish exiting 2 frames before the cut.
const TAIL = 2;
const SLOTS: Array<[name: string, frames: number]> = [
	['BarChart', 75],
	['LineChart', 75],
	['Donut', 75],
	['StatCounter', 75],
	['DeviceFrame', 75],
	['LowerThird', 75],
	['Captions', 84],
	['CodeWindow', 84],
	['Cursor', 75],
	['Callout', 75],
	['Checklist', 75],
	['QuoteCard', 84],
	['LogoSting', 99],
	['Marquee', 75],
	['Steps', 81],
];
export const BLOCKS_DEMO_FRAMES = SLOTS.reduce((n, [, f]) => n + f, 0);

/** Block stage: a discreet label in the safe-area corner and the block in the remaining space. */
const Stage: React.FC<{index: number; name: string; len: number; justify?: 'flex-start' | 'center'; children?: React.ReactNode}> = ({
	index,
	name,
	len,
	justify = 'flex-start',
	children,
}) => {
	const {u, text} = useFormat();
	const {rise} = useBlock(2, len);
	const labelH = 76 * u;
	return (
		<AbsoluteFill>
			<div style={{position: 'absolute', left: text.x, top: text.y, fontFamily: MONO, fontSize: 30 * u, lineHeight: 1.3, letterSpacing: '0.06em', color: C.muted}}>
				<Rise p={rise(0, dur.fast, ease.sharp)}>{`${String(index + 1).padStart(2, '0')} / ${SLOTS.length}  ${name}`}</Rise>
			</div>
			<div
				style={{
					position: 'absolute',
					left: text.x,
					top: text.y + labelH,
					width: text.w,
					height: text.h - labelH,
					display: 'flex',
					alignItems: 'center',
					justifyContent: justify,
				}}
			>
				{children}
			</div>
		</AbsoluteFill>
	);
};

/** Neutral screen for the frame: empty UI blocks, for the showcase only. */
const MockScreen: React.FC<{compact?: boolean}> = ({compact = false}) => {
	const soft = mix(C.ink, C.bg, 0.12);
	return (
		<div style={{position: 'absolute', inset: 0, padding: compact ? '22% 9% 9%' : '6% 6%', boxSizing: 'border-box', display: 'flex', flexDirection: 'column', gap: compact ? '4%' : '6%'}}>
			<div style={{width: compact ? '62%' : '34%', height: compact ? '5%' : '9%', borderRadius: 999, background: mix(C.ink, C.bg, 0.5)}} />
			<div style={{width: compact ? '88%' : '52%', height: compact ? '3%' : '5%', borderRadius: 999, background: soft}} />
			<div style={{flex: 1, display: 'flex', flexDirection: compact ? 'column' : 'row', gap: compact ? '5%' : '3%'}}>
				<div style={{flex: compact ? 1.4 : 1.6, borderRadius: compact ? '8%/10%' : '3%/5%', background: soft}} />
				<div style={{flex: 1, display: 'flex', flexDirection: 'column', gap: compact ? '10%' : '8%'}}>
					<div style={{flex: 1, borderRadius: compact ? '8%/24%' : '6%/14%', background: soft}} />
					<div style={{flex: 1, borderRadius: compact ? '8%/24%' : '6%/14%', background: soft}} />
				</div>
			</div>
			<div style={{alignSelf: compact ? 'stretch' : 'flex-start', width: compact ? undefined : '22%', height: compact ? '7%' : '10%', borderRadius: 999, background: C.accent}} />
		</div>
	);
};

const Devices: React.FC<{len: number}> = ({len}) => {
	const {text, vertical} = useFormat();
	const bw = vertical ? text.w * 0.86 : text.w * 0.62;
	return (
		<div style={{position: 'relative', width: bw}}>
			<DeviceFrame variant="browser" width={bw} at={IN} out={len}>
				<MockScreen />
			</DeviceFrame>
			<div style={{position: 'absolute', right: -bw * 0.06, bottom: -bw * 0.12}}>
				<DeviceFrame variant="phone" width={bw * 0.25} at={IN + 5} out={len}>
					<MockScreen compact />
				</DeviceFrame>
			</div>
		</div>
	);
};

const CAPTION_WORDS: CaptionWord[] = [
	['Captions', 0.3, 0.68],
	['by', 0.7, 0.84],
	['page,', 0.86, 1.3],
	['with', 1.42, 1.56],
	['the', 1.58, 1.64],
	['spoken', 1.66, 2.0],
	['word', 2.02, 2.34],
	['in', 2.36, 2.46],
	['focus.', 2.48, 2.72],
].map(([word, start, end]) => ({word: word as string, start: start as number, end: end as number}));

const CODE = ['const items = ["A", "B", "C"];', '// demo example', 'const total = items.length;', 'return `Total: ${total}`;'].join('\n');

/** Two neutral buttons and the cursor: the second responds to the click one frame later. */
const CursorDemo: React.FC<{len: number}> = ({len}) => {
	const frame = useCurrentFrame();
	const {fps} = useVideoConfig();
	const {u, width, height, text, vertical} = useFormat();
	const {rise} = useBlock(IN, len);
	const clickAt = 40;
	const cy = text.y + text.h * 0.5;
	const bw = (vertical ? 360 : 400) * u;
	const bh = 104 * u;
	const gap = 36 * u;
	const xs = vertical ? [width / 2, width / 2] : [width / 2 - (bw + gap) / 2, width / 2 + (bw + gap) / 2];
	const ys = vertical ? [cy - (bh + gap) / 2, cy + (bh + gap) / 2] : [cy, cy];
	const on = pop(frame, fps, clickAt + 1, springs.snappy);
	return (
		<AbsoluteFill style={{fontFamily: FONT}}>
			{['Option A', 'Option B'].map((label, i) => {
				const picked = i === 1 && on > 0.5;
				return (
					<div
						key={label}
						style={{
							position: 'absolute',
							left: xs[i] - bw / 2,
							top: ys[i] - bh / 2,
							width: bw,
							height: bh,
							borderRadius: bh,
							boxSizing: 'border-box',
							display: 'flex',
							alignItems: 'center',
							justifyContent: 'center',
							fontSize: 40 * u,
							fontWeight: 600,
							color: picked ? C.bg : C.ink,
							background: picked ? C.accent : mix(C.ink, C.bg, 0.08),
							border: `${2 * u}px solid ${picked ? C.accent : C.line}`,
							transform: `scale(${rise(i * 3, dur.base)})`,
						}}
					>
						{label}
					</div>
				);
			})}
			<Cursor
				path={[
					{x: width * 0.82, y: text.y + text.h * 0.92, at: 12},
					{x: xs[0] + bw * 0.3, y: ys[0] + bh * 0.16, at: 24},
					{x: xs[1] + bw * 0.3, y: ys[1] + bh * 0.16, at: clickAt, click: true},
				]}
				out={len}
			/>
		</AbsoluteFill>
	);
};

const CalloutDemo: React.FC<{len: number}> = ({len}) => {
	const {u, width, text, vertical} = useFormat();
	const {rise} = useBlock(IN, len);
	const r = 150 * u;
	const cx = vertical ? width * 0.3 : width * 0.34;
	const cy = text.y + text.h * (vertical ? 0.66 : 0.6);
	const target = {x: cx + r * 0.71, y: cy - r * 0.71};
	return (
		<AbsoluteFill>
			<div
				style={{
					position: 'absolute',
					left: cx - r,
					top: cy - r,
					width: r * 2,
					height: r * 2,
					borderRadius: r,
					boxSizing: 'border-box',
					background: mix(C.ink, C.bg, 0.07),
					border: `${3 * u}px solid ${C.line}`,
					transform: `scale(${rise(0, dur.base)})`,
				}}
			/>
			<Callout
				from={target}
				to={{x: target.x + (vertical ? 90 : 130) * u, y: target.y - 150 * u}}
				width={(vertical ? 410 : 380) * u}
				label="Point of interest"
				detail="One-line detail"
				at={IN + 8}
				out={len}
			/>
		</AbsoluteFill>
	);
};

export const BlocksDemo: React.FC = () => {
	const {fps} = useVideoConfig();
	const {text, height, vertical, pick} = useFormat();
	const k = fps / 30;
	const chartW = pick({youtube: text.w * 0.74, reels: text.w, square: text.w});
	const chartH = pick({youtube: text.h * 0.72, reels: text.w * 0.86, square: text.h * 0.62});
	const blocks: Array<(len: number) => React.ReactNode> = [
		(len) => (
			<BarChart
				width={chartW}
				height={chartH}
				at={IN}
				out={len}
				data={[
					{label: 'Series A', value: 24},
					{label: 'Series B', value: 38},
					{label: 'Series C', value: 31},
					{label: 'Series D', value: 52},
					{label: 'Series E', value: 44},
				]}
			/>
		),
		(len) => <LineChart width={chartW} height={chartH} at={IN} out={len} points={[12, 18, 15, 27, 24, 36, 48]} labels={['Start', 'End']} />,
		(len) => <Donut value={72} label="Sample goal" at={IN} out={len} />,
		(len) => <StatCounter value={1280} suffix="+" label="Demo value" size={vertical ? 220 : 260} at={IN} out={len} />,
		(len) => <Devices len={len} />,
		(len) => <LowerThird name="First Last" role="Sample title" at={IN} out={len} />,
		() => <Captions words={CAPTION_WORDS} />,
		(len) => <CodeWindow code={CODE} cps={64} fontSize={vertical ? 32 : 38} width={pick({youtube: text.w * 0.78, reels: text.w, square: text.w})} at={IN} out={len} />,
		(len) => <CursorDemo len={len} />,
		(len) => <CalloutDemo len={len} />,
		(len) => <Checklist items={['First list item', 'Second list item', 'Third list item', 'Fourth item, still open']} done={3} fontSize={vertical ? 50 : 56} at={IN} out={len} />,
		(len) => (
			<QuoteCard
				width={pick({youtube: text.w * 0.72, reels: text.w, square: text.w})}
				quote="A sample sentence fills this space across two or three lines."
				author="Person's name"
				role="Sample title"
				at={IN}
				out={len}
			/>
		),
		(len) => <LogoSting text="Brand" tagline="Brand tagline" size={210} length={66 * k} at={IN} out={len} />,
		(len) => (
			<>
				<Marquee items={['Looping text', 'Seamless']} period={75 * k} y={height * 0.44} at={IN} out={len} />
				<Marquee items={['Transition band', 'Marquee block']} variant="band" direction={-1} period={75 * k} fontSize={72} y={height * 0.62} rotate={-3} at={IN + 4} out={len} />
			</>
		),
		(len) => (
			<Steps
				active={2}
				at={IN}
				out={len}
				steps={[
					{title: 'Briefing', detail: 'Goal and format'},
					{title: 'Script', detail: 'Copy and timing'},
					{title: 'Animation', detail: 'Scenes and blocks'},
					{title: 'Delivery', detail: 'Render and review'},
				]}
			/>
		),
	];
	// Overlay blocks fill the whole frame; content blocks stay on the stage.
	const overlay = new Set(['LowerThird', 'Captions', 'Cursor', 'Callout', 'Marquee']);
	const centered = new Set(['Donut', 'LogoSting', 'DeviceFrame', 'CodeWindow']);
	let from = 0;
	return (
		<AbsoluteFill style={{background: C.bg, fontFamily: FONT}}>
			{SLOTS.map(([name, frames], i) => {
				const len = Math.round(frames * k);
				const start = from;
				from += len;
				return (
					<Sequence key={name} from={start} durationInFrames={len} name={name}>
						<Stage index={i} name={name} len={len} justify={centered.has(name) ? 'center' : 'flex-start'}>
							{overlay.has(name) ? null : blocks[i](len - TAIL)}
						</Stage>
						{overlay.has(name) ? blocks[i](len - TAIL) : null}
					</Sequence>
				);
			})}
			<Probe />
		</AbsoluteFill>
	);
};
