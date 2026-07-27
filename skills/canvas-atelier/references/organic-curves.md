# Organic Curves

## Why perfect shapes read as fake

`ctx.arc()` draws a mathematically perfect circle. Nothing organic — a leaf, an eye, a knuckle, a cloud, a wave — is mathematically perfect. The human eye is extremely sensitive to this specific kind of perfection; a shape can have great color and shading and still look like a sticker if the contour is a perfect primitive. Fixing this is cheap: it only requires nudging control points, not redesigning the shape.

## Bezier over arc/lineTo

Replace circles/ellipses with a closed bezier path built from 4-8 points around the desired shape, each with a small, non-uniform random offset:

```js
function organicBlob(ctx, cx, cy, baseR, points = 8, irregularity = 0.12, seed = Math.random) {
  const angleStep = (Math.PI * 2) / points;
  const pts = [];
  for (let i = 0; i < points; i++) {
    const angle = i * angleStep;
    // irregularity should stay small: 0.08-0.15 reads as "organic", 0.3+ reads as "damaged"
    const r = baseR * (1 + (seed() - 0.5) * irregularity);
    pts.push([cx + Math.cos(angle) * r, cy + Math.sin(angle) * r]);
  }
  ctx.beginPath();
  ctx.moveTo(...pts[0]);
  for (let i = 0; i < points; i++) {
    const p0 = pts[i], p1 = pts[(i + 1) % points];
    const midX = (p0[0] + p1[0]) / 2, midY = (p0[1] + p1[1]) / 2;
    ctx.quadraticCurveTo(p0[0], p0[1], midX, midY);
  }
  ctx.closePath();
}
```

Use a seeded PRNG (not `Math.random`) if the shape needs to be identical across redraws/frames — see the seed note in `bezier-utils.js`.

## Smooth curve through a set of points (Catmull-Rom → Bezier)

Useful for hand-drawn-looking paths — hair strands, mountain ridgelines, wave crests, tree branches — where you have key points but want a smooth curve through all of them rather than sharp joints from `lineTo`.

```js
// See scripts/bezier-utils.js for catmullRomToBezier(points) — converts an
// array of [x, y] points into cubic bezier control points automatically.
```

## Breaking symmetry between "matching" features

Two eyes, two wings, two wheels — drawn with identical code, they look stamped rather than grown. Vary each instance slightly:

```js
function drawPaired(ctx, drawFn, cx, cy, spacing) {
  drawFn(ctx, cx - spacing, cy, { scale: 0.98, rotation: -0.03 });
  drawFn(ctx, cx + spacing, cy, { scale: 1.02, rotation: 0.02 });
}
```

A 2-5% variation in scale/rotation/position is enough — it reads as natural, not as a mistake. Beyond ~8% it starts reading as asymmetric on purpose (which is sometimes what you want — a wilted flower, an injured wing — but confirm that's the intent).

## How much irregularity is too much

| Irregularity | Reads as |
|---|---|
| 0% (perfect primitive) | Clip art / sticker |
| 5-15% | Natural, organic |
| 15-30% | Rough, hand-drawn, sketchy |
| 30%+ | Damaged, glitchy, or abstract |

Pick the band that matches the brief. Photorealism almost always wants the 5-15% band — enough to kill the "traced with a compass" look, not enough to look sketchy.

## Line weight variation

Real contour lines (and the edges of real objects, via shading) are not constant-width. If stroking a path, vary `lineWidth` slightly along its length, or simulate pressure by drawing 2-3 overlapping passes with slightly different widths and low opacity, thicker on the shadow side of a form and thinner on the lit side.
