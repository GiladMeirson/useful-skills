# Motion doctrine

Rules with numbers. If a decision isn't here, derive it from the tokens in `src/lib/motion.ts`; don't invent a new curve.

## Easing by behavior

| Behavior | Token | Curve |
|---|---|---|
| Enter | `ease.enter` | bezier(0.16, 1, 0.3, 1) |
| Crisp enter (UI, short text) | `ease.sharp` | bezier(0.2, 0.75, 0.34, 0.94) |
| Settle without overshoot (zoom out, reveal) | `ease.settle` | bezier(0, 0.65, 0.51, 0.99) |
| Change position or shape | `ease.move` | bezier(0.77, 0, 0.175, 1) |
| Exit | `ease.exit` | bezier(0.7, 0, 0.84, 0) |
| Continuous rotation, loop | `ease.linear` | linear |

| Scene hero, emphatic arrival | `easeX.emphasized` | bezier(0.05, 0.7, 0.1, 1) |
| A single overshoot, on the focus | `easeX.overshoot` | bezier(0.34, 1.56, 0.64, 1) |

Ease-in on an entrance is an error. Bounce and elastic (multi-cycle oscillation) are forbidden. Overshoot is a single crossing, 3 to 8% past the target (`easeX.overshoot`, `springs.snappy` or `springs.bouncy`), on the focused element, one per scene.

## Springs

`springs.smooth` (damping 200) for text and camera; `snappy` (damping 20, stiffness 200) for UI and icons; `bouncy` only on the focus; `heavy` for large objects and logos. A spring needs `durationInFrames` when the scene has fixed timing.

## Timing

- Durations at 30 fps: micro 6 frames (200 ms), fast 10, base 16, slow 24. Video entrance up to ~800 ms; exit about 75% of the entrance.
- Scene structure: build 0 to 30%, breathe 30 to 70%, resolve 70 to 100%. The slowest scene lasts about 3x the fastest.
- Scale starts at 0.9 to 0.97 in UI; in video it can start at 0 with a spring. Use `scale` and `translate`, never animate width, height, top or left.
- Hierarchy: one primary action per beat, secondaries up to 30% of its amplitude, ambient up to 5%. Overlapping secondary and primary is desired; two primaries at the same time is an error.
- Hold: after each arrival, 12 to 24 frames in which only the ambient moves. `qa.py --timeline` warns about scenes with no breathing room.
- No dead frame: at any second, something meaningful is in progress. Subtle drift (`wiggle` with amplitude up to 6 px) counts as life, not as action.
- Cascade: 1 to 3 frames per item, total up to 500 ms; a long title allows up to 800 ms with `cascade()`.
- Classic principles: short anticipation before large moves, 2 to 4 frames of follow-through on loose parts, motion in arcs, squash and stretch only on elastic objects.

## Cuts and transitions

- Gaze rule: the attention point of A's last frame is B's entry point.
- Match cut: same axis and direction on both sides, matched speed (exit accelerates, entrance decelerates). The cut lands mid-motion.
- Whip displacement around 12% of the frame; peak blur 10 to 14 px on text, 18 to 20 px on surfaces.
- At most 2 or 3 transition types per video. Opaque root background so it doesn't flicker.
- `TransitionSeries` shortens the timeline: two 60-frame scenes with a 15-frame transition give 105.

## Layout and typography

- Side margin of at least 80 px at 1080 px width. Headline 84 px or more at 1080p; caption 48 to 64 px.
- Safe area: action in 90%, text in 80%. 9:16: text between y 360 and 1420.
- Slight negative letter-spacing (-0.02 em) on large titles; weight 600 to 800 for titles, 400 to 500 for body.
- WCAG AA contrast. No full-screen linear gradient on a dark background (banding); if you use one, add grain.

## Captions and reading

- At most 2 lines, 32 to 42 characters per line, 0.5 s minimum per block, 17 cps maximum in the video's language (English or Hebrew).
- Caption and audio in the same `Sequence`; times relative to the narration file plus the score's `start`.

## Color and aesthetics

- One accent color; the rest in neutrals with temperature (warm paper, dark ink). The accent marks the spoken word, the focused object or the key data point.
- Forbidden: full-screen purple-blue gradient, generic glow, everything entering with a fade, everything centered, untreated stock icons, emoji.
