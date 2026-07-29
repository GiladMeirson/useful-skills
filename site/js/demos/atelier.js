/* canvas-atelier demos.
 *
 * 1) A silk banner: Verlet integration with distance constraints (the skill's
 *    references/physics-motion.md), shaded by fold curvature so it reads as lit
 *    cloth rather than a moving wireframe. Drag it.
 * 2) A stage strip rendering the SAME subject through the skill's workflow, so
 *    the difference between a block-in and a finished render is visible rather
 *    than described.
 */
Demos.register('atelier-cloth', function (root) {
  var G = window.Gfx;
  var canvas = root.querySelector('canvas');
  var VW = 900, VH = 380;
  var ctx = G.fitCanvas(canvas, VW, VH);
  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  window.addEventListener('resize', function () { ctx = G.fitCanvas(canvas, VW, VH); }, { passive: true });

  // Finer mesh than the physics needs, purely so the shaded quads read as a
  // smooth surface instead of visible facets.
  var COLS = 42, ROWS = 15, SPACING = 15;
  var ORIGIN_X = 92, ORIGIN_Y = 66;
  // Wind has to dominate gravity or the banner just hangs down the pole.
  var GRAVITY = 210;          // px/s²
  var FIXED = 1 / 60;
  var pts = [], links = [];
  var pointer = { x: -999, y: -999, down: false, grabbed: null };
  var t0 = 0;

  function build() {
    pts = []; links = [];
    for (var y = 0; y < ROWS; y++) {
      for (var x = 0; x < COLS; x++) {
        var px = ORIGIN_X + x * SPACING;
        var py = ORIGIN_Y + y * SPACING;
        pts.push({ x: px, y: py, px: px, py: py, pinned: x === 0 });
      }
    }
    function link(a, b) {
      var A = pts[a], B = pts[b];
      links.push({ a: a, b: b, len: Math.hypot(B.x - A.x, B.y - A.y) });
    }
    for (var yy = 0; yy < ROWS; yy++) {
      for (var xx = 0; xx < COLS; xx++) {
        var i = yy * COLS + xx;
        if (xx < COLS - 1) link(i, i + 1);
        if (yy < ROWS - 1) link(i, i + COLS);
      }
    }
  }

  function step(dt, time) {
    // Wind varies across the banner so the ripple travels rather than pulsing.
    for (var i = 0; i < pts.length; i++) {
      var p = pts[i];
      if (p.pinned) { p.x = p.px = ORIGIN_X; p.y = p.py = ORIGIN_Y + Math.floor(i / COLS) * SPACING; continue; }
      var col = i % COLS;
      var row = (i / COLS) | 0;
      var gust = 1 + Math.sin(time * 0.41) * 0.3;
      // A wave travelling along the banner: the per-column phase is what makes
      // some columns compress while others stretch, and that compression is
      // exactly what the shading below reads as a fold.
      var wave = Math.sin(time * 2.6 - col * 0.4 + row * 0.12);
      var wind = (760 + wave * 620) * gust;
      var lift = wave * 210 * (col / COLS);
      var vx = (p.x - p.px) * 0.988;
      var vy = (p.y - p.py) * 0.988;
      p.px = p.x; p.py = p.y;
      // Verlet: next = current + (current - previous) + a·dt².
      // The acceleration term is a·dt² and nothing else — scaling it by the
      // frame rate makes gravity two orders of magnitude too strong, and the
      // constraint solver cannot hold the sheet together against it.
      p.x += vx + wind * dt * dt;
      p.y += vy + (GRAVITY + lift) * dt * dt;
    }

    if (pointer.grabbed != null) {
      var g = pts[pointer.grabbed];
      g.x = pointer.x; g.y = pointer.y;
    }

    for (var pass = 0; pass < 4; pass++) {
      for (var k = 0; k < links.length; k++) {
        var l = links[k], A = pts[l.a], B = pts[l.b];
        var dx = B.x - A.x, dy = B.y - A.y;
        var d = Math.hypot(dx, dy) || 0.0001;
        var diff = (l.len - d) / d * 0.5;
        var ox = dx * diff, oy = dy * diff;
        if (!A.pinned) { A.x -= ox; A.y -= oy; }
        if (!B.pinned) { B.x += ox; B.y += oy; }
      }
    }
  }

  /* Depth field.
   *
   * The Verlet sim runs in the plane, which is fine for how the banner swings
   * but gives light nothing to catch — a flat sheet shades uniformly no matter
   * how the wind moves it. Adding a travelling wave in z and shading from the
   * real surface normal is what turns it into cloth: a crest turns toward the
   * light and goes warm, the trough behind it falls into a cooler shadow.
   */
  function depthAt(col, row, time) {
    // Pinned edge stays flattest, the free end swings most — but not squared,
    // which would leave two thirds of the banner with no fold to light at all.
    var reach = 0.22 + 0.78 * (col / (COLS - 1));
    return Math.sin(time * 2.5 - col * 0.42 + row * 0.15) * 46 * reach;
  }

  var LIGHT = (function () {
    var l = { x: -0.42, y: -0.55, z: 0.72 };
    var m = Math.hypot(l.x, l.y, l.z);
    return { x: l.x / m, y: l.y / m, z: l.z / m };
  })();

  function draw(time) {
    ctx.clearRect(0, 0, VW, VH);

    // Project: depth shifts a point slightly and scales it, so the wave reads
    // as volume rather than as a stripe pattern painted on a flat sheet.
    var proj = new Array(pts.length);
    for (var i = 0; i < pts.length; i++) {
      var z = depthAt(i % COLS, (i / COLS) | 0, time);
      var s = 1 + z / 900;
      proj[i] = { x: pts[i].x + z * 0.22, y: (pts[i].y - ORIGIN_Y) * s + ORIGIN_Y, z: z };
    }

    for (var y = 0; y < ROWS - 1; y++) {
      for (var x = 0; x < COLS - 1; x++) {
        var k = y * COLS + x;
        var a = proj[k], b = proj[k + 1], c = proj[k + COLS + 1], d = proj[k + COLS];

        // Surface normal from the depth gradient across this quad.
        var dzx = (b.z - a.z) / SPACING;
        var dzy = (d.z - a.z) / SPACING;
        var nx = -dzx, ny = -dzy, nz = 1;
        var nl = Math.hypot(nx, ny, nz);
        nx /= nl; ny /= nl; nz /= nl;
        var lambert = G.clamp(nx * LIGHT.x + ny * LIGHT.y + nz * LIGHT.z, 0, 1);
        // A little extra shaping from how the quad itself is tilted on screen.
        var slope = (b.y - a.y) / SPACING;
        lambert = G.clamp(lambert * 0.92 - slope * 0.22, 0, 1);

        var hue = x / (COLS - 1);
        var base = G.mixHex('#d69140', '#7d5390', hue * 0.6);
        var col = G.shade(base, lambert, { light: '#ffe4b4', shadow: '#1c1636', ambient: 0.14 });

        ctx.beginPath();
        ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.lineTo(c.x, c.y); ctx.lineTo(d.x, d.y);
        ctx.closePath();
        ctx.fillStyle = col;
        ctx.fill();
        // Stroke the same path in the same colour: adjacent quads share an edge
        // and antialiasing leaves a visible hairline grid otherwise.
        ctx.strokeStyle = col;
        ctx.lineWidth = 1;
        ctx.stroke();

        // Specular sheen along the crest of a fold facing the light.
        if (lambert > 0.82) {
          ctx.globalAlpha = G.clamp((lambert - 0.82) * 2.4, 0, 0.34);
          ctx.fillStyle = '#fff2d8';
          ctx.fill();
          ctx.globalAlpha = 1;
        }
      }
    }

    // Pole
    ctx.fillStyle = '#2b3550';
    ctx.fillRect(ORIGIN_X - 7, ORIGIN_Y - 22, 7, (ROWS - 1) * SPACING + 44);
    ctx.fillStyle = 'rgba(247,214,158,.5)';
    ctx.fillRect(ORIGIN_X - 7, ORIGIN_Y - 22, 2, (ROWS - 1) * SPACING + 44);
  }

  function nearest(x, y) {
    var best = null, bd = 30 * 30;
    for (var i = 0; i < pts.length; i++) {
      var dx = pts[i].x - x, dy = pts[i].y - y;
      var d2 = dx * dx + dy * dy;
      if (d2 < bd) { bd = d2; best = i; }
    }
    return best;
  }
  function toLocal(e) {
    var r = canvas.getBoundingClientRect();
    var p = e.touches ? e.touches[0] : e;
    return { x: (p.clientX - r.left) * (VW / r.width), y: (p.clientY - r.top) * (VH / r.height) };
  }
  function down(e) {
    var p = toLocal(e);
    pointer.x = p.x; pointer.y = p.y;
    pointer.grabbed = nearest(p.x, p.y);
    if (pointer.grabbed != null) e.preventDefault();
  }
  function move(e) {
    var p = toLocal(e);
    pointer.x = p.x; pointer.y = p.y;
    if (pointer.grabbed != null) e.preventDefault();
  }
  function up() { pointer.grabbed = null; }

  canvas.addEventListener('mousedown', down);
  canvas.addEventListener('touchstart', down, { passive: false });
  window.addEventListener('mousemove', move);
  canvas.addEventListener('touchmove', move, { passive: false });
  window.addEventListener('mouseup', up);
  canvas.addEventListener('touchend', up);

  build();

  if (reduce) {
    for (var i = 0; i < 260; i++) step(FIXED, i * FIXED);
    draw(260 * FIXED);
    return {};
  }

  // Verlet derives velocity from the last position, so a variable dt silently
  // rescales it. Step at a fixed rate and let an accumulator absorb the jitter.
  var acc = 0, simTime = 0;
  return {
    frame: function (dt, t) {
      t0 = t;
      acc += Math.min(dt, 0.1);
      var guard = 0;
      while (acc >= FIXED && guard++ < 5) {
        simTime += FIXED;
        step(FIXED, simTime);
        acc -= FIXED;
      }
      draw(simTime);
    }
  };
});


