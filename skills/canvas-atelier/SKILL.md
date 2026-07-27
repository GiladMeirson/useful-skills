---
name: canvas-atelier
description: Achieve photorealistic, gallery-quality drawing and animation on HTML canvas — construction-based shape building, physically-based lighting and shadow, organic bezier curves instead of geometric primitives, procedural texture/noise, and animation-principle-driven motion (easing, squash-and-stretch, follow-through, secondary motion). Use this skill whenever the user asks to draw, illustrate, render, sketch, or animate anything on an HTML canvas element or in a canvas-based artifact, or wants a canvas drawing to look "realistic," "lifelike," "polished," or "professional" — even if they don't use art terminology or explicitly mention this skill. Also use for canvas games, generative art, particle effects, or any visual illustration requiring fine detail.
---

# Canvas Atelier

Most canvas drawings look like clip art — not because the code is wrong, but because they skip straight from "idea" to "final flat shapes." A trained illustrator never draws final lines first: the process happens in stages, and each stage catches mistakes the next stage would otherwise bake in permanently. This skill encodes that process for canvas work.

The temptation under time pressure is to jump straight to final render. Resist it — a rushed block-in-to-final-render is exactly what produces the flat, symmetric, sterile look that gives canvas art away at a glance. Every stage below is cheap; skipping stages is what's expensive.

## Setup — before the first stroke

A canvas sized only in CSS pixels renders at one device pixel per CSS pixel and gets upscaled by the browser — the single most common reason a piece looks soft no matter how careful the shading is, and it's invisible in the source until you actually look at the rendered output. Size the canvas for the display's real pixel density first, using `scripts/canvas-setup.js`:

```js
const ctx = setupHiDPICanvas(canvas, 800, 600); // logical size; draw as if it were exactly this
```

## Workflow

### 1. Composition and intent — decide what this is about before drawing it
Before any block-in, capture the single line of energy the piece is built around — the line of action through a figure's pose, the sweep of a wave, the lean of a tree in wind — the way a painter's first mark on the page is a loose gesture, not a careful outline. A geometrically accurate block-in with no gesture underneath it reads as static no matter how correct the proportions are; get the energy right first and let the next stage preserve it instead of averaging it away.

