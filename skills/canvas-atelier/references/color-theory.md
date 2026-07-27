# Color Theory

## Warm/cool contrast is relative, not absolute

`lighting-and-shading.md`'s default shadow formula cool-shifts by a fixed amount — a reasonable default, but the actually-correct rule is relative to the light source's own temperature. Simultaneous contrast means the eye exaggerates the opposite temperature in adjacent shadow: if the light is warm (sunlight, candlelight, incandescent bulbs), shadows read as cooler/bluer by contrast. If the light is already cool (overcast sky, fluorescent, moonlight), shadows shift warm instead. Always derive the shadow's temperature shift from the light's temperature, not a constant.

```js
function shadowTemperatureShift(lightIsWarm) {
  // hue to blend toward in shadow regions
  return lightIsWarm ? 220 /* cool blue */ : 30 /* warm orange */;
}
```

## Chroma peaks at the mid-tone, not the extremes

A common mistake is making the darkest shadow the most saturated color in the piece (or the highlight the most saturated). In reality, saturation is usually highest at the core-shadow *transition* zone — the terminator, where local color is least diluted by either direct light or ambient bounce — and drops toward both the highlight (diluted toward white by direct light) and the deepest shadow (diluted toward neutral dark by ambient/bounce light).

```js
function chromaProfile(t) {
  // t: 0 = highlight, 1 = deepest shadow. Returns a relative saturation multiplier.
  const peak = 0.6, spread = 0.35; // peaks around the core-shadow transition
  return Math.max(0.35, 1 - Math.pow((t - peak) / spread, 2));
}
```

Apply this as a multiplier on the saturation (`s`) value when building a gradient's HSL stops, instead of a flat or linear saturation ramp.

## Local color vs. perceived color

An object's local color (its true pigment/material hue) is never quite what reaches the eye — ambient light color always tints it, and nearby objects bounce a little of their own color onto each other. A white object in a room with warm walls picks up warm bounce light on its shadow side; a red object near a blue object subtly tints the blue object's near-facing edge slightly warm, and vice versa.

Practical technique: after finishing an object's base shading, add one subtle, low-opacity overlay pass using the dominant nearby color, restricted to the side of the object facing that neighbor (clip to that region, then fill at low alpha with `globalCompositeOperation = 'overlay'` or `'soft-light'`). This single pass does more to make objects feel like they share one scene than almost anything else.

```js
function colorBleed(ctx, clipPath, bounceColor, strength = 0.12) {
  ctx.save();
  ctx.clip(clipPath); // clip to just the near-facing region of the receiving object
  ctx.globalCompositeOperation = 'overlay';
  ctx.globalAlpha = strength;
  ctx.fillStyle = bounceColor;
  ctx.fillRect(-10000, -10000, 20000, 20000); // fill within the active clip region
  ctx.restore();
}
```

## Quick reference

| Mistake | Fix |
|---|---|
| Fixed cool shadow regardless of light color | Derive the shadow's temperature shift from the light source's own temperature |
| Most saturated color at the highlight or the deepest shadow | Peak saturation at the core-shadow transition zone |
| Every object rendered in isolation, ignoring neighbors | Add a subtle color-bleed overlay from nearby dominant colors |
| Treating local color as the final answer | Always filter local color through the scene's ambient light color |
