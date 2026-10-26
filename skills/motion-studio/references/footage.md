# Editing the user's raw footage (talking head → reel)

For "here is my raw clip, make it a reel": the footage is the backbone, motion graphics sit on top. The speech in the clip is the clock — no TTS.

## Pipeline

```bash
# 0. put the clip in the project: public/footage/raw.mp4 (keep the original untouched elsewhere)
uv run <skill>/scripts/align.py public/footage/raw.mp4 --transcribe -o public/audio/speech --lang he --model small
#    -> speech.txt + speech.words.json on the RAW clock. Show speech.txt to the user; fix spelling; re-run align with it as the script.
uv run <skill>/scripts/footage.py cut public/footage/raw.mp4 -o public/footage/edl.json
#    -> segments without silences; every other segment gets a 1.12 punch-in
uv run <skill>/scripts/footage.py captions public/footage/edl.json public/audio/speech.words.json -o public/footage/captions.json
#    -> the same words on the EDITED clock
```

Then in the scene:

```tsx
import edl from '../../public/footage/edl.json';
import cap from '../../public/footage/captions.json';
<JumpCut edl={edl} focus={{x: 0.5, y: 0.35}} />
<Captions words={cap.words} />
```

Composition length = `Math.round(edl.duration * fps)`. The footage's own audio plays through `OffthreadVideo`; `mix.py` adds music (ducked under speech) and SFX.

## Cut tuning

| Situation | Flags |
|---|---|
| Noisy room, cuts missing | `--noise -28` |
| Quiet studio, breaths cut off | `--noise -38 --pad 0.12` |
| Fast TikTok pace | `--min-silence 0.25 --pad 0.05` |
| Calm explainer | `--min-silence 0.6 --pad 0.15 --punch 1` |

Read `removed_sec` in the output: removing more than 40% usually means the threshold is eating soft words — raise `--noise` (more negative).
Bad takes / repeated sentences: delete those segments from `edl.json` by hand (then recompute `at`: each segment's `at` = sum of previous `out - in`), and re-run `footage.py captions`.

## Editing rules (footage)

- Hook: the first 1-2 seconds are the strongest sentence of the clip, even if it's from the middle (move that segment first in `edl.json`). On screen from frame 0: a bold hook title.
- Punch zooms land ON the cut, never animate across it. Alternate 1.0 / 1.12; on an emphasized word allow 1.25 for one segment.
- Captions: word-by-word or 2-4 word chunks, bottom third but above the platform UI (9:16: y 1100-1420), active word in the accent color. Hebrew: `dir="rtl"`.
- B-roll / motion graphics over the speaker when they name a thing (a number, a product, a list): cover 1-3 s, keep the voice running (L-cut).
- Captions behind the subject: run `roto.py` on the footage to get an alpha matte, then stack footage → text → cutout. Costly; one moment per video.
- Speed ramps only on non-speech moments (B-roll, transitions).
- Never cut inside a word: `footage.py` pads with `--pad`; `lint.py` checks cuts against the words when the timeline has them.
- Loudness: speech-led video targets -14 LUFS integrated, -1.5 dBTP (`deliver.py`/`qa.py --profile reels`).

## Limits

- `silencedetect` is energy-based: music in the background defeats it. For clips with music, cut from the transcript instead (gaps between words in `speech.words.json` longer than 0.35 s).
- Whisper Hebrew accuracy improves with `--model small` or `medium`; `base` makes spelling mistakes in names.
