/* gfx — shared drawing helpers for the demos on this page.
 *
 * The shading model here is the one canvas-atelier argues for: never a flat
 * fill, never pure black in shadow, shadow hue derived from the light's own
 * temperature, and a noise layer composited (not putImageData'd) so it respects
 * the clip region.
 */
window.Gfx = (function () {
  'use strict';

  function clamp(v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); }
  function lerp(a, b, t) { return a + (b - a) * t; }

  /* Accepts "#abc", "#aabbcc" or "rgb(r,g,b)".
   *
   * Being strict here is a trap: an unparsed colour yields NaN channels, and
   * assigning an invalid string to fillStyle is silently IGNORED by canvas — the
   * previous fill stays in effect, so a whole mesh renders in whatever colour
   * happened to be set last. Nothing throws and the source looks correct.
   */
  function hexToRgb(color) {
    if (typeof color !== 'string') return { r: 0, g: 0, b: 0 };
    var m = color.match(/rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)/i);
    if (m) return { r: +m[1], g: +m[2], b: +m[3] };
    var h = color.replace('#', '');
    if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
    var r = parseInt(h.slice(0, 2), 16),
        g = parseInt(h.slice(2, 4), 16),
        b = parseInt(h.slice(4, 6), 16);
    if (isNaN(r) || isNaN(g) || isNaN(b)) return { r: 0, g: 0, b: 0 };
    return { r: r, g: g, b: b };
  }
  function rgb(r, g, b, a) {
    // clamp() passes NaN straight through, so guard here — see hexToRgb.
    r = Math.round(clamp(r, 0, 255)) || 0;
    g = Math.round(clamp(g, 0, 255)) || 0;
    b = Math.round(clamp(b, 0, 255)) || 0;
    return a == null ? 'rgb(' + r + ',' + g + ',' + b + ')' : 'rgba(' + r + ',' + g + ',' + b + ',' + a + ')';
  }
  function mixHex(a, b, t) {
    var A = hexToRgb(a), B = hexToRgb(b);
    return rgb(lerp(A.r, B.r, t), lerp(A.g, B.g, t), lerp(A.b, B.b, t));
  }

  /* Shade a base colour by lambert term.
   * Lit side warms toward the light colour; shadow side goes to a darker,
   * desaturated, cool-shifted version of the local hue — never toward black.
   */
  function shade(baseHex, lambert, opts) {
    opts = opts || {};
    var base = hexToRgb(baseHex);
    var lightTint = hexToRgb(opts.light || '#fff3d6');
    var shadowTint = hexToRgb(opts.shadow || '#2a3550');
    var ambient = opts.ambient == null ? 0.22 : opts.ambient;
    var t = clamp(lambert, 0, 1);
    var lit = t * (1 - ambient) + ambient;
    var r = base.r * lit, g = base.g * lit, b = base.b * lit;
    if (t > 0.55) {
      var w = (t - 0.55) / 0.45;
      r = lerp(r, lightTint.r, w * 0.45);
      g = lerp(g, lightTint.g, w * 0.45);
      b = lerp(b, lightTint.b, w * 0.45);
    } else {
      var c = 1 - t / 0.55;
      r = lerp(r, shadowTint.r, c * 0.4);
      g = lerp(g, shadowTint.g, c * 0.4);
      b = lerp(b, shadowTint.b, c * 0.4);
    }
    return rgb(r, g, b);
  }

  // Offscreen noise tile. Composited with drawImage so an active clip applies —
  // putImageData would ignore the clip and spray outside the silhouette.
  function noiseTile(w, h, alpha, scale) {
    scale = scale || 1;
    var c = document.createElement('canvas');
    c.width = Math.max(1, Math.floor(w / scale));
    c.height = Math.max(1, Math.floor(h / scale));
    var x = c.getContext('2d');
    var img = x.createImageData(c.width, c.height);
    for (var i = 0; i < img.data.length; i += 4) {
      var v = 128 + (Math.random() - 0.5) * 90;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
      img.data[i + 3] = Math.round(255 * alpha);
    }
    x.putImageData(img, 0, 0);
    return c;
  }

  function hiDPI(canvas, w, h) {
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    var ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return ctx;
  }

  /* Size a canvas to the pixels it actually occupies while keeping drawing code
   * in fixed world coordinates.
   *
   * A canvas authored at 900 wide but laid out at 954 CSS px gets upscaled by
   * the browser, which is the single most common reason canvas work looks soft.
   * Here the backing store matches the real box (times DPR) and the context is
   * scaled so world units still mean what the demo thinks they mean.
   */
  function fitCanvas(canvas, worldW, worldH) {
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    var cssW = canvas.getBoundingClientRect().width || worldW;
    var cssH = cssW * (worldH / worldW);
    canvas.width = Math.max(1, Math.round(cssW * dpr));
    canvas.height = Math.max(1, Math.round(cssH * dpr));
    var ctx = canvas.getContext('2d');
    var s = (cssW * dpr) / worldW;
    ctx.setTransform(s, 0, 0, s, 0, 0);
    return ctx;
  }

  var ease = {
    outCubic: function (t) { return 1 - Math.pow(1 - t, 3); },
    inOutCubic: function (t) { return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; },
    outBack: function (t) { var c = 1.70158, c3 = c + 1; return 1 + c3 * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2); },
    outElastic: function (t) {
      if (t === 0 || t === 1) return t;
      return Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * (2 * Math.PI / 3)) + 1;
    }
  };

  function roundRect(ctx, x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  return {
    clamp: clamp, lerp: lerp, hexToRgb: hexToRgb, rgb: rgb, mixHex: mixHex,
    shade: shade, noiseTile: noiseTile, hiDPI: hiDPI, fitCanvas: fitCanvas,
    ease: ease, roundRect: roundRect
  };
})();
