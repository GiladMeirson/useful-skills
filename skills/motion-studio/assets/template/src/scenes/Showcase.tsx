import React from 'react';
import {AbsoluteFill, Audio, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig} from 'remotion';
import timeline from '../../public/timeline.json';
import {Captions} from '../blocks/Captions';
import {CodeWindow} from '../blocks/CodeWindow';
import {IrisReveal} from '../components/Fx';
import {morphPath} from '../components/Morph';
import {Probe} from '../components/Probe';
import {clamp, ease, easeX, keys, pop, springs, tween, wiggle} from '../lib/motion';
import {Scene, useScene} from '../lib/score';
import {SpokenLine} from '../components/SpokenLine';
import {circlePath, roundedRectPath} from '../lib/shapes';
import {C, DIR, FONT, MONO, tracking} from '../theme';

// Direction A, "primitive system": light paper, four primaries with roles, medium type, shapes as heroes.
// vermilion = spoken word · blue = machine/code · yellow = sound · green = done.

const W = 1080;

// 1 · hook — the clip (circle) drops into the frame and becomes the video (square) on "out".
const Hook: React.FC = () => {
	const {frame, fps, at, words} = useScene('hook');
	const enter = 0.35 + 0.65 * pop(frame, fps, at('clips') - 4, springs.snappy);
	const m = keys(frame, [at('out') - 6, at('out') + 8], [0, 1], [easeX.emphasized]);
	const y = 700 + m * 300;
	const shape = morphPath([circlePath(540, 0, 170, 24), roundedRectPath(540 - 190, -190, 380, 380, 36)], m);
	const fill = m < 0.5 ? C.accent : C.second;
	const drift = wiggle('hook', frame, 0.04, 6);
	return (
		<AbsoluteFill style={{background: C.bg}}>
			<svg width={W} height={1920} style={{position: 'absolute'}}>
				<line x1={140} x2={940} y1={1000} y2={1000} stroke={C.line} strokeWidth={4} strokeDasharray="2 18" strokeLinecap="round" />
				<g transform={`translate(${drift} ${y}) scale(${enter})`} style={{transformOrigin: '540px 0px'}}>
					<path d={shape} fill={fill} />
				</g>
			</svg>
			<SpokenLine id="hook" words={words.slice(0, 3)} size={104} style={{left: 108, top: 400, width: 864}} />
			<SpokenLine id="hook" words={words.slice(3)} size={104} style={{left: 108, top: 1230, width: 864}} />
		</AbsoluteFill>
	);
};

// 2 · no-tools — an editing timeline slides in, then gets struck out; the app window gets an X.
const NoTools: React.FC = () => {
	const {frame, at} = useScene('no-tools');
	const tracks = [
		{y: 900, segs: [[120, 300, C.second], [440, 220, C.third], [680, 280, C.fourth]]},
		{y: 990, segs: [[120, 520, C.line], [660, 300, C.accent]]},
		{y: 1080, segs: [[200, 180, C.third], [400, 420, C.second]]},
	] as const;
	const strike = tween(frame, at('timeline') - 2, 10, 0, 1, ease.enter);
	const app = spring({frame: frame - 10, fps: 30, config: springs.smooth});
	const x = tween(frame, at('app') - 1, 9, 0, 1, ease.enter);
	const head = tween(frame, 4, 60, 160, 900, ease.move);
	return (
		<AbsoluteFill style={{background: C.bg}}>
			<svg width={W} height={1920} style={{position: 'absolute'}}>
				{tracks.map((t, i) =>
					t.segs.map(([sx, w, col], k) => {
						const p = tween(frame, 2 + i * 3 + k * 2, 14, 0, 1, ease.enter);
						return <rect key={`${i}-${k}`} x={sx - (1 - p) * 260} y={t.y} width={w} height={64} rx={14} fill={col} opacity={p * (1 - strike * 0.55)} />;
					}),
				)}
				<line x1={head} x2={head} y1={870} y2={1170} stroke={C.ink} strokeWidth={5} opacity={1 - strike} />
				<line x1={90} y1={1040} x2={90 + 900 * strike} y2={1040 - 120 * strike} stroke={C.accent} strokeWidth={22} strokeLinecap="round" />
				<g transform={`translate(540 1430) scale(${app})`}>
					<rect x={-150} y={-100} width={300} height={200} rx={26} fill="none" stroke={C.ink} strokeWidth={10} />
					<line x1={-150} x2={150} y1={-46} y2={-46} stroke={C.ink} strokeWidth={10} />
					{[0, 1, 2].map((d) => (
						<circle key={d} cx={-118 + d * 30} cy={-73} r={8} fill={C.ink} />
					))}
					<path d={`M -90 -10 L ${-90 + 180 * x} ${-10 + 90 * x}`} stroke={C.accent} strokeWidth={18} strokeLinecap="round" />
					<path d={`M 90 -10 L ${90 - 180 * x} ${-10 + 90 * x}`} stroke={C.accent} strokeWidth={18} strokeLinecap="round" opacity={x > 0 ? 1 : 0} />
				</g>
			</svg>
			<SpokenLine id="no-tools" size={92} style={{left: 108, top: 430, width: 864}} />
		</AbsoluteFill>
	);
};

