/* engine2d — a compact but honest 2D rigid-body engine.
 *
 * Written to demonstrate the physics-2d skill on this page, using the same
 * choices that skill argues for: semi-implicit Euler, SAT + face clipping for
 * two-point manifolds, accumulated impulses with warm starting, Coulomb
 * friction, positional correction with slop, and sleeping.
 *
 * Runs in the browser (attaches to window.Engine2D) and under Node (exports),
 * so the stacking behaviour can be smoke-tested outside a browser.
 */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.Engine2D = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var EPS = 1e-8;
  // How far apart (px) a clipped contact point may be and still be kept as a
  // speculative contact. See polyPoly / _solveContact.
  var SPECULATIVE_MARGIN = 0.9;
  // Synthetic feature ids for points created by the clipper, kept clear of any
  // real vertex index.
  var CLIP_ID_NEG = 90, CLIP_ID_POS = 91;
  // How much of the position correction is allowed to rotate a body. The split
  // impulse pass does not re-evaluate separation between its iterations, so a
  // full-strength angular term over-rotates and slowly walks a tall stack over.
  var ANGULAR_CORRECTION = 0.2;

  var V = {
    add: function (a, b) { return { x: a.x + b.x, y: a.y + b.y }; },
    sub: function (a, b) { return { x: a.x - b.x, y: a.y - b.y }; },
    scale: function (a, s) { return { x: a.x * s, y: a.y * s }; },
    dot: function (a, b) { return a.x * b.x + a.y * b.y; },
    cross: function (a, b) { return a.x * b.y - a.y * b.x; },
    // scalar × vector, the 2D reduction of ω × r
    crossSV: function (s, v) { return { x: -s * v.y, y: s * v.x }; },
    len: function (a) { return Math.hypot(a.x, a.y); },
    neg: function (a) { return { x: -a.x, y: -a.y }; },
    normalize: function (a) {
      var l = Math.hypot(a.x, a.y);
      return l < EPS ? { x: 0, y: 0 } : { x: a.x / l, y: a.y / l };
    }
  };

  function clamp(v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); }

  // ---------------------------------------------------------------- shapes
  function makeCircle(r) { return { type: 'circle', r: r }; }

  function makePoly(verts) { return { type: 'poly', verts: verts }; }

  function makeBox(w, h) {
    var hw = w / 2, hh = h / 2;
    return makePoly([
      { x: -hw, y: -hh }, { x: hw, y: -hh }, { x: hw, y: hh }, { x: -hw, y: hh }
    ]);
  }

  function makeNGon(r, n, rot) {
    rot = rot || 0;
    var v = [];
    for (var i = 0; i < n; i++) {
      var a = rot + (i / n) * Math.PI * 2;
      v.push({ x: Math.cos(a) * r, y: Math.sin(a) * r });
    }
    return makePoly(v);
  }

  var NEXT_ID = 1;

  // ------------------------------------------------------------------ body
  function Body(o) {
    o = o || {};
    this.id = NEXT_ID++;
    this.shape = o.shape;
    this.position = { x: o.x || 0, y: o.y || 0 };
    this.velocity = { x: o.vx || 0, y: o.vy || 0 };
    this.angle = o.angle || 0;
    this.angularVelocity = o.av || 0;
    this.restitution = o.restitution == null ? 0.12 : o.restitution;
    this.friction = o.friction == null ? 0.45 : o.friction;
    this.isStatic = !!o.isStatic;
    this.density = o.density == null ? 0.0016 : o.density;
    this.color = o.color || null;
    this.tag = o.tag || null;
    this.allowSleep = o.allowSleep !== false;
    this.awake = true;
    this.sleepTimer = 0;
    this._vertsAngle = null;
    this._verts = null;
    this._normals = null;
    this._computeMass();
  }

  Body.prototype._computeMass = function () {
    if (this.isStatic) {
      this.mass = 0; this.invMass = 0; this.inertia = 0; this.invInertia = 0;
      return;
    }
    var s = this.shape;
    if (s.type === 'circle') {
      this.mass = Math.PI * s.r * s.r * this.density;
      this.inertia = 0.5 * this.mass * s.r * s.r;
    } else {
      // Polygon area, centroid and second moment, then recentre on the centroid
      // so rotation happens about the true centre of mass.
      var v = s.verts, n = v.length;
      var area = 0, cx = 0, cy = 0, num = 0;
      for (var i = 0; i < n; i++) {
        var p1 = v[i], p2 = v[(i + 1) % n];
        var c = p1.x * p2.y - p2.x * p1.y;
        area += c;
        cx += (p1.x + p2.x) * c;
        cy += (p1.y + p2.y) * c;
        num += c * (p1.x * p1.x + p1.x * p2.x + p2.x * p2.x +
                    p1.y * p1.y + p1.y * p2.y + p2.y * p2.y);
      }
      area *= 0.5;
      cx /= (6 * area); cy /= (6 * area);
      for (var j = 0; j < n; j++) { v[j].x -= cx; v[j].y -= cy; }
      this.mass = Math.abs(area) * this.density;
      var iOrigin = Math.abs(num) / 12 * this.density;
      this.inertia = iOrigin - this.mass * (cx * cx + cy * cy);
      if (this.inertia <= 0) this.inertia = this.mass * 0.01;
    }
    this.invMass = this.mass > 0 ? 1 / this.mass : 0;
    this.invInertia = this.inertia > 0 ? 1 / this.inertia : 0;
  };

  Body.prototype._rebuild = function () {
    var c = Math.cos(this.angle), s = Math.sin(this.angle);
    var lv = this.shape.verts, n = lv.length;
    var wv = new Array(n), nm = new Array(n);
    for (var i = 0; i < n; i++) {
      wv[i] = {
        x: lv[i].x * c - lv[i].y * s + this.position.x,
        y: lv[i].x * s + lv[i].y * c + this.position.y
      };
    }
    for (var k = 0; k < n; k++) {
      var a = wv[k], b = wv[(k + 1) % n];
      // Outward normal for counter-clockwise winding in a y-down canvas.
      nm[k] = V.normalize({ x: b.y - a.y, y: -(b.x - a.x) });
    }
    this._verts = wv; this._normals = nm;
    this._vertsAngle = this.angle;
    this._vertsPos = { x: this.position.x, y: this.position.y };
  };

  Body.prototype.worldVerts = function () {
    if (this._vertsAngle !== this.angle || !this._vertsPos ||
        this._vertsPos.x !== this.position.x || this._vertsPos.y !== this.position.y) this._rebuild();
    return this._verts;
  };

  Body.prototype.worldNormals = function () {
    this.worldVerts();
    return this._normals;
  };

  Body.prototype.aabb = function () {
    if (this.shape.type === 'circle') {
      var r = this.shape.r;
      return { minX: this.position.x - r, maxX: this.position.x + r,
               minY: this.position.y - r, maxY: this.position.y + r };
    }
    var v = this.worldVerts();
    var minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (var i = 0; i < v.length; i++) {
      if (v[i].x < minX) minX = v[i].x;
      if (v[i].x > maxX) maxX = v[i].x;
      if (v[i].y < minY) minY = v[i].y;
      if (v[i].y > maxY) maxY = v[i].y;
    }
    return { minX: minX, maxX: maxX, minY: minY, maxY: maxY };
  };

  Body.prototype.wake = function () { this.awake = true; this.sleepTimer = 0; };

  Body.prototype.applyImpulse = function (imp, at) {
    if (this.isStatic) return;
    this.wake();
    this.velocity.x += imp.x * this.invMass;
    this.velocity.y += imp.y * this.invMass;
    if (at) {
      var r = V.sub(at, this.position);
      this.angularVelocity += this.invInertia * V.cross(r, imp);
    }
  };

  Body.prototype.contains = function (p) {
    if (this.shape.type === 'circle') {
      return Math.hypot(p.x - this.position.x, p.y - this.position.y) <= this.shape.r;
    }
    var v = this.worldVerts(), nm = this.worldNormals();
    for (var i = 0; i < v.length; i++) {
      if (V.dot(nm[i], V.sub(p, v[i])) > 0) return false;
    }
    return true;
  };

  // ------------------------------------------------------------ collisions
  function circleCircle(a, b) {
    var d = V.sub(b.position, a.position);
    var dist = V.len(d);
    var rsum = a.shape.r + b.shape.r;
    if (dist >= rsum) return null;
    var n = dist < EPS ? { x: 0, y: -1 } : V.scale(d, 1 / dist);
    return {
      normal: n,
      points: [{ point: V.add(a.position, V.scale(n, a.shape.r)), penetration: rsum - dist, id: 0 }]
    };
  }

  // Largest separation of poly A's faces against poly B (both negative => overlap)
  function maxSeparation(A, B) {
    var av = A.worldVerts(), an = A.worldNormals();
    var best = -Infinity, bestIdx = 0;
    for (var i = 0; i < av.length; i++) {
      var n = an[i];
      // support point of B in direction -n
      var bv = B.worldVerts();
      var lowest = Infinity, sp = null;
      for (var j = 0; j < bv.length; j++) {
        var proj = V.dot(bv[j], n);
        if (proj < lowest) { lowest = proj; sp = bv[j]; }
      }
      var s = V.dot(n, V.sub(sp, av[i]));
      if (s > best) { best = s; bestIdx = i; }
    }
    return { sep: best, index: bestIdx };
  }

  /* Clip a segment against a plane, carrying a feature id along with each point.
   *
   * The ids matter as much as the points: a surviving endpoint keeps the
   * incident-body vertex index it came from, and a point produced by the cut
   * gets the id of the plane that cut it. Identifying contact points by array
   * position instead is subtly wrong — when the first endpoint is clipped away
   * the survivors come back in the opposite order, so the same physical corner
   * changes slot between frames, warm-started impulses land on the wrong corner,
   * and the resulting phantom torque tips a tall stack over after a few seconds.
   */
  function clipSegment(n, c, pts, ids, clipId) {
    var outPts = [], outIds = [];
    var d1 = V.dot(n, pts[0]) - c;
    var d2 = V.dot(n, pts[1]) - c;
    if (d1 <= 0) { outPts.push(pts[0]); outIds.push(ids[0]); }
    if (d2 <= 0) { outPts.push(pts[1]); outIds.push(ids[1]); }
    if (d1 * d2 < 0 && outPts.length < 2) {
      var alpha = d1 / (d1 - d2);
      outPts.push(V.add(pts[0], V.scale(V.sub(pts[1], pts[0]), alpha)));
      outIds.push(clipId);
    }
    return { points: outPts, ids: outIds };
  }

  function polyPoly(A, B) {
    var fa = maxSeparation(A, B);
    if (fa.sep >= 0) return null;
    var fb = maxSeparation(B, A);
    if (fb.sep >= 0) return null;

    var ref, inc, refIdx, flip;
    // Prefer the axis of least penetration (largest, i.e. least negative,
    // separation), but give A a hysteresis margin. Two stacked boxes have very
    // nearly equal separations on both axes, and letting the reference face
    // flip every frame changes which features the contact points come from,
    // which throws warm starting away and lets the stack walk sideways.
    if (fb.sep > fa.sep + 0.01) { ref = B; inc = A; refIdx = fb.index; flip = true; }
    else { ref = A; inc = B; refIdx = fa.index; flip = false; }

    var rv = ref.worldVerts(), rn = ref.worldNormals();
    var n = rn[refIdx];
    var v1 = rv[refIdx], v2 = rv[(refIdx + 1) % rv.length];
    var side = V.normalize(V.sub(v2, v1));

    // The incident face is the one on the other body most anti-parallel to n.
    var iv = inc.worldVerts(), inm = inc.worldNormals();
    var incIdx = 0, minDot = Infinity;
    for (var i = 0; i < inm.length; i++) {
      var d = V.dot(inm[i], n);
      if (d < minDot) { minDot = d; incIdx = i; }
    }
    var i0 = incIdx, i1 = (incIdx + 1) % iv.length;
    var face = [iv[i0], iv[i1]];
    var faceIds = [i0, i1];

    var cl = clipSegment(V.neg(side), -V.dot(side, v1), face, faceIds, CLIP_ID_NEG);
    if (cl.points.length < 2) return null;
    cl = clipSegment(side, V.dot(side, v2), cl.points, cl.ids, CLIP_ID_POS);
    if (cl.points.length < 2) return null;

    var refC = V.dot(n, v1);
    var pts = [];
    var touching = false;
    for (var k = 0; k < cl.points.length; k++) {
      var sep = V.dot(n, cl.points[k]) - refC;
      // Keep BOTH clipped points, including one that is marginally separated.
      // A resting box tilted by a fraction of a degree otherwise drops to a
      // single contact point and starts to rock.
      if (sep <= SPECULATIVE_MARGIN) {
        pts.push({
          point: cl.points[k],
          penetration: -sep,
          // Identifies the physical feature, not the slot it landed in.
          id: (flip ? 1 : 0) * 100000 + refIdx * 1000 + cl.ids[k]
        });
        if (sep <= 0) touching = true;
      }
    }
    if (!pts.length || !touching) return null;
    return { normal: flip ? V.neg(n) : n, points: pts };
  }

  // normal points from circle C toward poly P
  function circlePoly(C, P) {
    var pv = P.worldVerts(), pn = P.worldNormals();
    var r = C.shape.r;
    var best = -Infinity, idx = 0;
    for (var i = 0; i < pv.length; i++) {
      var s = V.dot(pn[i], V.sub(C.position, pv[i]));
      if (s > r) return null;
      if (s > best) { best = s; idx = i; }
    }
    var v1 = pv[idx], v2 = pv[(idx + 1) % pv.length];

    if (best < EPS) {
      // centre is inside the polygon — push out along the closest face normal
      return {
        normal: V.neg(pn[idx]),
        points: [{ point: V.sub(C.position, V.scale(pn[idx], r)), penetration: r - best, id: 0 }]
      };
    }

    var d1 = V.dot(V.sub(C.position, v1), V.sub(v2, v1));
    var d2 = V.dot(V.sub(C.position, v2), V.sub(v1, v2));
    var closest;
    if (d1 <= 0) closest = v1;
    else if (d2 <= 0) closest = v2;
    else {
      return {
        normal: V.neg(pn[idx]),
        points: [{ point: V.sub(C.position, V.scale(pn[idx], r)), penetration: r - best, id: 0 }]
      };
    }
    var dv = V.sub(closest, C.position);
    var dist = V.len(dv);
    if (dist > r) return null;
    return {
      normal: dist < EPS ? V.neg(pn[idx]) : V.scale(dv, 1 / dist),
      points: [{ point: closest, penetration: r - dist, id: 1 }]
    };
  }

  function collide(a, b) {
    var at = a.shape.type, bt = b.shape.type;
    if (at === 'circle' && bt === 'circle') return circleCircle(a, b);
    if (at === 'poly' && bt === 'poly') return polyPoly(a, b);
    if (at === 'circle' && bt === 'poly') return circlePoly(a, b);
    var m = circlePoly(b, a);           // poly A vs circle B
    if (m) m.normal = V.neg(m.normal);  // flip so it still points A -> B
    return m;
  }

  // ---------------------------------------------------------------- joints
  function RevoluteJoint(a, b, anchorA, anchorB) {
    this.a = a; this.b = b;
    this.localA = anchorA; this.localB = anchorB;
    this.type = 'revolute';
    this.impulse = { x: 0, y: 0 };   // accumulated, for warm starting
  }

  RevoluteJoint.prototype._rot = function (body, local) {
    var c = Math.cos(body.angle), s = Math.sin(body.angle);
    return { x: local.x * c - local.y * s, y: local.x * s + local.y * c };
  };

  RevoluteJoint.prototype._apply = function (imp) {
    var a = this.a, b = this.b;
    if (!a.isStatic) {
      a.velocity.x -= imp.x * a.invMass;
      a.velocity.y -= imp.y * a.invMass;
      a.angularVelocity -= a.invInertia * V.cross(this.rA, imp);
    }
    if (!b.isStatic) {
      b.velocity.x += imp.x * b.invMass;
      b.velocity.y += imp.y * b.invMass;
      b.angularVelocity += b.invInertia * V.cross(this.rB, imp);
    }
  };

  RevoluteJoint.prototype.prestep = function (dt) {
    var a = this.a, b = this.b;
    a.wake(); b.wake();
    var rA = this.rA = this._rot(a, this.localA);
    var rB = this.rB = this._rot(b, this.localB);

    var k11 = a.invMass + b.invMass + a.invInertia * rA.y * rA.y + b.invInertia * rB.y * rB.y;
    var k12 = -a.invInertia * rA.x * rA.y - b.invInertia * rB.x * rB.y;
    var k22 = a.invMass + b.invMass + a.invInertia * rA.x * rA.x + b.invInertia * rB.x * rB.x;
    var det = k11 * k22 - k12 * k12;
    this.valid = Math.abs(det) > EPS;
    if (!this.valid) return;
    var invDet = 1 / det;
    this.m11 = k22 * invDet; this.m12 = -k12 * invDet; this.m22 = k11 * invDet;

    // Carrying the accumulated impulse across steps is what keeps a long chain
    // from stretching: each link starts the step already holding its load.
    this._apply(this.impulse);
  };

  /* Velocity constraint only — no positional (Baumgarte) bias.
   *
   * Mixing a position-error bias into an impulse that is then warm-started to
   * the next step double-counts it: the stored impulse is meant to be the
   * physical load the joint carries, and re-applying a correction term as if it
   * were load pumps energy into a chain until it whips and visibly stretches.
   * Drift is taken out by solvePosition instead.
   */
  RevoluteJoint.prototype.solve = function () {
    if (!this.valid) return;
    var a = this.a, b = this.b;
    var vA = V.add(a.velocity, V.crossSV(a.angularVelocity, this.rA));
    var vB = V.add(b.velocity, V.crossSV(b.angularVelocity, this.rB));
    var rel = V.sub(vB, vA);

    var imp = {
      x: -(this.m11 * rel.x + this.m12 * rel.y),
      y: -(this.m12 * rel.x + this.m22 * rel.y)
    };
    this.impulse.x += imp.x;
    this.impulse.y += imp.y;
    this._apply(imp);
  };

  // Pull the two anchor points back together directly, in position space.
  RevoluteJoint.prototype.solvePosition = function () {
    var a = this.a, b = this.b;
    var rA = this._rot(a, this.localA), rB = this._rot(b, this.localB);
    var err = V.sub(V.add(b.position, rB), V.add(a.position, rA));
    if (Math.abs(err.x) < 1e-4 && Math.abs(err.y) < 1e-4) return;

    var k11 = a.invMass + b.invMass + a.invInertia * rA.y * rA.y + b.invInertia * rB.y * rB.y;
    var k12 = -a.invInertia * rA.x * rA.y - b.invInertia * rB.x * rB.y;
    var k22 = a.invMass + b.invMass + a.invInertia * rA.x * rA.x + b.invInertia * rB.x * rB.x;
    var det = k11 * k22 - k12 * k12;
    if (Math.abs(det) < EPS) return;
    var invDet = 1 / det;

    var imp = {
      x: -(k22 * invDet * err.x + -k12 * invDet * err.y),
      y: -(-k12 * invDet * err.x + k11 * invDet * err.y)
    };

    if (!a.isStatic) {
      a.position.x -= imp.x * a.invMass;
      a.position.y -= imp.y * a.invMass;
      a.angle -= a.invInertia * V.cross(rA, imp);
    }
    if (!b.isStatic) {
      b.position.x += imp.x * b.invMass;
      b.position.y += imp.y * b.invMass;
      b.angle += b.invInertia * V.cross(rB, imp);
    }
  };

  // ----------------------------------------------------------------- world
  function World(o) {
    o = o || {};
    this.gravity = o.gravity || { x: 0, y: 980 };
    this.bodies = [];
    this.joints = [];
    this.fixedDt = o.fixedDt || 1 / 120;
    this.velocityIterations = o.velocityIterations || 10;
    this.positionIterations = o.positionIterations || 3;
    // Slop is in pixels, and it is deliberately not tiny: correcting overlap to
    // exactly zero makes bodies separate, lose their contact next frame, fall
    // back, and flicker — which also throws away warm starting and lets stacks
    // collapse. Leaving ~half a pixel of residual overlap keeps contacts alive.
    this.slop = 0.5;
    this.correctionPercent = 0.3;
    // Approach speed (px/s) below which a contact simply does not bounce.
    this.restitutionThreshold = 200;
    this.accumulator = 0;
    this.contactCache = {};
    this.contacts = [];
    this.enableSleep = o.enableSleep !== false;
    this.sleepLinearTolerance = 6;
    this.sleepAngularTolerance = 0.12;
    this.sleepTime = 0.7;
    this.bounds = o.bounds || null;
  }

  World.prototype.add = function (body) { this.bodies.push(body); return body; };
  World.prototype.addJoint = function (j) { this.joints.push(j); return j; };
  World.prototype.remove = function (body) {
    var i = this.bodies.indexOf(body);
    if (i >= 0) this.bodies.splice(i, 1);
  };
  World.prototype.clear = function () {
    this.bodies.length = 0; this.joints.length = 0; this.contactCache = {}; this.contacts.length = 0;
  };

  World.prototype.update = function (dt) {
    // Fixed-step accumulator: the simulation never sees a variable frame delta.
    this.accumulator += Math.min(dt, 0.25);
    var steps = 0;
    while (this.accumulator >= this.fixedDt && steps < 8) {
      this.step(this.fixedDt);
      this.accumulator -= this.fixedDt;
      steps++;
    }
    if (steps === 8) this.accumulator = 0;
    return this.accumulator / this.fixedDt;
  };

  World.prototype.step = function (dt) {
    var i, j, b;

    for (i = 0; i < this.bodies.length; i++) {
      b = this.bodies[i];
      if (b.isStatic || !b.awake) continue;
      // Semi-implicit Euler: gravity is an acceleration, added straight to velocity.
      b.velocity.x += this.gravity.x * dt;
      b.velocity.y += this.gravity.y * dt;
    }

    var contacts = this._broadNarrow();
    this.contacts = contacts;

    this._prestep(contacts, dt);
    for (i = 0; i < this.joints.length; i++) this.joints[i].prestep(dt);

    for (i = 0; i < this.velocityIterations; i++) {
      for (j = 0; j < this.joints.length; j++) this.joints[j].solve(dt);
      for (j = 0; j < contacts.length; j++) this._solveContact(contacts[j]);
    }
    this._applyRestitution(contacts);

    for (i = 0; i < this.bodies.length; i++) {
      b = this.bodies[i];
      if (b.isStatic || !b.awake) continue;
      b.position.x += b.velocity.x * dt;
      b.position.y += b.velocity.y * dt;
      b.angle += b.angularVelocity * dt;
    }

    this._solvePositions(contacts, dt);
    for (i = 0; i < this.positionIterations; i++) {
      for (j = 0; j < this.joints.length; j++) this.joints[j].solvePosition();
    }

    if (this.bounds) this._applyBounds();
    if (this.enableSleep) this._updateSleep(contacts, dt);
  };

  World.prototype._broadNarrow = function () {
    var out = [];
    var bs = this.bodies;
    for (var i = 0; i < bs.length; i++) {
      var A = bs[i];
      var aActive = !A.isStatic && A.awake;
      var ab = A.aabb();
      for (var j = i + 1; j < bs.length; j++) {
        var B = bs[j];
        var bActive = !B.isStatic && B.awake;
        // Nothing here is both dynamic and awake, so there is nothing to solve.
        // Static bodies are permanently "awake" and must not keep neighbours up.
        if (!aActive && !bActive) continue;
        var bb = B.aabb();
        if (ab.maxX < bb.minX || ab.minX > bb.maxX || ab.maxY < bb.minY || ab.minY > bb.maxY) continue;
        var m = collide(A, B);
        if (!m) continue;
        m.a = A; m.b = B;
        m.e = Math.min(A.restitution, B.restitution);
        m.friction = Math.sqrt(A.friction * B.friction);
        m.key = A.id + ':' + B.id;
        out.push(m);
        if (aActive && !B.isStatic && !B.awake) B.wake();
        if (bActive && !A.isStatic && !A.awake) A.wake();
      }
    }
    return out;
  };

  World.prototype._prestep = function (contacts, dt) {
    var cache = {};
    for (var c = 0; c < contacts.length; c++) {
      var m = contacts[c];
      var A = m.a, B = m.b, n = m.normal;
      var t = { x: -n.y, y: n.x };
      var old = this.contactCache[m.key];
      for (var p = 0; p < m.points.length; p++) {
        var cp = m.points[p];
        cp.rA = V.sub(cp.point, A.position);
        cp.rB = V.sub(cp.point, B.position);


        var rnA = V.cross(cp.rA, n), rnB = V.cross(cp.rB, n);
        var kn = A.invMass + B.invMass + A.invInertia * rnA * rnA + B.invInertia * rnB * rnB;
        cp.massN = kn > 0 ? 1 / kn : 0;

        var rtA = V.cross(cp.rA, t), rtB = V.cross(cp.rB, t);
        var kt = A.invMass + B.invMass + A.invInertia * rtA * rtA + B.invInertia * rtB * rtB;
        cp.massT = kt > 0 ? 1 / kt : 0;

        var vA = V.add(A.velocity, V.crossSV(A.angularVelocity, cp.rA));
        var vB = V.add(B.velocity, V.crossSV(B.angularVelocity, cp.rB));
        var vn = V.dot(V.sub(vB, vA), n);
        // Restitution is NOT mixed into the main solve — it is applied by a
        // separate pass afterwards (see _applyRestitution). Feeding a bounce
        // bias into the iterations that are trying to converge a resting stack
        // injects energy the stack has no way to shed, and a tall one shakes
        // itself apart. Record the approach speed the bounce will be based on.
        cp.bias = 0;
        cp.relVel0 = (cp.penetration >= 0) ? vn : 0;
        // A point kept for stability but not yet touching resists approach the
        // same as a touching one. Letting it close its sub-pixel gap "for free"
        // (allowance = gap/dt) is what leaves a resting stack with 30-50 px/s of
        // residual velocity: correction opens a gap, the gap buys approach
        // speed, the body falls back in, forever. Being caught up to
        // SPECULATIVE_MARGIN early is invisible; buzzing is not.
        cp.approachAllowance = 0;

        // Warm start from last frame's accumulated impulses, matched by feature
        // id rather than array index: face clipping can emit the two contact
        // points in either order, and reusing an impulse on the wrong corner
        // applies a phantom torque that walks a stack sideways over time.
        cp.nImpulse = 0; cp.tImpulse = 0; cp.pImpulse = 0;
        if (old) {
          for (var q = 0; q < old.points.length; q++) {
            if (old.points[q].id === cp.id) {
              cp.nImpulse = old.points[q].nImpulse || 0;
              cp.tImpulse = old.points[q].tImpulse || 0;
              break;
            }
          }
        }
        var warm = V.add(V.scale(n, cp.nImpulse), V.scale(t, cp.tImpulse));
        if (!A.isStatic) {
          A.velocity.x -= warm.x * A.invMass;
          A.velocity.y -= warm.y * A.invMass;
          A.angularVelocity -= A.invInertia * V.cross(cp.rA, warm);
        }
        if (!B.isStatic) {
          B.velocity.x += warm.x * B.invMass;
          B.velocity.y += warm.y * B.invMass;
          B.angularVelocity += B.invInertia * V.cross(cp.rB, warm);
        }
      }
      m.tangent = t;

      /* Two-point manifolds get a block solver.
       *
       * Solving the two points of one manifold one after the other lets them
       * fight: each undoes part of the other's work, and for a tall stack the
       * pair never converges — the box rocks a little more every step until the
       * stack topples. Solving both simultaneously as a 2x2 LCP is what makes
       * stacking stable. Skipped when the two points are near-redundant and the
       * matrix is ill-conditioned; sequential is fine there.
       */
      m.useBlockSolver = false;
      if (m.points.length === 2) {
        var c1 = m.points[0], c2 = m.points[1];
        var rn1A = V.cross(c1.rA, n), rn1B = V.cross(c1.rB, n);
        var rn2A = V.cross(c2.rA, n), rn2B = V.cross(c2.rB, n);
        var k11 = A.invMass + B.invMass + A.invInertia * rn1A * rn1A + B.invInertia * rn1B * rn1B;
        var k22 = A.invMass + B.invMass + A.invInertia * rn2A * rn2A + B.invInertia * rn2B * rn2B;
        var k12 = A.invMass + B.invMass + A.invInertia * rn1A * rn2A + B.invInertia * rn1B * rn2B;
        var det = k11 * k22 - k12 * k12;
        if (det > EPS && k11 * k11 < 1000 * det) {
          var invDet = 1 / det;
          m.k11 = k11; m.k22 = k22; m.k12 = k12;
          m.nm11 = k22 * invDet; m.nm12 = -k12 * invDet; m.nm22 = k11 * invDet;
          m.useBlockSolver = true;
        }
      }
      cache[m.key] = m;
    }
    this.contactCache = cache;
  };

  function relNormalVel(A, B, cp, n) {
    var vAx = A.velocity.x - A.angularVelocity * cp.rA.y;
    var vAy = A.velocity.y + A.angularVelocity * cp.rA.x;
    var vBx = B.velocity.x - B.angularVelocity * cp.rB.y;
    var vBy = B.velocity.y + B.angularVelocity * cp.rB.x;
    return (vBx - vAx) * n.x + (vBy - vAy) * n.y;
  }

  function applyPair(A, B, cp, dir, mag) {
    var ix = dir.x * mag, iy = dir.y * mag;
    if (!A.isStatic) {
      A.velocity.x -= ix * A.invMass;
      A.velocity.y -= iy * A.invMass;
      A.angularVelocity -= A.invInertia * (cp.rA.x * iy - cp.rA.y * ix);
    }
    if (!B.isStatic) {
      B.velocity.x += ix * B.invMass;
      B.velocity.y += iy * B.invMass;
      B.angularVelocity += B.invInertia * (cp.rB.x * iy - cp.rB.y * ix);
    }
  }

  World.prototype._solveContact = function (m) {
    var A = m.a, B = m.b, n = m.normal, t = m.tangent;
    var pts = m.points, p, cp;

    // Friction first, bounded by the normal impulse accumulated so far.
    for (p = 0; p < pts.length; p++) {
      cp = pts[p];
      var vAx = A.velocity.x - A.angularVelocity * cp.rA.y;
      var vAy = A.velocity.y + A.angularVelocity * cp.rA.x;
      var vBx = B.velocity.x - B.angularVelocity * cp.rB.y;
      var vBy = B.velocity.y + B.angularVelocity * cp.rB.x;
      var vt = (vBx - vAx) * t.x + (vBy - vAy) * t.y;
      var dPt = cp.massT * (-vt);
      var maxT = m.friction * cp.nImpulse;     // Coulomb cone
      var oldT = cp.tImpulse;
      cp.tImpulse = clamp(oldT + dPt, -maxT, maxT);
      applyPair(A, B, cp, t, cp.tImpulse - oldT);
    }

    if (m.useBlockSolver) {
      var c1 = pts[0], c2 = pts[1];
      var a1 = c1.nImpulse, a2 = c2.nImpulse;
      var vn1 = relNormalVel(A, B, c1, n);
      var vn2 = relNormalVel(A, B, c2, n);
      // Velocity error with the currently applied impulses removed.
      var bx = vn1 - c1.bias - (m.k11 * a1 + m.k12 * a2);
      var by = vn2 - c2.bias - (m.k12 * a1 + m.k22 * a2);

      var x1 = 0, x2 = 0, ok = false;
      // 1: both points pushing
      x1 = -(m.nm11 * bx + m.nm12 * by);
      x2 = -(m.nm12 * bx + m.nm22 * by);
      if (x1 >= 0 && x2 >= 0) ok = true;
      if (!ok) {                              // 2: only point 1
        x1 = -bx / m.k11; x2 = 0;
        if (x1 >= 0 && (m.k12 * x1 + by) >= 0) ok = true;
      }
      if (!ok) {                              // 3: only point 2
        x1 = 0; x2 = -by / m.k22;
        if (x2 >= 0 && (m.k12 * x2 + bx) >= 0) ok = true;
      }
      if (!ok && bx >= 0 && by >= 0) {        // 4: separating, no impulse
        x1 = 0; x2 = 0; ok = true;
      }
      if (ok) {
        applyPair(A, B, c1, n, x1 - a1);
        applyPair(A, B, c2, n, x2 - a2);
        c1.nImpulse = x1; c2.nImpulse = x2;
      }
    } else {
      for (p = 0; p < pts.length; p++) {
        cp = pts[p];
        var vn = relNormalVel(A, B, cp, n);
        var dPn = cp.massN * (-vn - cp.approachAllowance + cp.bias);
        // Clamp the ACCUMULATED impulse, not the increment — this is what lets
        // resting contacts converge to exactly zero relative velocity.
        var oldN = cp.nImpulse;
        cp.nImpulse = Math.max(oldN + dPn, 0);
        applyPair(A, B, cp, n, cp.nImpulse - oldN);
      }
    }
  };

  /* Restitution pass — run once the main velocity solve has converged.
   *
   * Only contacts that were genuinely approaching faster than the threshold
   * bounce, and only where the contact actually carried load, so a settling pile
   * stays quiet while a dropped ball still bounces properly.
   */
  World.prototype._applyRestitution = function (contacts) {
    var threshold = this.restitutionThreshold;
    for (var iter = 0; iter < 2; iter++) {
      for (var c = 0; c < contacts.length; c++) {
        var m = contacts[c];
        if (m.e <= 0) continue;
        var A = m.a, B = m.b, n = m.normal;
        for (var p = 0; p < m.points.length; p++) {
          var cp = m.points[p];
          if (cp.relVel0 > -threshold || cp.nImpulse <= 0) continue;
          var vn = relNormalVel(A, B, cp, n);
          var dPn = cp.massN * (-vn - m.e * cp.relVel0);
          var oldN = cp.nImpulse;
          cp.nImpulse = Math.max(oldN + dPn, 0);
          applyPair(A, B, cp, n, cp.nImpulse - oldN);
        }
      }
    }
  };

  /* Split-impulse position correction.
   *
   * Penetration is resolved by driving a SEPARATE pair of "pseudo" velocities
   * that are integrated into position and then thrown away, instead of either
   * teleporting positions (which changes the geometry the solver just balanced,
   * and shows up as a resting stack buzzing at tens of px/s) or feeding a
   * Baumgarte bias into the real velocity (which injects real energy).
   */
  World.prototype._solvePositions = function (contacts, dt) {
    var i, c, p, b;
    for (i = 0; i < this.bodies.length; i++) {
      b = this.bodies[i];
      b.pvx = 0; b.pvy = 0; b.pw = 0;
    }

    var maxCorrectionSpeed = 60;   // px/s, stops a deep overlap from popping
    for (var iter = 0; iter < this.positionIterations; iter++) {
      for (c = 0; c < contacts.length; c++) {
        var m = contacts[c], A = m.a, B = m.b, n = m.normal;
        for (p = 0; p < m.points.length; p++) {
          var cp = m.points[p];
          if (cp.penetration <= this.slop) continue;

          var pvA = { x: A.pvx - A.pw * cp.rA.y, y: A.pvy + A.pw * cp.rA.x };
          var pvB = { x: B.pvx - B.pw * cp.rB.y, y: B.pvy + B.pw * cp.rB.x };
          var pvn = V.dot(V.sub(pvB, pvA), n);

          var target = Math.min((cp.penetration - this.slop) / dt * this.correctionPercent,
                                maxCorrectionSpeed);
          var dP = cp.massN * (target - pvn);
          var old = cp.pImpulse;
          cp.pImpulse = Math.max(old + dP, 0);
          dP = cp.pImpulse - old;
          var imp = V.scale(n, dP);

          if (!A.isStatic) {
            A.pvx -= imp.x * A.invMass; A.pvy -= imp.y * A.invMass;
            A.pw -= A.invInertia * V.cross(cp.rA, imp) * ANGULAR_CORRECTION;
          }
          if (!B.isStatic) {
            B.pvx += imp.x * B.invMass; B.pvy += imp.y * B.invMass;
            B.pw += B.invInertia * V.cross(cp.rB, imp) * ANGULAR_CORRECTION;
          }
        }
      }
    }

    for (i = 0; i < this.bodies.length; i++) {
      b = this.bodies[i];
      if (b.isStatic || !b.awake) continue;
      if (b.pvx || b.pvy || b.pw) {
        b.position.x += b.pvx * dt;
        b.position.y += b.pvy * dt;
        b.angle += b.pw * dt;
      }
    }
  };

  World.prototype._applyBounds = function () {
    var bd = this.bounds;
    for (var i = 0; i < this.bodies.length; i++) {
      var b = this.bodies[i];
      if (b.isStatic) continue;
      if (b.position.y > bd.maxY || b.position.x < bd.minX || b.position.x > bd.maxX) {
        if (typeof bd.onExit === 'function') bd.onExit(b);
      }
    }
  };

  /* Island-based sleeping.
   *
   * Bodies sleep as connected groups, never individually. Letting one box in a
   * stack fall asleep on its own is actively harmful: a sleeping pair generates
   * no contacts, so the still-awake boxes above sink into it and the whole stack
   * tears itself apart when it wakes. A group only sleeps once every member of
   * it has been still long enough, and wakes together.
   */
  World.prototype._updateSleep = function (contacts, dt) {
    var i, j, b, bodies = this.bodies;

    for (i = 0; i < bodies.length; i++) {
      b = bodies[i];
      b._island = -1;
      if (b.isStatic) continue;
      var slow = Math.hypot(b.velocity.x, b.velocity.y) < this.sleepLinearTolerance &&
                 Math.abs(b.angularVelocity) < this.sleepAngularTolerance;
      b.sleepTimer = slow ? b.sleepTimer + dt : 0;
    }

    // Adjacency through contacts and joints; static bodies do not join islands
    // (or every pile touching the floor would be one island).
    var adj = {};
    function link(x, y) { (adj[x.id] || (adj[x.id] = [])).push(y); }
    for (i = 0; i < contacts.length; i++) {
      var ca = contacts[i].a, cb = contacts[i].b;
      if (ca.isStatic || cb.isStatic) continue;
      link(ca, cb); link(cb, ca);
    }
    for (i = 0; i < this.joints.length; i++) {
      var ja = this.joints[i].a, jb = this.joints[i].b;
      if (ja.isStatic || jb.isStatic) continue;
      link(ja, jb); link(jb, ja);
    }

    var island = 0;
    for (i = 0; i < bodies.length; i++) {
      b = bodies[i];
      if (b.isStatic || b._island >= 0) continue;

      var stack = [b], members = [];
      b._island = island;
      while (stack.length) {
        var cur = stack.pop();
        members.push(cur);
        var ns = adj[cur.id];
        if (ns) {
          for (j = 0; j < ns.length; j++) {
            if (!ns[j].isStatic && ns[j]._island < 0) { ns[j]._island = island; stack.push(ns[j]); }
          }
        }
      }

      var canSleep = true, minTimer = Infinity;
      for (j = 0; j < members.length; j++) {
        if (!members[j].allowSleep) { canSleep = false; break; }
        if (members[j].sleepTimer < minTimer) minTimer = members[j].sleepTimer;
      }
      var sleep = canSleep && minTimer > this.sleepTime;
      for (j = 0; j < members.length; j++) {
        var mb = members[j];
        if (sleep) {
          mb.awake = false;
          mb.velocity.x = 0; mb.velocity.y = 0; mb.angularVelocity = 0;
        } else {
          mb.awake = true;
        }
      }
      island++;
    }
  };

  World.prototype.bodyAt = function (p) {
    for (var i = this.bodies.length - 1; i >= 0; i--) {
      var b = this.bodies[i];
      if (!b.isStatic && b.contains(p)) return b;
    }
    return null;
  };

  // Ray query — returns the nearest hit, or null.
  World.prototype.raycast = function (origin, dir, maxDist) {
    var d = V.normalize(dir);
    var best = null;
    for (var i = 0; i < this.bodies.length; i++) {
      var b = this.bodies[i];
      var hit = null;
      if (b.shape.type === 'circle') {
        var m = V.sub(origin, b.position);
        var bq = V.dot(m, d);
        var cq = V.dot(m, m) - b.shape.r * b.shape.r;
        if (cq > 0 && bq > 0) continue;
        var disc = bq * bq - cq;
        if (disc < 0) continue;
        var t = -bq - Math.sqrt(disc);
        if (t < 0) t = 0;
        if (t <= maxDist) {
          var pt = V.add(origin, V.scale(d, t));
          hit = { body: b, t: t, point: pt, normal: V.normalize(V.sub(pt, b.position)) };
        }
      } else {
        var v = b.worldVerts(), n = b.worldNormals();
        var tmin = 0, tmax = maxDist, nrm = null;
        var ok = true;
        for (var k = 0; k < v.length; k++) {
          var denom = V.dot(n[k], d);
          var dist = V.dot(n[k], V.sub(v[k], origin));
          if (Math.abs(denom) < EPS) {
            if (dist < 0) { ok = false; break; }
          } else {
            var tt = dist / denom;
            if (denom < 0) { if (tt > tmin) { tmin = tt; nrm = n[k]; } }
            else { if (tt < tmax) tmax = tt; }
            if (tmin > tmax) { ok = false; break; }
          }
        }
        if (ok && nrm) hit = { body: b, t: tmin, point: V.add(origin, V.scale(d, tmin)), normal: nrm };
      }
      if (hit && (!best || hit.t < best.t)) best = hit;
    }
    return best;
  };

  return {
    V: V, Body: Body, World: World, RevoluteJoint: RevoluteJoint,
    makeCircle: makeCircle, makeBox: makeBox, makePoly: makePoly, makeNGon: makeNGon,
    collide: collide
  };
});
