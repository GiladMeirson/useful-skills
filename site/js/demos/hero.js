/* Hero — five faceted solids, one per skill, suspended in the workshop.
 *
 * Deliberately built out of the things this page documents: the shading is
 * canvas-atelier's lighting model, and the drift/collision/settling is the
 * physics-2d engine's own integrator and impulse response reduced to spheres.
 * Move the pointer and they get out of the way.
 */
Demos.register('hero', function (root) {
  var G = window.Gfx, R = window.Render3D;
  var canvas = root;
  var ctx = canvas.getContext('2d');
  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  var NAMES = ['canvas-atelier', 'physics-2d', 'caveman', 'matrix-agents-skill', 'skill-report'];
  var MESHES = ['icosahedron', 'dodecahedron', 'octahedron', 'cube', 'tetrahedron'];

  var W = 0, H = 0, dpr = 1;
  var gems = [];
  var pointer = { x: -9999, y: -9999, active: false };
  var noise = G.noiseTile(300, 300, 0.03, 2);

  function layout() {
    var rect = canvas.getBoundingClientRect();
    W = Math.max(320, rect.width);
    H = Math.max(320, rect.height);
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    // Gems live in the right two-thirds on wide screens; centred when narrow.
    var narrow = W < 860;
    var cx = narrow ? W * 0.5 : W * 0.66;
    var spread = narrow ? Math.min(W, H) * 0.34 : Math.min(W * 0.26, 260);
    for (var i = 0; i < gems.length; i++) {
      var a = (i / gems.length) * Math.PI * 2 + 0.6;
      gems[i].home = {
        x: cx + Math.cos(a) * spread * (0.75 + 0.35 * ((i * 7) % 3) / 2),
        y: H * 0.5 + Math.sin(a) * spread * 0.72
      };
      gems[i].r = (narrow ? 40 : 54) * gems[i].sizeMul;
    }
  }

  function build() {
    gems = NAMES.map(function (name, i) {
      var sizeMul = [1.18, 1.0, 0.78, 0.9, 0.7][i];
      return {
        name: name,
        mesh: R.solids[MESHES[i]](),
        sizeMul: sizeMul,
        r: 54 * sizeMul,
        pos: { x: 0, y: 0 },
        vel: { x: 0, y: 0 },
        home: { x: 0, y: 0 },
        rx: Math.random() * Math.PI, ry: Math.random() * Math.PI, rz: Math.random() * Math.PI,
        // slow, non-synchronised tumble so no two ever look like copies
        drx: (0.06 + Math.random() * 0.10) * (i % 2 ? 1 : -1),
        dry: (0.09 + Math.random() * 0.13) * (i % 3 ? 1 : -1),
        drz: (0.02 + Math.random() * 0.05),
        depth: -70 + i * 34,
        phase: Math.random() * Math.PI * 2
      };
    });
    layout();
    gems.forEach(function (g) { g.pos.x = g.home.x; g.pos.y = g.home.y; });
  }

  function step(dt, t) {
    for (var i = 0; i < gems.length; i++) {
      var g = gems[i];
      g.rx += g.drx * dt; g.ry += g.dry * dt; g.rz += g.drz * dt;

      // Spring back to the home position (an acceleration, added to velocity
      // first — semi-implicit Euler, same as the engine).
      var k = 2.6, damp = 1.9;
      var bobY = Math.sin(t * 0.55 + g.phase) * 10;
      var ax = (g.home.x - g.pos.x) * k - g.vel.x * damp;
      var ay = (g.home.y + bobY - g.pos.y) * k - g.vel.y * damp;

      // Pointer repulsion.
      if (pointer.active) {
        var dx = g.pos.x - pointer.x, dy = g.pos.y - pointer.y;
        var d2 = dx * dx + dy * dy;
        var reach = 210;
        if (d2 < reach * reach && d2 > 1) {
          var d = Math.sqrt(d2);
          var push = (1 - d / reach) * 2600;
          ax += (dx / d) * push;
          ay += (dy / d) * push;
        }
      }

      g.vel.x += ax * dt; g.vel.y += ay * dt;
      g.pos.x += g.vel.x * dt; g.pos.y += g.vel.y * dt;
    }

    // Keep them from overlapping — the same positional split a contact solver
    // applies, minus the rotation.
    for (var p = 0; p < 2; p++) {
      for (var a = 0; a < gems.length; a++) {
        for (var b = a + 1; b < gems.length; b++) {
          var A = gems[a], B = gems[b];
          var dx2 = B.pos.x - A.pos.x, dy2 = B.pos.y - A.pos.y;
          var dist = Math.hypot(dx2, dy2) || 0.001;
          var min = (A.r + B.r) * 0.92;
          if (dist < min) {
            var over = (min - dist) / 2;
            var nx = dx2 / dist, ny = dy2 / dist;
            A.pos.x -= nx * over; A.pos.y -= ny * over;
            B.pos.x += nx * over; B.pos.y += ny * over;
          }
        }
      }
    }
  }

  function draw() {
    ctx.clearRect(0, 0, W, H);

    var light = R.norm3(R.v3(-0.42, -0.68, 0.85));
    // Far gems first so nearer ones overlap them correctly.
    var order = gems.slice().sort(function (a, b) { return b.depth - a.depth; });

    for (var i = 0; i < order.length; i++) {
      var g = order[i];
      var fade = G.clamp(1 - (g.depth + 90) / 420, 0.55, 1);

      // Contact shadow beneath, so they read as suspended rather than pasted on.
      ctx.save();
      ctx.globalAlpha = 0.3 * fade;
      ctx.beginPath();
      ctx.ellipse(g.pos.x + 8, g.pos.y + g.r * 1.15, g.r * 0.7, g.r * 0.16, 0, 0, Math.PI * 2);
      ctx.fillStyle = '#02040a';
      ctx.filter = 'blur(10px)';
      ctx.fill();
      ctx.restore();

      R.drawSolid(ctx, g.mesh, {
        x: g.pos.x, y: g.pos.y,
        scale: g.r,
        rx: g.rx, ry: g.ry, rz: g.rz,
        depth: g.depth,
        light: light,
        base: '#c98f3d',
        highlight: '#ffeccb',
        shadow: '#1d2b45',
        edge: 'rgba(255,231,190,0.13)',
        alpha: fade
      });
    }

    // A whisper of grain so the gradients never read as vector-flat.
    ctx.save();
    ctx.globalAlpha = 0.5;
    var pat = ctx.createPattern(noise, 'repeat');
    ctx.fillStyle = pat;
    ctx.fillRect(0, 0, W, H);
    ctx.restore();
  }

  build();

  var onResize = function () { layout(); };
  window.addEventListener('resize', onResize, { passive: true });

  function pointerMove(e) {
    var rect = canvas.getBoundingClientRect();
    var pt = e.touches ? e.touches[0] : e;
    pointer.x = pt.clientX - rect.left;
    pointer.y = pt.clientY - rect.top;
    pointer.active = true;
  }
  function pointerLeave() { pointer.active = false; pointer.x = pointer.y = -9999; }
  window.addEventListener('mousemove', pointerMove, { passive: true });
  canvas.addEventListener('touchmove', pointerMove, { passive: true });
  canvas.addEventListener('touchend', pointerLeave, { passive: true });
  document.addEventListener('mouseleave', pointerLeave);

  if (reduce) {
    step(0.016, 0);
    draw();
    return { destroy: function () { window.removeEventListener('resize', onResize); } };
  }

  return {
    frame: function (dt, t) { step(Math.min(dt, 0.05), t); draw(); },
    destroy: function () {
      window.removeEventListener('resize', onResize);
      window.removeEventListener('mousemove', pointerMove);
    }
  };
});
