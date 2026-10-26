# Block library (`src/blocks/`)

Ready-made blocks for building scenes. Reach for a block before writing a new component: they already follow the doctrine (entrance by mask, stroke, scale or position, stagger of up to 500 ms, exit shorter than entrance, color only from the theme, sizes in `u`). Import from `../blocks`. The `Blocks` composition (`src/scenes/BlocksDemo.tsx`) shows all of them in sequence: `npx remotion still Blocks out/b.png --frame=46`.

## I need X, use Y

| I need to | Use |
|---|---|
| Compare values across categories | `BarChart` |
| Show change over time | `LineChart` |
| Show a part of a whole or a goal | `Donut` |
| Give weight to a single number | `StatCounter` |
| Show an app or website screen | `DeviceFrame` |
| Identify who is speaking | `LowerThird` |
| Caption the narration | `Captions` |
| Show code or a command being typed | `CodeWindow` |
| Demonstrate a click in the interface | `Cursor` |
| Point out a detail of an image or screen | `Callout` |
| List benefits or completed tasks | `Checklist` |
| Testimonial or someone's quote | `QuoteCard` |
| Open or close with the brand | `LogoSting` |
| Background texture or transition band | `Marquee` |
| Explain a process in steps | `Steps` |

## Rules that apply to all

- **Timing**: `at` is the local frame where the block starts entering (default 0). `out` is the frame by which it has finished exiting; the exit starts `EXIT` frames earlier (12 at 30 fps). Without `out` the block stays until the end of the scene. `ease.exit` concentrates the motion in the last frames: for the whole exit to show before the cut, use `out={len - 2}`.
- **Position**: content blocks (`BarChart`, `LineChart`, `Donut`, `StatCounter`, `DeviceFrame`, `CodeWindow`, `Checklist`, `QuoteCard`, `LogoSting`, `Steps`) have their own size and sit wherever the scene puts them: wrap them in a positioned `div` inside `text` (safe area from `useFormat()`). Overlay blocks (`LowerThird`, `Captions`, `Cursor`, `Callout`, `Marquee`) cover the whole frame and position themselves.
- **Size**: `width` and `height` are real px (compute with `text.w`, `u` or `pick`). `size` and `fontSize` are px of the 1080 frame and the block multiplies them by `u`.
- **Color**: everything comes from `C` in `theme.ts`. The `color` and `accent` props accept another theme color; do not pass loose hex.
- **Data**: the examples below use neutral labels. In the scene, only user data or sourced data.
- **One action at a time**: put one hero block per scene. Two blocks entering together need `at` offset by 4 to 8 frames.
- Utilities exported for scenes that need the same behavior: `useBlock(at, out)`, `Rise` (mask rise), `trim(p)` (trim path), `surface(p, u)`, `mix`, `alpha`, `wrap`, `EXIT`.

## BarChart

Bars that grow from the baseline in a stagger, with a label below and a counting value above.
When to use: comparing 3 to 7 categories, with one of them highlighted.

| Prop | Type | Default |
|---|---|---|
| `data` | `{label: string; value: number}[]` | required |
| `highlight` | `number` (index) | the bar with the highest value |
| `width`, `height` | `number` | `text.w` and the smaller of `text.h` and 56% of the width |
| `max` | `number` | highest value |
| `format` | `(v: number) => string` | `toLocaleString(LOCALE)` |
| `color`, `accent` | `string` | theme neutral and `C.accent` |
| `at`, `out` | `number` | `0` and no exit |

```tsx
<BarChart
	at={6}
	out={len - 2}
	width={text.w * 0.74}
	data={[{label: 'Series A', value: 24}, {label: 'Series B', value: 38}, {label: 'Series C', value: 52}]}
/>
```

## LineChart

A line that draws itself by trim path, with a dot traveling at the tip and the final value on arrival; a subtle four-line grid.
When to use: a trend over time, 4 to 12 points. The scale starts at zero unless you pass `min`.

| Prop | Type | Default |
|---|---|---|
| `points` | `number[]` | required |
| `labels` | `string[]` (x axis, end to end) | no labels |
| `width`, `height` | `number` | as in `BarChart` |
| `min`, `max` | `number` | `0` (or the lowest value, if negative) and the highest value |
| `format` | `(v: number) => string` | `toLocaleString(LOCALE)` |
| `color` | `string` | `C.accent` |
| `area` | `boolean` | `true` |
| `at`, `out` | `number` | `0` and no exit |

