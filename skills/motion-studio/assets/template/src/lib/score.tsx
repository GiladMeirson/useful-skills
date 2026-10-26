import React from 'react';
import {Sequence, useCurrentFrame, useVideoConfig} from 'remotion';
import timeline from '../../public/timeline.json';
import cues from '../../public/cues.json';

// Score (timeline.json) and cues (cues.json), both written by scripts/score.py from roteiro.json.
// No scene holds hand-written frames: all timing comes from here.

export type SceneId = (typeof timeline.scenes)[number]['id'];
export type Cue = keyof typeof cues.ev;
export type Word = {word: string; start: number; end: number};

export const WORDS = cues.words as Word[];
export const BEATS = cues.beats as number[];
export const sceneOf = (id: string) => {
	const s = timeline.scenes.find((x) => x.id === id);
	if (!s) throw new Error(`scene "${id}" does not exist in timeline.json`);
	return s;
};
/** Absolute second of a script cue. */
export const cue = (name: Cue) => (cues.ev as Record<string, number>)[name];
/** Narration words spoken within the scene (absolute times). */
export const wordsOf = (id: string) => {
	const s = sceneOf(id);
	return WORDS.filter((w) => w.start >= s.start - 0.02 && w.start < s.end);
};

/**
 * Scene clock. Use inside <Scene id>: `frame` is local, `len` is the duration in frames,
 * `at('cue', +3)` is the local frame of a script cue and `sec(t)` that of an absolute second.
 */
export const useScene = (id: string) => {
	const frame = useCurrentFrame();
	const {fps} = useVideoConfig();
	const s = sceneOf(id);
	const start = Math.round(s.start * fps);
	const len = Math.round(s.end * fps) - start;
	const sec = (t: number) => Math.round(t * fps) - start;
	const at = (name: Cue, off = 0) => sec(cue(name)) + off;
	return {frame, fps, len, at, sec, since: (name: Cue) => frame - at(name), words: wordsOf(id)};
};

/** Mounts the scene in the span the score assigns it. Children read the clock with useScene(id). */
export const Scene: React.FC<{id: string; children: React.ReactNode; overlap?: number}> = ({id, children, overlap = 0}) => {
	const {fps} = useVideoConfig();
	const s = sceneOf(id);
	const from = Math.round(s.start * fps);
	return (
		<Sequence from={from} durationInFrames={Math.round(s.end * fps) - from + overlap} name={id}>
			{children}
		</Sequence>
	);
};
