declare module 'flubber' {
	export function interpolate(
		from: string,
		to: string,
		options?: {maxSegmentLength?: number; string?: boolean},
	): (t: number) => string;
}

declare module '*.woff2' {
	const url: string;
	export default url;
}