/* ---- Stage strip: the same pear rendered through the workflow ---- */
Demos.register('atelier-stages', function (root) {
  var G = window.Gfx;
  var STAGES = [
    { id: 'block', cap: '1 · block-in' },
    { id: 'contour', cap: '2 · contour' },
    { id: 'light', cap: '3 · light' },
    { id: 'texture', cap: '4 · texture' },
    { id: 'final', cap: '5 · finish' }
  ];
  var S = 220;
  var noise = G.noiseTile(S, S, 0.055, 1);

  function pearPath(ctx, cx, cy, organic) {
    ctx.beginPath();
    if (!organic) {
      // The block-in: primitives only, checking proportion.
      ctx.ellipse(cx, cy + 26, 46, 52, 0, 0, Math.PI * 2);
      ctx.moveTo(cx + 30, cy - 22);
      ctx.ellipse(cx, cy - 24, 30, 34, 0, 0, Math.PI * 2);
      return;
    }
    // Asymmetric beziers — deliberately not mirror-symmetric.
    ctx.moveTo(cx - 2, cy - 62);
    ctx.bezierCurveTo(cx + 26, cy - 58, cx + 35, cy - 26, cx + 30, cy - 4);
    ctx.bezierCurveTo(cx + 25, cy + 20, cx + 50, cy + 34, cx + 47, cy + 56);
    ctx.bezierCurveTo(cx + 44, cy + 80, cx + 22, cy + 92, cx - 2, cy + 91);
    ctx.bezierCurveTo(cx - 27, cy + 90, cx - 47, cy + 77, cx - 48, cy + 54);
    ctx.bezierCurveTo(cx - 49, cy + 31, cx - 26, cy + 19, cx - 30, cy - 4);
    ctx.bezierCurveTo(cx - 34, cy - 28, cx - 24, cy - 57, cx - 2, cy - 62);
    ctx.closePath();
  }

  function drawStage(ctx, stage) {
    var cx = S / 2, cy = S / 2 - 6;
    ctx.clearRect(0, 0, S, S);

    // ground
    var gg = ctx.createLinearGradient(0, S * 0.72, 0, S);
    gg.addColorStop(0, '#0d1526');
    gg.addColorStop(1, '#070b14');
    ctx.fillStyle = gg;
    ctx.fillRect(0, S * 0.72, S, S * 0.28);

    if (stage !== 'block') {
      ctx.save();
      ctx.globalAlpha = .5;
      ctx.beginPath();
      ctx.ellipse(cx + 14, cy + 92, 54, 11, 0, 0, Math.PI * 2);
      ctx.fillStyle = '#03060d';
      ctx.filter = 'blur(7px)';
      ctx.fill();
      ctx.restore();
    }

    if (stage === 'block') {
      ctx.save();
      ctx.globalAlpha = .55;
      pearPath(ctx, cx, cy, false);
      ctx.fillStyle = '#5a6a8c';
      ctx.fill();
      ctx.restore();
      ctx.strokeStyle = 'rgba(224,165,78,.5)';
      ctx.setLineDash([3, 4]);
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(cx, 18); ctx.lineTo(cx, S - 18); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(24, cy + 30); ctx.lineTo(S - 24, cy + 30); ctx.stroke();
      ctx.setLineDash([]);
      return;
    }

    if (stage === 'contour') {
      pearPath(ctx, cx, cy, true);
      ctx.fillStyle = '#4a5570';
      ctx.fill();
      ctx.strokeStyle = 'rgba(247,214,158,.75)';
      ctx.lineWidth = 1.4;
      ctx.stroke();
      return;
    }

    // light / texture / final all start from the lit form
    ctx.save();
    pearPath(ctx, cx, cy, true);
    ctx.clip();

    var grad = ctx.createRadialGradient(cx - 22, cy - 26, 6, cx + 4, cy + 20, 108);
    grad.addColorStop(0, '#f2d98a');
    grad.addColorStop(.32, '#cfa845');
    grad.addColorStop(.62, '#8f7526');
    grad.addColorStop(.85, '#4c4326');
    grad.addColorStop(1, '#25243a');
    ctx.fillStyle = grad;
    ctx.fillRect(cx - 70, cy - 80, 150, 190);

    // bounce light from the surface below, on the shadow side
    var bounce = ctx.createRadialGradient(cx + 26, cy + 74, 2, cx + 26, cy + 74, 54);
    bounce.addColorStop(0, 'rgba(150,120,190,.28)');
    bounce.addColorStop(1, 'rgba(150,120,190,0)');
    ctx.fillStyle = bounce;
    ctx.fillRect(cx - 70, cy - 80, 150, 190);

    if (stage === 'texture' || stage === 'final') {
      ctx.drawImage(noise, 0, 0, S, S);
      // freckles
      for (var i = 0; i < 40; i++) {
        var a = (i * 2.399) % (Math.PI * 2);
        var rr = 12 + ((i * 37) % 44);
        var px = cx + Math.cos(a) * rr * 0.85;
        var py = cy + 16 + Math.sin(a) * rr;
        ctx.globalAlpha = .16;
        ctx.fillStyle = '#5c4318';
        ctx.beginPath(); ctx.arc(px, py, .9 + (i % 3) * .5, 0, Math.PI * 2); ctx.fill();
      }
      ctx.globalAlpha = 1;
    }

    if (stage === 'final') {
      var spec = ctx.createRadialGradient(cx - 24, cy - 30, 1, cx - 24, cy - 30, 17);
      spec.addColorStop(0, 'rgba(255,250,235,.9)');
      spec.addColorStop(1, 'rgba(255,250,235,0)');
      ctx.fillStyle = spec;
      ctx.fillRect(cx - 60, cy - 70, 120, 120);
    }
    ctx.restore();

    if (stage === 'final') {
      // stalk
      ctx.beginPath();
      ctx.moveTo(cx - 2, cy - 60);
      ctx.bezierCurveTo(cx + 3, cy - 78, cx + 9, cy - 88, cx + 17, cy - 92);
      ctx.strokeStyle = '#6a4f28';
      ctx.lineWidth = 4.5;
      ctx.lineCap = 'round';
      ctx.stroke();
      ctx.strokeStyle = 'rgba(247,214,158,.35)';
      ctx.lineWidth = 1.4;
      ctx.stroke();
      // rim light along the shadow edge
      ctx.save();
      pearPath(ctx, cx, cy, true);
      ctx.clip();
      var rim = ctx.createLinearGradient(cx + 20, cy, cx + 52, cy + 30);
      rim.addColorStop(0, 'rgba(255,226,180,0)');
      rim.addColorStop(1, 'rgba(255,226,180,.42)');
      ctx.fillStyle = rim;
      ctx.fillRect(cx - 60, cy - 70, 120, 175);
      ctx.restore();
    }
  }

  function paintAll() {
    root.querySelectorAll('[data-stage]').forEach(function (cell) {
      var c = cell.querySelector('canvas');
      drawStage(G.fitCanvas(c, S, S), cell.getAttribute('data-stage'));
    });
  }
  paintAll();

  var t = null;
  window.addEventListener('resize', function () {
    clearTimeout(t);
    t = setTimeout(paintAll, 160);
  }, { passive: true });

  return {};
});