```tsx
<LineChart at={6} out={len - 2} points={[12, 18, 15, 27, 24, 36, 48]} labels={['Start', 'End']} />
```

## Donut

A progress ring with the number counting in the center.
When to use: a single percentage or goal. To compare several slices, use `BarChart`.

| Prop | Type | Default |
|---|---|---|
| `value` | `number` | required |
| `max` | `number` | `100` |
| `suffix` | `string` | `'%'` |
| `label` | `string` | no label |
| `size` | `number` (diameter, times `u`) | `440` |
| `thickness` | `number` (times `u`) | 8.5% of the diameter |
| `color` | `string` | `C.accent` |
| `at`, `out` | `number` | `0` and no exit |

```tsx
<Donut value={72} label="Sample goal" at={6} out={len - 2} />
```

## StatCounter

A hero number that counts with `ticker` and `tabular-nums`, with prefix, suffix and label. The width of the final value is reserved, so nothing jitters while counting.
When to use: the scene's main data point. Leave the value still for 1 s or more after it arrives.

| Prop | Type | Default |
|---|---|---|
| `value` | `number` | required |
| `from` | `number` | `0` |
| `prefix`, `suffix` | `string` | none |
| `label` | `string` | none |
| `decimals` | `number` | `0` |
| `size` | `number` (number height, times `u`) | `240` |
| `align` | `'left' \| 'center' \| 'right'` | `'left'` |
| `count` | `number` (count frames at 30 fps) | `34` |
| `color`, `accent` | `string` | `C.ink` and `C.accent` (suffix) |
| `at`, `out` | `number` | `0` and no exit |

```tsx
<StatCounter value={1280} suffix="+" label="Demo value" at={6} out={len - 2} />
```

## DeviceFrame

A phone or browser-window frame; the children are the screen.
When to use: product demo, screen recording or UI recreated in React. The children fill the screen with `position: absolute; inset: 0` and animate on their own.

| Prop | Type | Default |
|---|---|---|
| `variant` | `'phone' \| 'browser'` | `'phone'` |
| `children` | `ReactNode` | empty screen |
| `width` | `number` | whatever fits in the safe area |
| `url` | `string` (browser only) | `'exemplo.com.br'` |
| `ratio` | `number` (browser screen height over width) | `0.6` |
| `screen` | `string` (screen background color) | theme neutral |
| `at`, `out` | `number` | `0` and no exit |

```tsx
<DeviceFrame variant="browser" width={text.w * 0.62} url="example.com" at={6} out={len - 2}>
	<MinhaTela />
</DeviceFrame>
```

The phone has a 1 to 2.08 aspect ratio. The island at the top takes a band of 12% of the device width: keep that space clear in the content.

## LowerThird

Name and title in the bottom corner of the safe area: the accent bar grows and the two lines rise by mask.
When to use: identifying who is speaking in recorded video or a testimonial. Over a light image, turn on `plate`.

| Prop | Type | Default |
|---|---|---|
| `name` | `string` | required |
| `role` | `string` | none |
| `side` | `'left' \| 'right'` | `'left'` |
| `plate` | `boolean` | `false` |
| `accent` | `string` | `C.accent` |
| `at`, `out` | `number` | `0` and no exit |

```tsx
<LowerThird name="First Last" role="Sample title" at={12} out={102} />
```

Reading time: 1.5 s plus 0.3 s per word between `at` and `out`.

## Captions

Paged captions, up to 2 lines inside the text safe area, with the spoken word in the accent.
When to use: all narration in vertical video, and whenever the video has to work without sound. For large kinetic typography, use `KineticWords`.

| Prop | Type | Default |
|---|---|---|
| `words` | `{word: string; start: number; end: number}[]` in absolute seconds | required |
| `offsetSec` | `number` | `0` |
| `maxChars` | `number` (cap per line) | `36` |
| `fontSize` | `number` (times `u`) | `56` |
| `position` | `'bottom' \| 'center' \| 'top'` | `'bottom'` |
| `color`, `accent` | `string` | `C.ink` and `C.accent` |
| `plate` | `string` (color of the strip behind each line; use over filmed video) | no strip |

```tsx
<Captions words={WORDS} />                       // WORDS from lib/score is already in absolute time
<Captions words={WORDS} plate={C.bg} />         // over footage
```

