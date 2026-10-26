# Voice: the mandatory question, the paths, and word timings

## The question (always, before the script)

Run `python <skill>/scripts/voice.py --lang <en|he>`. It prints the question with the options filled in. Ask the user (AskUserQuestion when available, otherwise text) and wait. Don't choose for them. Skip the question only when the request already answered it ("no narration", "use my ElevenLabs key"); then confirm in one line.

| Option | What changes in the flow |
|---|---|
| No voice | No `tts.py`. Typography becomes the narration: read "Working without sound" in `references/direction.md`. Scenes come from the music beats (`beats.py`) or the on-screen text |
| Free voice (default) | edge-tts neural voices. `"voice": {"provider": "edge", "lang": "he", "voice": "he-IL-HilaNeural"}` |
| Offline voice | Kokoro-82M on CPU, English only. `"voice": {"provider": "kokoro", "lang": "en", "voice": "af_heart", "speed": 0.95}` |
| ElevenLabs | Most expressive; Hebrew through `eleven_v4`. Follow "ElevenLabs" below |
| Own recording | User's WAV/MP3 + `align.py`; in the script it is `"provider": "file"` |

Offer to listen before deciding: `uv run <skill>/scripts/voice.py --lang he --audition "<first line of the script>" -o out/voices` renders the same line in each free voice.

## Free voices (edge-tts)

- No key, no account, real word timestamps (WordBoundary events), 24 kHz. Needs internet at generation time only; the result is cached per line in `public/audio/seg`.
- Hebrew: `he-IL-HilaNeural` (female, default), `he-IL-AvriNeural` (male).
- English: `en-US-AndrewMultilingualNeural` (default), `en-US-AvaMultilingualNeural`, `en-US-BrianMultilingualNeural`, `en-US-EmmaMultilingualNeural`, `en-GB-RyanNeural`. Full list: `uv run --with edge-tts edge-tts --list-voices`.
- Speed: `"speed": 1.05` = +5%. Keep 0.95-1.1.
- It uses the Microsoft Edge read-aloud service: good for personal projects, no SLA. If it fails (offline), English falls back to Kokoro automatically; Hebrew has no offline fallback in this skill (see `assets/voices.json` → `offline_hebrew_note`).

## Kokoro (offline, English)

- `tts.py --provider kokoro --voice af_heart`. Downloads ~330 MB once to `~/.cache/motion-studio/kokoro`.
- The public ONNX model doesn't output durations, so timings come from `align.py` (faster-whisper) when available, otherwise they are estimated per clause from the pauses in the audio (`approx: true`). For kinetic typography synced word by word, prefer edge or run `align.py`.

## ElevenLabs

1. **Key**: the user creates it at https://elevenlabs.io/app/settings/api-keys with Text to Speech, Voices (Read), Sound Effects, Music and User (Read).
2. **Where to keep it**: `ELEVENLABS_API_KEY=...` in the video folder's `.env`, or once for all projects in `~/.config/motion-studio/.env` (the installer creates it). The template's `.gitignore` ignores `.env`. Never ask for the key in chat; never write it to a versioned file, command or log.
3. **Check without spending**: `uv run <skill>/scripts/eleven.py check` → plan, credits left, account voices. HTTP 401 = wrong key; 403 = missing permission or a feature your plan lacks.
4. **Voice**: `uv run <skill>/scripts/eleven.py voices --lang he` lists the account's voices (any of them speaks Hebrew on `eleven_v4`, with a native accent) and trending public-library voices for that language with preview links. A library voice must be added first: `eleven.py add-voice <public_user_id> <voice_id> --name "..."`. Play 2-3 previews to the user and let them pick.
5. **Model** (checked 2026-10-26):

| Model | Hebrew | Notes |
|---|---|---|
| `eleven_v4` | yes | flagship, default for `lang: he`; audio tags (`[warmly]`, `[whispers]`) in `voice.style` or inline; no style/speed sliders |
| `eleven_v4_turbo` | yes | faster, about half the price |
| `eleven_v3` | yes | previous generation |
| `eleven_multilingual_v2` | **no** | default for English; supports `speed` and neighbor-text continuity |
| `eleven_flash_v2_5` | **no** | cheapest, lower quality |

   `score.py` and `tts.py` refuse a non-Hebrew model for `lang: he`.
