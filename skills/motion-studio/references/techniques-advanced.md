# Advanced techniques: studio vocabulary and how to do it in code

Read the section for the technique you're going to use. Frames are for 30 fps. Source of the numbers: `[Carbon]` IBM Carbon motion and `[M3]` Material 3 (checked on 2026-10-09), `[Disney]` the 12 principles (they give the concept, not the number), `[practice]` studio consensus without a formal source. A `[practice]` number is a starting point: check it on the rendered frame.

## Contents

1. Animation principles applied
2. Timing: cascade, speed ramp, curves
3. Cuts and transitions
4. Masks, mattes and shape layers
5. Advanced typography
6. Classic After Effects expressions in code
7. Procedural: noise, fields and particles
8. Look: grain, light and lens
9. Camera
10. UI, data and logo
11. Remotion in 2026: what's new

## 1. Animation principles applied

| Technique | What it is | Numbers | How to do it |
|---|---|---|---|
| Anticipation | opposite pull-back before the action | 2 to 6 frames, 5 to 10% of the travel `[practice]` | `anticipate(frame, start, length, from, to, 0.08)` |
| Overshoot | passes the target and settles, a single crossing | 3 to 8% beyond, settles in 4 to 8 frames `[practice]` | `easeX.overshoot` or `springs.snappy`; only on the element in focus |
| Follow-through | loose parts keep going after the body stops | 2 to 4 frame delay, 10 to 30% amplitude `[Disney]` `[practice]` | child uses `lag(frame, level, 3)` in the same function as the parent |
| Overlapping action | parts start and end at different times | 1 to 3 frames per hierarchy level | same curve with `lag` by depth |
| Secondary action | smaller movement that supports the main one | up to 30% of the primary action's amplitude | its own layer; never crosses the point of attention |
| Squash and stretch | deforms while preserving volume | 10 to 20% in cartoon style | `squash(0.15)` returns `{sx, sy}`; `transformOrigin` at the contact point |
| Smear frame | 1 or 2 stretched frames at peak velocity | stretch 2 to 4x in the direction of motion | `scaleX(smear(velocity(fn, frame)))` |
| Arcs | curved path, never straight between two points | arc sagitta of 5 to 15% of the distance | 0 to 1 progress read with `getPointAtLength` from `@remotion/paths` |

Motion hierarchy in every scene: one **primary** action per beat, **secondary** actions up to 30% of the amplitude, and **ambient** motion up to 5% (drift with `wiggle`) so the frame never dies.

## 2. Timing: cascade, speed ramp, curves

- **Offset, stagger, cascade**: the same animation offset per item, 1 to 3 frames per item. Up to 6 items, `stagger(i, n, total)`. Long list: `cascade(i, n, total)` compresses the delays at the end so the last item doesn't enter after the eye has left. Total of 300 to 500 ms in UI; a long title in video allows 600 to 800 ms `[practice]`.
- **Speed ramp, time remap**: time speeds up and slows down within the shot, typically 400% to 25% to 100% with a 6 to 12 frame ramp. `const t = timeRemap(frame, [[0, 4], [12, 0.25], [40, 1]])` and pass `t` as the frame to the children. In real video, remember that since Remotion 4.0.530 `durationInFrames` is applied before `playbackRate`.
- **Value graph and speed graph**: value is position over time; speed is the derivative. In a strong ease-out, peak speed is in the first 20 to 30% of the time. Check with `velocity(fn, frame)`: a speed jump above 3x between neighboring frames outside a cut is a broken tangent.
- **Reference curves**: expo out `(0.16, 1, 0.3, 1)` is `ease.enter`. Emphasized decelerate `(0.05, 0.7, 0.1, 1)` `[M3]` is `easeX.emphasized`, for the scene's hero. Carbon: expressive entrance `(0, 0, 0.3, 1)`, exit `(0.4, 0.14, 1, 1)`, durations 70, 110, 150, 240, 400 and 700 ms `[Carbon]`.
- **On twos, on threes**: `stepped(frame, 2)` gives 15 poses per second at 30 fps. Mix them: character on twos, camera continuous.
- **Hold**: every fast movement needs 12 to 24 frames of rest afterward. Without a hold the eye doesn't read; `qa.py --timeline` measures this.

## 3. Cuts and transitions

