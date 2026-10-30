/* Jelly Match-3 V2.1 · "B" display for the octopus: the existing 2D soft-body sim (6x6, softbody.js) drives a light
 * 3D shell. A denser display grid (N x N) is mapped from the sim grid (Catmull-Rom), and every display vertex gets a real
 * front/back thickness from an authored/derived profile (assets/material/octopus_mat.png R channel: silhouette inflation
 * + authored head ellipsoid — never from PNG luminance). Each frame (B pieces only):
 *   1) 2D position from the sim (+ face kept near-rigid: blended toward the face region's affine fit)
 *   2) depth = thickness × (local area ratio)^-volExp (approximate volume preservation: squash → thicker) × press flattening
 *      at the finger (pressed spot flattens, surroundings bulge via the area term) — composed, clamped, applied once
 *   3) small yaw (≤ maxYaw) from horizontal velocity / drag so a little of the side shows
 *   4) normals recomputed from the deformed 3D grid (front and back surfaces)
 * The lit shader (renderer.js) shades it with one fixed light. All numeric parameters are 待测初值. */
(function () {
  'use strict';
  var JM = window.JM;
  var NG0 = 25;                      // display grid (NG x NG vertices per surface) 待测初值
  var PRM = {
    zScale: 1.0,      // thickness (512-px sprite units) → logical depth multiplier
    backRatio: 0.85,  // back surface depth relative to front
    volExp: 0.6,      // depth ∝ areaRatio^-volExp (1 = exact volume preservation)
    zMin: 0.6, zMax: 1.5,   // clamp of the composed depth factor
    pressFlat: 2.4, pressSigma: 0.3,   // press flattening strength (per fdepth/S) and radius (×S)
    faceRigid: 0.7,   // 0..1 how strongly the face region follows a single affine (limits local face distortion)
    yawVel: 0.025, yawDrag: 0.35, maxYaw: 0.18, yawTau: 70,   // yaw from velocity (rad per S/s), from drag, clamp, smoothing ms
    widenShare: 0.6   // share of pose widening (sx>1) kept on screen; the rest goes to depth via the area term
  };
  var MATCACHE = {}, STATIC = {};
  function matData(type) {
    if (MATCACHE[type]) return MATCACHE[type];
    var m = JM.MAT && JM.MAT[type]; if (!m || !m.matImg || !m.baseImg) return null;
    var c = document.createElement('canvas'); c.width = 512; c.height = 512; var x = c.getContext('2d', { willReadFrequently: true });
    x.drawImage(m.matImg, 0, 0, 512, 512); var mat = x.getImageData(0, 0, 512, 512).data;
    x.clearRect(0, 0, 512, 512); x.drawImage(m.baseImg, 0, 0, 512, 512); var base = x.getImageData(0, 0, 512, 512).data;
    MATCACHE[type] = { mat: mat, base: base, info: m }; return MATCACHE[type];
  }
  function samp(arr, u, v, ch) { // bilinear sample of one channel, u,v in 0..1
    var x = Math.max(0, Math.min(511, u * 512 - 0.5)), y = Math.max(0, Math.min(511, v * 512 - 0.5));
    var x0 = Math.floor(x), y0 = Math.floor(y), x1 = Math.min(511, x0 + 1), y1 = Math.min(511, y0 + 1), fx = x - x0, fy = y - y0;
    var a = arr[(y0 * 512 + x0) * 4 + ch], b = arr[(y0 * 512 + x1) * 4 + ch], c = arr[(y1 * 512 + x0) * 4 + ch], d = arr[(y1 * 512 + x1) * 4 + ch];
    return ((a * (1 - fx) + b * fx) * (1 - fy) + (c * (1 - fx) + d * fx) * fy) / 255;
  }
  function cr(t) { // Catmull-Rom weights for the 4 taps
    var t2 = t * t, t3 = t2 * t;
    return [-0.5 * t3 + t2 - 0.5 * t, 1.5 * t3 - 2.5 * t2 + 1, -1.5 * t3 + 2 * t2 + 0.5 * t, 0.5 * t3 - 0.5 * t2];
  }
  function tapW(i, w, N) { // [[index, weight], ...]
    if (i < 0) return [[0, 2 * w], [1, -w]];
    if (i > N - 1) return [[N - 1, 2 * w], [N - 2, -w]];
    return [[i, w]];
  }
  // v2.2: grid size per quality tier (high 25 = v2.1 unchanged, medium 17, low 13); opt.frontOnly skips the back surface
  function Volume(p, opt) {
    opt = opt || {};
    var NG = opt.ng || NG0, b = p.body, md = matData(p.type); if (!md) throw new Error('no material for ' + p.type);
    var N = JM.Body.N, S = b.S, n = NG * NG;
    this.N = NG; this.n = n; this.S = S; this.type = p.type; this.frontOnly = !!opt.frontOnly; this.fastPow = !!opt.fastPow;
    this.x = new Float32Array(n); this.y = new Float32Array(n); this.zf = new Float32Array(n); this.zb = new Float32Array(n);
    this.xf = new Float32Array(n); this.xb = new Float32Array(n);
    this.nf = new Float32Array(n * 3); this.nb = new Float32Array(n * 3); this.J = new Float32Array(n);
    var u0 = b.u[0], u1 = b.u[N - 1], v0 = b.v[0], v1 = b.v[N * N - 1];
    // v2.2: the rest-shape data (uv, thickness, face mask, Catmull-Rom taps, active quads) depends only on type/size/grid → shared cache
    var key = p.type + '|' + S + '|' + NG + '|' + u0 + '|' + u1 + '|' + v0 + '|' + v1, st = STATIC[key];
    if (!st) {
    st = STATIC[key] = {};
    st.u = new Float32Array(n); st.v = new Float32Array(n); st.th = new Float32Array(n); st.face = new Float32Array(n);
    st.qx = new Float32Array(n); st.qy = new Float32Array(n);
    st.wi = new Int32Array(n * 16); st.ww = new Float32Array(n * 16);
    var hm = md.info.hmax / 512 * S * PRM.zScale;
    for (var j = 0; j < NG; j++) for (var i = 0; i < NG; i++) {
      var k = j * NG + i, s = i / (NG - 1) * (N - 1), t = j / (NG - 1) * (N - 1);
      var u = u0 + (u1 - u0) * i / (NG - 1), v = v0 + (v1 - v0) * j / (NG - 1);
      st.u[k] = u; st.v[k] = v; st.qx[k] = (u - 0.5) * S; st.qy[k] = (v - 0.9) * S;
      st.th[k] = samp(md.mat, u, v, 0) * hm; st.face[k] = samp(md.mat, u, v, 2);
      var si = Math.min(N - 2, Math.floor(s)), ti = Math.min(N - 2, Math.floor(t)), ws = cr(s - si), wt = cr(t - ti), q = 0;
      // taps outside the sim grid are linearly extrapolated (P[-1] = 2P[0] - P[1]) so a regular grid maps exactly
      var tx = [], ty = [];
      for (var a2 = 0; a2 < 4; a2++) tx.push(tapW(si - 1 + a2, ws[a2], N)); for (var b2 = 0; b2 < 4; b2++) ty.push(tapW(ti - 1 + b2, wt[b2], N));
      var acc = {};
      tx.forEach(function (ax) { ty.forEach(function (ay) { ax.forEach(function (px) { ay.forEach(function (py) { var key = py[0] * N + px[0]; acc[key] = (acc[key] || 0) + px[1] * py[1]; }); }); }); });
      var keys = Object.keys(acc); if (keys.length > 16) throw new Error('tap overflow');
      for (q = 0; q < 16; q++) { st.wi[k * 16 + q] = q < keys.length ? +keys[q] : 0; st.ww[k * 16 + q] = q < keys.length ? acc[keys[q]] : 0; }
    }
    // active quads: any visible texel inside (sampled 5x5 on the sprite alpha)
    var idx = [];
    for (j = 0; j < NG - 1; j++) for (i = 0; i < NG - 1; i++) {
      var k0 = j * NG + i, on = false;
      for (var sy = 0; sy <= 4 && !on; sy++) for (var sx = 0; sx <= 4 && !on; sx++) {
        var uu = st.u[k0] + (st.u[k0 + 1] - st.u[k0]) * sx / 4, vv = st.v[k0] + (st.v[k0 + NG] - st.v[k0]) * sy / 4;
        if (samp(md.base, uu, vv, 3) > 0.01) on = true;
      }
      if (on) idx.push(k0, k0 + 1, k0 + NG, k0 + 1, k0 + NG + 1, k0 + NG);
    }
    st.idx = new Uint16Array(idx);
    // rest cell areas (for the area ratio)
    st.restA = ((u1 - u0) * S / (NG - 1)) * ((v1 - v0) * S / (NG - 1));
    }
    this.u = st.u; this.v = st.v; this.th = st.th; this.face = st.face; this.qx = st.qx; this.qy = st.qy; this.wi = st.wi; this.ww = st.ww; this.idx = st.idx; this.restA = st.restA;
    this.yaw = 0; this.lastCx = null; this.zfac = 1; this.minZ = 1; this.maxZ = 1;
  }
  Volume.PRM = PRM; Volume.NG = NG0;
  // B only: keep part of the screen-space widening in depth instead (applied in poseOf, i.e. once, before the sim)
  Volume.shapePose = function (p, pose) {
    var k = PRM.widenShare;
    if (pose.sx > 1) pose.sx = 1 + (pose.sx - 1) * k;
    if (pose.bsx > 1) pose.bsx = 1 + (pose.bsx - 1) * k;
  };
  Volume.prototype.update = function (p, pose, dt) {
    var b = p.body, n = this.n, k;
    // sleeping body (static pose, no deformation): reuse the last full mesh, only follow the breathing scale about the anchor
    if (b.sleeping && this.cache && this.cache.id === b.wakes) {
      var c = this.cache, ax = pose.sx / c.sx, ay = pose.sy / c.sy;
      if (this.frontOnly) for (k = 0; k < n; k++) { this.xf[k] = pose.x + (c.xf[k] - c.x) * ax; this.y[k] = pose.y + (c.y[k] - c.y0) * ay; }
      else for (k = 0; k < n; k++) { this.xf[k] = pose.x + (c.xf[k] - c.x) * ax; this.xb[k] = pose.x + (c.xb[k] - c.x) * ax; this.y[k] = pose.y + (c.y[k] - c.y0) * ay; }
      this.cheap = (this.cheap || 0) + 1; return;
    }
    this.full(p, pose, dt);
    if (b.sleeping) {
      var cc = this.cache || (this.cache = { xf: new Float32Array(n), xb: new Float32Array(n), y: new Float32Array(n) });
      cc.xf.set(this.xf); cc.xb.set(this.xb); cc.y.set(this.y); cc.x = pose.x; cc.y0 = pose.y; cc.sx = pose.sx; cc.sy = pose.sy; cc.id = b.wakes;
    } else if (this.cache) this.cache.id = -1;
  };
  Volume.prototype.full = function (p, pose, dt) {
    var b = p.body, n = this.n, NGv = this.N, k, q, S = this.S, x = this.x, y = this.y;
    // 1) 2D from the sim grid
    for (k = 0; k < n; k++) {
      var ax = 0, ay = 0, o = k * 16;
      for (q = 0; q < 16; q++) { var w = this.ww[o + q], vi = this.wi[o + q]; ax += w * b.px[vi]; ay += w * b.py[vi]; }
      x[k] = ax; y[k] = ay;
    }
    // face region → weighted affine fit from rest (qx,qy) to deformed (x,y); blend toward it
    var fr = PRM.faceRigid;
    if (fr > 0) {
      var sw = 0, mqx = 0, mqy = 0, mpx = 0, mpy = 0;
      for (k = 0; k < n; k++) { var f = this.face[k]; if (f > 0.01) { sw += f; mqx += f * this.qx[k]; mqy += f * this.qy[k]; mpx += f * x[k]; mpy += f * y[k]; } }
      if (sw > 1) {
        mqx /= sw; mqy /= sw; mpx /= sw; mpy /= sw;
        var a11 = 0, a12 = 0, a22 = 0, b11 = 0, b12 = 0, b21 = 0, b22 = 0;
        for (k = 0; k < n; k++) {
          var f2 = this.face[k]; if (f2 <= 0.01) continue;
          var qx = this.qx[k] - mqx, qy = this.qy[k] - mqy, px = x[k] - mpx, py = y[k] - mpy;
          a11 += f2 * qx * qx; a12 += f2 * qx * qy; a22 += f2 * qy * qy; b11 += f2 * px * qx; b12 += f2 * px * qy; b21 += f2 * py * qx; b22 += f2 * py * qy;
        }
        var det = a11 * a22 - a12 * a12;
        if (Math.abs(det) > 1e-6) {
          var i11 = a22 / det, i12 = -a12 / det, i22 = a11 / det;
          var M11 = b11 * i11 + b12 * i12, M12 = b11 * i12 + b12 * i22, M21 = b21 * i11 + b22 * i12, M22 = b21 * i12 + b22 * i22;
          for (k = 0; k < n; k++) {
            var f3 = this.face[k] * fr; if (f3 <= 0.001) continue;
            var qx3 = this.qx[k] - mqx, qy3 = this.qy[k] - mqy;
            x[k] += (M11 * qx3 + M12 * qy3 + mpx - x[k]) * f3; y[k] += (M21 * qx3 + M22 * qy3 + mpy - y[k]) * f3;
          }
        }
      }
    }
    // 2) depth: thickness × area-ratio term × press flattening; composed, clamped once
    var J = this.J; J.fill(0);
    var cnt = this._cnt || (this._cnt = new Float32Array(n)); cnt.fill(0);
    for (var j = 0; j < NGv - 1; j++) for (var i = 0; i < NGv - 1; i++) {
      var k0 = j * NGv + i, k1 = k0 + 1, k2 = k0 + NGv, k3 = k2 + 1;
      var A = 0.5 * Math.abs((x[k3] - x[k0]) * (y[k2] - y[k1]) - (y[k3] - y[k0]) * (x[k2] - x[k1])) / this.restA;
      J[k0] += A; J[k1] += A; J[k2] += A; J[k3] += A; cnt[k0]++; cnt[k1]++; cnt[k2]++; cnt[k3]++;
    }
    var fd = pose.fdepth || 0, ffx = pose.fx || 0, ffy = pose.fy || 0, sig2 = 2 * (PRM.pressSigma * S) * (PRM.pressSigma * S);
    var flat = Math.min(0.5, PRM.pressFlat * fd / S), zmin = 9, zmax = 0;
    for (k = 0; k < n; k++) {
      var jr = J[k] / Math.max(1, cnt[k]);
      var jm = Math.max(0.3, jr), fac = this.fastPow && Math.abs(jm - 1) < 0.004 ? 1 - PRM.volExp * (jm - 1) : Math.pow(jm, -PRM.volExp);   // v2.2 medium/low: linearised near rest
      if (flat > 0.001) { var rx = this.qx[k] - ffx, ry = this.qy[k] - ffy; fac *= 1 - flat * Math.exp(-(rx * rx + ry * ry) / sig2); }
      fac = Math.max(PRM.zMin, Math.min(PRM.zMax, fac));
      if (this.th[k] > 1) { if (fac < zmin) zmin = fac; if (fac > zmax) zmax = fac; }
      this.zf[k] = this.th[k] * fac; this.zb[k] = -this.th[k] * fac * PRM.backRatio;
    }
    this.minZ = zmin; this.maxZ = zmax;
    // 3) small yaw from horizontal motion / drag (about the body's vertical centre line)
    var cx = 0; for (k = 0; k < b.n; k++) cx += b.px[k]; cx /= b.n;
    var vx = this.lastCx == null || dt <= 0 ? 0 : (cx - this.lastCx) / (dt / 1000); this.lastCx = cx;
    var tgt = Math.max(-PRM.maxYaw, Math.min(PRM.maxYaw, vx / S * PRM.yawVel + (pose.dragX || 0) / S * PRM.yawDrag));
    if (dt > 0) this.yaw += (tgt - this.yaw) * (1 - Math.exp(-dt / PRM.yawTau));
    var cs = Math.cos(this.yaw), sn = Math.sin(this.yaw), xf = this.xf, xb = this.xb;
    for (k = 0; k < n; k++) {
      var dx = x[k] - cx, zf = this.zf[k], zb = this.zb[k];
      xf[k] = cx + dx * cs + zf * sn; this.zf[k] = -dx * sn + zf * cs;
      xb[k] = cx + dx * cs + zb * sn; this.zb[k] = -dx * sn + zb * cs;
    }
    // 4) normals from the deformed 3D grids (screen space: x right, y down, z toward the viewer)
    normals(xf, y, this.zf, this.nf, NGv, 1);
    if (!this.frontOnly) normals(xb, y, this.zb, this.nb, NGv, -1);
  };
  function normals(X, Y, Z, out, N, sgn) {
    for (var j = 0; j < N; j++) for (var i = 0; i < N; i++) {
      var k = j * N + i, il = i > 0 ? k - 1 : k, ir = i < N - 1 ? k + 1 : k, ju = j > 0 ? k - N : k, jd = j < N - 1 ? k + N : k;
      var ex = X[ir] - X[il], ey = Y[ir] - Y[il], ez = Z[ir] - Z[il], fx = X[jd] - X[ju], fy = Y[jd] - Y[ju], fz = Z[jd] - Z[ju];
      // e (along +u) × f (along +v): for a flat front this is +z (toward the viewer); the back uses sgn = -1
      var nx = ey * fz - ez * fy, ny = ez * fx - ex * fz, nz = ex * fy - ey * fx;
      nx *= sgn; ny *= sgn; nz *= sgn;
      var l = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1;
      out[k * 3] = nx / l; out[k * 3 + 1] = ny / l; out[k * 3 + 2] = nz / l;
    }
  }
  JM.Volume = Volume;
})();
