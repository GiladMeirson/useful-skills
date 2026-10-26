# Script, score and cues

One file decides the timing of everything: the script (`roteiro.json`), at the project root. `scripts/score.py` reads this file and writes the voice (`public/audio/narration.wav`), the score (`public/timeline.json`) and the cues (`public/cues.json`). Video, mix, lint and QA read the score; scenes read the cues. No frame is written by hand in any scene.

```bash
uv run <skill>/scripts/score.py --dry     # what would be generated and how many paid characters
uv run <skill>/scripts/score.py --yes     # generates the new phrases, assembles the voice, writes score and cues
uv run <skill>/scripts/score.py           # no new paid phrase: only redoes the timing (pauses, cuts, cues, SFX)
```

Each phrase is a file in `public/audio/seg/`, named by the hash of the text and the voice. Changing a pause, cut or SFX costs no credits. Changing one phrase regenerates only that one.

## Format

```json
{
 "format": "reels",
 "fps": 30,
 "start": 0.3,
 "tail": 1.4,
 "voice": {"provider": "edge", "lang": "en", "voice": "en-US-AndrewMultilingualNeural", "speed": 1.0},
 "music": {"file": "audio/music.mp3", "gain_db": -15, "duck_db": -9, "offset": 12.0},
 "cut": {"on": "beat", "lead": 0.2, "sfx": {"type": "whoosh", "gain_db": -18, "dur": 0.5, "lead": 0.25}},
 "budget": {"full_renders": 4, "stills": 30},
 "scenes": [
  {"id": "hook",
   "say": [{"text": "Your register closes itself.", "speak": "Your register closes itself!", "closed": true}],
   "cues": {"register": "word:register", "closes": "word:closes.end+0.1"},
   "sfx": [{"at": "register", "type": "pop", "gain_db": -15}]},
  {"id": "breath", "beats": 4},
  {"id": "proof",
   "say": [{"text": "In thirty seconds.", "pause": 0.5}, {"text": "Every day.", "at": 9.2}],
   "hold": 0.6}
 ]
}
```

| Field | What it does |
|---|---|
| `format` | `youtube`, `linkedin`, `reels`, `tiktok` or `square`. `width` and `height` can be used instead |
| `start`, `tail` | second at which the voice starts; end frame after the last word |
| `duration` | sets the minimum duration; without it the duration comes from the speech plus `tail` |
| `voice.provider` | `edge` (free, default; English and Hebrew), `kokoro` (free, offline, English), `elevenlabs` (optional, paid: also `voice`, `model`, `settings`, `seed`), `file` (a voice that already exists) or `none`. `voice.lang`: `en` or `he` |
| `voice.style` | delivery tag for v3 models (`"[excited]"`); not read aloud |
| `music.offset` | skips the first seconds of the track (long intro) |
| `cut.on` | `phrase`: the scene opens `lead` seconds before the speech. `beat`: the cut lands on the previous beat and the speech comes in after |
| `cut.sfx` | automatic SFX on every cut; `"cut_sfx": false` on a scene turns it off for that one |
| `scenes[].say` | the scene's phrases. `text` is what appears on screen; `speak` is the spelling that teaches the pronunciation |
| `say[].pause` | silence before the phrase (default 0.35 s). `at` sets the absolute second at which it starts |
| `say[].closed` | end of block: the voice closes the phrase instead of carrying the intonation into the next one |
| `scenes[].dur` or `beats` | duration of a scene without speech, in seconds or in beats of the track |
| `scenes[].hold` | seconds of rest after the scene's last line (default 0.3) |

## Cues (`cues`)

A cue is a name for an instant. The value is an expression resolved within the scene:

| Expression | Instant |
|---|---|
| `word:register` | start of the word in the scene's speech. `word:voice#2` is the second occurrence |
| `word:register.end+0.1` | end of the word, plus 0.1 s. The `.end` suffix and the offset work for all of them |
| `phrase:2` | start of the scene's second phrase |
| `scene`, `scene.end-0.5` | start and end of the scene |
| `beat:3` | third beat of the track from the start of the scene |
| `cue:register+0.4` | another cue already defined, plus an offset |
| `t:12.5` | absolute second of the video |
| `1.2` (number) | seconds from the start of the scene |

Names are global and land on the exact frame. The SFX points to the cue (`"at": "register"`) or to an expression: image and sound come from the same number.

## In the scenes

```tsx
import {Scene, useScene, WORDS} from '../lib/score';

const Hook: React.FC = () => {
	const {frame, len, at, since} = useScene('hook');
	const enter = pop(frame, 30, at('register'));         // starts when the voice says "register"
	const exit = tween(frame, len - 10, 10, 0, 1, ease.exit);
	...
};
// in the composition:  <Scene id="hook"><Hook /></Scene>
```

`useScene(id)` returns the local `frame`, `len`, `at('cue', offsetInFrames)`, `sec(absoluteSecond)`, `since('cue')` and `words` (the words spoken in the scene). `WORDS` has all of them, in absolute time, for `<KineticWords>` and for the `<Captions>` block.

## A voice that already exists (recorded, from another model, or the speech in footage)

1. Per-word timing: `align.py voz.wav roteiro.txt`, or `align.py filmagem.mp4 --transcribe -o public/audio/fala` when there's no script. Read the `.txt`, fix the spelling and run again with it as the script.
2. In the script: `"voice": {"provider": "file", "file": "audio/fala.wav", "start": 0}`. The `say` phrases must match what was said word for word; the script flags the first one that doesn't match.
3. Phrase timings are fixed (the speech already exists). Cues, cuts and SFX work the same.

## No voice

`"voice": {"provider": "none"}` and scenes with `dur` or `beats`. With `cut.on: "beat"` the cuts land on the track's grid: run `beats.py` first; it writes `<track>.beats.json` next to the file.

## Limits

- `score.py` generates voice with edge, Kokoro and ElevenLabs. Any other provider: generate the WAV, align it (`align.py`) and use `provider: file`.
- With `provider: file` there's no adjustable pause: the audio is what was recorded.
- The clipped-speech check (clean ends, gap in the middle, spoken text equal to written) was calibrated on a single language with two ElevenLabs models. In the video's language (English or Hebrew), listen to `mix.wav` before animating.
