/* PLACEHOLDER obstacle art (procedural canvas drawing) — 糖霜地垫 frosting_pad (1–2 layers), 饼干箱 cookie_crate (1–3 HP);
 * stage B: 软糖绑带 gummy_tie, 送达果篮 delivery_basket, 出口 exit (all PLACEHOLDER).
 * No approved art exists yet: these are clean placeholders in the cream/pastel board style, shared by the game and the editor.
 * Layers / HP are told apart by STRUCTURE (stacked slab edge; ribbons / lid / cracks), not only by colour.
 */
(function (root) {
  'use strict';
  function rr(x, X, Y, w, h, r) { x.beginPath(); x.moveTo(X + r, Y); x.arcTo(X + w, Y, X + w, Y + h, r); x.arcTo(X + w, Y + h, X, Y + h, r); x.arcTo(X, Y + h, X, Y, r); x.arcTo(X, Y, X + w, Y, r); x.closePath(); }
  function scallop(x, X, Y, w, h, r, n) {   // rounded slab whose bottom edge has n soft drips
    x.beginPath(); x.moveTo(X + r, Y); x.arcTo(X + w, Y, X + w, Y + h, r);
    x.lineTo(X + w, Y + h - r * 0.6);
    for (var i = n; i > 0; i--) { var x1 = X + w * (i - 1) / n, xm = X + w * (i - 0.5) / n; x.quadraticCurveTo(xm + w / n * 0.25, Y + h + h * 0.07, xm, Y + h + h * (i % 2 ? 0.05 : 0.02)); x.quadraticCurveTo(xm - w / n * 0.25, Y + h - h * 0.03, x1, Y + h - h * 0.02); }
    x.lineTo(X, Y + r); x.arcTo(X, Y, X + w, Y, r); x.closePath();
  }
  // frosting slab under the jelly. x,y = cell top-left, s = cell size, layers 1|2, k = hit pulse 0..1, a = alpha
  function frosting(x, X, Y, s, layers, k, a) {
    if (a <= 0) return;
    x.save(); x.globalAlpha = a;
    var sh = 1 - 0.06 * (k || 0), w = s * 0.94 * sh, h = s * 0.94 * sh, ox = X + (s - w) / 2, oy = Y + (s - h) / 2, r = s * 0.24;
    if (layers >= 2) {   // lower tier: thicker, visible pink edge below the top tier
      x.fillStyle = 'rgba(214,150,160,0.55)'; rr(x, ox, oy + s * 0.05, w, h, r); x.fill();
      var g0 = x.createLinearGradient(0, oy, 0, oy + h); g0.addColorStop(0, '#ffd9df'); g0.addColorStop(1, '#f6b8c4');
      x.fillStyle = g0; rr(x, ox, oy, w, h - s * 0.02, r); x.fill();
      x.strokeStyle = 'rgba(190,110,128,0.55)'; x.lineWidth = Math.max(1, s * 0.022); x.stroke();
      // top tier: inset cream icing with drips
      var ix = ox + s * 0.1, iy = oy + s * 0.08, iw = w - s * 0.2, ih = h - s * 0.24;
      var g1 = x.createLinearGradient(0, iy, 0, iy + ih); g1.addColorStop(0, '#fffaf2'); g1.addColorStop(1, '#ffe7ea');
      x.fillStyle = g1; scallop(x, ix, iy, iw, ih, r * 0.7, 5); x.fill();
      x.strokeStyle = 'rgba(220,150,165,0.6)'; x.lineWidth = Math.max(1, s * 0.016); x.stroke();
    } else {             // single thin tier
      var g2 = x.createLinearGradient(0, oy, 0, oy + h); g2.addColorStop(0, '#fff6f2'); g2.addColorStop(1, '#ffe2e7');
      x.fillStyle = 'rgba(214,150,160,0.35)'; rr(x, ox, oy + s * 0.025, w, h, r); x.fill();
      x.fillStyle = g2; scallop(x, ox, oy, w, h - s * 0.05, r, 6); x.fill();
      x.strokeStyle = 'rgba(220,150,165,0.55)'; x.lineWidth = Math.max(1, s * 0.016); x.stroke();
    }
    // sprinkles (fixed pattern)
    var sp = [[0.22, 0.2, '#9fd3c7'], [0.74, 0.24, '#f7c66b'], [0.18, 0.72, '#b7a6f2'], [0.8, 0.7, '#9fd3c7'], [0.5, 0.14, '#ff9fb2']];
    x.lineCap = 'round'; x.lineWidth = Math.max(1.2, s * 0.03);
    for (var i = 0; i < sp.length; i++) { var q = sp[i], px = X + s * q[0], py = Y + s * q[1]; x.strokeStyle = q[2]; x.beginPath(); x.moveTo(px - s * 0.025, py - s * 0.01); x.lineTo(px + s * 0.025, py + s * 0.01); x.stroke(); }
    x.restore();
  }
  // cookie box occupying the cell. hp 1..3; k = hit squash 0..1
  function crate(x, X, Y, s, hp, k, a) {
    if (a <= 0) return;
    x.save(); x.globalAlpha = a == null ? 1 : a;
    var sq = k || 0, w = s * 0.86 * (1 + 0.06 * sq), h = s * 0.82 * (1 - 0.1 * sq), cx = X + s / 2, by = Y + s * 0.93;
    var ox = cx - w / 2, oy = by - h, r = s * 0.16;
    x.fillStyle = 'rgba(90,70,40,0.22)'; rr(x, ox + s * 0.02, oy + s * 0.05, w, h, r); x.fill();          // contact shadow
    var g = x.createLinearGradient(0, oy, 0, by); g.addColorStop(0, '#f3d29b'); g.addColorStop(1, '#d9a764');
    x.fillStyle = g; rr(x, ox, oy, w, h, r); x.fill();
    x.strokeStyle = '#a8743c'; x.lineWidth = Math.max(1.2, s * 0.03); x.stroke();
    // inner biscuit panel with docking holes
    var px = ox + w * 0.14, py = oy + h * 0.2, pw = w * 0.72, ph = h * 0.66;
    x.fillStyle = 'rgba(255,240,205,0.55)'; rr(x, px, py, pw, ph, r * 0.6); x.fill();
    x.fillStyle = 'rgba(150,100,50,0.45)';
    for (var i = 0; i < 3; i++) for (var j = 0; j < 2; j++) { x.beginPath(); x.arc(px + pw * (0.22 + 0.28 * i), py + ph * (0.32 + 0.38 * j), s * 0.022, 0, 6.3); x.fill(); }
    if (hp >= 3) {   // lid band across the top + two ribbons
      x.fillStyle = '#c98d4b'; rr(x, ox - s * 0.01, oy - s * 0.01, w + s * 0.02, h * 0.2, r * 0.8); x.fill();
      x.fillStyle = '#ff9fb2'; x.fillRect(cx - w * 0.3 - s * 0.03, oy, s * 0.06, h); x.fillRect(cx + w * 0.3 - s * 0.03, oy, s * 0.06, h);
      x.strokeStyle = 'rgba(180,80,100,0.6)'; x.lineWidth = 1; x.strokeRect(cx - w * 0.3 - s * 0.03, oy, s * 0.06, h); x.strokeRect(cx + w * 0.3 - s * 0.03, oy, s * 0.06, h);
    } else if (hp === 2) {   // lid band + one ribbon + a small crack
      x.fillStyle = '#c98d4b'; rr(x, ox - s * 0.01, oy - s * 0.01, w + s * 0.02, h * 0.2, r * 0.8); x.fill();
      x.fillStyle = '#ff9fb2'; x.fillRect(cx - s * 0.03, oy, s * 0.06, h);
      x.strokeStyle = 'rgba(180,80,100,0.6)'; x.lineWidth = 1; x.strokeRect(cx - s * 0.03, oy, s * 0.06, h);
      crack(x, ox + w * 0.78, oy + h * 0.25, s, 0.6);
    } else {   // no lid, no ribbon, cracked + chipped corner
      crack(x, ox + w * 0.3, oy + h * 0.1, s, 1); crack(x, ox + w * 0.75, oy + h * 0.55, s, 0.8);
      x.fillStyle = '#f4eedc'; x.beginPath(); x.moveTo(ox + w, oy + h * 0.18); x.lineTo(ox + w - w * 0.2, oy - 1); x.lineTo(ox + w + 1, oy - 1); x.closePath(); x.fill();
      x.strokeStyle = '#a8743c'; x.lineWidth = Math.max(1, s * 0.02); x.beginPath(); x.moveTo(ox + w, oy + h * 0.18); x.lineTo(ox + w - w * 0.2, oy); x.stroke();
    }
    x.restore();
  }
  function crack(x, X, Y, s, k) {
    x.strokeStyle = 'rgba(110,70,30,0.85)'; x.lineWidth = Math.max(1, s * 0.022); x.lineJoin = 'round';
    x.beginPath(); x.moveTo(X, Y); x.lineTo(X - s * 0.06 * k, Y + s * 0.1 * k); x.lineTo(X + s * 0.03 * k, Y + s * 0.18 * k); x.lineTo(X - s * 0.04 * k, Y + s * 0.3 * k); x.stroke();
  }
  // internal spawner marker (small chevron at the top edge of the cell)
  function spawner(x, X, Y, s, a) {
    x.save(); x.globalAlpha = a == null ? 0.8 : a; x.fillStyle = '#8cc58a'; x.strokeStyle = '#4f7f4c'; x.lineWidth = Math.max(1, s * 0.02);
    x.beginPath(); x.moveTo(X + s * 0.36, Y + s * 0.02); x.lineTo(X + s * 0.64, Y + s * 0.02); x.lineTo(X + s * 0.5, Y + s * 0.15); x.closePath(); x.fill(); x.stroke();
    x.restore();
  }
  // ---- stage B placeholders ------------------------------------------------------------------------------------------
  // gummy tie (软糖绑带) drawn OVER the host jelly: two translucent gummy straps crossing + a knot. Reads as "tied down"
  // by shape (X-cross of straps + knot), not only colour. k = release progress 0..1 (straps snap outward + fade), a = alpha
  function tie(x, X, Y, s, k, a) {
    a = a == null ? 1 : a; k = k || 0; if (a <= 0) return;
    x.save(); x.globalAlpha = a * (1 - k);
    var cx = X + s / 2, cy = Y + s / 2, L = s * 0.52 * (1 + 0.5 * k), w = s * 0.15, sp = s * 0.16 * k;
    function strap(ang, off) {
      x.save(); x.translate(cx + Math.cos(ang + 1.57) * off, cy + Math.sin(ang + 1.57) * off); x.rotate(ang);
      x.fillStyle = 'rgba(122,206,170,0.78)'; rr(x, -L, -w / 2, 2 * L, w, w * 0.45); x.fill();
      x.strokeStyle = 'rgba(46,128,98,0.95)'; x.lineWidth = Math.max(1.2, s * 0.026); x.stroke();
      x.strokeStyle = 'rgba(255,255,255,0.65)'; x.lineWidth = Math.max(1, s * 0.018); x.beginPath(); x.moveTo(-L * 0.85, -w * 0.18); x.lineTo(L * 0.85, -w * 0.18); x.stroke();
      // gummy stitch dots → structural cue at small sizes
      x.fillStyle = 'rgba(46,128,98,0.7)'; for (var i = -2; i <= 2; i++) { if (!i) continue; x.beginPath(); x.arc(i * L * 0.33, w * 0.16, s * 0.016, 0, 6.3); x.fill(); }
      x.restore();
    }
    strap(0.785, -sp); strap(-0.785, sp);
    if (k < 0.5) {   // knot
      var kr = s * 0.12 * (1 - k);
      x.fillStyle = '#ff9fb2'; x.beginPath(); x.ellipse(cx - kr * 0.9, cy, kr, kr * 0.7, -0.5, 0, 6.3); x.ellipse(cx + kr * 0.9, cy, kr, kr * 0.7, 0.5, 0, 6.3); x.fill();
      x.strokeStyle = '#c45d77'; x.lineWidth = Math.max(1, s * 0.022); x.stroke();
      x.fillStyle = '#ffd1db'; x.beginPath(); x.arc(cx, cy, kr * 0.55, 0, 6.3); x.fill(); x.stroke();
    }
    x.restore();
  }
  // delivery basket (送达果篮): woven basket + handle + pink cloth; deliberately NOT jelly-shaped. sq = landing squash, a = alpha
  function basket(x, X, Y, s, sq, a) {
    a = a == null ? 1 : a; if (a <= 0) return; sq = sq || 0;
    x.save(); x.globalAlpha = a;
    var cx = X + s / 2, by = Y + s * 0.92, w = s * 0.78 * (1 + 0.08 * sq), h = s * 0.46 * (1 - 0.12 * sq), oy = by - h;
    x.fillStyle = 'rgba(90,70,40,0.2)'; x.beginPath(); x.ellipse(cx, by + s * 0.01, w * 0.5, s * 0.06, 0, 0, 6.3); x.fill();
    // handle
    x.strokeStyle = '#a8743c'; x.lineWidth = Math.max(2, s * 0.06); x.lineCap = 'round';
    x.beginPath(); x.ellipse(cx, oy + s * 0.02, w * 0.36, s * 0.3 * (1 - 0.12 * sq), 0, Math.PI, 2 * Math.PI); x.stroke();
    x.strokeStyle = '#e8bf7f'; x.lineWidth = Math.max(1, s * 0.024); x.stroke();
    // cloth peeking out
    x.fillStyle = '#ffb3c4'; x.beginPath(); x.moveTo(cx - w * 0.44, oy + s * 0.02); x.quadraticCurveTo(cx - w * 0.2, oy - s * 0.12, cx, oy - s * 0.02); x.quadraticCurveTo(cx + w * 0.22, oy - s * 0.13, cx + w * 0.44, oy + s * 0.02); x.closePath(); x.fill();
    x.strokeStyle = '#d76f8b'; x.lineWidth = Math.max(1, s * 0.018); x.stroke();
    // body (trapezoid) with weave
    x.beginPath(); x.moveTo(cx - w / 2, oy); x.lineTo(cx + w / 2, oy); x.lineTo(cx + w * 0.38, by); x.lineTo(cx - w * 0.38, by); x.closePath();
    var g = x.createLinearGradient(0, oy, 0, by); g.addColorStop(0, '#f1c98a'); g.addColorStop(1, '#c98d4b'); x.fillStyle = g; x.fill();
    x.strokeStyle = '#8a5a2b'; x.lineWidth = Math.max(1.2, s * 0.03); x.stroke();
    x.save(); x.clip(); x.strokeStyle = 'rgba(138,90,43,0.55)'; x.lineWidth = Math.max(1, s * 0.02);
    for (var i = 1; i < 3; i++) { x.beginPath(); x.moveTo(cx - w / 2, oy + h * i / 3); x.lineTo(cx + w / 2, oy + h * i / 3); x.stroke(); }
    for (var j = -3; j <= 3; j++) { x.beginPath(); x.moveTo(cx + j * w * 0.13, oy); x.lineTo(cx + j * w * 0.1, by); x.stroke(); }
    x.restore();
    x.fillStyle = '#c98d4b'; rr(x, cx - w * 0.53, oy - s * 0.035, w * 1.06, s * 0.08, s * 0.04); x.fill(); x.strokeStyle = '#8a5a2b'; x.lineWidth = Math.max(1, s * 0.022); x.stroke();
    x.restore();
  }
  // exit (出口) at the bottom edge of the bottom playable cell of a segment: a little arch + down chevrons. Drawn on the board layer.
  function exit(x, X, Y, s, a) {
    x.save(); x.globalAlpha = a == null ? 1 : a;
    var cx = X + s / 2, by = Y + s, w = s * 0.62;
    x.fillStyle = 'rgba(122,206,170,0.32)'; rr(x, cx - w / 2, by - s * 0.3, w, s * 0.3 + s * 0.1, s * 0.12); x.fill();
    x.strokeStyle = '#3f8f6c'; x.lineWidth = Math.max(1.4, s * 0.03); x.stroke();
    x.fillStyle = '#7acea9'; x.strokeStyle = '#2f7558'; x.lineWidth = Math.max(1, s * 0.02);
    for (var i = 0; i < 2; i++) { var yy = by - s * 0.22 + i * s * 0.12; x.beginPath(); x.moveTo(cx - s * 0.13, yy); x.lineTo(cx + s * 0.13, yy); x.lineTo(cx, yy + s * 0.1); x.closePath(); x.fill(); x.stroke(); }
    x.restore();
  }
  var API = { frosting: frosting, crate: crate, spawner: spawner, tie: tie, basket: basket, exit: exit, PLACEHOLDER: true,
    manifest: { frosting_pad: { states: ['layers_2', 'layers_1'], status: 'placeholder' }, cookie_crate: { states: ['hp_3', 'hp_2', 'hp_1'], status: 'placeholder' },
      gummy_tie: { states: ['tied', 'releasing'], status: 'placeholder', stage: 'B' }, delivery_basket: { states: ['idle', 'landing'], status: 'placeholder', stage: 'B' },
      exit: { states: ['marker'], status: 'placeholder', stage: 'B' } } };
  root.JellyObstacleArt = API;
})(typeof window !== 'undefined' ? window : this);
