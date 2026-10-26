# Hebrew and RTL

Read this for every Hebrew video (`brand.json` → `"lang": "he"`).

## Setup

- `brand.json`: `"lang": "he"` and a Hebrew-capable display font: `Heebo` (default, neutral sans), `Rubik` (rounded, friendly), `Assistant` (light, editorial), `Frank Ruhl Libre` (serif, classic), `Secular One` (bold display), `Suez One` (heavy serif display). All are bundled in `src/fonts.ts`; nothing downloads at render time. Inter and JetBrains Mono have no Hebrew glyphs: theme.ts swaps to Heebo when the display font can't do Hebrew, and Heebo is always registered as fallback.
- `roteiro.json`: `"voice": {"provider": "edge", "lang": "he", "voice": "he-IL-HilaNeural"}` (or `he-IL-AvriNeural`).
- From `theme.ts`: `LANG`, `DIR` (`'rtl'`), `IS_RTL`, `textCase(upper)`, `tracking(em)`.

## Layout rules

- Put `dir={DIR}` on every element that contains text (the root `AbsoluteFill` too). Flex rows then flow right-to-left automatically, so word-by-word reveals (`KineticWords`, `Captions`) read in the right order without code changes.
- Mirror the composition, not just the text: the reading start is top-right. Left-aligned hero text becomes right-aligned; a lower third enters from the right; progress bars and timelines grow right-to-left; "next" arrows point left.
- Directional motion follows reading direction: a text push-in slides from the right; a whip pan "forward" goes leftwards.
- Do not mirror: logos, product UI screenshots, charts with numeric x axes (time still runs left-to-right in charts by convention unless the brand says otherwise), video footage, numbers.
- Numbers, Latin words, URLs and code stay LTR inside an RTL line. Wrap them in `<bdi>` or `<span dir="ltr">` when they sit at the start or end of a line, otherwise punctuation jumps to the wrong side.
- Punctuation at the end of a Hebrew sentence must appear on the LEFT end. If a period shows up on the right, a container is missing `dir="rtl"`.

## Typography rules

- Hebrew has no capitals: `textTransform: 'uppercase'` does nothing for Hebrew and breaks mixed lines; use `textCase(upper)`.
- No negative letter-spacing on Hebrew (`tracking(em)` clamps to ≥ 0); tight tracking makes letters like ו/ן/י collide.
- Hebrew glyphs read smaller than Latin at the same px: the type scale in `theme.ts` is already +6% for RTL. Minimum on-screen size 30 px on the 1080 short side.
- Weight: Hebrew headlines look best at 700-900 in Heebo/Rubik; very thin weights (100-300) break down in video compression.
- Line height 1.15-1.25 for headlines (Hebrew has no descenders except ק/ך/ן/ף/ץ, but niqqud needs room above and below if used).
- Avoid niqqud on screen except for disambiguation; it's for the voice (`lexicon.json`).
- Max 2 lines, 28-36 characters per line, ≤ 15 characters per second.
- Gershayim: use ״ and ׳ (U+05F4, U+05F3) for acronyms (צה״ל, ג׳ירפה), not straight quotes.
- Hebrew numerals don't exist in modern video copy: keep digits. Thousands separator: `1,000` (`toLocaleString('he-IL')`).
- Kinetic type: split by words, never by letters — Hebrew final forms (ך ם ן ף ץ) depend on position, and letter splits break shaping/ligatures in some fonts.

## Voice

- Free: edge-tts `he-IL-HilaNeural` / `he-IL-AvriNeural` (default). Paid: ElevenLabs `eleven_v4` (default model for Hebrew), `eleven_v4_turbo`, `eleven_v3` — never `eleven_multilingual_v2` or `flash_v2_5` (no Hebrew).
- Alignment / transcription of Hebrew audio: `align.py --lang he` uses the ivrit.ai Hebrew Whisper (`--model ivrit`) by default.
- Example script: `<skill>/examples/he-reel/roteiro.json`.

- edge-tts Hebrew is the default; it reads digits, dates and most English brand names well. Fix the rest in `lexicon.json` with niqqud (`"Claude": "קְלוֹד"`).
- Word timings from edge are real. Words with a prefix letter (ה, ו, ב, ל, מ, ש, כ) stay one word — "והאפליקציה" is a single token on screen and in timing.
- Pace: 110-140 words per minute. Hebrew words are dense; 2.0 words per second of scene is the budget.

## Mixed Hebrew + English videos

- One language per video for voice. On-screen English terms inside Hebrew lines are fine (product names); wrap them as LTR spans.
- Use a font that covers both scripts (Heebo, Rubik, Assistant) so both share x-height and weight.

## QA additions

- Check each still for: punctuation on the wrong side, numbers flipped, a reveal running in the wrong direction, Latin fallback font showing (different weight/height in the middle of a word).
- `layout.py` measures Hebrew text like any other DOM text.
