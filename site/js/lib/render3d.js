/* render3d — a small software 3D renderer drawing onto a 2D canvas.
 *
 * No WebGL and no library: platonic solids, rotation, perspective projection,
 * back-face culling, painter's-algorithm depth sort, and per-face shading that
 * follows canvas-atelier's model — a gradient across every face rather than a
 * flat fill, a specular term, and a rim light on faces turned away from the
 * viewer. Faceted metal is exactly the case where flat fills look like clip art
 * and gradients look like an object.
 */
window.Render3D = (function () {
  'use strict';

  var G = window.Gfx;

  function v3(x, y, z) { return { x: x, y: y, z: z }; }
  function sub3(a, b) { return v3(a.x - b.x, a.y - b.y, a.z - b.z); }
  function cross3(a, b) {
    return v3(a.y * b.z - a.z * b.y, a.z * b.x - a.x * b.z, a.x * b.y - a.y * b.x);
  }
  function dot3(a, b) { return a.x * b.x + a.y * b.y + a.z * b.z; }
  function norm3(a) {
    var l = Math.sqrt(a.x * a.x + a.y * a.y + a.z * a.z) || 1e-9;
    return v3(a.x / l, a.y / l, a.z / l);
  }

  function rotatePoint(p, rx, ry, rz) {
    var x = p.x, y = p.y, z = p.z, c, s, t;
    c = Math.cos(rx); s = Math.sin(rx); t = y * c - z * s; z = y * s + z * c; y = t;
    c = Math.cos(ry); s = Math.sin(ry); t = x * c + z * s; z = -x * s + z * c; x = t;
    c = Math.cos(rz); s = Math.sin(rz); t = x * c - y * s; y = x * s + y * c; x = t;
    return v3(x, y, z);
  }

  // ---------------------------------------------------------------- solids
  function normalizeMesh(verts, faces) {
    var max = 0;
    for (var i = 0; i < verts.length; i++) {
      var l = Math.sqrt(verts[i].x * verts[i].x + verts[i].y * verts[i].y + verts[i].z * verts[i].z);
      if (l > max) max = l;
    }
    for (var j = 0; j < verts.length; j++) {
      verts[j].x /= max; verts[j].y /= max; verts[j].z /= max;
    }
    return { verts: verts, faces: faces };
  }

  function tetrahedron() {
    return normalizeMesh(
      [v3(1, 1, 1), v3(-1, -1, 1), v3(-1, 1, -1), v3(1, -1, -1)],
      [[0, 1, 2], [0, 3, 1], [0, 2, 3], [1, 3, 2]]
    );
  }

  function cube() {
    return normalizeMesh(
      [v3(-1, -1, -1), v3(1, -1, -1), v3(1, 1, -1), v3(-1, 1, -1),
       v3(-1, -1, 1), v3(1, -1, 1), v3(1, 1, 1), v3(-1, 1, 1)],
      [[0, 3, 2, 1], [4, 5, 6, 7], [0, 1, 5, 4], [2, 3, 7, 6], [1, 2, 6, 5], [0, 4, 7, 3]]
    );
  }

  function octahedron() {
    return normalizeMesh(
      [v3(1, 0, 0), v3(-1, 0, 0), v3(0, 1, 0), v3(0, -1, 0), v3(0, 0, 1), v3(0, 0, -1)],
      [[0, 2, 4], [2, 1, 4], [1, 3, 4], [3, 0, 4],
       [2, 0, 5], [1, 2, 5], [3, 1, 5], [0, 3, 5]]
    );
  }

  function icosahedron() {
    var t = (1 + Math.sqrt(5)) / 2;
    var verts = [
      v3(-1, t, 0), v3(1, t, 0), v3(-1, -t, 0), v3(1, -t, 0),
      v3(0, -1, t), v3(0, 1, t), v3(0, -1, -t), v3(0, 1, -t),
      v3(t, 0, -1), v3(t, 0, 1), v3(-t, 0, -1), v3(-t, 0, 1)
    ];
    var faces = [
      [0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11],
      [1, 5, 9], [5, 11, 4], [11, 10, 2], [10, 7, 6], [7, 1, 8],
      [3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9],
      [4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1]
    ];
    return normalizeMesh(verts, faces);
  }

  function dodecahedron() {
    var p = (1 + Math.sqrt(5)) / 2, q = 1 / p;
    var verts = [
      v3(1, 1, 1), v3(1, 1, -1), v3(1, -1, 1), v3(1, -1, -1),
      v3(-1, 1, 1), v3(-1, 1, -1), v3(-1, -1, 1), v3(-1, -1, -1),
      v3(0, q, p), v3(0, q, -p), v3(0, -q, p), v3(0, -q, -p),
      v3(q, p, 0), v3(q, -p, 0), v3(-q, p, 0), v3(-q, -p, 0),
      v3(p, 0, q), v3(p, 0, -q), v3(-p, 0, q), v3(-p, 0, -q)
    ];
    var faces = [
      [0, 8, 10, 2, 16], [0, 16, 17, 1, 12], [0, 12, 14, 4, 8],
      [8, 4, 18, 6, 10], [10, 6, 15, 13, 2], [2, 13, 3, 17, 16],
      [1, 17, 3, 11, 9], [1, 9, 5, 14, 12], [14, 5, 19, 18, 4],
      [18, 19, 7, 15, 6], [15, 7, 11, 3, 13], [9, 11, 7, 19, 5]
    ];
    return normalizeMesh(verts, faces);
  }

  var SOLIDS = {
    tetrahedron: tetrahedron, cube: cube, octahedron: octahedron,
    icosahedron: icosahedron, dodecahedron: dodecahedron
  };

  /* Draw one solid.
   * opts: { x, y, scale, rx, ry, rz, light (unit v3), base, highlight, shadow,
   *         edge, depth (camera distance), alpha }
   */
  function drawSolid(ctx, mesh, opts) {
    var scale = opts.scale, cx = opts.x, cy = opts.y;
    var focal = opts.focal || 620;
    var camZ = opts.depth || 0;
    var light = opts.light || norm3(v3(-0.5, -0.75, 0.9));

    var wv = new Array(mesh.verts.length);
    var sv = new Array(mesh.verts.length);
    for (var i = 0; i < mesh.verts.length; i++) {
      var p = rotatePoint(mesh.verts[i], opts.rx, opts.ry, opts.rz);
      p = v3(p.x * scale, p.y * scale, p.z * scale + camZ);
      wv[i] = p;
      var f = focal / (focal + p.z);
      sv[i] = { x: cx + p.x * f, y: cy + p.y * f, f: f };
    }

    // Painter's algorithm: draw the far faces first.
    var order = [];
    for (var k = 0; k < mesh.faces.length; k++) {
      var face = mesh.faces[k];
      var zc = 0;
      for (var m = 0; m < face.length; m++) zc += wv[face[m]].z;
      order.push({ i: k, z: zc / face.length });
    }
    order.sort(function (a, b) { return b.z - a.z; });

    ctx.save();
    if (opts.alpha != null) ctx.globalAlpha = opts.alpha;

    for (var o = 0; o < order.length; o++) {
      var f2 = mesh.faces[order[o].i];
      var a = wv[f2[0]], b = wv[f2[1]], c = wv[f2[2]];
      var n = norm3(cross3(sub3(b, a), sub3(c, a)));
      // Back-face cull: view direction is +z into the screen.
      if (n.z > 0) continue;

      var lambert = Math.max(0, -dot3(n, light));
      // Blinn-ish specular using a halfway vector against the view axis.
      var h = norm3(v3(light.x, light.y, light.z - 1));
      var spec = Math.pow(Math.max(0, -dot3(n, h)), 22);
      // Rim: faces nearly edge-on to the camera catch light along their edge.
      var rim = Math.pow(1 - Math.min(1, Math.abs(n.z)), 3);

      var minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      ctx.beginPath();
      for (var q = 0; q < f2.length; q++) {
        var s = sv[f2[q]];
        if (q === 0) ctx.moveTo(s.x, s.y); else ctx.lineTo(s.x, s.y);
        if (s.x < minX) minX = s.x; if (s.x > maxX) maxX = s.x;
        if (s.y < minY) minY = s.y; if (s.y > maxY) maxY = s.y;
      }
      ctx.closePath();

      // Gradient across the face along the light direction, not a flat fill.
      var gx = light.x, gy = light.y;
      var gl = Math.hypot(gx, gy) || 1;
      gx /= gl; gy /= gl;
      var mx = (minX + maxX) / 2, my = (minY + maxY) / 2;
      var rad = Math.max(maxX - minX, maxY - minY) * 0.75 + 1;
      var grad = ctx.createLinearGradient(mx - gx * rad, my - gy * rad, mx + gx * rad, my + gy * rad);
      // Ambient floor keeps a face turned away from the light as a dark, cool
      // version of the metal instead of a hole in the silhouette.
      var sOpts = { light: opts.highlight, shadow: opts.shadow, ambient: 0.34 };
      grad.addColorStop(0, G.shade(opts.base, Math.min(1, lambert + 0.26), sOpts));
      grad.addColorStop(1, G.shade(opts.base, Math.max(0.06, lambert - 0.22), sOpts));
      ctx.fillStyle = grad;
      ctx.fill();

      if (spec > 0.01) {
        ctx.fillStyle = G.rgb(255, 246, 224, Math.min(0.5, spec * 0.6));
        ctx.fill();
      }
      if (rim > 0.02) {
        ctx.strokeStyle = G.rgb(246, 212, 154, Math.min(0.5, rim * 0.55));
        ctx.lineWidth = 1.1;
        ctx.stroke();
      }
      if (opts.edge) {
        ctx.strokeStyle = opts.edge;
        ctx.lineWidth = 0.6;
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  return {
    solids: SOLIDS, drawSolid: drawSolid,
    v3: v3, norm3: norm3, rotatePoint: rotatePoint
  };
})();
