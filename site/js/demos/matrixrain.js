/* Digital rain, in perspective.
 *
 * The flat version of this effect is a grid of columns all the same size and
 * the same speed, which is a screensaver. This one puts every column at a real
 * z: near columns are large, bright, fast and out of focus at the edges of the
 * frame, far ones are small, dim and slow, and the whole field is projected
 * through the same camera the hero uses. Depth is the difference between an
 * homage and a copy.
 *
 * It rains the strings this skill actually cares about - the paths a skill can
 * live at, the trigger words, the tally file - so the background is saying
 * something rather than decorating. Palette is the site's own muted sage with
 * the leading glyph in bone: a screen-green rain would be the one place on the
 * page where a second accent shouted.
 */
Demos.register('matrix-rain', function (root) {
  var G = window.Gfx, R = window.Render3D;
  var canvas = root.querySelector('canvas') || root;
  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var ctx = canvas.getContext('2d');

  var SOURCE = '.claude/skills .github/skills ~/.copilot/skills SKILL.md ' +
    'session-tally.md declined.md /forge /matrix CLAUDE.md AGENTS.md 0123456789';
  var GLYPHS = SOURCE.replace(/ /g, '').split('');

  var W = 0, H = 0, dpr = 1;
  var cam = R.camera(760);
  var FAR = 1900;
  var cols = [];

  function rng(seed) {
    var s = seed >>> 0;
    return function () { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
  }
  var rand = rng(1999331);

  function build() {
    cols = [];
    for (var i = 0; i < 58; i++) {
      var z = 150 + rand() * (FAR - 150);
      var spread = 220 + z * 0.66;
      cols.push({
        x: (rand() - 0.5) * 2 * spread,
        z: z,
        // Head position in world units, falling. Near columns fall faster,
        // which is the parallax doing the work rather than a random speed.
        y: (rand() - 0.5) * 900,
        speed: 90 + rand() * 150,
        len: 8 + ((rand() * 16) | 0),
        step: 22 + rand() * 10,          // world units between glyphs
        seed: (rand() * 9999) | 0,
        churn: rand() * 3
      });
    }
  }

  function layout() {
    var rect = canvas.getBoundingClientRect();
    W = Math.max(200, rect.width);
    H = Math.max(160, rect.height);
    dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  build();
  layout();
  var onResize = function () { layout(); };
  window.addEventListener('resize', onResize, { passive: true });

  function draw(t) {
    ctx.clearRect(0, 0, W, H);
    // Far columns first so a near one overlaps them correctly.
    var order = cols.slice().sort(function (a, b) { return b.z - a.z; });
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    for (var i = 0; i < order.length; i++) {
      var c = order[i];
      var fog = Math.pow(G.clamp(1 - (c.z - 150) / (FAR - 150), 0.04, 1), 1.3);

      for (var k = 0; k < c.len; k++) {
        var p = R.project({ x: c.x, y: c.y - k * c.step, z: c.z }, cam, W, H);
        if (!p) continue;
        if (p.x < -40 || p.x > W + 40 || p.y < -30 || p.y > H + 30) continue;

        var size = 15 * p.f;
        if (size < 3.5) continue;

        // The tail fades behind the head, and each glyph re-rolls on its own
        // slow clock so the column churns instead of scrolling as one block.
        var tail = 1 - k / c.len;
        var idx = (c.seed + k * 7 + ((t * c.churn) | 0) * (k + 3)) % GLYPHS.length;
        ctx.font = '500 ' + size.toFixed(1) + 'px "JetBrains Mono Variable", ui-monospace, monospace';

        if (k === 0) {
          ctx.fillStyle = 'rgba(238,235,229,' + (0.96 * fog).toFixed(3) + ')';
        } else {
          ctx.fillStyle = 'rgba(151,177,132,' + (0.72 * tail * tail * fog).toFixed(3) + ')';
        }
        ctx.fillText(GLYPHS[idx], p.x, p.y);
      }
    }
  }

  if (reduce) {
    // Static, and much fainter: the information is "there is a stream here",
    // and that survives being still.
    draw(0);
    return { destroy: function () { window.removeEventListener('resize', onResize); } };
  }

  return {
    frame: function (dt, t) {
      for (var i = 0; i < cols.length; i++) {
        var c = cols[i];
        c.y += c.speed * dt;
        // Recycle above the field once the whole column has passed below it.
        if (c.y - c.len * c.step > 700) {
          c.y = -700;
          c.x = (Math.random() - 0.5) * 2 * (220 + c.z * 0.66);
        }
      }
      cam.yaw = Math.sin(t * 0.06) * 0.05;
      draw(t);
    },
    destroy: function () { window.removeEventListener('resize', onResize); }
  };
});
