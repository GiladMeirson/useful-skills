# QA, lint, dailies and delivery

## Lint before render (`lint.py`, blocking on FAIL)

`python3 <skill>/scripts/lint.py` in the project folder reads `public/timeline.json`, the narration's `words.json` and `src/`. It runs in under 1 s, so run it after every score or scene change.

| Check | Level |
|---|---|
| Project without `direction.json`, incomplete contract, scene without declared layout, entrance and hero | FAIL |
| All scenes with the same layout or the same entrance | FAIL |
| Neighboring scenes with the same layout and entrance pair; direction chosen by the agent | WARN |
| Scenes with a gap, overlap, or outside the duration | FAIL |
| Cut inside a spoken word; voice that ends after the video | FAIL |
| SFX outside the duration | FAIL |
| `Math.random`, wall clock, timers, `useFrame`, CSS transition or animation, `Easing.bounce` and `Easing.elastic` | FAIL |
| Cut that doesn't match a phrase start (0.25 s tolerance) | WARN |
| Scene above 2.6 words per second; scene shorter than 1 s | WARN |
| All scenes with the same duration | WARN |
| Two SFX less than 0.12 s apart; less than 1 s of end frame after the last word | WARN |
| `interpolate(frame, ...)` without `easing`; curve created outside `lib/motion.ts`; color written outside `theme.ts` | WARN |
| HTML media tag; emoji; far more `opacity` than transform | WARN |

WARN is a heuristic: read it, decide, and say in the delivery what was left.

## Dailies (before the final render, mandatory)

1. Batch stills: `node <skill>/scripts/stills.cjs Showcase` in the project folder renders the start, middle and end of each scene with a single bundle and a single browser (21 frames in about 7 s; the CLI takes 3 to 4 s per frame because it rebuilds both on every call). Writes to `out/stills`.
2. `uv run <skill>/scripts/layout.py out/stills --timeline public/timeline.json` measures the text in each still (table below). Fix the FAILs before looking at the sheet.
3. `contact_sheet.py --stills out/stills -o out/sheet.png` builds the sheet without an MP4.
4. Open the image and answer PASS or FIX per frame. After your FIXes, the sheet goes to the independent reviewer (`references/critic.md`).
5. When feedback cites a moment, render that instant (`stills.cjs Showcase --times 12.4,12.6 --scale 1 --out out/sf`) and look before editing.
6. Video draft (`node <skill>/scripts/render.cjs Showcase --draft`, half scale, outside the budget) only when what's in doubt is motion or rhythm: run `qa.py --timeline` on `out/draft.mp4`.
7. Another format: `stills.cjs Showcase --format reels --out out/stills-reels` and `layout.py out/stills-reels`. Each format has its own safe area.

A round where only the voice changed doesn't need a new sheet: the user listens to `public/audio/mix.wav`.

## Measured layout (`layout.py`, blocking on FAIL)

The composition loads the `<Probe />` probe. When `stills.cjs` requests a frame, it measures each text in the DOM (box, real size after transforms, color, opacity, how much is hidden by a mask) and the script reads the background color from the PNG's pixels. Only settled text is judged: a word in the middle of an entrance doesn't count.

| Check | Level |
|---|---|
| Text clipped by the frame edge | FAIL |
| Text outside the action area (90% of the frame) | FAIL |
| Two overlapping texts (more than 15% of the smaller box) | FAIL |
| Letters smaller than 20 px on a 1080 short side | FAIL |
| Contrast below 3:1 against the measured background | FAIL |
| Text outside the text safe area (80%; in 9:16, y 360 to 1420) | WARN |
| Letters between 20 and 28 px; contrast between 3:1 and 4.5:1 on letters smaller than 40 px | WARN |
| Neighboring scenes with similarity above 0.90, or piece median above 0.80 (`--timeline`) | WARN |

- Ornamental text that bleeds off the frame on purpose gets the `data-decor` attribute and is excluded from measurement.
- Limits: text drawn in canvas, in WebGL or inside an image isn't in the DOM and isn't measured. The probe doesn't know what's on top: text covered by another opaque layer (a transition that covers the scene) is measured as if visible and fails on contrast; make the scene exit before it's covered. A line of text is measured in a 1.2 em band around the middle of the box, because the DOM box has the height of the font's content area (up to 1.5 em in a condensed face) and not that of the glyph. Text that grows by scale is only judged in the still where it reaches its largest size. A photo or gradient background gives approximate contrast (the message says "irregular background"). Scene similarity compares 24x24 grayscale thumbnails; in the four real videos used for calibration the median was between -0.08 and 0.29 and the highest pair at 0.73, and there was no sample of a repetitive video, so the threshold is conservative.

## Measured direction (`design.py`, warning)

`uv run <skill>/scripts/design.py out/stills --timeline public/timeline.json` measures one still per scene and counts the signals of the frame the model makes with no direction at all (list and antidotes in `design.md`, section 9):

| Signal | How it's measured |
|---|---|
| near-black with one accent | background with L below 0.25 and at most one saturated color, in 60% of frames or more |
| two colors | only two colors with 2% of the area or more, in 60% of frames or more |
| same composition | the center of visual mass barely changes between scenes (spread below 0.05) |
| giant condensed | the largest text is a condensed face in 60% of frames or more |
| all caps | more than half of the text blocks in all caps |
| decorative mono | mono text in 60% of frames or more and above 15% of blocks |
| all on the left margin | the largest text starts at the left margin in 70% of frames or more |
| single weight | the largest text is heavy in 90% of frames or more |

Three or more signals give the verdict "model default"; two, "close to default". Calibration of 2.0.0: the template example gives 3 signals and a maximalist reel made with 1.3 gives 4, both correctly flagged as default. `--video file.mp4` measures only the pixels of any video, without the text signals. In a piece built on footage, "same composition" and empty area say nothing: the frame is the camera's.

