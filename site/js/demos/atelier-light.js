/* canvas-atelier — the light rig.
 *
 * The skill's sharpest claim is that shading is arithmetic, not taste: pick ONE
 * light direction, then derive every gradient stop from the surface normal
 * instead of dragging colour pickers until it looks right. This demo is that
 * claim made draggable. Move the key light and nothing is re-authored — the
 * highlight, the terminator, the cast shadow's length and direction, the bounce
 * off the table and the colour temperature of both the light and its shadow all
 * fall out of one unit vector.
 *
 * The stops really are sampled from normals. Along the screen axis through an
 * object's centre in the light's direction, a sphere's surface normal at screen
 * offset p is (p/r, sqrt(1 - (p/r)^2)) in the (along, toward-viewer) basis, so
 * N·L is exact there; a vertical cylinder's normal does not vary with height at
 * all, which is why its terminator is a straight line at u = -Lz/hypot(Lx, Lz)
 * and why shading a limb like a sphere always reads as a painted tube.
 *
 * The critique row is stage 9 of the same workflow: the four transforms that
 * break the loop where the eye that placed a form is the eye checking it.
 */
Demos.register('atelier-light', function (root) {
  var G = window.Gfx;
  var canvas = root.querySelector('canvas');
  var VW = 900, VH = 430;
  var ctx = G.fitCanvas(canvas, VW, VH);
  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Everything is rendered once into this buffer, then blitted through whichever
  // critique transform is selected. Flip, blur and value are one line each that
  // way, and the silhouette pass is the only one that needs its own draw path.
  var off = document.createElement('canvas');
  var octx = null;
  function sizeBuffer() {
    off.width = canvas.width;
    off.height = canvas.height;
    octx = off.getContext('2d');
    var s = canvas.width / VW;
    octx.setTransform(s, 0, 0, s, 0, 0);
  }

  var readout = root.querySelector('[data-rig-readout]');
  var mode = 'render';

  /* ---------------------------------------------------------- the scene ---
   * Four hues and no more: clay, glaze, bone, walnut. A hue chosen per object
   * is the most reliable tell in generated art, so the whole still life is
   * mixed out of these and the only accent is the specular on the sphere.
   */
  var GROUND_Y = 232;
  var TABLE = { top: '#3d3228', bottom: '#150f0b' };

  // Three baselines, not one. Objects lined up on a single ground line read as a
  // row of samples; staggering them in depth is what makes it a still life.
  var SPHERE   = { cx: 386, cy: 274, r: 86, base: '#7f4630', rough: 0.3,  spec: 1 };
  var CYLINDER = { cx: 252, top: 146, bottom: 302, rx: 41, ry: 12, base: '#3f5150', rough: 0.46, spec: 0.6 };
  var EGG      = { cx: 505, cy: 300, rx: 33, ry: 42, base: '#b0a48c', rough: 0.6,  spec: 0.4 };

  var SCENE = { x: 380, y: 262 };   // what the light orbits
  var ORBIT = 300;                  // distance at which the key is fully grazing

  var light = { x: 672, y: 96 };
  var drag = false, idle = 0.62;    // idle drifts the light until someone grabs it

  var grain = G.noiseTile(300, 300, 0.05, 1);

  /* ------------------------------------------------------- light solving ---
   * One handle position becomes one unit vector plus a colour temperature.
   * t is how far off the viewing axis the key is: 0 is straight down the lens,
   * 1 is fully grazing. Warmth follows it, because a grazing key is a low key
   * and a low key is a warm one, and the shadow gets the complementary shift
   * the skill argues for rather than a fixed blue.
   */
  function solve() {
    var dx = light.x - SCENE.x, dy = light.y - SCENE.y;
    var d = Math.hypot(dx, dy);
    var t = G.clamp(d / ORBIT, 0, 1);
    var ux = d > 0.001 ? dx / d : 0, uy = d > 0.001 ? dy / d : -1;
    var L = { x: ux * t, y: uy * t, z: Math.sqrt(Math.max(0, 1 - t * t)) };

    var warmth = Math.pow(t, 1.35);
    return {
      L: L,
      t: t,
      warmth: warmth,
      kelvin: Math.round(6400 - warmth * 4100),
      // Azimuth read as a compass bearing from straight up, which is how a
      // photographer would call a key position out loud.
      az: (Math.round(Math.atan2(ux, -uy) * 180 / Math.PI) + 360) % 360,
      // Height above the picture plane.
      elev: Math.round(Math.asin(G.clamp(L.z, 0, 1)) * 180 / Math.PI),
      lightCol: G.mixHex('#dfe7f7', '#ffbe6d', warmth),
      shadowCol: G.mixHex('#2b2620', '#1b2340', warmth),
      bounceCol: G.mixHex('#5a4c3b', '#7a5b34', warmth)
    };
  }

  /* Surface colour for one lambert term.
   *
   * Three opinions from the skill live in this function and nowhere else:
   * shadow never travels toward black, it travels toward a cooler, darker
   * version of the local hue tinted by the light's own temperature; the lit side
   * picks up the light's colour rather than just more of itself; and chroma
   * peaks at the core-shadow transition, not at the highlight, which is the
   * single change that stops a rendered ball looking like a plastic ball.
   */
  function surface(baseHex, lam, S, ambient) {
    var base = G.hexToRgb(baseHex);
    var lit = G.hexToRgb(S.lightCol);
    var shd = G.hexToRgb(S.shadowCol);
    var t = G.clamp(lam, 0, 1);
    var v = ambient + (1 - ambient) * t;
    var r = base.r * v, g = base.g * v, b = base.b * v;

    var mean = (r + g + b) / 3;
    var peak = Math.exp(-Math.pow((t - 0.16) / 0.17, 2)) * 0.6;
    r += (r - mean) * peak; g += (g - mean) * peak; b += (b - mean) * peak;

    // The lit side picks up the key's colour, but only a quarter of the way:
    // push this much past ~0.3 and every surface converges on the light's own
    // hue, which is how a still life ends up looking like washed plastic.
    if (t > 0.6) {
      var w = (t - 0.6) / 0.4 * 0.26;
      r = G.lerp(r, lit.r, w); g = G.lerp(g, lit.g, w); b = G.lerp(b, lit.b, w);
    } else {
      var c = (1 - t / 0.6) * 0.5;
      r = G.lerp(r, shd.r, c); g = G.lerp(g, shd.g, c); b = G.lerp(b, shd.b, c);
    }
    return G.rgb(r, g, b);
  }

  /* Radial gradient for a sphere or ellipsoid, stops sampled from the normal.
   *
   * The gradient is centred on the projected light pole, offset from the centre
   * by L's screen component times the radius, so the parameter running outward
   * from there maps to a screen offset p along the light axis and the normal
   * there is known exactly. Nothing about the stop positions is chosen.
   */
  function normalGradient(c, cx, cy, r, baseHex, S, ambient, steps) {
    var L = S.L;
    var ox = cx + L.x * r, oy = cy + L.y * r;
    var outer = r * (1 + S.t) + 1;
    var grad = c.createRadialGradient(ox, oy, 0, ox, oy, outer);
    for (var i = 0; i <= steps; i++) {
      var s = i / steps;
      // Screen offset along the light axis, measured from the sphere centre.
      // The gradient origin sits at S.t * r from centre, so subtracting the
      // gradient's own radius walks the surface from lit pole to far rim.
      var p = S.t * r - s * outer;
      var n = G.clamp(p / r, -1, 1);
      var nz = Math.sqrt(Math.max(0, 1 - n * n));
      grad.addColorStop(s, surface(baseHex, n * S.t + nz * L.z, S, ambient));
    }
    return grad;
  }

  /* Cast shadow on the table.
   *
   * Length is 1/Lz: a key at head height throws a puddle, a grazing key throws
   * a shadow across the whole plate. The y term is compressed by the table's
   * own foreshortening so the shadow stays lying on the surface instead of
   * standing up behind the object.
   */
  function castShadow(c, bx, by, w, S, weight) {
    var L = S.L;
    var reach = G.clamp(0.55 / Math.max(L.z, 0.14), 0.55, 4.2);
    var ex = bx - L.x * w * reach * 1.7;
    var ey = by - L.y * w * reach * 0.5;
    var len = w * (0.85 + reach * 0.75);

    c.save();
    c.globalAlpha = G.clamp(0.78 * weight, 0.2, 0.85);
    c.filter = 'blur(' + (4 + reach * 3.4).toFixed(1) + 'px)';
    c.fillStyle = S.shadowCol;
    c.beginPath();
    c.ellipse((bx + ex) / 2, (by + ey) / 2, len * 0.62, w * 0.32, Math.atan2(ey - by, ex - bx), 0, Math.PI * 2);
    c.fill();
    c.restore();

    // Contact occlusion. Independent of the key: the object touches the table
    // whatever the light is doing, and without this every form floats. It is
    // also the only part of the shadow that stays sharp.
    c.save();
    c.globalAlpha = 0.82 * weight;
    c.filter = 'blur(3px)';
    c.fillStyle = '#080604';
    c.beginPath();
    c.ellipse(bx, by, w * 0.78, w * 0.15, 0, 0, Math.PI * 2);
    c.fill();
    c.restore();
  }

  function eggPath(c, o) {
    // Not an ellipse: the top is narrower than the bottom, and the left side is
    // pulled a little wider than the right. Perfect symmetry is the tell.
    c.beginPath();
    c.moveTo(o.cx, o.cy - o.ry);
    c.bezierCurveTo(o.cx + o.rx * 0.78, o.cy - o.ry * 0.92, o.cx + o.rx * 1.04, o.cy + o.ry * 0.14, o.cx + o.rx * 0.9, o.cy + o.ry * 0.62);
    c.bezierCurveTo(o.cx + o.rx * 0.78, o.cy + o.ry * 1.02, o.cx - o.rx * 0.8, o.cy + o.ry * 1.03, o.cx - o.rx * 0.94, o.cy + o.ry * 0.6);
    c.bezierCurveTo(o.cx - o.rx * 1.08, o.cy + o.ry * 0.12, o.cx - o.rx * 0.82, o.cy - o.ry * 0.9, o.cx, o.cy - o.ry);
    c.closePath();
  }

  function spherePath(c, o) {
    // Same rule: a hand-thrown clay ball is not a circle.
    var r = o.r;
    c.beginPath();
    c.moveTo(o.cx, o.cy - r);
    c.bezierCurveTo(o.cx + r * 0.57, o.cy - r * 1.01, o.cx + r * 1.02, o.cy - r * 0.55, o.cx + r, o.cy + r * 0.03);
    c.bezierCurveTo(o.cx + r * 0.99, o.cy + r * 0.58, o.cx + r * 0.55, o.cy + r, o.cx - r * 0.02, o.cy + r);
    c.bezierCurveTo(o.cx - r * 0.58, o.cy + r, o.cx - r, o.cy + r * 0.56, o.cx - r, o.cy - r * 0.02);
    c.bezierCurveTo(o.cx - r, o.cy - r * 0.58, o.cx - r * 0.56, o.cy - r * 1.01, o.cx, o.cy - r);
    c.closePath();
  }

  function cylinderBody(c, o) {
    c.beginPath();
    c.moveTo(o.cx - o.rx, o.top);
    c.lineTo(o.cx - o.rx, o.bottom);
    c.ellipse(o.cx, o.bottom, o.rx, o.ry, 0, Math.PI, 0, true);
    c.lineTo(o.cx + o.rx, o.top);
    c.closePath();
  }

  /* Texture and the environment fill, applied inside whatever path is clipped.
   * Both are stage-6 work: the noise breaks the plastic smoothness a perfect
   * gradient has, and the bounce is the table throwing its own colour back into
   * the shadow side, which is what stops shadows reading as holes. */
  function finish(c, S, box, bounceAt) {
    var bc = G.hexToRgb(S.bounceCol);
    var b = c.createRadialGradient(bounceAt.x, bounceAt.y, 2, bounceAt.x, bounceAt.y, bounceAt.r);
    b.addColorStop(0, 'rgba(' + bc.r + ',' + bc.g + ',' + bc.b + ',.3)');
    b.addColorStop(1, 'rgba(' + bc.r + ',' + bc.g + ',' + bc.b + ',0)');
    c.fillStyle = b;
    c.fillRect(box.x, box.y, box.w, box.h);

    c.globalAlpha = 0.5;
    c.drawImage(grain, box.x, box.y, box.w, box.h);
    c.globalAlpha = 1;
  }

  function specular(c, cx, cy, r, S, strength, rough) {
    // The highlight sits where the surface normal bisects light and viewer. With
    // the viewer down +z that is just L renormalised with z+1, and its size is
    // the surface roughness rather than a number that looked right.
    var hx = cx + S.L.x * r * 0.72;
    var hy = cy + S.L.y * r * 0.72;
    var size = r * (0.055 + rough * 0.2);
    var g = c.createRadialGradient(hx, hy, 0, hx, hy, size);
    var lc = G.hexToRgb(S.lightCol);
    g.addColorStop(0, 'rgba(' + lc.r + ',' + lc.g + ',' + lc.b + ',' + (0.86 * strength).toFixed(3) + ')');
    g.addColorStop(0.55, 'rgba(' + lc.r + ',' + lc.g + ',' + lc.b + ',' + (0.16 * strength).toFixed(3) + ')');
    g.addColorStop(1, 'rgba(' + lc.r + ',' + lc.g + ',' + lc.b + ',0)');
    c.fillStyle = g;
    c.fillRect(hx - size, hy - size, size * 2, size * 2);
  }

  /* ------------------------------------------------------------- drawing --- */
  function drawTable(c, S) {
    var wall = c.createLinearGradient(0, 0, 0, GROUND_Y);
    wall.addColorStop(0, '#08080b');
    wall.addColorStop(1, '#14151a');
    c.fillStyle = wall;
    c.fillRect(0, 0, VW, GROUND_Y);

    // A wash of the key spilling onto the back wall, positioned by the handle.
    // Kept off the table: light falling on a horizontal surface is the table's
    // own gradient's job, and doing it twice is what flattens the horizon.
    var lc = G.hexToRgb(S.lightCol);
    var spill = c.createRadialGradient(light.x, light.y, 6, light.x, light.y, 330);
    spill.addColorStop(0, 'rgba(' + lc.r + ',' + lc.g + ',' + lc.b + ',0.12)');
    spill.addColorStop(1, 'rgba(' + lc.r + ',' + lc.g + ',' + lc.b + ',0)');
    c.fillStyle = spill;
    c.fillRect(0, 0, VW, GROUND_Y);

    var g = c.createLinearGradient(0, GROUND_Y, 0, VH);
    // The table is lit too, and the far edge takes the key's colour when the key
    // is low. That falling-off toward the viewer is most of what sells depth.
    g.addColorStop(0, G.mixHex(TABLE.top, S.lightCol, 0.06 + S.warmth * 0.12));
    g.addColorStop(0.4, TABLE.top);
    g.addColorStop(1, TABLE.bottom);
    c.fillStyle = g;
    c.fillRect(0, GROUND_Y, VW, VH - GROUND_Y);

    c.strokeStyle = 'rgba(0,0,0,.65)';
    c.lineWidth = 1;
    c.beginPath(); c.moveTo(0, GROUND_Y + .5); c.lineTo(VW, GROUND_Y + .5); c.stroke();
  }

  /* The only compositional trick in the piece: darken the corners so the eye
   * lands on the sphere first and everything else defers to it. */
  function vignette(c) {
    var v = c.createRadialGradient(SPHERE.cx, SPHERE.cy, VH * 0.18, SPHERE.cx, SPHERE.cy, VW * 0.72);
    v.addColorStop(0, 'rgba(0,0,0,0)');
    v.addColorStop(0.62, 'rgba(0,0,0,.2)');
    v.addColorStop(1, 'rgba(0,0,0,.62)');
    c.fillStyle = v;
    c.fillRect(0, 0, VW, VH);
  }

  function drawScene(c, S, flat) {
    c.clearRect(0, 0, VW, VH);

    if (flat) {
      c.fillStyle = '#cdc7bd';
      c.fillRect(0, 0, VW, VH);
      c.fillStyle = '#0a0a0c';
      cylinderBody(c, CYLINDER); c.fill();
      c.beginPath(); c.ellipse(CYLINDER.cx, CYLINDER.top, CYLINDER.rx, CYLINDER.ry, 0, 0, Math.PI * 2); c.fill();
      eggPath(c, EGG); c.fill();
      spherePath(c, SPHERE); c.fill();
      return;
    }

    drawTable(c, S);

    castShadow(c, CYLINDER.cx, CYLINDER.bottom, CYLINDER.rx, S, 0.95);
    castShadow(c, EGG.cx, EGG.cy + EGG.ry * 0.95, EGG.rx, S, 0.85);
    castShadow(c, SPHERE.cx, SPHERE.cy + SPHERE.r * 0.94, SPHERE.r * 0.86, S, 1);

    // --- cylinder. Its terminator is a straight vertical line and its position
    // is solvable, which is the whole reason cylinderGradient exists.
    c.save();
    cylinderBody(c, CYLINDER);
    c.clip();
    var cg = c.createLinearGradient(CYLINDER.cx - CYLINDER.rx, 0, CYLINDER.cx + CYLINDER.rx, 0);
    for (var i = 0; i <= 24; i++) {
      var s = i / 24;
      var u = s * 2 - 1;
      var nz = Math.sqrt(Math.max(0, 1 - u * u));
      cg.addColorStop(s, surface(CYLINDER.base, u * S.L.x + nz * S.L.z, S, 0.12));
    }
    c.fillStyle = cg;
    c.fillRect(CYLINDER.cx - CYLINDER.rx - 2, CYLINDER.top - 2, CYLINDER.rx * 2 + 4, CYLINDER.bottom - CYLINDER.top + CYLINDER.ry + 4);
    finish(c, S,
      { x: CYLINDER.cx - CYLINDER.rx - 2, y: CYLINDER.top - 2, w: CYLINDER.rx * 2 + 4, h: CYLINDER.bottom - CYLINDER.top + CYLINDER.ry + 6 },
      { x: CYLINDER.cx, y: CYLINDER.bottom, r: CYLINDER.rx * 2.1 });
    specular(c, CYLINDER.cx, (CYLINDER.top + CYLINDER.bottom) / 2, CYLINDER.rx, S, CYLINDER.spec, CYLINDER.rough);
    c.restore();

    // The rim is a flat disc, so its lambert is a single number: N is straight
    // up, and N·L is just -Ly.
    c.beginPath();
    c.ellipse(CYLINDER.cx, CYLINDER.top, CYLINDER.rx, CYLINDER.ry, 0, 0, Math.PI * 2);
    c.fillStyle = surface(CYLINDER.base, G.clamp(-S.L.y, 0, 1) * 0.8 + 0.12, S, 0.2);
    c.fill();
    c.strokeStyle = 'rgba(0,0,0,.35)';
    c.lineWidth = 1;
    c.stroke();

    // --- egg
    c.save();
    eggPath(c, EGG);
    c.clip();
    c.fillStyle = normalGradient(c, EGG.cx, EGG.cy, (EGG.rx + EGG.ry) / 2, EGG.base, S, 0.13, 20);
    c.fillRect(EGG.cx - EGG.rx - 4, EGG.cy - EGG.ry - 4, EGG.rx * 2 + 8, EGG.ry * 2 + 8);
    finish(c, S,
      { x: EGG.cx - EGG.rx - 4, y: EGG.cy - EGG.ry - 4, w: EGG.rx * 2 + 8, h: EGG.ry * 2 + 8 },
      { x: EGG.cx, y: EGG.cy + EGG.ry, r: EGG.rx * 2.2 });
    specular(c, EGG.cx, EGG.cy, (EGG.rx + EGG.ry) / 2, S, EGG.spec, EGG.rough);
    c.restore();

    // --- sphere, the focal point: most contrast, sharpest specular, most detail
    c.save();
    spherePath(c, SPHERE);
    c.clip();
    c.fillStyle = normalGradient(c, SPHERE.cx, SPHERE.cy, SPHERE.r, SPHERE.base, S, 0.1, 24);
    c.fillRect(SPHERE.cx - SPHERE.r - 4, SPHERE.cy - SPHERE.r - 4, SPHERE.r * 2 + 8, SPHERE.r * 2 + 8);
    finish(c, S,
      { x: SPHERE.cx - SPHERE.r - 4, y: SPHERE.cy - SPHERE.r - 4, w: SPHERE.r * 2 + 8, h: SPHERE.r * 2 + 8 },
      { x: SPHERE.cx - S.L.x * SPHERE.r * 0.7, y: SPHERE.cy + SPHERE.r * 0.8, r: SPHERE.r * 1.7 });

    // Rim light: the room behind, catching the edge the key cannot reach. It has
    // to stay a hairline along the silhouette. Run it any wider and it stops
    // being a rim and becomes a second key on the shadow side, which flattens
    // the form far more thoroughly than having no rim at all.
    var rimA = G.clamp(S.t * 0.3, 0, 0.26);
    if (rimA > 0.02) {
      // Band, not ramp. A two-stop gradient holds its first colour across the
      // whole half-plane before the axis starts, which paints a flat wash over
      // the entire shadow side and erases the terminator the stops above just
      // computed. The zero stops at both ends are what keep it a rim.
      var ux = -S.L.x / (S.t || 1), uy = -S.L.y / (S.t || 1);
      var rg = c.createLinearGradient(
        SPHERE.cx + ux * SPHERE.r * 1.3, SPHERE.cy + uy * SPHERE.r * 1.3,
        SPHERE.cx + ux * SPHERE.r * 0.66, SPHERE.cy + uy * SPHERE.r * 0.66);
      rg.addColorStop(0, 'rgba(178,198,230,0)');
      rg.addColorStop(0.46, 'rgba(178,198,230,' + rimA.toFixed(3) + ')');
      rg.addColorStop(1, 'rgba(178,198,230,0)');
      c.fillStyle = rg;
      c.fillRect(SPHERE.cx - SPHERE.r - 4, SPHERE.cy - SPHERE.r - 4, SPHERE.r * 2 + 8, SPHERE.r * 2 + 8);
    }
    specular(c, SPHERE.cx, SPHERE.cy, SPHERE.r, S, SPHERE.spec, SPHERE.rough);
    c.restore();
  }

  function drawHandle(c, S) {
    c.save();
    // Where the key is pointing, drawn faintly so the vector is visible without
    // becoming the subject.
    c.strokeStyle = 'rgba(223,106,65,.2)';
    c.setLineDash([2, 6]);
    c.lineWidth = 1;
    c.beginPath(); c.moveTo(light.x, light.y); c.lineTo(SCENE.x, SCENE.y); c.stroke();

    c.setLineDash([1, 7]);
    c.strokeStyle = 'rgba(223,106,65,.14)';
    c.beginPath(); c.arc(SCENE.x, SCENE.y, ORBIT, 0, Math.PI * 2); c.stroke();
    c.setLineDash([]);

    var lc = G.hexToRgb(S.lightCol);
    var glow = c.createRadialGradient(light.x, light.y, 1, light.x, light.y, 44);
    glow.addColorStop(0, 'rgba(' + lc.r + ',' + lc.g + ',' + lc.b + ',.5)');
    glow.addColorStop(1, 'rgba(' + lc.r + ',' + lc.g + ',' + lc.b + ',0)');
    c.fillStyle = glow;
    c.fillRect(light.x - 44, light.y - 44, 88, 88);

    c.strokeStyle = '#df6a41';
    c.lineWidth = 1;
    c.beginPath(); c.arc(light.x, light.y, drag ? 13 : 10, 0, Math.PI * 2); c.stroke();
    c.beginPath();
    c.moveTo(light.x - 17, light.y); c.lineTo(light.x - 5, light.y);
    c.moveTo(light.x + 5, light.y);  c.lineTo(light.x + 17, light.y);
    c.moveTo(light.x, light.y - 17); c.lineTo(light.x, light.y - 5);
    c.moveTo(light.x, light.y + 5);  c.lineTo(light.x, light.y + 17);
    c.stroke();
    c.fillStyle = S.lightCol;
    c.beginPath(); c.arc(light.x, light.y, 2.4, 0, Math.PI * 2); c.fill();
    c.restore();
  }

  function render() {
    var S = solve();

    drawScene(octx, S, mode === 'silhouette');
    if (mode !== 'silhouette') vignette(octx);
    if (mode === 'render') drawHandle(octx, S);

    ctx.save();
    ctx.clearRect(0, 0, VW, VH);
    if (mode === 'blurred') ctx.filter = 'blur(7px)';
    if (mode === 'value') ctx.filter = 'grayscale(1) contrast(1.04)';
    if (mode === 'flipped') { ctx.translate(VW, 0); ctx.scale(-1, 1); }
    ctx.drawImage(off, 0, 0, VW, VH);
    ctx.restore();

    if (readout) {
      readout.innerHTML =
        '<span>azimuth <b>' + S.az + '&deg;</b></span>' +
        '<span>height <b>' + S.elev + '&deg;</b></span>' +
        '<span class="kelvin">' + S.kelvin + ' K</span>' +
        '<span>24 stops from N&thinsp;&middot;&thinsp;L</span>';
    }
  }

  /* ----------------------------------------------------------- controls --- */
  function local(e) {
    var r = canvas.getBoundingClientRect();
    return { x: (e.clientX - r.left) * (VW / r.width), y: (e.clientY - r.top) * (VH / r.height) };
  }
  function place(p) {
    light.x = G.clamp(p.x, 16, VW - 16);
    light.y = G.clamp(p.y, 16, GROUND_Y - 24);
  }
  canvas.addEventListener('pointerdown', function (e) {
    drag = true;
    idle = -1;                       // taking hold ends the idle orbit for good
    root.classList.add('dragging');
    try { canvas.setPointerCapture(e.pointerId); } catch (err) { /* no capture */ }
    place(local(e));
    if (reduce) render();
    e.preventDefault();
  });
  canvas.addEventListener('pointermove', function (e) {
    if (!drag) return;
    place(local(e));
    if (reduce) render();
  });
  function release(e) {
    if (!drag) return;
    drag = false;
    root.classList.remove('dragging');
    try { canvas.releasePointerCapture(e.pointerId); } catch (err) { /* already gone */ }
  }
  canvas.addEventListener('pointerup', release);
  canvas.addEventListener('pointercancel', release);

  // Keyboard equivalent. A control that only answers to a pointer is not a
  // control, and the light position is the only real input on this panel.
  canvas.addEventListener('keydown', function (e) {
    var step = e.shiftKey ? 24 : 8, moved = true;
    if (e.key === 'ArrowLeft') light.x -= step;
    else if (e.key === 'ArrowRight') light.x += step;
    else if (e.key === 'ArrowUp') light.y -= step;
    else if (e.key === 'ArrowDown') light.y += step;
    else moved = false;
    if (!moved) return;
    idle = -1;                       // a deliberate move ends the idle drift
    place({ x: light.x, y: light.y });
    render();
    e.preventDefault();
  });

  root.querySelectorAll('[data-pass]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      mode = btn.getAttribute('data-pass');
      root.querySelectorAll('[data-pass]').forEach(function (b) {
        b.setAttribute('aria-pressed', String(b === btn));
      });
      render();
    });
  });

  window.addEventListener('resize', function () {
    ctx = G.fitCanvas(canvas, VW, VH);
    sizeBuffer();
    render();
  }, { passive: true });

  sizeBuffer();
  render();

  if (reduce) return {};

  return {
    frame: function (dt, t) {
      // Until someone takes hold of it, the key walks a slow ellipse — the
      // demo has to demonstrate itself to a reader who never touches it.
      if (!drag && idle >= 0) {
        // A shallow arc across the upper wall. The key stays above the still
        // life: a key that wanders down among the objects is a lamp lying on
        // the table, and it reads as a bug rather than as a demonstration.
        idle += dt * 0.15;
        light.x = SCENE.x + Math.cos(idle) * 296;
        light.y = 118 + Math.sin(idle * 0.85) * 58;
        place({ x: light.x, y: light.y });
      }
      render();
    }
  };
});