// 3 · code — offset code card, a big blue brace as the counterweight.
const CODE = `const f = useCurrentFrame();
const y = spring({frame: f, fps});
return <Title y={y} />;`;

const Code: React.FC = () => {
	const {frame, len} = useScene('code');
	const rise = tween(frame, 0, 14, 1, 0, ease.enter);
	const brace = tween(frame, 6, 30, 0, 1, ease.settle);
	return (
		<AbsoluteFill style={{background: C.bg}}>
			<svg width={W} height={1920} style={{position: 'absolute'}}>
				<path
					d="M 860 1080 C 760 1080 780 1180 780 1260 C 780 1330 740 1360 690 1370 C 740 1380 780 1410 780 1480 C 780 1560 760 1660 860 1660"
					fill="none"
					stroke={C.second}
					strokeWidth={34}
					strokeLinecap="round"
					pathLength={1}
					strokeDasharray={1}
					strokeDashoffset={1 - brace}
				/>
			</svg>
			<div style={{position: 'absolute', left: 80, top: 420 + rise * 160, opacity: 1 - rise}}>
				<CodeWindow code={CODE} title="Reel.tsx" width={920} fontSize={40} cps={60} at={0} out={len} />
			</div>
			<SpokenLine id="code" size={92} style={{left: 108, top: 1080, width: 560}} />
		</AbsoluteFill>
	);
};

// 4 · sound — a full-bleed waveform of primary bars; everything jumps on "math".
const Sound: React.FC = () => {
	const {frame, at} = useScene('sound');
	const n = 18;
	const cols = [C.third, C.third, C.accent, C.third, C.second, C.third];
	const hit = frame - at('math');
	const kick = hit >= 0 ? spring({frame: hit, fps: 30, config: springs.snappy}) * Math.exp(-hit / 14) : 0;
	return (
		<AbsoluteFill style={{background: C.bg}}>
			<svg width={W} height={1920} style={{position: 'absolute'}}>
				{Array.from({length: n}, (_, i) => {
					const grow = tween(frame, i * 1.2, 16, 0, 1, ease.enter);
					const env = 0.35 + 0.65 * Math.abs(Math.sin(i * 0.9 + 0.6)) * (0.6 + 0.4 * Math.sin(frame * 0.22 + i * 0.7));
					const h = (180 + 560 * env + kick * 420) * grow;
					const bw = 40;
					const x = 60 + i * ((W - 120 - bw) / (n - 1));
					return <rect key={i} x={x} y={1700 - h} width={bw} height={h} rx={20} fill={cols[i % cols.length]} />;
				})}
			</svg>
			<SpokenLine id="sound" size={96} accent={C.accent} style={{left: 108, top: 410, width: 864}} />
		</AbsoluteFill>
	);
};