| Technique | What it is | Numbers | How to do it |
|---|---|---|---|
| Match cut | same shape, position and direction on both sides | center within 5% of the frame | last frame of A and first of B with the same center and scale |
| Morph cut | the shape of A becomes the shape of B | 8 to 16 frames | `morphPath` (flubber) or `interpolatePaths` from `@remotion/paths` |
| Invisible cut | cut hidden in a whip, blur or flat color | 2 to 4 frames of coverage | cut at the whip's peak velocity |
| Smash cut | abrupt cut between opposite intensities | no transition; 2 to 4 frames of silence before | `<Series>` without transition and a pause in the audio |
| J-cut and L-cut | the sound comes in before (J) or continues after (L) the cut | 4 to 12 frames | audio `<Sequence from>` offset from the image; in `timeline.json`, the SFX's `at` before the scene's `start` |
| Wipe, iris, clock wipe | reveal by mask | 10 to 20 frames | `wipe()`, `iris()`, `clockWipe()` from `@remotion/transitions`, or `<IrisReveal progress>` |
| Shape transition | a shape grows and becomes the background of the next scene | 12 to 18 frames | `<IrisReveal>` with the shape's color, starting from the object in focus (`cx`, `cy`) |
| Liquid transition | organic edge that merges | blur 10 to 20 px | `<GooeyFilter id="goo">` and `filter="url(#goo)"` on the group |
| Light leak | blown-out light covering the cut | short, once | `lightLeak()` from `@remotion/effects/light-leak` in `<TransitionSeries.Overlay>` (requires WebGL2) |

Eye trace rule: the point of attention in the last frame of A is the entry point of B. If the focus changes place, a movement carries the eye there.

## 4. Masks, mattes and shape layers

- **Alpha and luma track matte**: one layer defines where the other appears. Alpha: `clipPath` or `mask-image`. Luma: `mask-mode: luminance` or SVG `<mask>` (white shows, black hides).
- **Trim paths**: `pathLength={1}` with `strokeDasharray={1}` and animated `strokeDashoffset`, or `evolvePath` from `@remotion/paths`.
- **Repeater**: `Array.from({length: n})` with accumulated transform (rotation `i * 360 / n`, scale `0.9 ** i`) and delay `lag(frame, i, 2)`.
- **Null and parenting**: nested `<g>` or `<div>`; the null is the wrapper without drawing that receives the transform.
- **Anchor point**: `transformOrigin`; in SVG, together with `transformBox: 'fill-box'`.
- **Pre-comp**: nested `<Sequence>` resets `useCurrentFrame()`; `<Freeze>` freezes, `<Loop>` repeats.
- **Real limits**: offset path and merge paths have no native SVG equivalent. Approximate offset with `strokeWidth` and `strokeLinejoin: 'round'`; an exact boolean needs a library (paper.js), or draw the shape already finished.

## 5. Advanced typography

- **Baseline reveal (rise through a mask)**: `<MaskReveal progress>` per word or line, with `lag(frame, i, 3)`. It's the studio's default entrance; a plain fade is the amateur default.
- **Per-character range selector**: split by grapheme, 1 to 2 frame delay, 8 to 12 frames per character. Only on titles of up to 20 characters.
- **Animated tracking**: `letterSpacing` from `0.3em` to `0` over 20 to 30 frames; measure with `measureText` using the same `letterSpacing`.
- **Variable font axis**: `fontVariationSettings: "'wght' 300"` to `800` interpolated per frame, in a variable font.
- **Text that fits**: `fitText`, `fitTextOnNLines` and `fillTextBox` from `@remotion/layout-utils`, measured after the font loads.
- **Number ticker**: `ticker(frame, start, 30, 0, value)` with `fontVariantNumeric: 'tabular-nums'`; 20 to 45 frames and the final value held for 1 s or more.

## 6. Classic After Effects expressions in code

| After Effects | Here |
|---|---|
| `wiggle(freq, amp)` | `wiggle(seed, frame, freq, amp)`; handheld camera: 0.5 to 2 Hz, 2 to 6 px, 0.2 to 0.5 degrees |
| `loopOut("cycle")` | `loopPhase(frame, period)` |
| `loopOut("pingpong")` | `pingPong(frame, period)` |
| `valueAtTime(time - delay)` (follow the leader) | `fn(lag(frame, i, 3))` |
| inertial bounce | a single overshoot: `easeX.overshoot`. Multi-cycle oscillation remains forbidden |
| `posterizeTime(12)` | `stepped(frame, fps / 12)` |

