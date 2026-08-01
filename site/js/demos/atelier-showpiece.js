/* canvas-atelier — the showpieces.
 *
 * A sphere proves the shading model. It does not prove the skill. What actually
 * separates an illustrator from a `ctx.arc()` call is whether the process
 * survives contact with a subject that has hundreds of parts, none of which can
 * be placed by eye and all of which have to agree with each other.
 *
 * So: three subjects that are genuinely hard, and hard in three different ways.
 *
 * A macro human eye, where the iris is four hundred individually shaded fibres,
 * the sclera is a lit sphere seen through a wet aperture, and the giveaway
 * detail is the caustic - light refracting through the cornea and landing as a
 * bright crescent on the far side of the iris, opposite the key. That one is
 * about observation: hundreds of small truths, every one of which is only worth
 * anything because the others are there too.
 *
 * A koi, where the body is nearly three hundred overlapping scales that each
 * have to follow a surface travelling down a spine, with translucent fins whose
 * ray structure shows through. That one is about form in motion: the wave is
 * the subject, and everything on the fish is carried by it rather than
 * animated alongside it.
 *
 * And a watch movement, where nothing at all can be placed by eye. Every wheel
 * centre is the sum of two pitch radii, every tooth is an epicycloid generated
 * by a rolling circle, and the whole train runs off one number. That one is
 * about derivation, which is the faculty this skill actually leans on - and it
 * is the case where guessing a coordinate does not look slightly wrong, it
 * stops the mechanism meshing.
 *
 * All three are drawn the way the skill argues for and can be stepped through it:
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
   * SUBJECT THREE - the movement
   *
   * A watch movement, seen from the back with the dial side away, running.
   *
   * The eye and the koi are soft things: the test they set is whether hundreds
   * of parts can be placed so they agree with each other. This one sets a
   * different test, which is the one the skill is really about. A movement is
   * not observed, it is *specified*. Every distance in it is a consequence of a
   * tooth count, and a wheel drawn a few pixels off its true centre stops
   * meshing - visibly, immediately, in a way no amount of shading rescues. You
   * cannot draw this by eye. You have to derive it.
   *
   * So it is derived. The going train is a real one:
   *
   *   balance      18,000 A/h    2.5 Hz, five beats a second
   *   escape       15 teeth      one tooth per oscillation -> 6 s/rev
   *   fourth       60 teeth      escape pinion 6  -> 10:1  -> 1 rev/min
   *   third        60 teeth      fourth pinion 8  -> 7.5:1 -> 1 rev/7.5 min
   *   centre       64 teeth      third pinion 8   -> 8:1   -> 1 rev/hour
   *   barrel       72 teeth      centre pinion 12 -> 6:1   -> 1 rev/6 hours
   *
   * 7.5 x 8 = 60, which is the whole point of a going train: the minute hand
   * and the hour hand are the same number, factored. Every wheel centre below
   * is placed by adding the two meshing pitch radii and stepping off at an
   * angle, so the train is laid out the way a watchmaker lays it out, and the
   * one number that drives all of it at runtime is the balance angle.
   *
   * The teeth are cycloidal, not involute. Industrial gearing went involute
   * because it tolerates centre-distance error; horology stayed with cycloidal
   * because it runs with less friction at the low torque and the high ratios a
   * watch works at, and because it will still transmit when the pinion has only
   * six leaves. The addendum flanks here are real epicycloids, generated by
   * rolling a circle on the pitch circle, and the dedendum flanks are radial.
   *
   * And the material idea, which is the reason a movement is worth drawing at
   * all: metal is anisotropic. A polished sphere reflects a light as a point. A
   * grained surface reflects it as a *line, perpendicular to the grain* - which
   * is why the highlight on a circular-grained wheel is a bar sweeping across
   * it rather than a spot sitting on it, and why Geneva stripes flare in
   * sequence rather than all at once. That is not a texture, it is a shading
   * model, and it is the entire difference between metal and grey plastic. Move
   * the pointer and the grain lights up, because you are moving the lamp.
   * ========================================================================== */

  /* Designed at a plate radius of 218 and drawn at S times that, so every
   * number below can stay in the units the layout was reasoned in. */
  var MV_S = 1.43, MV_CX = 448, MV_CY = 236, MV_R = 200;

  // Step off a centre distance at an angle. Canvas y is down, so an angle of 90
  // degrees points at the bottom of the frame.
  function step(p, dist, deg) {
    var a = deg * Math.PI / 180;
    return { x: p.x + Math.cos(a) * dist, y: p.y + Math.sin(a) * dist };
  }

  /* The train. Pitch radii, tooth counts, and the pinion each wheel drives
   * through. Centre distances are the sum of the two meshing pitch radii -
   * asserted here rather than measured off a drawing, because a centre distance
   * guessed to the nearest pixel is a mesh that does not close. */
  var MV = {};
  /* The centre wheel is at the centre of the plate. That is not a composition
   * choice - it is where the name comes from, and it is the fixed point the
   * whole layout hangs off, because the minute hand is pressed onto its arbor
   * and the arbor has to come out through the middle of the dial. Laying the
   * train out from anywhere else is the first thing that makes a drawn
   * movement look invented. */
  MV.centre = { x: 0, y: 0, rw: 58, teeth: 64, rp: 14, leaves: 12, gen: 11 };
  MV.barrel = { rw: 82, teeth: 72, rp: 0, leaves: 0, gen: 14 };
  MV.third  = { rw: 48, teeth: 60, rp: 11, leaves: 8, gen: 9 };
  MV.fourth = { rw: 40, teeth: 60, rp: 9,  leaves: 8, gen: 6 };
  MV.escape = { rw: 26, teeth: 15, rp: 6,  leaves: 6, gen: 4 };

  (function layTrain() {
    var c;
    // Power flows barrel -> centre -> third -> fourth -> escape, but the layout
    // is stepped off from the centre outward in both directions, because the
    // centre is the only wheel whose position is not free.
    c = step(MV.centre, MV.barrel.rw + MV.centre.rp, -125);
    MV.barrel.x = c.x; MV.barrel.y = c.y;
    c = step(MV.centre, MV.centre.rw + MV.third.rp, 25);
    MV.third.x = c.x; MV.third.y = c.y;
    c = step(MV.third, MV.third.rw + MV.fourth.rp, 118);
    MV.fourth.x = c.x; MV.fourth.y = c.y;
    c = step(MV.fourth, MV.fourth.rw + MV.escape.rp, 190);
    MV.escape.x = c.x; MV.escape.y = c.y;
    // The escapement is not part of the going train's arithmetic: the fork sits
    // where the pallet jewels can reach the escape teeth, and the balance sits
    // where the roller jewel can reach the fork slot. Both are distances, not
    // ratios.
    MV.fork = step(MV.escape, 44, 168);
    MV.balance = step(MV.fork, 44, 150);
    MV.balR = 56;            // outer radius of the balance rim
    MV.rollerR = 10;         // radius the impulse jewel orbits at
  })();

  /* ------------------------------------------------------------ teeth ----
   * One epicycloidal tooth flank, from the pitch circle outward. The rolling
   * circle is the generator: roll a circle of radius rGen on the outside of the
   * pitch circle and a point on its rim traces the curve a watch tooth's
   * working face actually has. */
  function flank(rp, rGen, top) {
    var pts = [], k = (rp + rGen) / rGen;
    // Stepped finely and cut at the addendum rather than sampled over a fixed
    // span: the working height of a watch tooth is about one module, which on
    // a seventy-two tooth wheel at this scale is under three pixels, and a
    // parametrisation tuned for a big gear walks straight past it in one step.
    for (var i = 0; i <= 60; i++) {
      var th = i * 0.02;
      var x = (rp + rGen) * Math.cos(th) - rGen * Math.cos(k * th);
      var y = (rp + rGen) * Math.sin(th) - rGen * Math.sin(k * th);
      var r = Math.hypot(x, y);
      pts.push({ a: Math.atan2(y, x), r: Math.min(r, top) });
      if (r >= top) break;
    }
    return pts;
  }

  /* A wheel's outline: N cycloidal teeth around a pitch circle.
   *
   * The tooth is symmetric about its own centre line, half a circular pitch
   * thick at the pitch circle, with radial flanks below it and epicycloid
   * flanks above. Drawing the whole rim as one path rather than N paths matters
   * here: a seventy-two tooth wheel stroked tooth by tooth shows a seam at
   * every join, and at this line weight the seams are the only thing you see.
   */
  function gearPath(c, w, N, rp, rGen) {
    var m = 2 * rp / N;                 // module
    var top = rp + m * 0.95;            // addendum
    var root = rp - m * 1.25;           // dedendum
    var half = Math.PI / N;             // half tooth thickness, in angle
    // The generating circle is the pitch circle of the pinion this wheel drives
    // into. That is not a stylistic parameter: it is the condition under which
    // an epicycloid tooth and a radial pinion leaf roll on each other instead
    // of sliding, which is the whole reason to use cycloidal teeth.
    var f = flank(rp, rGen || rp * 0.16, top);
    var i, j, A, p;
    c.beginPath();
    for (i = 0; i < N; i++) {
      A = (i / N) * Math.PI * 2;
      // up the leading flank
      c.lineTo(w.x + Math.cos(A - half) * root, w.y + Math.sin(A - half) * root);
      for (j = 0; j < f.length; j++) {
        p = f[j];
        c.lineTo(w.x + Math.cos(A - half + p.a) * p.r, w.y + Math.sin(A - half + p.a) * p.r);
      }
      // down the trailing flank, mirrored
      for (j = f.length - 1; j >= 0; j--) {
        p = f[j];
        c.lineTo(w.x + Math.cos(A + half - p.a) * p.r, w.y + Math.sin(A + half - p.a) * p.r);
      }
      c.lineTo(w.x + Math.cos(A + half) * root, w.y + Math.sin(A + half) * root);
    }
    c.closePath();
  }

  /* The escape wheel is the exception. Its teeth are club-toothed: a pointed
   * locking corner, then a flat impulse face that the pallet slides along. They
   * are not gear teeth at all - they never mesh with anything, they hand energy
   * to a jewel - and drawing them as gear teeth is the single most common tell
   * in a drawn movement. */
  function escapePath(c, w, N, r) {
    var i, A, sp = Math.PI * 2 / N;
    function at(ang, rad) { return { x: w.x + Math.cos(ang) * rad, y: w.y + Math.sin(ang) * rad }; }
    c.beginPath();
    for (i = 0; i < N; i++) {
      A = (i / N) * Math.PI * 2;
      var a = at(A, r * 0.62);                    // root
      var b = at(A + sp * 0.06, r);               // locking corner
      var d = at(A + sp * 0.30, r * 0.985);       // along the impulse face
      var e = at(A + sp * 0.34, r * 0.80);        // back of the club
      var g = at(A + sp * 0.62, r * 0.60);        // undercut, into the next root
      if (i === 0) c.moveTo(a.x, a.y); else c.lineTo(a.x, a.y);
      c.lineTo(b.x, b.y); c.lineTo(d.x, d.y); c.lineTo(e.x, e.y);
      c.quadraticCurveTo(w.x + Math.cos(A + sp * 0.5) * r * 0.55,
                         w.y + Math.sin(A + sp * 0.5) * r * 0.55, g.x, g.y);
    }
    c.closePath();
  }

  /* Crossings - the spokes. A watch wheel is not a disc: it is turned down to
   * three, four or five arms to lose weight, and the arms have curved fillets
   * where they meet the rim and the hub. The fillet is the detail; a spoke that
   * meets a rim at a corner is a stamped part, not a turned one. */
  function crossings(c, w, arms, rInner, rHub, width) {
    var i;
    for (i = 0; i < arms; i++) {
      var A = (i / arms) * Math.PI * 2 + 0.2;
      var ca = Math.cos(A), sa = Math.sin(A);
      var nx = -sa, ny = ca;
      c.beginPath();
      c.moveTo(w.x + ca * rHub + nx * width * 1.5, w.y + sa * rHub + ny * width * 1.5);
      c.quadraticCurveTo(
        w.x + ca * (rHub + rInner) * 0.5 + nx * width * 0.55,
        w.y + sa * (rHub + rInner) * 0.5 + ny * width * 0.55,
        w.x + ca * rInner + nx * width * 1.6, w.y + sa * rInner + ny * width * 1.6);
      c.lineTo(w.x + ca * rInner - nx * width * 1.6, w.y + sa * rInner - ny * width * 1.6);
      c.quadraticCurveTo(
        w.x + ca * (rHub + rInner) * 0.5 - nx * width * 0.55,
        w.y + sa * (rHub + rInner) * 0.5 - ny * width * 0.55,
        w.x + ca * rHub - nx * width * 1.5, w.y + sa * rHub - ny * width * 1.5);
      c.closePath();
      c.fill();
    }
  }

  /* -------------------------------------------------------- the finishes ---
   *
   * Perlage: overlapping circular-grained spots, laid in a grid at a pitch
   * smaller than their own diameter so each one eats the last. Every spot is
   * ground with a rotating peg, so its grain is circular about its own centre -
   * which is why a perlaged plate scintillates spot by spot rather than as a
   * sheet.
   */
  function perlage(c, cx, cy, rad, spacing, seed) {
    var r2 = rng(seed), R = spacing * 0.78;
    for (var y = -rad - R; y <= rad + R; y += spacing) {
      for (var x = -rad - R; x <= rad + R; x += spacing) {
        var px = cx + x + (r2() - 0.5) * 1.4, py = cy + y + (r2() - 0.5) * 1.4;
        if (Math.hypot(px - cx, py - cy) > rad + R) continue;
        /* Each spot is painted whole, and the next one paints over it. That
         * ordering is the finish: what survives of any given spot is the
         * crescent the following spot did not cover, which is exactly what a
         * perlaged plate looks like and is not something you can get by
         * drawing circles. */
        var g = c.createLinearGradient(px - R, py - R, px + R * 0.8, py + R * 0.8);
        g.addColorStop(0, 'rgba(238,244,252,.085)');
        g.addColorStop(0.5, 'rgba(150,158,170,.015)');
        g.addColorStop(1, 'rgba(14,18,24,.10)');
        c.fillStyle = g;
        c.beginPath();
        c.arc(px, py, R, 0, Math.PI * 2);
        c.fill();
        // The lit lip on the key side of the spot's own wall.
        c.strokeStyle = 'rgba(250,253,255,.075)';
        c.lineWidth = 0.7;
        c.beginPath();
        c.arc(px, py, R, Math.PI * 0.9, Math.PI * 1.9);
        c.stroke();
      }
    }
  }

  /* Cotes de Geneve: wide parallel bands, each one struck with a rotating
   * abrasive, so the grain within a band runs along it. Adjacent bands are cut
   * in opposite directions - that is why a bridge shimmers band by band as it
   * tilts, and why alternating the gradient here is not a stylistic choice. */
  function cotes(c, x0, y0, x1, y1, width, band) {
    var ang = Math.atan2(y1 - y0, x1 - x0);
    var len = Math.hypot(x1 - x0, y1 - y0);
    c.save();
    c.translate(x0, y0);
    c.rotate(ang);
    for (var i = -width; i <= width; i += band) {
      var flip = ((i / band) | 0) % 2 === 0;
      var g = c.createLinearGradient(0, i, 0, i + band);
      g.addColorStop(0, flip ? 'rgba(246,249,253,.13)' : 'rgba(18,22,28,.15)');
      g.addColorStop(0.5, 'rgba(255,255,255,.015)');
      g.addColorStop(1, flip ? 'rgba(18,22,28,.15)' : 'rgba(246,249,253,.13)');
      c.fillStyle = g;
      c.fillRect(0, i, len, band);
      // The step between bands is a real edge, not a blend.
      c.strokeStyle = 'rgba(10,13,17,.22)';
      c.lineWidth = 0.5;
      c.beginPath(); c.moveTo(0, i); c.lineTo(len, i); c.stroke();
    }
    c.restore();
  }

  /* Black polish, the finish on a pallet fork and a click.
   *
   * A flat mirror does not have a colour: it has the *scene* in it. Which for a
   * part lying on a plate under a lamp is a dark half and a light half with a
   * hard line between them - the horizon of whatever it is reflecting - and the
   * line moves with the part rather than with the light. That split is the
   * whole reason polished steel reads as steel and a grey gradient does not,
   * and it is why watchmakers call the finish black polish: turn it a few
   * degrees and it goes from white to nearly black.
   */
  function blackPolish(c, ang) {
    var g = c.createLinearGradient(Math.cos(ang) * -30, Math.sin(ang) * -30,
                                   Math.cos(ang) * 30, Math.sin(ang) * 30);
    g.addColorStop(0, 'rgba(244,249,255,.5)');
    g.addColorStop(0.46, 'rgba(226,234,246,.34)');
    g.addColorStop(0.5, 'rgba(16,20,26,.42)');
    g.addColorStop(1, 'rgba(10,13,18,.5)');
    return g;
  }

  // Snailing: concentric turning marks, the finish on a barrel and a ratchet.
  function snail(c, x, y, r, seed) {
    var r3 = rng(seed);
    for (var k = 0; k < 46; k++) {
      var rr = r * (0.12 + (k / 46) * 0.88);
      c.beginPath();
      c.arc(x, y, rr, 0, Math.PI * 2);
      c.strokeStyle = 'rgba(255,244,214,' + (0.03 + r3() * 0.055).toFixed(3) + ')';
      c.lineWidth = 0.5 + r3() * 0.7;
      c.stroke();
    }
  }

  /* A bridge, as a real fillable outline.
   *
   * A bridge is a boss at every bearing it carries, joined by arms - so the
   * path is the union of a disc at each node and a trapezoid between each pair,
   * all wound the same way, which canvas's nonzero rule unions for free. The
   * first version of this stroked a fat polyline instead, which cannot be
   * clipped to, cannot be filled with its own gradient, and comes out the same
   * width everywhere: one noodle laid over the train. The difference between a
   * bridge and a noodle is that a bridge is wide where it has to hold something
   * and narrow where it only has to get there.
   */
  function bridgePath(c, pts) {
    var i, a, b, ang, nx, ny;
    c.beginPath();
    for (i = 0; i < pts.length; i++) {
      c.moveTo(pts[i].x + pts[i].r, pts[i].y);
      c.arc(pts[i].x, pts[i].y, pts[i].r, 0, Math.PI * 2);
    }
    for (i = 1; i < pts.length; i++) {
      a = pts[i - 1]; b = pts[i];
      ang = Math.atan2(b.y - a.y, b.x - a.x);
      nx = -Math.sin(ang); ny = Math.cos(ang);
      // The arms taper between the two bosses, because a bridge is milled to
      // the section it needs and no more.
      var wa = a.r * 0.66, wb = b.r * 0.66;
      /* Wound the same way round as the bosses, and that is not a detail.
       * Nonzero fill counts winding direction: a quadrilateral traversed the
       * other way scores -1 where it overlaps a disc that scored +1, the two
       * cancel to zero, and canvas cuts a hole through the union at exactly
       * every arm-to-boss joint. The bridge came out as a tangle of leaf-shaped
       * gaps and looked, convincingly, like a stroking bug. */
      c.moveTo(a.x - nx * wa, a.y - ny * wa);
      c.lineTo(b.x - nx * wb, b.y - ny * wb);
      c.lineTo(b.x + nx * wb, b.y + ny * wb);
      c.lineTo(a.x + nx * wa, a.y + ny * wa);
      c.closePath();
    }
  }

  var BRIDGES = null;
  function bridgeDefs() {
    if (BRIDGES) return BRIDGES;
    /* Skeletonised: the bosses sit on the pivots and the arms are cut back far
     * enough to leave the train visible. A solid three-quarter plate is the
     * more common ebauche and it would hide everything worth drawing. */
    /* Each bridge is broad over the bearing it carries and narrows to its
     * feet. The boss radii are set against the wheel underneath: a barrel of
     * eighty-two with a fifty boss over it leaves a thirty-unit ring of teeth
     * showing all the way round, which is what a movement actually looks like -
     * you see the rim of every wheel and the middle of none of them. Sizing
     * them to the pivots instead, as the first pass did, leaves the wheels
     * fully exposed and the bridges reading as scaffolding laid over the top. */
    BRIDGES = [
      { name: 'barrel',
        pts: [{ x: MV.barrel.x - 100, y: MV.barrel.y + 48, r: 15 },
              { x: MV.barrel.x - 46, y: MV.barrel.y + 22, r: 26 },
              { x: MV.barrel.x + 2, y: MV.barrel.y - 6, r: 34 },
              { x: MV.barrel.x + 58, y: MV.barrel.y - 48, r: 22 },
              { x: MV.barrel.x + 88, y: MV.barrel.y - 96, r: 16 }] },
      { name: 'train',
        pts: [{ x: MV.centre.x + 104, y: MV.centre.y - 50, r: 16 },
              { x: MV.third.x, y: MV.third.y, r: 24 },
              { x: MV.fourth.x, y: MV.fourth.y, r: 21 }] },
      { name: 'pallet',
        pts: [{ x: MV.fork.x - 38, y: MV.fork.y + 34, r: 13 },
              { x: MV.fork.x, y: MV.fork.y, r: 14 },
              { x: MV.escape.x, y: MV.escape.y, r: 13 }] }
    ];
    return BRIDGES;
  }

  /* A jewel. Synthetic ruby, pressed into the plate, with the oil sink turned
   * around it. It is not a red dot: it is a transparent stone with a hole in
   * it, so the plate shows through its edge, the sink casts a ring shadow, and
   * the only saturated red in it is where the stone is thickest. */
  function jewel(c, x, y, r, st) {
    if (st < 4) {
      if (st >= 1) {
        c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2);
        c.strokeStyle = 'rgba(180,186,196,.6)'; c.lineWidth = 1; c.stroke();
      }
      return;
    }
    // The countersunk oil sink, cut into the plate around the stone.
    var sk = c.createRadialGradient(x - r * 0.5, y - r * 0.5, r * 0.7, x, y, r * 2.1);
    sk.addColorStop(0, 'rgba(12,14,18,.55)');
    sk.addColorStop(1, 'rgba(12,14,18,0)');
    c.fillStyle = sk;
    c.beginPath(); c.arc(x, y, r * 2.1, 0, Math.PI * 2); c.fill();

    var g = c.createRadialGradient(x - r * 0.45, y - r * 0.5, r * 0.1, x, y, r);
    g.addColorStop(0, 'rgba(206,110,114,.92)');
    g.addColorStop(0.38, 'rgba(140,32,46,.94)');
    g.addColorStop(0.86, 'rgba(74,14,26,.92)');
    g.addColorStop(1, 'rgba(36,6,14,.72)');
    c.fillStyle = g;
    c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.fill();
    // The pivot hole. Black, and off centre toward the key, because you are
    // looking down a tapered bore.
    c.fillStyle = 'rgba(8,4,6,.85)';
    c.beginPath(); c.arc(x + r * 0.06, y + r * 0.06, r * 0.3, 0, Math.PI * 2); c.fill();
    // Specular off the domed top.
    c.fillStyle = 'rgba(255,228,226,.4)';
    c.beginPath(); c.ellipse(x - r * 0.4, y - r * 0.42, r * 0.3, r * 0.18, -0.7, 0, Math.PI * 2); c.fill();
  }

  /* A screw, heat blued. The colour is not a choice: steel run up to about 290
   * degrees grows an oxide a few hundred nanometres thick, and the blue is that
   * film interfering with itself - the same physics as an oil slick, which is
   * why it goes straw, then purple, then this cornflower, in that order. The
   * slot is cut across it and polished, so it holds a different value from the
   * head on either side of the key. */
  function screw(c, x, y, r, ang, st) {
    if (st < 2) {
      if (st >= 1) {
        c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2);
        c.strokeStyle = 'rgba(180,186,196,.6)'; c.lineWidth = 1; c.stroke();
      }
      return;
    }
    var sunk = c.createRadialGradient(x, y, r * 0.9, x, y, r * 1.7);
    sunk.addColorStop(0, 'rgba(10,12,16,.5)');
    sunk.addColorStop(1, 'rgba(10,12,16,0)');
    c.fillStyle = sunk;
    c.beginPath(); c.arc(x, y, r * 1.7, 0, Math.PI * 2); c.fill();

    var blued = st >= 4;
    var g = c.createLinearGradient(x - r, y - r, x + r, y + r);
    if (blued) {
      g.addColorStop(0, '#7d9dd4');
      g.addColorStop(0.32, '#39568f');
      g.addColorStop(0.7, '#1b2c52');
      g.addColorStop(1, '#33507f');
    } else {
      g.addColorStop(0, '#d3d9e1');
      g.addColorStop(0.5, '#8d949e');
      g.addColorStop(1, '#5c626b');
    }
    c.fillStyle = g;
    c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.fill();
    c.strokeStyle = blued ? 'rgba(150,180,230,.5)' : 'rgba(220,226,234,.4)';
    c.lineWidth = 0.7;
    c.stroke();

    c.save();
    c.translate(x, y);
    c.rotate(ang);
    c.fillStyle = 'rgba(8,12,20,.72)';
    c.fillRect(-r * 0.92, -r * 0.15, r * 1.84, r * 0.3);
    c.fillStyle = blued ? 'rgba(158,190,240,.55)' : 'rgba(232,238,246,.5)';
    c.fillRect(-r * 0.92, -r * 0.15, r * 1.84, r * 0.09);
    c.restore();
  }

  /* -------------------------------------------------------- baked layers ---
   * The plate, the bridges and the balance cock do not move. Repainting nine
   * hundred perlage arcs sixty times a second to composite an identical result
   * is the kind of cost that only shows up as a number in a profiler, so they
   * are painted once into three layers and blitted, with the moving parts drawn
   * between them: plate, then the train, then the bridges over it, then the
   * balance, then its cock over that. Which is also the order the parts go in.
   */
  var mvPlate = { key: '', back: null, mid: null, cock: null };

  function mvSpace(c) {
    c.translate(MV_CX, MV_CY);
    c.scale(MV_S, MV_S);
  }

  function paintPlateBack(c, st) {
    var R = MV_R;
    // The mainplate. German silver under rhodium: cool, and lit from upper
    // left like everything else on this page.
    /* The plate carries the widest value range in the frame, from the lit edge
     * to the far side, and it has to be dark enough that the finishing has
     * somewhere to be bright. The first pass here ran from light grey to mid
     * grey, which left every highlight - the anglage, the grain band, the
     * jewels - with nowhere to go, and the whole movement came out looking
     * moulded. A metal is not a colour, it is a range. */
    var g = c.createLinearGradient(-R * 1.1, -R * 0.8, R * 0.8, R);
    g.addColorStop(0, '#9aa2ad');
    g.addColorStop(0.4, '#666e78');
    g.addColorStop(0.76, '#3d434b');
    g.addColorStop(1, '#22262c');
    c.fillStyle = st === 1 ? 'rgba(0,0,0,0)' : g;
    // The plate is lying on something. Its own cast shadow is what stops the
    // disc reading as a sticker on the backdrop.
    if (st >= 2) {
      c.save();
      c.translate(9, 12);
      var csh = c.createRadialGradient(0, 0, R * 0.9, 0, 0, R * 1.13);
      csh.addColorStop(0, 'rgba(0,0,0,.72)');
      csh.addColorStop(1, 'rgba(0,0,0,0)');
      c.fillStyle = csh;
      c.beginPath(); c.arc(0, 0, R * 1.13, 0, Math.PI * 2); c.fill();
      c.restore();
      c.fillStyle = g;
    }
    c.beginPath(); c.arc(0, 0, R, 0, Math.PI * 2);
    c.fill();
    if (st <= 1) {
      c.strokeStyle = 'rgba(196,202,212,.75)'; c.lineWidth = 1.2; c.stroke();
    }

    if (st >= 3) {
      c.save();
      c.beginPath(); c.arc(0, 0, R - 1, 0, Math.PI * 2); c.clip();
      perlage(c, 0, 0, R, 6.4, 90210);
      c.restore();
    }

    // The edge of the plate is turned, not cut: a bright bevel on the key side
    // and a dark one opposite, and a fine chamfer all the way round.
    if (st >= 2) {
      var e = c.createLinearGradient(-R, -R, R, R);
      e.addColorStop(0, 'rgba(240,245,252,.55)');
      e.addColorStop(0.5, 'rgba(120,128,140,0)');
      e.addColorStop(1, 'rgba(16,20,26,.5)');
      c.strokeStyle = e; c.lineWidth = 3;
      c.beginPath(); c.arc(0, 0, R - 1.5, 0, Math.PI * 2); c.stroke();
    }

    /* The shadow each wheel throws onto the plate. It can be baked in here
     * rather than drawn per frame for a reason worth stating: a wheel is a body
     * of revolution, so its shadow is the same shape at every angle it is ever
     * drawn at. The only moving parts on this movement whose shadows have to be
     * recomputed are the fork and the balance arms, and neither is drawn with
     * one. */
    if (st >= 2) {
      ['barrel', 'centre', 'third', 'fourth', 'escape'].forEach(function (k) {
        var w = MV[k];
        var rg = c.createRadialGradient(w.x + 5, w.y + 6, w.rw * 0.55,
                                        w.x + 5, w.y + 6, w.rw * 1.12);
        rg.addColorStop(0, 'rgba(4,6,9,.62)');
        rg.addColorStop(0.7, 'rgba(4,6,9,.3)');
        rg.addColorStop(1, 'rgba(4,6,9,0)');
        c.fillStyle = rg;
        c.beginPath(); c.arc(w.x + 5, w.y + 6, w.rw * 1.12, 0, Math.PI * 2); c.fill();
      });
    }

    // Engraving. Cut into the plate, so it is a dark stroke with a bright one
    // half a pixel above it - the same trick as every other groove here.
    if (st >= 3) {
      c.save();
      c.font = '600 9px ui-monospace, SFMono-Regular, monospace';
      c.textAlign = 'center';
      // Cut into the plate: a dark stroke with a bright one half a pixel above
      // it, which is the same groove the perlage and the crossings are drawn
      // with. Engraving that is only dark reads as printing.
      c.fillStyle = 'rgba(20,24,30,.6)';
      c.fillText('SEVENTEEN JEWELS', 104, -126);
      c.fillText('ADJUSTED TO 5 POSITIONS', 104, -112);
      c.fillText('No 41 208', 104, -98);
      c.fillStyle = 'rgba(232,238,248,.17)';
      c.fillText('SEVENTEEN JEWELS', 104, -126.8);
      c.fillText('ADJUSTED TO 5 POSITIONS', 104, -112.8);
      c.fillText('No 41 208', 104, -98.8);
      c.restore();
    }
  }

  /* Fill, bevel and finish one bridge outline.
   *
   * The outline cannot be stroked, and finding that out cost a rewrite. The
   * path is a union of overlapping subpaths - a disc at every bearing, a
   * trapezoid between every pair - which canvas's nonzero rule fills correctly
   * as one shape, but strokes as what it literally is: every subpath's own
   * boundary, including all the ones buried inside the union. Stroking it drew
   * the bridge as a tangle of overlapping rings.
   *
   * So both edges here are made of fills. Fill the shape once offset toward the
   * key and once away from it, then fill it again at rest on top: what survives
   * is a bright sliver along the upper left and a dark one along the lower
   * right, and that is anglage - the polished chamfer a finisher files and
   * burnishes along every edge of a bridge by hand. It changes value as it
   * turns a corner, which is exactly the thing you look for to tell whether a
   * movement was finished or merely made.
   */
  function dressBridge(c, pts, st, grad, stripeAng) {
    var i;
    if (st <= 1) {
      /* Contour: the same idea used as a morphological outline. Fill eight
       * copies on a small circle, then punch the shape back out - which leaves
       * a closed line around the union and nothing inside it. The layer is its
       * own canvas, so destination-out here cannot reach the plate. */
      c.fillStyle = 'rgba(200,206,216,.75)';
      for (i = 0; i < 8; i++) {
        var a = (i / 8) * Math.PI * 2;
        c.save();
        c.translate(Math.cos(a) * 1.3, Math.sin(a) * 1.3);
        bridgePath(c, pts);
        c.fill();
        c.restore();
      }
      c.save();
      c.globalCompositeOperation = 'destination-out';
      bridgePath(c, pts);
      c.fillStyle = '#000';
      c.fill();
      c.restore();
      return;
    }

    // A bridge stands a third of a millimetre off the plate. Without its own
    // shadow it reads as paint.
    c.save();
    c.translate(4, 5);
    bridgePath(c, pts);
    c.fillStyle = 'rgba(4,6,10,.5)';
    c.fill();
    c.restore();

    // The lit chamfer, and the one in shadow opposite it.
    c.save();
    c.translate(-1.6, -1.9);
    bridgePath(c, pts);
    c.fillStyle = 'rgba(250,253,255,.62)';
    c.fill();
    c.restore();
    c.save();
    c.translate(1.6, 1.9);
    bridgePath(c, pts);
    c.fillStyle = 'rgba(10,13,18,.72)';
    c.fill();
    c.restore();

    bridgePath(c, pts);
    c.fillStyle = grad;
    c.fill();

    if (st >= 3) {
      c.save();
      bridgePath(c, pts);
      c.clip();
      cotes(c, pts[0].x - 220, pts[0].y - 40,
            pts[0].x - 220 + Math.cos(stripeAng) * 460,
            pts[0].y - 40 + Math.sin(stripeAng) * 460, 200, 10);
      c.restore();
    }
  }

  function paintPlateMid(c, st) {
    var i, br, defs = bridgeDefs();
    var stripe = [0.16, -0.1, 0.3];

    for (i = 0; i < defs.length; i++) {
      br = defs[i];
      var p0 = br.pts[0], pn = br.pts[br.pts.length - 1];
      var bg = c.createLinearGradient(p0.x - 70, p0.y - 70, pn.x + 50, pn.y + 70);
      bg.addColorStop(0, '#b3bbc6');
      bg.addColorStop(0.38, '#6e7680');
      bg.addColorStop(0.76, '#454b54');
      bg.addColorStop(1, '#2a2f36');
      dressBridge(c, br.pts, st, bg, stripe[i]);
    }

    if (st >= 2) {
      /* The ratchet wheel and the click, over the barrel arbor. The click is a
       * steel pawl on a spring that drops into the ratchet teeth and holds the
       * mainspring wound - the one part of a movement whose entire job is to
       * move in only one direction, and always the part left out. */
      var bx = MV.barrel.x, by = MV.barrel.y;
      // Ratchet teeth are asymmetric: a steep locking face and a long ramp,
      // because the click has to climb one side and catch on the other.
      c.beginPath();
      for (var rt = 0; rt < 24; rt++) {
        var a0 = (rt / 24) * Math.PI * 2, a1 = ((rt + 0.66) / 24) * Math.PI * 2;
        c.lineTo(bx + Math.cos(a0) * 24, by + Math.sin(a0) * 24);
        c.lineTo(bx + Math.cos(a1) * 28, by + Math.sin(a1) * 28);
      }
      c.closePath();
      var rg = c.createLinearGradient(bx - 28, by - 28, bx + 28, by + 28);
      rg.addColorStop(0, '#c8d0da');
      rg.addColorStop(0.45, '#767e89');
      rg.addColorStop(1, '#3b414a');
      c.fillStyle = rg; c.fill();
      c.strokeStyle = 'rgba(232,238,248,.35)'; c.lineWidth = 0.8; c.stroke();
      if (st >= 3) {
        c.save();
        c.beginPath(); c.arc(bx, by, 24, 0, Math.PI * 2); c.clip();
        snail(c, bx, by, 24, 4242);
        c.restore();
      }

      // The click and its spring.
      c.save();
      c.lineCap = 'round';
      c.strokeStyle = 'rgba(206,214,226,.8)';
      c.lineWidth = 6;
      c.beginPath();
      c.moveTo(bx + 52, by + 24);
      c.quadraticCurveTo(bx + 46, by + 2, bx + 28, by - 6);
      c.stroke();
      c.lineWidth = 1.7;
      c.strokeStyle = 'rgba(190,198,212,.7)';
      c.beginPath();
      c.moveTo(bx + 66, by + 16);
      c.quadraticCurveTo(bx + 70, by - 12, bx + 50, by - 28);
      c.stroke();
      c.restore();
      screw(c, bx + 52, by + 24, 4.6, 0.7, st);
      screw(c, bx, by, 6, 1.2, st);
    }

    if (st >= 2) {
      // Bridge screws go on the feet, which is where a bridge is actually held
      // down - not wherever there happens to be room left over.
      var d0 = defs[0].pts, d1 = defs[1].pts, d2 = defs[2].pts;
      screw(c, d0[0].x, d0[0].y, 5.4, 0.4, st);
      screw(c, d0[4].x, d0[4].y, 5.4, 1.9, st);
      screw(c, d1[0].x, d1[0].y, 5.4, 0.9, st);
      screw(c, d1[2].x + 22, d1[2].y + 16, 5, 1.4, st);
      screw(c, d2[0].x, d2[0].y, 4.8, 2.4, st);
    }

    // Jewels, sitting in the bridges over the pivots they carry.
    jewel(c, MV.third.x, MV.third.y, 5.8, st);
    jewel(c, MV.fourth.x, MV.fourth.y, 5.4, st);
    jewel(c, MV.escape.x, MV.escape.y, 5, st);
    jewel(c, MV.fork.x, MV.fork.y, 4.6, st);
  }

  function paintCock(c, st) {
    var b = MV.balance;
    /* The cock: one arm, cantilevered from a foot screwed to the plate, with
     * the balance hanging off its free end. It is the only bridge on a movement
     * held by a single screw, which is why it is the one that gets engraved and
     * the one whose bevel gets looked at first. */
    var pts = [{ x: b.x + 96, y: b.y - 44, r: 15 }, { x: b.x + 44, y: b.y - 24, r: 15 },
               { x: b.x, y: b.y, r: 20 }];
    var g = c.createLinearGradient(b.x + 96, b.y - 60, b.x - 20, b.y + 24);
    g.addColorStop(0, '#b8c0cb');
    g.addColorStop(0.4, '#727a85');
    g.addColorStop(1, '#2d323a');
    dressBridge(c, pts, st, g, -0.06);

    if (st >= 3) {
      /* The regulator. An index arm pivoting about the balance jewel carries
       * two curb pins that straddle the outer coil of the hairspring: moving it
       * shortens the spring's working length, which is the only adjustment on a
       * watch that changes its rate. The swan neck above it - a flattened S of
       * spring steel bearing on an eccentric screw - is there so the index can
       * be nudged by a thousandth of a turn instead of shoved. */
      c.save();
      c.lineCap = 'round';
      c.strokeStyle = 'rgba(202,210,222,.9)';
      c.lineWidth = 4.5;
      c.beginPath();
      c.arc(b.x, b.y, 30, -2.1, -0.95);
      c.stroke();
      c.lineWidth = 1.9;
      c.strokeStyle = 'rgba(216,224,236,.85)';
      c.beginPath();
      c.moveTo(b.x + 2, b.y - 40);
      c.bezierCurveTo(b.x + 24, b.y - 56, b.x + 44, b.y - 34, b.x + 66, b.y - 44);
      c.stroke();
      c.restore();
      // The two curb pins, seen end on, straddling the outer coil.
      c.fillStyle = 'rgba(232,238,248,.95)';
      c.beginPath(); c.arc(b.x + 4, b.y - 30, 1.8, 0, Math.PI * 2); c.fill();
      c.beginPath(); c.arc(b.x + 10, b.y - 29, 1.8, 0, Math.PI * 2); c.fill();
      c.font = '600 9px ui-monospace, monospace';
      c.fillStyle = 'rgba(232,238,248,.55)';
      c.fillText('F', b.x + 26, b.y - 30);
      c.fillText('S', b.x - 12, b.y - 38);
    }

    if (st >= 2) screw(c, pts[0].x, pts[0].y, 6.2, 2.1, st);

    /* The balance jewel and the cap stone over it. A cap closes the bearing at
     * the top so the pivot cannot climb out of it under shock, and it is the
     * reason a balance jewel reads as two circles rather than one. */
    jewel(c, b.x, b.y, 6.6, st);
    if (st >= 4) {
      c.strokeStyle = 'rgba(232,238,248,.34)';
      c.lineWidth = 1;
      c.beginPath(); c.arc(b.x, b.y, 11.5, 0, Math.PI * 2); c.stroke();
      c.strokeStyle = 'rgba(232,238,248,.14)';
      c.beginPath(); c.arc(b.x, b.y, 14, 0, Math.PI * 2); c.stroke();
    }
  }

  function mvLayer(paint, st) {
    var L = newLayer();
    L.ctx.save();
    mvSpace(L.ctx);
    paint(L.ctx, st);
    L.ctx.restore();
    return L.canvas;
  }

  /* ---------------------------------------------------------- the wheels ---
   * Each wheel is rigid, so it is baked once at build time and blitted with a
   * rotation. Redrawing seventy-two epicycloidal teeth every frame to arrive at
   * the same pixels turned by a degree is work with a known answer. */
  var mvWheels = { key: '' };

  function wheelSprite(spec, st, gilt, arms) {
    var pad = 14, size = Math.ceil((spec.rw + pad) * 2 * MV_S * (canvas.width / VW));
    var lc = document.createElement('canvas');
    lc.width = lc.height = size;
    var c = lc.getContext('2d');
    var s = size / ((spec.rw + pad) * 2);
    c.setTransform(s, 0, 0, s, size / 2, size / 2);
    var w = { x: 0, y: 0 };

    if (spec.teeth === 15) escapePath(c, w, 15, spec.rw);
    else gearPath(c, w, spec.teeth, spec.rw, spec.gen);

    if (st <= 1) {
      c.strokeStyle = gilt ? 'rgba(226,196,132,.8)' : 'rgba(206,214,226,.8)';
      c.lineWidth = 0.9;
      c.stroke();
    } else {
      var g = c.createLinearGradient(-spec.rw, -spec.rw, spec.rw, spec.rw);
      // Gilt brass, not gold leaf. The first pass ran to a saturated yellow at
      // the lit end and the whole train came out looking like a toy: real
      // gilding is a thin wash over brass, so it stays close to the metal
      // underneath and only goes bright at the very edge of the highlight.
      if (gilt) {
        g.addColorStop(0, '#d3ac6e'); g.addColorStop(0.36, '#9c7739');
        g.addColorStop(0.74, '#66491f'); g.addColorStop(1, '#33240f');
      } else {
        g.addColorStop(0, '#c9d1db'); g.addColorStop(0.42, '#7d858f');
        g.addColorStop(1, '#363c45');
      }
      c.fillStyle = g;
      c.fill();
      // The tooth tips are the only part of a wheel that is a sharp edge, so
      // they are the only part that throws a real specular. Everything else on
      // a wheel is a broad, soft, turned surface.
      c.strokeStyle = gilt ? 'rgba(250,226,172,.34)' : 'rgba(236,242,252,.34)';
      c.lineWidth = 0.7;
      c.stroke();
      if (arms) {
        // Cut the crossings out, then put the arms back with their own
        // shading. A watch wheel is turned down to three or four arms to lose
        // weight, and the arms are why a train reads as machined rather than
        // stamped: the light passes through it.
        var cut = spec.rw * (spec.teeth === 15 ? 0.58 : 0.84);
        c.save();
        c.globalCompositeOperation = 'destination-out';
        c.beginPath();
        c.arc(0, 0, cut, 0, Math.PI * 2);
        c.fillStyle = '#000';
        c.fill();
        c.restore();
        c.fillStyle = g;
        crossings(c, w, arms, cut + 1, spec.rp + 4, Math.max(2.4, spec.rw * 0.05));
      } else if (!arms) {
        /* The barrel is a closed drum with the mainspring coiled inside it, so
         * it is not crossed at all. What it has instead is a lid, pressed in
         * and turned: a raised step at about four fifths of the radius with its
         * own lit edge, and a snailed face inside that. Leaving the step out is
         * what makes a barrel read as a plain gold disc, which is the note
         * every version of this drawing failed on before this one. */
        var lid = spec.rw * 0.82;
        var lg = c.createLinearGradient(-lid, -lid, lid, lid);
        lg.addColorStop(0, '#c9a466');
        lg.addColorStop(0.44, '#8f6c33');
        lg.addColorStop(1, '#3d2c12');
        c.beginPath(); c.arc(0, 0, lid, 0, Math.PI * 2);
        c.fillStyle = lg; c.fill();
        if (st >= 3) {
          c.save();
          c.beginPath(); c.arc(0, 0, lid - 1, 0, Math.PI * 2); c.clip();
          snail(c, 0, 0, lid, 8123);
          c.restore();
        }
        // The step itself: bright where it faces the key, dark opposite.
        var eg = c.createLinearGradient(-lid, -lid, lid, lid);
        eg.addColorStop(0, 'rgba(255,238,196,.5)');
        eg.addColorStop(0.5, 'rgba(120,96,52,0)');
        eg.addColorStop(1, 'rgba(18,12,4,.5)');
        c.strokeStyle = eg; c.lineWidth = 2.4;
        c.beginPath(); c.arc(0, 0, lid, 0, Math.PI * 2); c.stroke();
      }
      // Hub and pinion.
      c.beginPath(); c.arc(0, 0, spec.rp + 4, 0, Math.PI * 2);
      c.fillStyle = g; c.fill();
      c.beginPath(); c.arc(0, 0, Math.max(2, spec.rp * 0.42), 0, Math.PI * 2);
      c.fillStyle = 'rgba(24,20,14,.7)'; c.fill();
    }
    return { canvas: lc, half: (spec.rw + pad) };
  }

  function buildWheels(st) {
    var key = st + '|' + canvas.width;
    if (mvWheels.key === key) return;
    mvWheels.key = key;
    mvWheels.barrel = wheelSprite(MV.barrel, st, true, 0);
    mvWheels.centre = wheelSprite(MV.centre, st, true, 4);
    mvWheels.third  = wheelSprite(MV.third, st, true, 4);
    mvWheels.fourth = wheelSprite(MV.fourth, st, true, 3);
    mvWheels.escape = wheelSprite(MV.escape, st, false, 3);
  }

  function blitWheel(c, name, spec, ang) {
    var sp = mvWheels[name];
    if (!sp) return;
    c.save();
    c.translate(spec.x, spec.y);
    c.rotate(ang);
    c.drawImage(sp.canvas, -sp.half, -sp.half, sp.half * 2, sp.half * 2);
    c.restore();
  }

  /* ------------------------------------------------------- the escapement --- */
  function palletFork(c, ang, st) {
    var f = MV.fork;
    c.save();
    c.translate(f.x, f.y);
    c.rotate(ang);
    // Two arms out toward the escape wheel, a slotted end toward the balance.
    var toEsc = Math.atan2(MV.escape.y - f.y, MV.escape.x - f.x);
    var toBal = Math.atan2(MV.balance.y - f.y, MV.balance.x - f.x);
    c.beginPath();
    c.moveTo(Math.cos(toEsc - 0.42) * 30, Math.sin(toEsc - 0.42) * 30);
    c.quadraticCurveTo(0, 0, Math.cos(toEsc + 0.42) * 30, Math.sin(toEsc + 0.42) * 30);
    c.lineTo(Math.cos(toEsc + 0.42) * 22, Math.sin(toEsc + 0.42) * 22);
    c.quadraticCurveTo(0, 0, Math.cos(toEsc - 0.42) * 22, Math.sin(toEsc - 0.42) * 22);
    c.closePath();
    var g = c.createLinearGradient(-24, -24, 24, 24);
    g.addColorStop(0, st <= 1 ? 'rgba(0,0,0,0)' : '#cdd5e0');
    g.addColorStop(0.45, st <= 1 ? 'rgba(0,0,0,0)' : '#767e89');
    g.addColorStop(1, st <= 1 ? 'rgba(0,0,0,0)' : '#333941');
    c.fillStyle = g;
    c.fill();
    if (st >= 3) { c.fillStyle = blackPolish(c, -0.9 - ang * 3); c.fill(); }
    c.strokeStyle = st <= 1 ? 'rgba(206,214,226,.8)' : 'rgba(238,244,252,.35)';
    c.lineWidth = st <= 1 ? 1 : 0.8;
    c.stroke();

    // The lever itself, out to the horns and the notch.
    c.beginPath();
    c.moveTo(0, 0);
    c.lineTo(Math.cos(toBal) * 30 - Math.sin(toBal) * 3.4, Math.sin(toBal) * 30 + Math.cos(toBal) * 3.4);
    c.lineTo(Math.cos(toBal) * 30 + Math.sin(toBal) * 3.4, Math.sin(toBal) * 30 - Math.cos(toBal) * 3.4);
    c.closePath();
    c.fillStyle = g; c.fill();
    if (st >= 3) { c.fillStyle = blackPolish(c, -0.9 - ang * 3); c.fill(); }
    c.stroke();
    // Horns, either side of the slot the roller jewel enters.
    c.lineCap = 'round';
    c.lineWidth = st <= 1 ? 1 : 2.6;
    c.strokeStyle = st <= 1 ? 'rgba(206,214,226,.8)' : 'rgba(190,198,210,.9)';
    [-1, 1].forEach(function (s) {
      c.beginPath();
      c.moveTo(Math.cos(toBal) * 26 + Math.sin(toBal) * 4.5 * s, Math.sin(toBal) * 26 - Math.cos(toBal) * 4.5 * s);
      c.lineTo(Math.cos(toBal) * 34 + Math.sin(toBal) * 6.5 * s, Math.sin(toBal) * 34 - Math.cos(toBal) * 6.5 * s);
      c.stroke();
    });

    if (st >= 4) {
      // The pallet jewels. Rectangles, not dots: the whole escapement is two
      // flat ruby faces at a computed angle to each other, and that angle is
      // the escapement.
      [-1, 1].forEach(function (s) {
        var a = toEsc + 0.42 * s;
        c.save();
        c.translate(Math.cos(a) * 27, Math.sin(a) * 27);
        c.rotate(a + Math.PI / 2 - 0.3 * s);
        var jg = c.createLinearGradient(-5, -2, 5, 2);
        jg.addColorStop(0, '#e07a80');
        jg.addColorStop(0.5, '#a8283a');
        jg.addColorStop(1, '#5e1020');
        c.fillStyle = jg;
        c.fillRect(-5, -2.6, 10, 5.2);
        c.fillStyle = 'rgba(255,222,222,.45)';
        c.fillRect(-5, -2.6, 10, 1.2);
        c.restore();
      });
    }
    c.restore();
  }

  /* The balance, in two pieces - because only one of them blurs.
   *
   * The rim is a circle of revolution: it occupies exactly the same pixels at
   * every angle, so integrating it over the exposure is eleven identical draws
   * arriving at one image, at a tenth of the alpha each, which is how you turn
   * a solid rim into a ghost. Only the parts whose position actually changes -
   * the arms, the timing screws, the roller - are worth smearing. Getting this
   * backwards is why most drawn balance wheels look like they are fading out.
   */
  function balanceRim(c, st) {
    var b = MV.balance, R = MV.balR;
    c.save();
    c.translate(b.x, b.y);
    var g = c.createLinearGradient(-R, -R, R, R);
    g.addColorStop(0, '#efd196');
    g.addColorStop(0.4, '#b78d47');
    g.addColorStop(0.78, '#775623');
    g.addColorStop(1, '#38270f');
    c.beginPath();
    c.arc(0, 0, R, 0, Math.PI * 2);
    c.arc(0, 0, R - 10, 0, Math.PI * 2, true);
    if (st <= 1) {
      c.strokeStyle = 'rgba(226,196,132,.8)'; c.lineWidth = 1; c.stroke();
    } else {
      c.fillStyle = g; c.fill('evenodd');
      c.strokeStyle = 'rgba(252,232,190,.4)'; c.lineWidth = 0.8; c.stroke();
      // The inner wall of the rim is in its own shadow on the key side, which
      // is the only cue that the rim has depth rather than being a painted ring.
      c.beginPath();
      c.arc(0, 0, R - 10, 0, Math.PI * 2);
      c.strokeStyle = 'rgba(40,28,12,.5)'; c.lineWidth = 1.6; c.stroke();
    }
    c.restore();
  }

  function balanceSpokes(c, ang, st) {
    var b = MV.balance, R = MV.balR;
    c.save();
    c.translate(b.x, b.y);
    c.rotate(ang);
    var g = c.createLinearGradient(-R, -R, R, R);
    g.addColorStop(0, '#dcb87b');
    g.addColorStop(0.44, '#a17b3c');
    g.addColorStop(1, '#38270f');
    // Two arms and a hub.
    c.beginPath();
    c.rect(-R + 6, -2.8, R * 2 - 12, 5.6);
    if (st <= 1) {
      c.strokeStyle = 'rgba(226,196,132,.8)'; c.lineWidth = 1; c.stroke();
    } else {
      c.fillStyle = g; c.fill();
      c.strokeStyle = 'rgba(252,232,190,.3)'; c.lineWidth = 0.6; c.stroke();
    }
    c.beginPath(); c.arc(0, 0, 8.5, 0, Math.PI * 2);
    if (st <= 1) { c.stroke(); } else { c.fillStyle = g; c.fill(); }

    if (st >= 2) {
      /* Timing screws. Sixteen of them through the rim, and they are not
       * decoration: they are the mass you move to make the watch keep time.
       * They come in opposed pairs because a balance that is out of poise runs
       * at one rate lying on its back and another standing on its edge, and
       * removing weight from one side alone is how you cause that. */
      for (var i = 0; i < 16; i++) {
        var a = (i / 16) * Math.PI * 2 + Math.PI / 16;
        var sx = Math.cos(a) * (R - 4.6), sy = Math.sin(a) * (R - 4.6);
        var sg = c.createRadialGradient(sx - 1.6, sy - 1.6, 0.3, sx, sy, 5);
        sg.addColorStop(0, '#efdcb0');
        sg.addColorStop(0.55, '#a67f40');
        sg.addColorStop(1, '#3a2911');
        c.fillStyle = sg;
        c.beginPath(); c.arc(sx, sy, 5, 0, Math.PI * 2); c.fill();
      }
    }
    if (st >= 4) {
      /* The roller table under the rim, and the impulse jewel standing up out
       * of it - one pin, and the only thing the escapement is allowed to touch
       * the balance with. Everything else about a lever escapement exists to
       * keep away from the balance between beats, which is what "detached"
       * means and why it keeps better time than anything that does not. */
      c.fillStyle = 'rgba(158,166,178,.92)';
      c.beginPath(); c.arc(0, 0, 13, 0, Math.PI * 2); c.fill();
      c.fillStyle = 'rgba(66,72,82,.75)';
      c.beginPath(); c.arc(0, 0, 13, 0.6, 2.54); c.fill();
      // The passing hollow, cut in the roller so the guard pin can cross it.
      c.fillStyle = 'rgba(24,28,34,.8)';
      c.beginPath(); c.arc(0, MV.rollerR - 2, 4, 0, Math.PI * 2); c.fill();
      c.save();
      c.translate(0, MV.rollerR);
      var jg = c.createLinearGradient(-2.6, 0, 2.6, 0);
      jg.addColorStop(0, '#ee979c'); jg.addColorStop(0.5, '#ac2c3e'); jg.addColorStop(1, '#5e1020');
      c.fillStyle = jg;
      c.beginPath(); c.ellipse(0, 0, 2.6, 3.6, 0, 0, Math.PI * 2); c.fill();
      c.restore();
    }
    c.restore();
  }

  /* The hairspring. An Archimedean spiral from the collet on the balance staff
   * to the stud on the cock: the inner end turns with the balance and the outer
   * end cannot move, so the coils wind up and unwind twice per oscillation.
   * That breathing is the animation - a spring drawn at a fixed shape and
   * rotated bodily is the commonest mistake in a drawn movement, and it is
   * instantly wrong, because then nothing is storing any energy. */
  function hairspring(c, ang, st) {
    var b = MV.balance;
    // The outer coil ends where the curb pins are, at thirty: a hairspring
    // drawn out past its own regulator is a spring nothing is regulating.
    var TURNS = 11, rIn = 8, rOut = 30;
    c.save();
    c.translate(b.x, b.y);
    c.beginPath();
    for (var i = 0; i <= 320; i++) {
      var s = i / 320;
      var phi = ang * (1 - s) + s * TURNS * Math.PI * 2 - Math.PI * 0.5;
      var r = rIn + (rOut - rIn) * s;
      var x = Math.cos(phi) * r, y = Math.sin(phi) * r;
      i === 0 ? c.moveTo(x, y) : c.lineTo(x, y);
    }
    c.strokeStyle = st <= 1 ? 'rgba(200,208,220,.6)' : 'rgba(216,224,238,.72)';
    c.lineWidth = st <= 1 ? 0.6 : 0.9;
    c.stroke();
    if (st >= 3) {
      // A second pass a hair below, because spring steel this thin is a
      // cylinder and catches the key along its top edge only.
      c.save();
      c.translate(-0.5, -0.6);
      c.strokeStyle = 'rgba(255,255,255,.22)';
      c.lineWidth = 0.5;
      c.stroke();
      c.restore();
    }
    c.restore();
  }

  function drawMovement(c, st, t) {
    var tt = reduce ? 0.42 : t;

    /* --------------------------------------------------------------- timing
     * Everything below comes from one number.
     *
     * 18,000 A/h is five beats a second, so the balance is a 2.5 Hz sine with
     * its zero crossings on the beats. A lever escapement lets one tooth go per
     * full oscillation, which is half a tooth per beat, and the wheel does not
     * ease into it - it is dead locked, then released, then dead locked again,
     * which is why the step below is a fast smoothstep inside a tenth of a beat
     * and a flat hold for the rest of it. The small backward kick at the end of
     * the step is draw: the locking faces are cut at an angle that pulls the
     * tooth further in rather than letting it sit, and it is the reason a lever
     * escapement stays safe when the watch is knocked. */
    var beat = tt * 5;                            // five beats a second
    var b = Math.floor(beat), p = beat - b;
    var theta = 2.356 * Math.sin(Math.PI * beat); // +/- 135 degrees

    function ease(u) { u = clamp(u, 0, 1); return u * u * (3 - 2 * u); }
    var stepU = ease(p / 0.11);
    var drawback = p > 0.11 && p < 0.2 ? Math.sin((p - 0.11) / 0.09 * Math.PI) * 0.16 : 0;
    var escAng = (b + stepU - drawback) * (Math.PI * 2 / 15 / 2);

    var fourthAng = -escAng / 10;
    var thirdAng = fourthAng / 7.5;
    var centreAng = -thirdAng / 8;
    var barrelAng = centreAng / 6;

    var side = b % 2 === 0 ? 1 : -1;
    var forkAng = (-side + 2 * side * ease(p / 0.10)) * 0.135;

    // The lamp. It is a real azimuth, and the pointer moves it - which is the
    // only honest way to show an anisotropic finish, because the whole claim is
    // that what you see depends on where the light is.
    var keyAng = pointer.inside
      ? Math.atan2(pointer.y - 0.5, pointer.x - 0.5)
      : -2.2 + Math.sin(tt * 0.4) * 0.5;

    /* ------------------------------------------------------------- backdrop */
    var bg = c.createRadialGradient(VW * 0.36, VH * 0.3, 60, VW * 0.5, VH * 0.5, VW * 0.78);
    bg.addColorStop(0, '#15181d');
    bg.addColorStop(0.55, '#0d0f12');
    bg.addColorStop(1, '#050607');
    c.fillStyle = st === 0 ? '#0b0a09' : bg;
    c.fillRect(0, 0, VW, VH);
    if (st >= 2) {
      // The plate is lying on something, under a lens, and the something
      // catches a little of the key at the edges of the frame. Two very soft
      // reflections are enough to stop the margins reading as a cut-out.
      [[92, 132, 140], [812, 356, 170]].forEach(function (q) {
        var sp = c.createRadialGradient(q[0], q[1], 4, q[0], q[1], q[2]);
        sp.addColorStop(0, 'rgba(150,162,182,.10)');
        sp.addColorStop(1, 'rgba(150,162,182,0)');
        c.fillStyle = sp;
        c.fillRect(q[0] - q[2], q[1] - q[2], q[2] * 2, q[2] * 2);
      });
    }

    /* ------------------------------------------------------ stage 1: rig */
    if (st === 0) {
      c.save();
      mvSpace(c);
      c.lineWidth = 1 / MV_S;
      c.strokeStyle = 'rgba(223,106,65,.5)';
      c.setLineDash([4, 5]);
      c.beginPath(); c.arc(0, 0, MV_R, 0, Math.PI * 2); c.stroke();
      // Every pitch circle, and the line joining each pair of meshing centres.
      var chain = ['barrel', 'centre', 'third', 'fourth', 'escape'];
      var i, w, pw;
      for (i = 0; i < chain.length; i++) {
        w = MV[chain[i]];
        c.strokeStyle = 'rgba(223,106,65,.62)';
        c.beginPath(); c.arc(w.x, w.y, w.rw, 0, Math.PI * 2); c.stroke();
        if (w.rp) {
          c.strokeStyle = 'rgba(139,156,184,.6)';
          c.beginPath(); c.arc(w.x, w.y, w.rp, 0, Math.PI * 2); c.stroke();
        }
        if (i) {
          pw = MV[chain[i - 1]];
          c.setLineDash([]);
          c.strokeStyle = 'rgba(151,177,132,.7)';
          c.beginPath(); c.moveTo(pw.x, pw.y); c.lineTo(w.x, w.y); c.stroke();
          c.setLineDash([4, 5]);
        }
        c.setLineDash([]);
        c.fillStyle = '#df6a41';
        c.fillRect(w.x - 2.5, w.y - 2.5, 5, 5);
        c.setLineDash([4, 5]);
      }
      c.strokeStyle = 'rgba(139,156,184,.6)';
      c.beginPath(); c.arc(MV.balance.x, MV.balance.y, MV.balR, 0, Math.PI * 2); c.stroke();
      c.beginPath(); c.arc(MV.balance.x, MV.balance.y, MV.rollerR, 0, Math.PI * 2); c.stroke();
      c.beginPath(); c.moveTo(MV.escape.x, MV.escape.y); c.lineTo(MV.fork.x, MV.fork.y);
      c.lineTo(MV.balance.x, MV.balance.y); c.stroke();
      c.setLineDash([]);
      c.restore();

      c.font = '500 11px ui-monospace, monospace';
      c.fillStyle = 'rgba(140,133,124,.75)';
      c.fillText('barrel 72 -> centre 12/64 -> third 8/60 -> fourth 8/60 -> escape 6/15', 60, VH - 46);
      c.fillText('centre distance = pitch radius + pitch radius, every time. 7.5 x 8 = 60.', 60, VH - 28);
      return;
    }

    buildWheels(st);
    var key = st + '|' + canvas.width;
    if (mvPlate.key !== key) {
      mvPlate.key = key;
      mvPlate.back = mvLayer(paintPlateBack, st);
      mvPlate.mid = mvLayer(paintPlateMid, st);
      mvPlate.cock = mvLayer(paintCock, st);
    }

    c.drawImage(mvPlate.back, 0, 0, VW, VH);

    c.save();
    mvSpace(c);
    blitWheel(c, 'barrel', MV.barrel, barrelAng);
    blitWheel(c, 'centre', MV.centre, centreAng);
    blitWheel(c, 'third', MV.third, thirdAng);
    blitWheel(c, 'fourth', MV.fourth, fourthAng);
    blitWheel(c, 'escape', MV.escape, escAng);
    c.restore();

    c.drawImage(mvPlate.mid, 0, 0, VW, VH);

    c.save();
    mvSpace(c);
    palletFork(c, forkAng, st);

    /* The balance, integrated rather than posed.
     *
     * At 2.5 Hz and 135 degrees the rim is crossing thirty-five degrees in a
     * single frame at mid-swing, so there is no honest single position to draw:
     * at any real shutter the balance IS the smear. Eleven samples across the
     * frame's own exposure, weighted by how long the wheel spends at each -
     * which is longest at the ends, where it stops to turn around. That
     * weighting is why the blur has bright ends and a thin middle, and it is
     * the difference between motion blur and a fan of copies. */
    if (st >= 2 && !reduce) {
      var N = 11, k, acc = 0, wts = [];
      for (k = 0; k < N; k++) {
        var tk = tt + (k / (N - 1) - 0.5) * (1 / 60);
        wts.push({
          th: 2.356 * Math.sin(Math.PI * tk * 5),
          // Dwell: the wheel is slowest where the cosine of its phase is,
          // which is at the two extremes of the swing. That weighting is why
          // the smear has bright ends and a thin middle, and it is the
          // difference between motion blur and a fan of copies.
          w: 1 / (0.16 + Math.abs(Math.cos(Math.PI * tk * 5)))
        });
        acc += wts[k].w;
      }
      balanceRim(c, st);
      for (k = 0; k < N; k++) {
        c.globalAlpha = wts[k].w / acc;
        balanceSpokes(c, wts[k].th, st);
      }
      c.globalAlpha = 1;
    } else {
      balanceRim(c, st);
      balanceSpokes(c, theta, st);
    }
    hairspring(c, theta, st);
    c.restore();

    c.drawImage(mvPlate.cock, 0, 0, VW, VH);

    /* --------------------------------------------------- the grain highlight
     *
     * The one idea. Every finished surface here has a grain direction, and a
     * grained surface reflects a light as a line perpendicular to that grain
     * rather than as a point. Both finishes on this plate - circular perlage
     * and straight cotes - therefore throw their highlight as a band running
     * across the grain, so one band, oriented by the lamp, is the correct
     * answer for the whole movement.
     *
     * It is composited in 'overlay' rather than painted on: overlay lifts what
     * is already light and deepens what is already dark, which means the band
     * exaggerates the texture underneath it instead of covering it. That is
     * exactly what a grain highlight does, and it is why the perlage
     * scintillates spot by spot and the cotes flare band by band as the band
     * crosses them, from pixels that were baked once and never touched again. */
    if (st >= 3) {
      c.save();
      c.beginPath();
      c.arc(MV_CX, MV_CY, MV_R * MV_S, 0, Math.PI * 2);
      c.clip();
      c.globalCompositeOperation = 'overlay';
      var bandDir = keyAng + Math.PI / 2;
      var L = MV_R * MV_S;
      var gx = Math.cos(bandDir) * L, gy = Math.sin(bandDir) * L;
      var sw = c.createLinearGradient(MV_CX - gx, MV_CY - gy, MV_CX + gx, MV_CY + gy);
      // The band has a dark shoulder either side of it as well as a bright
      // core. A grained surface does not just get brighter where the reflection
      // lands: it gets darker beside it, because the same grooves that throw
      // the light at you there are throwing it away from you here.
      sw.addColorStop(0, 'rgba(0,0,0,0)');
      sw.addColorStop(0.2, 'rgba(30,36,46,.30)');
      sw.addColorStop(0.38, 'rgba(160,170,188,.18)');
      sw.addColorStop(0.5, 'rgba(255,253,247,.62)');
      sw.addColorStop(0.62, 'rgba(160,170,188,.18)');
      sw.addColorStop(0.8, 'rgba(30,36,46,.30)');
      sw.addColorStop(1, 'rgba(0,0,0,0)');
      c.fillStyle = sw;
      c.fillRect(MV_CX - L, MV_CY - L, L * 2, L * 2);
      c.restore();
    }

    if (st >= 4) {
      // The plate is a disc lying under a lens: the far edge goes soft, and the
      // corners of the frame fall away.
      /* A macro lens at this magnification has a plane of focus a couple of
       * millimetres deep, and the plate is wider than that. The focus is on the
       * escapement - which is the subject - so the far corners go down rather
       * than staying sharp and dim. The gradient is centred on the balance
       * rather than on the frame, which is the difference between a depth cue
       * and a vignette. */
      var fx = MV_CX + MV.balance.x * MV_S * 0.5, fy = MV_CY + MV.balance.y * MV_S * 0.5;
      var vg = c.createRadialGradient(fx, fy, VH * 0.28, fx, fy, VW * 0.66);
      vg.addColorStop(0, 'rgba(2,3,4,0)');
      vg.addColorStop(0.6, 'rgba(2,3,4,.3)');
      vg.addColorStop(1, 'rgba(2,3,4,.74)');
      c.fillStyle = vg;
      c.fillRect(0, 0, VW, VH);
      c.save();
      c.globalAlpha = 0.42;
      c.drawImage(grain, 0, 0, VW, VH);
      c.restore();
    }
    c.globalAlpha = 1;
  }

  var NOTES = {
    eye: 'Four hundred and sixty iris fibres, each with its own length, bow, width and value, drawn once into a layer and composited. The collarette is a wobbled path rather than a circle, the crypts sit inside it, and the vessels thin as they approach the limbus. The detail almost nobody draws is the caustic: light entering from the key refracts through the cornea and lands as a bright crescent on the far side of the iris, paired with the shadow the corneal overhang throws on the key side. The catchlight is a window with four panes, because a round white dot is what a drawn eye has and a photographed one never does.',
    koi: 'The body is a spine carrying a travelling wave whose amplitude grows as u^1.6, so the head is nearly still and the tail does the work. Two hundred and eighty-six scales are placed in the spine’s local frame at their own (u, v) and shaded by the local normal, which means the wave carries them instead of sliding underneath them. Fins sample the spine at an earlier time rather than running their own easing curve: that lag is follow-through, and it is why they trail the turn instead of leading it.',
    movement: 'A watch movement, running. The other two subjects test whether hundreds of parts can be placed so they agree with each other; this one cannot be placed by eye at all. Every wheel centre is the sum of two pitch radii, the teeth are real epicycloids generated by rolling a circle on the pitch circle — cycloidal, as horology uses, not the involute of industrial gearing — and the going train is arithmetic: 18,000 A/h is five beats a second, a lever escapement releases one tooth per oscillation, so a fifteen-tooth escape wheel turns once every six seconds and 10 × 7.5 × 8 gets you from there to the hour. One number drives all of it at runtime: the balance angle. The finishing is the other half. Metal is anisotropic — a polished sphere reflects a light as a point, a grained surface reflects it as a line perpendicular to the grain — so the highlight here is a band, not a spot, and the perlage scintillates spot by spot while the Geneva stripes flare in sequence underneath it. Move the pointer to move the lamp.',
  };

  function render(t) {
    if (subject === 'eye') drawEye(ctx, stage, t);
    else if (subject === 'koi') drawKoi(ctx, stage, t);
    else drawMovement(ctx, stage, t);
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
    mvPlate.key = '';
    mvWheels.key = '';
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
