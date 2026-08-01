/* The ambient field — the page's one continuous sense of space.
 *
 * A fixed canvas behind everything, holding a volume the whole document scrolls
 * through. The hero has its own field with its own camera; this is the quieter
 * one that runs the length of the page, so that scrolling from the protocol
 * table to the footer feels like moving through something rather than sliding a
 * sheet of paper past a window.
 *
 * There are four layers in it, and they are four different distances.
 *
 * 1. Stars, at infinity. They are projected by camera *rotation* only: the
 *    dolly does not touch them. That is the entire trick. Depth is not something
 *    you can draw, it is something the viewer infers from differential motion,
 *    and the only way to make a near thing feel near is to put something behind
 *    it that refuses to move. Everything else here exists to be measured
 *    against this layer.
 *
 * 2. The armillary — five great circles at infinity, one of them graduated in
 *    three-degree ticks, turning on their own axis about once every four
 *    minutes. It says the volume is instrumented rather than empty: you are not
 *    falling through a starfield, you are inside something that was built. It is
 *    also the only element on the page drawn at a scale nothing else can reach.
 *
 * 3. Dust, in the volume, which streaks. At rest the streak length is exactly
 *    zero and the field is still. Flick the page and every mote elongates along
 *    its own radial from the vanishing point, by an amount proportional to how
 *    fast it is passing the lens — which is what a shutter actually integrates.
 *    So the wow arrives only while you are moving, and moving is the one moment
 *    you are not reading. An ambient effect that is loudest when the page is
 *    still has its priorities backwards.
 *
 * 4. Solids, tumbling, drawn twice: once shaded and once as a hidden-line
 *    wireframe over the top. The wireframe is what makes them read as computed
 *    objects rather than as floating rocks, which is the correct impression for
 *    the background of a page about renderers.
 *
 * Two geometric ideas hold it together.
 *
 * The field is periodic in z. Every object's depth is taken modulo the field
 * length, which tiles the volume into an endless tunnel: scroll forward for
 * seventeen thousand pixels and it never empties, scroll back up and it is the
 * same field you came through rather than a fresh roll of the dice. A recycling
 * scheme keyed to a monotonic counter cannot do that — it only works while the
 * reader agrees to keep going down.
 *
 * And the solids ride a tube rather than a box. Their distance from the axis
 * grows with their own depth, so every one of them projects to roughly the same
 * screen radius no matter how far away it is. That leaves the middle of the
 * frame — where the text is — permanently clear, without a single rule about
 * where the text happens to be.
 *
 * Restraint is the rest of the design. It sits at the grid layer, under every
 * rule and every plate; it never touches the accent; its brightest element is
 * dimmer than the hairlines in front of it. If a reader notices it as an effect,
 * it is turned up too far. Under prefers-reduced-motion it draws one still frame
 * and stops: reduced motion is an instruction to remove the motion, not to
 * remove the room.
 */
