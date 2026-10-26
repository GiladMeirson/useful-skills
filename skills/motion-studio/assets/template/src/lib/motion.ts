import {Easing, interpolate, random, spring} from 'remotion';
import {noise2D} from '@remotion/noise';

// Motion tokens. Components use these names; do not invent per-scene curves.
export const ease = {
	enter: Easing.bezier(0.16, 1, 0.3, 1), // entrances: fast start, soft settle
	sharp: Easing.bezier(0.2, 0.75, 0.34, 0.94), // crisper entrance for UI and short text
	settle: Easing.bezier(0, 0.65, 0.51, 0.99), // settle without overshoot (zoom out, reveal)
	move: Easing.bezier(0.77, 0, 0.175, 1), // change position or shape (strong in-out)
	exit: Easing.bezier(0.7, 0, 0.84, 0), // exits accelerate and vanish
	linear: Easing.linear, // only for continuous rotation and loops
};

export const springs = {
	smooth: {damping: 200}, // no overshoot, default for text
	snappy: {damping: 20, stiffness: 200}, // light overshoot, UI and icons
	bouncy: {damping: 12, stiffness: 180, mass: 0.8}, // only on the focal element
	heavy: {damping: 15, stiffness: 80, mass: 2}, // large objects, logos
};

// Durations in frames at 30 fps. Scale by fps / 30 if fps changes.
export const dur = {micro: 6, fast: 10, base: 16, slow: 24, scene: 90};

export const clamp = {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'} as const;

export const sec = (s: number, fps: number) => Math.round(s * fps);

/** Simple keyframe: from `from` to `to` between start and start + length. */
export const tween = (
	frame: number,
	start: number,
	length: number,
	from: number,
	to: number,
	easing: (t: number) => number = ease.enter,
) => interpolate(frame, [start, start + length], [from, to], {...clamp, easing});

/** Keyframes with per-segment easing: frames and values of equal length. */
export const keys = (
	frame: number,
	frames: number[],
	values: number[],
	easings: Array<(t: number) => number> = [],
) => {
	if (frame <= frames[0]) return values[0];
	for (let i = 0; i < frames.length - 1; i++) {
		if (frame <= frames[i + 1]) {
			return interpolate(frame, [frames[i], frames[i + 1]], [values[i], values[i + 1]], {
				...clamp,
				easing: easings[i] ?? ease.move,
			});
		}
	}
	return values[values.length - 1];
};

/** Spring 0 -> 1 starting at `start`. */
export const pop = (frame: number, fps: number, start = 0, config = springs.snappy) =>
	spring({frame: frame - start, fps, config});

/** Stagger delay: spreads `total` frames across n items. */
export const stagger = (i: number, n: number, total: number) => (n <= 1 ? 0 : Math.round((i * total) / (n - 1)));

/** Stepped time: animate on twos or threes (cel, stop motion, frame by frame). */
export const stepped = (frame: number, step = 2) => Math.floor(frame / step) * step;

/** 0..1 phase of a `period`-frame loop. Frame `period` repeats frame 0. */
export const loopPhase = (frame: number, period: number) => (((frame % period) + period) % period) / period;

/** Looping noise: samples the noise on a circle. */
export const loopNoise = (seed: string, frame: number, period: number, radius = 1) => {
	const a = loopPhase(frame, period) * Math.PI * 2;
	return noise2D(seed, Math.cos(a) * radius, Math.sin(a) * radius);
};

/** Deterministic organic wobble (handheld, drift). */
export const wiggle = (seed: string, frame: number, freq = 0.05, amp = 1) => noise2D(seed, frame * freq, 0) * amp;

/** Stop-motion jitter: changes only every `hold` frames. */
export const jitter = (seed: string, frame: number, hold = 2, amp = 1) =>
	(random(`${seed}-${Math.floor(frame / hold)}`) - 0.5) * 2 * amp;

// ---------- Advanced techniques (references/techniques-advanced.md) ----------

// A single overshoot, no oscillation: only on the focal element. Emphatic decelerate for scene heroes.
export const easeX = {
	overshoot: Easing.bezier(0.34, 1.56, 0.64, 1),
	emphasized: Easing.bezier(0.05, 0.7, 0.1, 1),
};

/** Anticipation: pulls back by `back` (fraction of the path) and only then heads to the target. */
export const anticipate = (frame: number, start: number, length: number, from: number, to: number, back = 0.08) => {
	const wind = Math.max(2, Math.round(length * 0.25));
	const d = to - from;
	return keys(frame, [start, start + wind, start + length], [from, from - d * back, to], [ease.settle, ease.enter]);
};

/** Follow-through and "follow the leader": item i repeats the leader with a delay (2 to 4 frames per level). */
export const lag = (frame: number, i: number, delay = 3) => frame - i * delay;

/** Cascade for long lists: delays compress toward the end, and the sum never exceeds `total`. */
export const cascade = (i: number, n: number, total: number, easing: (t: number) => number = Easing.out(Easing.quad)) =>
	n <= 1 ? 0 : Math.round(easing(i / (n - 1)) * total);

/** Volume-preserving squash and stretch. amount > 0 stretches in Y, < 0 squashes. */
export const squash = (amount: number) => {
	const sy = 1 + amount;
	return {sx: 1 / sy, sy};
};

/** Per-frame velocity of any frame function (for smear, directional blur and curve checks). */
export const velocity = (fn: (f: number) => number, frame: number) => fn(frame + 0.5) - fn(frame - 0.5);

/** Smear: stretch factor along the motion direction. 1 below the threshold, up to `max` at the peak. */
export const smear = (pxPerFrame: number, threshold = 40, max = 3) =>
	Math.min(max, 1 + Math.max(0, Math.abs(pxPerFrame) - threshold) / threshold);

/**
 * Speed ramp (time remap): returns local time in frames given a speed profile.
 * speeds: [[frame, speed]], linearly interpolated. E.g.: [[0, 4], [12, 0.25], [40, 1]].
 */
export const timeRemap = (frame: number, speeds: Array<[number, number]>) => {
	let t = 0;
	for (let i = 0; i < speeds.length; i++) {
		const [f0, s0] = speeds[i];
		const next = speeds[i + 1];
		if (!next || frame <= next[0]) {
			const dt = Math.max(0, frame - f0);
			if (!next) return t + s0 * dt;
			const s = s0 + ((next[1] - s0) * dt) / (next[0] - f0);
			return t + ((s0 + s) / 2) * dt;
		}
		t += ((s0 + next[1]) / 2) * (next[0] - f0);
	}
	return t;
};

/** Triangle wave 0..1..0 (loopOut pingpong). */
export const pingPong = (frame: number, period: number) => 1 - Math.abs(loopPhase(frame, period) * 2 - 1);

/** Counter that settles without flicker: use with fontVariantNumeric 'tabular-nums'. */
export const ticker = (frame: number, start: number, length: number, from: number, to: number) =>
	Math.round(tween(frame, start, length, from, to, ease.settle));
