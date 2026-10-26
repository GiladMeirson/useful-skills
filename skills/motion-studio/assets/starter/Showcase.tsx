import React from 'react';
import {AbsoluteFill, Audio, staticFile} from 'remotion';
import timeline from '../../public/timeline.json';
import {Probe} from '../components/Probe';
import {SpokenLine} from '../components/SpokenLine';
import {Scene} from '../lib/score';
import {useFormat} from '../lib/format';
import {C, DIR, FONT, type} from '../theme';

// STARTER: every scene from the score shows its narration word by word. It renders, so dailies work from minute one.
// Replace each scene with its own layout / entrance / hero from direction.json (see reference/Showcase.example.tsx).

const Starter: React.FC<{id: string}> = ({id}) => {
	const {u, text} = useFormat();
	return (
		<AbsoluteFill dir={DIR} style={{background: C.bg}}>
			<SpokenLine id={id} size={type.title * u} style={{left: text.x, top: text.y + text.h * 0.3, width: text.w}} />
		</AbsoluteFill>
	);
};

export const Showcase: React.FC = () => (
	<AbsoluteFill dir={DIR} style={{background: C.bg, fontFamily: FONT}}>
		{timeline.scenes.map((s) => (
			<Scene key={s.id} id={s.id}>
				<Starter id={s.id} />
			</Scene>
		))}
		{timeline.audio ? <Audio src={staticFile(timeline.audio)} /> : null}
		<Probe />
	</AbsoluteFill>
);
