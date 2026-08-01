/* The ambient field — the page's one continuous sense of space.
 *
 * A fixed canvas behind everything, holding a volume of dust that the whole
 * document scrolls through. The hero has its own field with its own camera; this
 * is the quieter one that runs the length of the page, so that scrolling from
 * the protocol table to the footer feels like moving through something rather
 * than sliding a sheet of paper past a window.
 *
 * Restraint is the entire design. It sits at the grid layer, under every rule
 * and every plate; it never touches the accent; its brightest mote is dimmer
 * than the hairlines it sits behind. If a reader notices it as an effect, it is
 * turned up too far.
 *
 * Cost control, in order of how much it matters: it is one canvas rather than a
 * DOM layer, the motes are pre-baked sprites rather than per-frame gradients,
 * the camera is driven by a scrollY read inside the frame that is already
 * running rather than by a scroll listener, and it does not exist at all under
 * prefers-reduced-motion or on a coarse pointer, where the whole effect would
 * cost battery to be invisible behind a thumb.
 */
Demos.register('depth-field', function (canvas) {
  var G = window.Gfx, R = window.Render3D;
  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var coarse = window.matchMedia('(pointer: coarse)').matches;
  if (reduce || coarse) { canvas.style.display = 'none'; return {}; }

  var ctx = canvas.getContext('2d');
  var W = 0, H = 0, dpr = 1;
  var cam = R.camera(820);
  var FAR = 2600;
  var motes = [];
  var SPRITES = [];

  function rng(seed) {
    var s = seed >>> 0;
    return function () { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
  }

  function build() {
    SPRITES = [0.15, 0.5, 0.85, 1].map(function (s) {
      return R.bokehSprite(s, '214,206,192', 48);
    });
    var rand = rng(31337);
    motes = [];
    for (var i = 0; i < 96; i++) {
      var z = 160 + rand() * (FAR - 160);
      var spread = 300 + z * 0.7;
      motes.push({
        x: (rand() - 0.5) * 2 * spread,
        y: (rand() - 0.5) * 2 * spread,
        z: z,
        r: 0.9 + rand() * 2.6,
        vx: (rand() - 0.5) * 3,
        vy: (rand() - 0.5) * 2.4,
        tw: rand() * Math.PI * 2
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

  build();
  layout();

  var onResize = function () { layout(); };
  window.addEventListener('resize', onResize, { passive: true });

  return {
    frame: function (dt, t) {
      var doc = document.documentElement;
      var max = (doc.scrollHeight - doc.clientHeight) || 1;
      // The whole document maps to one long dolly. Ten times the field depth
      // would be a blur; a fraction of it is what reads as travel.
      cam.z = (window.scrollY / max) * 1750;
      cam.yaw = Math.sin(t * 0.028) * 0.06;
      cam.pitch = Math.cos(t * 0.021) * 0.04;

      ctx.clearRect(0, 0, W, H);

      for (var i = 0; i < motes.length; i++) {
        var p = motes[i];
        p.x += p.vx * dt; p.y += p.vy * dt;
        var spread = 300 + p.z * 0.7;
        if (p.x > spread) p.x = -spread; else if (p.x < -spread) p.x = spread;
        if (p.y > spread) p.y = -spread; else if (p.y < -spread) p.y = spread;

        var pr = R.project(p, cam, W, H);
        if (!pr) continue;
        if (pr.x < -70 || pr.x > W + 70 || pr.y < -70 || pr.y > H + 70) continue;

        var fog = Math.pow(G.clamp(1 - (pr.z - 160) / (FAR - 160), 0, 1), 1.5);
        var defocus = G.clamp(Math.abs(pr.z - 620) / 1100, 0, 1);
        var size = p.r * pr.f * (1 + defocus * 4.5) * 7;
        if (size < 0.6) continue;
        var tw = 0.7 + Math.sin(t * 0.7 + p.tw) * 0.3;
        ctx.globalAlpha = G.clamp(fog * (0.3 - defocus * 0.19) * tw, 0, 0.34);
        ctx.drawImage(SPRITES[Math.min(3, Math.round(defocus * 3))],
          pr.x - size / 2, pr.y - size / 2, size, size);
      }
      ctx.globalAlpha = 1;
    },
    destroy: function () { window.removeEventListener('resize', onResize); }
  };
});