6. **Cost**: `score.py --dry` prints the characters to generate, the model and the credits left. Say both numbers and wait for a yes before `--yes`. Lines are cached by hash: changing pauses, cuts or SFX never re-spends.
7. **Generate**: `"voice": {"provider": "elevenlabs", "lang": "he", "voice": "<voice_id>"}` (+ optional `"model"`, `"settings": {"stability": 0.5, "similarity_boost": 0.8}`, `"style": "[warmly]"`) in `roteiro.json`, then `score.py --yes`. Each line is checked (spoken words equal the text, clean edges, no long gap) and regenerated up to 4 times with a new seed. For a single text: `tts.py --provider elevenlabs --voice <id> --lang he`.
8. **Plans without PCM**: the scripts ask for raw PCM and fall back to MP3 automatically.
9. **No timestamps** (a model that doesn't return alignment): timings are estimated from pauses; run `align.py` on the narration for exact ones.
10. **SFX and music** from ElevenLabs: see `references/audio.md` (`eleven_assets.py`).

## Word timings

| Source | Timings | Precision |
|---|---|---|
| edge-tts | real, per word | reference |
| ElevenLabs `with-timestamps` | real, per character | reference |
| `align.py` (faster-whisper on the WAV) | real | ~0.12 s mean error on word start; tends to run early |
| Kokoro without align | estimated per clause from pauses (`approx: true`) | fine for scene cuts, not for word-by-word type |
| OpenAI, Azure | estimated by word length (`approx: true`) | scene only; run `align.py` |

- With `align.py`, use `<KineticWords lead={0}>`: Whisper's early bias already plays the role of the 3-frame anticipation.
- `align.py` also checks the speech: `mismatch` counts words Whisper heard differently. Above 20% it warns — usually mispronunciation, swapped text or wrong language.
- Hebrew alignment uses `--lang he`, which defaults to the ivrit.ai Hebrew fine-tune of Whisper large-v3-turbo (`--model ivrit`, ~1.6 GB once, uses the NVIDIA GPU when present). English defaults to `small`; `--model turbo` for difficult audio.
- Speech in footage, no script: `align.py footage.mp4 --transcribe -o public/audio/speech --lang he` writes what was said with timings. Fix spelling in the `.txt` and align again with it.

## Pace

- Calm English: 130-160 words per minute. Hebrew: 110-140 (Hebrew words carry more syllables). `tts.py` warns above 170 (en) / 150 (he).
- Budget per scene: seconds × 2.3 words (Hebrew × 2.0). Cut text, don't speed the voice up. `lint.py` flags scenes above 2.6.
- Pauses: full stop ≈ 0.35 s, comma ≈ 0.12 s. For a longer breath, use shorter sentences.

## Normalization (automatic in `tts.py`)

- English: `$1,234.50`, `2:30pm`, `10%`, ordinals, years, thousands and decimals are expanded with `num2words`.
- Hebrew: `₪`, `$`, `%` become words (שקלים, דולר, אחוז); the neural voices read digits themselves.
- Pronunciation fixes go into `lexicon.json` in the video folder: `{"Claude": "קְלוֹד", "SaaS": "סָאס"}`. For Hebrew, write the spoken form with niqqud or phonetic spelling. Shipped lexicons: `assets/lexicon.en.json`, `assets/lexicon.he.json`.
- Check before generating: `tts.py --normalize-only "text" --lang he`. The script also lists suspicious tokens (Latin words inside Hebrew, acronyms in English).
- The screen shows the original text (`word`); the voice says the normalized form (`spoken`).

## Output

`narration.wav` and `narration.words.json`: `{text, lang, provider, voice, duration, wpm, approx, words: [{word, spoken, start, end}]}`.

## Softer prosody per provider

- edge: `speed` 0.95-1.0 and short sentences; commas create breaths.
- Kokoro: `--speed` and short sentences.
- ElevenLabs: high stability for consistency; on `eleven_v3`, tags like `[warmly]` and `[softly]`.
- Azure: `<mstts:express-as style="calm">` and `<prosody rate="-8%">` (the script builds the SSML).
- OpenAI: `--instructions "calm, warm, unhurried"`.
