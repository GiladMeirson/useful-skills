// bezier-utils.js — helpers for turning rough points/primitives into smooth,
// organic curves. Pairs with references/organic-curves.md.

const BezierUtils = {
  // Converts an array of [x, y] points into a smooth curve through all of
  // them (Catmull-Rom spline, expressed as bezier segments so it works
  // directly with ctx.bezierCurveTo). Great for hair strands, ridgelines,
  // wave crests, or any hand-drawn-looking path through key points.
  //
  // Usage:
  //   const segments = BezierUtils.catmullRomToBezier(points, { closed: false });
  //   ctx.beginPath();
  //   ctx.moveTo(...points[0]);
  //   for (const seg of segments) ctx.bezierCurveTo(...seg.cp1, ...seg.cp2, ...seg.end);
  //   ctx.stroke();
  catmullRomToBezier(points, { closed = false, tension = 1 } = {}) {
    const segments = [];
    const n = points.length;
    if (n < 3) return segments;
    const get = (i) => points[closed ? (i + n) % n : Math.max(0, Math.min(n - 1, i))];

    const upper = closed ? n : n - 1;
    for (let i = 0; i < upper; i++) {
      const p0 = get(i - 1), p1 = get(i), p2 = get(i + 1), p3 = get(i + 2);
      const cp1 = [
        p1[0] + ((p2[0] - p0[0]) / 6) * tension,
        p1[1] + ((p2[1] - p0[1]) / 6) * tension,
      ];
      const cp2 = [
        p2[0] - ((p3[0] - p1[0]) / 6) * tension,
        p2[1] - ((p3[1] - p1[1]) / 6) * tension,
      ];
      segments.push({ cp1, cp2, end: p2 });
    }
    return segments;
  },

  // Seeded pseudo-random generator — use this instead of Math.random() any
  // time an "organic" shape needs to look identical across re-renders
  // (e.g. redrawing every animation frame without the silhouette jittering).
  seededRandom(seed) {
    let s = seed;
    return function () {
      s = (s + 0x6d2b79f5) | 0;
      let t = Math.imul(s ^ (s >>> 15), 1 | s);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  },

  // Nudges a set of "reference" primitive points (e.g. from a perfect
  // polygon/circle sampling) by small, seeded, per-point offsets — the core
  // trick behind organicBlob() in organic-curves.md, factored out for reuse
  // with arbitrary base shapes (not just circles).
  jitterPoints(points, irregularity = 0.1, rand = Math.random) {
    return points.map(([x, y]) => {
      const dx = (rand() - 0.5) * irregularity;
      const dy = (rand() - 0.5) * irregularity;
      return [x + dx, y + dy];
    });
  },

  // Distance-based line-width taper — call per stroke segment when you want
  // a hand-drawn line that thins toward its ends instead of constant width.
  taperedWidth(t, baseWidth, { taperStart = 0.3, taperEnd = 0.3 } = {}) {
    if (t < taperStart) return baseWidth * (t / taperStart);
    if (t > 1 - taperEnd) return baseWidth * ((1 - t) / taperEnd);
    return baseWidth;
  },
};

if (typeof module !== 'undefined') module.exports = BezierUtils;
