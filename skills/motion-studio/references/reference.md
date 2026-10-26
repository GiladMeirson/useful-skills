# Reference mode: make a new piece with the structure of a video the user showed

When the user hands over a video and says "I want something like this", the taste is no longer the model's. The reference becomes a measure: the script breaks the video down into numbers, the agent looks at the sheet, the new piece is built on the same timings and, at the end, another measurement says how similar it turned out.

## Flow

```bash
uv run <skill>/scripts/reference.py analyze referencia.mp4 -o reference
uv run <skill>/scripts/reference.py plan reference/reference.json -o roteiro.json
# ... direction, scenes, lint, dailies, render ...
uv run <skill>/scripts/reference.py compare reference/reference.json out/final.mp4 --timeline public/timeline.json --min 70
```

1. **Analyze.** `analyze` writes `reference/reference.json`, three keyframes per shot and `reference/sheet.png`.
2. **Look at the sheet.** Numbers don't say what the font is, whether the text is all caps, whether there's grain, what each shot shows. Write in `direction.json` what you saw: type family (serif, grotesque, condensed, mono), treatment (flat, photo, 3D, texture), transition type and each shot's role in the story.
3. **Plan.** `plan` writes a `roteiro.json` with one scene per shot, at the reference's duration. Shots shorter than 0.7 s become one montage scene. Replace the ids with names, add the lines, the marks and the SFX, and run `score.py`. If the new piece has narration, the lines must fit the timings: cut text, don't stretch the reference.
4. **Build** each scene with the camera movement, energy and visual-mass position of the corresponding shot (`camera`, `energy`, `mass` in each scene of the script).
5. **Measure.** `compare` gives the fidelity score and each axis's share. Fix the lowest axis first.

## What is measured

| Field | What it is | How it's obtained |
|---|---|---|
| `shots` | shots, with start, end and duration | hard cut by HSV histogram jump, with a threshold adapted to the video itself |
| `energy`, `peak_at` | how much the shot moves and where the peak is | mean difference between frames, relative to the video's 90th percentile |
| `camera` | zoom in, zoom out, pan, tilt or static | corners tracked by Lucas-Kanade and accumulated partial affine transform |
| `palette`, `bg`, `accent` | the shot's colors and how much each one occupies | k-means in Lab over three frames |
| `layout` | where the visual mass is | edge energy on a 3x3 grid and the center of mass |
| `audio` | BPM, beats, loudness, fraction of cuts on the beat | librosa and `ebur128` |

## The fidelity score

| Axis | Weight | How it compares |
|---|---|---|
| rhythm (`ritmo`) | 0.30 | cut positions, in normalized time, with a tolerance of a quarter of the average shot |
| energy (`energia`) | 0.25 | correlation between the motion curves |
| composition (`composicao`) | 0.15 | correlation of the 3x3 grids, shot by shot |
| color (`cor`) | 0.15 | Lab distance from each reference color to the closest one in the new video, weighted by area |
| camera (`camera`) | 0.10 | same type of movement in each shot |
| duration (`duracao`) | 0.05 | relative difference |

- `--timeline` uses the score's scene boundaries as cuts. Always use it in motion graphics, where the scene change is usually a transition and not a hard cut.
- `--skip cor` removes the palette from the score when the user's brand dictates the colors. Works for any axis.
- `--min 70` makes the script exit with an error below the score.

Calibration done during production of 2.0.0, with a 28.7 s reel of 14 shots as reference: it against itself gives 100; with `--timeline` (7 scenes instead of 14 cuts) it gives 86; a reel made from the same request but without the reference gives 38; two unrelated videos give 23 and 24. Below 40 the piece didn't follow the reference; above 70 it did.

## What can and cannot be reproduced

Reproduce the idea: structure, duration and rhythm of the shots, type of movement, compositional logic, relationship between sound and cut, technique family. Don't reproduce the expression: no frame, asset, logo, character, illustration, licensed font, text or music from the reference goes into the new piece, and the piece must not be confusable with the other party's brand. If the request is a frame-by-frame copy of a third-party video, stop and tell the user so.

The reference comes in as a file the user provides. The skill doesn't download video from platforms.

## Limits

- The score measures structure, not quality or content. A bad piece can score high.
- Hard cuts are detected; long dissolves, wipes and morphs don't count as cuts. In a motion graphics reference with no hard cuts, check the shot count on the sheet.
- BPM comes from the mixed track. With voice on top it gets it wrong, including by half or double: in the calibration reel the track is 128 BPM and the measurement gave 86. Treat `bpm` and `cuts_on_beat` as a hint.
- Camera movement is estimated from the background. In a shot dominated by a moving object, the object can be read as camera.
- Typography, texture and meaning are not measured: that's what the sheet exists to show.