Also decide, before placing a single shape, what the one thing in this piece is that the eye should land on first. Every later decision — where detail concentrates, where contrast peaks, where the sharpest edges live — should serve that answer. See `references/composition.md` for the concrete techniques: selective fidelity (real paintings don't render everything with equal care), off-center placement, atmospheric depth for multi-element scenes, and negative space.

### 2. Block-in — proportions before detail
Before drawing anything final, lay out the composition with simple primitives (circles, ovals, rectangles) at low opacity to check size, position, and proportion of every element relative to the canvas and to each other. Squint-test the silhouette here: does the overall shape read correctly at a glance? Fix proportion problems now — they compound painfully if caught later.

For structured/man-made subjects (buildings, vehicles, furniture), lock in perspective and vanishing points at this stage too, before any detail — see `references/precision-and-form.md`. Also decide the value structure (dark/mid/light masses) before committing to hue; getting value right matters more than getting color right, and is much harder to fix after the fact.

### 3. Organic contour — kill the primitives
Replace every straight line and perfect circle/ellipse from the block-in with bezier or quadratic curves. Real edges are almost never perfectly symmetric or perfectly circular. See `references/organic-curves.md` for concrete techniques: asymmetric control-point offsets, deliberate variation between "matching" features (e.g. left vs. right eye), and how much irregularity reads as natural rather than sloppy.

### 4. Light and shadow
Pick ONE dominant light direction before drawing any shading, and make every highlight, core shadow, and cast shadow agree with it. Use graduated, multi-stop gradients — never flat fills or a single hard light/dark split. See `references/lighting-and-shading.md` for the core-shadow / cast-shadow / ambient-occlusion / rim-light model, plus ready gradient code. The single most common mistake to avoid: shading with black instead of a darker, desaturated version of the local hue.

Two refinements that separate good from great here: the shadow's warm/cool shift should be derived from the light source's own temperature, not a fixed constant, and saturation should peak at the core-shadow transition rather than at the highlight or the deepest shadow — see `references/color-theory.md`. Also vary edge weight itself: edges in light against a light background (or in shadow against a dark background) should soften or disappear, while edges at strong value contrast stay crisp — see the lost-and-found-edges technique in `references/precision-and-form.md`.

### 5. Texture and imperfection
A perfectly smooth gradient still reads as fake. Add a subtle noise layer (`scripts/noise.js`) to break up flat gradients, plus small local color variation and pinpoint specular highlights. Imperfection here is a controlled, deliberate amount, not randomness for its own sake — too much noise looks dirty, too little looks plastic.

**Gotcha confirmed by testing**: if the shape you're texturing is defined by a clip path (e.g. an irregular silhouette, not a plain rectangle), do NOT apply noise with `ctx.getImageData()` + `ctx.putImageData()` directly on the main canvas — `putImageData` ignores the active clip region entirely and will paint noise outside the intended silhouette. Build the noise on a separate offscreen canvas instead, then composite it back with `ctx.drawImage()`, which does respect clipping.

### 6. Animation — if motion is involved
Never drive motion with a linear time function. Load `scripts/easing.js` and pick the curve that matches the motion's physical character (elastic for bouncy, cubic ease-out for settling into place, spring for interactive response to input). Then apply classic animation principles adapted for canvas — see `references/animation-principles.md`: squash-and-stretch, anticipation before the main action, motion along arcs (almost nothing in nature moves in a straight line), and follow-through / secondary motion (loose elements keep moving briefly after the main mass stops).

The above is for single-point motion. For anything made of *connected* points that must move as one physically coherent system — cloth, hair, rope, chains, a flag — a single eased curve per point looks disconnected. Use the Verlet-integration approach in `references/physics-motion.md` and `scripts/verlet.js` instead, and shade the result using the fold-curvature technique described there so the mesh reads as lit fabric rather than a moving wireframe.

### 7. Polish and performance
Separate static and moving content onto different canvas layers, or redraw only the region that changed, instead of redrawing the entire scene every frame. Drive all animation with `requestAnimationFrame` using delta-time (time elapsed since the last frame) rather than a fixed per-frame increment, so motion speed stays consistent regardless of frame rate.

### 8. Critique — look before calling it done
Everything above describes how to write code that *should* produce a good result. It doesn't confirm that it did — gradient math, compositing order, and clip regions are all easy to get subtly wrong in ways that only show up in rendered pixels, never in the source. Render the canvas to an actual image (a headless-browser screenshot, a `node-canvas` PNG export, or the artifact/browser preview) and look at it the way an art director critiques a painting, not the way a linter checks syntax.

Check the rendered image against this, not the code:

| Ask | If the answer is no |
|---|---|
| Does the silhouette read correctly at a glance, before any color or detail? | Back to stage 2 (block-in) — shading can't fix a proportion problem |
| Is there one place the eye lands first, with everything else deferring to it? | Redistribute contrast/detail/saturation per `references/composition.md` |
| Do all shadows agree with a single light direction? | Recheck stage 4 — one inconsistent shadow breaks the whole illusion |
| Does anything look "traced with a compass" — too smooth, too symmetric? | Back to stage 3, or add noise per stage 5 |
| If it moves, does the motion carry weight and intention, or does it read as `x += n`? | Recheck easing/arcs/anticipation in stage 6 |
| Would this pass as a photo or painting for half a second, or does it register as a render immediately? | That gut reaction is the real test — trace the failure back to whichever stage skipped a step |

Treat this as a loop, not a final checkbox: if something fails, go back to the relevant stage, redo it, then re-render and check again. A rushed pass through stages 1-7 that skips this step is the same mistake the introduction warns against, just deferred to the end instead of the beginning.

## Quick reference — do this, not that

| Instead of | Do |
|---|---|
| Flat single-color fill | Multi-stop gradient along the light direction |
| Pure black shadow | Darker, desaturated version of the local hue |
| Perfect circle / straight line | Bezier curve with slight, intentional asymmetry |
| Linear animation (`progress += 1` per frame) | Eased, delta-time-based motion from `scripts/easing.js` |
| Straight-line motion | Motion along an arc |
| Redrawing everything every frame | Layered canvases or dirty-rect updates |
| Uniform outline around the whole silhouette | Lost/found edges — soften in low contrast, crisp at the terminator |
| Fixed cool shadow regardless of light color | Shadow temperature derived from the light source's own temperature |
| Most saturated color at the highlight/deepest shadow | Peak saturation at the core-shadow transition |
| Per-point eased motion for connected systems (cloth/hair/rope) | Verlet integration + distance constraints from `scripts/verlet.js` |
| Equal detail/contrast across the whole canvas | Concentrate fidelity at the focal point, let the periphery simplify |
| Finishing without ever looking at the rendered pixels | Render, look, and critique against a checklist — code correctness isn't visual correctness |

## When to open the reference files

- Composing a full scene, deciding where the focal point is, or making multi-element depth (foreground/midground/background) read correctly → `references/composition.md`
- Shading a specific material (skin, metal, glass, cloth, fur) or getting a light/shadow relationship right → `references/lighting-and-shading.md`
- Drawing organic shapes (faces, animals, plants, clouds, water) that keep coming out too geometric → `references/organic-curves.md`
- Any animation, especially anything that should feel alive rather than mechanical → `references/animation-principles.md`
- Anything made of connected points that should move as one physical system — cloth, hair, rope, a flag → `references/physics-motion.md` + `scripts/verlet.js`
- Perspective/vanishing-point subjects, or feedback that a piece "looks flat" despite good color, or a silhouette needs believable edge variation → `references/precision-and-form.md`
- Getting warm/cool shadow relationships, color saturation, or how nearby objects should tint each other right → `references/color-theory.md`

This workflow scales down fine — even a 30-second gesture sketch or a one-shot animation benefits from a single light source and one eased curve — it just doesn't scale down to zero. Skip a stage only when the user explicitly asks for something quick/rough/schematic, not by default.
