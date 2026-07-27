# Precision and Form

## Value before color

Painters build in value (dark / mid / light) before committing to color, because if the value structure is wrong, no amount of nice hue choice fixes it. Practical technique: before finalizing colors, block in three value zones as flat fills — shadow-mass, mid-tone, light-mass — and squint-test them. Do the big shapes read correctly at a glance? Only once that's right should hue be applied on top, per the model in `lighting-and-shading.md`.

A literal way to enforce this while working on canvas: render to an offscreen desaturated copy and compare it side by side with the color version, to catch value mistakes hue is otherwise hiding.

```js
function valueCheck(sourceCanvas) {
  const off = document.createElement('canvas');
  off.width = sourceCanvas.width; off.height = sourceCanvas.height;
  const octx = off.getContext('2d');
  octx.filter = 'grayscale(1)';
  octx.drawImage(sourceCanvas, 0, 0);
  return off; // display alongside the color version and squint-check both
}
```

## Lost and found edges

Not every contour should have equal weight. Where an object's value nearly matches its background or its own shadow, the edge should soften or vanish entirely (a "lost" edge) and reappear elsewhere with a crisp, high-contrast line (a "found" edge). This is the single biggest tell between "outlined cartoon" and "painted realism" — a hard, uniform-weight outline around an entire silhouette is the amateur signature.

Rule of thumb: an edge in light against a light background is lost. An edge in shadow against a dark background is lost. An edge at the light/shadow terminator, or where the object meets a strongly contrasting background, is found — and gets the crispest treatment.

```js
function drawEdgeWithLostFound(ctx, points, getLocalContrast) {
  // getLocalContrast(point) => 0 (no contrast, "lost") to 1 (high contrast, "found")
  for (let i = 0; i < points.length - 1; i++) {
    const contrast = getLocalContrast(points[i]);
    ctx.globalAlpha = contrast; // fades toward invisible where contrast is low
    ctx.lineWidth = 0.5 + contrast * 2;
    ctx.beginPath();
    ctx.moveTo(...points[i]);
    ctx.lineTo(...points[i + 1]);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
}
```

## Perspective and foreshortening — structured / man-made subjects

`organic-curves.md` is about deliberate irregularity for organic subjects. Man-made and structured subjects (buildings, vehicles, furniture, boxes) need the opposite discipline: consistent, correct perspective, not organic wobble.

- Pick vanishing point(s) on a horizon line first, draw every parallel edge of the object converging toward the same point, and only then add detail. Detail added before the perspective lines are locked in is what produces subtly-wrong-looking boxes and buildings.
- Circles/wheels in perspective are ellipses, and how "open" the ellipse looks depends on the vertical distance between the circle's center and the horizon (eye level) — a wheel exactly at eye level reads as a flat line; one far above or below reads as nearly a full circle. Derive the ellipse's squash from that distance, don't pick it arbitrarily.
- Foreshortening: anything pointing toward the viewer (an arm reaching out, a road receding) compresses dramatically along the axis of travel. Draw it noticeably shorter than its "actual" length and rely on overlapping forms plus width to sell depth — length alone reads as merely short, not as coming toward the camera.

```js
// ellipse squash factor for a circle at a given screen height relative to the horizon
function perspectiveEllipseSquash(objectCenterY, horizonY, maxDistance) {
  const dist = Math.abs(objectCenterY - horizonY);
  const t = Math.min(1, dist / maxDistance);
  return 0.15 + t * 0.85; // near horizon -> nearly flat, far from horizon -> nearly circular
}
```

## Where this matters most

This level of rigor pays off most for: architectural/vehicle/product illustration (perspective discipline), any silhouette against a busy or similarly-toned background (lost/found edges), and anywhere the feedback is "it looks a little flat" despite otherwise-good color — that's almost always a value structure problem, not a color problem.
