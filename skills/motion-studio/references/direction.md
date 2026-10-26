# Direction: how a studio decides before animating

Good motion is good design that moves with a reason. This reference covers the decisions that come before the code and the signals that give away amateur or generated work.

## The direction contract (`direction.json`)

Forbidding what looks generated isn't enough: take away the purple gradient and the agent converges on the same old video, with a card that slides in every scene and the same title with a spring. What separates a piece from a template is what it declares before it exists. That's why the direction becomes a file, and `lint.py` fails a project without it.

1. **Directions**: write 2 to 3 directions that disagree with each other (not three tones of the same layout). Change at least two of these: grid, type scale, figure-ground relationship, dominant type of motion, use of the accent.
2. **A styleframe for each**: a single frame, the hero frame. Build each direction as a provisional scene and render it with `stills.cjs --times`. Combine them: `contact_sheet.py --images out/dir/A.png,out/dir/B.png,out/dir/C.png --labels A,B,C -o out/directions.png`.
3. **The user chooses**: show the sheet, say in one line what each direction bets on, and wait. If the request explicitly delegated the choice ("you choose", "do as you see fit", an autonomous request), choose, write `"approved_by": "agent"` and say so in the delivery. The lint warns.
4. **Write the contract**:

```json
{
 "concept": "The register that closes itself: a whole day of sales becomes one number.",
 "law": "Light paper, black ink, one money green. Green only appears on money that came in.",
 "motif": "The printer tape: it runs through every scene, but in each scene it's something else (timeline, chart, receipt).",
 "options": [{"name": "A", "idea": "..."}, {"name": "B", "idea": "..."}],
 "chosen": "B",
 "approved_by": "user",
 "scenes": [
  {"id": "hook", "layout": "giant number bleeding off the right", "entrance": "smash cut", "hero": "the day's total"},
  {"id": "how", "layout": "three columns", "entrance": "tape unrolling", "hero": "the tape"},
  {"id": "closing", "layout": "small logo in an empty frame", "entrance": "iris from the total", "hero": "the brand"}
 ]
}
```

- `law` is the visual law: what each color and each type of motion means in this piece. If a scene breaks the law, the scene is wrong.
- `motif` is the element that returns. It changes role in each scene. A motif that becomes the same frame in every scene is a brand slide.
- Each scene declares `layout`, `entrance` and `hero`. The lint fails a piece in which all scenes have the same layout or the same entrance and warns when neighboring scenes repeat the pair. After rendering the stills, `layout.py --timeline` measures the real similarity between scenes and warns when they share the same backbone, no matter what the contract says.

## Production order

1. **Styleframes**: once the direction is chosen, 3 to 5 static frames (opening, one per main idea, closing). Render them with `stills.cjs --times` and look. Each one has to work as a poster: hierarchy, one accent color, breathing room. If the still frame is weak, animating won't save it.
2. **Animatic**: the scenes as static blocks, already with the score's duration and the audio. Run `lint.py` here: this is when rhythm is still cheap to change.
3. **Animation**: primary motion of each scene, then secondary, then ambient.
4. **Polish**: curves, holds, SFX on impact points, grain. Only after the animatic passes.

## Beat structure

| Format | Structure |
|---|---|
| Short vertical (up to 30 s) | hook at 0 to 2 s, proof at 2 to 20 s, a relevant visual change every 2 to 4 s, closing with a call to action at 3 to 5 s; the last frame joins the first if the piece is a loop |
| Explainer (30 to 90 s) | problem, turn, how it works in up to 3 steps, result, call to action |
| Product or launch | one promise, 3 features with one hero frame each, brand and call to action |
| Logo sting (2 to 5 s) | build, resolve on the audio impact, hold, sign-off |

- **Hook**: at frame 0 something is already moving and the promise is legible within 2 s. No fade from black and no logo at the opening.
- **Rhythm contrast**: alternate fast and slow. Use at least two duration classes in the piece (for example 8 and 24 frames) and let the slowest scene last about 3x the fastest.
- **Hold**: after each arrival, 12 to 24 frames in which only the ambient moves. The hold is where the person reads.

## Working without sound

Assume part of the audience watches on their phone with the sound off. Rules:

- The whole message is understood muted. Each narrated phrase that carries information has a keyword or number on screen.
- Text with reading time (the 1.5 s plus 0.3 s per word rule from SKILL.md).
- If the user chose no voice, the typography is the narration: write the on-screen text as a script, one idea per scene.

## Sound as structure

- Mark the audio's impact points before animating: phrase start, strong beat (`beats.py`), climax. The arrival keyframe lands on them.
- SFX on the frame of contact or 1 frame before; a whoosh starts 0.25 s before the cut.
- One SFX per meaningful event. `lint.py` flags two events less than 0.12 s apart.
- Silence of 2 to 4 frames before a smash cut increases the impact.

## Signs of amateur or generated work, with a test

| Signal | How to detect |
|---|---|
| Linear or default curve on everything | `lint.py` warns on each `interpolate(frame, ...)` without `easing` and each curve created outside the tokens |
| Everything enters with a fade and rises | `lint.py` compares uses of `opacity` with transform, mask and stroke |
| Everything enters on the same frame | more than 3 elements with the same start frame and no cascade |
| Everything ends on the same frame | no 1 to 3 frame overlap between the endings |
| Same duration on everything | fewer than 3 distinct durations in the scenes; `lint.py` warns on scenes of the same duration |
| Same composition in every scene | `lint.py` (declared layout and entrance) and `layout.py --timeline` (similarity measured on the stills) |
| Text clipped, small, overlapping or low contrast | `layout.py` measures in the DOM and in the pixels and fails it |
| Motion without pause | `qa.py --timeline`: scene with rest below 0.25 s |
| Dead frame | `qa.py`: still stretch above 1.5 s (missing ambient) |
| Eye jumps on the cut | compare on the contact sheet the focus at the end of A with that at the start of B |
| Camera and object on the same axis | read the scene: `<Camera x>` and the child's `translateX` in the same window |
| Fast motion without blur or smear | displacement above 3% of the width per frame without `smear`, `<Echo>` or motion blur |
| Multi-cycle oscillation | `Easing.bounce` or `Easing.elastic`: `lint.py` fails it |
| Number that jitters | counter without `tabular-nums` |
| Scale always from the center | `transformOrigin` never set |
| Excess effects | aberration above 3 px, grain above 10%, glow on more than one element |
| Purple and blue gradient, frosted glass, default glow | styleframe review; there's no reliable measure |

The thresholds in this table are practice heuristics, not a standard. The automatic tests come out as warnings, and the contact sheet review is what decides.