## Visual checklist

- Is any text clipped, outside the safe area, or over the subject?
- Does the first frame of each scene already have something legible, or is it empty?
- Are two actions competing at the same moment?
- Does the highlighted word coincide with the spoken word?
- Colors outside the palette, purple gradient, glow, everything centered?
- Enough contrast on all text?
- Does anything flash white or black on the cut?
- Does the last frame close the idea (logo, CTA or final line held for at least 1 s)?

## Automatic gate (`qa.py`, blocking)

| Check | Rule |
|---|---|
| Codec | h264 and yuv420p (TV range). `yuvj420p` fails: run `deliver.py` |
| Contrast (`--stills`) | MP4 frames compared to the stills of the same composition: mean error up to 5/255 and black and white within 6/255 of the still. Fails luma range compressed by a re-encode |
| Audio | AAC present and duration equal to the video's (within 0.15 s) |
| Loudness | profile target within 1 LU; true peak up to the profile maximum |
| Flashes | at most 3 per second (approximation of WCAG 2.3.1) |
| 1-frame pop (warning) | one frame different from its two neighbors, which are equal to each other |
| Loop seam (`--loop`) | difference between last and first frame at the level of a normal step |
| Warnings | color without BT.709 tag, profile resolution, standard fps, still stretch above 1.5 s, black frames, reading above 17 cps |
| Rhythm (`--timeline`) | per scene: motion energy, fraction of time at rest, longest rest and peak position. Warns on a scene without a 0.25 s rest, a scene that is almost entirely still, and a piece without contrast (busiest scene below 1.5x the calmest) |

The rhythm meter is a meter, not a judge: the thresholds were tuned on a single real video and serve to point where to look on the contact sheet.

## Per-scene render, formats and budget (`render.cjs`)

- `node <skill>/scripts/render.cjs Showcase` renders each scene of the score as a segment (one bundle and one browser for all) and joins them without re-encoding, with the audio from `timeline.audio`. Measured on the template video: 12.7 s versus 11.8 s for the full `remotion render`, SSIM 0.9998 between the two.
- `--scene closing` redoes only that scene and reuses the other segments (6.2 s on the same video). If the score changed the range of another scene, that one is redone too. If you changed the theme, a component or a block that several scenes use: run without `--scene`; the patch only knows what you told it changed.
- `--formats reels,square,youtube` delivers all three in one round, with the same composition (`useFormat()` in the scenes). Each format goes through its own `stills.cjs --format` and `layout.py` first.
- `--remux` reassembles the master with the new `mix.wav` without rendering any scene: it's the path when only the music, voice or SFX changed and the scene durations stayed the same.
- Audio goes in as AAC with a limiter 1 dB below the mix ceiling: without it, AAC returned a -0.8 dBTP peak for a WAV at -2.8.
- `--draft` renders at half scale to `out/draft.mp4` and doesn't count against the budget.
- **Budget**: `budget` in the score (`full_renders` 4 and `stills` 30 per call, by default; change it in `roteiro.json`). On the fifth full render the script refuses and asks for `--over "reason"`. Each call to `stills.cjs` and `render.cjs` is logged in `out/ledger.json`. The cap exists because cost discipline written in prose doesn't hold: checking on a still costs seconds, checking on a render costs minutes and quota.

## Delivery

- Render with `--color-space=bt709` (the template's `remotion.config.ts` already sets it): the MP4 comes out h264 yuv420p TV range, tagged BT.709, with 48 kHz AAC and faststart.
- `deliver.py` checks this and copies the video without re-encoding. It only re-encodes (CRF 18) when the source arrives in full range (`yuvj420p`) or in another pixel format. Compressing the range of a file that is already in TV range washes out the contrast: black turns gray and white loses brightness.
- Profiles: `youtube` 1920x1080, `reels` and `tiktok` 1080x1920, `square` 1080x1080, `linkedin` 1920x1080.
- Deliver: `final.mp4`, `sheet.png` and the credits text (the `attribution` field of each item in `credits.json`, plus "made using Openverse" when applicable).
- State in the delivery, without softening: what was left as WARN, who approved the direction, whether there was an independent reviewer, how many full renders were spent (`out/ledger.json`) and every resource that fell back to an alternative (paid voice that became local, generated music instead of a track, a format different from the one requested, a simplified scene). A video that passes the gate with a degraded resource and doesn't say so is a delivery defect.

## Setup and common problems

- Custom Chrome: set `REMOTION_BROWSER_EXECUTABLE=<path>` and `stills.cjs` / `render.cjs` use it (restricted networks where Remotion can't download its headless shell).

- Chrome: Remotion downloads Chrome Headless Shell on the first render. On a restricted network, point to a local Chromium with `--browser-executable=<path>`.
- Fonts: bundled from `@fontsource` through `src/fonts.ts`, so renders work offline. New family: `npm i @fontsource/<slug>` + `python <skill>/scripts/genfonts.py .`.
- Slow render: use the flag that `gl.py` returns. It renders a segment with the default backend, `vulkan` and `angle-egl`, and only replaces the default with one that is at least 20% faster with an SSIM of 0.99 or higher; it saves to `out/gl.json` (`--force` measures again). Don't hard-code `--gl=vulkan`: without a GPU it runs in software without warning and can double the time. `--frames=0-60` tests segments.
- A full-screen SVG filter with a per-frame seed (the `<Grain>`) costs 13% to 20% of the render and, on the default backend, prevents the `--concurrency` gain: with it on, 4, 6 and 8 tabs take the same time. Motion blur is also expensive.
- 3D without a GPU: `--gl=swangle`.
