/* Jelly Match-3 V2.1 · 2D soft body (v2.1: fixed timestep + interpolation + sleep, see advance()) for each jelly
 * A 6x6 textured mesh per piece. Each vertex is a damped spring towards its scripted pose target
 * (position/squash/rotation from gameplay tweens), plus a shape-matching term (rigid + area-normalised
 * affine blend, Müller et al.) that keeps the body coherent and volume-preserving while it squishes.
 * Pose acceleration is fed back as inertia, so stops/landings make the jelly overshoot and wobble.
 * Lower vertices of tentacled types are softer and heavier, so limbs trail behind the body.
 */
(function () {
  'use strict';
  var JM = window.JM, smooth = JM.smooth;
  var N = 6, NV = N * N;
  // visible alpha bounds of the 512px sprites (asset_manifest.json), x,y,w,h
  var VB = {
    jelly_squid: [80, 31, 353, 430], jelly_fugu: [41, 97, 430, 364], jelly_jellyfish: [41, 35, 430, 426],
    jelly_octopus: [41, 86, 430, 375], jelly_bear: [76, 31, 360, 430], jelly_fig: [66, 31, 380, 430]
  };
  // firmness (k), shape stiffness (ksm), damping, affine share (beta: higher = squishier),
  // limb stiffness factor, inertia (how much pose acceleration shakes the body), extra limb inertia
  var PARAM = {
    jelly_bear: { k: 520, ksm: 430, damp: 6.8, beta: 0.38, limb: 1.0, inertia: 0.030, limbI: 0.0 },
    jelly_fig: { k: 260, ksm: 330, damp: 8.0, beta: 0.65, limb: 1.0, inertia: 0.034, limbI: 0.0 },
    jelly_fugu: { k: 380, ksm: 380, damp: 5.2, beta: 0.45, limb: 1.0, inertia: 0.040, limbI: 0.2 },
    jelly_jellyfish: { k: 150, ksm: 230, damp: 3.1, beta: 0.62, limb: 0.32, inertia: 0.052, limbI: 1.4 },
    jelly_octopus: { k: 290, ksm: 300, damp: 4.4, beta: 0.5, limb: 0.3, inertia: 0.045, limbI: 1.1 },
    jelly_squid: { k: 290, ksm: 290, damp: 4.4, beta: 0.5, limb: 0.28, inertia: 0.045, limbI: 1.2 }
  };
  PARAM.rainbow = PARAM.jelly_bear;
  var IDX = (function () { var a = []; for (var j = 0; j < N - 1; j++) for (var i = 0; i < N - 1; i++) { var k = j * N + i; a.push(k, k + 1, k + N, k + 1, k + N + 1, k + N); } return a; })();

  function Body(type, S, sprite, special) {
    this.type = type; this.sprite = sprite || type; this.S = S; this.n = NV;
    var p = PARAM[type] || PARAM.jelly_bear;
    this.P = { k: p.k, ksm: p.ksm, damp: p.damp, beta: p.beta, inertia: p.inertia };
    if (special) { this.P.damp *= 0.72; this.P.inertia *= 1.35; this.P.beta = Math.min(0.7, p.beta + 0.08); }
    var vb = VB[this.sprite] || VB.jelly_bear, pad = 10;
    var x0 = Math.max(0, vb[0] - pad) / 512, y0 = Math.max(0, vb[1] - pad) / 512, x1 = Math.min(512, vb[0] + vb[2] + pad) / 512, y1 = Math.min(512, vb[1] + vb[3] + pad) / 512;
    this.u = new Float32Array(NV); this.v = new Float32Array(NV); this.qx = new Float32Array(NV); this.qy = new Float32Array(NV);
    this.vn = new Float32Array(NV); this.kmul = new Float32Array(NV); this.imul = new Float32Array(NV);
    this.dx = new Float32Array(NV); this.dy = new Float32Array(NV); this.ux = new Float32Array(NV); this.uy = new Float32Array(NV);
    this.gx = new Float32Array(NV); this.gy = new Float32Array(NV); this.vtx = new Float32Array(NV); this.vty = new Float32Array(NV);
    this.px = new Float32Array(NV); this.py = new Float32Array(NV);
    for (var j = 0; j < N; j++) for (var i = 0; i < N; i++) {
      var k = j * N + i, u = x0 + (x1 - x0) * i / (N - 1), v = y0 + (y1 - y0) * j / (N - 1), vn = j / (N - 1);
      this.u[k] = u; this.v[k] = v; this.vn[k] = vn;
      this.qx[k] = (u - 0.5) * S; this.qy[k] = (v - 0.9) * S;
      this.kmul[k] = 1 - (1 - p.limb) * smooth(0.38, 1, vn);
      this.imul[k] = 1 + p.limbI * smooth(0.38, 1, vn);
    }
    this.fresh = true;
  }
  Body.IDX = IDX; Body.N = N;

  // pose: {x, y (anchor in logical px), sx, sy, rot, dragX, dragY, fx, fy, fdepth[, bsx, bsy = breath-free sx/sy]}
  // writes the scripted target of every vertex for this pose into ox/oy (and the local-frame shape into lxA/lyA)
  Body.prototype.targets = function (pose, ox, oy) {
    var n = this.n, c = Math.cos(pose.rot || 0), s = Math.sin(pose.rot || 0);
    var sx = pose.sx, sy = pose.sy, S = this.S;
    var dgx = pose.dragX || 0, dgy = pose.dragY || 0, dl = Math.sqrt(dgx * dgx + dgy * dgy);
    var fd = pose.fdepth || 0, ffx = pose.fx || 0, ffy = pose.fy || 0, sig2 = 2 * (0.34 * S) * (0.34 * S);
    var lxA = this._lx || (this._lx = new Float32Array(n)), lyA = this._ly || (this._ly = new Float32Array(n));
    for (var k = 0; k < n; k++) {
      var lx = this.qx[k] * sx, ly = this.qy[k] * sy;
      if (dl > 0.01) {
        var qn = Math.sqrt(this.qx[k] * this.qx[k] + (this.qy[k] + 0.42 * S) * (this.qy[k] + 0.42 * S)) + 1e-3;
        var lead = (this.qx[k] * dgx + (this.qy[k] + 0.42 * S) * dgy) / (qn * dl);
        var w = Math.pow(Math.max(0, 0.45 + 0.55 * lead), 1.6);
        lx += dgx * (0.25 + 0.75 * w); ly += dgy * (0.25 + 0.75 * w);
      }
      if (fd > 0.01) {
        var rx = this.qx[k] - ffx, ry = this.qy[k] - ffy, f = Math.exp(-(rx * rx + ry * ry) / sig2);
        var up = smooth(0, 1, 1 - this.vn[k]);
        ly += fd * f * up; lx += rx / S * fd * f * 1.4;
      }
      lxA[k] = lx; lyA[k] = ly;
      ox[k] = pose.x + c * lx - s * ly; oy[k] = pose.y + s * lx + c * ly;
    }
  };
  // one fixed sim step of length h (h is always JM.SIM_H in v2.1; damping exp(-damp*h) is then frame-rate independent)
  Body.prototype.step = function (pose, h, ampK) {
    var P = this.P, n = this.n, k;
    var tx = this._tx || (this._tx = new Float32Array(n)), ty = this._ty || (this._ty = new Float32Array(n));
    this._ax = this._ax || new Float32Array(n); this._ay = this._ay || new Float32Array(n);
    this.targets(pose, tx, ty);
    var lxA = this._lx, lyA = this._ly;
    // 1) scripted targets -> target velocity / acceleration -> inertial pseudo-force
    for (k = 0; k < n; k++) {
      var gx = tx[k], gy = ty[k];
      if (this.fresh) { this.gx[k] = gx; this.gy[k] = gy; this.vtx[k] = 0; this.vty[k] = 0; }
      var vtx = (gx - this.gx[k]) / h, vty = (gy - this.gy[k]) / h;
      var atx = (vtx - this.vtx[k]) / h, aty = (vty - this.vty[k]) / h;
      var am = Math.sqrt(atx * atx + aty * aty), lim = 60000; if (am > lim) { atx *= lim / am; aty *= lim / am; }
      this.gx[k] = gx; this.gy[k] = gy; this.vtx[k] = vtx; this.vty[k] = vty;
      this._ax[k] = -atx * P.inertia * this.imul[k]; this._ay[k] = -aty * P.inertia * this.imul[k];
    }
    this.fresh = false;
    // 2) shape matching on current points vs the (scaled) local rest shape
    var cx = 0, cy = 0, qcx = 0, qcy = 0;
    for (k = 0; k < n; k++) { cx += this.gx[k] + this.dx[k]; cy += this.gy[k] + this.dy[k]; qcx += lxA[k]; qcy += lyA[k]; }
    cx /= n; cy /= n; qcx /= n; qcy /= n;
    var a11 = 0, a12 = 0, a21 = 0, a22 = 0, q11 = 0, q12 = 0, q22 = 0;
    for (k = 0; k < n; k++) {
      var px = this.gx[k] + this.dx[k] - cx, py = this.gy[k] + this.dy[k] - cy, qx = lxA[k] - qcx, qy = lyA[k] - qcy;
      a11 += px * qx; a12 += px * qy; a21 += py * qx; a22 += py * qy; q11 += qx * qx; q12 += qx * qy; q22 += qy * qy;
    }
    var det = q11 * q22 - q12 * q12; if (Math.abs(det) < 1e-6) det = 1e-6;
    var i11 = q22 / det, i12 = -q12 / det, i22 = q11 / det;
    var A11 = a11 * i11 + a12 * i12, A12 = a11 * i12 + a12 * i22, A21 = a21 * i11 + a22 * i12, A22 = a21 * i12 + a22 * i22;
    var dA = A11 * A22 - A12 * A21;
    if (dA > 1e-4) { var f2 = 1 / Math.sqrt(dA); A11 *= f2; A12 *= f2; A21 *= f2; A22 *= f2; } else { A11 = 1; A12 = 0; A21 = 0; A22 = 1; }
    var th = Math.atan2(a21 - a12, a11 + a22), rc = Math.cos(th), rs = Math.sin(th), B = P.beta;
    var M11 = B * A11 + (1 - B) * rc, M12 = B * A12 - (1 - B) * rs, M21 = B * A21 + (1 - B) * rs, M22 = B * A22 + (1 - B) * rc;
    // 3) integrate deformation offsets (semi-implicit Euler, relative damping)
    var damp = Math.exp(-P.damp * h), kk = P.k, ksm = P.ksm, maxD = 0.45 * this.S;
    for (k = 0; k < n; k++) {
      var qx2 = lxA[k] - qcx, qy2 = lyA[k] - qcy;
      var goalx = M11 * qx2 + M12 * qy2 + cx, goaly = M21 * qx2 + M22 * qy2 + cy;
      var pxk = this.gx[k] + this.dx[k], pyk = this.gy[k] + this.dy[k];
      var ax = -kk * this.kmul[k] * this.dx[k] + ksm * (goalx - pxk) + this._ax[k] * ampK;
      var ay = -kk * this.kmul[k] * this.dy[k] + ksm * (goaly - pyk) + this._ay[k] * ampK;
      this.ux[k] = (this.ux[k] + ax * h) * damp; this.uy[k] = (this.uy[k] + ay * h) * damp;
      this.dx[k] += this.ux[k] * h; this.dy[k] += this.uy[k] * h;
      var dm = Math.sqrt(this.dx[k] * this.dx[k] + this.dy[k] * this.dy[k]); if (dm > maxD) { this.dx[k] *= maxD / dm; this.dy[k] *= maxD / dm; }
    }
  };
  // V2 compatibility: positions = targets + current deformation (no interpolation)
  Body.prototype.finish = function () { for (var k = 0; k < this.n; k++) { this.px[k] = this.gx[k] + this.dx[k]; this.py[k] = this.gy[k] + this.dy[k]; } };

  // ---- v2.1: fixed-timestep driver -------------------------------------------------------------------------------
  // One SimClock per game. Each frame: clk.advance(frameSeconds) decides how many fixed H steps run (accumulator,
  // clamped so a long stall / tab resume never fast-forwards), then every body calls body.advance(pose0, pose1, clk).
  var SIM_H = 1 / 120, MAX_LAG = 0.1;
  function SimClock(H, maxLag) { this.H = H || SIM_H; this.maxLag = maxLag || MAX_LAG; this.acc = 0; this.prevAcc = 0; this.steps = 0; this.dt = 0; this.alpha = 0; this.clamped = 0; this.total = 0; }
  SimClock.prototype.advance = function (dt) {
    this.prevAcc = this.acc; this.dt = dt; this.acc += dt;
    if (this.acc > this.maxLag) { this.acc = this.maxLag; this.clamped++; }
    var n = Math.floor(this.acc / this.H + 1e-9); this.acc -= n * this.H; if (this.acc < 0) this.acc = 0;
    this.steps = n; this.alpha = this.acc / this.H; this.total += n; return n;
  };
  // where (0..1 of this frame interval) the end of fixed step i (1..steps) lies
  SimClock.prototype.frac = function (i) { return this.dt > 0 ? Math.max(0, Math.min(1, (i * this.H - this.prevAcc) / this.dt)) : 1; };
  SimClock.prototype.reset = function () { this.acc = 0; this.prevAcc = 0; };
  JM.SimClock = SimClock; JM.SIM_H = SIM_H;

  // v2.2: writes into a reusable scratch object (out) instead of allocating one per sub-step
  function lerpPose(a, b, k, out) {
    if (k >= 1) return b;
    out = out || {};
    out.x = lf(a.x, b.x, k); out.y = lf(a.y, b.y, k); out.sx = lf(a.sx, b.sx, k); out.sy = lf(a.sy, b.sy, k); out.rot = lf(a.rot, b.rot, k);
    out.dragX = lf(a.dragX, b.dragX, k); out.dragY = lf(a.dragY, b.dragY, k); out.fx = b.fx; out.fy = b.fy; out.fdepth = lf(a.fdepth, b.fdepth, k);
    return out;
  }
  function lf(p, q, k) { return (p || 0) + ((q || 0) - (p || 0)) * k; }
  var SCRATCH = {};
  function copyPose(dst, a) { for (var key in a) dst[key] = a[key]; return dst; }
  JM.lerpPose = lerpPose;
  // sleep thresholds (待测初值)
  var SLEEP = { energy: 1.2, maxD: 0.12, quiet: 0.25, eps: 0.02, epsS: 1e-4 };
  JM.SLEEP = SLEEP;
  function poseQuiet(a, b) {
    if (!a || !b) return false;
    var e = SLEEP.eps, es = SLEEP.epsS;
    return Math.abs(a.x - b.x) < e && Math.abs(a.y - b.y) < e && Math.abs((a.rot || 0) - (b.rot || 0)) < 1e-4 &&
      Math.abs((a.bsx != null ? a.bsx : a.sx) - (b.bsx != null ? b.bsx : b.sx)) < es && Math.abs((a.bsy != null ? a.bsy : a.sy) - (b.bsy != null ? b.bsy : b.sy)) < es &&
      Math.abs(a.dragX || 0) + Math.abs(a.dragY || 0) + Math.abs(b.dragX || 0) + Math.abs(b.dragY || 0) < 0.01 &&
      (a.fdepth || 0) < 0.01 && (b.fdepth || 0) < 0.01;
  }
  // advance this body through the fixed steps of the current frame; pose0 = pose at the previous frame, pose1 = now
  Body.prototype.advance = function (pose0, pose1, clk, ampK) {
    var n = this.n, k, steps = clk.steps;
    var ppx = this.ppx || (this.ppx = new Float32Array(n)), ppy = this.ppy || (this.ppy = new Float32Array(n));
    if (this.rigid && !this.fresh) {   // v2.2 (medium/low tiers): flying / exiting piece → no sim steps, deformation decays to rest
      var f = Math.exp(-clk.dt / 0.07);
      for (k = 0; k < n; k++) { this.dx[k] *= f; this.dy[k] *= f; this.ux[k] = 0; this.uy[k] = 0; ppx[k] = this.dx[k]; ppy[k] = this.dy[k]; }
      this.rigidSteps = (this.rigidSteps || 0) + steps; this.lastPose1 = null; this.quietT = 0;
      var rx = this._rx || (this._rx = new Float32Array(n)), ry = this._ry || (this._ry = new Float32Array(n));
      this.targets(pose1, rx, ry);
      for (k = 0; k < n; k++) { this.gx[k] = rx[k]; this.gy[k] = ry[k]; this.vtx[k] = 0; this.vty[k] = 0; this.px[k] = rx[k] + this.dx[k]; this.py[k] = ry[k] + this.dy[k]; }
      return;
    }
    if (this.sleeping && !poseQuiet(this.sleepPose, pose1)) this.wake();
    if (this.fresh) { this.step(pose1, clk.H, ampK); for (k = 0; k < n; k++) { ppx[k] = this.dx[k]; ppy[k] = this.dy[k]; } }
    if (this.sleeping) {
      // asleep: no shape matching / integration; keep target velocity current so waking has correct inertia
      this.sleptSteps = (this.sleptSteps || 0) + steps;
    } else {
      for (var i = 1; i <= steps; i++) {
        if (i === steps) for (k = 0; k < n; k++) { ppx[k] = this.dx[k]; ppy[k] = this.dy[k]; }
        this.step(i === steps ? pose1 : lerpPose(pose0, pose1, clk.frac(i), SCRATCH), clk.H, ampK);
      }
      this.simSteps = (this.simSteps || 0) + steps;
      // sleep check
      if (poseQuiet(this.lastPose1, pose1)) this.quietT = (this.quietT || 0) + clk.dt; else this.quietT = 0;
      if (this.quietT > SLEEP.quiet && this.canSleep !== false && this.energy() < SLEEP.energy && this.maxDef() < SLEEP.maxD) {
        this.sleeping = true; this.sleepPose = copyPose(this.sleepPose || {}, pose1);   // v2.2: pose objects are recycled by the caller
        for (k = 0; k < n; k++) { this.dx[k] = this.dy[k] = this.ux[k] = this.uy[k] = 0; ppx[k] = ppy[k] = 0; }
      }
    }
    this.lastPose1 = pose1;
    // render state: exact targets for the current frame pose + deformation interpolated between the last two steps
    var tx = this._rx || (this._rx = new Float32Array(n)), ty = this._ry || (this._ry = new Float32Array(n));
    this.targets(pose1, tx, ty);
    if (this.sleeping) {
      for (k = 0; k < n; k++) { this.gx[k] = tx[k]; this.gy[k] = ty[k]; this.vtx[k] = 0; this.vty[k] = 0; }   // pose is static while asleep
    }
    var a = clk.alpha;
    for (k = 0; k < n; k++) { this.px[k] = tx[k] + ppx[k] + (this.dx[k] - ppx[k]) * a; this.py[k] = ty[k] + ppy[k] + (this.dy[k] - ppy[k]) * a; }
  };
  Body.prototype.wake = function () { if (this.sleeping) { this.sleeping = false; this.quietT = 0; this.wakes = (this.wakes || 0) + 1; } };
  Body.prototype.maxDef = function () { var m = 0; for (var k = 0; k < this.n; k++) { var d = Math.abs(this.dx[k]) + Math.abs(this.dy[k]); if (d > m) m = d; } return m; };
  // velocity impulses (logical px / s). mode: 'top' (sway), 'all', 'limbs'
  Body.prototype.kick = function (vx, vy, mode) {
    this.wake();
    for (var k = 0; k < this.n; k++) {
      var w = mode === 'all' ? 1 : mode === 'limbs' ? smooth(0.3, 1, this.vn[k]) : (0.25 + 0.75 * (1 - this.vn[k]));
      this.ux[k] += vx * w; this.uy[k] += vy * w;
    }
  };
  Body.prototype.land = function (str) { // top keeps falling, bottom stops, middle bulges outward
    this.wake();
    for (var k = 0; k < this.n; k++) {
      var t = 1 - this.vn[k];
      this.uy[k] += str * t * t;
      this.ux[k] += (this.qx[k] / this.S) * str * 1.1 * Math.sin(Math.PI * this.vn[k]);
    }
  };
  Body.prototype.radial = function (str) { // puff / squeeze from the body centre
    this.wake();
    for (var k = 0; k < this.n; k++) { this.ux[k] += this.qx[k] / this.S * str; this.uy[k] += (this.qy[k] + 0.42 * this.S) / this.S * str; }
  };
  Body.prototype.energy = function () { var e = 0; for (var k = 0; k < this.n; k++) e += Math.abs(this.ux[k]) + Math.abs(this.uy[k]); return e / this.n; };
  JM.Body = Body;
})();
