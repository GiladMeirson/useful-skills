/* physics-2d demo — an operable sandbox, not a screensaver.
 *
 * Runs the real engine from js/lib/engine2d.js: SAT + face clipping, a block
 * solver for two-point manifolds, Coulomb friction, revolute chains, raycasting
 * and island sleeping. Drag bodies, fire the cannon, watch the pyramid rest and
 * the sleep counter climb.
 */
Demos.register('physics', function (root) {
  var P = window.Engine2D, G = window.Gfx;
  var canvas = root.querySelector('canvas');
  var VW = 900, VH = 470;
  var ctx = G.fitCanvas(canvas, VW, VH);
  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var onResize = function () { ctx = G.fitCanvas(canvas, VW, VH); };
  window.addEventListener('resize', onResize, { passive: true });

  var world, alpha = 0, scene = 'pyramid';
  var readout = root.querySelector('[data-readout]');
  var drag = null, aim = null;

  var PALETTE = ['#e0a54e', '#c98f3d', '#a97a2f', '#f0c076', '#8a6428', '#d9a45f'];

  function addStatics() {
    world.add(new P.Body({ shape: P.makeBox(VW + 200, 46), x: VW / 2, y: VH - 12, isStatic: true, friction: .85, tag: 'ground' }));
    world.add(new P.Body({ shape: P.makeBox(40, VH * 2), x: -14, y: VH / 2, isStatic: true, friction: .5 }));
    world.add(new P.Body({ shape: P.makeBox(40, VH * 2), x: VW + 14, y: VH / 2, isStatic: true, friction: .5 }));
  }

  function buildPyramid() {
    var rows = 7, bw = 52, bh = 30, baseY = VH - 50;
    for (var r = 0; r < rows; r++) {
      var count = rows - r;
      for (var c = 0; c < count; c++) {
        var x = VW * 0.36 - (count - 1) * bw / 2 + c * bw;
        world.add(new P.Body({
          shape: P.makeBox(bw - 3, bh - 3),
          x: x, y: baseY - r * bh,
          friction: .8, restitution: .03,
          color: PALETTE[(r + c) % PALETTE.length]
        }));
      }
    }
    // A wrecking ball on a revolute chain, built hanging straight down so the
    // whole pendulum sits inside the frame from the first frame onward.
    var ax = VW * 0.76, ay = 48, seg = 26;
    var anchor = world.add(new P.Body({ shape: P.makeBox(18, 14), x: ax, y: ay, isStatic: true }));
    var prev = anchor;
    for (var i = 0; i < 8; i++) {
      var link = world.add(new P.Body({
        shape: P.makeBox(9, seg - 2), x: ax, y: ay + 12 + i * seg,
        friction: .4, restitution: .02, color: '#6fbfa6', allowSleep: false
      }));
      world.addJoint(new P.RevoluteJoint(prev, link,
        { x: 0, y: prev === anchor ? 7 : (seg - 2) / 2 }, { x: 0, y: -(seg - 2) / 2 }));
      prev = link;
    }
    var ball = world.add(new P.Body({
      shape: P.makeCircle(22), x: ax, y: ay + 12 + 8 * seg + 12,
      friction: .5, restitution: .15, density: .009, color: '#e0725a', allowSleep: false
    }));
    world.addJoint(new P.RevoluteJoint(prev, ball, { x: 0, y: (seg - 2) / 2 }, { x: 0, y: -22 }));
    // A nudge, so it is already swinging rather than hanging dead still.
    ball.velocity.x = 340;
  }

  function buildRamp() {
    world.add(new P.Body({ shape: P.makeBox(430, 18), x: 250, y: 190, angle: 0.22, isStatic: true, friction: .5 }));
    world.add(new P.Body({ shape: P.makeBox(400, 18), x: 640, y: 330, angle: -0.26, isStatic: true, friction: .35 }));
    for (var i = 0; i < 12; i++) {
      var t = i % 3;
      var shape = t === 0 ? P.makeCircle(13 + (i % 3) * 3)
                : t === 1 ? P.makeBox(28, 28)
                : P.makeNGon(17, 5 + (i % 3));
      world.add(new P.Body({
        shape: shape, x: 90 + i * 12, y: -40 - i * 60,
        friction: t === 0 ? .25 : .6, restitution: t === 0 ? .45 : .1,
        color: PALETTE[i % PALETTE.length]
      }));
    }
  }

  function buildTower() {
    for (var i = 0; i < 10; i++) {
      world.add(new P.Body({
        shape: P.makeBox(74, 26), x: VW * 0.5, y: VH - 52 - i * 26,
        friction: .85, restitution: .02, color: PALETTE[i % PALETTE.length]
      }));
    }
    for (var j = 0; j < 5; j++) {
      world.add(new P.Body({
        shape: P.makeCircle(15), x: 140 + j * 44, y: VH - 70,
        friction: .3, restitution: .5, color: '#6fbfa6'
      }));
    }
  }

  function reset(which) {
    scene = which || scene;
    world = new P.World({ gravity: { x: 0, y: 1100 }, fixedDt: 1 / 120 });
    world.velocityIterations = 10;
    world.bounds = {
      minX: -200, maxX: VW + 200, maxY: VH + 320,
      onExit: function (b) { world.remove(b); }
    };
    addStatics();
    if (scene === 'pyramid') buildPyramid();
    else if (scene === 'ramp') buildRamp();
    else buildTower();
    alpha = 0;
  }

  // ------------------------------------------------------------- rendering
  function drawBody(b) {
    var asleep = !b.awake && !b.isStatic;
    var base = b.color || (b.isStatic ? '#243250' : '#c98f3d');

    ctx.save();
    ctx.translate(b.position.x, b.position.y);
    ctx.rotate(b.angle);

    if (b.shape.type === 'circle') {
      var r = b.shape.r;
      var grad = ctx.createRadialGradient(-r * .35, -r * .4, r * .05, 0, 0, r * 1.15);
      grad.addColorStop(0, G.mixHex(base, '#fff3d6', .55));
      grad.addColorStop(.55, base);
      grad.addColorStop(1, G.mixHex(base, '#16203a', .6));
      ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2);
      ctx.fillStyle = grad; ctx.fill();
      // a spoke, so rotation is actually visible on a circle
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(r * .82, 0);
      ctx.strokeStyle = 'rgba(10,15,25,.35)'; ctx.lineWidth = 2; ctx.stroke();
    } else {
      var v = b.shape.verts;
      ctx.beginPath();
      ctx.moveTo(v[0].x, v[0].y);
      for (var i = 1; i < v.length; i++) ctx.lineTo(v[i].x, v[i].y);
      ctx.closePath();
      var minY = Infinity, maxY = -Infinity;
      for (var k = 0; k < v.length; k++) { if (v[k].y < minY) minY = v[k].y; if (v[k].y > maxY) maxY = v[k].y; }
      var lg = ctx.createLinearGradient(0, minY, 0, maxY);
      lg.addColorStop(0, G.mixHex(base, '#fff3d6', b.isStatic ? .12 : .42));
      lg.addColorStop(1, G.mixHex(base, '#101a2e', b.isStatic ? .35 : .5));
      ctx.fillStyle = lg;
      ctx.fill();
      ctx.strokeStyle = b.isStatic ? 'rgba(120,150,200,.16)' : 'rgba(255,236,203,.16)';
      ctx.lineWidth = 1;
      ctx.stroke();
    }

    if (asleep) {
      ctx.globalAlpha = .45;
      ctx.fillStyle = '#0a0f1b';
      if (b.shape.type === 'circle') { ctx.beginPath(); ctx.arc(0, 0, b.shape.r, 0, Math.PI * 2); ctx.fill(); }
      else ctx.fill();
    }
    ctx.restore();
  }

  function draw() {
    ctx.clearRect(0, 0, VW, VH);

    // faint workshop grid
    ctx.save();
    ctx.strokeStyle = 'rgba(120,150,200,.055)';
    ctx.lineWidth = 1;
    for (var gx = 0; gx <= VW; gx += 45) { ctx.beginPath(); ctx.moveTo(gx, 0); ctx.lineTo(gx, VH); ctx.stroke(); }
    for (var gy = 0; gy <= VH; gy += 45) { ctx.beginPath(); ctx.moveTo(0, gy); ctx.lineTo(VW, gy); ctx.stroke(); }
    ctx.restore();

    for (var i = 0; i < world.joints.length; i++) {
      var j = world.joints[i];
      var ca = Math.cos(j.a.angle), sa = Math.sin(j.a.angle);
      var cb = Math.cos(j.b.angle), sb = Math.sin(j.b.angle);
      var pA = { x: j.a.position.x + j.localA.x * ca - j.localA.y * sa, y: j.a.position.y + j.localA.x * sa + j.localA.y * ca };
      var pB = { x: j.b.position.x + j.localB.x * cb - j.localB.y * sb, y: j.b.position.y + j.localB.x * sb + j.localB.y * cb };
      ctx.beginPath(); ctx.moveTo(pA.x, pA.y); ctx.lineTo(pB.x, pB.y);
      ctx.strokeStyle = 'rgba(111,191,166,.5)'; ctx.lineWidth = 2; ctx.stroke();
    }

    for (var b = 0; b < world.bodies.length; b++) drawBody(world.bodies[b]);

    // Aim line uses a real world raycast — the same query the engine exposes.
    if (aim) {
      var dir = { x: aim.x - 40, y: aim.y - (VH - 90) };
      var hit = world.raycast({ x: 40, y: VH - 90 }, dir, 1400);
      var end = hit ? hit.point : { x: 40 + dir.x * 4, y: (VH - 90) + dir.y * 4 };
      ctx.save();
      ctx.setLineDash([7, 7]);
      ctx.strokeStyle = 'rgba(224,114,90,.75)';
      ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(40, VH - 90); ctx.lineTo(end.x, end.y); ctx.stroke();
      ctx.restore();
      if (hit) {
        ctx.beginPath(); ctx.arc(hit.point.x, hit.point.y, 5, 0, Math.PI * 2);
        ctx.fillStyle = '#e0725a'; ctx.fill();
      }
      ctx.beginPath(); ctx.arc(40, VH - 90, 12, 0, Math.PI * 2);
      ctx.fillStyle = '#e0725a'; ctx.fill();
    }

    if (drag && drag.body) {
      ctx.beginPath();
      ctx.moveTo(drag.body.position.x, drag.body.position.y);
      ctx.lineTo(drag.x, drag.y);
      ctx.strokeStyle = 'rgba(247,214,158,.6)';
      ctx.setLineDash([4, 4]); ctx.lineWidth = 1.5; ctx.stroke();
      ctx.setLineDash([]);
    }
  }

  function updateReadout() {
    if (!readout) return;
    var dyn = 0, asleep = 0, pts = 0;
    for (var i = 0; i < world.bodies.length; i++) {
      var b = world.bodies[i];
      if (b.isStatic) continue;
      dyn++;
      if (!b.awake) asleep++;
    }
    for (var c = 0; c < world.contacts.length; c++) pts += world.contacts[c].points.length;
    readout.innerHTML =
      'bodies <b>' + dyn + '</b>' +
      '<span>contacts <b>' + pts + '</b></span>' +
      '<span>asleep <b>' + asleep + '</b></span>';
  }

  // ------------------------------------------------------------- pointer
  function toWorld(e) {
    var rect = canvas.getBoundingClientRect();
    var pt = e.touches ? e.touches[0] : e;
    return {
      x: (pt.clientX - rect.left) * (VW / rect.width),
      y: (pt.clientY - rect.top) * (VH / rect.height)
    };
  }

  function onDown(e) {
    var p = toWorld(e);
    if (e.shiftKey || (e.button === 2)) { aim = p; return; }
    var body = world.bodyAt(p);
    if (body) {
      drag = { body: body, x: p.x, y: p.y };
      body.wake();
      e.preventDefault();
    } else {
      aim = p;
    }
  }
  function onMove(e) {
    var p = toWorld(e);
    if (drag) { drag.x = p.x; drag.y = p.y; e.preventDefault(); }
    else if (aim) aim = p;
  }
  function onUp() {
    if (aim) {
      var dir = { x: aim.x - 40, y: aim.y - (VH - 90) };
      var len = Math.hypot(dir.x, dir.y) || 1;
      var shot = world.add(new P.Body({
        shape: P.makeCircle(11), x: 40, y: VH - 90,
        vx: dir.x / len * 1500, vy: dir.y / len * 1500,
        density: .02, restitution: .3, friction: .4, color: '#e0725a'
      }));
      shot.tag = 'shot';
      aim = null;
    }
    drag = null;
  }

  canvas.addEventListener('mousedown', onDown);
  canvas.addEventListener('touchstart', onDown, { passive: false });
  window.addEventListener('mousemove', onMove);
  canvas.addEventListener('touchmove', onMove, { passive: false });
  window.addEventListener('mouseup', onUp);
  canvas.addEventListener('touchend', onUp);
  canvas.addEventListener('contextmenu', function (e) { e.preventDefault(); });

  root.querySelectorAll('[data-scene]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      root.querySelectorAll('[data-scene]').forEach(function (o) { o.classList.remove('active'); });
      btn.classList.add('active');
      reset(btn.getAttribute('data-scene'));
    });
  });
  var resetBtn = root.querySelector('[data-reset]');
  if (resetBtn) resetBtn.addEventListener('click', function () { reset(); });

  reset('pyramid');

  if (reduce) {
    for (var i = 0; i < 400; i++) world.step(1 / 120);
    draw(); updateReadout();
    return {};
  }

  var acc = 0;
  return {
    frame: function (dt) {
      // Soft mouse constraint: pull the grabbed body toward the cursor.
      if (drag && drag.body) {
        var b = drag.body;
        b.wake();
        b.velocity.x += ((drag.x - b.position.x) * 26 - b.velocity.x * 6) * dt;
        b.velocity.y += ((drag.y - b.position.y) * 26 - b.velocity.y * 6) * dt;
      }
      world.update(Math.min(dt, 0.05));
      draw();
      acc += dt;
      if (acc > 0.2) { updateReadout(); acc = 0; }
    }
  };
});