## 7. Procedural: noise, fields and particles

- **Flow field**: angle `noise3D(seed, x * s, y * s, t) * 2π` with `s` from 0.002 to 0.01. Each particle's position is recalculated from frame 0 on every render; never keep accumulated state in `useRef`.
- **Particles**: closed form `p0 + v * t + 0.5 * g * t²` with `random(seed + i)` for initial position and velocity.
- **Turbulent displace**: `feTurbulence` with `baseFrequency` from 0.01 to 0.05 plus `feDisplacementMap` with `scale` from 10 to 40. `<BoilFilter>` is the stepped case.
- **Echo, trails**: `<Echo copies={4} lag={2} render={(f) => ...} />` draws delayed copies; combine with `smear` at the peak.

## 8. Look: grain, light and lens

| Effect | Numbers `[practice]` | How to do it |
|---|---|---|
| Grain | opacity 4 to 10% | `<Grain>` on top of everything |
| Halation | blur of 1 to 2% of the width, 15 to 30% opacity | blurred copy of the highlights, orange tint, `mixBlendMode: 'screen'` |
| Chromatic aberration | 1 to 3 px at 1080p; more than that gives it away | separate channels with `feColorMatrix` and `feOffset` |
| Bloom | 2 or 3 blur passes | thresholded copy, blur and `screen` |
| Depth of field | 0 at focus, 8 to 20 px in the background | `filter: blur()` per `<Layer>` according to depth |
| Light sweep (shine) | 12 to 20 frames, once, 15 to 25% band | `<Shine progress>` on the logo or the main figure |
| 2D shadow and light | one fixed light direction in the scene | gradient, inner shadow and rim light in the same mask |
| Isometric | `rotateX(54.7deg) rotateZ(45deg)` | axes at 30 degrees, vertical scale 0.816 |

Each lens effect goes in once and with a reason. Grain, aberration and glow together on everything is a signature of generated work.

## 9. Camera

- Animate the camera, not the objects: one easing on the `<Camera>` moves everything coherently; objects only get local motion.
- Camera and object never animate the same axis at the same time.
- Camera overshoot: passes the target by 1 to 3% and settles in 6 to 10 frames, only on an impact arrival.
- Parallax: background with a factor of 0.2 to 0.5 and foreground 1.2 to 1.5 (`<Layer depth>` from 2 to 5 and from 0.7 to 0.85).

## 10. UI, data and logo

- **Shared element, container transform**: the same element interpolates from rectangle A to B and the content crossfades in the middle; compute both rectangles and interpolate directly (it's FLIP without measuring the DOM).
- **Cascading list**: 1 to 2 frames per item, only on the first 6 to 8.
- **Skeleton**: shimmer looping every 1.2 to 1.5 s and a 150 to 240 ms crossfade to the content.
- **Cursor choreography**: arc with `ease.move`, 4 to 8 frame pause before the click, click with 0.9 scale for 3 to 4 frames, UI response 1 to 2 frames later.
- **Data**: axes, then marks, then labels. A bar grows from the baseline, a line draws itself, the final value is legible for 1 s or more.
- **Logo sting**: four phases in 2 to 5 s: build (40 to 60%), resolve (10 to 15%), hold (25 to 35%) and sign-off. The audio impact lands on the resolve frame.

## 11. Remotion in 2026: what's new

Checked on remotion.dev on 2026-10-09; the template pins version 4.0.534. Remotion 5.0 has not been released.

- `@remotion/transitions`: `fade`, `slide`, `wipe`, `flip`, `clockWipe`, `iris`, `none`; `<TransitionSeries.Overlay>` doesn't change the duration. A transition and an overlay can't be neighbors.
- `@remotion/motion-blur`: `<CameraMotionBlur shutterAngle samples>` and `<Trail>`.
- `@remotion/effects`: `effects` prop with `blur()`, `lut()` and `lightLeak()`; `createEffect()` for your own effect. Not in the template: install with the same exact version.
- `@remotion/paths`: `interpolatePaths()` for morphing between compatible paths.
- `@remotion/captions`: `createTikTokStyleCaptions` for paged captions.
- `@remotion/media-parser` and `@remotion/webcodecs` are deprecated in favor of Mediabunny.
- License: free for individuals and companies of up to 3 people. From 4 on, Company License ($25 per month per person who writes Remotion code; automated rendering has its own pricing).
