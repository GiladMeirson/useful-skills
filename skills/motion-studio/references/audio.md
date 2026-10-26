# Audio: music, SFX, sync and loudness

## License (blocking rule)

- Accept only `cc0`, `pdm` and `by`, or generated audio. Under CC 4.0, music synced to picture is an adapted work: `by-nd` cannot go into the video and `by-sa` forces the video to be licensed `by-sa`. `nc` and sampling+ are out.
- Sources that don't work for scripted download: Pixabay (API has no audio), Mixkit and Uppbeat (terms forbid automation), Free Music Archive (forbids automated requests). Freesound and Jamendo: free API only for non-commercial use.
- `music.py` writes `credits.json` next to the file: title, author, URL, license, verification date, attribution text and modifications. Paste the `attribution` field into the video description.

## Music chain

1. Incompetech (Kevin MacLeod, CC BY 4.0, catalog with BPM): `music.py incompetech --feel calm --bpm 70-110 --min-sec 60`.
2. Openverse with license filter: `music.py openverse --q "ambient piano"`. Without a token: low hourly limit.
3. Local offline generation: `music.py generate --sec 30 --bpm 84 --mood calm|uplift|tense`. Simple, clean bed, good under narration.
4. Optional, with the user's agreement: ElevenLabs Music (`POST /v1/music`, `force_instrumental`), Stable Audio 3 Small (local, Stability Community license for revenue under US$ 1 million per year), ACE-Step 1.5 (MIT, needs a GPU).

## SFX

- Procedural and instant: `sfx.py` generates whoosh, swoosh, riser, impact, click, pop, tick and shimmer. No third-party license.
- Declare in the score: `{"at": 3.2, "type": "whoosh", "gain_db": -15, "dur": 0.5}`; `mix.py` places it at the exact time.
- Where to put them: whoosh centered on the cut (starts 0.25 s before), pop when a shape settles, click on the click frame, riser in the 1 to 2 s before the climax, impact on the climax. Less is more: 1 SFX per meaningful event.
- Larger library: Sonniss GDC (royalty-free, no attribution) downloaded once by the user and indexed locally.

## Sync

- With narration, the voice is the clock: scenes start 0.2 s before the sentence.
- Rhythmic music: `beats.py` and cut on downbeats (`downbeat_frames`). Calm music has no reliable grid: cut by sentence.
- Use a single beat analyzer in the project.

## Mixing and loudness

- Starting levels: narration 0 dB, music -14 to -18 dB with -10 dB ducking under the voice, SFX -12 to -17 dB.
- `mix.py` ducks by voice envelope (attack 20 ms, release 400 ms) and normalizes in two passes with ffmpeg `loudnorm`.
- Targets: YouTube, Reels, TikTok and LinkedIn -14 LUFS and true peak -1 dBTP (industry convention; platforms don't publish an official target, except YouTube's stable volume). Apple Podcasts -16 LUFS. The score default is -14 LUFS and -3 dBTP on the WAV: AAC conversion brings peaks back up to 1.5 dB higher (measured on quiet recorded speech, which `loudnorm` amplifies by 13 dB: -1.3 dBTP on the WAV became -0.1 on the MP4), and `qa.py` measures the MP4.

## Generated in code (default, free)

- Music: `uv run <skill>/scripts/musicgen.py --mood <calm|uplift|corporate|tense|hype> --sec <duration> --key D --hits <cut seconds> -o public/audio/music.wav`. `--hits` takes the scene starts from `public/timeline.json` so a riser leads into each cut and an impact lands on it. `--stems` also writes drums/music/bass/fx separately.
- SFX: `sfx.py` types in `roteiro.json` (`"type": "whoosh"`), rendered by `mix.py` at the exact frame.

## ElevenLabs (optional, uses credits)

- SFX from a prompt, on a cue or on every cut:
  `"sfx": [{"at": "math", "eleven": "deep cinematic boom with a metallic tail", "dur": 1.6, "gain_db": -16}]`
  `"cut": {"sfx": {"eleven": "fast airy whoosh, short", "dur": 0.6, "gain_db": -20, "lead": 0.3}}`
  Prompts: describe the sound physically (source, size, material, distance, tail), not the emotion. 0.5-30 s; `"loop": true` for ambiences; `"influence"` 0-1 (default 0.4).
- Music bed from a prompt: `"music": {"eleven": "warm minimal electronic, soft punchy drums, 110 bpm, uplifting, no vocals", "gain_db": -15, "duck_db": -9}`. Length = video + 1.5 s, instrumental unless `"vocals": true`; model `music_v2_5` (falls back to `music_v1`). Music needs a paid plan.
- Flow: `score.py` → `uv run <skill>/scripts/eleven_assets.py --dry` (list + credits left) → user's yes → `--yes` (prints credits actually spent) → `mix.py`. Generated once per prompt and cached in `public/audio/eleven/`; `mix.py` stops if something requested is missing.
- One-off: `eleven.py sfx "<prompt>" --dur 1.2 -o file.mp3`, `eleven.py music "<prompt>" --sec 30 -o file.mp3`.
- Credits: ElevenLabs output follows the terms of the user's plan (free plan = personal use only). It goes into `credits.json` as generated.