Demos.register('depth-field', function (canvas) {
  var G = window.Gfx, R = window.Render3D;
  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var coarse = window.matchMedia('(pointer: coarse)').matches;
  // A thumb covers most of a phone screen and the field would be invisible
  // underneath it. Paying for a canvas nobody can see is the definition of a
  // decorative cost.
  if (coarse) { canvas.style.display = 'none'; return {}; }

  var ctx = canvas.getContext('2d');
  var W = 0, H = 0, dpr = 1;
  var cam = R.camera(820);
  var NEAR = 240, FIELD = 2500, SKY = 50000;
  var motes = [], drifters = [], starBands = [], rings = [];
  var SPRITES = [];
  var MESH_NAMES = ['tetrahedron', 'octahedron', 'cube', 'icosahedron', 'dodecahedron'];
  var meshes = {};

  /* Two palettes, because the layer composites differently in each theme. In
   * dark it sits normally and the stars are bone; in light it is multiplied, so
   * anything pale in it is a no-op and every line has to be drawn dark to show
   * up at all. Same geometry, inverted ink. */
  var INK = {
    dark:  { star: '226,222,212', ring: '150,168,196', wire: '226,220,208', k: 1 },
    light: { star: '48,54,68',    ring: '58,70,92',    wire: '46,50,60',    k: 0.62 }
  };
  var ink = INK.dark;
  function readTheme() {
    var t = document.documentElement.getAttribute('data-theme');
    if (!t) t = window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
    ink = INK[t] || INK.dark;
  }
  readTheme();
  var themeWatch = new MutationObserver(readTheme);
  themeWatch.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });

  function rng(seed) {
    var s = seed >>> 0;
    return function () { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
  }

  function build() {
    SPRITES = [0.15, 0.5, 0.85, 1].map(function (s) {
      return R.bokehSprite(s, '214,206,192', 48);
    });
    MESH_NAMES.forEach(function (n) { meshes[n] = R.solids[n](); });

    var rand = rng(31337);

    /* Stars, on a unit sphere. Brightness is fixed per star and quantised into
     * five bands at build time, so a frame costs five fillStyle assignments
     * instead of a hundred and seventy string concatenations. */
    var BANDS = 5;
    starBands = [];
    for (var b = 0; b < BANDS; b++) starBands.push({ a: (b + 1) / BANDS, pts: [] });
    for (var s = 0; s < 170; s++) {
      // Uniform on the sphere: acos of a uniform z, not a uniform polar angle,
      // which would crowd them at the poles.
      var ct = rand() * 2 - 1, st2 = Math.sqrt(1 - ct * ct), ph = rand() * Math.PI * 2;
      // Magnitude distribution: a few bright ones, a lot of faint ones. Even
      // brightness is the thing that makes a drawn starfield read as noise.
      var mag = Math.pow(rand(), 2.6);
      starBands[Math.min(BANDS - 1, (mag * BANDS) | 0)].pts.push({
        x: st2 * Math.cos(ph) * SKY, y: ct * SKY * 0.8, z: st2 * Math.sin(ph) * SKY,
        r: 0.7 + mag * 1.7
      });
    }

    /* The armillary. Five great circles, each defined by its normal, sampled at
     * 84 points — which is where a ring at this radius stops visibly gaining a
     * curve and starts only costing projections. One of them carries
     * graduations. */
    rings = [];
    var incl = [0.0, 0.62, -0.48, 1.22, 2.05];
    for (var g = 0; g < incl.length; g++) {
      var nx = Math.sin(incl[g]) * Math.cos(g * 1.37);
      var ny = Math.cos(incl[g]);
      var nz = Math.sin(incl[g]) * Math.sin(g * 1.37);
      // Two orthonormal vectors spanning the plane of the circle.
      var up = Math.abs(ny) > 0.9 ? { x: 1, y: 0, z: 0 } : { x: 0, y: 1, z: 0 };
      var u = R.norm3({
        x: up.y * nz - up.z * ny, y: up.z * nx - up.x * nz, z: up.x * ny - up.y * nx
      });
      var v = R.norm3({
        x: ny * u.z - nz * u.y, y: nz * u.x - nx * u.z, z: nx * u.y - ny * u.x
      });
      rings.push({ u: u, v: v, n: { x: nx, y: ny, z: nz }, graduated: g === 1 });
    }

    motes = [];
    for (var i = 0; i < 92; i++) {
      motes.push({
        th: rand() * Math.PI * 2,
        k: 0.12 + rand() * 1.5,          // distance from the axis, as a fraction of z
        z0: rand() * FIELD,
        r: 0.9 + rand() * 2.6,
        vth: (rand() - 0.5) * 0.05,
        tw: rand() * Math.PI * 2
      });
    }

    /* Twenty-two solids is the whole budget. Each one costs a gradient per
     * visible face plus an edge pass, and this canvas runs for the entire
     * length of the page — it is the one animation on the site with no scroll
     * position at which it stops. The hard cull below is what keeps that
     * affordable. */
    drifters = [];
    for (var d = 0; d < 22; d++) {
      var name = MESH_NAMES[(d * 3 + 1) % MESH_NAMES.length];
      // Every fifth one is a giant. A field of same-sized objects has no scale;
      // one thing passing close and huge is what tells you how big the rest of
      // the volume is, and it is the oldest trick in every shot of a spacecraft.
      var giant = d % 5 === 2;
      drifters.push({
        mesh: meshes[name],
        th: (d / 22) * Math.PI * 2 + rand() * 0.5,
        // Out on the tube: this projects to a screen radius of roughly
        // k * 0.42 * focal, so 0.8 puts it at ~275px from centre and 2.1 puts
        // it off the edge of a laptop viewport entirely. Giants ride further
        // out, because a giant in the middle of the frame is a wall.
        k: giant ? 1.85 + rand() * 0.9 : 0.72 + rand() * 1.3,
        z0: (d / 22) * FIELD + rand() * 100,
        r: giant ? 92 + rand() * 54 : 38 + rand() * 58,
        vth: (rand() - 0.5) * 0.028,     // a slow orbit around the axis
        // Zero gravity: constant angular velocity on all three axes and nothing
        // that ever damps it. A tumble that eases is a tumble something is
        // resisting.
        rx: rand() * Math.PI, ry: rand() * Math.PI, rz: rand() * Math.PI,
        drx: (rand() - 0.5) * 0.24,
        dry: (rand() - 0.5) * 0.3,
        drz: (rand() - 0.5) * 0.16,
        bob: rand() * Math.PI * 2,
        giant: giant
      });
    }
  }

  function layout() {
    W = window.innerWidth;
    H = window.innerHeight;
    dpr = Math.min(window.devicePixelRatio || 1, 1.5);   // dust does not need 2x
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  /* Depth, tiled. The modulo is what makes the tunnel endless in both
   * directions; without it, scrolling back up walks off the front of the field.
   *
   * The dolly lives here and NOT on cam.z. Putting it in both places subtracts
   * it twice — once folding the object into the tunnel, once again inside the
   * projection — which drops every object behind the near plane and culls the
   * entire field to nothing. The camera stays at the origin and the world moves
   * past it. */
  var dolly = 0, vel = 0, prevDolly = 0, roll = 0, spin = 0;
  function tiled(z0) {
    return ((z0 - dolly) % FIELD + FIELD) % FIELD + NEAR;
  }

  build();
  layout();

  var onResize = function () { layout(); };
  window.addEventListener('resize', onResize, { passive: true });

  var light = R.norm3(R.v3(-0.45, -0.7, 0.8));
  /* The palette never changes out here, so the shading is a lookup rather than
   * a calculation. And the faces get flat fills: a gradient across a face is
   * the right call in the hero, where a solid is four hundred pixels across and
   * lit hard, and it is invisible at the quarter-alpha these are drawn at.
   * Paying full price for a difference nobody can see is how a background ends
   * up costing more than the page. */
  var RAMP = R.shadeRamp('#b9b1a4', { light: '#f4ece0', shadow: '#2b2722', ambient: 0.34 });

  /* ------------------------------------------------------------ the sky ---
   * Everything in here is at SKY radius and moves with camera rotation only. */
  function drawSky() {
    var i, j, p;

    for (i = 0; i < starBands.length; i++) {
      var band = starBands[i];
      ctx.fillStyle = 'rgba(' + ink.star + ',' + (band.a * 0.44 * ink.k).toFixed(3) + ')';
      for (j = 0; j < band.pts.length; j++) {
        var st = band.pts[j];
        p = R.project(st, cam, W, H);
        if (!p) continue;
        if (p.x < -4 || p.x > W + 4 || p.y < -4 || p.y > H + 4) continue;
        ctx.fillRect(p.x, p.y, st.r, st.r);
      }
    }

    var cs = Math.cos(spin), sn = Math.sin(spin);
    function onRing(ring, a, lift) {
      // A point on the great circle, optionally lifted toward the ring's own
      // normal — which is how a graduation tick gets drawn on a sphere.
      var x = ring.u.x * Math.cos(a) + ring.v.x * Math.sin(a) + ring.n.x * lift;
      var y = ring.u.y * Math.cos(a) + ring.v.y * Math.sin(a) + ring.n.y * lift;
      var z = ring.u.z * Math.cos(a) + ring.v.z * Math.sin(a) + ring.n.z * lift;
      // The whole armillary turns about the vertical as one rigid body.
      return { x: (x * cs - z * sn) * SKY, y: y * SKY, z: (x * sn + z * cs) * SKY };
    }

    ctx.lineWidth = 1;
    for (i = 0; i < rings.length; i++) {
      var ring = rings[i];
      ctx.strokeStyle = 'rgba(' + ink.ring + ',' + (0.18 * ink.k).toFixed(3) + ')';
      ctx.beginPath();
      var open = false;
      for (j = 0; j <= 84; j++) {
        p = R.project(onRing(ring, (j / 84) * Math.PI * 2, 0), cam, W, H);
        // A ring that surrounds the camera has half its points behind the lens.
        // Breaking the path there rather than joining across is the difference
        // between a circle and a chord slashed across the frame.
        if (!p) { open = false; continue; }
        if (!open) { ctx.moveTo(p.x, p.y); open = true; } else ctx.lineTo(p.x, p.y);
      }
      ctx.stroke();

      if (!ring.graduated) continue;
      /* Graduations every six degrees, long every thirty. Nobody will read
       * them. They are there because a scale that goes all the way round is the
       * detail that separates an instrument from a decorative circle, and the
       * page can afford one thing that only rewards looking twice. */
      ctx.strokeStyle = 'rgba(' + ink.ring + ',' + (0.13 * ink.k).toFixed(3) + ')';
      ctx.beginPath();
      for (j = 0; j < 60; j++) {
        var ang = (j / 60) * Math.PI * 2;
        var a1 = R.project(onRing(ring, ang, 0), cam, W, H);
        var a2 = R.project(onRing(ring, ang, j % 5 === 0 ? 0.026 : 0.011), cam, W, H);
        if (!a1 || !a2) continue;
        ctx.moveTo(a1.x, a1.y);
        ctx.lineTo(a2.x, a2.y);
      }
      ctx.stroke();
    }
  }

  /* ---------------------------------------------------------- the volume --- */
  function drawVolume(t, dt) {
    var i, o, zz, rad, pr, fog, defocus, size;
    // The vanishing point: where a point straight ahead lands. Motes streak
    // along their own radial from it, because that is the direction the dolly
    // actually moves them.
    var vp = R.project({ x: 0, y: 0, z: 4000 }, cam, W, H) || { x: W / 2, y: H / 2 };

    for (i = 0; i < motes.length; i++) {
      o = motes[i];
      o.th += o.vth * dt;
      zz = tiled(o.z0);
      rad = zz * o.k * 0.42;
      pr = R.project({ x: Math.cos(o.th) * rad, y: Math.sin(o.th) * rad * 0.82, z: zz }, cam, W, H);
      if (!pr) continue;
      if (pr.x < -120 || pr.x > W + 120 || pr.y < -120 || pr.y > H + 120) continue;

      fog = Math.pow(G.clamp(1 - (pr.z - NEAR) / FIELD, 0, 1), 1.5);
      defocus = G.clamp(Math.abs(pr.z - 700) / 1100, 0, 1);
      /* Capped. A defocused mote close to the lens wants to be two hundred
       * pixels of circle of confusion, and at the alpha it is drawn with that
       * is a quarter of a megapixel of blending for something the eye reads as
       * a smudge. The cap costs a little honesty in the bokeh and buys back
       * most of the frame. */
      size = Math.min(120, o.r * pr.f * (1 + defocus * 4.5) * 7);
      if (size < 0.6) continue;
      var midM = G.clamp(Math.abs(pr.x - W / 2) / (W * 0.34), 0, 1);
      var alpha = G.clamp(fog * (0.3 - defocus * 0.19) * (0.7 + Math.sin(t * 0.7 + o.tw) * 0.3)
        * (0.34 + 0.66 * midM), 0, 0.34);
      // Below this the blit changes no pixel a display can show.
      if (alpha < 0.012) continue;
      ctx.globalAlpha = alpha;

      /* The streak. Screen displacement per frame is (distance from the
       * vanishing point) x (depth travelled / depth), which falls straight out
       * of the perspective divide — near motes smear, far ones barely move,
       * and that gradient across the frame is the part that sells the speed.
       * Centred on the current position, because a shutter integrates either
       * side of the instant, not forward from it. */
      var dx = pr.x - vp.x, dy = pr.y - vp.y;
      var dist = Math.hypot(dx, dy);
      var len = Math.min(140, dist * Math.abs(vel) / pr.z);
      if (len < 1.5) {
        ctx.drawImage(SPRITES[Math.min(3, Math.round(defocus * 3))],
          pr.x - size / 2, pr.y - size / 2, size, size);
      } else {
        ctx.save();
        ctx.translate(pr.x, pr.y);
        ctx.rotate(Math.atan2(dy, dx));
        // Energy is conserved: a mote smeared over ten times its own length is
        // a tenth as bright. Without this the field gets brighter when you
        // scroll, which is exactly backwards.
        ctx.globalAlpha *= G.clamp(size / (size + len * 0.55), 0.22, 1);
        ctx.drawImage(SPRITES[Math.min(3, Math.round(defocus * 3))],
          -(size + len) / 2, -size / 2, size + len, size);
        ctx.restore();
      }
    }

    for (i = 0; i < drifters.length; i++) {
      o = drifters[i];
      o.th += o.vth * dt;
      o.rx += o.drx * dt; o.ry += o.dry * dt; o.rz += o.drz * dt;
      zz = tiled(o.z0);
      rad = zz * o.k * 0.42;
      pr = R.project({
        x: Math.cos(o.th) * rad,
        y: Math.sin(o.th) * rad * 0.82 + Math.sin(t * 0.2 + o.bob) * 26,
        z: zz
      }, cam, W, H);
      if (!pr) continue;

      var sc = o.r * pr.f;
      // Cull hard. A solid smaller than a few pixels costs a gradient per face
      // to render something indistinguishable from a mote.
      if (sc < 5) continue;
      if (pr.x < -sc * 2 || pr.x > W + sc * 2 || pr.y < -sc * 2 || pr.y > H + sc * 2) continue;

      fog = Math.pow(G.clamp(1 - (pr.z - NEAR) / FIELD, 0, 1), 1.4);
      defocus = G.clamp(Math.abs(pr.z - 700) / 1150, 0, 1);

      /* The tube keeps most of the field out of the middle, but the reading
       * column on this page is nine hundred pixels wide and no amount of
       * geometry gets a solid out of its way at every viewport. So the field
       * also thins toward the centre of the frame: a drifter crossing behind
       * the prose drops to a fifth of its weight and comes back as it clears.
       * Body copy wins every contest with an ambient effect. */
      /* Measured from the object's near edge, not its centre. A two-hundred-
       * pixel solid whose centre is politely off to one side is still lying
       * across the middle of the frame, and the first version of this rule
       * happily let it sit there at full weight. */
      var mid = G.clamp((Math.abs(pr.x - W / 2) - sc) / (W * 0.3), 0, 1);
      /* And a near limit. Past a certain projected size a thing has come closer
       * to the lens than the lens can resolve, and what you get in a real frame
       * is a soft dark shape with no edges — never the crisp wall this used to
       * draw. Fading it out is both the honest result and the one that keeps a
       * solid from ever becoming a backdrop. */
      var near = G.clamp((300 - sc) / 150, 0, 1);
      var clear = (0.16 + 0.84 * mid * mid) * near * near;
      // Bail early rather than paying a gradient per face to composite
      // something under four percent alpha. Below that it is not a faint
      // object, it is a bill.
      if (clear < 0.045) continue;

      // Same trick as the hero: defocus is spent on edge contrast rather than
      // on a blur filter, because a blur filter here costs the whole frame.
      if (defocus > 0.3) {
        // Capped: the halo of a solid passing close is a several-hundred-pixel
        // scaled blit, and two of those in a frame cost more than everything
        // else in this file put together.
        var halo = Math.min(260, sc * (2.4 + defocus * 2.4));
        ctx.globalAlpha = G.clamp(defocus * 0.24 * fog * clear, 0, 0.24);
        ctx.drawImage(SPRITES[3], pr.x - halo / 2, pr.y - halo / 2, halo, halo);
      }

      ctx.globalAlpha = 1;
      /* Mass and lattice are budgeted separately. Tying the wireframe's alpha
       * to the fill's, as this did at first, meant a solid could only ever be a
       * shaded shape with some lines faintly on it — and near the lens, where
       * the fill is strongest, the lines lost. Which is backwards: the closer
       * one of these gets, the more it should read as a construction and the
       * less as a rock. So the fill stays light and the lattice carries it. */
      var mass = G.clamp(fog * (1 - defocus * 0.34) * clear, 0, 1);
      var body = mass * 0.42;
      R.drawSolid(ctx, o.mesh, {
        x: pr.x, y: pr.y,
        scale: sc,
        rx: o.rx, ry: o.ry, rz: o.rz,
        depth: 0,
        focal: 560,
        light: light,
        ramp: RAMP,
        flat: true,
        // No accent out here. The one colour allowed to point at things lives
        // in the content, and a drifting shape is never pointing at anything.
        edge: null,
        alpha: body
      });

      /* The wireframe over the top. Only on the sharp ones: an edge drawn
       * across a shape that is meant to be out of focus is a contradiction the
       * eye catches immediately, and it is the fastest way to make a depth-of-
       * field cue look like a mistake. */
      if (defocus < 0.55) {
        R.wireSolid(ctx, o.mesh, {
          x: pr.x, y: pr.y,
          scale: sc * 1.001,
          rx: o.rx, ry: o.ry, rz: o.rz,
          focal: 560,
          stroke: 'rgba(' + ink.wire + ',1)',
          vertex: o.giant ? 'rgba(' + ink.wire + ',1)' : null,
          width: o.giant ? 0.9 : 0.7,
          alpha: G.clamp(mass * (1 - defocus / 0.55) * 0.62 * ink.k, 0, 0.55)
        });
      }
    }
    ctx.globalAlpha = 1;
  }

  function paint(t, dt) {
    ctx.save();
    ctx.clearRect(0, 0, W, H);
    /* Roll. A slow bank as the page moves, about a degree end to end. It is
     * applied to the context rather than the camera because a roll about the
     * optical axis is exactly a rotation of the finished frame, and doing it
     * here costs one transform instead of a third trigonometric term in every
     * projection on the page. */
    ctx.translate(W / 2, H / 2);
    ctx.rotate(roll);
    ctx.translate(-W / 2, -H / 2);
    drawSky();
    drawVolume(t, dt);
    ctx.restore();
  }

  if (reduce) {
    // One still frame: the room without the movement.
    cam.yaw = 0.05; cam.pitch = -0.03; spin = 0.7;
    paint(1.4, 0);
    return {
      destroy: function () { window.removeEventListener('resize', onResize); themeWatch.disconnect(); }
    };
  }

  return {
    frame: function (dt, t) {
      var doc = document.documentElement;
      var max = (doc.scrollHeight - doc.clientHeight) || 1;
      var prog = window.scrollY / max;
      // Two field lengths across the whole document: enough that the reader
      // passes through solids rather than watching them hold station.
      dolly = prog * FIELD * 2;

      /* Scroll speed, low-passed. The raw per-frame delta is far too spiky to
       * drive a streak — one dropped frame doubles it — and a hard cut back to
       * zero when the wheel stops makes the smear vanish mid-flight. The filter
       * gives the field a short coast, which is also what it would physically
       * do. */
      var raw = (dolly - prevDolly) / Math.max(dt, 0.001);
      prevDolly = dolly;
      vel += (raw * 0.016 - vel) * Math.min(1, dt * 9);

      roll = Math.sin(prog * Math.PI * 1.6) * 0.019;
      spin += dt * 0.026;
      cam.yaw = Math.sin(t * 0.028) * 0.06;
      cam.pitch = Math.cos(t * 0.021) * 0.04;

      paint(t, dt);
    },
    destroy: function () {
      window.removeEventListener('resize', onResize);
      themeWatch.disconnect();
    }
  };
});
