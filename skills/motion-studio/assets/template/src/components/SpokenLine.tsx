import React from 'react';
import {ease, tween} from '../lib/motion';
import {Word, useScene} from '../lib/score';
import {C, DIR, FONT, tracking} from '../theme';

/**
 * One line of narration revealed word by word on the voice: each word rises through a mask 3 frames before it is
 * spoken and takes the accent color while it is being said. RTL-aware (Hebrew flows right to left through DIR).
 *   <SpokenLine id="hook" size={104} style={{left: 108, top: 400, width: 864}} />          // all words of the scene
 *   <SpokenLine id="hook" words={words.slice(3)} size={104} style={{...}} />               // part of them
 */
export const SpokenLine: React.FC<{id: string; words?: Word[]; size: number; color?: string; accent?: string; weight?: number; style?: React.CSSProperties}> = ({
	id,
	words,
	size,
	color = C.ink,
	accent = C.accent,
	weight = 600,
	style,
}) => {
	const {frame, sec, words: sceneWords} = useScene(id);
	const ws = words ?? sceneWords;
	return (
		<div dir={DIR} style={{position: 'absolute', fontFamily: FONT, fontSize: size, fontWeight: weight, lineHeight: 1.08, letterSpacing: tracking(-0.02), color, display: 'flex', flexWrap: 'wrap', columnGap: size * 0.26, ...style}}>
			{ws.map((w, i) => {
				const s = sec(w.start);
				const e = sec(w.end);
				const p = tween(frame, s - 3, 10, 0, 1, ease.enter);
				const speaking = frame >= s && frame < e + 4;
				return (
					<span key={i} style={{display: 'inline-block', overflow: 'hidden', paddingBottom: size * 0.08}}>
						<span style={{display: 'inline-block', transform: `translateY(${(1 - p) * 110}%)`, color: speaking ? accent : color}}>{w.word}</span>
					</span>
				);
			})}
		</div>
	);
};