// 5 · voice — iris opens from the circle onto ink; a mouth shape talks; captions word by word.
const Voice: React.FC = () => {
	const {frame, fps, sec, words} = useScene('voice');
	const iris = tween(frame, 0, 14, 0, 1, ease.enter);
	const talking = words.some((w) => frame >= sec(w.start) && frame < sec(w.end));
	const open = interpolate(talking ? 1 : 0, [0, 1], [0.18, 0.55 + 0.35 * Math.abs(Math.sin(frame * 0.9))], clamp);
	const ry = 150 * open;
	return (
		<AbsoluteFill style={{background: C.bg}}>
			<IrisReveal progress={iris} cx="50%" cy="38%">
				<AbsoluteFill style={{background: C.ink}}>
					<svg width={W} height={1920} style={{position: 'absolute'}}>
						<circle cx={540} cy={730} r={250} fill={C.accent} />
						<ellipse cx={540} cy={760} rx={150} ry={Math.max(ry, 16)} fill={C.ink} />
					</svg>
					<Captions words={words} offsetSec={sec(0) / fps} fontSize={78} maxChars={20} color={C.bg} accent={C.third} position="bottom" />
				</AbsoluteFill>
			</IrisReveal>
		</AbsoluteFill>
	);
};

// 6 · close — the four primitives assemble over the wordmark.
const Close: React.FC = () => {
	const {frame, fps, at} = useScene('close');
	const shapes = [
		{c: C.accent, d: 'circle', from: [-300, -400]},
		{c: C.second, d: 'square', from: [400, -500]},
		{c: C.third, d: 'tri', from: [-400, 500]},
		{c: C.fourth, d: 'half', from: [420, 420]},
	] as const;
	const name = spring({frame: frame - at("name") + 2, fps, config: springs.smooth});
	const sub = tween(frame, at('made') - 3, 12, 0, 1, ease.enter);
	return (
		<AbsoluteFill style={{background: C.bg}}>
			<svg width={W} height={1920} style={{position: 'absolute'}}>
				{shapes.map((s, i) => {
					const p = tween(frame, 2 + i * 3, 22, 0, 1, easeX.emphasized);
					const x = 270 + i * 180 + (1 - p) * s.from[0];
					const y = 760 + (1 - p) * s.from[1];
					const r = (1 - p) * 90 * (i % 2 ? 1 : -1);
					return (
						<g key={i} transform={`translate(${x} ${y}) rotate(${r})`}>
							{s.d === 'circle' && <circle r={62} fill={s.c} />}
							{s.d === 'square' && <rect x={-58} y={-58} width={116} height={116} rx={14} fill={s.c} />}
							{s.d === 'tri' && <path d="M 0 -66 L 62 52 L -62 52 Z" fill={s.c} />}
							{s.d === 'half' && <path d="M -64 30 A 64 64 0 0 1 64 30 Z" fill={s.c} />}
						</g>
					);
				})}
			</svg>
			<div style={{position: 'absolute', top: 900, width: '100%', textAlign: 'center', fontFamily: FONT, fontWeight: 700, fontSize: 124, letterSpacing: tracking(-0.03), color: C.ink, transform: `translateY(${(1 - name) * 40}px)`, opacity: name}}>
				Motion Studio
			</div>
			<div style={{position: 'absolute', top: 1090, width: '100%', textAlign: 'center', fontFamily: MONO, fontSize: 44, color: C.muted, opacity: sub, transform: `translateY(${(1 - sub) * 24}px)`}}>
				Made entirely in code.
			</div>
		</AbsoluteFill>
	);
};

export const Showcase: React.FC = () => (
	<AbsoluteFill style={{background: C.bg, fontFamily: FONT}}>
		<Scene id="hook">
			<Hook />
		</Scene>
		<Scene id="no-tools">
			<NoTools />
		</Scene>
		<Scene id="code">
			<Code />
		</Scene>
		<Scene id="sound">
			<Sound />
		</Scene>
		<Scene id="voice">
			<Voice />
		</Scene>
		<Scene id="close">
			<Close />
		</Scene>
		{timeline.audio ? <Audio src={staticFile(timeline.audio)} /> : null}
		<Probe />
	</AbsoluteFill>
);