- A page closes at the end of a sentence, at a pause above 0.6 s, or when it fills up; a full page closes at the last comma.
- The characters per line drop automatically when the safe width is small (9:16), so the line never exceeds 80% of the frame.
- Mount at the root level, like `KineticWords`. Inside a `<Sequence from>`, `offsetSec` is the narration start minus the sequence start, in seconds.
- It has no `at` or `out`: the word timing is in charge.

## CodeWindow

A code or terminal window with frame-derived per-character typing, a cursor that blinks per frame, and simple highlighting.
When to use: showing a command, an API snippet or an install. Up to 6 lines of 40 characters; the font shrinks so the longest line fits.

| Prop | Type | Default |
|---|---|---|
| `code` | `string` (lines separated by `\n`) | required |
| `variant` | `'code' \| 'terminal'` | `'code'` |
| `title` | `string` | `'exemplo.ts'` or `'terminal'` |
| `cps` | `number` (characters per second) | `32` |
| `prompt` | `string` (terminal only) | `'$ '` |
| `width` | `number` | the smaller of `text.w` and `1100 * u` |
| `fontSize` | `number` (times `u`) | `30` |
| `at`, `out` | `number` | `0` and no exit |

```tsx
<CodeWindow
	variant="terminal"
	code={'$ npm install\npackages installed\n$ npm run render'}
	at={6}
	out={len - 2}
/>
```

- In the terminal, only lines starting with `prompt` are typed; the others are output and appear whole.
- Typing starts 12 frames after `at` and each typed line costs `characters / cps` seconds plus 5 frames. Add up the lines before settling the scene duration.
- Highlighting: keyword in the accent, string and number in `C.second`, comment in `C.muted`. It is not a parser: it is meant for short snippets.

## Cursor

A demo cursor that travels in an arc between points, pauses, and clicks with scale and ripple.
When to use: showing interaction in recreated UI or on a screen inside `DeviceFrame`.

| Prop | Type | Default |
|---|---|---|
| `path` | `{x: number; y: number; at: number; click?: boolean}[]` | required |
| `size` | `number` (arrow height, times `u`) | `52` |
| `color` | `string` | `C.ink` |
| `out` | `number` | no exit |

```tsx
<Cursor
	out={len - 2}
	path={[
		{x: width * 0.8, y: height * 0.8, at: 12},
		{x: botao.x, y: botao.y, at: 40, click: true},
	]}
/>
```

- `x` and `y` are frame px. `at` is the event frame: the arrival or, with `click`, the click (the cursor arrives `CLICK_PAUSE` = 5 frames earlier and waits).
- The first point is where the cursor appears. The trip lasts 10 to 26 frames depending on distance; leave at least that interval between two `at`s.
- The interface responds 1 frame after the click: `pop(frame, fps, clickAt + 1, springs.snappy)`. The `click` SFX goes on the same frame as the `at`.

## Callout

A label with a leader line: a dot marks the target, the line draws to the elbow and continues under the text.
When to use: naming a part of an image, a chart or a screen. At most two per scene, with offset `at`.

| Prop | Type | Default |
|---|---|---|
| `from` | `{x: number; y: number}` (target, frame px) | required |
| `to` | `{x: number; y: number}` (elbow, frame px) | required |
| `label` | `string` | required |
| `detail` | `string` | none |
| `width` | `number` (horizontal segment) | `380 * u` |
| `color`, `accent` | `string` | `C.ink` and `C.accent` |
| `at`, `out` | `number` | `0` and no exit |

```tsx
<Callout from={{x: 620, y: 480}} to={{x: 760, y: 340}} label="Point of interest" detail="One-line detail" at={14} out={len - 2} />
```

The text opens toward the side opposite the target: with `to.x` smaller than `from.x` it right-aligns. Check that `to.x` plus `width` stays inside `text`.

## Checklist

Staggered items; once all have arrived, each one's check draws itself by stroke, one by one.
When to use: benefits, requirements, what is included. 3 to 5 items of up to 30 characters.

| Prop | Type | Default |
|---|---|---|
| `items` | `string[]` | required |
| `done` | `number` (how many get a check, from the first on) | all |
| `width` | `number` | the smaller of `text.w` and `900 * u` |
| `fontSize` | `number` (times `u`) | `44` |
| `accent` | `string` | `C.accent` |
| `at`, `out` | `number` | `0` and no exit |

```tsx
<Checklist items={['First item', 'Second item', 'Third item']} at={6} out={len - 2} />
```

## QuoteCard

A typographic quote: quotation marks in the accent, text revealed line by line and, last, a dash and the author.
When to use: testimonial or high-impact statement. Only with a quote and author supplied by the user.

