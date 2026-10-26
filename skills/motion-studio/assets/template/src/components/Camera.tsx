import React, {createContext, useContext} from 'react';
import {AbsoluteFill} from 'remotion';

type Cam = {x: number; y: number; zoom: number; rotate: number};
const CamCtx = createContext<Cam>({x: 0, y: 0, zoom: 1, rotate: 0});

/**
 * 2.5D camera. x and y in world px, zoom 1 = base framing, rotate in degrees.
 * Zoom in, zoom out, push-in, pan, whip pan and handheld all come from here.
 */
export const Camera: React.FC<Partial<Cam> & {children: React.ReactNode}> = ({
	x = 0,
	y = 0,
	zoom = 1,
	rotate = 0,
	children,
}) => (
	<CamCtx.Provider value={{x, y, zoom, rotate}}>
		<AbsoluteFill style={{overflow: 'hidden'}}>{children}</AbsoluteFill>
	</CamCtx.Provider>
);

/**
 * Layer with depth. depth 1 = focal plane; greater than 1 sits farther and moves less;
 * less than 1 sits closer and moves more. That is what creates parallax.
 */
export const Layer: React.FC<{depth?: number; children: React.ReactNode; style?: React.CSSProperties}> = ({
	depth = 1,
	children,
	style,
}) => {
	const {x, y, zoom, rotate} = useContext(CamCtx);
	const k = 1 / depth;
	const z = 1 + (zoom - 1) * k;
	return (
		<AbsoluteFill
			style={{
				transform: `scale(${z}) rotate(${rotate * k}deg) translate(${-x * k}px, ${-y * k}px)`,
				transformOrigin: '50% 50%',
				...style,
			}}
		>
			{children}
		</AbsoluteFill>
	);
};
