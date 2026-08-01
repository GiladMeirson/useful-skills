/* canvas-atelier — the showpieces.
 *
 * A sphere proves the shading model. It does not prove the skill. What actually
 * separates an illustrator from a `ctx.arc()` call is whether the process
 * survives contact with a subject that has hundreds of parts, none of which can
 * be placed by eye and all of which have to agree with each other.
 *
 * So: two subjects that are genuinely hard. A macro human eye, where the iris is
 * four hundred individually shaded fibres, the sclera is a lit sphere seen
 * through a wet aperture, and the giveaway detail is the caustic - light
 * refracting through the cornea and landing as a bright crescent on the far side
 * of the iris, opposite the key. And a koi, where the body is two hundred
 * overlapping scales that each have to follow a surface travelling down a spine,
 * with translucent fins whose ray structure shows through.
 *
 * Both are drawn the way the skill argues for and can be stepped through it:
 * armature, contour, light, texture, finish. Nothing here is traced and nothing
 * is a texture map. Every coordinate is derived, and the whole file's only
 * source of randomness is a seeded generator, so the piece is identical on every
 * load and "regenerate" means something different from "reload".
 */
Demos.register('atelier-showpiece', function (root) {
  var G = window.Gfx;
  var canvas = root.querySelector('canvas');
  var VW = 900, VH = 470;
  var ctx = G.fitCanvas(canvas, VW, VH);
  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  var STAGES = ['armature', 'contour', 'light', 'texture', 'finish'];
  var stage = 4;          // index into STAGES
  var subject = 'eye';
  var playing = false, playT = 0;

  var grain = G.noiseTile(320, 320, 0.045, 1);
  var noteEl = root.querySelector('[data-piece-note]');
  var pointer = { x: 0.5, y: 0.42, inside: false };

  /* Deterministic noise. Math.random() would make the piece re-roll on every
   * repaint, and a fibre that moves between frames is not a fibre. */
  function rng(seed) {
    var s = seed >>> 0;
    return function () {
      s = (s * 1664525 + 1013904223) >>> 0;
      return s / 4294967296;
    };
  }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }

  /* ==========================================================================
   * SUBJECT ONE - the eye
   *
   * Proportions are the measured canon, not invented: the aperture is about
   * three iris-widths across, the iris sits under the upper lid rather than
   * floating clear of it (the single most common tell in a drawn eye), the upper
   * lid peaks nasal of centre while the lower lid dips temporal of it, and the
   * two lids meet at canthi that are NOT at the same height.
   * ========================================================================== */
  var EYE = {
    cx: 460, cy: 250,
    inner: { x: 84, y: 292 },     // nasal canthus, lower
    outer: { x: 826, y: 228 },    // temporal canthus, higher
    upperArch: 146,
    lowerArch: 102,
    irisR: 138,
    pupilMin: 30, pupilMax: 60
  };

  // The key. Everything in the piece agrees with this one vector.
  var KEY = { x: -0.62, y: -0.66 };

  function cubic(p, t) {
    var m = 1 - t, a = m * m * m, b = 3 * m * m * t, c = 3 * m * t * t, d = t * t * t;
    return {
      x: a * p[0].x + b * p[1].x + c * p[2].x + d * p[3].x,
      y: a * p[0].y + b * p[1].y + c * p[2].y + d * p[3].y
    };
  }

  /* The two lid margins, as the actual curves rather than as a stroke.
   *
   * This is the whole difference between an eye and a decal. Every part that
   * grows out of a lid - the lash line, the lashes themselves, the wet meniscus,
   * the crease, the lid's own thickness - is sampled off these beziers and
   * pushed along their normals. Nothing is positioned by a second, independent
   * guess, so nothing can detach from the lid it belongs to. Same argument as
   * deriving a landmark from a rig instead of typing a coordinate.
   */
  function lids(blink) {
    var g = EYE;
    var top = lerp(g.cy - g.upperArch, g.cy + g.lowerArch * 0.3, blink);
    var bot = g.cy + g.lowerArch * (1 - blink * 0.34);
    // The upper lid peaks nasal of centre, the lower dips temporal of it. Two
    // curves peaking in the same place read as a leaf, not an eye.
    var pk = g.cx - 56, dp = g.cx + 74;
    return {
      top: top, bot: bot,
      up: [
        [{ x: g.inner.x, y: g.inner.y }, { x: g.inner.x + 66, y: top + 46 },
         { x: pk - 132, y: top + 4 }, { x: pk, y: top }],
        [{ x: pk, y: top }, { x: pk + 160, y: top - 2 },
         { x: g.outer.x - 76, y: g.outer.y - 66 }, { x: g.outer.x, y: g.outer.y }]
      ],
      lo: [
        [{ x: g.inner.x, y: g.inner.y }, { x: g.inner.x + 88, y: bot - 26 },
         { x: dp - 152, y: bot }, { x: dp, y: bot }],
        [{ x: dp, y: bot }, { x: dp + 108, y: bot - 6 },
         { x: g.outer.x - 66, y: g.outer.y + 40 }, { x: g.outer.x, y: g.outer.y }]
      ]
    };
  }
  function lidAt(segs, u) {
    var s = u < 0.5 ? segs[0] : segs[1];
    return cubic(s, u < 0.5 ? u * 2 : (u - 0.5) * 2);
  }
  // Outward normal: perpendicular to the margin, pointing away from the globe.
  function lidNormal(segs, u) {
    var d = 0.005;
    var a = lidAt(segs, clamp(u - d, 0, 1));
    var b = lidAt(segs, clamp(u + d, 0, 1));
    var l = Math.hypot(b.x - a.x, b.y - a.y) || 1;
    var nx = (b.y - a.y) / l, ny = -(b.x - a.x) / l;
    var p = lidAt(segs, u);
    if (nx * (p.x - EYE.cx) + ny * (p.y - EYE.cy) < 0) { nx = -nx; ny = -ny; }
    return { x: nx, y: ny };
  }
  function traceMargin(c, segs, move) {
    if (move) c.moveTo(segs[0][0].x, segs[0][0].y);
    c.bezierCurveTo(segs[0][1].x, segs[0][1].y, segs[0][2].x, segs[0][2].y, segs[0][3].x, segs[0][3].y);
    c.bezierCurveTo(segs[1][1].x, segs[1][1].y, segs[1][2].x, segs[1][2].y, segs[1][3].x, segs[1][3].y);
  }
  function aperturePath(c, L) {
    c.beginPath();
    traceMargin(c, L.up, true);
    // Back along the lower margin, reversed.
    c.bezierCurveTo(L.lo[1][2].x, L.lo[1][2].y, L.lo[1][1].x, L.lo[1][1].y, L.lo[1][0].x, L.lo[1][0].y);
    c.bezierCurveTo(L.lo[0][2].x, L.lo[0][2].y, L.lo[0][1].x, L.lo[0][1].y, L.lo[0][0].x, L.lo[0][0].y);
    c.closePath();
  }
  /* A band running along a margin and back along a copy of it pushed out by
   * `dist`. This is how the lid gets thickness, how the crease gets a shadow and
   * how the tear trough gets its soft edge, all from one primitive. */
  function lidBand(c, segs, dist, taper) {
    var N = 44, i;
    c.beginPath();
    traceMargin(c, segs, true);
    for (i = N; i >= 0; i--) {
      var u = i / N, p = lidAt(segs, u), n = lidNormal(segs, u);
      var f = taper ? Math.pow(Math.sin(u * Math.PI), 0.5) : 1;
      c.lineTo(p.x + n.x * dist * f, p.y + n.y * dist * f);
    }
    c.closePath();
  }
  function offsetCurve(c, segs, dist, taper) {
    var N = 44, i;
    c.beginPath();
    for (i = 0; i <= N; i++) {
      var u = i / N, p = lidAt(segs, u), n = lidNormal(segs, u);
      var f = taper ? Math.pow(Math.sin(u * Math.PI), 0.5) : 1;
      var x = p.x + n.x * dist * f, y = p.y + n.y * dist * f;
      i === 0 ? c.moveTo(x, y) : c.lineTo(x, y);
    }
  }

  /* The iris, rendered once into its own layer.
   *
   * Four hundred fibres redrawn every frame would be four hundred strokes of
   * work to produce a bitmap that never changes. The layer is the point: the
   * pupil, the caustic and the corneal reflection all composite over a texture
   * computed exactly once. This is the layer-stack advice in canvas-craft.md,
   * and it is the difference between the piece running at 60fps and at 12.
   */
  var irisLayer = null;
  function buildIris(R) {
    var size = R * 2 + 4;
    var lc = document.createElement('canvas');
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    lc.width = lc.height = Math.round(size * dpr);
    var c = lc.getContext('2d');
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    var cx = size / 2, cy = size / 2;
    var rand = rng(20260731);

    // Ground: hazel runs dark at the limbus, warm through the mid band, and
    // lifts again toward the pupil where the stroma thins.
    var base = c.createRadialGradient(cx, cy, R * 0.16, cx, cy, R);
    base.addColorStop(0.00, '#48331a');
    base.addColorStop(0.28, '#7a5d24');
    base.addColorStop(0.52, '#8f7130');
    base.addColorStop(0.74, '#665326');
    base.addColorStop(0.92, '#35301a');
    base.addColorStop(1.00, '#1f1a0f');
    c.save();
    c.beginPath(); c.arc(cx, cy, R, 0, Math.PI * 2); c.clip();
    c.fillStyle = base;
    c.fillRect(0, 0, size, size);

    // A green outer band. Hazel is not one hue; the ring that reads as "green
    // eyes" is a band of low-chroma olive sitting over the amber stroma.
    var band = c.createRadialGradient(cx, cy, R * 0.5, cx, cy, R * 0.99);
    band.addColorStop(0, 'rgba(70,88,46,0)');
    band.addColorStop(0.55, 'rgba(70,88,46,.32)');
    band.addColorStop(1, 'rgba(36,48,26,.46)');
    c.fillStyle = band;
    c.fillRect(0, 0, size, size);

    /* Fibres. Each runs radially from the pupil margin outward, and every
     * property comes from the generator rather than being repeated: length,
     * bow, width, value, where it starts and how far it reaches. Uniform spokes
     * read as a bicycle wheel; the variance is what reads as tissue. */
    var N = 460;
    for (var i = 0; i < N; i++) {
      var a = (i / N) * Math.PI * 2 + (rand() - 0.5) * 0.05;
      var r0 = R * (0.19 + rand() * 0.12);
      var r1 = R * (0.68 + rand() * 0.31);
      var bow = (rand() - 0.5) * 0.13;
      var v = rand();
      var w = 0.45 + rand() * 1.7;
      // Fibres on the lit side run lighter: the stroma is translucent and the
      // key reaches into it. This is why an iris is never flat.
      var toKey = Math.cos(a - Math.atan2(KEY.y, KEY.x));
      var lit = 0.5 + toKey * 0.3;
      var col;
      if (v < 0.42) col = 'rgba(' + Math.round(24 + 30 * lit) + ',' + Math.round(19 + 23 * lit) + ',9,' + (0.3 + rand() * 0.32).toFixed(2) + ')';
      else if (v < 0.8) col = 'rgba(' + Math.round(142 + 78 * lit) + ',' + Math.round(114 + 68 * lit) + ',' + Math.round(48 + 34 * lit) + ',' + (0.16 + rand() * 0.26).toFixed(2) + ')';
      else col = 'rgba(' + Math.round(92 + 58 * lit) + ',' + Math.round(108 + 52 * lit) + ',52,' + (0.14 + rand() * 0.22).toFixed(2) + ')';

      c.beginPath();
      c.moveTo(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0);
      c.quadraticCurveTo(
        cx + Math.cos(a + bow) * (r0 + r1) * 0.5, cy + Math.sin(a + bow) * (r0 + r1) * 0.5,
        cx + Math.cos(a + bow * 1.7) * r1, cy + Math.sin(a + bow * 1.7) * r1);
      c.strokeStyle = col;
      c.lineWidth = w;
      c.lineCap = 'round';
      c.stroke();
    }

    /* The collarette: the ridge at roughly 40% of the radius where the fibre
     * character changes. Drawing it as a circle is the tell. It is a ragged
     * boundary, so it is a closed path with a per-vertex wobble. */
    var cr = R * 0.4;
    c.beginPath();
    for (var k = 0; k <= 96; k++) {
      var ka = (k / 96) * Math.PI * 2;
      var wob = cr * (1 + Math.sin(ka * 7 + 1.2) * 0.05 + Math.sin(ka * 13) * 0.032);
      var px = cx + Math.cos(ka) * wob, py = cy + Math.sin(ka) * wob;
      k === 0 ? c.moveTo(px, py) : c.lineTo(px, py);
    }
    c.closePath();
    c.strokeStyle = 'rgba(206,176,102,.3)';
    c.lineWidth = 3.4;
    c.stroke();
    c.strokeStyle = 'rgba(42,30,10,.42)';
    c.lineWidth = 1.1;
    c.stroke();

    /* Contraction furrows: concentric creases in the outer third, left behind by
     * the sphincter working. They cross the radial fibres, which is exactly why
     * they matter - an iris built only of spokes reads as a sunburst, and it is
     * the second, perpendicular family of lines that makes it read as tissue
     * that has been moving for forty years. Each furrow is a wobbled ring with a
     * lit upper edge and a dark lower one, because a crease is a groove. */
    for (var fu = 0; fu < 6; fu++) {
      var fr = R * (0.58 + fu * 0.068 + rand() * 0.014);
      var fphase = rand() * Math.PI * 2;
      var fw = 0.02 + rand() * 0.022;
      c.beginPath();
      for (var fk = 0; fk <= 140; fk++) {
        var fa = (fk / 140) * Math.PI * 2;
        var rr = fr * (1 + Math.sin(fa * 3 + fphase) * fw + Math.sin(fa * 8 + fphase * 2) * fw * 0.45);
        var fx = cx + Math.cos(fa) * rr, fy = cy + Math.sin(fa) * rr;
        fk === 0 ? c.moveTo(fx, fy) : c.lineTo(fx, fy);
      }
      c.closePath();
      c.strokeStyle = 'rgba(26,18,6,' + (0.1 + rand() * 0.12).toFixed(2) + ')';
      c.lineWidth = 1.6 + rand() * 1.4;
      c.stroke();
      // The lit lip of the groove, offset half a pixel outward.
      c.save();
      c.translate(0, -1);
      c.strokeStyle = 'rgba(226,198,128,.07)';
      c.lineWidth = 1;
      c.stroke();
      c.restore();
    }

    // Crypts: the dark pits sitting just inside the collarette.
    for (var q = 0; q < 18; q++) {
      var qa = rand() * Math.PI * 2;
      var qr = cr * (0.6 + rand() * 0.32);
      var qw = R * (0.05 + rand() * 0.08);
      var qh = R * (0.025 + rand() * 0.045);
      c.save();
      c.translate(cx + Math.cos(qa) * qr, cy + Math.sin(qa) * qr);
      c.rotate(qa);
      c.beginPath();
      c.ellipse(0, 0, qw, qh, 0, 0, Math.PI * 2);
      c.fillStyle = 'rgba(22,15,5,' + (0.2 + rand() * 0.24).toFixed(2) + ')';
      c.filter = 'blur(2px)';
      c.fill();
      c.restore();
    }

    // Limbal ring. Dark, soft on the inside, crisp on the outside.
    var limb = c.createRadialGradient(cx, cy, R * 0.76, cx, cy, R);
    limb.addColorStop(0, 'rgba(12,9,5,0)');
    limb.addColorStop(0.7, 'rgba(12,9,5,.36)');
    limb.addColorStop(1, 'rgba(8,6,3,.9)');
    c.fillStyle = limb;
    c.fillRect(0, 0, size, size);

    c.restore();
    return { canvas: lc, size: size, R: R };
  }

  /* Two plates and a live middle.
   *
   * Only three things in this piece move: the iris (with the gaze), the pupil
   * (with the light), and the lids (on a blink). Everything else - the skin, the
   * socket, the lid planes and their crease, the sclera, its lid shadow, the
   * warm canthi, fifty-two vessels, ninety-three lashes and the grain over all
   * of it - is identical from one frame to the next, and redrawing it sixty
   * times a second was costing most of the frame.
   *
   * So it is baked into two layers: everything under the iris, and everything
   * over it. Per frame the piece is a blit, the iris, and a blit. The plates are
   * only rebuilt when the stage changes, the canvas resizes, or the eye is
   * mid-blink - and a blink is a third of a second out of every seven, which is
   * the one moment it is worth paying full price.
   *
   * Making the sclera static also fixed a quiet error: its shading was centred
   * on the iris, so the whole globe's lighting slid around with the gaze. A
   * globe rotates inside a socket. The highlight stays where the window is.
   */
  var plate = { back: null, front: null, key: '' };

  function newLayer() {
    var lc = document.createElement('canvas');
    lc.width = canvas.width;
    lc.height = canvas.height;
    var c = lc.getContext('2d');
    var sc = canvas.width / VW;
    c.setTransform(sc, 0, 0, sc, 0, 0);
    return { canvas: lc, ctx: c };
  }

  /* Everything under the iris. */
  function paintBack(c, st, L) {
    var g = EYE, R = g.irisR;
    var icx = g.cx, icy = g.cy;

    var skin = c.createLinearGradient(0, 20, 0, VH);
    skin.addColorStop(0, '#3a2921');
    skin.addColorStop(0.3, '#573e30');
    skin.addColorStop(0.58, '#795641');
    skin.addColorStop(1, '#3c2a20');
    c.fillStyle = st === 1 ? '#211a16' : skin;
    c.fillRect(0, 0, VW, VH);

    if (st >= 2) {
      var socket = c.createRadialGradient(g.cx - 30, g.cy - 26, 70, g.cx, g.cy + 14, 520);
      socket.addColorStop(0, 'rgba(0,0,0,0)');
      socket.addColorStop(0.55, 'rgba(22,11,7,.3)');
      socket.addColorStop(1, 'rgba(14,7,4,.74)');
      c.fillStyle = socket;
      c.fillRect(0, 0, VW, VH);

      var brow = c.createLinearGradient(0, 0, 0, 190);
      brow.addColorStop(0, 'rgba(16,9,6,.82)');
      brow.addColorStop(1, 'rgba(16,9,6,0)');
      c.fillStyle = brow;
      c.fillRect(0, 0, VW, 190);

      /* The upper lid is an object with thickness in front of the globe, not an
       * edge. Its own plane catches the key, the crease above throws a soft
       * shadow down onto it, and the band between them is what a viewer reads as
       * "there is a lid here" without ever looking at it directly. */
      c.save();
      lidBand(c, L.up, 72, true);
      var plane = c.createLinearGradient(0, L.top - 74, 0, L.top + 10);
      plane.addColorStop(0, 'rgba(96,66,48,.5)');
      plane.addColorStop(0.62, 'rgba(126,90,66,.42)');
      plane.addColorStop(1, 'rgba(58,38,26,.5)');
      c.fillStyle = plane;
      c.fill();
      c.restore();

      c.save();
      offsetCurve(c, L.up, 74, true);
      c.strokeStyle = 'rgba(30,17,11,.5)';
      c.lineWidth = 3;
      c.filter = 'blur(3px)';
      c.stroke();
      c.restore();

      c.save();
      lidBand(c, L.lo, 22, true);
      var lowPlane = c.createLinearGradient(0, L.bot - 4, 0, L.bot + 26);
      lowPlane.addColorStop(0, 'rgba(170,126,94,.32)');
      lowPlane.addColorStop(1, 'rgba(116,80,58,.12)');
      c.fillStyle = lowPlane;
      c.fill();
      c.restore();

      c.save();
      offsetCurve(c, L.lo, 34, true);
      c.strokeStyle = 'rgba(44,24,16,.4)';
      c.lineWidth = 10;
      c.filter = 'blur(7px)';
      c.stroke();
      c.restore();
    }

    if (st >= 3) {
      /* Skin. Up to here the lids are gradients, and a gradient is not skin: skin
       * has pores, and it creases where it folds. Both are baked into the plate,
       * so this loop of nine hundred marks runs once rather than sixty times a
       * second. */
      var sr = rng(556677);
      c.save();
      lidBand(c, L.up, 78, true);
      c.clip();
      for (var pi = 0; pi < 900; pi++) {
        var px3 = EYE.inner.x + sr() * (EYE.outer.x - EYE.inner.x);
        var py3 = L.top - 80 + sr() * 96;
        var lit3 = sr();
        c.fillStyle = lit3 > 0.55
          ? 'rgba(196,158,124,' + (0.03 + sr() * 0.055).toFixed(3) + ')'
          : 'rgba(44,26,17,' + (0.03 + sr() * 0.06).toFixed(3) + ')';
        c.beginPath();
        c.arc(px3, py3, 0.5 + sr() * 1.1, 0, Math.PI * 2);
        c.fill();
      }
      // Crepe: fine creases running parallel to the margin, bunched near it.
      for (var cr2 = 0; cr2 < 9; cr2++) {
        offsetCurve(c, L.up, 16 + cr2 * cr2 * 0.95 + sr() * 5, true);
        c.strokeStyle = 'rgba(38,22,14,' + (0.07 + sr() * 0.08).toFixed(3) + ')';
        c.lineWidth = 0.8 + sr() * 0.8;
        c.stroke();
      }
      c.restore();

      // Crow's feet, fanning off the temporal canthus. Skin folds where it is
      // repeatedly compressed, and the outer corner is where an eye does that.
      c.save();
      c.lineCap = 'round';
      for (var cw = 0; cw < 6; cw++) {
        var ang = -0.5 + cw * 0.2 + sr() * 0.05;
        var len3 = 46 + sr() * 62;
        c.beginPath();
        c.moveTo(EYE.outer.x + 4, EYE.outer.y);
        c.quadraticCurveTo(
          EYE.outer.x + len3 * 0.55, EYE.outer.y + Math.sin(ang) * len3 * 0.45,
          EYE.outer.x + len3, EYE.outer.y + Math.sin(ang) * len3);
        c.strokeStyle = 'rgba(40,23,15,' + (0.16 + sr() * 0.18).toFixed(3) + ')';
        c.lineWidth = 1 + sr() * 1.4;
        c.stroke();
      }
      c.restore();

      // The lower lid catches light, so its pores read as highlights rather than
      // as pits: same texture, inverted.
      c.save();
      lidBand(c, L.lo, 30, true);
      c.clip();
      for (var pj = 0; pj < 420; pj++) {
        var qx = EYE.inner.x + sr() * (EYE.outer.x - EYE.inner.x);
        var qy = L.bot - 4 + sr() * 40;
        c.fillStyle = sr() > 0.4
          ? 'rgba(214,176,140,' + (0.03 + sr() * 0.06).toFixed(3) + ')'
          : 'rgba(52,32,20,' + (0.025 + sr() * 0.05).toFixed(3) + ')';
        c.beginPath();
        c.arc(qx, qy, 0.6 + sr() * 1.3, 0, Math.PI * 2);
        c.fill();
      }
      c.restore();
    }

    c.save();
    aperturePath(c, L);
    c.clip();

    // Sclera. A sphere, not a white shape: shaded from the same key, cool rather
    // than white, darkening hard toward the corners where it curves away.
    var scl = c.createRadialGradient(
      icx + KEY.x * R * 1.2, icy + KEY.y * R * 1.2, R * 0.25,
      icx, icy, R * 3.1);
    scl.addColorStop(0, '#dedad2');
    scl.addColorStop(0.3, '#c3bdb2');
    scl.addColorStop(0.62, '#948b7e');
    scl.addColorStop(1, '#4f463c');
    c.fillStyle = st === 1 ? '#34342f' : scl;
    c.fillRect(0, 0, VW, VH);

    if (st >= 2) {
      c.save();
      lidBand(c, L.up, -74, true);
      var lidsh = c.createLinearGradient(0, L.top, 0, L.top + 78);
      lidsh.addColorStop(0, 'rgba(34,18,11,.92)');
      lidsh.addColorStop(1, 'rgba(40,22,14,0)');
      c.fillStyle = lidsh;
      c.fill();
      c.restore();

      [[g.inner.x + 34, g.inner.y - 10, 150], [g.outer.x - 38, g.outer.y + 10, 128]].forEach(function (k) {
        var w = c.createRadialGradient(k[0], k[1], 4, k[0], k[1], k[2]);
        w.addColorStop(0, 'rgba(146,70,52,.44)');
        w.addColorStop(1, 'rgba(146,70,52,0)');
        c.fillStyle = w;
        c.fillRect(0, 0, VW, VH);
      });
    }

    if (st >= 3) {
      // Vessels: denser toward the canthi, fading before the limbus, branching.
      // A straight red line here would read as a scratch.
      var vr = rng(778113);
      c.lineCap = 'round';
      for (var vi = 0; vi < 52; vi++) {
        var fromInner = vr() < 0.58;
        var sx = fromInner ? g.inner.x + vr() * 80 : g.outer.x - vr() * 78;
        var sy = g.cy + (vr() - 0.5) * 132;
        var dir = fromInner ? 1 : -1;
        var len = 60 + vr() * 180;
        var px2 = sx, py2 = sy;
        c.beginPath();
        c.moveTo(px2, py2);
        var segs2 = 3 + ((vr() * 3) | 0);
        for (var s2 = 0; s2 < segs2; s2++) {
          px2 += dir * len / segs2;
          py2 += (vr() - 0.5) * 24;
          c.lineTo(px2, py2);
        }
        var dd = Math.hypot(px2 - icx, py2 - icy);
        var fade = clamp((dd - R * 0.95) / 110, 0, 1);
        c.strokeStyle = 'rgba(' + (148 + ((vr() * 40) | 0)) + ',56,42,' + (0.08 + fade * 0.28).toFixed(2) + ')';
        c.lineWidth = 0.5 + vr() * 1.1;
        c.stroke();
      }

      /* The perilimbal arcade: the fine vessels that run up to the cornea and
       * stop. Every vessel above ends somewhere arbitrary; these end at the same
       * radius, because that is where the tissue they feed ends. That shared
       * boundary is what tells a viewer the cornea is a separate structure
       * sitting on the eye rather than a colour printed on it. */
      for (var aa = 0; aa < 40; aa++) {
        var ang2 = vr() * Math.PI * 2;
        // Sparse at the top and bottom, where the lids cover the sclera anyway.
        if (Math.abs(Math.sin(ang2)) > 0.72) continue;
        var out2 = R * (1.06 + vr() * 0.5);
        var inn = R * (1.015 + vr() * 0.03);
        c.beginPath();
        c.moveTo(icx + Math.cos(ang2) * out2, icy + Math.sin(ang2) * out2 * 0.9);
        c.quadraticCurveTo(
          icx + Math.cos(ang2 + 0.05) * (out2 + inn) * 0.5,
          icy + Math.sin(ang2 + 0.05) * (out2 + inn) * 0.45,
          icx + Math.cos(ang2) * inn, icy + Math.sin(ang2) * inn * 0.9);
        c.strokeStyle = 'rgba(172,74,58,' + (0.1 + vr() * 0.2).toFixed(2) + ')';
        c.lineWidth = 0.5 + vr() * 0.7;
        c.stroke();
      }
    }
    c.restore();
  }

  /* Everything over the iris. */
  function paintFront(c, st, L, blink) {
    var g = EYE;
    c.clearRect(0, 0, VW, VH);
    if (st < 2) return;

    // The upper margin is a thick, soft, dark band; the lower is a thin one with
    // a wet highlight lying on it. Stroking both at the same weight is what
    // makes a drawn eye look like a decal.
    c.save();
    c.beginPath(); traceMargin(c, L.up, true);
    c.strokeStyle = 'rgba(20,10,6,.95)';
    c.lineWidth = 11;
    c.lineCap = 'round';
    c.stroke();
    c.restore();

    c.save();
    c.beginPath(); traceMargin(c, L.lo, true);
    c.strokeStyle = 'rgba(46,26,17,.55)';
    c.lineWidth = 2.8;
    c.lineCap = 'round';
    c.stroke();
    c.restore();

    // Caruncle: the pink form filling the nasal canthus. Leaving it out is what
    // makes an inner corner read as a sharp point of skin.
    c.save();
    c.beginPath();
    c.ellipse(g.inner.x + 30, g.inner.y - 12, 24, 15, -0.34, 0, Math.PI * 2);
    var car = c.createRadialGradient(g.inner.x + 24, g.inner.y - 18, 2, g.inner.x + 30, g.inner.y - 12, 26);
    car.addColorStop(0, 'rgba(214,140,118,.9)');
    car.addColorStop(1, 'rgba(122,58,44,.7)');
    c.fillStyle = car;
    c.filter = 'blur(2px)';
    c.fill();
    c.restore();

    if (st >= 4) {
      // Wet meniscus: the tear line lying on the lower margin, sampled off that
      // margin so it cannot drift across the sclera.
      c.save();
      offsetCurve(c, L.lo, -3, true);
      c.strokeStyle = 'rgba(255,246,230,.55)';
      c.lineWidth = 2.2;
      c.filter = 'blur(1.1px)';
      c.stroke();
      c.restore();

      var lr = rng(4419);
      c.save();
      c.lineCap = 'round';
      // Upper set. Root and direction both come off the margin curve, so a lash
      // grows out of the lid instead of being laid on top of it.
      /* Lashes grow in clumps of two and three, not on a comb. The root is
       * quantised to a cluster and then jittered inside it, which is why the
       * spacing along the margin comes out uneven the way a real lash line is.
       * An evenly-spaced lash line is the single most common tell in a drawn
       * eye after the round white catchlight. */
      var CLUMPS = 30;
      for (var li = 0; li < 76; li++) {
        var clump = Math.floor(li / 76 * CLUMPS);
        var u = 0.07 + (clump / (CLUMPS - 1)) * 0.86
          + (lr() - 0.5) * 0.022 + (lr() - 0.5) * 0.006;
        var p = lidAt(L.up, u), n = lidNormal(L.up, u);
        var arch = Math.pow(Math.sin(u * Math.PI), 0.42);
        var len = (20 + lr() * 34) * (0.4 + arch * 0.8) * (1 - blink * 0.7);
        // Fan: rotate the outward normal toward the temporal side, more at the
        // ends than in the middle.
        var fan = (u - 0.44) * 1.15 + (lr() - 0.5) * 0.24;
        var cs = Math.cos(fan), sn = Math.sin(fan);
        var dx = n.x * cs - n.y * sn, dy = n.x * sn + n.y * cs;
        var curl = 0.34 + lr() * 0.4;
        c.beginPath();
        c.moveTo(p.x, p.y);
        c.quadraticCurveTo(
          p.x + dx * len * 0.55, p.y + dy * len * 0.55,
          p.x + dx * len - n.x * curl * len * 0.34 + dy * curl * len * 0.5,
          p.y + dy * len - n.y * curl * len * 0.34 - dx * curl * len * 0.5);
        // Roughly a third sit behind the ones in front of them, so they read
        // lighter and thinner. Uniform lash value is a flat fringe.
        var behind = lr() < 0.34;
        c.strokeStyle = behind
          ? 'rgba(30,19,12,' + (0.22 + lr() * 0.22).toFixed(2) + ')'
          : 'rgba(12,7,4,' + (0.5 + lr() * 0.45).toFixed(2) + ')';
        c.lineWidth = (behind ? 1.5 : 2.6) - arch * 0.5;
        c.stroke();
      }
      // Lower set: shorter, sparser, angled the other way.
      for (var lj = 0; lj < 17; lj++) {
        var u2 = 0.2 + (lj / 16) * 0.58 + (lr() - 0.5) * 0.03;
        var p2 = lidAt(L.lo, u2), n2 = lidNormal(L.lo, u2);
        var arch2 = Math.pow(Math.sin(u2 * Math.PI), 0.5);
        var len2 = (5 + lr() * 9) * (0.5 + arch2 * 0.6);
        var fan2 = (u2 - 0.5) * 0.9 + (lr() - 0.5) * 0.5;
        var cs2 = Math.cos(fan2), sn2 = Math.sin(fan2);
        var dx2 = n2.x * cs2 - n2.y * sn2, dy2 = n2.x * sn2 + n2.y * cs2;
        c.beginPath();
        c.moveTo(p2.x, p2.y);
        c.quadraticCurveTo(p2.x + dx2 * len2 * 0.6, p2.y + dy2 * len2 * 0.6,
          p2.x + dx2 * len2, p2.y + dy2 * len2 * 1.1);
        c.strokeStyle = 'rgba(14,8,5,' + (0.16 + lr() * 0.24).toFixed(2) + ')';
        c.lineWidth = 1.2;
        c.stroke();
      }
      c.restore();
    }

    if (st >= 3) {
      c.save();
      c.globalAlpha = 0.5;
      c.drawImage(grain, 0, 0, VW, VH);
      c.restore();
    }
  }

  /* The live middle: the iris, everything inside it, and the wet dome over it. */
  function paintIris(c, st, L, icx, icy, R, pr) {
    c.save();
    aperturePath(c, L);
    c.clip();

    if (st === 1) {
      c.beginPath(); c.arc(icx, icy, R, 0, Math.PI * 2);
      c.fillStyle = '#4a4740'; c.fill();
      c.strokeStyle = 'rgba(226,214,196,.7)'; c.lineWidth = 1.4; c.stroke();
      c.beginPath(); c.arc(icx, icy, pr, 0, Math.PI * 2);
      c.fillStyle = '#15130f'; c.fill();
      c.restore();
      return;
    }

    c.save();
    c.beginPath(); c.arc(icx, icy, R, 0, Math.PI * 2); c.clip();

    if (st === 2) {
      var flat = c.createRadialGradient(icx - R * 0.3, icy - R * 0.3, R * 0.1, icx, icy, R);
      flat.addColorStop(0, '#977830');
      flat.addColorStop(0.6, '#68521f');
      flat.addColorStop(1, '#28220e');
      c.fillStyle = flat;
      c.fillRect(icx - R, icy - R, R * 2, R * 2);
    } else {
      if (!irisLayer || irisLayer.R !== R) irisLayer = buildIris(R);
      c.drawImage(irisLayer.canvas, icx - irisLayer.size / 2, icy - irisLayer.size / 2,
        irisLayer.size, irisLayer.size);
    }

    if (st >= 4) {
      /* The limbal transition. The cornea does not stop at a hard circle: for
         * a couple of millimetres it thins into the sclera, and that annulus is
         * neither iris nor white but a cool, slightly translucent grey. Drawing
       * a crisp edge here is what makes an iris look like a contact lens
       * sitting on top of an eye rather than part of one. */
      var lim = c.createRadialGradient(icx, icy, R * 0.9, icx, icy, R * 1.02);
      lim.addColorStop(0, 'rgba(126,134,146,0)');
      lim.addColorStop(0.55, 'rgba(120,128,142,.16)');
      lim.addColorStop(1, 'rgba(96,104,118,.42)');
      c.fillStyle = lim;
      c.fillRect(icx - R, icy - R, R * 2, R * 2);

      /* The caustic.
       *
       * The cornea is a lens in front of the iris, so light from the key does
       * not stop at the surface: it refracts across the anterior chamber and
       * lands as a bright crescent on the iris OPPOSITE the key, hard against
       * the limbus. It separates an eye that was observed from an eye that was
       * assumed, and almost nobody draws it, because it looks like a mistake
       * until you have seen one. */
      var caX = icx - KEY.x * R * 0.74, caY = icy - KEY.y * R * 0.74;
      var ca = c.createRadialGradient(caX, caY, R * 0.05, caX, caY, R * 0.6);
      ca.addColorStop(0, 'rgba(255,216,138,.52)');
      ca.addColorStop(0.42, 'rgba(240,190,110,.2)');
      ca.addColorStop(1, 'rgba(240,190,110,0)');
      c.fillStyle = ca;
      c.fillRect(icx - R, icy - R, R * 2, R * 2);

      // The shadow the corneal overhang throws on the key side. The caustic and
      // this are a pair; one without the other reads as a lighting error.
      var oc = c.createRadialGradient(
        icx + KEY.x * R * 0.92, icy + KEY.y * R * 0.92, R * 0.08,
        icx + KEY.x * R * 0.92, icy + KEY.y * R * 0.92, R * 0.64);
      oc.addColorStop(0, 'rgba(16,10,4,.38)');
      oc.addColorStop(1, 'rgba(16,10,4,0)');
      c.fillStyle = oc;
      c.fillRect(icx - R, icy - R, R * 2, R * 2);
    }
    c.restore();

    // Pupil. Not black: it is the inside of a chamber with a little bounce in
    // it, and pure #000 in a piece whose deepest shadow is #1f1a0f punches a
    // hole straight through the image.
    var pupg = c.createRadialGradient(icx - pr * 0.25, icy - pr * 0.25, 1, icx, icy, pr);
    pupg.addColorStop(0, '#0c0a08');
    pupg.addColorStop(0.8, '#070605');
    pupg.addColorStop(1, '#191308');
    c.beginPath(); c.arc(icx, icy, pr, 0, Math.PI * 2);
    c.fillStyle = pupg; c.fill();

    if (st >= 3) {
      /* The pupillary ruff: the pigmented frill where the back of the iris wraps
       * around the pupil margin. It is scalloped, not circular, and it is the
       * detail that stops the pupil reading as a hole punched through a disc. */
      c.beginPath();
      for (var rk = 0; rk <= 120; rk++) {
        var ra = (rk / 120) * Math.PI * 2;
        var rr2 = pr + 1.6 + Math.sin(ra * 17) * 1.5 + Math.sin(ra * 29 + 1.1) * 0.8;
        var rx2 = icx + Math.cos(ra) * rr2, ry2 = icy + Math.sin(ra) * rr2;
        rk === 0 ? c.moveTo(rx2, ry2) : c.lineTo(rx2, ry2);
      }
      c.closePath();
      c.strokeStyle = 'rgba(48,32,10,.62)';
      c.lineWidth = 3.2;
      c.stroke();
      c.strokeStyle = 'rgba(150,118,58,.24)';
      c.lineWidth = 1;
      c.stroke();
    }

    if (st >= 4) {
      var dome = c.createRadialGradient(
        icx + KEY.x * R * 0.8, icy + KEY.y * R * 0.8, R * 0.1,
        icx, icy, R * 1.5);
      dome.addColorStop(0, 'rgba(226,236,255,.13)');
      dome.addColorStop(0.6, 'rgba(226,236,255,.03)');
      dome.addColorStop(1, 'rgba(226,236,255,0)');
      c.fillStyle = dome;
      c.fillRect(0, 0, VW, VH);

      /* The reflection is a window, not a dot. A round white blob is the
       * universal signature of a drawn eye; a real catchlight is the shape of
       * whatever is in front of the person, and here that is a four-pane window
       * with a soft edge and a much weaker second source off to the side. */
      var wx = icx + KEY.x * R * 0.5, wy = icy + KEY.y * R * 0.5;
      c.save();
      c.translate(wx, wy);
      c.rotate(-0.2);
      c.filter = 'blur(1.3px)';
      c.fillStyle = 'rgba(246,249,255,.9)';
      var pw = 12, ph = 15, gp = 3;
      for (var wxi = 0; wxi < 2; wxi++) {
        for (var wyi = 0; wyi < 2; wyi++) {
          c.fillRect(-pw - gp / 2 + wxi * (pw + gp), -ph - gp / 2 + wyi * (ph + gp), pw, ph);
        }
      }
      c.restore();
      c.save();
      c.filter = 'blur(3px)';
      c.beginPath();
      c.ellipse(icx - KEY.x * R * 0.36, icy - KEY.y * R * 0.16 + 24, 12, 7, 0.5, 0, Math.PI * 2);
      c.fillStyle = 'rgba(210,228,255,.26)';
      c.fill();
      c.restore();
    }
    c.restore();
  }

  function drawEye(c, st, t) {
    var g = EYE;

    // Gaze. The globe rotates in its socket; the aperture does not move with it.
    // Sliding the whole eye across the face is what makes a tracking eye read as
    // a sticker.
    var gx = (pointer.inside ? pointer.x : 0.5 + Math.sin(t * 0.31) * 0.17) - 0.5;
    var gy = (pointer.inside ? pointer.y : 0.46 + Math.cos(t * 0.23) * 0.07) - 0.46;
    var gaze = { x: clamp(gx, -0.5, 0.5) * 116, y: clamp(gy, -0.4, 0.4) * 58 };

    // Blink, roughly every seven seconds and asymmetric: the lid falls in about
    // 100ms and opens over 230ms. A symmetric blink reads as a camera shutter.
    var cycle = 7.4;
    var bt = (t % cycle) / cycle;
    var blink = 0;
    if (bt > 0.955 && bt <= 0.9685) blink = clamp((bt - 0.955) / 0.0135, 0, 1);
    else if (bt > 0.9685) blink = clamp(1 - (bt - 0.9685) / 0.0315, 0, 1);
    if (reduce) blink = 0;

    // Pupil: contracts as the pointer nears the eye (bright), opens when it is
    // away, with a slow hippus underneath that never fully settles.
    var near = pointer.inside
      ? 1 - clamp(Math.hypot(pointer.x - 0.5, pointer.y - 0.46) * 1.9, 0, 1)
      : 0.32;
    var pr = lerp(g.pupilMax, g.pupilMin, near) + Math.sin(t * 1.7) * 1.5;

    var icx = g.cx + gaze.x, icy = g.cy + gaze.y * 0.72;
    var R = g.irisR;
    var L = lids(blink);

    c.clearRect(0, 0, VW, VH);

    /* ---------------------------------------------------- stage 1: armature */
    if (st === 0) {
      c.fillStyle = '#0b0a09';
      c.fillRect(0, 0, VW, VH);
      c.strokeStyle = 'rgba(223,106,65,.5)';
      c.lineWidth = 1;
      c.setLineDash([4, 5]);
      c.beginPath(); c.moveTo(g.inner.x, g.inner.y); c.lineTo(g.outer.x, g.outer.y); c.stroke();
      c.beginPath(); c.moveTo(g.cx, 34); c.lineTo(g.cx, VH - 34); c.stroke();
      c.beginPath(); c.arc(icx, icy, R, 0, Math.PI * 2); c.stroke();
      c.beginPath(); c.arc(icx, icy, pr, 0, Math.PI * 2); c.stroke();
      c.setLineDash([]);
      c.strokeStyle = 'rgba(180,172,160,.5)';
      aperturePath(c, L); c.stroke();
      // The normals every lash, the crease and the meniscus are built on.
      c.strokeStyle = 'rgba(139,156,184,.5)';
      for (var ni = 0; ni <= 22; ni++) {
        var nu = ni / 22, np = lidAt(L.up, nu), nn = lidNormal(L.up, nu);
        var nf = Math.pow(Math.sin(nu * Math.PI), 0.5);
        c.beginPath();
        c.moveTo(np.x, np.y);
        c.lineTo(np.x + nn.x * 26 * nf, np.y + nn.y * 26 * nf);
        c.stroke();
      }
      var marks = [
        [g.inner.x, g.inner.y, 'canthus.n'], [g.outer.x, g.outer.y, 'canthus.t'],
        [icx, icy, 'iris.c'], [lidAt(L.up, 0.5).x, lidAt(L.up, 0.5).y, 'lid.peak'],
        [lidAt(L.lo, 0.5).x, lidAt(L.lo, 0.5).y, 'lid.dip']
      ];
      c.font = '500 11px ui-monospace, monospace';
      for (var mi = 0; mi < marks.length; mi++) {
        c.fillStyle = '#df6a41';
        c.fillRect(marks[mi][0] - 2.5, marks[mi][1] - 2.5, 5, 5);
        c.fillStyle = 'rgba(170,162,150,.75)';
        c.fillText(marks[mi][2], marks[mi][0] + 9, marks[mi][1] - 8);
      }
      c.fillStyle = 'rgba(140,133,124,.7)';
      c.fillText('aperture / iris = 2.72   canthi offset 52px   peak is nasal, dip is temporal', 120, VH - 30);
      return;
    }

    if (blink > 0.001) {
      // Mid-blink: the lids are moving, so nothing is cacheable. Pay full price
      // for the third of a second it lasts.
      paintBack(c, st, L);
      paintIris(c, st, L, icx, icy, R, pr);
      var f = newLayer();
      paintFront(f.ctx, st, L, blink);
      c.drawImage(f.canvas, 0, 0, VW, VH);
      plate.key = '';                 // force a rebuild once the eye reopens
      return;
    }

    var key = st + '|' + canvas.width;
    if (plate.key !== key) {
      var b = newLayer(), fr = newLayer();
      paintBack(b.ctx, st, L);
      paintFront(fr.ctx, st, L, 0);
      plate.back = b.canvas;
      plate.front = fr.canvas;
      plate.key = key;
    }

    c.drawImage(plate.back, 0, 0, VW, VH);
    paintIris(c, st, L, icx, icy, R, pr);
    c.drawImage(plate.front, 0, 0, VW, VH);
  }

  /* ==========================================================================
   * SUBJECT TWO - the koi
   *
   * A different kind of hard. The eye is radial and static; this is a surface
   * that travels. The body is a spine carrying a wave, and two hundred scales
   * have to sit ON that surface - each one placed from the spine's local frame,
   * scaled by the body's local width, and shaded by the local normal - so that
   * when the wave moves, the scales move with it instead of sliding across it.
   * Fins are separate: translucent, with the ray structure showing through, and
   * they follow the body a beat late, which is the whole of follow-through.
   * ========================================================================== */
  var KOI = { len: 470, cx: 430, cy: 240 };

  // Spine: arc-length parameterised, so scale rows are evenly spaced along the
  // body rather than bunching where the curve is tight.
  function spineAt(u, t, amp) {
    var x = KOI.cx - KOI.len * 0.5 + u * KOI.len;
    // A travelling wave whose amplitude grows toward the tail: a fish's head is
    // nearly still and its tail does the work.
    var env = Math.pow(u, 1.6);
    var y = KOI.cy + Math.sin(u * 5.2 - t * 2.1) * amp * env
      + Math.sin(t * 0.5) * 10;
    return { x: x, y: y };
  }
  function spineFrame(u, t, amp) {
    var d = 0.006;
    var a = spineAt(Math.max(0, u - d), t, amp);
    var b = spineAt(Math.min(1, u + d), t, amp);
    var tx = b.x - a.x, ty = b.y - a.y;
    var l = Math.hypot(tx, ty) || 1;
    return { tx: tx / l, ty: ty / l, nx: -ty / l, ny: tx / l };
  }
  // Half-width profile. Widest at ~28% (behind the head), tapering to a wrist.
  function bodyHalf(u) {
    var main;
    if (u < 0.3) main = 40 + Math.sin((u / 0.3) * Math.PI * 0.5) * 30;
    else {
      // The wrist keeps real width. Tapering a fish to a point is what makes
      // the tail read as a separate object stuck on the end.
      var v = (u - 0.3) / 0.7;
      main = 70 * Math.pow(1 - v, 0.6) + 13;
    }
    // Snout: a quarter-circle falloff over the first 12% of the body, so the
    // head rounds instead of ending in a wall.
    if (u < 0.12) {
      var n = u / 0.12;
      main *= Math.sqrt(Math.max(0, 1 - (1 - n) * (1 - n)));
    }
    return main;
  }

  function koiOutline(c, t, amp) {
    c.beginPath();
    var i, p, f, h;
    for (i = 0; i <= 60; i++) {
      var u = i / 60;
      p = spineAt(u, t, amp); f = spineFrame(u, t, amp); h = bodyHalf(u);
      var x = p.x + f.nx * h, y = p.y + f.ny * h;
      i === 0 ? c.moveTo(x, y) : c.lineTo(x, y);
    }
    for (i = 60; i >= 0; i--) {
      var u2 = i / 60;
      p = spineAt(u2, t, amp); f = spineFrame(u2, t, amp); h = bodyHalf(u2);
      c.lineTo(p.x - f.nx * h, p.y - f.ny * h);
    }
    c.closePath();
  }

  function drawKoi(c, st, t) {
    var amp = reduce ? 0 : 26;
    var tt = reduce ? 1.2 : t;

    // Water. The ground is a pond seen from above, so the light is overhead and
    // everything below it is being looked at THROUGH something.
    var wg = c.createLinearGradient(0, 0, 0, VH);
    wg.addColorStop(0, '#0d1a1d');
    wg.addColorStop(0.5, '#12262a');
    wg.addColorStop(1, '#0a1416');
    c.fillStyle = st === 0 ? '#0b0a09' : wg;
    c.fillRect(0, 0, VW, VH);

    if (st === 0) {
      c.strokeStyle = 'rgba(223,106,65,.55)';
      c.lineWidth = 1;
      c.setLineDash([4, 5]);
      c.beginPath();
      for (var ai = 0; ai <= 60; ai++) {
        var au = ai / 60, ap = spineAt(au, tt, amp);
        ai === 0 ? c.moveTo(ap.x, ap.y) : c.lineTo(ap.x, ap.y);
      }
      c.stroke();
      c.setLineDash([]);
      // Ribs: the half-width profile made visible as the thing it is.
      for (var ri = 0; ri <= 12; ri++) {
        var ru = ri / 12, rp = spineAt(ru, tt, amp), rf = spineFrame(ru, tt, amp), rh = bodyHalf(ru);
        c.strokeStyle = 'rgba(150,142,132,.45)';
        c.beginPath();
        c.moveTo(rp.x + rf.nx * rh, rp.y + rf.ny * rh);
        c.lineTo(rp.x - rf.nx * rh, rp.y - rf.ny * rh);
        c.stroke();
        c.fillStyle = '#df6a41';
        c.fillRect(rp.x - 2, rp.y - 2, 4, 4);
      }
      c.font = '500 11px ui-monospace, monospace';
      c.fillStyle = 'rgba(140,133,124,.7)';
      c.fillText('spine = arc-length parameterised   half-width peaks at u=0.28   tail amplitude ~ u^1.6', 120, VH - 34);
      return;
    }

    // Caustics on the pond floor, and the fish's own shadow below it.
    if (st >= 2) {
      c.save();
      c.globalAlpha = 0.16;
      for (var ci = 0; ci < 22; ci++) {
        var cu = (ci * 0.37 + tt * 0.05) % 1;
        var cx2 = cu * VW, cy2 = ((ci * 137) % VH);
        var cg = c.createRadialGradient(cx2, cy2, 2, cx2, cy2, 60 + (ci % 4) * 22);
        cg.addColorStop(0, 'rgba(150,220,224,.5)');
        cg.addColorStop(1, 'rgba(150,220,224,0)');
        c.fillStyle = cg;
        c.fillRect(cx2 - 90, cy2 - 90, 180, 180);
      }
      c.restore();

      c.save();
      c.translate(26, 46);
      c.globalAlpha = 0.4;
      c.filter = 'blur(9px)';
      koiOutline(c, tt, amp);
      c.fillStyle = '#050c0d';
      c.fill();
      c.restore();
    }

    /* ------------------------------------------------------------------ fins */
    // Behind the body, and a beat late: follow-through, driven by sampling the
    // spine at an earlier time rather than by a separate eased curve.
    function fin(u, side, len, spread, phase) {
      var lag = tt - phase;
      var p = spineAt(u, lag, amp), f = spineFrame(u, lag, amp), h = bodyHalf(u);
      var bx = p.x + f.nx * h * side, by = p.y + f.ny * h * side;
      var sway = Math.sin(lag * 2.4 + u * 4) * 0.3;
      c.save();
      c.translate(bx, by);
      c.rotate(Math.atan2(f.ty, f.tx) + side * (spread + sway));
      c.beginPath();
      c.moveTo(0, 0);
      c.quadraticCurveTo(len * 0.44, side * len * 0.52, len * 0.94, side * len * 0.78);
      c.quadraticCurveTo(len * 0.72, side * len * 0.12, 0, 0);
      c.closePath();
      var fg = c.createLinearGradient(0, 0, len, side * len * 0.4);
      fg.addColorStop(0, 'rgba(250,238,228,.7)');
      fg.addColorStop(1, 'rgba(238,206,190,.16)');
      c.fillStyle = st === 1 ? 'rgba(120,116,110,.5)' : fg;
      c.fill();
      if (st >= 3) {
        // Rays. A translucent fin without them is a plastic flipper.
        for (var k = 1; k < 9; k++) {
          var kk = k / 9;
          c.beginPath();
          c.moveTo(0, 0);
          c.quadraticCurveTo(len * 0.44, side * len * 0.52 * kk, len * (0.5 + kk * 0.44), side * len * 0.78 * kk);
          c.strokeStyle = 'rgba(210,168,150,.3)';
          c.lineWidth = 0.9;
          c.stroke();
        }
      }
      if (st === 1) { c.strokeStyle = 'rgba(226,214,196,.6)'; c.lineWidth = 1.2; c.stroke(); }
      c.restore();
    }

    fin(0.32, 1, 84, 0.55, 0.07);
    fin(0.32, -1, 80, 0.58, 0.09);
    fin(0.64, 1, 54, 0.72, 0.11);
    fin(0.64, -1, 52, 0.75, 0.12);

    // Caudal fin: two lobes, sampled a full beat behind the wrist.
    (function () {
      var lag = tt - 0.13;
      var p = spineAt(0.965, lag, amp), f = spineFrame(0.965, lag, amp);
      c.save();
      c.translate(p.x, p.y);
      c.rotate(Math.atan2(f.ty, f.tx));
      [1, -1].forEach(function (side) {
        c.beginPath();
        c.moveTo(0, 0);
        c.bezierCurveTo(52, side * 14, 96, side * 44, 122, side * 74);
        c.bezierCurveTo(88, side * 46, 46, side * 20, 0, 0);
        c.closePath();
        var tg = c.createLinearGradient(0, 0, 120, side * 70);
        tg.addColorStop(0, 'rgba(252,242,232,.78)');
        tg.addColorStop(1, 'rgba(240,208,190,.1)');
        c.fillStyle = st === 1 ? 'rgba(120,116,110,.5)' : tg;
        c.fill();
        if (st === 1) { c.strokeStyle = 'rgba(226,214,196,.6)'; c.lineWidth = 1.2; c.stroke(); }
        if (st >= 3) {
          for (var k = 1; k < 10; k++) {
            var kk = k / 10;
            c.beginPath();
            c.moveTo(0, 0);
            c.bezierCurveTo(52, side * 14 * kk, 96, side * 44 * kk, 120 * (0.5 + kk * 0.5), side * 74 * kk);
            c.strokeStyle = 'rgba(214,172,152,.26)';
            c.lineWidth = 0.9;
            c.stroke();
          }
        }
      });
      c.restore();
    })();

    /* ------------------------------------------------------------------ body */
    c.save();
    koiOutline(c, tt, amp);
    if (st === 1) {
      c.fillStyle = '#4a4740'; c.fill();
      c.strokeStyle = 'rgba(226,214,196,.7)'; c.lineWidth = 1.4; c.stroke();
      c.restore();
      return;
    }
    c.clip();

    // The body is a cylinder lit from above: the ridge along the spine takes the
    // key and both flanks fall away. The gradient has to follow the spine, not
    // the canvas, or the light slides off the fish as it swims.
    for (var bi = 0; bi < 60; bi++) {
      var bu = bi / 60, bu2 = (bi + 1) / 60;
      var bp = spineAt(bu, tt, amp), bf = spineFrame(bu, tt, amp), bh = bodyHalf(bu);
      var bp2 = spineAt(bu2, tt, amp), bf2 = spineFrame(bu2, tt, amp), bh2 = bodyHalf(bu2);
      var bg = c.createLinearGradient(
        bp.x + bf.nx * bh, bp.y + bf.ny * bh,
        bp.x - bf.nx * bh, bp.y - bf.ny * bh);
      bg.addColorStop(0, '#3d4a4c');
      bg.addColorStop(0.16, '#8d9088');
      bg.addColorStop(0.4, '#ded5c7');
      bg.addColorStop(0.52, '#f2ebdf');
      bg.addColorStop(0.78, '#c9c0b4');
      bg.addColorStop(1, '#3a4749');
      c.fillStyle = bg;
      c.beginPath();
      c.moveTo(bp.x + bf.nx * bh, bp.y + bf.ny * bh);
      c.lineTo(bp2.x + bf2.nx * bh2, bp2.y + bf2.ny * bh2);
      c.lineTo(bp2.x - bf2.nx * bh2, bp2.y - bf2.ny * bh2);
      c.lineTo(bp.x - bf.nx * bh, bp.y - bf.ny * bh);
      c.closePath();
      c.fill();
    }

    // Kohaku markings: two red plates, placed in the spine's own coordinates so
    // they travel with the body instead of floating over it.
    if (st >= 2) {
      [[0.16, 0.44, -0.1, 0.86, 3.1], [0.56, 0.8, 0.24, 0.66, 5.3]].forEach(function (m) {
        // The wandering edge is two slow harmonics of the curve parameter, not
        // per-vertex noise: a marking's boundary is soft and irregular at the
        // scale of the fish, not at the scale of a polyline segment.
        function edgeAt(k, side) {
          var w = k / 48;
          var wander = Math.sin(w * m[4] + side * 1.7) * 0.17 + Math.sin(w * (m[4] * 2.3) + side) * 0.08;
          return m[2] + side * m[3] * (Math.pow(Math.sin(w * Math.PI), 0.6) + wander * 0.8);
        }
        c.beginPath();
        for (var mi2 = 0; mi2 <= 48; mi2++) {
          var mu = lerp(m[0], m[1], mi2 / 48);
          var mp = spineAt(mu, tt, amp), mf = spineFrame(mu, tt, amp), mh = bodyHalf(mu);
          var edge = clamp(edgeAt(mi2, 1), -0.98, 0.98);
          var x = mp.x + mf.nx * mh * edge, y = mp.y + mf.ny * mh * edge;
          mi2 === 0 ? c.moveTo(x, y) : c.lineTo(x, y);
        }
        for (var mj = 48; mj >= 0; mj--) {
          var mu2 = lerp(m[0], m[1], mj / 48);
          var mp2 = spineAt(mu2, tt, amp), mf2 = spineFrame(mu2, tt, amp), mh2 = bodyHalf(mu2);
          var edge2 = clamp(edgeAt(mj, -1), -0.98, 0.98);
          c.lineTo(mp2.x + mf2.nx * mh2 * edge2, mp2.y + mf2.ny * mh2 * edge2);
        }
        c.closePath();
        var mg = c.createLinearGradient(0, KOI.cy - 70, 0, KOI.cy + 70);
        mg.addColorStop(0, '#a8340d');
        mg.addColorStop(0.5, '#d64f1a');
        mg.addColorStop(1, '#7e2708');
        c.fillStyle = mg;
        c.globalAlpha = 0.88;
        c.fill();
        c.globalAlpha = 1;
      });
    }

    /* Scales. Every one is placed from the spine's local frame at its own (u, v),
     * so the whole field is carried by the wave rather than painted on top of
     * it. The shading is per-scale: a scale on the flank turns away from the
     * overhead key and darkens, which is what gives the body its roundness at
     * this scale rather than the base gradient. */
    if (st >= 3) {
      var ROWS = 26, COLS = 11;
      for (var ru2 = 0; ru2 < ROWS; ru2++) {
        var su = 0.1 + (ru2 / ROWS) * 0.8;
        var sp = spineAt(su, tt, amp), sf = spineFrame(su, tt, amp), sh = bodyHalf(su);
        for (var cv = 0; cv < COLS; cv++) {
          var v = (cv / (COLS - 1)) * 2 - 1;
          v += (ru2 % 2 ? 0.5 : 0) / COLS;          // brick-lay the rows
          if (Math.abs(v) > 0.97) continue;
          var sx = sp.x + sf.nx * sh * v;
          var sy = sp.y + sf.ny * sh * v;
          var rr = 11 * (1 - Math.abs(v) * 0.28) * (1.05 - su * 0.4);
          // Local normal: v is the position around a cylinder, so the surface
          // tips away from the overhead key as |v| grows.
          var lam = Math.sqrt(Math.max(0, 1 - v * v));
          c.save();
          c.translate(sx, sy);
          c.rotate(Math.atan2(sf.ty, sf.tx));
          c.beginPath();
          c.arc(0, 0, rr, Math.PI * 0.62, Math.PI * 2 - Math.PI * 0.62);
          c.strokeStyle = 'rgba(60,30,14,' + (0.1 + (1 - lam) * 0.24).toFixed(2) + ')';
          c.lineWidth = 1.1;
          c.stroke();
          // A sliver of specular along the upper edge of each scale.
          c.beginPath();
          c.arc(0, -1.4, rr * 0.92, Math.PI * 0.7, Math.PI * 2 - Math.PI * 0.7);
          c.strokeStyle = 'rgba(255,252,244,' + (0.05 + lam * 0.2).toFixed(2) + ')';
          c.lineWidth = 1;
          c.stroke();
          c.restore();
        }
      }
    }

    if (st >= 4) {
      // Wet sheen from the surface above, and the shadow the body throws into
      // its own belly. The koi is under water, so the top of it is brighter than
      // any part of the scene and the underside falls into the water's colour.
      var sheen = c.createLinearGradient(0, KOI.cy - 90, 0, KOI.cy + 90);
      sheen.addColorStop(0, 'rgba(190,238,240,.2)');
      sheen.addColorStop(0.42, 'rgba(190,238,240,0)');
      sheen.addColorStop(1, 'rgba(6,32,36,.34)');
      c.fillStyle = sheen;
      c.fillRect(0, 0, VW, VH);
      c.globalAlpha = 0.55;
      c.drawImage(grain, 0, 0, VW, VH);
      c.globalAlpha = 1;
    }
    c.restore();

    /* ------------------------------------------------------------------ head */
    (function () {
      var p = spineAt(0.02, tt, amp), f = spineFrame(0.02, tt, amp);
      c.save();
      c.translate(p.x, p.y);
      c.rotate(Math.atan2(f.ty, f.tx));
      if (st >= 2) {
        // Gill plate. From above, the operculum is the one hard edge on an
        // otherwise soft head, and its absence is why a top-down fish reads as
        // a leaf. Drawn in the head's own frame so it turns with the body.
        [1, -1].forEach(function (side) {
          c.beginPath();
          c.moveTo(28, side * 8);
          c.quadraticCurveTo(34, side * 26, 24, side * 38);
          c.strokeStyle = 'rgba(58,44,34,.45)';
          c.lineWidth = 1.6;
          c.stroke();
        });
        // Snout: a soft crease running back from the mouth over the skull.
        var hg = c.createRadialGradient(-6, 0, 4, -6, 0, 54);
        hg.addColorStop(0, 'rgba(255,250,240,.22)');
        hg.addColorStop(1, 'rgba(255,250,240,0)');
        c.fillStyle = hg;
        c.fillRect(-60, -50, 120, 100);
      }
      // Eyes, on both sides: this is a top-down view, so both are visible.
      if (st >= 2) {
        [1, -1].forEach(function (side) {
          c.beginPath();
          c.ellipse(14, side * 22, 7, 6.5, 0, 0, Math.PI * 2);
          c.fillStyle = '#120c07'; c.fill();
          c.beginPath();
          c.arc(12, side * 20.4, 2.1, 0, Math.PI * 2);
          c.fillStyle = 'rgba(255,250,240,.75)'; c.fill();
        });
      }
      if (st >= 3) {
        // Barbels, and the mouth as a soft crease rather than a drawn line.
        [1, -1].forEach(function (side) {
          c.beginPath();
          c.moveTo(-16, side * 14);
          c.quadraticCurveTo(-34, side * (24 + Math.sin(tt * 3 + side) * 5), -46, side * (18 + Math.sin(tt * 3.4 + side) * 7));
          c.strokeStyle = 'rgba(226,196,176,.55)';
          c.lineWidth = 2.2;
          c.lineCap = 'round';
          c.stroke();
        });
        c.beginPath();
        c.moveTo(-20, -7);
        c.quadraticCurveTo(-26, 0, -20, 7);
        c.strokeStyle = 'rgba(90,44,22,.5)';
        c.lineWidth = 2;
        c.stroke();
      }
      c.restore();
    })();

    if (st >= 4) {
      // Surface ripple over everything: the whole scene is being viewed through
      // moving water, and nothing sells that like a distortion the fish cannot
      // escape from.
      c.save();
      c.globalAlpha = 0.13;
      c.strokeStyle = 'rgba(178,232,236,.6)';
      for (var wi = 0; wi < 5; wi++) {
        c.beginPath();
        for (var wj = 0; wj <= 60; wj++) {
          var wu = wj / 60;
          var wxp = wu * VW;
          var wyp = 26 + wi * 97 + (wi % 2 ? 34 : 0)
            + Math.sin(wu * 6.2 + tt * 0.7 + wi * 2.1) * 13
            + Math.sin(wu * 15 - tt * 0.4 + wi) * 5;
          wj === 0 ? c.moveTo(wxp, wyp) : c.lineTo(wxp, wyp);
        }
        c.lineWidth = 1.1;
        c.stroke();
      }
      c.restore();
    }
  }


  /* ==========================================================================
   * SUBJECT THREE - the hummingbird
   *
   * The hardest of the three, for a reason that has nothing to do with anatomy.
   *
   * A gorget is not coloured. It has no pigment worth speaking of: the barbules
   * are stacks of thin films a few hundred nanometres thick, and what you see is
   * light interfering with itself on the way back out. Which means the colour is
   * a function of the angle you are looking from, not a property of the bird -
   * turn the head fifteen degrees and a throat goes from crimson to black. This
   * is modelled here rather than faked: every gorget barbule has a normal, the
   * path difference through its film is computed from that normal against the
   * viewer, and the hue comes out of the interference. Nothing is keyframed. The
   * flash happens because the head turns.
   *
   * The wings are the other half. A hummingbird beats at fifty hertz and a
   * screen refreshes at sixty, so there is no honest single position to draw: at
   * any real shutter speed the wing IS the smear. So it is integrated - twenty-six
   * samples along the stroke, weighted by how long the wing spends at each, which
   * is longest at the reversals where it stops to turn around. That weighting is
   * why the blur has bright ends and a thin middle, and it is the difference
   * between motion blur and a fan of copies.
   * ========================================================================== */
  var BIRD = {
    tail: { x: 344, y: 300 },     // where the rectrices leave the body
    head: { x: 452, y: 216 },     // skull centre
    headR: 35,
    billTip: { x: 592, y: 152 },
    shoulder: { x: 424, y: 252 }
  };

  // hsl to rgb, because interference is naturally expressed as a hue sweep and
  // nothing else in this file needs a colour wheel.
  function hsl(h, sat, li) {
    h = ((h % 360) + 360) % 360 / 60;
    var cc = (1 - Math.abs(2 * li - 1)) * sat;
    var x = cc * (1 - Math.abs((h % 2) - 1));
    var m = li - cc / 2;
    var r = 0, g = 0, b = 0;
    if (h < 1) { r = cc; g = x; }
    else if (h < 2) { r = x; g = cc; }
    else if (h < 3) { g = cc; b = x; }
    else if (h < 4) { g = x; b = cc; }
    else if (h < 5) { r = x; b = cc; }
    else { r = cc; b = x; }
    return G.rgb((r + m) * 255, (g + m) * 255, (b + m) * 255);
  }

  // Body axis, tail to head. u = 0 at the tail base, 1 at the back of the skull.
  function birdAt(u) {
    return {
      x: lerp(BIRD.tail.x, BIRD.head.x, u),
      y: lerp(BIRD.tail.y, BIRD.head.y, u) + Math.sin(u * Math.PI) * 16
    };
  }
  function birdFrame(u) {
    var a = birdAt(Math.max(0, u - 0.01)), b = birdAt(Math.min(1, u + 0.01));
    var l = Math.hypot(b.x - a.x, b.y - a.y) || 1;
    return { tx: (b.x - a.x) / l, ty: (b.y - a.y) / l, nx: -(b.y - a.y) / l, ny: (b.x - a.x) / l };
  }
  // Half-width. A hummingbird is a teardrop: widest just behind the shoulder,
  // narrow at the wrist where the tail leaves.
  function birdHalf(u) {
    // Widest at the breast, just behind the shoulder, and it never tapers to a
    // point: the tail leaves a body that still has width.
    return 13 + Math.pow(Math.sin(Math.pow(u, 0.7) * Math.PI * 0.9), 0.62) * 33;
  }

  function birdBody(c) {
    var i, p, f, h;
    c.beginPath();
    for (i = 0; i <= 40; i++) {
      var u = i / 40; p = birdAt(u); f = birdFrame(u); h = birdHalf(u);
      var x = p.x + f.nx * h, y = p.y + f.ny * h;
      i === 0 ? c.moveTo(x, y) : c.lineTo(x, y);
    }
    c.arc(BIRD.head.x, BIRD.head.y, BIRD.headR, 0, Math.PI * 2);
    for (i = 40; i >= 0; i--) {
      var u2 = i / 40; p = birdAt(u2); f = birdFrame(u2); h = birdHalf(u2);
      c.lineTo(p.x - f.nx * h, p.y - f.ny * h);
    }
    c.closePath();
  }

  /* One wing, at one instant of the stroke.
   *
   * The blade is a long tapered vane hinged at the shoulder. Its chord narrows
   * as the wing approaches a reversal, because at that moment it is turning over
   * and presenting its edge to the viewer - which is also why the smear is
   * brightest there. */
  function birdWing(c, phase, alpha, st) {
    var sx = BIRD.shoulder.x, sy = BIRD.shoulder.y;
    var sweep = Math.sin(phase * Math.PI * 2);
    // The stroke plane of a hovering hummingbird is almost horizontal, tilted
    // back along the body: the wing sweeps fore and aft, not up and down. That
    // is the whole reason the bird can hold station.
    var ang = -0.62 + sweep * 1.12;
    var chord = 0.2 + 0.8 * Math.abs(Math.cos(phase * Math.PI * 2));
    var len = 138;

    c.save();
    c.translate(sx, sy);
    c.rotate(ang);
    c.globalAlpha = alpha;
    c.beginPath();
    c.moveTo(0, 0);
    c.bezierCurveTo(len * 0.36, -30 * chord, len * 0.78, -34 * chord, len, -6 * chord);
    c.bezierCurveTo(len * 0.74, 12 * chord, len * 0.34, 14 * chord, 0, 0);
    c.closePath();
    if (st === 1) {
      c.strokeStyle = 'rgba(226,214,196,.5)'; c.lineWidth = 1.2; c.stroke();
    } else {
      var wg = c.createLinearGradient(0, -20, len, 10);
      wg.addColorStop(0, 'rgba(52,48,44,.9)');
      wg.addColorStop(0.5, 'rgba(146,138,126,.72)');
      wg.addColorStop(1, 'rgba(206,198,184,.34)');
      c.fillStyle = wg;
      c.fill();
      if (st === 3) {
        // Primaries. Only at the texture stage: inside the finished smear these
        // are twenty-six overlapping fans of hairlines, which is just noise.
        for (var k = 1; k <= 9; k++) {
          var kk = k / 10;
          c.beginPath();
          c.moveTo(len * 0.1, 0);
          c.quadraticCurveTo(len * 0.6, -26 * chord * kk, len * (0.5 + kk * 0.5), -6 * chord * kk);
          c.strokeStyle = 'rgba(40,36,32,.22)';
          c.lineWidth = 0.9;
          c.stroke();
        }
      }
    }
    c.restore();
  }

  function drawBird(c, st, t) {
    var tt = reduce ? 0.6 : t;

    // The head turns. Everything the gorget does is downstream of this one
    // number, and it is a slow oscillation with a fast flick in it, because a
    // hummingbird's head does not sweep - it snaps and holds.
    var turnBase = Math.sin(tt * 0.55) * 0.5;
    var flick = Math.sin(tt * 2.1) * 0.12 * Math.max(0, Math.sin(tt * 0.37));
    var turn = pointer.inside ? (pointer.x - 0.5) * 1.5 : turnBase + flick;

    // Ground: an out-of-focus garden. It is a backdrop, so it gets exactly one
    // idea (warm light behind cool foliage) and no detail that could compete.
    var bg = c.createLinearGradient(0, 0, VW * 0.6, VH);
    bg.addColorStop(0, '#1c2418');
    bg.addColorStop(0.45, '#243021');
    bg.addColorStop(1, '#12180f');
    c.fillStyle = st === 0 ? '#0b0a09' : bg;
    c.fillRect(0, 0, VW, VH);

    if (st === 0) {
      c.strokeStyle = 'rgba(223,106,65,.55)';
      c.lineWidth = 1;
      c.setLineDash([4, 5]);
      c.beginPath();
      for (var ai = 0; ai <= 30; ai++) {
        var ap = birdAt(ai / 30);
        ai === 0 ? c.moveTo(ap.x, ap.y) : c.lineTo(ap.x, ap.y);
      }
      c.stroke();
      c.beginPath(); c.arc(BIRD.head.x, BIRD.head.y, BIRD.headR, 0, Math.PI * 2); c.stroke();
      // Bill, and the wing arc it has to balance against.
      c.beginPath();
      c.moveTo(BIRD.head.x + 24, BIRD.head.y - 12);
      c.lineTo(BIRD.billTip.x, BIRD.billTip.y);
      c.stroke();
      c.beginPath();
      c.arc(BIRD.shoulder.x, BIRD.shoulder.y, 138, -1.74, 0.5);
      c.stroke();
      c.setLineDash([]);
      for (var ri = 0; ri <= 10; ri++) {
        var ru = ri / 10, rp = birdAt(ru), rf = birdFrame(ru), rh = birdHalf(ru);
        c.strokeStyle = 'rgba(150,142,132,.4)';
        c.beginPath();
        c.moveTo(rp.x + rf.nx * rh, rp.y + rf.ny * rh);
        c.lineTo(rp.x - rf.nx * rh, rp.y - rf.ny * rh);
        c.stroke();
        c.fillStyle = '#df6a41';
        c.fillRect(rp.x - 2, rp.y - 2, 4, 4);
      }
      c.font = '500 11px ui-monospace, monospace';
      c.fillStyle = 'rgba(140,133,124,.7)';
      c.fillText('bill = 1.5 x skull   body = 2.2 x skull   stroke plane near horizontal, not vertical', 150, VH - 30);
      return;
    }

    if (st >= 2) {
      // Bokeh behind: the backdrop is a long lens wide open, which is the only
      // honest way to put a garden behind a bird without drawing a garden.
      for (var bi = 0; bi < 16; bi++) {
        var bx = ((bi * 197) % 900), by = ((bi * 311) % 420) + 20;
        var br = 26 + (bi % 5) * 22;
        var bgl = c.createRadialGradient(bx, by, 1, bx, by, br);
        var warm = bi % 3 === 0;
        bgl.addColorStop(0, warm ? 'rgba(214,176,96,.16)' : 'rgba(126,168,110,.13)');
        bgl.addColorStop(1, 'rgba(0,0,0,0)');
        c.fillStyle = bgl;
        c.fillRect(bx - br, by - br, br * 2, br * 2);
      }
    }

    /* ------------------------------------------------------------- the flower */
    if (st >= 2) {
      var fx = 690, fy = 132;
      c.save();
      c.translate(fx, fy);
      c.rotate(-0.5);
      for (var pe = 0; pe < 5; pe++) {
        c.save();
        c.rotate((pe / 5) * Math.PI * 2 + 0.3);
        c.beginPath();
        c.moveTo(0, 0);
        c.bezierCurveTo(24, -18, 58, -20, 70, 0);
        c.bezierCurveTo(58, 20, 24, 18, 0, 0);
        c.closePath();
        var pg = c.createLinearGradient(0, 0, 70, 0);
        pg.addColorStop(0, '#8e2440');
        pg.addColorStop(0.5, '#c94b64');
        pg.addColorStop(1, '#e8829a');
        c.fillStyle = pg;
        c.fill();
        if (st >= 3) {
          // Veins run to the petal tip, and they are what makes a petal read as
          // a surface rather than a swatch.
          for (var v2 = 0; v2 < 5; v2++) {
            var vv = (v2 - 2) / 2;
            c.beginPath();
            c.moveTo(4, 0);
            c.quadraticCurveTo(34, vv * 13, 66, vv * 4);
            c.strokeStyle = 'rgba(255,208,220,.2)';
            c.lineWidth = 0.8;
            c.stroke();
          }
        }
        c.restore();
      }
      // Throat of the corolla, and the stamens the bird is actually here for.
      var tg = c.createRadialGradient(0, 0, 2, 0, 0, 26);
      tg.addColorStop(0, '#3d0c1a');
      tg.addColorStop(1, '#96304a');
      c.fillStyle = tg;
      c.beginPath(); c.arc(0, 0, 20, 0, Math.PI * 2); c.fill();
      if (st >= 4) {
        for (var sm = 0; sm < 6; sm++) {
          var sa = -0.9 + sm * 0.24;
          c.beginPath();
          c.moveTo(0, 0);
          c.quadraticCurveTo(Math.cos(sa) * 30, Math.sin(sa) * 30 - 8, Math.cos(sa) * 46, Math.sin(sa) * 46 - 6);
          c.strokeStyle = 'rgba(246,226,178,.6)';
          c.lineWidth = 1.3;
          c.stroke();
          c.beginPath();
          c.arc(Math.cos(sa) * 46, Math.sin(sa) * 46 - 6, 2.6, 0, Math.PI * 2);
          c.fillStyle = '#f2d78e';
          c.fill();
        }
      }
      c.restore();
    }

    /* --------------------------------------------------------- the far wing */
    // Behind the body, dimmer, a half-beat out of phase: the two wings of a
    // hovering bird are not synchronised on screen because one is further away.
    var beat = tt * 3.1;
    if (st >= 1) {
      for (var w1 = 0; w1 < 26; w1++) {
        var ph1 = beat + 0.5 + w1 / 26;
        // Weighted by dwell: the wing spends longest where it is reversing, so
        // that is where the smear is dense. A flat weight is a fan of copies.
        var dwell1 = 0.3 + 0.7 * (1 - Math.abs(Math.cos(ph1 * Math.PI * 2)));
        birdWing(c, ph1, 0.036 * dwell1 * (st === 1 ? 3 : 1), st);
      }
    }

    /* ------------------------------------------------------------- the body */
    c.save();
    birdBody(c);
    if (st === 1) {
      c.fillStyle = '#4a4740'; c.fill();
      c.strokeStyle = 'rgba(226,214,196,.7)'; c.lineWidth = 1.4; c.stroke();
      c.restore();
    } else {
      c.clip();
      // Base mass: a small dark bird under an overhead key, belly bounced from
      // the leaves below, which is why the underside is green rather than grey.
      var body = c.createLinearGradient(0, BIRD.head.y - 70, 0, BIRD.tail.y + 40);
      body.addColorStop(0, '#5c6b3a');
      body.addColorStop(0.4, '#2f3a22');
      body.addColorStop(0.75, '#1d2417');
      body.addColorStop(1, '#2a3320');
      c.fillStyle = body;
      c.fillRect(0, 0, VW, VH);

      if (st >= 3) {
        /* Contour feathers. Each is placed in the body's own frame at its (u, v),
         * scaled by the local half-width and rotated to lie along the axis, so
         * the whole coat follows the form instead of being stamped over it. They
         * are drawn tail-first: a feather overlaps the one behind it, and getting
         * that order backwards is what makes plumage look like scales. */
        var fr2 = rng(70707);
        for (var row = 0; row < 30; row++) {
          var bu = 0.02 + (row / 30) * 0.99;
          var bp = birdAt(bu), bf = birdFrame(bu), bh = birdHalf(bu);
          var cols = 11;
          for (var cv = 0; cv < cols; cv++) {
            // Jittered on both axes. A regular lattice of feathers is chain mail;
            // what makes a coat read as a coat is that no two rows line up and
            // every feather is a little longer or shorter than its neighbour.
            var v = ((cv + (row % 2) * 0.5) / (cols - 1)) * 2 - 1 + (fr2() - 0.5) * 0.16;
            if (Math.abs(v) > 1.04) continue;
            var jitU = (fr2() - 0.5) * 0.022;
            var bp2 = birdAt(clamp(bu + jitU, 0, 1));
            var fx2 = bp2.x + bf.nx * bh * v;
            var fy2 = bp2.y + bf.ny * bh * v;
            var lam = Math.sqrt(Math.max(0, 1 - v * v));   // local normal
            if (Math.abs(v) > 0.88) continue;
            var size = (3.8 + fr2() * 2.1) * (0.66 + lam * 0.44);
            // Back is iridescent green, belly is pale. The transition is the
            // bird's own waterline and it sits low, not at the equator.
            var backness = clamp((-v + 0.25) / 1.1, 0, 1);
            var base = backness > 0.5
              ? hsl(98 + backness * 26, 0.38, 0.12 + lam * 0.13)
              : hsl(66, 0.1, 0.24 + lam * 0.2);
            c.save();
            c.translate(fx2, fy2);
            // Feathers point back along the body and splay outward from the
            // midline, which is the direction water would run off them.
            c.rotate(Math.atan2(bf.ty, bf.tx) + Math.PI + v * 0.5 + (fr2() - 0.5) * 0.24);
            c.beginPath();
            c.moveTo(-size * 1.05, 0);
            c.quadraticCurveTo(-size * 0.1, -size * 0.74, size * 0.95, 0);
            c.quadraticCurveTo(-size * 0.1, size * 0.74, -size * 1.05, 0);
            c.closePath();
            c.fillStyle = base;
            c.fill();
            // One hairline of shadow along the trailing edge only. A full
            // outline turns every feather into a sequin.
            c.beginPath();
            c.moveTo(-size * 1.05, 0);
            c.quadraticCurveTo(-size * 0.1, size * 0.74, size * 0.95, 0);
            c.strokeStyle = 'rgba(8,12,7,.2)';
            c.lineWidth = 0.5;
            c.stroke();
            c.restore();
          }
        }
      }

      if (st >= 4) {
        /* The gorget.
         *
         * Structural colour, computed. Each barbule sits at an angle on the
         * throat; the path difference through its thin film goes as the cosine
         * of that angle against the viewer, and hue follows the path difference.
         * So a barbule pointing straight at you fires crimson, its neighbour
         * thirty degrees off fires gold, and the one past that goes black - and
         * when the head turns, the whole plate sweeps through the sequence.
         * Nothing here is a keyframe or a gradient: turn is one number, and the
         * flash is what falls out of it. */
        var gr = rng(313131);
        // The throat: an ellipse hung under the chin and running back onto the
        // breast, tilted to follow the body axis.
        var thX = BIRD.head.x - 4, thY = BIRD.head.y + 26;
        for (var gi = 0; gi < 300; gi++) {
          var ga = gr(), gb = Math.sqrt(gr());       // sqrt: even area, not even radius
          var gang = ga * Math.PI * 2;
          var gx = thX + Math.cos(gang) * gb * 34;
          var gy = thY + Math.sin(gang) * gb * 22 + Math.cos(gang) * gb * 9;
          // Barbule normal: the throat is a curved plate, so a barbule near its
          // edge points further off-axis than one at its centre. Then the whole
          // plate turns with the head.
          var nAng = Math.cos(gang) * gb * 1.15 + turn;
          var cosT = Math.cos(nAng);
          // Thin-film path difference, normalised. Hue sweeps ~140 degrees over
          // the useful range, which is what a real gorget does.
          var pathd = clamp(cosT, -1, 1);
          var hue = 348 - (1 - pathd) * 132;
          // Off-axis barbules do not just shift hue, they stop returning light
          // at all. That extinction is the reason a gorget can look black.
          var amp = Math.pow(clamp(pathd, 0, 1), 2.6);
          if (amp < 0.02) {
            c.fillStyle = 'rgba(18,12,10,.55)';
          } else {
            c.fillStyle = hsl(hue, 0.72 + amp * 0.24, 0.16 + amp * 0.42);
          }
          c.save();
          c.translate(gx, gy);
          c.rotate(gang + 1.6);
          c.beginPath();
          c.ellipse(0, 0, 4.6, 2.3, 0, 0, Math.PI * 2);
          c.fill();
          c.restore();
        }
      }
      c.restore();
    }

    /* --------------------------------------------------------------- tail */
    if (st >= 1) {
      c.save();
      for (var ti = 0; ti < 5; ti++) {
        var ta = -0.06 + (ti - 2) * 0.15 + Math.sin(tt * 1.3 + ti) * 0.025;
        c.save();
        c.translate(BIRD.tail.x + 6, BIRD.tail.y - 8);
        c.rotate(Math.PI + 0.5 + ta);
        c.beginPath();
        c.moveTo(0, 0);
        c.quadraticCurveTo(34, -8, 74, -3);
        c.quadraticCurveTo(36, 7, 0, 0);
        c.closePath();
        if (st === 1) {
          c.strokeStyle = 'rgba(226,214,196,.55)'; c.lineWidth = 1.2; c.stroke();
        } else {
          var tg2 = c.createLinearGradient(0, 0, 96, 0);
          tg2.addColorStop(0, '#232b1c');
          tg2.addColorStop(0.7, '#39442c');
          tg2.addColorStop(1, '#1a2015');
          c.fillStyle = tg2;
          c.fill();
          if (st >= 3) {
            for (var tv = 1; tv < 7; tv++) {
              c.beginPath();
              c.moveTo(5, 0);
              c.quadraticCurveTo(38, -6 * (tv / 7), 70 * (0.5 + tv / 14), -2 * (tv / 7));
              c.strokeStyle = 'rgba(12,16,10,.3)';
              c.lineWidth = 0.8;
              c.stroke();
            }
          }
        }
        c.restore();
      }
      c.restore();
    }

    /* ---------------------------------------------------------- head detail */
    if (st >= 2) {
      // Bill: two mandibles, not one line. The gape between them is the detail
      // that makes a bill read as a tool rather than a spike.
      c.save();
      var bx0 = BIRD.head.x + 24, by0 = BIRD.head.y - 12;
      var bx1 = BIRD.billTip.x, by1 = BIRD.billTip.y;
      // Two mandibles with a gape between them, tapering to a point. A bill
      // drawn as one line is a spike; the gape is what makes it a tool.
      c.beginPath();
      c.moveTo(bx0, by0 - 5);
      c.quadraticCurveTo((bx0 + bx1) / 2, (by0 + by1) / 2 - 5, bx1, by1);
      c.quadraticCurveTo((bx0 + bx1) / 2, (by0 + by1) / 2 + 3, bx0, by0 + 6);
      c.closePath();
      var bill = c.createLinearGradient(bx0, by0, bx1, by1);
      bill.addColorStop(0, '#100e0c');
      bill.addColorStop(0.55, '#282320');
      bill.addColorStop(1, '#0b0a09');
      c.fillStyle = bill;
      c.fill();
      // The culmen catches a thread of the key along its whole length.
      c.beginPath();
      c.moveTo(bx0 + 2, by0 - 4);
      c.quadraticCurveTo((bx0 + bx1) / 2, (by0 + by1) / 2 - 4.5, bx1 - 2, by1 + 0.5);
      c.strokeStyle = 'rgba(206,198,182,.26)';
      c.lineWidth = 0.9;
      c.stroke();
      c.restore();

      // Eye: black, wet, with one small hard catchlight and a pale crescent
      // behind it. The white spot behind a hummingbird's eye is diagnostic.
      c.beginPath();
      c.arc(BIRD.head.x + 9, BIRD.head.y - 8, 6.4, 0, Math.PI * 2);
      c.fillStyle = '#080706'; c.fill();
      if (st >= 4) {
        c.beginPath();
        c.arc(BIRD.head.x + 6.8, BIRD.head.y - 10.2, 1.9, 0, Math.PI * 2);
        c.fillStyle = 'rgba(250,248,242,.92)'; c.fill();
        // The pale spot behind the eye. It is diagnostic, and leaving it out is
        // what makes a drawn hummingbird read as a generic small bird.
        c.beginPath();
        c.ellipse(BIRD.head.x - 3, BIRD.head.y - 6, 5.5, 2.6, -0.35, 0, Math.PI * 2);
        c.fillStyle = 'rgba(236,230,214,.55)'; c.fill();
      }
    }

    /* --------------------------------------------------------- the near wing */
    if (st >= 1) {
      for (var w2 = 0; w2 < 26; w2++) {
        var ph2 = beat + w2 / 26;
        var dwell2 = 0.3 + 0.7 * (1 - Math.abs(Math.cos(ph2 * Math.PI * 2)));
        birdWing(c, ph2, 0.05 * dwell2 * (st === 1 ? 3 : 1), st);
      }
    }

    if (st >= 4) {
      c.save();
      c.globalAlpha = 0.5;
      c.drawImage(grain, 0, 0, VW, VH);
      c.restore();
    }
    c.globalAlpha = 1;
  }

  var NOTES = {
    eye: 'Four hundred and sixty iris fibres, each with its own length, bow, width and value, drawn once into a layer and composited. The collarette is a wobbled path rather than a circle, the crypts sit inside it, and the vessels thin as they approach the limbus. The detail almost nobody draws is the caustic: light entering from the key refracts through the cornea and lands as a bright crescent on the far side of the iris, paired with the shadow the corneal overhang throws on the key side. The catchlight is a window with four panes, because a round white dot is what a drawn eye has and a photographed one never does.',
    koi: 'The body is a spine carrying a travelling wave whose amplitude grows as u^1.6, so the head is nearly still and the tail does the work. Two hundred and eighty-six scales are placed in the spine’s local frame at their own (u, v) and shaded by the local normal, which means the wave carries them instead of sliding underneath them. Fins sample the spine at an earlier time rather than running their own easing curve: that lag is follow-through, and it is why they trail the turn instead of leading it.',
    bird: 'A gorget has almost no pigment in it. The barbules are stacks of thin films, and the colour you see is light interfering with itself on the way back out, which makes it a function of viewing angle rather than a property of the bird. That is modelled here rather than painted: three hundred barbules each have a normal, the path difference through the film is computed against the viewer, and hue and extinction both fall out of it. The head turn is one number. The flash is the consequence. The wings are integrated rather than posed — twenty-six samples across the stroke, weighted by dwell time, which is longest at the reversals, and that weighting is the difference between motion blur and a fan of copies. Move the pointer to steer the head.'
  };

  function render(t) {
    if (subject === 'eye') drawEye(ctx, stage, t);
    else if (subject === 'koi') drawKoi(ctx, stage, t);
    else drawBird(ctx, stage, t);
  }

  function setStage(i, quiet) {
    stage = i;
    root.querySelectorAll('[data-stage-btn]').forEach(function (b) {
      b.setAttribute('aria-pressed', String(+b.getAttribute('data-stage-btn') === i));
    });
    if (!quiet) playing = false;
    if (reduce) render(1.2);
  }

  root.querySelectorAll('[data-stage-btn]').forEach(function (btn) {
    btn.addEventListener('click', function () { setStage(+btn.getAttribute('data-stage-btn')); });
  });

  root.querySelectorAll('[data-subject]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      subject = btn.getAttribute('data-subject');
      root.querySelectorAll('[data-subject]').forEach(function (b) {
        b.setAttribute('aria-pressed', String(b === btn));
      });
      if (noteEl) noteEl.textContent = NOTES[subject];
      setStage(4);
      if (reduce) render(1.2);
    });
  });

  var playBtn = root.querySelector('[data-play-build]');
  if (playBtn) {
    playBtn.addEventListener('click', function () {
      playing = true; playT = 0; setStage(0, true);
    });
  }

  window.addEventListener('resize', function () {
    ctx = G.fitCanvas(canvas, VW, VH);
    plate.key = '';                  // the plates are sized to the backing store
    if (reduce) render(1.2);
  }, { passive: true });

  canvas.addEventListener('pointermove', function (e) {
    var r = canvas.getBoundingClientRect();
    pointer.x = (e.clientX - r.left) / r.width;
    pointer.y = (e.clientY - r.top) / r.height;
    pointer.inside = true;
  }, { passive: true });
  canvas.addEventListener('pointerleave', function () { pointer.inside = false; }, { passive: true });

  if (noteEl) noteEl.textContent = NOTES.eye;

  if (reduce) { render(1.2); return {}; }

  return {
    frame: function (dt, t) {
      if (playing) {
        // Each stage holds long enough to be read, which is the one place on
        // this page where a long duration is right: the animation is the
        // explanation, not a transition between two states.
        playT += dt;
        var idx = Math.min(4, Math.floor(playT / 1.25));
        if (idx !== stage) setStage(idx, true);
        if (playT > 6.6) playing = false;
      }
      render(t);
    }
  };
});
