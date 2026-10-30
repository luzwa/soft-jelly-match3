/* Jelly Match-3 V2 · core: math, easing, presentation clock/tweens, synth audio, haptics */
(function () {
  'use strict';
  var JM = window.JM = window.JM || {};
  var CFG = window.JELLY_CONFIG;

  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function rnd(a, b) { return a + Math.random() * (b - a); }
  function smooth(a, b, x) { var t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); }
  function bezier(x1, y1, x2, y2) {
    function cx(t) { var u = 1 - t; return 3 * u * u * t * x1 + 3 * u * t * t * x2 + t * t * t; }
    function cy(t) { var u = 1 - t; return 3 * u * u * t * y1 + 3 * u * t * t * y2 + t * t * t; }
    function dx(t) { var u = 1 - t; return 3 * u * u * x1 + 6 * u * t * (x2 - x1) + 3 * t * t * (1 - x2); }
    return function (x) {
      if (x <= 0) return 0; if (x >= 1) return 1;
      var t = x, i;
      for (i = 0; i < 6; i++) { var d = dx(t); if (Math.abs(d) < 1e-6) break; var e = cx(t) - x; t -= e / d; if (Math.abs(e) < 1e-5) break; }
      if (t < 0 || t > 1 || Math.abs(cx(t) - x) > 1e-3) { var lo = 0, hi = 1; t = x; for (i = 0; i < 24; i++) { if (cx(t) < x) lo = t; else hi = t; t = (lo + hi) / 2; } }
      return cy(t);
    };
  }
  var C = CFG.motion.curves;
  var E = {
    lin: function (t) { return t; },
    smooth: bezier.apply(null, C.smooth_departure_arrival.control_points),
    soft: bezier.apply(null, C.soft_recovery.control_points),
    fall: bezier(0.42, 0, 0.9, 0.68),
    outBack: function (t) { var s = 1.9; t -= 1; return t * t * ((s + 1) * t + s) + 1; },
    elastic: function (t) { if (t <= 0 || t >= 1) return t; return Math.pow(2, -9 * t) * Math.sin((t - 0.075) * (2 * Math.PI) / 0.3) + 1; }
  };
  var LK = C.landing_damped.keyframes;
  function landingAt(t) {
    for (var i = 0; i < LK.length - 1; i++) {
      var a = LK[i], b = LK[i + 1];
      if (t <= b.t) { var u = smooth(0, 1, (t - a.t) / (b.t - a.t)); return { w: lerp(a.scale.width, b.scale.width, u), h: lerp(a.scale.height, b.scale.height, u) }; }
    }
    return { w: 1, h: 1 };
  }

  // ---- presentation clock + tweens (cleared on reset; old promises simply never resolve)
  var Clock = { now: 0, tweens: [] };
  Clock.tween = function (dur, update, ease) {
    ease = ease || E.lin;
    return new Promise(function (res) { Clock.tweens.push({ t0: Clock.now, dur: Math.max(1, dur), update: update, ease: ease, res: res }); update(0, 0); });
  };
  Clock.wait = function (ms) { return Clock.tween(ms, function () { }); };
  Clock.step = function () {
    var list = Clock.tweens.slice();
    for (var i = 0; i < list.length; i++) {
      var tw = list[i], t = clamp((Clock.now - tw.t0) / tw.dur, 0, 1);
      tw.update(tw.ease(t), t);
      if (t >= 1) { var k = Clock.tweens.indexOf(tw); if (k >= 0) Clock.tweens.splice(k, 1); tw.res(); }
    }
  };
  Clock.reset = function () { Clock.tweens = []; };

  // ---- haptics
  var Haptic = { on: true, buzz: function (p) { if (!this.on) return; try { if (navigator.vibrate) navigator.vibrate(p); } catch (e) { } } };

  // ---- synthesized squishy audio
  var EF = CFG.effects.audio;
  var PENTA = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21, 24];
  var TYPE_PITCH = { jelly_squid: 1.12, jelly_fugu: 1.0, jelly_jellyfish: 1.3, jelly_octopus: 0.9, jelly_bear: 0.8, jelly_fig: 0.7, rainbow: 1.2 };
  var Sound = {
    ac: null, out: null, fx: null, muted: false, last: {}, voices: [], noise: null,
    unlock: function () {
      try {
        if (!this.ac) {
          var AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
          var ac = this.ac = new AC();
          this.out = ac.createGain(); this.out.gain.value = EF.global_gain_default * 1.1;
          var comp = ac.createDynamicsCompressor(); comp.threshold.value = -14; comp.ratio.value = 4;
          this.out.connect(comp); comp.connect(ac.destination);
          // echo send for chimes / sparkle
          this.fx = ac.createGain(); this.fx.gain.value = 0.35;
          var d = ac.createDelay(0.5); d.delayTime.value = 0.13; var fb = ac.createGain(); fb.gain.value = 0.28;
          var lp = ac.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 3200;
          this.fx.connect(d); d.connect(lp); lp.connect(fb); fb.connect(d); lp.connect(this.out);
          var len = Math.floor(ac.sampleRate * 0.6), buf = ac.createBuffer(1, len, ac.sampleRate), ch = buf.getChannelData(0);
          for (var i = 0; i < len; i++) ch[i] = Math.random() * 2 - 1;
          this.noise = buf;
        }
        if (this.ac.state === 'suspended') this.ac.resume();
      } catch (e) { this.ac = null; }
    },
    ok: function (id, gap, prio) {
      if (this.muted || !this.ac || this.ac.state !== 'running') return false;
      var ms = performance.now();
      if (gap && this.last[id] && ms - this.last[id] < gap) return false;
      var t = this.ac.currentTime; this.voices = this.voices.filter(function (v) { return v.end > t; });
      if (this.voices.length >= 8) { var low = this.voices.reduce(function (a, b) { return a.prio < b.prio ? a : b; }); if (low.prio >= prio) return false; }
      this.last[id] = ms; return true;
    },
    reg: function (len, prio) { this.voices.push({ end: this.ac.currentTime + len, prio: prio }); },
    env: function (g, t0, peak, a, dur) { g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(peak, t0 + a); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur); },
    // pitch-bent oscillator: points = [[time, freq], ...]
    osc: function (t0, type, pts, dur, gain, o) {
      var ac = this.ac, os = ac.createOscillator(), g = ac.createGain(); o = o || {};
      os.type = type; os.frequency.setValueAtTime(pts[0][1], t0);
      for (var i = 1; i < pts.length; i++) os.frequency.exponentialRampToValueAtTime(Math.max(30, pts[i][1]), t0 + pts[i][0]);
      if (o.vib) { var l = ac.createOscillator(), lg = ac.createGain(); l.frequency.value = o.vib; lg.gain.setValueAtTime(pts[0][1] * (o.vibAmt || 0.05), t0); lg.gain.exponentialRampToValueAtTime(0.5, t0 + dur); l.connect(lg); lg.connect(os.frequency); l.start(t0); l.stop(t0 + dur + 0.05); }
      this.env(g, t0, gain, o.a || 0.005, dur);
      var n = os;
      if (o.lp) { var f = ac.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = o.lp; f.Q.value = o.q || 0.7; os.connect(f); n = f; }
      n.connect(g); g.connect(this.out); if (o.send) { var s = ac.createGain(); s.gain.value = o.send; g.connect(s); s.connect(this.fx); }
      os.start(t0); os.stop(t0 + dur + 0.05);
    },
    nz: function (t0, dur, f0, f1, gain, type, q) {
      var ac = this.ac, s = ac.createBufferSource(), f = ac.createBiquadFilter(), g = ac.createGain();
      s.buffer = this.noise; f.type = type || 'bandpass'; f.Q.value = q || 1.4;
      f.frequency.setValueAtTime(f0, t0); f.frequency.exponentialRampToValueAtTime(Math.max(40, f1), t0 + dur);
      this.env(g, t0, gain, 0.003, dur);
      s.connect(f); f.connect(g); g.connect(this.out); s.start(t0, Math.random() * 0.3); s.stop(t0 + dur + 0.02);
    },
    T: function () { return this.ac.currentTime + 0.004; },
    // ----- events
    press: function (type) { if (!this.ok('press', 60, 1)) return; var t = this.T(), p = TYPE_PITCH[type] || 1;
      this.nz(t, 0.06, 1400 * p, 380, 0.16, 'lowpass', 1); this.osc(t, 'sine', [[0, 260 * p], [0.06, 170 * p]], 0.08, 0.18, { lp: 1200 }); this.reg(0.08, 1); },
    boing: function (type, big) { if (!this.ok('boing', 70, 2)) return; var t = this.T(), p = TYPE_PITCH[type] || 1, f = 300 * p;
      this.osc(t, 'sine', [[0, f * 0.7], [0.05, f * 1.55], [0.22, f * 0.9]], 0.3, big ? 0.3 : 0.22, { vib: 17, vibAmt: 0.07, lp: 2600 });
      this.osc(t, 'triangle', [[0, f * 1.4], [0.06, f * 3.1], [0.2, f * 1.8]], 0.2, 0.05, { lp: 3500 }); this.reg(0.3, 2); },
    puff: function () { if (!this.ok('puff', 100, 2)) return; var t = this.T();
      this.nz(t, 0.16, 300, 2400, 0.16, 'bandpass', 2); this.osc(t, 'sine', [[0, 220], [0.14, 520], [0.3, 470]], 0.32, 0.2, { vib: 9 }); this.reg(0.3, 2); },
    swap: function () { if (!this.ok('swap', 70, 3)) return; var t = this.T();
      this.nz(t, 0.11, 700, 2400, 0.12, 'bandpass', 2.5); this.osc(t + 0.07, 'sine', [[0, 380], [0.03, 620], [0.1, 480]], 0.12, 0.2, { lp: 2500 }); this.reg(0.18, 3); },
    ret: function () { if (!this.ok('ret', 100, 1)) return; var t = this.T();
      this.osc(t, 'sine', [[0, 240], [0.06, 330], [0.14, 200]], 0.16, 0.18, { vib: 14 }); this.osc(t + 0.13, 'sine', [[0, 200], [0.05, 270], [0.12, 170]], 0.14, 0.12, { vib: 14 }); this.reg(0.3, 1); },
    pop: function (type, chain, size) { if (!this.ok('pop', 40, 4)) return; var t = this.T(), p = (TYPE_PITCH[type] || 1) * Math.min(1.4, 1 + 0.05 * (chain - 1)), big = Math.min(1, (size || 3) / 8);
      this.nz(t, 0.05, 3400 * p, 700, 0.22 + 0.1 * big, 'bandpass', 1.8);                    // wet click
      this.osc(t, 'sine', [[0, 880 * p], [0.07, 210 * p]], 0.11, 0.3, { lp: 3000 });          // pop body
      this.nz(t + 0.02, 0.16 + 0.1 * big, 900, 160, 0.14 + 0.12 * big, 'lowpass', 0.8);      // squelch/splat
      this.osc(t + 0.015, 'triangle', [[0, 520 * p], [0.05, 760 * p], [0.18, 420 * p]], 0.2, 0.08, { vib: 21 }); this.reg(0.28, 4); },
    chime: function (chain) { if (!this.ok('chime', 60, 4)) return; var t = this.T(), n = PENTA[Math.min(PENTA.length - 1, chain - 1)], f = 523.25 * Math.pow(2, n / 12);
      this.osc(t, 'triangle', [[0, f], [0.3, f]], 0.42, 0.2, { send: 0.9, a: 0.004 }); this.osc(t, 'sine', [[0, f * 2], [0.2, f * 2]], 0.25, 0.08, { send: 0.6 });
      if (chain >= 3) this.osc(t + 0.07, 'triangle', [[0, f * 1.5], [0.25, f * 1.5]], 0.3, 0.1, { send: 0.9 }); this.reg(0.45, 4); },
    land: function () { if (!this.ok('land', EF.group_landing_window_ms, 1)) return; var t = this.T();
      this.osc(t, 'sine', [[0, 170], [0.05, 95], [0.11, 120]], 0.13, 0.2, { lp: 700 }); this.nz(t, 0.04, 600, 200, 0.06, 'lowpass'); this.reg(0.13, 1); },
    stripe: function () { if (!this.ok('stripe', 80, 5)) return; var t = this.T();
      this.osc(t, 'sawtooth', [[0, 220], [0.22, 1600]], 0.3, 0.12, { lp: 2400, q: 6 }); this.nz(t, 0.28, 800, 5000, 0.12, 'bandpass', 3);
      this.osc(t, 'sine', [[0, 660], [0.25, 1320]], 0.3, 0.1, { send: 0.6 }); this.reg(0.32, 5); },
    bomb: function () { if (!this.ok('bomb', 90, 6)) return; var t = this.T();
      this.osc(t, 'sine', [[0, 140], [0.35, 38]], 0.5, 0.55, {}); this.nz(t, 0.45, 1600, 90, 0.4, 'lowpass', 0.7);
      this.osc(t + 0.05, 'sine', [[0, 180], [0.08, 320], [0.35, 150]], 0.4, 0.16, { vib: 11, vibAmt: 0.1 }); this.reg(0.55, 6); },
    zap: function (i) { if (!this.ok('zap', 28, 3)) return; var t = this.T(), f = 900 + (i % 8) * 110;
      this.osc(t, 'square', [[0, f], [0.06, f * 1.5]], 0.07, 0.04, { lp: 3500, send: 0.5 }); this.reg(0.08, 3); },
    rainbow: function () { if (!this.ok('rainbow', 120, 6)) return; var t = this.T(), self = this;
      [0, 4, 7, 12, 16, 19, 24].forEach(function (n, i) { self.osc(t + i * 0.045, 'triangle', [[0, 659 * Math.pow(2, n / 12)], [0.2, 659 * Math.pow(2, n / 12)]], 0.22, 0.1, { send: 0.9 }); });
      this.nz(t, 0.5, 4000, 9000, 0.05, 'highpass'); this.reg(0.6, 6); },
    create: function () { if (!this.ok('create', 120, 5)) return; var t = this.T();
      this.osc(t, 'sine', [[0, 300], [0.12, 900]], 0.16, 0.2, { vib: 12 }); this.osc(t + 0.1, 'triangle', [[0, 1318], [0.3, 1318]], 0.34, 0.12, { send: 0.9 }); this.reg(0.45, 5); },
    goal: function () { if (!this.ok('goal', 150, 5)) return; var t = this.T(); this.osc(t, 'sine', [[0, 988], [0.1, 988]], 0.12, 0.25, { send: 0.5 }); this.osc(t + 0.08, 'sine', [[0, 1480], [0.15, 1480]], 0.18, 0.22, { send: 0.6 }); this.reg(0.25, 5); },
    win: function () { if (!this.ok('win', 500, 7)) return; var t = this.T(), self = this;
      [523, 659, 784, 1047, 1319].forEach(function (f, i) { self.osc(t + i * 0.09, 'triangle', [[0, f], [0.3, f]], 0.38, 0.2, { send: 0.7, a: 0.01 }); }); this.reg(0.9, 7); },
    lose: function () { if (!this.ok('lose', 500, 7)) return; var t = this.T();
      this.osc(t, 'sine', [[0, 523], [0.18, 515]], 0.2, 0.22, { a: 0.01 }); this.osc(t + 0.17, 'sine', [[0, 440], [0.3, 392]], 0.34, 0.2, { a: 0.01, vib: 6 }); this.reg(0.5, 7); },
    thud: function (hard) { if (!this.ok('thud', 70, 4)) return; var t = this.T();   // v3: cookie crate hit (placeholder sfx)
      this.osc(t, 'sine', [[0, hard ? 210 : 170], [0.09, 80]], 0.14, hard ? 0.5 : 0.38, {}); this.nz(t, 0.08, 1800, 600, hard ? 0.22 : 0.14, 'bandpass', 1.2); this.reg(0.15, 4); },
    peel: function (last) { if (!this.ok('peel', 60, 3)) return; var t = this.T();      // v3: frosting layer removed (placeholder sfx)
      this.nz(t, last ? 0.16 : 0.1, 5200, 2200, last ? 0.16 : 0.1, 'bandpass', 2.5); this.osc(t, 'sine', [[0, last ? 880 : 660], [0.08, last ? 1320 : 880]], 0.1, 0.12, { send: 0.3 }); this.reg(0.16, 3); },
    ui: function () { if (!this.ok('ui', 50, 1)) return; var t = this.T(); this.osc(t, 'sine', [[0, 600], [0.05, 820]], 0.07, 0.12, {}); this.reg(0.07, 1); }
  };

  JM.clamp = clamp; JM.lerp = lerp; JM.rnd = rnd; JM.smooth = smooth; JM.E = E; JM.landingAt = landingAt;
  JM.Clock = Clock; JM.Sound = Sound; JM.Haptic = Haptic; JM.DEG = Math.PI / 180;
})();
