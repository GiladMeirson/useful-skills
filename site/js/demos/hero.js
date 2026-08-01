/* Hero — a volume, not a backdrop.
 *
 * Five faceted solids, one per skill, suspended in a field of drifting motes
 * that runs from just in front of the lens to three thousand units back. The
 * point is depth: everything has a real z, the camera has a real focal length,
 * and both the size an object takes on screen and how fast it crosses the frame
 * fall out of that one divide. Move the pointer and the camera looks around the
 * field rather than the field sliding sideways; scroll and the camera dollies
 * into it, so motes near the lens rush past while the far ones barely move.
 *
 * Everything is built out of what this page documents. The shading is
 * canvas-atelier's model, the pointer response is a damped spring rather than a
 * direct binding (a camera bolted to the cursor reads as a gimbal, not as
 * looking), and the depth of field is a set of pre-baked bokeh sprites, because
 * a hundred gradients allocated per frame is a hundred gradients per frame.
 */
Demos.register('hero', function (root) {
  var G = window.Gfx, R = window.Render3D;
  var canvas = root;
  var ctx = canvas.getContext('2d');
  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  var NAMES = ['canvas-atelier', 'physics-2d', 'caveman', 'matrix-agents-skill', 'skill-report'];
  var MESHES = ['icosahedron', 'dodecahedron', 'octahedron', 'cube', 'tetrahedron'];

  var W = 0, H = 0, dpr = 1;
  var cam = R.camera(940);
  var look = { yaw: 0, pitch: 0, vyaw: 0, vpitch: 0 };   // spring state
  var aim = { yaw: 0, pitch: 0 };
  var scrollDolly = 0;

  var FOCUS = 760;              // the plane the lens is focused on
  var FAR = 3400;
  var solids = [], motes = [];
  var grain = G.noiseTile(300, 300, 0.03, 2);
  var grainPattern = null;      // createPattern allocates; do it once
  var shadowSprite = null;      // baked, because canvas filter blur is not free

  // Four softness levels is plenty: the eye reads the falloff, not the count.
  var BOKEH = [], BOKEH_WARM = [];
  function buildSprites() {
    BOKEH = [0, 0.34, 0.66, 1].map(function (s) { return R.bokehSprite(s, '236,228,214'); });
    BOKEH_WARM = [0, 0.34, 0.66, 1].map(function (s) { return R.bokehSprite(s, '223,124,78'); });

    /* The contact shadow, baked.
     *
     * It used to be an ellipse under a `ctx.filter = blur(...)`, five times a
     * frame. Canvas filter blur is a full-surface operation and it does not
     * care that the shape under it is small: on a software rasteriser those
     * five calls alone took the hero from sixty frames a second to two. A
     * gradient baked into a 96px sprite once and drawn with drawImage is the
     * same image and costs nothing. */
    var sc = document.createElement('canvas');
    sc.width = sc.height = 96;
    var sx = sc.getContext('2d');
    var sg = sx.createRadialGradient(48, 48, 0, 48, 48, 48);
    sg.addColorStop(0, 'rgba(5,4,6,.85)');
    sg.addColorStop(0.45, 'rgba(5,4,6,.34)');
    sg.addColorStop(1, 'rgba(5,4,6,0)');
    sx.fillStyle = sg;
    sx.fillRect(0, 0, 96, 96);
    shadowSprite = sc;
  }

  // Deterministic: the field is identical on every load, so a reader who
  // scrolls back up sees the composition they left rather than a new roll.
  function rng(seed) {
    var s = seed >>> 0;
    return function () { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
  }

  function build() {
    var rand = rng(90210);

    solids = NAMES.map(function (name, i) {
      return {
        name: name,
        mesh: R.solids[MESHES[i]](),
        // A loose spiral, so no two sit on the same screen ray, biased right so
        // the headline column stays clear at every width.
        home: {
          x: 330 + Math.cos(i * 2.24 + 0.7) * (152 + i * 44),
          y: Math.sin(i * 1.83 + 1.4) * (95 + i * 30),
          z: 470 + i * 205 + rand() * 120
        },
        x: 0, y: 0, z: 0,
        r: [84, 66, 48, 58, 40][i],
        rx: rand() * Math.PI, ry: rand() * Math.PI, rz: rand() * Math.PI,
        drx: (0.05 + rand() * 0.08) * (i % 2 ? 1 : -1),
        dry: (0.07 + rand() * 0.1) * (i % 3 ? 1 : -1),
        drz: (0.015 + rand() * 0.035),
        phase: rand() * Math.PI * 2,
        bob: 12 + rand() * 14
      };
    });

    motes = [];
    for (var m = 0; m < 168; m++) {
      var z = 180 + rand() * (FAR - 180);
      // Spread proportional to depth, so the field fills the frustum instead of
      // funnelling into a tube down the middle.
      var spread = 260 + z * 0.62;
      motes.push({
        x: (rand() - 0.5) * 2 * spread,
        y: (rand() - 0.5) * 1.5 * spread,
        z: z,
        r: 1.1 + rand() * 3.4,
        // A handful carry the accent. More than a handful and the field starts
        // competing with the one thing on the page allowed to point at things.
        warm: rand() < 0.11,
        vx: (rand() - 0.5) * 5,
        vy: (rand() - 0.5) * 4,
        vz: (rand() - 0.5) * 7,
        tw: rand() * Math.PI * 2
      });
    }
  }

  function layout() {
    var rect = canvas.getBoundingClientRect();
    W = Math.max(320, rect.width);
    H = Math.max(320, rect.height);
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    grainPattern = null;
    // Narrow screens get a shorter lens: there is no side column to balance
    // against, so the field comes back to centre and opens up.
    cam.focal = W < 860 ? 690 : 940;
  }

  function step(dt, t) {
    var narrow = W < 860;

    /* Spring the camera toward where the pointer is asking it to look. Stiff
     * enough to feel connected, damped just under critical so it settles
     * without ringing. Binding yaw straight to the cursor is the version that
     * feels like a toy. */
    var k = 26, damp = 9.2;
    look.vyaw += ((aim.yaw - look.yaw) * k - look.vyaw * damp) * dt;
    look.vpitch += ((aim.pitch - look.pitch) * k - look.vpitch * damp) * dt;
    look.yaw += look.vyaw * dt;
    look.pitch += look.vpitch * dt;

    // A slow orbit underneath, so the field is alive for a reader who never
    // moves the mouse. Two incommensurable periods, so it never visibly loops.
    cam.yaw = look.yaw + Math.sin(t * 0.071) * 0.052;
    cam.pitch = look.pitch + Math.cos(t * 0.053) * 0.036;
    cam.x = Math.sin(t * 0.043) * 26 + (narrow ? 210 : 0);
    cam.y = Math.cos(t * 0.037) * 18;
    cam.z = scrollDolly;

    for (var i = 0; i < solids.length; i++) {
      var s = solids[i];
      s.rx += s.drx * dt; s.ry += s.dry * dt; s.rz += s.drz * dt;
      s.x = s.home.x + Math.sin(t * 0.31 + s.phase * 1.7) * 14;
      s.y = s.home.y + Math.sin(t * 0.5 + s.phase) * s.bob;
      s.z = s.home.z;
    }

    for (var m = 0; m < motes.length; m++) {
      var p = motes[m];
      p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
      // Wrap in a box sized to the mote's own depth, so drift never thins the
      // field out at one end or piles it up at the other.
      var spread = 260 + p.z * 0.62;
      if (p.x > spread) p.x = -spread; else if (p.x < -spread) p.x = spread;
      if (p.y > spread * 0.75) p.y = -spread * 0.75;
      else if (p.y < -spread * 0.75) p.y = spread * 0.75;
      if (p.z > FAR) p.z = 180; else if (p.z < 180) p.z = FAR;
    }
  }

  function draw(t) {
    ctx.clearRect(0, 0, W, H);

    // One list, one depth sort, so a mote in front of a solid is actually in
    // front of it. Two separate passes is the bug you only notice once.
    var queue = [];
    var i, p, pr;

    for (i = 0; i < motes.length; i++) {
      p = motes[i];
      pr = R.project(p, cam, W, H);
      if (!pr) continue;
      if (pr.x < -90 || pr.x > W + 90 || pr.y < -90 || pr.y > H + 90) continue;
      queue.push({ kind: 0, o: p, p: pr });
    }
    for (i = 0; i < solids.length; i++) {
      var s = solids[i];
      pr = R.project({ x: s.x, y: s.y, z: s.z }, cam, W, H);
      if (!pr) continue;
      queue.push({ kind: 1, o: s, p: pr });
    }
    queue.sort(function (a, b) { return b.p.z - a.p.z; });

    var light = R.norm3(R.v3(-0.42, -0.68, 0.85));

    for (i = 0; i < queue.length; i++) {
      var q = queue[i];
      var z = q.p.z;
      // Aerial perspective: distance eats contrast before it eats size.
      var fog = Math.pow(G.clamp(1 - (z - 220) / (FAR - 220), 0.03, 1), 1.35);
      // Defocus: how far this sits from the plane the lens is focused on.
      var defocus = G.clamp(Math.abs(z - FOCUS) / 1250, 0, 1);

      if (q.kind === 0) {
        var sprite = (q.o.warm ? BOKEH_WARM : BOKEH)[Math.min(3, Math.round(defocus * 3))];
        // An out-of-focus point does not just blur, it grows: the circle of
        // confusion is the size of the aperture, not the size of the point.
        var size = q.o.r * q.p.f * (1 + defocus * 5.5) * 8;
        if (size < 0.7) continue;
        var tw = 0.72 + Math.sin(t * 0.9 + q.o.tw) * 0.28;
        ctx.globalAlpha = G.clamp(fog * (0.52 - defocus * 0.3) * tw, 0, 0.85);
        ctx.drawImage(sprite, q.p.x - size / 2, q.p.y - size / 2, size, size);
        continue;
      }

      var sc = q.o.r * q.p.f;
      if (sc < 2) continue;

      // Contact shadow, so the solids read as suspended in something rather
      // than pasted onto nothing.
      var shW = sc * 2.1, shH = sc * (0.42 + defocus * 0.5);
      ctx.globalAlpha = 0.3 * fog;
      ctx.drawImage(shadowSprite, q.p.x + sc * 0.12 - shW / 2, q.p.y + sc * 1.24 - shH / 2, shW, shH);

      /* Defocus without a blur filter.
       *
       * A real blur here is one full-surface filter operation per solid per
       * frame, and it is what took this canvas to two frames a second. What the
       * eye actually reads as "out of focus" at this size is not the blur
       * kernel, it is loss of edge: so an out-of-focus solid drops its
       * silhouette stroke, loses contrast toward the fog, and gets a soft halo
       * behind it from the same bokeh sprite the motes use. The motes keep real
       * circles of confusion, and they are what carries the depth cue. */
      if (defocus > 0.16) {
        var halo = sc * (2.2 + defocus * 2.6);
        ctx.globalAlpha = G.clamp(defocus * 0.3 * fog, 0, 0.3);
        ctx.drawImage(BOKEH[3], q.p.x - halo / 2, q.p.y - halo / 2, halo, halo);
      }
      ctx.save();
      ctx.globalAlpha = 1;
      R.drawSolid(ctx, q.o.mesh, {
        x: q.p.x, y: q.p.y,
        scale: sc,
        rx: q.o.rx, ry: q.o.ry, rz: q.o.rz,
        depth: 0,
        focal: 620,
        light: light,
        // Bone facets under a warm key, with the accent kept to the silhouette:
        // the edge is where the eye already is.
        base: '#c9c0b2',
        highlight: '#fff6ea',
        shadow: '#2a2620',
        // The accent edge is the sharpest thing on a solid, so it is the first
        // thing defocus should take away.
        edge: 'rgba(223,110,66,' + (0.34 * fog * (1 - defocus)).toFixed(3) + ')',
        alpha: G.clamp(fog * (1 - defocus * 0.34) * 1.05, 0, 1)
      });
      ctx.restore();
    }

    ctx.globalAlpha = 1;

    // A whisper of grain so none of the gradients read as vector-flat.
    ctx.save();
    ctx.globalAlpha = 0.42;
    if (!grainPattern) grainPattern = ctx.createPattern(grain, 'repeat');
    ctx.fillStyle = grainPattern;
    ctx.fillRect(0, 0, W, H);
    ctx.restore();
  }

  buildSprites();
  build();
  layout();

  var onResize = function () { layout(); };
  window.addEventListener('resize', onResize, { passive: true });

  function pointerMove(e) {
    var rect = canvas.getBoundingClientRect();
    var pt = e.touches ? e.touches[0] : e;
    var nx = (pt.clientX - rect.left) / rect.width - 0.5;
    var ny = (pt.clientY - rect.top) / rect.height - 0.5;
    // Small angles. A camera that swings far enough to notice is a camera the
    // reader is fighting while they try to read the headline.
    aim.yaw = G.clamp(nx, -0.6, 0.6) * 0.2;
    aim.pitch = G.clamp(ny, -0.6, 0.6) * -0.13;
  }
  function pointerLeave() { aim.yaw = 0; aim.pitch = 0; }
  window.addEventListener('mousemove', pointerMove, { passive: true });
  canvas.addEventListener('touchmove', pointerMove, { passive: true });
  canvas.addEventListener('touchend', pointerLeave, { passive: true });
  document.addEventListener('mouseleave', pointerLeave);

  function teardown() {
    window.removeEventListener('resize', onResize);
    window.removeEventListener('mousemove', pointerMove);
    document.removeEventListener('mouseleave', pointerLeave);
  }

  if (reduce) {
    step(0.016, 0);
    draw(0);
    return { destroy: teardown };
  }

  return {
    frame: function (dt, t) {
      /* Scroll dollies the camera into the field. Read inside the frame that is
       * already running rather than from a scroll listener: one property read
       * per frame, no extra handler, and nothing that can fire faster than the
       * thing it drives. */
      var hero = canvas.parentNode;
      var h = (hero && hero.offsetHeight) || 1;
      var prog = G.clamp(window.scrollY / h, 0, 1.4);
      // Eased, so the dolly starts gently instead of lurching on the first
      // wheel notch.
      scrollDolly = (1 - Math.pow(1 - Math.min(prog, 1), 2)) * 620 + Math.max(0, prog - 1) * 300;
      step(Math.min(dt, 0.05), t);
      draw(t);
    },
    destroy: teardown
  };
});