| Prop | Type | Default |
|---|---|---|
| `quote` | `string \| string[]` (running text or ready-made lines) | required |
| `author`, `role` | `string` | none |
| `width` | `number` | `text.w` |
| `maxChars` | `number` (per line) | `30`, or `22` in 9:16 |
| `fontSize` | `number` (times `u`) | `64` |
| `accent` | `string` | `C.accent` |
| `at`, `out` | `number` | `0` and no exit |

```tsx
<QuoteCard
	quote="A sample sentence fills this space across two or three lines."
	author="Person's name"
	role="Sample title"
	width={text.w * 0.72}
	at={6}
/>
```

The font shrinks so the longest line fits in `width`. Up to 4 lines; more than that leaves no time to read.

## LogoSting

A brand signature in four phases within `length`: build (a line in the accent draws itself, 45%), resolve (the brand rises from behind the line, which retracts into an underline), hold, and sign-off (the `tagline` enters at 80%).
When to use: closing the video. Never at the opening.

| Prop | Type | Default |
|---|---|---|
| `text` | `string` | none |
| `children` | `ReactNode` (SVG or `Img` logo, in place of `text`) | none |
| `tagline` | `string` | none |
| `length` | `number` (frames of the four phases) | `72` |
| `size` | `number` (times `u`) | `148` |
| `color`, `accent` | `string` | `C.ink` and `C.accent` |
| `at`, `out` | `number` | `0` and no exit |

```tsx
<LogoSting text="Brand" tagline="Brand tagline" length={72} at={6} />
```

The audio impact lands on frame `at + length * 0.45`. Hold the final frame for 1 s or more. For the real logo, pass the file as a child; do not redraw a brand the user did not supply.

## Marquee

A seamlessly looping text band, for background or transition.
When to use: texture behind a hero (`outline`), a band that crosses the frame at a scene change (`band`). It is ornament: it carries no information that needs to be read.

| Prop | Type | Default |
|---|---|---|
| `items` | `string[]` | required |
| `variant` | `'outline' \| 'solid' \| 'band'` | `'outline'` |
| `period` | `number` (frames to travel one repetition of the text) | `150` |
| `direction` | `1 \| -1` | `1` (to the left) |
| `y` | `number` (center, px from the top) | middle of the frame |
| `rotate` | `number` (degrees) | `0` |
| `fontSize` | `number` (times `u`) | `148` |
| `fill` | `string` (inside the letters in `outline`) | `C.bg` |
| `color`, `accent` | `string` | depending on the variant, and `C.accent` |
| `at`, `out` | `number` | `0` and no exit |

```tsx
<Marquee items={['Looping text', 'Seamless']} period={90} y={height * 0.44} at={6} out={len - 2} />
<Marquee items={['Transition band']} variant="band" direction={-1} rotate={-3} fontSize={72} y={height * 0.62} />
```

- Frame `at + period` is identical to `at`: for looping video, use a period that divides the duration.
- In `outline` the letters are filled with `fill`, which must be the background color behind the band.
- The band bleeds off the frame and carries `data-decor`, so the layout probe does not measure it.

## Steps

A timeline of 3 to 5 steps: the track draws itself, the nodes enter in a stagger, and the accent advances to the active step.
When to use: explaining a process or showing which stage the story is at. In a row in 16:9 and 1:1, in a column in 9:16.

| Prop | Type | Default |
|---|---|---|
| `steps` | `{title: string; detail?: string}[]` | required |
| `active` | `number` (index, 0 is the first) | `0` |
| `direction` | `'row' \| 'column'` | by format |
| `width` | `number` | `text.w` |
| `accent` | `string` | `C.accent` |
| `at`, `out` | `number` | `0` and no exit |

```tsx
<Steps
	active={1}
	at={6}
	steps={[{title: 'Briefing', detail: 'Goal and format'}, {title: 'Script'}, {title: 'Delivery'}]}
/>
```

In a row, titles of up to 12 characters with 5 steps. To advance the step over the course of the video, mount one `Steps` per scene with a different `active`.

## Known limits

- The blocks estimate text width by character count (`Captions`, `QuoteCard`, `CodeWindow`, `Marquee`), calibrated for Inter and JetBrains Mono. If you change the font in `theme.ts`, render a still of each block used and check it.
- `Cursor` and `Callout` take frame px: recompute the points per format with `useFormat()`.
- No block plays audio. SFX and narration stay in the score.
