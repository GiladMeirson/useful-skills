# Techniques: keyframing, camera, motion graphics, typography, morph, loops and UI

## Keyframing and smooth motion

```tsx
const frame = useCurrentFrame();
const x = keys(frame, [0, 15, 45, 60], [-400, 0, 0, 400], [ease.enter, ease.linear, ease.exit]); // enter, hold, exit
const s = pop(frame, fps, 10, springs.snappy); // 0 -> 1 with spring starting at frame 10
```
- Smoothness comes from three things: correct easing per segment, holds between moves and targeted motion blur. Never chain keyframes without a hold.
- Curved path: animate a 0..1 progress and read the point with `getPointAtLength` from `@remotion/paths` (or `evolvePath` to draw the stroke).
- Always derive frames from seconds using the composition's fps: `sec(1.2, fps)`.

## Camera: zoom in, zoom out, push-in, pan, whip, parallax

```tsx
<Camera zoom={tween(frame, 0, 120, 1, 1.12, ease.move)} x={wiggle('cx', frame, 0.03, 6)}>
  <Layer depth={3}>{/* background: moves 1/3 */}</Layer>
  <Layer depth={1}>{/* focal plane */}</Layer>
  <Layer depth={0.7}>{/* foreground: moves more */}</Layer>
</Camera>
```
- Push-in: zoom 1 to 1.08–1.15 over the scene with `ease.move`. Reveal zoom out: 1.15 to 1 with `ease.settle`.
- Zoom to a point: combine `zoom` with `x`/`y` pointing at the target (world coordinates in px from the center).
- Whip pan: fast displacement of ~12% of the frame in 6 to 8 frames with blur; use the Showcase's `Whip` component as a model.
- Dolly zoom (vertigo): increase the background layer's zoom while reducing the focal plane's.
- Motion blur: `@remotion/motion-blur` (`<CameraMotionBlur shutterAngle={180} samples={8}>`) on cuts and fast beats; costs N times the render.

## Motion graphics

- Self-drawing lines: `pathLength={1}`, `strokeDasharray={1}`, `strokeDashoffset={tween(...)}`.
- Shapes: `circlePath`, `starPath`, `blobPath`, `roundedRectPath` in `shapes.ts`, or `@remotion/shapes`.
- Numbers and charts: counter with `Math.round(tween(...))` and `toLocaleString()` with the video's language locale (English or Hebrew, e.g. `'en-US'` or `'he-IL'`); bars with `scaleY` and origin at the bottom. Never invent data.
- Logo reveal: mask (`clipPath` or `overflow: hidden`) with the logo rising, then a stroke drawing the outline; hold 1 s.

## Kinetic typography

- `<KineticWords words={narration.words} offsetSec={timeline.narration.start} />`: each word rises through a mask 3 frames before it's spoken and the spoken word gets the accent.
- Patterns: word by word (emphasis), phrase with stagger (live caption), emphasis scale on a keyword, text on a path (`<textPath>`), letters with a 1 to 2 frame stagger only on short titles.
- Measure text with `@remotion/layout-utils` (`measureText`, `fitText`) before choosing a size; never let a line overflow the safe area.

## Morphing

```tsx
const shapes = [circlePath(960, 540, 200), starPath(960, 540, 240), blobPath(960, 540, 220, 'b')];
const p = keys(frame, [0, 12, 30, 48, 66], [0, 0, 1, 1, 2], [ease.move, ease.move, ease.move, ease.move]);
<path d={morphPath(shapes, p)} />
```
- flubber handles shapes with different point counts. Hold each shape and transition with `ease.move` over 15 to 20 frames.
- Icon to icon: use single-contour paths; for shapes with holes, morph each subpath separately.
- Liquid alternative: gooey filter (blur + alpha `feColorMatrix`) with circles merging.

## Seamless loop

- The period divides the duration: a 90-frame scene with period 45 or 90. Frame `period` must equal frame 0.
- Use `loopPhase(frame, period)` for angles (`phase * 2π`) and `loopNoise(seed, frame, period)` for noise that closes.
- Rotating a figure with N-fold symmetry: rotate `360 / N` degrees per period.
- Check: `qa.py out/loop.mp4 --loop`. Export GIF with `npx remotion render ... --codec=gif` or WebM for the web.

## UX/UI motion and microinteractions

- UI durations: 100 to 300 ms (3 to 9 frames at 30 fps); the larger the element or the distance, the longer the duration.
- Click feedback: scale 1 to 0.96 and back in 4 to 6 frames, ripple of 12 to 16 frames, toggle with `springs.snappy`.
- Demo cursor: arrives in an arc with `ease.move`, stops 2 to 4 frames before clicking, click with the `click` SFX.
- Product demo: record the screen or recreate the UI in React; push in on the point of interest (zoom 1.4 to 1.8) and return with `ease.settle`.
- For animation inside the product (not video), respect `prefers-reduced-motion`; this skill generates video, so describe the spec in ms and curves for the team.
