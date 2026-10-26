import {interpolate as flubber} from 'flubber';

const cache = new Map<string, (t: number) => string>();

const pair = (a: string, b: string) => {
	const key = `${a}|${b}`;
	if (!cache.has(key)) cache.set(key, flubber(a, b, {maxSegmentLength: 3}));
	return cache.get(key)!;
};

/**
 * Morphing between SVG shapes. progress goes from 0 to paths.length - 1:
 * 0 = first shape, 1 = second, 1.5 = halfway between the second and third.
 * Hold each shape and transition with ease.move; continuous morphing is tiring.
 */
export const morphPath = (paths: string[], progress: number) => {
	const p = Math.max(0, Math.min(paths.length - 1, progress));
	const i = Math.min(Math.floor(p), paths.length - 2);
	return pair(paths[i], paths[i + 1])(p - i);
};
