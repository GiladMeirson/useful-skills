import React from 'react';
import {AbsoluteFill, OffthreadVideo, Sequence, staticFile, useCurrentFrame, useVideoConfig} from 'remotion';
import {ease} from '../lib/motion';

// Raw footage edited by scripts/footage.py: jump cuts without silences, punch-in zoom on alternate segments.
//   const edl = require('../../public/footage/edl.json');
//   <JumpCut edl={edl} />                       // fills the frame (objectFit cover)
//   <JumpCut edl={edl} focus={{x: 0.5, y: 0.35}} />   // zoom toward the face (0..1 of the frame)
// The composition length for a footage reel = Math.round(edl.duration * fps).

export type Edl = {
	src: string;
	fps: number;
	duration: number;
	segments: {in: number; out: number; at: number; zoom: number}[];
};

const srcOf = (s: string) => (/^https?:/.test(s) ? s : staticFile(s.replace(/^.*public\//, '')));

const Segment: React.FC<{seg: Edl['segments'][number]; src: string; focus: {x: number; y: number}; ramp: number}> = ({seg, src, focus, ramp}) => {
	const frame = useCurrentFrame();
	const {fps} = useVideoConfig();
	// Punch-in lands on the cut (no animated zoom on a jump cut), then drifts +1.5% for life.
	const len = (seg.out - seg.in) * fps;
	const drift = 1 + 0.015 * ease.linear(Math.min(frame / Math.max(len, 1), 1));
	const z = seg.zoom * (ramp > 0 ? drift : 1);
	return (
		<AbsoluteFill style={{transform: `scale(${z})`, transformOrigin: `${focus.x * 100}% ${focus.y * 100}%`}}>
			<OffthreadVideo src={src} startFrom={Math.round(seg.in * fps)} endAt={Math.round(seg.out * fps)} style={{width: '100%', height: '100%', objectFit: 'cover'}} />
		</AbsoluteFill>
	);
};

export const JumpCut: React.FC<{edl: Edl; focus?: {x: number; y: number}; drift?: boolean}> = ({edl, focus = {x: 0.5, y: 0.4}, drift = true}) => {
	const {fps} = useVideoConfig();
	const src = srcOf(edl.src);
	return (
		<AbsoluteFill style={{overflow: 'hidden', background: 'black'}}>
			{edl.segments.map((s, i) => (
				<Sequence key={i} from={Math.round(s.at * fps)} durationInFrames={Math.max(1, Math.round((s.out - s.in) * fps))}>
					<Segment seg={s} src={src} focus={focus} ramp={drift ? 1 : 0} />
				</Sequence>
			))}
		</AbsoluteFill>
	);
};
