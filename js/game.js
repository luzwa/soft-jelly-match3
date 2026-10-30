/* 果冻三消 Jelly Match-3 · Web V2 「Q弹软糯」
 * Soft-body jellies (js/softbody.js) rendered with WebGL (js/renderer.js, Canvas2D fallback),
 * special pieces, splat clears, chains, synth audio. Plain script tags only → works from file://.
 */
(function () {
  'use strict';
  var JM = window.JM, CFG = window.JELLY_CONFIG;
  var clamp = JM.clamp, lerp = JM.lerp, rnd = JM.rnd, E = JM.E, DEG = JM.DEG;
  var Clock = JM.Clock, Sound = JM.Sound, Haptic = JM.Haptic;
  var MR = CFG.motion, MO = MR.motions, EF = CFG.effects, UI = CFG.ui, RM = MR.reduced_motion;
  var SLICE = {}; CFG.slices.assets.forEach(function (a) { SLICE[a.assetId] = a.margins; });

  var ROWS = 7, COLS = 7;
  var TYPES = ['jelly_squid', 'jelly_fugu', 'jelly_jellyfish', 'jelly_octopus', 'jelly_bear', 'jelly_fig'];
  var TYPE_SCALE = { jelly_squid: 1.15, jelly_fugu: 1.09, jelly_jellyfish: 1.14, jelly_octopus: 1.13, jelly_bear: 1.04, jelly_fig: 1.06, rainbow: 1.06 };
  var ANCHOR_K = 0.43;
  // splat / glow colours per type (sampled from the sprites)
  var TCOL = {
    jelly_squid: [255, 128, 118], jelly_fugu: [255, 206, 84], jelly_jellyfish: [184, 160, 255], jelly_octopus: [255, 96, 84],
    jelly_bear: [255, 168, 52], jelly_fig: [214, 70, 104], rainbow: [255, 230, 160]
  };
  var NAME = { jelly_squid: '鱿鱼', jelly_fugu: '河豚', jelly_jellyfish: '水母', jelly_octopus: '章鱼', jelly_bear: '小熊', jelly_fig: '无花果' };
  var Core = window.JellyCore, LS = window.JellyLevelSchema, ART = window.JellyObstacleArt;
  var CS = null, DEF = null;   // v3: core state + the (canonical, frozen) level definition being played
  var T = {
    pressDown: MO.pointer_press.duration_ms, pressRec: MO.pointer_press.recovery_duration_ms, press: MO.pointer_press.target_scale,
    selIn: MO.selection_enter.duration_ms, dragThresh: MO.drag_preview.drag_threshold_logical_px,
    swap: MO.ordinary_swap_motion.duration_ms, swapArc: MO.ordinary_swap_motion.path_normal_arc_cell,
    rejOut: MO.ordinary_swap_reject_out.duration_ms, rejBack: MO.ordinary_swap_return.duration_ms,
    cmpScale: MO.match_compress.target_scale,
    eject: MO.piece_eject.duration_ms, ejectLift: MO.piece_eject.screen_up_lift_cell,
    retire: MO.piece_retire.total_lifetime_from_compress_start_ms,
    refillDelay: MO.refill_motion.start_delay_after_clear_commit_ms, refillBase: MO.refill_motion.base_one_cell_duration_ms,
    refillPer: MO.refill_motion.per_additional_cell_duration_ms, refillMax: MO.refill_motion.max_duration_ms,
    land: MO.refill_land.duration_ms, cascadeGap: MO.cascade_continue.gap_after_core_arrival_ms,
    cmpBase: MO.cascade_continue.compress_base_duration_ms, cmpStep: MO.cascade_continue.compress_reduction_per_extra_wave_ms, cmpMin: MO.cascade_continue.compress_min_duration_ms,
    hammerWind: MO.hammer_windup.duration_ms, toolSwap: MO.tool_swap_motion.duration_ms, toolSwapSep: MO.tool_swap_motion.path_normal_separation_cell,
    shuffle: MO.shuffle_motion.duration_ms, goalPop: MO.goal_complete.duration_ms, goalPeak: MO.goal_complete.icon_scale_peak,
    result: MO.result_panel_enter.duration_ms, resultFrom: MO.result_panel_enter.scale_from,
    backdrop: EF.visual_effects.result_backdrop.duration_ms, backdropA: EF.visual_effects.result_backdrop.overlay_opacity,
    selFill: EF.visual_effects.cell_selected.fill_opacity
  };
  var SH = UI.tools.tool_shuffle.search_defaults;

  // ---------------------------------------------------------------- canvases / assets
  var cA = document.getElementById('cA'), cG = document.getElementById('cG'), cB = document.getElementById('cB');
  var ctxA = cA.getContext('2d'), ctxB = cB.getContext('2d'), ctx = ctxA, R = null;
  var FONT = '"PingFang SC","Microsoft YaHei UI","Microsoft YaHei","Noto Sans CJK SC","Source Han Sans SC","Hiragino Sans GB",sans-serif';
  var IMG = {};
  var IMG_LIST = {
    bg: 'assets/backgrounds/environment_background.jpg', board_frame: 'assets/board/board_frame.png',
    icon_back: 'assets/ui/icons/icon_back.png', icon_settings: 'assets/ui/icons/icon_settings.png', icon_check: 'assets/ui/icons/icon_check.png',
    tool_hammer: 'assets/ui/icons/tool_hammer.png', tool_swap: 'assets/ui/icons/tool_swap.png', tool_shuffle: 'assets/ui/icons/tool_shuffle.png',
    star_empty: 'assets/ui/icons/star_empty.png', star_filled: 'assets/ui/icons/star_filled.png'
  };
  ['button_round', 'button_primary', 'button_secondary', 'hud_panel', 'result_panel', 'instruction_bar', 'count_badge', 'progress_track',
    'cell_cream', 'cell_sage', 'cell_selected', 'tool_selected_ring'].forEach(function (n) { IMG_LIST[n] = 'assets/ui/components/' + n + '.png'; });
  TYPES.forEach(function (t) { IMG_LIST[t] = window.JELLY_SPRITES[t]; });   // data URIs (CORS-clean for WebGL on file://)
  // v2.1 octopus B material (de-lit colour + thickness/AO/face map), also data URIs
  if (JM.MAT && JM.MAT.jelly_octopus) { IMG_LIST.__octoBase = JM.MAT.jelly_octopus.base; IMG_LIST.__octoMat = JM.MAT.jelly_octopus.mat; }
  // v2.1 octopus display A (V2 flat textured mesh) / B (lit 3D shell). Dev-only: ?octo=B, ?dev=1 panel, or Shift+D panel.
  var QS = location.search;
  var OCTO = { mode: /[?&]octo=b/i.test(QS) ? 'B' : 'A' };

  // ---------------------------------------------------------------- v2.2 quality tiers (mobile). high = v2.1 look (GL DPR capped at 2).
  // Chosen automatically from measured frame interval (with hysteresis); ?q=high|medium|low forces one.
  var TIERS = {
    high:   { id: 'high',   glDpr: 2,    dpr2d: 3, ng: 25, frontOnly: false, fastPow: false, partK: 1,    partCap: 600, rigidFly: false, hudHz: 0,  maxLag: 0.1,  shadow2: true },
    medium: { id: 'medium', glDpr: 1.75, dpr2d: 3, ng: 17, frontOnly: true,  fastPow: true,  partK: 0.6,  partCap: 260, rigidFly: true,  hudHz: 30, maxLag: 0.1,  shadow2: true },
    low:    { id: 'low',    glDpr: 1.5,  dpr2d: 2, ng: 13, frontOnly: true,  fastPow: true,  partK: 0.35, partCap: 120, rigidFly: true,  hudHz: 15, maxLag: 0.1,  shadow2: false, simH: 1 / 60 }
  };
  var TIER_ORDER = ['low', 'medium', 'high'];
  var qm = /[?&]q=(high|medium|low)\b/i.exec(QS);
  var Q = { forced: qm ? qm[1].toLowerCase() : null, cur: null, log: [] };
  (function () {
    var start = 'high', nav = window.navigator || {};
    if ((nav.hardwareConcurrency && nav.hardwareConcurrency <= 4) || (nav.deviceMemory && nav.deviceMemory <= 3)) start = 'medium';
    Q.cur = TIERS[Q.forced || start]; Q.start = Q.cur.id;
  })();

  // ---------------------------------------------------------------- layout (logical units; 430-wide column)
  var L = {}, DPR = 1, K = 1, PX = 1, DPRG = 1, PXG = 1;
  function layout() {
    resizeSurfaces();
    var vw = window.innerWidth, vh = window.innerHeight;
    var W = vw / K, H = vh / K; L.W = W; L.H = H;

    var CW = 430, cx0 = (W - CW) / 2; L.cx0 = cx0; L.CW = CW;
    var bo = 410, stack = 50 + 10 + 96 + 18 + bo + 60 + 86, free = Math.max(0, H - stack - 20);
    var y = 10 + free * 0.36;
    L.top = { y: y, h: 50 };
    L.back = { x: cx0 + 14, y: y + 2, w: 46, h: 46 }; L.settings = { x: cx0 + CW - 60, y: y + 2, w: 46, h: 46 };
    y += 58; L.hud = { x: cx0 + 10, y: y, w: CW - 20, h: 96 }; y += 112;
    var B = { x: (W - bo) / 2, y: y, w: bo, h: bo }; L.B = B;
    var s = 0.27; L.frameS = s;
    var fm = { l: 64, t: 58, r: 1248 - 1194, b: 1194 - 1143 };
    L.frameRect = { x: B.x - fm.l * s, y: B.y - fm.t * s, w: B.w + (fm.l + fm.r) * s, h: B.h + (fm.t + fm.b) * s };
    var op = { x: B.x + 54 * s, y: B.y + 52 * s, w: B.w - 108 * s, h: B.h - 112 * s }; L.op = op;
    var pad = 5, gap = 3; L.gap = gap;
    var cell = (op.w - 2 * pad - 6 * gap) / 7; L.cell = cell; L.pitch = cell + gap;
    L.gx = op.x + pad; var gh = 7 * cell + 6 * gap; L.gy = op.y + (op.h - gh) / 2;
    y += bo;
    L.instr = { x: cx0 + 22, y: y + 10, w: CW - 44, h: 48 };
    var ty = y + 64 + free * 0.22;
    L.tools = [];
    ['hammer', 'swap', 'shuffle'].forEach(function (k, i) { L.tools.push({ id: k, x: W / 2 + (i - 1) * 112 - 35, y: ty, w: 70, h: 70 }); });
    L.panel = { cx: W / 2, cy: B.y + B.h / 2 };
    // v2.2: dirty regions of the 2D base layer (logical units, generous margins for glow / shake / pops)
    var fr = L.frameRect, lastTool = L.tools[0], gm = 64;
    L.reg = [
      { id: 'top', x: 0, y: L.top.y - 6, w: W, h: 62 },
      { id: 'hud', x: L.hud.x - 26, y: L.hud.y - 26, w: L.hud.w + 52, h: L.hud.h + 52 },
      { id: 'bottom', x: 0, y: L.instr.y - 8, w: W, h: lastTool.y + lastTool.h * 1.3 + 34 - (L.instr.y - 8) }
    ];
    cache = {};
    buildStatic();
    for (var id in G.pieces) rebuildBody(G.pieces[id]);
  }
  function resizeSurfaces() {
    var vw = window.innerWidth, vh = window.innerHeight, dpr = window.devicePixelRatio || 1;
    DPR = Math.min(dpr, 3, Q.cur.dpr2d);          // 2D layers (text/UI): native up to 3 (low tier: 2)
    DPRG = Math.min(dpr, 3, Q.cur.glDpr);         // v2.2: WebGL jelly layer capped (2 / 1.75 / 1.5): fill-rate bound on phones
    [cA, cB].forEach(function (c) { var w = Math.round(vw * DPR), h = Math.round(vh * DPR); if (c.width !== w || c.height !== h) { c.width = w; c.height = h; } });
    var gw = Math.round(vw * DPRG), gh = Math.round(vh * DPRG); if (cG.width !== gw || cG.height !== gh) { cG.width = gw; cG.height = gh; }
    K = Math.min(vw / 430, vh / 860); PX = K * DPR; PXG = K * DPRG;
    dirtyAll = true; bState = 1; BPREV = null;
  }

  // ---------------------------------------------------------------- image caches
  var cache = {};
  function scaled(name, wl, hl) {
    var img = IMG[name]; var w = Math.max(1, Math.round(wl * PX)), h = Math.max(1, Math.round(hl * PX));
    var key = 's|' + name + '|' + w + '|' + h; if (cache[key]) return cache[key];
    var src = img, sw = img.width, sh = img.height;
    while (sw / 2 >= w && sh / 2 >= h) {
      var c2 = document.createElement('canvas'); c2.width = Math.round(sw / 2); c2.height = Math.round(sh / 2);
      var x2 = c2.getContext('2d'); x2.imageSmoothingQuality = 'high'; x2.drawImage(src, 0, 0, c2.width, c2.height);
      src = c2; sw = c2.width; sh = c2.height;
    }
    var c = document.createElement('canvas'); c.width = w; c.height = h;
    var x = c.getContext('2d'); x.imageSmoothingQuality = 'high'; x.drawImage(src, 0, 0, w, h);
    cache[key] = c; return c;
  }
  function drawImg(name, x, y, w, h) { ctx.drawImage(scaled(name, w, h), x, y, w, h); }
  function nine(name, wl, hl, s) {
    var w = Math.max(1, Math.round(wl * PX)), h = Math.max(1, Math.round(hl * PX));
    var key = 'n|' + name + '|' + w + '|' + h + '|' + s.toFixed(4); if (cache[key]) return cache[key];
    var img = IMG[name], m = SLICE[name];
    var c = document.createElement('canvas'); c.width = w; c.height = h;
    var x = c.getContext('2d'); x.imageSmoothingQuality = 'high';
    var f = s * PX;
    var Lm = Math.round(m.left * f), Tm = Math.round(m.top * f), Rm = Math.round(m.right * f), Bm = Math.round(m.bottom * f);
    if (Lm + Rm > w) { var q = w / (Lm + Rm); Lm = Math.floor(Lm * q); Rm = w - Lm; }
    if (Tm + Bm > h) { var q2 = h / (Tm + Bm); Tm = Math.floor(Tm * q2); Bm = h - Tm; }
    var sx = [0, m.left, img.width - m.right, img.width], sy = [0, m.top, img.height - m.bottom, img.height];
    var dx = [0, Lm, w - Rm, w], dy = [0, Tm, h - Bm, h];
    for (var i = 0; i < 3; i++) for (var j = 0; j < 3; j++) {
      var dw = dx[i + 1] - dx[i], dh = dy[j + 1] - dy[j]; if (dw <= 0 || dh <= 0) continue;
      x.drawImage(img, sx[i], sy[j], sx[i + 1] - sx[i], sy[j + 1] - sy[j], dx[i], dy[j], dw, dh);
    }
    cache[key] = c; return c;
  }
  function drawNine(name, x, y, w, h, s) { ctx.drawImage(nine(name, w, h, s), x, y, w, h); }
  function drawBar(name, x, y, w, h) { drawNine(name, x, y, w, h, h / IMG[name].height); }
  function rr(x, X, Y, w, h, r) {
    x.beginPath(); x.moveTo(X + r, Y); x.arcTo(X + w, Y, X + w, Y + h, r); x.arcTo(X + w, Y + h, X, Y + h, r);
    x.arcTo(X, Y + h, X, Y, r); x.arcTo(X, Y, X + w, Y, r); x.closePath();
  }
  var bgLayer = null, boardLayer = null;
  function buildStatic() {
    var c = document.createElement('canvas'); c.width = cA.width; c.height = cA.height;
    var x = c.getContext('2d'); x.setTransform(PX, 0, 0, PX, 0, 0); x.imageSmoothingQuality = 'high';
    var bg = IMG.bg, sc = Math.max(L.W / bg.width, L.H / bg.height), bw = bg.width * sc, bh = bg.height * sc;
    x.drawImage(bg, (L.W - bw) / 2, (L.H - bh) / 2, bw, bh);
    var B = L.B, g = x.createRadialGradient(B.x + B.w / 2, B.y + B.h / 2, B.w * 0.2, B.x + B.w / 2, B.y + B.h / 2, B.w * 0.85);
    g.addColorStop(0, 'rgba(255,253,240,0.35)'); g.addColorStop(1, 'rgba(255,253,240,0)');
    x.fillStyle = g; x.fillRect(B.x - B.w * 0.4, B.y - B.h * 0.4, B.w * 1.8, B.h * 1.8);
    bgLayer = c;
    // board layer (frame + tray + cells) separately so it can shake
    var fr = L.frameRect, m = 24, bc = document.createElement('canvas');
    bc.width = Math.ceil((fr.w + 2 * m) * PX); bc.height = Math.ceil((fr.h + 2 * m) * PX);
    var y = bc.getContext('2d'); y.setTransform(PX, 0, 0, PX, (m - fr.x) * PX, (m - fr.y) * PX); y.imageSmoothingQuality = 'high';
    var op = L.op;
    rr(y, op.x - 2, op.y - 2, op.w + 4, op.h + 4, 16); y.fillStyle = '#f4eedc'; y.fill();
    var ig = y.createLinearGradient(0, op.y, 0, op.y + 14); ig.addColorStop(0, 'rgba(120,110,80,0.10)'); ig.addColorStop(1, 'rgba(120,110,80,0)');
    y.fillStyle = ig; y.fill();
    y.drawImage(nine('board_frame', fr.w, fr.h, L.frameS), fr.x, fr.y, fr.w, fr.h);
    var cell = L.cell, cs = (cell + 6) / 288;
    for (var r = 0; r < ROWS; r++) for (var col = 0; col < COLS; col++) {
      if (CS && !CS.mask[r * COLS + col]) continue;   // v3: void cells show the bare tray
      y.drawImage(nine(((r + col) % 2 === 0) ? 'cell_sage' : 'cell_cream', cell + 6, cell + 6, cs), L.gx + col * L.pitch - 3, L.gy + r * L.pitch - 3, cell + 6, cell + 6);
    }
    if (CS) CS.segs.forEach(function (sg) { if (sg.r0 > 0 && CS.spawn[sg.r0 * COLS + sg.c]) ART.spawner(y, L.gx + sg.c * L.pitch, L.gy + sg.r0 * L.pitch - L.gap, cell, 0.85); });
    if (CS) Object.keys(CS.exits).forEach(function (k) { k = +k; ART.exit(y, L.gx + (k % COLS) * L.pitch, L.gy + Math.floor(k / COLS) * L.pitch + cell * 0.2, cell, 1); });   // v3.1 exits (PLACEHOLDER art)
    boardLayer = { c: bc, x: fr.x - m, y: fr.y - m, w: fr.w + 2 * m, h: fr.h + 2 * m };
    placeLayers();
  }

  // ---------------------------------------------------------------- state
  var G = {
    epoch: 0, level: 0, board: null, pieces: {}, retiring: [], nextId: 1, revision: 0, actionSeq: 0, clearBatch: 0,
    moves: 0, goals: [], score: 0, dispScore: 0, tools: {}, phase: 'boot', sel: null, selT: 0, toolMode: null,
    receipts: {}, result: null, panel: null, toast: null, focus: null, lastInputAt: 0, hint: null,
    reduced: false, idleNext: 0, hammerFx: null, goalPop: {}, starPop: [0, 0, 0], gesture: null, hover: null, pressedBtn: null,
    // juice
    trauma: 0, hitStop: 0, glow: 0, chain: 0, chainT: -1e9, maxChain: 0, banner: null, praise: null,
    parts: [], decals: [], rings: [], popups: [], beams: [], blasts: [], zaps: [], sparks: [], combos: 0
  };
  try { G.reduced = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches); } catch (e) { }
  try { var sv = JSON.parse(localStorage.getItem('jelly_m3_v2_settings') || '{}'); if (sv.muted) Sound.muted = true; if (typeof sv.reduced === 'boolean') G.reduced = sv.reduced; if (sv.haptic === false) Haptic.on = false; } catch (e) { }
  function saveSettings() { try { localStorage.setItem('jelly_m3_v2_settings', JSON.stringify({ muted: Sound.muted, reduced: G.reduced, haptic: Haptic.on })); } catch (e) { } }
  function ampK() { return G.reduced ? 0.35 : 1; }
  function amp(v) { return G.reduced ? 1 + (v - 1) * RM.shape_amplitude_multiplier : v; }
  function now() { return Clock.now; }

  function spriteOf(p) { return p.type === 'rainbow' ? 'jelly_bear' : p.type; }
  function rebuildBody(p) { var S = L.cell * TYPE_SCALE[p.type] * (p.sp ? 1.05 : 1); p.S = S; p.body = new JM.Body(p.type, S, spriteOf(p), !!p.sp); }
  // v3: a visual piece mirrors one core instance (same id). Visual randomness (phase/seed/fly) uses Math.random, never the core RNG.
  function newPiece(type, r, c, y0, sp, id) {
    var p = { id: id, type: type, sp: sp || null, r: r, c: c, x: c, y: (y0 == null ? r : y0), ox: 0, oy: 0,
      sqW: 1, sqH: 1, sqTok: 0, mvTok: 0, rot: 0, lift: 0, out: 0, z: 0, dead: false, alpha: 1,
      flash: 0, puff: 1, dragX: 0, dragY: 0, fdep: 0, fdepT: 0, ffx: 0, ffy: 0, phase: Math.random() * 6.28, seed: Math.random(),
      held: false, tint: null, shA: 1 };
    rebuildBody(p);
    G.pieces[p.id] = p; return p;
  }
  function makeSpecial(p, sp) {
    p.sp = sp; if (sp === 'rainbow') p.type = 'rainbow';
    var old = p.body; rebuildBody(p);
    if (old) { p.body.fresh = true; }
  }
  function typesGrid() { var g = []; for (var r = 0; r < ROWS; r++) { g.push([]); for (var c = 0; c < COLS; c++) { var o = CS.occ[r * COLS + c]; g[r].push(o ? (o.kind === 'crate' ? 'cookie_crate' : o.type) : null); } } return g; }
  var PILL = null;
  function isFixture() { return !!(DEF && ((DEF.editorNotes && DEF.editorNotes.ruleTestFixture) || DEF.initial.placements.some(function (p) { return p.special; }))); }
  function lv() { return { name: DEF ? DEF.displayName : '', stars: CS ? CS.stars : [600, 1400, 2400] }; }
  function columnPieces(c) { var a = []; for (var r = 0; r < ROWS; r++) if (G.board[r][c]) a.push(G.board[r][c]); for (var id in G.baskets) if (G.baskets[id].c === c) a.push(G.baskets[id]); return a; }
  function setReady() { G.phase = 'ready'; G.lastInputAt = now(); G.hint = null; }
  function receipt(key) { var k = G.epoch + ':' + key; if (G.receipts[k]) return false; G.receipts[k] = 1; return true; }
  function after(ms, ep, fn) { Clock.wait(ms).then(function () { if (ep === G.epoch) fn(); }); }
  var NEVER = function () { return new Promise(function () { }); };
  function cellX(c) { return L.gx + c * L.pitch + L.cell / 2; }
  function cellY(r) { return L.gy + r * L.pitch + L.cell / 2; }
  function toast(t, d) { G.toast = { text: t, t0: now(), dur: d || 1300 }; }

  // ---------------------------------------------------------------- v3: level catalog, core state, start / restart
  var LVDATA = window.JELLY_LEVELS || { catalog: { chapters: [] }, levels: {} };
  var PLAY = { mode: /[?&]playtest=1/.test(QS) ? 'playtest' : 'normal', chapter: 0, idx: 0, levelId: null, seed: null, source: 'catalog', maskKey: '', tainted: false, challenge: null, initOk: true, menu: false };
  var PROGRESS_KEY = 'jelly_m3_progress_v1';   // player progress namespace (editor drafts live under jelly_editor_v1:*)
  function chapterLevels() { var ch = LVDATA.catalog.chapters[PLAY.chapter]; return ch ? ch.levels : []; }
  function newSeed() { return ((Math.random() * 0x7fffffff) ^ (Date.now() & 0x7fffffff)) >>> 0; }   // picked outside the core, then recorded
  function startLevel(idx) { var ids = chapterLevels(); PLAY.idx = idx; startDef(LVDATA.levels[ids[idx]], null, 'catalog'); }
  function goalView(g) {
    return { type: g.type === 'collect_piece' ? g.typeId : g.type === 'clear_underlay' ? '__frost' : g.type === 'deliver' ? '__basket' : g.typeId === 'gummy_tie' ? '__tie' : '__crate', kind: g.type, left: Math.max(0, g.target - g.progress), total: g.target, done: g.progress >= g.target };
  }
  function startDef(def, seed, source) {
    if (PLAY.menu) closeMenu();   // C: any start (menu, ?level=, dev panel, test hook) brings the board back
    G.epoch++; Clock.reset(); G.gesture = null; G.pressedBtn = null; G.toolMode = null; G.panel = null; G.sel = null; G.hover = null; G.hint = null;
    G.retiring = []; G.hammerFx = null; G.toast = null; G.result = null; G.receipts = {}; G.focus = null;
    G.parts = []; G.decals = []; G.rings = []; G.popups = []; G.beams = []; G.blasts = []; G.zaps = []; G.sparks = [];
    G.banner = null; G.praise = null; G.chain = 0; G.maxChain = 0; G.trauma = 0; G.hitStop = 0; G.glow = 0; G.combos = 0;
    G.waveTag = null; G.skillTag = null; G.center = null; G.op = null;
    DEF = LS.canonical(def); PLAY.levelId = DEF.levelId; if (source) PLAY.source = source;
    if (PLAY.source !== 'challenge') PLAY.challenge = null;
    PLAY.tainted = false;   // C: any debug hook (seedBoard / setMoves / setGoalsLeft / hammer) taints the run → no progress, no record
    PLAY.seed = PLAY.challenge ? PLAY.challenge.seed : seed != null ? (seed >>> 0) : newSeed();
    CS = Core.createGame(DEF, { seed: PLAY.seed });
    PLAY.initOk = !PLAY.challenge || Core.stateHash(CS) === PLAY.challenge.initHash;   // challenge: same frozen start or the run is invalid
    G.level = PLAY.idx; G.lastEv = null; G.evLog = [];
    G.moves = CS.moves; G.goals = CS.goals.map(goalView);
    G.score = 0; sdReset(); G.tools = CS.tools;   // tool counts are read straight from the core (cost committed on acceptance)
    G.revision = 0; G.starPop = [0, 0, 0]; G.goalPop = {};
    var mk = DEF.board.playableMask.join('/') + '|' + CS.segs.filter(function (s) { return s.r0 > 0; }).map(function (s) { return s.r0 + ',' + s.c; }).join(';') + '|x' + Object.keys(CS.exits).join(',');
    if (mk !== PLAY.maskKey) { PLAY.maskKey = mk; if (bgLayer) buildStatic(); }
    buildVisuals(true);
    G.phase = 'busy';
    var ep = G.epoch, all = [];
    for (var c = 0; c < COLS; c++) all.push(dropColumn(c, columnPieces(c), 60 + c * 34, ep));
    Promise.all(all).then(function () {
      if (ep !== G.epoch) return;
      if (CS.phase === 'stuck') { stuckPanel(); return; }
      setReady();
    });
    ptNotify('start');
  }
  function buildVisuals(drop) {
    G.pieces = {}; G.board = []; G.crates = {}; G.frost = []; G.crateFx = []; G.frostFx = []; G.ties = {}; G.tieFx = []; G.baskets = {}; G.dlvFx = []; OVERSIG = null;
    for (var r = 0; r < ROWS; r++) {
      G.board.push([]);
      for (var c = 0; c < COLS; c++) {
        var k = r * COLS + c, o = CS.occ[k], u = CS.under[k];
        G.frost[k] = u ? { id: u.id, layers: u.layers, hitT: -1e9 } : null;
        if (CS.over[k]) G.ties[k] = { id: CS.over[k].id, r: r, c: c, t0: now() };
        if (o && o.kind === 'crate') { G.crates[o.id] = { id: o.id, r: r, c: c, hp: o.hp, hitT: -1e9 }; G.board[r].push(null); }
        else if (o && o.kind === 'basket') { G.baskets[o.id] = newBasket(o.id, r, c, drop ? r - 7.6 : r); G.board[r].push(null); }
        else if (o) G.board[r].push(newPiece(o.type, r, c, drop ? r - 7.6 : r, o.sp, o.id));
        else G.board[r].push(null);
      }
    }
    G.obsRev = (G.obsRev || 0) + 1;
  }
  // v3.1: a delivery basket is not a jelly (no soft body, not in G.board / G.pieces). It rides the same column drop as jellies
  // (duck-typed mover for dropColumn) and is drawn on the overlay canvas cOver.
  var NOBODY = { land: function () { }, kick: function () { }, radial: function () { } };
  function newBasket(id, r, c, y0) { return { id: id, basket: true, type: 'delivery_basket', sp: null, r: r, c: c, x: c, y: y0, mvTok: 0, sqTok: 0, sqW: 1, sqH: 1, alpha: 1, body: NOBODY }; }
  function basketAt(r, c) { for (var id in G.baskets) { var q = G.baskets[id]; if (q.r === r && q.c === c) return q; } return null; }
  function crateAt(r, c) { for (var id in G.crates) { var q = G.crates[id]; if (q.r === r && q.c === c) return q; } return null; }
  function stuckPanel() { G.phase = 'result'; G.panel = { kind: 'stuck', t0: now() }; }

  // ---------------------------------------------------------------- motion primitives
  function squashTo(p, w, h, dur, ease) {
    var tok = ++p.sqTok, w0 = p.sqW, h0 = p.sqH;
    return Clock.tween(dur, function (e) { if (p.sqTok !== tok) return; p.sqW = lerp(w0, w, e); p.sqH = lerp(h0, h, e); }, ease || E.smooth);
  }
  function landSquash(p, k) {
    var tok = ++p.sqTok; k = k || 1;
    return Clock.tween(T.land * (k > 1 ? 1.3 : 1), function (e, t) { if (p.sqTok !== tok) return; var s = JM.landingAt(t); p.sqW = 1 + (amp(s.w) - 1) * k; p.sqH = 1 + (amp(s.h) - 1) * k; });
  }
  function press(p) {
    var pr = squashTo(p, amp(T.press.width * 1.03), amp(T.press.height * 0.97), T.pressDown, E.smooth), tok = p.sqTok;
    pr.then(function () { if (p.sqTok === tok && !p.pressing) squashTo(p, 1, 1, T.pressRec * 2.2, E.elastic); });
    p.body.kick(0, 120 * ampK(), 'top');
    Sound.press(spriteOf(p)); Haptic.buzz(8);
  }
  // per-type poke reaction (tap)
  function react(p) {
    var K2 = ampK(), S = p.S, t = p.type;
    Sound.boing(spriteOf(p), !!p.sp); Haptic.buzz(12);
    if (t === 'jelly_fugu') {
      Sound.puff();
      var tk = ++p.reactTok || (p.reactTok = 1);
      Clock.tween(110, function (e) { if (p.reactTok === tk) p.puff = lerp(1, 1 + 0.26 * K2, e); }, E.outBack)
        .then(function () { return Clock.wait(380); })
        .then(function () { return Clock.tween(420, function (e) { if (p.reactTok === tk) p.puff = lerp(1 + 0.26 * K2, 1, e); }, E.elastic); });
      p.body.radial(420 * K2);
    } else if (t === 'jelly_jellyfish') {
      var l0 = p.lift;
      Clock.tween(240, function (e) { p.lift = l0 + 0.22 * K2 * e; }, E.soft).then(function () { return Clock.tween(620, function (e) { p.lift = lerp(l0 + 0.22 * K2, 0, e); }, E.smooth); })
        .then(function () { p.body.land(160 * K2); });
      p.body.kick(0, 260 * K2, 'limbs');
      squashTo(p, 0.9, 1.12, 160, E.smooth).then(function () { return squashTo(p, 1, 1, 500, E.elastic); });
    } else if (t === 'jelly_octopus') {
      var dir = Math.random() < 0.5 ? -1 : 1;
      p.body.kick(dir * 520 * K2, -160 * K2, 'limbs');
      Clock.wait(130).then(function () { p.body.kick(-dir * 640 * K2, 0, 'limbs'); });
      squashTo(p, 1.08, 0.93, 90).then(function () { return squashTo(p, 1, 1, 420, E.elastic); });
    } else if (t === 'jelly_squid') {
      squashTo(p, 0.86, 1.18, 100).then(function () { return squashTo(p, 1, 1, 480, E.elastic); });
      p.body.kick((Math.random() < 0.5 ? -1 : 1) * 380 * K2, 0, 'limbs');
    } else if (t === 'jelly_fig') {
      squashTo(p, amp(1.24), amp(0.76), 120, E.smooth).then(function () { return squashTo(p, 1, 1, 620, E.elastic); });
      p.body.radial(-220 * K2); p.body.land(260 * K2);
    } else if (t === 'jelly_bear') {
      squashTo(p, 1.12, 0.88, 80).then(function () {
        squashTo(p, 0.92, 1.1, 120);
        return Clock.tween(150, function (e) { p.lift = 0.2 * K2 * e; }, E.soft);
      }).then(function () { return Clock.tween(140, function (e) { p.lift = 0.2 * K2 * (1 - e); }, E.fall); })
        .then(function () { landSquash(p, 1.3); p.body.land(380 * K2); });
    } else { // rainbow
      p.body.radial(300 * K2); p.flash = 0.6; Sound.zap(3);
      squashTo(p, 1.15, 0.88, 90).then(function () { return squashTo(p, 1, 1, 500, E.elastic); });
    }
  }
  var landAt = -1e9;
  function landSound() { if (now() - landAt < EF.audio.group_landing_window_ms) return; landAt = now(); Sound.land(); }
  function neighbourKick(r, c, vx, vy, mode) {
    if (r < 0 || r >= ROWS || c < 0 || c >= COLS) return;
    var q = G.board[r][c]; if (q && !q.dead) q.body.kick(vx * ampK(), vy * ampK(), mode || 'top');
  }
  // column refill: one easing per column so survivors keep order and never overlap
  function dropColumn(c, movers, delay, ep) {
    movers = movers.filter(function (p) { return Math.abs(p.y - p.r) > 0.001; });
    if (!movers.length) return Promise.resolve();
    var maxD = 0; movers.forEach(function (p) { maxD = Math.max(maxD, p.r - p.y); });
    var dur = Math.min(T.refillMax, T.refillBase + T.refillPer * Math.max(0, maxD - 1));
    return Clock.wait(delay).then(function () {
      if (ep !== G.epoch) return NEVER();
      var starts = movers.map(function (p) { p.mvTok++; return { p: p, y0: p.y, tok: p.mvTok, d: p.r - p.y }; });
      return Clock.tween(dur, function (e) {
        starts.forEach(function (s) { if (s.p.mvTok === s.tok) { s.p.y = lerp(s.y0, s.p.r, e); s.p.x = s.p.c; } });
      }, E.fall).then(function () {
        if (ep !== G.epoch) return NEVER();
        starts.forEach(function (s) {
          var p = s.p; if (p.mvTok === s.tok) p.y = p.r;
          var k = p.sp ? 1.35 : 1, str = Math.min(620, 160 + 90 * s.d) * k * ampK();
          landSquash(p, k); p.body.land(str);
          neighbourKick(p.r, p.c - 1, -70 - 15 * s.d, 0); neighbourKick(p.r, p.c + 1, 70 + 15 * s.d, 0);
          neighbourKick(p.r + 1, p.c, 0, 60 + 12 * s.d, 'all');
        });
        landSound();
      });
    });
  }

  // ---------------------------------------------------------------- pop + fly-off (whole-jelly bounce off, blended with a goo splat)
  function popPiece(p, chain, size, opts) {
    opts = opts || {};
    p.held = false; p.flash = 1;
    var col = TCOL[p.type] || TCOL.rainbow, x = cellX(p.x), y = cellY(p.y);
    splat(x, y, col, chain, size, p.sp);
    Sound.pop(spriteOf(p), chain, size);
    for (var dr = -1; dr <= 1; dr++) for (var dc = -1; dc <= 1; dc++) {
      if (!dr && !dc) continue;
      var d = Math.sqrt(dr * dr + dc * dc);
      neighbourKick(p.r + dr, p.c + dc, dc / d * 260 / d, dr / d * 220 / d - 40, 'all');
    }
    p.body.radial(520 * ampK());
    var red = G.reduced, tok = ++p.sqTok; p.mvTok++;
    p.sqW = amp(1.22); p.sqH = amp(0.8);
    Clock.tween(90, function (e) { if (p.sqTok !== tok) return; p.sqW = lerp(amp(1.22), amp(0.86), e); p.sqH = lerp(amp(0.8), amp(1.2), e); p.out = 0.18 * e; }, E.smooth)
      .then(function () {
        if (red) { // reduced motion: gentle shrink-fade, no flying
          return Clock.tween(260, function (e) { p.alpha = 1 - e; p.out = 0.18 - 0.5 * e; p.lift = 0.15 * e; }, E.smooth);
        }
        var dir = opts.dir != null ? opts.dir : (Math.random() < 0.5 ? -1 : 1);
        p.fly = { vx: dir * rnd(1.2, 3.2), vy: -rnd(7.5, 10.5) - Math.min(3, chain * 0.5), w: dir * rnd(5, 11), t0: now() };
        p.shA = 0.4;
        return new Promise(function (res) { p.flyDone = res; });
      })
      .then(function () { var i = G.retiring.indexOf(p); if (i >= 0) G.retiring.splice(i, 1); });
  }
  function stepFly(p, dt) {
    var f = p.fly; if (!f) return;
    var s = dt / 1000;
    f.vy += 34 * s; p.x += f.vx * s; p.y += f.vy * s; p.rot += f.w * s;
    var sp = Math.sqrt(f.vx * f.vx + f.vy * f.vy);
    p.sqH = 1 + clamp(sp * 0.012, 0, 0.18); p.sqW = 1 / Math.sqrt(p.sqH);
    p.out = lerp(p.out, -0.14, 1 - Math.exp(-dt / 220));
    // C0: falling corridor = the board's lower edge; a falling piece fades out before the instruction bar / tools
    var yy = cellY(p.y), lim = L.instr.y - L.cell * 0.15;
    if (f.vy > 0) p.alpha = Math.min(p.alpha, clamp((lim - yy) / (L.cell * 0.9), 0, 1));
    if (p.alpha <= 0.01 || yy > L.H + L.cell * 1.5 || now() - f.t0 > 2200) { p.alpha = 0; p.fly = null; if (p.flyDone) p.flyDone(); }
  }

  // ---------------------------------------------------------------- v3: playback of the core's event log
  // The core has already committed every logical result (board, HP, layers, goals, moves, tools, win/lose) when an action is
  // accepted. Everything below only animates that log; each step re-checks the epoch so a restart drops stale callbacks.
  function colOf(type) { return TCOL[type] || TCOL.rainbow; }
  function noteEvent(txt) { G.lastEv = { text: txt, t0: now() }; G.evLog.push(txt); if (G.evLog.length > 40) G.evLog.shift(); ptNotify('event'); }
  var SRCN = { adjacent_match: '邻接普通匹配', direct_attack: '直接攻击', match_on_cell: '所在格参与匹配', host_matched: '宿主原地参与匹配' };
  function describeWave(ev) {
    var s = [], sn = function (x) { return SRCN[x] || x; };
    ev.crates.forEach(function (h) { s.push('饼干箱#' + h.id + ' (' + h.r + ',' + h.c + ') ' + h.hp0 + '→' + h.hp1 + ' HP，来源 ' + h.src.map(sn).join('+') + (h.dedup ? '；本波另有 ' + h.dedup + ' 次命中被去重' : '')); });
    ev.frost.forEach(function (h) { s.push('糖霜#' + h.id + ' (' + h.r + ',' + h.c + ') ' + h.l0 + '→' + h.l1 + ' 层，来源 ' + sn(h.src) + (h.l1 === 0 ? '（目标 −1 格）' : '（目标格数不变）') + (h.dedup ? '；本波另有 ' + h.dedup + ' 次命中被去重' : '')); });
    (ev.ties || []).forEach(function (h) { s.push('绑带#' + h.id + ' (' + h.r + ',' + h.c + ') 解除，来源 ' + sn(h.src) + '（宿主同批消耗/触发）' + (h.dedup ? '；本波另有 ' + h.dedup + ' 次命中被去重' : '')); });
    return '第 ' + ev.chain + ' 波：消除 ' + ev.removed.length + ' 颗' + (s.length ? '；' + s.join('；') : '');
  }
  function playFrom(evs, i, ep) {
    if (ep !== G.epoch || i >= evs.length) return;
    var e = evs[i];
    if (e.t === 'wave') {
      var f = evs[i + 1] && evs[i + 1].t === 'fall' ? evs[i + 1] : null, nx = i + (f ? 2 : 1);
      playWave(e, f, ep).then(function () {
        if (ep !== G.epoch) return;
        if (evs[nx] && evs[nx].t === 'wave') after(T.cascadeGap, ep, function () { playFrom(evs, nx, ep); }); else playFrom(evs, nx, ep);
      });
    } else if (e.t === 'deliver') {   // v3.1: the core already counted it; slide into the exit, then the follow-up gravity
      playDeliver(e, ep).then(function () { if (ep === G.epoch) playFrom(evs, i + 1, ep); });
    } else if (e.t === 'fall') {
      playFall(e, ep, false).then(function () {
        if (ep !== G.epoch) return;
        if (evs[i + 1] && evs[i + 1].t === 'wave') after(T.cascadeGap, ep, function () { playFrom(evs, i + 1, ep); }); else playFrom(evs, i + 1, ep);
      });
    } else if (e.t === 'shuffle') {
      if (e.auto) toast('没有可交换的组合，自动重排', 1600);
      G.phase = 'busy';
      after(e.auto ? 500 : 0, ep, function () { playShuffle(e, ep).then(function () { if (ep === G.epoch) playFrom(evs, i + 1, ep); }); });
    } else if (e.t === 'end') finishTurn(e, ep);
    else playFrom(evs, i + 1, ep);
  }
  function finishTurn(e, ep) {
    var esc = e.sc || {}, fin = esc.final, act = esc.action;
    // a win's end bonuses are revealed by the result panel (logic already final); everything else lands now
    setScore(fin && fin.won ? fin.actionTotal : CS.score);
    G.moves = CS.moves;
    if (act && act.skill && act.skill.qualified) G.skillTag = { n: act.skill.n, bonus: act.skill.bonus, t0: now() };
    if (G.op) G.op.endT = now();
    G.goals = CS.goals.map(function (g, i) { var v = goalView(g); if (G.goals[i] && G.goals[i].left !== v.left) G.goalPop[v.type] = now(); return v; });
    if (CS.phase === 'won') return commitResult(true);
    if (CS.phase === 'lost') return commitResult(false);
    if (CS.phase === 'stuck') { toast('自动重排失败（seed ' + CS.seed + '），不扣任何资源，请重新开始', 3000); stuckPanel(); return; }
    setReady();
  }
  function playWave(ev, fv, ep) {
    var chain = ev.chain;
    var cmpDur = Math.max(T.cmpMin, T.cmpBase - T.cmpStep * Math.max(0, chain - 1)) + 30;
    var anim = [];
    ev.compress.forEach(function (id) { var p = G.pieces[id]; if (p && !p.dead) { p.flash = Math.max(p.flash, ev.kind === 'combo' ? 0.6 : 0.25); anim.push(squashTo(p, amp(1.14), amp(0.84), cmpDur, E.smooth)); } });
    ev.creations.forEach(function (cr) {   // group members are sucked toward the new special's cell
      cr.members.forEach(function (id) {
        var p = G.pieces[id]; if (!p || id === cr.from) return; var x0 = p.x, y0 = p.y, tok = ++p.mvTok;
        anim.push(Clock.tween(cmpDur, function (e) { if (p.mvTok === tok) { p.x = lerp(x0, cr.c, 0.4 * e); p.y = lerp(y0, cr.r, 0.4 * e); } }, E.smooth));
      });
    });
    if (ev.kind === 'combo') anim.push(Clock.wait(110));
    return Promise.all(anim).then(function () {
      if (ep !== G.epoch) return NEVER();
      commitVisual(ev, ep);
      var mx = ev.maxD || 0;
      return Clock.wait(mx + T.refillDelay + (mx > 0 ? 70 : 0)).then(function () {
        if (ep !== G.epoch) return NEVER();
        return fv ? playFall(fv, ep, mx > 200) : null;
      });
    });
  }
  function commitVisual(ev, ep) {
    var chain = ev.chain, removed = [], completedNow = false;
    ev.removed.forEach(function (rm) {
      var p = G.pieces[rm.id]; if (!p || rm.anchor) return;   // anchors morph into the new special below
      delete G.pieces[rm.id]; if (G.board[p.r] && G.board[p.r][p.c] === p) G.board[p.r][p.c] = null;
      p.dead = true; p.held = true; G.retiring.push(p); removed.push({ p: p, delay: rm.d });
      if (rm.conv) { makeSpecial(p, rm.conv); p.flash = 1; }
    });
    ev.creations.forEach(function (cr) {
      var p = G.pieces[cr.from];
      if (p) { delete G.pieces[cr.from]; p.id = cr.id; G.pieces[cr.id] = p; }
      else { p = newPiece(cr.type, cr.r, cr.c, cr.r, null, cr.id); }
      if (G.board[cr.r][cr.c] && G.board[cr.r][cr.c] !== p) G.board[cr.r][cr.c] = null;
      G.board[cr.r][cr.c] = p; p.r = cr.r; p.c = cr.c;
      makeSpecial(p, cr.sp); p.flash = 1; p.x = p.c; p.y = p.r;
      var tok = ++p.sqTok; Clock.tween(520, function (e, t) { if (p.sqTok === tok) { p.out = 0.42 * Math.sin(Math.PI * Math.min(1, t * 1.6)) * (1 - t); p.sqW = p.sqH = 1; } }, E.lin);
      p.body.radial(700 * ampK());
      G.rings.push({ x: cellX(p.c), y: cellY(p.r), t0: now(), dur: 520, r0: 0.2, r1: 1.6, col: [255, 244, 200], w: 6 });
      burstSparks(cellX(p.c), cellY(p.r), 14, cr.sp === 'rainbow' ? null : TCOL[p.type]);
      Sound.create(); Haptic.buzz([10, 30, 16]);
    });
    ev.crates.forEach(function (h) { if (h.d <= 0) crateHitFx(h); else after(h.d, ep, function () { crateHitFx(h); }); });
    ev.frost.forEach(function (h) { if (h.d <= 0) frostHitFx(h); else after(h.d, ep, function () { frostHitFx(h); }); });
    (ev.ties || []).forEach(function (h) { if (h.d <= 0) tieFx(h); else after(h.d, ep, function () { tieFx(h); }); });
    ev.goals.forEach(function (gq) {
      var g = G.goals[gq.i]; if (!g) return;
      var left = Math.max(0, gq.target - gq.progress);
      if (left !== g.left) { g.left = left; G.goalPop[g.type] = now(); if (left === 0 && !g.done) { g.done = true; completedNow = true; } }
    });
    setScore(ev.score); G.revision++;
    var n = removed.length, sp = ev.specials, sc = ev.sc || null;
    var big = n >= 6 || sp > 0;
    if (big && !G.reduced) G.hitStop = Math.max(G.hitStop, sp > 1 || n >= 12 ? 60 : 42);
    addTrauma(Math.min(0.75, 0.05 * n + 0.12 * sp) * (1 + 0.18 * (chain - 1)));
    G.glow = Math.min(1, G.glow + 0.18 + 0.12 * chain + 0.1 * sp);
    G.chain = chain; G.chainT = now(); G.maxChain = Math.max(G.maxChain, chain);
    // C0: the board-top tag carries cascade count and the real multiplier (one fixed place); centre text only at waves 3/5/8
    // and active special+special combos, short and replacing (never queued)
    if (chain >= 2) { G.waveTag = { n: chain, pct: sc ? sc.pct : 100, t0: now() }; Sound.chime(Math.min(chain, 8)); Haptic.buzz(Math.min(40, 10 + chain * 6)); }
    if (ev.combo) G.combos++;
    if (sc && sc.combo) centerText(ev.combo || '组合!', '#ff8a3d', 3);
    else if (chain === 3 || chain === 5 || chain === 8) centerText(chain === 8 ? '果冻狂欢!' : chain === 5 ? '软糯爆发!' : '超弹!', null, chain === 8 ? 3 : chain === 5 ? 2 : 1);
    if (completedNow) after(120, ep, function () { Sound.goal(); });
    if (sc && sc.total > 0) {   // one merged popup per wave (all clear areas of the wave), at most two on screen
      var pts = [];
      removed.forEach(function (e) { pts.push([cellX(e.p.c), cellY(e.p.r)]); });
      if (!pts.length) [ev.crates, ev.frost, ev.ties || []].forEach(function (a) { a.forEach(function (h) { pts.push([cellX(h.c), cellY(h.r)]); }); });
      if (pts.length) {
        var sx = 0, sy = 0; pts.forEach(function (q) { sx += q[0]; sy += q[1]; });
        wavePopup(sx / pts.length, sy / pts.length, '+' + sc.total, removed.length ? (TCOL[removed[0].p.type] || TCOL.rainbow) : [214, 150, 90], sc.creation + sc.combo > 0);
      }
    }
    removed.forEach(function (e) { if (e.delay <= 0) popPiece(e.p, chain, n); else after(e.delay, ep, function () { popPiece(e.p, chain, n); }); });
    ev.fx.forEach(function (f0) { var f = { kind: f0.kind, dir: f0.dir, r: f0.r, c: f0.c, rad: f0.rad, fr: f0.fr, fc: f0.fc, tr: f0.tr, tc: f0.tc, i: f0.i, big: f0.big, col: colOf(f0.type) };
      if (f0.t <= 0) spawnFx(f, chain); else after(f0.t, ep, function () { spawnFx(f, chain); }); });
    if (ev.crates.length || ev.frost.length || (ev.ties && ev.ties.length)) noteEvent(describeWave(ev));
  }
  var CRUMB = [222, 172, 104];
  function crateHitFx(h) {
    var q = G.crates[h.id]; if (!q) return;
    q.hp = h.hp1; q.hitT = now(); G.obsRev++;
    var x = cellX(h.c), y = cellY(h.r);
    for (var i = 0, n = tierN(h.hp1 ? 6 : 12); i < n; i++) { var a = rnd(0, 6.28), s2 = rnd(80, 240); newPart('drop', x + Math.cos(a) * L.cell * 0.2, y + Math.sin(a) * L.cell * 0.2, Math.cos(a) * s2, Math.sin(a) * s2 - 160, rnd(2, 4), CRUMB, rnd(320, 560)); }
    Sound.thud(!h.hp1); Haptic.buzz(h.hp1 ? 10 : 22); addTrauma(h.hp1 ? 0.08 : 0.18);
    neighbourKick(h.r - 1, h.c, 0, -160); neighbourKick(h.r, h.c - 1, -160, 0); neighbourKick(h.r, h.c + 1, 160, 0);
    if (!h.hp1) {   // whole box pops off and falls away (like the jellies)
      delete G.crates[h.id];
      var dir = Math.random() < 0.5 ? -1 : 1;
      G.crateFx.push({ x: x, y: y, vx: dir * rnd(60, 160), vy: -rnd(420, 560), rot: 0, w: dir * rnd(3, 6), t0: now(), hp: 1 });
    }
  }
  function frostHitFx(h) {
    var k = h.r * COLS + h.c, f = G.frost[k]; if (!f) return;
    f.layers = h.l1; f.hitT = now(); G.obsRev++;
    if (!h.l1) { G.frost[k] = null; G.frostFx.push({ r: h.r, c: h.c, t0: now() }); }
    Sound.peel(!h.l1);
  }
  function tieFx(h) {
    var k = h.r * COLS + h.c, q = G.ties[k]; if (!q || q.id !== h.id) return;
    delete G.ties[k]; G.tieFx.push({ r: h.r, c: h.c, t0: now() });
    var x = cellX(h.c), y = cellY(h.r);
    for (var i = 0, n = tierN(8); i < n; i++) { var a = rnd(0, 6.28), s2 = rnd(90, 220); newPart('drop', x, y, Math.cos(a) * s2, Math.sin(a) * s2 - 120, rnd(2, 3.5), [122, 206, 170], rnd(260, 420)); }
    Sound.peel(true); Haptic.buzz(12);
  }
  function playDeliver(e, ep) {
    var col = [255, 179, 196];
    e.items.forEach(function (it) {
      var b = G.baskets[it.id]; if (!b) return;
      delete G.baskets[it.id]; G.dlvFx.push({ b: b, t0: now() });
      burstSparks(cellX(it.c), cellY(it.r) + L.cell * 0.4, 12, col);
    });
    if (e.items.length) {   // C0: one merged popup per delivery commit (fixed 1000 each, no multiplier)
      var dx = 0, dy = 0; e.items.forEach(function (it) { dx += cellX(it.c); dy += cellY(it.r); });
      wavePopup(dx / e.items.length, dy / e.items.length - L.cell * 0.3, '送达 +' + (e.sc ? e.sc.points : 1000 * e.items.length), [96, 170, 130], true);
    }
    e.goals.forEach(function (gq) {
      var g = G.goals[gq.i]; if (!g) return; var left = Math.max(0, gq.target - gq.progress);
      if (left !== g.left) { g.left = left; G.goalPop[g.type] = now(); if (!left && !g.done) { g.done = true; after(120, ep, function () { Sound.goal(); }); } }
    });
    setScore(e.score); Sound.chime(2); Haptic.buzz([8, 20, 8]);
    noteEvent('送达 ' + e.items.length + ' 个果篮：' + e.items.map(function (it) { return '#' + it.id + ' @(' + it.r + ',' + it.c + ')'; }).join('、') + '（每实例计 1 次）');
    return Clock.wait(T.deliver || 320).then(function () { if (ep !== G.epoch) return NEVER(); });
  }
  function playFall(fv, ep, stagger) {
    var touched = {};
    fv.moves.forEach(function (m) { var p = G.pieces[m.id]; if (p && G.board[m.r0][m.c] === p) G.board[m.r0][m.c] = null; });
    fv.moves.forEach(function (m) { var p = G.pieces[m.id]; if (!p) { var bk = G.baskets[m.id]; if (bk) { bk.r = m.r1; touched[m.c] = 1; } return; } G.board[m.r1][m.c] = p; p.r = m.r1; touched[m.c] = 1; });
    fv.spawns.forEach(function (s) {
      var internal = s.seg0 > 0;
      var p = newPiece(s.type, s.r, s.c, internal ? s.r : s.r - s.n - 0.15, null, s.id);
      G.board[s.r][s.c] = p; touched[s.c] = 1;
      if (internal) {   // internal spawner: the jelly emerges at its cell (falling through the void above would overlap the upper segment)
        p.alpha = 0; p.sqW = 0.3; p.sqH = 0.3; var tok = ++p.sqTok;
        Clock.tween(T.refillBase + 60, function (e) { if (p.sqTok === tok) { p.alpha = Math.min(1, e * 1.6); p.sqW = p.sqH = lerp(0.3, 1, e); } }, E.outBack);
      }
    });
    var cols = Object.keys(touched).map(Number).sort(function (a, b) { return a - b; });
    return Promise.all(cols.map(function (c, i) { return dropColumn(c, columnPieces(c), stagger ? i * 18 : 0, ep); }));
  }
  function playShuffle(e, ep) {
    var movers = [];
    e.map.forEach(function (m) { var p = G.pieces[m.id]; if (p && G.board[p.r][p.c] === p) G.board[p.r][p.c] = null; });
    e.map.forEach(function (m) {
      var p = G.pieces[m.id]; if (!p) return;
      G.board[m.r][m.c] = p; p.r = m.r; p.c = m.c;
      movers.push({ p: p, x0: p.x, y0: p.y, tok: ++p.mvTok, arc: rnd(-0.3, 0.3) });
    });
    G.revision++;
    Sound.swap(); Sound.chime(2);
    return Clock.tween(T.shuffle + 120, function (e2, t) {
      var s = Math.sin(Math.PI * t);
      movers.forEach(function (m) {
        if (m.p.mvTok !== m.tok) return;
        m.p.x = lerp(m.x0, m.p.c, e2) + m.arc * s * (G.reduced ? 0.35 : 1); m.p.y = lerp(m.y0, m.p.r, e2) - 0.16 * s; m.p.out = 0.1 * s;
      });
    }, E.smooth).then(function () {
      if (ep !== G.epoch) return NEVER();
      movers.forEach(function (m) { m.p.out = 0; m.p.x = m.p.c; m.p.y = m.p.r; landSquash(m.p); m.p.body.land(300 * ampK()); });
      landSound();
    });
  }
  function starsFor(score) { var s = lv().stars, n = 0; for (var i = 0; i < 3; i++) if (score >= s[i]) n++; return n; }
  function commitResult(win) {
    if (G.result) return;
    var fin = CS.scoring.final, bd = Core.Score.breakdown(CS.scoring);
    G.result = { win: win, stars: win ? CS.starsEarned : 0, movesLeft: CS.moves, bonus: win ? CS.bonus : 0, t0: now() + 300, runId: G.epoch, maxChain: G.maxChain,
      missing: G.goals.filter(function (g) { return g.left > 0; }).map(function (g) { return { type: g.type, left: g.left }; }),
      final: fin, finalScore: fin.finalScore, breakdown: bd, open: false, rec: null, revealT: null, skipped: false };
    // the logical final score is decided once by the core; the panel only reveals it (subtotal → +clear → +moves → final)
    if (!win) setScore(fin.finalScore);
    G.phase = 'result'; G.sel = null; G.toolMode = null; G.hover = null;
    G.result.rec = saveProgress(win);
    ptNotify('result');
    after(300, G.epoch, function () { if (win) { Sound.win(); confetti(); } else Sound.lose(); });
  }
  // C: player progress v2 (js/progress_store.js). Only formal catalog levels write; playtest, rule-test fixtures and
  // verification chapters never write progress, stars or records. Bests are kept per scoreVersion + contentRevision.
  var PG = window.JellyProgress, PGS = null;
  function progress() { if (!PGS) { try { PGS = PG.load(window.localStorage); } catch (e) { PGS = { state: PG.fresh(), source: 'fresh', writable: false, reason: 'storage_unavailable' }; } } return PGS; }
  function chapterOf(id) { var cs = LVDATA.catalog.chapters; for (var i = 0; i < cs.length; i++) if (cs[i].levels.indexOf(id) >= 0) return cs[i]; return null; }
  function isFormal() { var ch = DEF && chapterOf(DEF.levelId); return !!(PLAY.mode === 'normal' && PLAY.source === 'catalog' && ch && ch.formal && !isFixture()); }
  function challengeValid(win) {
    var c = PLAY.challenge, fin = CS.scoring.final;
    return !!(c && win && PLAY.initOk && CS.seed === c.seed && DEF.contentRevision === c.contentRevision && CS.scoreVersion === c.scoreVersion &&
      Core.RULESET === c.rulesetVersion && Core.RNG_ALGO === c.rngAlgo && DEF.moveLimit === c.moves && !fin.assisted && !CS.diag &&
      Core.hashStr(JSON.stringify([DEF.board, DEF.initial, DEF.spawnPool, DEF.moveLimit, DEF.goals, DEF.tools])).toString(16) === c.playHash);   // guard-tripped runs (max_waves) keep diagnostics but are never ranked
  }
  function saveProgress(win) {
    if (PLAY.tainted) return { written: false, why: 'debug' };
    if (PLAY.source === 'challenge' && PLAY.challenge && PLAY.mode === 'normal') {
      var cf = CS.scoring.final, cp = progress();
      var co = PG.recordChallenge(cp.state, PLAY.challenge, { won: win, valid: challengeValid(win), score: cf.finalScore, movesLeft: CS.moves, stars: win ? CS.starsEarned : 0,
        maxCascade: cf.maxCascade, maxStreak: cf.maxStreak, assisted: cf.assisted, seed: PLAY.seed, at: Date.now() });
      co.challenge = true; co.written = PG.save(window.localStorage, cp); return co;
    }
    if (!isFormal()) return { written: false, why: PLAY.mode === 'playtest' ? 'playtest' : isFixture() ? 'fixture' : 'not_formal' };
    var fin = CS.scoring.final, pg = progress();
    var out = PG.recordLevel(pg.state, { levelId: DEF.levelId, contentRevision: DEF.contentRevision, scoreVersion: CS.scoreVersion, won: win, score: fin.finalScore,
      movesLeft: CS.moves, stars: win ? CS.starsEarned : 0, maxCascade: fin.maxCascade, maxStreak: fin.maxStreak, assisted: fin.assisted, seed: PLAY.seed, at: Date.now() });
    out.written = PG.save(window.localStorage, pg); return out;
  }

  // ---------------------------------------------------------------- ordinary swap (validated by the core before anything moves)
  function adjacent(a, b) { return Math.abs(a.r - b.r) + Math.abs(a.c - b.c) === 1; }
  function trySwap(a, b) {
    if (G.phase !== 'ready' || a === b || !a || !b || !adjacent(a, b) || a.dead || b.dead) return;
    var res = Core.apply(CS, { type: 'swap', r1: a.r, c1: a.c, r2: b.r, c2: b.c });
    if (!res.ok && res.reason === 'not_movable') {   // v3.1: tied host — tug against the strap, nothing is spent
      [a, b].forEach(function (p) { if (CS.over[p.r * COLS + p.c]) { p.body.kick((b.c - a.c) * 380 * ampK(), (b.r - a.r) * 380 * ampK(), 'all'); squashTo(p, 1.08, 0.94, 90).then(function () { squashTo(p, 1, 1, 380, E.elastic); }); } });
      toast('被绑住的果冻不能移动，但可以原地参与匹配', 1400); Sound.ret(); G.sel = null; return;
    }
    if (!res.ok && res.reason === 'no_target') toast(REASON.no_target, 1500);
    if (!res.ok && res.reason !== 'no_match' && res.reason !== 'no_target') return;   // e.g. no moves left: nothing happens, nothing is spent
    var ep = G.epoch, valid = res.ok, mv = CS.moves, evs = res.events;
    if (valid) opBegin();
    G.phase = 'busy'; G.sel = null; G.hint = null; G.lastInputAt = now(); G.gesture = null;
    [a, b].forEach(function (p) { p.x += p.ox; p.y += p.oy; p.ox = p.oy = 0; p.held = false; p.fdepT = 0; });
    var ax = a.x, ay = a.y, bx = b.x, by = b.y, tx = b.c - a.c, ty = b.r - a.r;
    var nx = -ty, ny = tx, arc = T.swapArc * (G.reduced ? RM.swap_arc_multiplier : 1);
    a.z = 1; b.z = 0;
    var tokA = ++a.mvTok, tokB = ++b.mvTok;
    a.body.kick(tx * 420 * ampK(), ty * 420 * ampK(), 'all'); b.body.kick(-tx * 260 * ampK(), -ty * 260 * ampK(), 'all');
    springBack(a, 'drag', 140);
    if (valid) {
      Clock.tween(T.swap, function (e, t) {
        var s = Math.sin(Math.PI * t), os = 0.07 * Math.sin(Math.PI * clamp((t - 0.55) / 0.45, 0, 1)) * (G.reduced ? 0.4 : 1);
        if (a.mvTok === tokA) { a.x = lerp(ax, b.c, e) + nx * arc * s + tx * os; a.y = lerp(ay, b.r, e) + ny * arc * s + ty * os; }
        if (b.mvTok === tokB) { b.x = lerp(bx, a.c, e) - nx * arc * s - tx * os; b.y = lerp(by, a.r, e) - ny * arc * s - ty * os; }
      }, E.smooth).then(function () {
        if (ep !== G.epoch) return;
        var ar = a.r, ac = a.c; a.r = b.r; a.c = b.c; b.r = ar; b.c = ac;
        G.board[a.r][a.c] = a; G.board[b.r][b.c] = b; a.x = a.c; a.y = a.r; b.x = b.c; b.y = b.r;
        G.moves = mv; G.revision++;
        Sound.swap(); Haptic.buzz(10);
        landSquash(a); landSquash(b); a.z = b.z = 0;
        a.body.kick(tx * 300 * ampK(), ty * 300 * ampK(), 'all'); b.body.kick(-tx * 300 * ampK(), -ty * 300 * ampK(), 'all');
        playFrom(evs, 1, ep);
      });
    } else {
      var d = 0.38;
      Clock.tween(T.rejOut, function (e) {
        if (a.mvTok === tokA) { a.x = lerp(ax, a.c + tx * d, e); a.y = lerp(ay, a.r + ty * d, e); }
        if (b.mvTok === tokB) { b.x = lerp(bx, b.c - tx * d, e); b.y = lerp(by, b.r - ty * d, e); }
      }, E.smooth).then(function () {
        if (ep !== G.epoch) return NEVER();
        Sound.ret(); Haptic.buzz([6, 40, 6]);
        a.body.kick(-tx * 520 * ampK(), -ty * 520 * ampK(), 'all'); b.body.kick(tx * 520 * ampK(), ty * 520 * ampK(), 'all');
        [a, b].forEach(function (p) { squashTo(p, amp(tx ? 0.86 : 1.12), amp(tx ? 1.12 : 0.86), 70).then(function () { squashTo(p, 1, 1, 420, E.elastic); }); });
        var ax1 = a.x, ay1 = a.y, bx1 = b.x, by1 = b.y;
        return Clock.tween(T.rejBack + 80, function (e) {
          a.x = lerp(ax1, a.c, e); a.y = lerp(ay1, a.r, e); b.x = lerp(bx1, b.c, e); b.y = lerp(by1, b.r, e);
        }, E.outBack);
      }).then(function () { if (ep !== G.epoch) return; a.z = 0; setReady(); });
    }
  }

  function restartLevel(sameSeed) { startDef(DEF, sameSeed ? PLAY.seed : null); }
  // ---------------------------------------------------------------- v3: editor playtest bridge (iframe + postMessage; works on file://)
  function ptNotify(kind) {
    if (PLAY.mode !== 'playtest' || window.parent === window) return;
    try {
      window.parent.postMessage({ type: 'jelly_playtest_status', kind: kind, token: PLAY.ptToken, levelId: DEF && DEF.levelId, contentRevision: DEF && DEF.contentRevision, seed: PLAY.seed,
        phase: CS && CS.phase, moves: CS && CS.moves, score: CS && CS.score, goals: CS ? CS.goals.map(function (g) { return { type: g.type, typeId: g.typeId, progress: g.progress, target: g.target }; }) : [],
        tools: CS && CS.tools, lastEvent: G.lastEv && G.lastEv.text, hash: CS && Core.stateHash(CS), log: CS && CS.log.length }, '*');
    } catch (e) { }
  }
  function ptExit() { if (window.parent !== window) window.parent.postMessage({ type: 'jelly_playtest_exit' }, '*'); }
  window.addEventListener('message', function (e) {
    var d = e.data; if (!d || PLAY.mode !== 'playtest' || !d.type) return;
    if (d.token != null) PLAY.ptToken = d.token;   // the editor ignores status from older instances
    if (d.type === 'jelly_playtest_load') {
      var r = LS.parse(d.levelJson);
      if (!r.ok) { window.parent.postMessage({ type: 'jelly_playtest_error', errors: r.errors }, '*'); return; }
      if (!bgLayer) { PT_PENDING = { def: r.def, seed: d.seed }; return; }
      startDef(r.def, d.seed, 'playtest');
    } else if (d.type === 'jelly_playtest_restart' && DEF) startDef(DEF, d.seed != null ? d.seed : null, 'playtest');
  });
  var PT_PENDING = null;

  // ---------------------------------------------------------------- tools (cost is committed by the core only when the action is accepted)
  var REASON = { no_tool: '这个道具已经用完了', nothing_to_hit: '这里没有可以敲的东西', off_board: '请选择棋盘内的格子', not_movable: '被绑住的果冻、果篮和箱子不能换位',
    immune: '果篮不怕小锤，这里没有可以敲的东西（未消耗道具）', no_target: '场上没有这种颜色的普通果冻，组合无效（未扣步数）',
    same_piece: '两颗相同的果冻换位没有变化', no_candidate: '暂时无法生成重排，未消耗道具', stale_preview: '预览已过期，未消耗道具', not_ready: '请稍等' };
  function enterTool(kind) {
    if (G.phase === 'tool' && G.toolMode && G.toolMode.kind === kind) { exitTool(); return; }
    if (G.phase !== 'ready' && G.phase !== 'tool') return;
    if (G.toolMode && G.toolMode.busy) return;
    if (G.tools[kind] <= 0) { toast('这个道具已经用完了'); return; }
    G.sel = null; G.hint = null; G.hover = null; Sound.ui();
    if (kind === 'shuffle') {
      var cand = Core.previewShuffle(CS);
      if (!cand) { exitTool(); toast('暂时无法生成重排，未消耗道具', 1500); return; }
      G.toolMode = { kind: 'shuffle', cand: cand };
      G.phase = 'tool'; G.panel = { kind: 'shuffle', t0: now() };
      return;
    }
    G.toolMode = { kind: kind, first: null, t0: now() };
    G.phase = 'tool';
  }
  function exitTool() {
    if (G.toolMode && G.toolMode.busy) return;
    G.toolMode = null; G.hover = null;
    if (G.panel && G.panel.kind === 'shuffle') G.panel = null;
    if (G.phase === 'tool') setReady();
  }
  function hammerStrike(cell) {
    var tm = G.toolMode; if (!tm || tm.kind !== 'hammer' || tm.busy || !cell) return;
    var res = Core.apply(CS, { type: 'hammer', r: cell.r, c: cell.c });
    if (!res.ok) { toast(REASON[res.reason] || '这里不能使用小锤', 1100); return; }
    tm.busy = true; opBegin();
    var ep = G.epoch, p = G.board[cell.r][cell.c], cr = crateAt(cell.r, cell.c);
    G.phase = 'busy'; G.hover = { r: cell.r, c: cell.c };
    G.hammerFx = { r: cell.r, c: cell.c, t0: now() };
    if (p) squashTo(p, 1.06, 0.95, T.hammerWind);
    after(T.hammerWind, ep, function () {
      Sound.press(p ? spriteOf(p) : 'jelly_bear'); Haptic.buzz(25); addTrauma(0.25);
      G.toolMode = null; G.hover = null;
      if (p && !p.dead) { p.body.land(900 * ampK()); squashTo(p, amp(1.35), amp(0.62), 50); }
      playFrom(res.events, 1, ep);
    });
  }
  function toolSwapPick(cell) {
    var tm = G.toolMode; if (!tm || tm.kind !== 'swap' || tm.busy || !cell) return;
    var p = G.board[cell.r][cell.c];
    if (!p || p.dead) { if (crateAt(cell.r, cell.c)) { toast('箱子不能移动', 1000); Sound.ret(); } else if (basketAt(cell.r, cell.c)) { toast('果篮不能用交换道具移动', 1000); Sound.ret(); } return; }
    if (CS.over[cell.r * COLS + cell.c]) { toast('被绑住的果冻不能移动', 1000); Sound.ret(); p.body.kick(240, 0, 'top'); return; }
    if (!tm.first) { tm.first = p.id; press(p); return; }
    if (tm.first === p.id) { tm.first = null; return; }
    var a = G.pieces[tm.first];
    if (!a) { tm.first = p.id; return; }
    var res = Core.apply(CS, { type: 'toolSwap', r1: a.r, c1: a.c, r2: p.r, c2: p.c });
    if (!res.ok) { toast(REASON[res.reason] || '不能这样换位'); p.body.kick(300, 0, 'top'); Sound.ret(); return; }
    tm.busy = true; press(p); opBegin();
    var ep = G.epoch, b = p;
    G.phase = 'busy';
    var ax = a.x, ay = a.y, bx = b.x, by = b.y, dx = b.c - a.c, dy = b.r - a.r, len = Math.sqrt(dx * dx + dy * dy);
    var nx = -dy / len, ny = dx / len, sep = (T.toolSwapSep + Math.min(0.3, 0.05 * len)) * (G.reduced ? RM.swap_arc_multiplier : 1);
    a.z = 2; b.z = 1;
    var ta = ++a.mvTok, tb = ++b.mvTok;
    Clock.tween(T.toolSwap + 60, function (e, t) {
      var s = Math.sin(Math.PI * t);
      if (a.mvTok === ta) { a.x = lerp(ax, b.c, e) + nx * sep * s; a.y = lerp(ay, b.r, e) + ny * sep * s - 0.06 * s; a.out = 0.2 * s; }
      if (b.mvTok === tb) { b.x = lerp(bx, a.c, e) - nx * sep * s; b.y = lerp(by, a.r, e) - ny * sep * s; b.out = -0.05 * s; }
    }, E.smooth).then(function () {
      if (ep !== G.epoch) return;
      a.out = b.out = 0; a.z = b.z = 0;
      var ar = a.r, ac = a.c; a.r = b.r; a.c = b.c; b.r = ar; b.c = ac;
      G.board[a.r][a.c] = a; G.board[b.r][b.c] = b; a.x = a.c; a.y = a.r; b.x = b.c; b.y = b.r;
      G.revision++; G.toolMode = null;
      Sound.swap();
      landSquash(a, 1.2); landSquash(b, 1.2); a.body.land(400 * ampK()); b.body.land(400 * ampK());
      after(T.cascadeGap, ep, function () { playFrom(res.events, 1, ep); });
    });
  }
  function confirmShuffle() {
    var tm = G.toolMode; if (!tm || tm.kind !== 'shuffle' || tm.busy) return;
    var res = Core.apply(CS, { type: 'shuffle', expect: tm.cand.hash });
    if (!res.ok) { exitTool(); toast(REASON[res.reason] || '预览已过期，未消耗道具'); return; }
    tm.busy = true; opBegin();
    var ep = G.epoch;
    G.panel = null; G.toolMode = null; G.phase = 'busy';
    playFrom(res.events, 0, ep);
  }

  // ---------------------------------------------------------------- juice: particles, decals, rings, beams, blasts, zaps, shake
  function addTrauma(v) { if (!G.reduced) G.trauma = Math.min(1, G.trauma + v); }
  function praise(text, col) { centerText(text, col, 1); }
  // ---- C0 score presentation -------------------------------------------------------------------------------------------
  // One display controller. G.score = logic target (set only from committed core events); G.dispScore only chases it.
  // A new target restarts the chase from the CURRENT shown value (no queued tweens); it lands 300 ms (400 ms for big gains)
  // after the last points, hard cap 600 ms. Monotonic within a run; reset on a new run.
  var SD = { from: 0, to: 0, t0: 0, dur: 0, pulseT: -1e9, sets: 0 }, SD_CAP = 600, SDTR = { on: false, rec: [] };
  function sdReset() { SD.from = SD.to = 0; SD.t0 = now(); SD.dur = 0; SD.pulseT = -1e9; SD.sets = 0; G.dispScore = 0; G.op = null; }
  function sdValue(t) { if (SD.dur <= 0) return SD.to; var k = clamp((t - SD.t0) / SD.dur, 0, 1); return k >= 1 ? SD.to : SD.from + (SD.to - SD.from) * (1 - Math.pow(1 - k, 3)); }
  function setScore(v) {
    if (!(v > SD.to)) { G.score = Math.max(G.score, v); return; }
    var t = now(), cur = sdValue(t);
    SD.from = cur; SD.to = v; SD.t0 = t; SD.dur = Math.min(SD_CAP, v - cur >= 3000 ? 400 : 300); SD.sets++;
    G.score = v;
    if (G.op) G.op.gain = v - G.op.base;
    if (t - SD.pulseT >= 150) SD.pulseT = t;   // small container pulse, at most every 150 ms
  }
  function sdSkip() { SD.from = SD.to; SD.dur = 0; G.dispScore = SD.to; }
  function opBegin() { G.op = { base: G.score, gain: 0, t0: now(), endT: null }; G.skillTag = null; }
  function wavePopup(x, y, txt, col, strong) {   // merged per wave; at most two on screen (the oldest is dropped)
    var B = L.B, m = L.cell * 0.6;
    x = clamp(x, B.x + m * 1.4, B.x + B.w - m * 1.4); y = clamp(y, B.y + m, B.y + B.h - m * 1.2);
    while (G.popups.length >= 2) G.popups.shift();
    G.popups.push({ x: x, y: y, text: txt, t0: now() + 40, dur: 480, size: strong ? 26 : 23, col: col });
  }
  // centre text: one at a time (a new one replaces), 80 ms in + 220 ms hold + 100 ms out, ≤ 40 % of the board width
  var CT_IN = 80, CT_HOLD = 220, CT_OUT = 100;
  function centerText(text, col, prio) {
    var t = now(), c = G.center;
    if (c && t - c.t0 < CT_IN + CT_HOLD && (c.prio || 0) > (prio || 0)) return;   // a higher-priority message on screen is not replaced by a lower one
    G.center = { text: text, col: col, prio: prio || 0, t0: t };
  }
  function rgba(c, a) { return 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',' + a + ')'; }
  // v2.2: particles come from a pool, are capped per tier and their count scales with the tier (high = v2.1 counts)
  var PPOOL = [];
  function newPart(k, x, y, vx, vy, r, col, life) {
    if (G.parts.length >= Q.cur.partCap) return null;
    var q = PPOOL.length ? PPOOL.pop() : {};
    q.k = k; q.x = x; q.y = y; q.vx = vx; q.vy = vy; q.r = r; q.col = col; q.t0 = now(); q.life = life; q.rot = null; q.w = 0; q.spr = null;
    G.parts.push(q); return q;
  }
  function tierN(n) { return Q.cur.partK >= 1 ? n : Math.max(2, Math.round(n * Q.cur.partK)); }
  function splat(x, y, col, chain, size, sp) {
    var red = G.reduced, n = red ? 4 : tierN(Math.min(22, 8 + chain * 2 + (sp ? 6 : 0))), cell = L.cell;
    for (var i = 0; i < n; i++) {
      var a = rnd(0, Math.PI * 2), sp2 = rnd(120, 340) * (red ? 0.5 : 1) * (1 + 0.08 * chain);
      newPart('drop', x + Math.cos(a) * cell * 0.15, y + Math.sin(a) * cell * 0.15, Math.cos(a) * sp2, Math.sin(a) * sp2 - rnd(120, 260), rnd(2.2, 5.6) * (i < 3 ? 1.4 : 1), col, rnd(420, 760));
    }
    // goo decal on the tray (irregular blob + satellites), fades out; v2.2: baked once into a small sprite
    var blobs = [];
    for (var j = 0; j < 7; j++) { var ang = rnd(0, 6.28), d = j === 0 ? 0 : rnd(0.12, 0.42) * cell; blobs.push([Math.cos(ang) * d, Math.sin(ang) * d, (j === 0 ? 0.34 : rnd(0.06, 0.16)) * cell]); }
    var hsh = Math.abs(Math.sin(x * 12.9898 + y * 78.233) * 43758.5453) % 1;   // deterministic shape / angle (keeps the random stream unchanged)
    G.decals.push({ x: x, y: y, blobs: blobs, col: col, t0: now(), dur: 950, spr: R && R.gl ? null : decalSprite(blobs, col),
      shape: Math.floor(hsh * 8) % 8, rot: hsh * 6.283 * 7 % 6.283, gc: [col[0] / 255, col[1] / 255, col[2] / 255] });
    if (size <= 6 || sp || Math.random() < 0.35) G.rings.push({ x: x, y: y, t0: now(), dur: 300, r0: 0.25, r1: 0.9 + 0.05 * Math.min(6, chain), col: col, w: 3.5 });
  }
  function burstSparks(x, y, n, col) {
    n = tierN(n);
    for (var i = 0; i < n; i++) {
      var a = rnd(0, 6.28), s = rnd(140, 380);
      newPart('spark', x, y, Math.cos(a) * s, Math.sin(a) * s, rnd(2, 4), col || hsvCol(Math.floor(Math.random() * 36) / 36), rnd(380, 620));
    }
  }
  function hsvCol(h) { var i = Math.floor(h * 6), f = h * 6 - i, q = 1 - f, m = [[1, f, 0], [q, 1, 0], [0, 1, f], [0, q, 1], [f, 0, 1], [1, 0, q]][i % 6]; return [Math.round(150 + 105 * m[0]), Math.round(150 + 105 * m[1]), Math.round(150 + 105 * m[2])]; }
  function confetti() {
    if (G.reduced) return;
    for (var i = 0, n = tierN(70); i < n; i++) { var q = newPart('conf', L.W / 2 + rnd(-60, 60), L.panel.cy - 120, rnd(-420, 420), rnd(-720, -260), rnd(3, 6), hsvCol(Math.random()), rnd(1200, 2000)); if (q) { q.rot = rnd(0, 6); q.w = rnd(-12, 12); q.cs = rgba(q.col, 1); } }
  }
  function spawnFx(f, chain) {
    var t = now(), x = cellX(f.c != null ? f.c : f.fc), y = cellY(f.r != null ? f.r : f.fr);
    if (f.kind === 'beam') {
      G.beams.push({ dir: f.dir, x: x, y: y, t0: t, col: f.col });
      Sound.stripe(); Haptic.buzz(14); addTrauma(0.22);
      for (var i = 0; i < 7; i++) {
        (function (i) {
          var d = Math.abs(i - (f.dir === 'h' ? f.c : f.r)) * 24;
          Clock.wait(d).then(function () {
            if (f.dir === 'h') { neighbourKick(f.r - 1, i, 0, -280); neighbourKick(f.r + 1, i, 0, 280, 'all'); }
            else { neighbourKick(i, f.c - 1, -300, 0); neighbourKick(i, f.c + 1, 300, 0); }
          });
        })(i);
      }
    } else if (f.kind === 'blast') {
      G.blasts.push({ x: x, y: y, t0: t, rad: f.rad, col: f.col });
      Sound.bomb(); Haptic.buzz([30, 20, 40]); addTrauma(f.rad > 1 ? 0.75 : 0.5);
      if (!G.reduced) G.hitStop = Math.max(G.hitStop, f.rad > 1 ? 60 : 50);
      burstSparks(x, y, f.rad > 1 ? 26 : 16, [255, 200, 120]);
      for (var id in G.pieces) {   // ripple of impulses through the whole board
        (function (p) {
          var dx = p.c - f.c, dy = p.r - f.r, d = Math.sqrt(dx * dx + dy * dy); if (d < 0.5) return;
          Clock.wait(d * 45).then(function () { if (!p.dead) p.body.kick(dx / d * 900 / (0.6 + d) * ampK(), dy / d * 900 / (0.6 + d) * ampK(), 'all'); });
        })(G.pieces[id]);
      }
    } else if (f.kind === 'zap') {
      G.zaps.push({ x0: x, y0: y, x1: cellX(f.tc), y1: cellY(f.tr), t0: t, seed: Math.random(), h: (f.i * 0.13) % 1 });
      Sound.zap(f.i); if (f.i % 3 === 0) addTrauma(0.05);
    } else if (f.kind === 'rainbow') {
      Sound.rainbow(); Haptic.buzz([20, 30, 20, 30, 40]); addTrauma(f.big ? 0.8 : 0.35);
      G.rings.push({ x: x, y: y, t0: t, dur: f.big ? 900 : 600, r0: 0.3, r1: f.big ? 7 : 3.2, col: null, w: 10 });
      burstSparks(x, y, f.big ? 40 : 22, null);
      if (!G.reduced) G.hitStop = Math.max(G.hitStop, 55);
    }
  }
  function alive(list, life, t) {   // v2.2: in-place compaction (no new arrays per frame)
    var j = 0; for (var i = 0; i < list.length; i++) { var q = list[i]; if (t - q.t0 < (q.dur || life)) list[j++] = q; } list.length = j;
  }
  function updateFx(dt) {
    var s = dt / 1000, t = now(), P = G.parts, j = 0;
    for (var i = 0; i < P.length; i++) {
      var q = P[i], age = t - q.t0;
      if (age > q.life) { PPOOL.push(q); continue; }
      var g = q.k === 'conf' ? 900 : q.k === 'spark' ? 300 : 1100;
      q.vy += g * s; q.x += q.vx * s; q.y += q.vy * s;
      var dr = q.k === 'conf' ? 0.985 : q.k === 'spark' ? 0.93 : 0.975; q.vx *= dr; q.vy *= q.k === 'drop' ? 1 : dr;
      if (q.rot != null) q.rot += q.w * s;
      P[j++] = q;
    }
    P.length = j;
    var D = G.decals, jd = 0; for (i = 0; i < D.length; i++) { if (t - D[i].t0 < (D[i].dur || 950)) D[jd++] = D[i]; else if (D[i].spr && DPOOL.length < 48) DPOOL.push(D[i].spr.c); } D.length = jd;
    alive(G.rings, 400, t); alive(G.popups, 480, t);
    alive(G.beams, 520, t); alive(G.blasts, 620, t); alive(G.zaps, 260, t); alive(G.frostFx, 360, t);
    for (i = 0, j = 0; i < G.crateFx.length; i++) {   // v3: a destroyed crate pops off and falls away
      var cf = G.crateFx[i]; cf.vy += 1700 * s; cf.x += cf.vx * s; cf.y += cf.vy * s; cf.rot += cf.w * s;
      if (cf.y < L.instr.y - L.cell * 0.15 && t - cf.t0 < 2500) G.crateFx[j++] = cf;   // C0: gone before the tool area
    }
    G.crateFx.length = j;
    G.trauma = Math.max(0, G.trauma - s * 1.7);
    G.glow = Math.max(0, G.glow - s * 0.9);
    var tr = G.trauma * G.trauma, ms = 11 * tr;
    G.shX = ms * (Math.sin(t * 0.091) * 0.6 + Math.sin(t * 0.173 + 1.3) * 0.4);
    G.shY = ms * (Math.sin(t * 0.083 + 2.1) * 0.6 + Math.sin(t * 0.191 + 0.4) * 0.4);
  }

  // ---------------------------------------------------------------- per-frame soft-body pose + simulation
  var H = JM.SIM_H, SIMCLK = new JM.SimClock(H, 0.1);
  function poseOf(p) {
    var t = now() / 1000, S = p.S;
    var x = cellX(p.x + p.ox), y = cellY(p.y + p.oy) + ANCHOR_K * S - p.lift * L.pitch;
    if (G.hint && (G.hint.a === p || G.hint.b === p) && G.phase === 'ready') {
      var ht = (now() - G.hint.t0) % 1500, hs = ht < 520 ? Math.sin(ht / 520 * Math.PI * 2) * 0.07 : 0, other = G.hint.a === p ? G.hint.b : G.hint.a;
      x += (other.c - p.c) * hs * L.pitch; y += (other.r - p.r) * hs * L.pitch;
    }
    var br = G.reduced || p.dead ? 0 : 0.013 * Math.sin(t * 2.2 + p.phase);
    var pulse = p.sp && !G.reduced ? 0.022 * Math.sin(t * 5.2 + p.phase) : 0;
    var o = (1 + 0.35 * p.out) * p.puff * (1 + pulse);
    var st = (!p.dead && !p.fly) ? clamp((p.vyc || 0) * 0.011, 0, 0.13) * ampK() : 0;
    if (p.held) { x += Math.sin(now() * 0.09 + p.phase * 9) * 1.3; y += Math.cos(now() * 0.11 + p.phase) * 0.8; }
    var bo = (1 + 0.35 * p.out) * p.puff, bsx = p.sqW * bo * (1 - st * 0.45), bsy = p.sqH * bo * (1 + st);   // breath/pulse-free part (sleep test)
    // v2.2: two pose objects per piece, alternated (the body keeps a reference to last frame's pose only)
    var pb = p._pb || (p._pb = [{}, {}]), pose = pb[p._pi = p._pi ? 0 : 1];
    pose.x = x; pose.y = y; pose.sx = p.sqW * o * (1 - br * 0.6) * (1 - st * 0.45); pose.sy = p.sqH * o * (1 + br) * (1 + st); pose.rot = p.rot;
    pose.dragX = p.dragX; pose.dragY = p.dragY; pose.fx = p.ffx; pose.fy = p.ffy; pose.fdepth = p.fdep; pose.bsx = bsx; pose.bsy = bsy;
    if (p.vol) JM.Volume.shapePose(p, pose);   // B display: part of the screen widening goes into depth instead (applied once, here)
    return pose;
  }
  function lerpPose(a, b, k) {
    return { x: lerp(a.x, b.x, k), y: lerp(a.y, b.y, k), sx: lerp(a.sx, b.sx, k), sy: lerp(a.sy, b.sy, k), rot: lerp(a.rot, b.rot, k),
      dragX: lerp(a.dragX, b.dragX, k), dragY: lerp(a.dragY, b.dragY, k), fx: b.fx, fy: b.fy, fdepth: lerp(a.fdepth, b.fdepth, k) };
  }
  function updatePiece(p, dt, sim) {
    var sdt = Math.max(0.001, dt / 1000);
    if (p.fly) stepFly(p, dt);
    p.vyc = p.prevY == null ? 0 : (p.y - p.prevY) / sdt; p.prevY = p.y;
    if (p.fdepFollow) p.fdep += (p.fdepT - p.fdep) * (1 - Math.exp(-dt / 45));
    p.flash *= Math.exp(-dt / 120);
    if (p.held) p.flash = Math.max(p.flash, 0.1 + 0.08 * Math.sin(now() * 0.05));
    // v2.1: fixed 1/120 s steps from the shared accumulator (SIMCLK), deformation interpolated for drawing, settled bodies sleep
    syncVol(p);
    p.body.rigid = !!(p.fly && Q.cur.rigidFly);   // v2.2 medium/low: pieces flying off-board skip the soft-body sim
    var pose = poseOf(p);
    p.body.advance(p.lastPose || pose, pose, SIMCLK, ampK());
    p.lastPose = pose;
    if (p.vol) p.vol.update(p, pose, dt);
  }
  function wantVol(p) { return OCTO.mode === 'B' && R && R.hasLit && R.hasLit() && p.type === 'jelly_octopus' && !p.sp; }
  function syncVol(p) {
    if (wantVol(p)) {
      var qc = Q.cur;
      if (!p.vol || p.vol.S !== p.body.S || p.vol.N !== qc.ng || p.vol.frontOnly !== qc.frontOnly) { try { p.vol = new JM.Volume(p, { ng: qc.ng, frontOnly: qc.frontOnly, fastPow: qc.fastPow }); } catch (e) { p.vol = null; if (window.console) console.warn(e); } }
    } else if (p.vol) p.vol = null;
  }
  function springBack(p, which, dur) {
    dur = dur || 520;
    if (which === 'drag') {
      var dx = p.dragX, dy = p.dragY, tok = p.dragTok = (p.dragTok || 0) + 1;
      if (Math.abs(dx) + Math.abs(dy) < 0.5) { p.dragX = p.dragY = 0; return; }
      Clock.tween(dur, function (e) { if (p.dragTok === tok) { p.dragX = dx * (1 - e); p.dragY = dy * (1 - e); } }, E.elastic);
    } else {
      p.fdepFollow = false; var d0 = p.fdep;
      if (d0 < 0.3) { p.fdep = 0; return; }
      Clock.tween(dur, function (e) { if (!p.fdepFollow) p.fdep = d0 * (1 - e); }, E.elastic);
      p.body.kick(0, -d0 * 9 * ampK(), 'top');
    }
  }
  function idleTick() {   // occasional little shivers so the board never looks frozen
    if (G.phase !== 'ready' || now() < G.idleNext || G.reduced) return;
    G.idleNext = now() + rnd(900, 1800);
    var p = G.board[Math.floor(Math.random() * 7)][Math.floor(Math.random() * 7)];
    if (!p || p === G.sel || p.held) return;
    var k = Math.random();
    if (k < 0.4) p.body.kick(rnd(-90, 90), 0, 'top');
    else if (k < 0.7) p.body.kick(rnd(-120, 120), 40, 'limbs');
    else p.body.land(rnd(90, 150));
  }
  function hintTick() {
    if (G.phase !== 'ready' || G.hint || G.sel || now() - G.lastInputAt < 7000) return;
    var m = Core.listMoves(CS, 1)[0]; if (!m) return;
    G.hint = { a: G.board[m[0]][m[1]], b: G.board[m[2]][m[3]], t0: now() };
  }

  // ---------------------------------------------------------------- input (pointer = mouse/touch/pen, keyboard)
  function toLogical(e) { var r = cB.getBoundingClientRect(); return { x: (e.clientX - r.left) / K, y: (e.clientY - r.top) / K }; }
  function cellAt(x, y) {
    var c = Math.floor((x - L.gx + L.gap / 2) / L.pitch), r = Math.floor((y - L.gy + L.gap / 2) / L.pitch);
    if (c < 0 || c >= COLS || r < 0 || r >= ROWS) return null;
    if (CS && !CS.mask[r * COLS + c]) return null;   // v3: void cells are not part of the board
    return { r: r, c: c };
  }
  function inRect(pt, b) { return pt.x >= b.x && pt.x <= b.x + b.w && pt.y >= b.y && pt.y <= b.y + b.h; }
  var hits = [];
  function hitButton(pt) { for (var i = hits.length - 1; i >= 0; i--) if (inRect(pt, hits[i])) return hits[i]; return null; }
  function fingerOn(p, pt) {   // finger dent position in the jelly's local (anchor) frame
    var ax = cellX(p.x), ay = cellY(p.y) + ANCHOR_K * p.S;
    p.ffx = clamp(pt.x - ax, -0.3 * p.S, 0.3 * p.S); p.ffy = clamp(pt.y - ay, -0.62 * p.S, -0.15 * p.S);
    p.fdepFollow = true; p.fdepT = 0.23 * p.S * (G.reduced ? 0.5 : 1); p.pressing = true;
  }
  function releaseFinger(p) {
    if (!p || !p.pressing) return;
    p.pressing = false; springBack(p, 'finger', 560);
    squashTo(p, 1, 1, 520, E.elastic);
  }
  function rubber(d, M) { var s = d < 0 ? -1 : 1; return s * M * (1 - Math.exp(-Math.abs(d) / M)); }

  cB.addEventListener('pointerdown', function (e) {
    Sound.unlock(); try { cB.focus({ preventScroll: true }); } catch (er) { }
    var pt = toLogical(e); G.lastInputAt = now(); G.hint = null;
    var btn = hitButton(pt);
    if (btn) { G.pressedBtn = { btn: btn, id: e.pointerId }; Haptic.buzz(6); return; }
    if (G.panel || G.phase === 'result') return;
    var cell = cellAt(pt.x, pt.y); if (!cell) return;
    try { cB.setPointerCapture(e.pointerId); } catch (er) { }
    var p = G.board[cell.r][cell.c];
    if (G.phase === 'tool' && G.toolMode) {
      if (G.toolMode.kind === 'hammer') { G.hover = cell; G.gesture = { id: e.pointerId, tool: 'hammer' }; }
      else if (G.toolMode.kind === 'swap') { G.gesture = { id: e.pointerId, tool: 'swap' }; }
      return;
    }
    if (G.phase !== 'ready' || !p) return;
    G.focus = null;
    press(p); fingerOn(p, pt);
    if (G.sel && G.sel !== p && !G.sel.dead && adjacent(G.sel, p)) { releaseFinger(p); trySwap(G.sel, p); return; }
    var wasSel = G.sel === p;
    if (!wasSel) { G.sel = p; G.selT = now(); }
    G.gesture = { id: e.pointerId, piece: p, sx: pt.x, sy: pt.y, drag: false, wasSel: wasSel, t0: performance.now() };
  });
  cB.addEventListener('pointermove', function (e) {
    var pt = toLogical(e);
    if (G.phase === 'tool' && G.toolMode && G.toolMode.kind !== 'shuffle' && !G.panel && !G.toolMode.busy) {
      if (e.pointerType === 'mouse' || (G.gesture && G.gesture.id === e.pointerId)) G.hover = cellAt(pt.x, pt.y);
    }
    var g = G.gesture; if (!g || g.id !== e.pointerId || !g.piece) return;
    var p = g.piece; if (p.dead || G.phase !== 'ready') { G.gesture = null; return; }
    var dx = pt.x - g.sx, dy = pt.y - g.sy, d = Math.sqrt(dx * dx + dy * dy);
    if (!g.drag && d > T.dragThresh) { g.drag = true; p.dragTok = (p.dragTok || 0) + 1; }
    if (!g.drag) return;
    var horiz = Math.abs(dx) >= Math.abs(dy), mag = horiz ? dx : dy, M = 0.42 * L.cell * (G.reduced ? 0.5 : 1);
    var tr = p.r + (horiz ? 0 : Math.sign(mag)), tc = p.c + (horiz ? Math.sign(mag) : 0);
    var canGo = tr >= 0 && tr < ROWS && tc >= 0 && tc < COLS && G.board[tr][tc];
    var st = rubber(mag, canGo ? M : M * 0.45);   // rubbery pull; weaker against the wall
    p.dragX = horiz ? st : 0; p.dragY = horiz ? 0 : st;
    if (canGo) { var q = G.board[tr][tc]; q.leanTok = 1; }
    if (Math.abs(mag) > 0.58 * L.cell && canGo) {
      G.gesture = null; p.pressing = false; p.fdepFollow = false; p.fdep = 0;
      trySwap(p, G.board[tr][tc]);
    }
  });
  function endPointer(e, cancelled) {
    var pt = toLogical(e);
    if (G.pressedBtn && G.pressedBtn.id === e.pointerId) {
      var b = G.pressedBtn.btn; G.pressedBtn = null;
      if (!cancelled && inRect(pt, b) && !b.disabled) b.fn();
      return;
    }
    var g = G.gesture; if (!g || g.id !== e.pointerId) return;
    G.gesture = null;
    try { cB.releasePointerCapture(e.pointerId); } catch (er) { }
    var c = cellAt(pt.x, pt.y);
    if (g.tool === 'hammer') { if (cancelled || !c) { G.hover = null; return; } if (G.phase === 'tool') hammerStrike(c); return; }
    if (g.tool === 'swap') { if (!cancelled && c && G.phase === 'tool') toolSwapPick(c); return; }
    var p = g.piece;
    releaseFinger(p);
    if (Math.abs(p.dragX) + Math.abs(p.dragY) > 0.5) {   // let go without a swap: snap back with a wobble
      var dx = p.dragX, dy = p.dragY; springBack(p, 'drag', 560);
      p.body.kick(-dx * 14 * ampK(), -dy * 14 * ampK(), 'all'); Sound.boing(spriteOf(p), false); Haptic.buzz(8);
    } else if (!cancelled && !g.drag && G.phase === 'ready') react(p);
    if (!g.drag && g.wasSel && !cancelled) G.sel = null;
  }
  cB.addEventListener('pointerup', function (e) { endPointer(e, false); });
  cB.addEventListener('pointercancel', function (e) { endPointer(e, true); });
  cB.addEventListener('pointerleave', function (e) { if (e.pointerType === 'mouse' && G.toolMode && !G.gesture) G.hover = null; });
  cB.addEventListener('contextmenu', function (e) { e.preventDefault(); });

  window.addEventListener('keydown', function (e) {
    if (PLAY.menu) return;   // the level-select overlay owns the keyboard (native buttons)
    Sound.unlock();
    var k = e.key;
    if (k === 'Escape') {
      if (G.panel && G.panel.kind === 'shuffle') exitTool();
      else if (G.panel && G.panel.kind !== 'result') G.panel = null;
      else if (G.phase === 'tool') exitTool();
      else G.sel = null;
      e.preventDefault(); return;
    }
    if (G.panel || G.phase === 'result') return;
    var dir = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] }[k];
    if (dir) {
      G.focus = G.focus ? { r: clamp(G.focus.r + dir[0], 0, 6), c: clamp(G.focus.c + dir[1], 0, 6) } : { r: 3, c: 3 };
      if (G.toolMode && G.toolMode.kind !== 'shuffle') G.hover = G.focus;
      G.hint = null; G.lastInputAt = now(); e.preventDefault(); return;
    }
    if ((k === 'Enter' || k === ' ') && G.focus) {
      e.preventDefault(); var p = G.board[G.focus.r][G.focus.c];
      if (G.phase === 'tool' && G.toolMode) { if (G.toolMode.kind === 'hammer') hammerStrike(G.focus); else if (G.toolMode.kind === 'swap') toolSwapPick(G.focus); return; }
      if (!p) return;
      if (G.phase !== 'ready') return;
      press(p);
      if (G.sel && G.sel !== p && adjacent(G.sel, p)) { trySwap(G.sel, p); return; }
      react(p);
      G.sel = (G.sel === p) ? null : p; G.selT = now();
    }
  });

  // ---------------------------------------------------------------- UI drawing helpers (ctx = current 2D layer)
  function text(str, x, y, size, color, align, weight) {
    ctx.font = (weight || 700) + ' ' + size + 'px ' + FONT; ctx.fillStyle = color; ctx.textAlign = align || 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(str, x, y);
  }
  var INK = '#45402f', INK2 = '#6f6a52', DEEP = '#3f5233';
  var MONO = 'ui-monospace,"SF Mono",Menlo,Consolas,"Roboto Mono","DejaVu Sans Mono","Liberation Mono",monospace';
  function monoText(str, x, y, size, color, align, weight) {   // fixed-width digits: rolling never shifts goals / moves / buttons
    ctx.font = (weight || 800) + ' ' + size + 'px ' + MONO; ctx.fillStyle = color; ctx.textAlign = align || 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(str, x, y);
  }
  function opView(t) {   // "本次 +N": this operation's accumulated gain, kept ~1.4 s after the operation ends
    var o = G.op; if (!o || !o.gain) return null;
    var a = o.endT == null ? 1 : clamp(1 - (t - o.endT - 1100) / 300, 0, 1);
    return a > 0 ? { gain: o.gain, a: a } : null;
  }
  function drawCellOverlay(r, c, alpha) {
    var x = L.gx + c * L.pitch, y = L.gy + r * L.pitch, s = L.cell, pad = 3;
    ctx.globalAlpha = alpha;
    rr(ctx, x + 2, y + 2, s - 4, s - 4, s * 0.2); ctx.fillStyle = 'rgba(140,195,140,' + T.selFill + ')'; ctx.fill();
    ctx.drawImage(nine('cell_selected', s + pad * 2, s + pad * 2, (s + pad * 2) / 294), x - pad, y - pad, s + pad * 2, s + pad * 2);
    ctx.globalAlpha = 1;
  }
  function drawFocus(r, c) {
    var x = L.gx + c * L.pitch, y = L.gy + r * L.pitch, s = L.cell, m = 4, l = 11;
    ctx.strokeStyle = INK; ctx.lineWidth = 2.2; ctx.beginPath();
    [[x - m + l, y - m, x - m, y - m, x - m, y - m + l], [x + s + m - l, y - m, x + s + m, y - m, x + s + m, y - m + l],
    [x - m + l, y + s + m, x - m, y + s + m, x - m, y + s + m - l], [x + s + m - l, y + s + m, x + s + m, y + s + m, x + s + m, y + s + m - l]]
      .forEach(function (q) { ctx.moveTo(q[0], q[1]); ctx.lineTo(q[2], q[3]); ctx.lineTo(q[4], q[5]); });
    ctx.stroke();
  }
  function addHit(x, y, w, h, fn, id) { hits.push({ x: x, y: y, w: w, h: h, fn: fn, id: id }); }
  function isPressed(id) { return G.pressedBtn && G.pressedBtn.btn.id === id; }
  function roundButton(id, x, y, w, icon, iconScale, fn) {
    var pr = isPressed(id) ? 0.9 : 1;
    ctx.save(); ctx.translate(x + w / 2, y + w / 2); ctx.scale(pr * 1.02, pr * 0.98);
    drawImg('button_round', -w / 2, -w / 2, w, w * 249 / 251);
    var im = IMG[icon], ih = w * iconScale, iw = ih * im.width / im.height;
    if (iw > w * 0.66) { iw = w * 0.66; ih = iw * im.height / im.width; }
    drawImg(icon, -iw / 2, -ih / 2 - w * 0.02, iw, ih);
    ctx.restore();
    addHit(x, y, w, w, function () { Sound.ui(); fn(); }, id);
  }
  function openMenu(kind) { if (G.phase === 'tool') exitTool(); G.panel = { kind: kind, t0: now() }; }
  function drawTop() {
    roundButton('back', L.back.x, L.back.y, L.back.w, 'icon_back', 0.42, function () { if (!G.panel) openMenu('pause'); });
    roundButton('settings', L.settings.x, L.settings.y, L.settings.w, 'icon_settings', 0.5, function () { if (!G.panel) openMenu('settings'); });
    text(lv().name, L.W / 2, L.top.y + 25, 26, INK, 'center', 800);
    if (isFixture()) {   // v3: levels with pre-placed specials are rule-test fixtures, labelled so they are not mistaken for player content
      var fw = 146, fyy = L.top.y + 41;   // stays inside the 'top' dirty region; pre-rendered once (text raster is costly per frame)
      if (!PILL || PILL.k !== PX) {
        var pc = document.createElement('canvas'); pc.width = Math.ceil(fw * PX); pc.height = Math.ceil(15 * PX);
        var px = pc.getContext('2d'); px.scale(PX, PX); px.fillStyle = 'rgba(214,120,96,0.92)'; rr(px, 0, 0, fw, 15, 7.5); px.fill();
        px.font = '800 10px ' + FONT; px.fillStyle = '#fff'; px.textAlign = 'center'; px.textBaseline = 'middle'; px.fillText('规则测试关 · 非正式内容', fw / 2, 7.5);
        PILL = { c: pc, k: PX };
      }
      ctx.drawImage(PILL.c, L.W / 2 - fw / 2, fyy, fw, 15);
    }
  }
  var STAR_POS = [0.2, 0.52, 0.85];
  function starFrac(score) {
    var th = lv().stars, prevT = 0, prevP = 0;
    for (var i = 0; i < 3; i++) { if (score < th[i]) return prevP + (STAR_POS[i] - prevP) * (score - prevT) / (th[i] - prevT); prevT = th[i]; prevP = STAR_POS[i]; }
    return Math.min(1, prevP + (1 - prevP) * Math.min(1, (score - prevT) / (th[2] * 0.25)));
  }
  function drawHUD() {
    var h = L.hud, midY = h.y + h.h / 2 - 2, t = now();
    drawBar('hud_panel', h.x, h.y, h.w, h.h);
    text('目标', h.x + 38, midY - 2, 14, INK2, 'center', 700);
    var ng = Math.max(2, G.goals.length), gsp = ng >= 3 ? 48 : 56;
    G.goals.forEach(function (g, i) {
      var gx = h.x + 82 + i * gsp, gy = midY - 10, sz = ng >= 3 ? 38 : 42;
      var pop = G.goalPop[g.type] ? clamp((t - G.goalPop[g.type]) / (T.goalPop * 1.6), 0, 1) : 1;
      var sc = pop < 1 ? 1 + (T.goalPeak - 1 + 0.12) * Math.sin(pop * Math.PI) * (1 - pop * 0.5) : 1 + 0.02 * Math.sin(t / 400 + i);
      ctx.save(); ctx.translate(gx, gy + sz * 0.4); ctx.scale(sc * (pop < 1 ? 1 + 0.06 * Math.sin(pop * 20) : 1), sc); drawImg(g.type, -sz / 2, -sz * 0.9, sz, sz); ctx.restore();
      if (g.left <= 0) { drawImg('count_badge', gx + 6, gy + 4, 20, 20); drawImg('icon_check', gx + 9.5, gy + 9, 13, 13 * 262 / 350); }
      text(String(Math.max(0, g.left)), gx, midY + 25, 16, INK, 'center', 800);
    });
    // C0 score column: label / this-operation gain, total (26 px fixed-width digits), star bar with provisional stars
    var gEnd = h.x + 82 + (G.goals.length - 1) * gsp + 26, bx = Math.max(h.x + 168, gEnd + 12), bw = h.x + h.w - 112 - bx, by = h.y + 71, bh = 13;
    var cxs = bx + bw / 2, ov = opView(t), pk = t - SD.pulseT, pulse = pk < 90 ? 1 + 0.06 * (pk / 90) : pk < 240 ? 1 + 0.06 * (1 - (pk - 90) / 150) : 1;
    if (ov) { ctx.save(); ctx.globalAlpha = ov.a; monoText('本次 +' + ov.gain, cxs, h.y + 15, 13, '#c0602a', 'center', 800); ctx.restore(); }
    else text('得分', cxs, h.y + 15, 12, INK2, 'center', 700);
    var sStr = String(G.dispScore), fs = 26; ctx.font = '800 26px ' + MONO; var mw = ctx.measureText(sStr).width; if (mw > bw) fs = Math.max(20, Math.floor(26 * bw / mw));
    ctx.save(); ctx.translate(cxs, h.y + 40); ctx.scale(pulse, pulse); monoText(sStr, 0, 0, fs, DEEP, 'center', 800); ctx.restore();
    var frac = starFrac(G.dispScore);
    ctx.globalAlpha = 0.3; drawBar('progress_track', bx, by - bh / 2, bw, bh); ctx.globalAlpha = 1;
    if (frac > 0.005) { ctx.save(); ctx.beginPath(); ctx.rect(bx, by - bh, Math.max(bh * 0.8, bw * frac), bh * 2); ctx.clip(); drawBar('progress_track', bx, by - bh / 2, bw, bh); ctx.restore(); }
    lv().stars.forEach(function (s, i) {
      var sx = bx + bw * STAR_POS[i], got = G.dispScore >= s;
      if (got && !G.starPop[i]) { G.starPop[i] = t; Sound.goal(); }
      var pp = G.starPop[i] ? clamp((t - G.starPop[i]) / 420, 0, 1) : 1, sc = got ? 1 + 0.4 * Math.sin(pp * Math.PI) * (1 - pp * 0.3) : 1;
      var sz = 20 * sc; drawImg(got ? 'star_filled' : 'star_empty', sx - sz / 2, by - sz / 2 - 1, sz, sz * 0.93);
    });
    var dx = h.x + h.w - 100;
    ctx.fillStyle = 'rgba(120,110,80,0.18)'; ctx.fillRect(dx, h.y + 22, 1.5, h.h - 44);
    text('步数', dx + 50, midY - 18, 14, INK2, 'center', 700);
    text(String(G.moves), dx + 50, midY + 13, 32, (G.moves <= 5 && !G.result) ? '#c0603f' : DEEP, 'center', 800);
  }
  function drawTools() {
    var labels = { hammer: '小锤', swap: '换位', shuffle: '重排' }, icons = { hammer: 'tool_hammer', swap: 'tool_swap', shuffle: 'tool_shuffle' };
    L.tools.forEach(function (t) {
      var n = G.tools[t.id], active = G.toolMode && G.toolMode.kind === t.id, x = t.x, y = t.y, w = t.w;
      if (active) { var rw = w * (1.2 + 0.03 * Math.sin(now() / 160)); drawImg('tool_selected_ring', x + w / 2 - rw / 2, y + w / 2 - rw / 2, rw, rw * 292 / 298); }
      var dim = n <= 0 || !(G.phase === 'ready' || G.phase === 'tool');
      if (dim) { ctx.save(); ctx.globalAlpha = n <= 0 ? 0.5 : 0.85; }
      roundButton('tool_' + t.id, x, y, w, icons[t.id], 0.56, function () { enterTool(t.id); });
      if (dim) ctx.restore();
      var bs = 26, bxx = x + w - bs * 0.85, byy = y + w - bs * 0.95;
      drawImg('count_badge', bxx, byy, bs, bs);
      text(String(n), bxx + bs / 2, byy + bs / 2 + 0.5, 14, '#fffdf2', 'center', 800);
      text(labels[t.id], x + w / 2, y + w + 14, 12, active ? DEEP : INK2, 'center', 700);
    });
  }
  function drawInstruction() {
    var I = L.instr, msg = null, cancel = false, t = now();
    if (G.toolMode && !G.panel && G.toolMode.kind !== 'shuffle') {
      cancel = !G.toolMode.busy;
      msg = G.toolMode.kind === 'hammer' ? '选择一个格子（果冻、箱子或糖霜）' : (G.toolMode.first ? '再选一颗' : '选择第一颗果冻');
    }
    var tst = G.toast && t - G.toast.t0 < G.toast.dur ? G.toast : null;
    if (tst) { msg = tst.text; cancel = false; }
    if (!msg) return;
    var a = tst ? clamp(Math.min((t - tst.t0) / 140, (tst.t0 + tst.dur - t) / 200), 0, 1) : clamp((t - (G.toolMode.t0 || 0)) / 140, 0, 1);
    ctx.save(); ctx.globalAlpha = a;
    drawBar('instruction_bar', I.x, I.y, I.w, I.h);
    text(msg, cancel ? I.x + (I.w - 90) / 2 + 4 : I.x + I.w / 2, I.y + I.h / 2 - 1, msg.length > 12 ? 14 : 16, INK, 'center', 700);
    if (cancel) {
      var bw = 78, bh = 34, bx = I.x + I.w - bw - 12, by = I.y + (I.h - bh) / 2 - 1, pr = isPressed('tool_cancel') ? 0.94 : 1;
      ctx.translate(bx + bw / 2, by + bh / 2); ctx.scale(pr, pr);
      drawBar('button_secondary', -bw / 2, -bh / 2, bw, bh); text('取消', 0, -1, 14, INK, 'center', 700);
      addHit(bx, by, bw, bh, function () { exitTool(); }, 'tool_cancel');
    }
    ctx.restore();
  }
  // ---------------- panels (result / shuffle preview / menus)
  function panelAnim(t0) { var t = clamp((now() - t0) / (T.result * 1.6), 0, 1); return { a: E.soft(Math.min(1, t * 1.6)), s: lerp(T.resultFrom - 0.1, 1, E.outBack(t)) }; }
  function backdrop(t0) { var t = clamp((now() - t0) / T.backdrop, 0, 1); ctx.fillStyle = 'rgba(60,55,35,' + (T.backdropA * 1.4 * t) + ')'; ctx.fillRect(0, 0, L.W, L.H); }
  function primaryBtn(id, label, cx, y, w, fn) {
    var h = 52, pr = isPressed(id) ? 0.93 : 1;
    ctx.save(); ctx.translate(cx, y + h / 2); ctx.scale(pr * (pr < 1 ? 1.03 : 1), pr);
    drawBar('button_primary', -w / 2, -h / 2, w, h); text(label, 0, -2, 19, '#fbfbef', 'center', 800); ctx.restore();
    addHit(cx - w / 2, y, w, h, function () { Sound.ui(); fn(); }, id);
  }
  function secondaryBtn(id, label, cx, y, w, fn) {
    var h = 46, pr = isPressed(id) ? 0.93 : 1;
    ctx.save(); ctx.translate(cx, y + h / 2); ctx.scale(pr, pr);
    drawBar('button_secondary', -w / 2, -h / 2, w, h); text(label, 0, -1, 16, INK, 'center', 700); ctx.restore();
    addHit(cx - w / 2, y, w, h, function () { Sound.ui(); fn(); }, id);
  }
  function linkBtn(id, label, cx, y, fn) { text(label, cx, y + 14, 15, isPressed(id) ? INK : INK2, 'center', 700); addHit(cx - 70, y, 140, 30, fn, id); }
  function panelFrame(w, h, t0) {
    var pa = panelAnim(t0);
    ctx.globalAlpha = pa.a; ctx.translate(L.panel.cx, L.panel.cy); ctx.scale(pa.s, pa.s); ctx.translate(-w / 2, -h / 2);
    drawNine('result_panel', 0, 0, w, h, 0.32);
    return pa;
  }
  // C0 result: the logical final score was decided once by the core (ledger.finalize). The panel shares the HUD's single
  // display controller and only reveals it: subtotal → +clear → +moves → final. Tapping skips to the final value (display
  // only — nothing is granted or recomputed). Details are folded.
  function resultRows(Rs) {
    var b = Rs.breakdown, f = Rs.final, rows = [];
    rows.push(['消除得分（含连消倍率）', b.wave_base]);
    if (b.natural_special) rows.push(['自然制造特殊 ×' + f.naturalSpecialCount, b.natural_special]);
    if (b.active_combo) rows.push(['主动组合 ×' + f.activeComboCount, b.active_combo]);
    if (b.delivery) rows.push(['送达 ×' + f.delivered, b.delivery]);
    if (b.skill_streak) rows.push(['技巧连击', b.skill_streak]);
    if (f.won) { rows.push(['通关奖励', f.winBonus]); rows.push(['剩余步数 ' + f.movesLeft + ' × 500', f.movesBonus]); }
    rows.push([f.assisted ? '使用道具：锤 ' + f.assist.hammer + ' / 换 ' + f.assist.swap + ' / 排 ' + f.assist.shuffle : '未使用道具', null]);
    return rows;
  }
  function resultRecordLine(Rs) {
    var r = Rs.rec || {};
    if (r.challenge) return !Rs.win ? '未通关：不进入挑战成绩榜' : !r.valid ? '本局条件与固定配置不一致：不计成绩' : (r.isNewBest ? '挑战新纪录！' : '') + '本地第 ' + r.rank + ' 名' + (r.isNewBest && r.prevBest ? '（之前最佳 ' + r.prevBest.score + '）' : '');
    if (!r.written && r.why) return r.why === 'playtest' ? '编辑器试玩：不写入玩家进度与纪录' : r.why === 'debug' ? '调试操作已介入：本局不写入进度与纪录' : '验证/测试关：不写入进度、星级与纪录';
    if (!Rs.win) return '未通关的分数只表示进展，不计纪录';
    var s = r.isNewBest ? (r.prevBest ? '新纪录！比之前最佳 +' + r.delta : '首个纪录（本计分版本）') : (r.prevBest ? '本版最佳 ' + r.prevBest.score : '');
    if (r.isNewNoTool && r.isNewBest) s += ' · 无道具'; else if (r.isNewNoTool) s += (s ? ' · ' : '') + '无道具新纪录';
    return s;
  }
  function resultReveal(Rs, t) {
    var f = Rs.final; if (!f || !Rs.win || Rs.skipped || Rs.s2) return;
    var age = t - Rs.t0; G.op = null;   // end bonuses are not part of the last operation's gain
    if (age >= 260 && !Rs.s1) { Rs.s1 = 1; setScore(f.actionTotal + f.winBonus); Sound.chime(4); }
    if (age >= 620 && !Rs.s2) { Rs.s2 = 1; setScore(f.finalScore); Sound.chime(6); }
  }
  function skipReveal(Rs) { if (Rs.skipped) return; Rs.skipped = true; G.op = null; Rs.s1 = Rs.s2 = 1; setScore(Rs.final.finalScore); sdSkip(); }
  function drawResult() {
    var Rs = G.result; if (!Rs || now() < Rs.t0) return;
    var t = now(); resultReveal(Rs, t);
    backdrop(Rs.t0); hits = [];
    var rows = resultRows(Rs), openH = Rs.open ? rows.length * 19 + 6 : 0;
    var w = 312, h = (Rs.win ? 400 : 344) + openH, oy = L.panel.cy - h / 2, y = 96;
    addHit(L.panel.cx - w / 2, oy, w, h, function () { if (Rs.win && !Rs.skipped && G.dispScore < Rs.final.finalScore) skipReveal(Rs); }, 'res_skip');
    ctx.save(); panelFrame(w, h, Rs.t0);
    text(PLAY.source === 'challenge' ? (Rs.win ? '挑战完成' : '挑战未完成') : Rs.win ? '关卡完成' : '步数用尽', w / 2, 46, 26, INK, 'center', 800);
    ctx.fillStyle = 'rgba(120,110,80,0.16)'; ctx.fillRect(28, 78, w - 56, 1.5);
    if (Rs.win) {
      var tw = 210, tx = (w - tw) / 2; drawBar('progress_track', tx, y + 12, tw, 24);
      for (var i = 0; i < 3; i++) {
        var st = clamp((t - Rs.t0 - 260 - i * 200) / 360, 0, 1), got = i < Rs.stars && st > 0;
        if (got && !Rs['sp' + i]) { Rs['sp' + i] = 1; Sound.chime(3 + i * 2); Haptic.buzz(15); }
        var sz = got ? 42 * (1 + 0.35 * Math.sin(st * Math.PI) * (1 - st * 0.4)) : 36, sx = tx + tw * (0.18 + 0.32 * i);
        drawImg(got ? 'star_filled' : 'star_empty', sx - sz / 2, y + 24 - sz / 2, sz, sz * 0.94);
      }
      y += 62;
    } else {
      var miss = Rs.missing, total = 0;
      miss.forEach(function (m, i) {
        total += m.left;
        var gx = w / 2 + (i - (miss.length - 1) / 2) * (miss.length > 2 ? 92 : 120) - 20, sz = miss.length > 2 ? 44 : 52;
        drawImg(m.type, gx - sz / 2, y - 6, sz, sz);
        text('×' + m.left, gx + 30, y + 21, 22, INK, 'left', 800);
      });
      y += 56;
      text('还差 ' + total + (miss.length === 1 && miss[0].type.indexOf('__') === 0 ? ({ __crate: ' 只箱子', __frost: ' 格糖霜', __tie: ' 个绑带', __basket: ' 个果篮送达' }[miss[0].type] || ' 个目标') : ' 个目标'), w / 2, y + 4, 15, INK2, 'center', 700);
      y += 26;
    }
    // total — the same display value as the HUD (one controller)
    text('总分', w / 2, y + 4, 12, INK2, 'center', 700);
    monoText(String(G.dispScore), w / 2, y + 30, 30, DEEP, 'center', 800);
    y += 52;
    if (Rs.win) {
      var f = Rs.final, st1 = Rs.s1 || Rs.skipped, st2 = Rs.s2 || Rs.skipped;
      ctx.font = '700 12px ' + FONT;
      var parts = [['操作 ' + f.actionTotal, true], [' ＋ 通关 ' + f.winBonus, st1], [' ＋ 余步 ' + f.movesLeft + '×500', st2]];
      var tot = 0; parts.forEach(function (q) { tot += ctx.measureText(q[0]).width; });
      var px = w / 2 - tot / 2; parts.forEach(function (q) { ctx.globalAlpha = q[1] ? 1 : 0.35; text(q[0], px, y + 4, 12, INK2, 'left', 700); px += ctx.measureText(q[0]).width; }); ctx.globalAlpha = 1;
      y += 20;
    }
    var recLine = resultRecordLine(Rs);
    if (recLine) { text(recLine, w / 2, y + 4, 13, Rs.rec && Rs.rec.isNewBest ? '#c0602a' : INK2, 'center', 800); y += 20; }
    text('最高连消 ' + Math.max(1, Rs.final.maxCascade) + ' 段 · 最佳技巧链 ' + Rs.final.maxStreak, w / 2, y + 4, 13, '#b8642c', 'center', 800);
    y += 22;
    var lx = L.panel.cx, ly = oy + y - 6;
    text((Rs.open ? '收起明细 ▴' : '得分明细 ▾'), w / 2, y + 6, 12, isPressed('res_fold') ? INK : '#8a7f5c', 'center', 700);
    y += 18;
    if (Rs.open) {
      rows.forEach(function (r0, i) {
        var yy = y + 6 + i * 19;
        text(r0[0], 44, yy, 12, INK2, 'left', 600);
        if (r0[1] != null) monoText(String(r0[1]), w - 44, yy, 12, INK, 'right', 700);
      });
      y += openH;
    }
    ctx.restore();
    var pa = panelAnim(Rs.t0), cx = L.panel.cx, by = oy + y + 6, nL = chapterLevels().length, last = G.level >= nL - 1;
    addHit(lx - 80, ly, 160, 24, function () { Rs.open = !Rs.open; Sound.ui(); }, 'res_fold');
    ctx.save(); ctx.globalAlpha = pa.a;
    function go(idx) { return function () { if (!receipt('result_btn:' + Rs.runId)) return; startLevel(idx); }; }
    function again(same) { return function () { if (!receipt('result_btn:' + Rs.runId)) return; restartLevel(same); }; }
    if (PLAY.mode === 'playtest') {   // editor playtest: same-seed retry / new seed / back to the untouched draft
      primaryBtn('res_primary', '同 seed 重试', cx, by, 220, again(true));
      linkBtn('res_second', '新 seed 重试', cx - 72, by + 62, again(false));
      linkBtn('res_editor', '返回编辑器', cx + 72, by + 62, function () { ptExit(); });
    } else if (PLAY.source === 'challenge') {   // fixed seed: retry is the same start
      primaryBtn('res_primary', '再次挑战', cx, by, 220, again(true));
      linkBtn('res_second', '返回挑战列表', cx, by + 62, function () { if (!receipt('result_btn:' + Rs.runId)) return; openSelect('chal'); });
    } else if (PLAY.source !== 'catalog') {
      primaryBtn('res_primary', '再玩一次', cx, by, 220, again(false));
    } else if (isFormalChapter()) {   // C: formal chapter flow — next / retry / back to level select; last level → chapter complete
      if (Rs.win) {
        primaryBtn('res_primary', last ? '章节完成' : '下一关', cx, by, 220, last ? function () { if (!receipt('result_btn:' + Rs.runId)) return; chapterComplete(); } : go(G.level + 1));
        linkBtn('res_second', '重玩本关', cx - 72, by + 62, go(G.level));
        linkBtn('res_menu', '返回选关', cx + 72, by + 62, function () { if (!receipt('result_btn:' + Rs.runId)) return; openSelect('levels'); });
      } else {
        primaryBtn('res_primary', '再试一次', cx, by, 220, go(G.level));
        linkBtn('res_menu', '返回选关', cx, by + 62, function () { if (!receipt('result_btn:' + Rs.runId)) return; openSelect('levels'); });
      }
    } else if (Rs.win) {
      primaryBtn('res_primary', last ? '再玩一次' : '下一关', cx, by, 220, go(last ? 0 : G.level + 1));
      linkBtn('res_second', '重玩本关', cx, by + 62, go(G.level));
    } else {
      primaryBtn('res_primary', '再试一次', cx, by, 220, go(G.level));
      if (G.level > 0) linkBtn('res_second', '返回本章第 1 关', cx, by + 62, go(0));
    }
    ctx.restore();
  }
  function drawShufflePreview() {
    var P = G.panel, tm = G.toolMode; if (!P || P.kind !== 'shuffle' || !tm || !tm.cand) return;
    backdrop(P.t0); hits = [];
    var cs = 38, gw = cs * 7 + 12, w = 344, h = 110 + gw + 84, oy = L.panel.cy - h / 2;
    ctx.save(); panelFrame(w, h, P.t0);
    drawBar('instruction_bar', w / 2 - 64, 16, 128, 40); text('预览中', w / 2, 35, 16, DEEP, 'center', 800);
    text('确认后果冻会移动到下面的排列', w / 2, 72, 13, INK2, 'center', 600);
    var gx = (w - gw) / 2, gy = 92;
    rr(ctx, gx - 6, gy - 6, gw + 12, gw + 12, 12); ctx.fillStyle = '#f1ead6'; ctx.fill();
    for (var r = 0; r < 7; r++) for (var c = 0; c < 7; c++) {
      var x = gx + c * (cs + 2), yy = gy + r * (cs + 2);
      if (!CS.mask[r * COLS + c]) continue;
      ctx.drawImage(nine((r + c) % 2 ? 'cell_cream' : 'cell_sage', cs, cs, cs / 288), x, yy, cs, cs);
      var t = tm.cand.types[r][c], spc = tm.cand.specs[r][c];
      if (t === 'void' || !t) continue;
      if (t === 'cookie_crate') { var cq = crateAt(r, c); ctx.drawImage(scaled('__crate' + (cq ? cq.hp : 1), cs, cs), x, yy, cs, cs); continue; }
      if (t === 'delivery_basket') { ctx.drawImage(scaled('__basket', cs, cs), x, yy, cs, cs); continue; }
      var img = t === 'rainbow' ? 'jelly_bear' : t, S = cs * TYPE_SCALE[t];
      ctx.drawImage(scaled(img, S, S), x + cs / 2 - S / 2, yy + cs / 2 + ANCHOR_K * S - 0.9 * S, S, S);
      if (spc) specBadge(x + cs / 2, yy + cs / 2, cs, spc);
      if (CS.over[r * COLS + c]) ctx.drawImage(scaled('__tieOver', cs, cs), x, yy, cs, cs);   // ties stay where they are
    }
    ctx.restore();
    var pa = panelAnim(P.t0), by = oy + gy + gw + 20;
    ctx.save(); ctx.globalAlpha = pa.a;
    secondaryBtn('shuf_cancel', '取消', L.panel.cx - 76, by + 3, 124, function () { exitTool(); });
    primaryBtn('shuf_ok', '使用', L.panel.cx + 76, by, 136, confirmShuffle);
    ctx.restore();
  }
  function specBadge(x, y, s, sp) {   // tiny marker used in the 2D shuffle preview
    ctx.save(); ctx.lineWidth = 2.2; ctx.strokeStyle = 'rgba(255,255,250,0.95)';
    if (sp === 'h' || sp === 'v') { ctx.beginPath(); for (var i = -1; i <= 1; i++) { if (sp === 'h') { ctx.moveTo(x - s * 0.25, y + i * 5); ctx.lineTo(x + s * 0.25, y + i * 5); } else { ctx.moveTo(x + i * 5, y - s * 0.25); ctx.lineTo(x + i * 5, y + s * 0.25); } } ctx.stroke(); }
    else if (sp === 'bomb') { ctx.beginPath(); ctx.arc(x, y, s * 0.18, 0, 7); ctx.stroke(); ctx.beginPath(); ctx.arc(x, y, s * 0.3, 0, 7); ctx.stroke(); }
    else { var g = ctx.createLinearGradient(x - 10, y - 10, x + 10, y + 10); g.addColorStop(0, '#ff8aa0'); g.addColorStop(0.5, '#ffe27a'); g.addColorStop(1, '#7ac8ff'); ctx.strokeStyle = g; ctx.lineWidth = 3.5; ctx.beginPath(); ctx.arc(x, y, s * 0.25, 0, 7); ctx.stroke(); }
    ctx.restore();
  }
  function drawMenu() {
    var P = G.panel; if (!P || (P.kind !== 'pause' && P.kind !== 'settings' && P.kind !== 'stuck')) return;
    if (P.kind === 'stuck') {   // v3: init / auto-shuffle failed within its attempt limit — no resources lost, diagnostics shown
      backdrop(P.t0); hits = [];
      var w2 = 300, h2 = 250, oy2 = L.panel.cy - h2 / 2;
      ctx.save(); panelFrame(w2, h2, P.t0);
      text('无法继续', w2 / 2, 44, 24, INK, 'center', 800);
      text('棋盘没有可用操作且重排失败', w2 / 2, 92, 14, INK2, 'center', 700);
      text('诊断：' + (CS.diag ? CS.diag.reason + ' · seed ' + CS.diag.seed : '-'), w2 / 2, 118, 12, INK2, 'center', 600);
      ctx.restore();
      var pa2 = panelAnim(P.t0); ctx.save(); ctx.globalAlpha = pa2.a;
      primaryBtn('m_restart', '重新开始（不扣资源）', L.panel.cx, oy2 + 150, 230, function () { restartLevel(false); });
      ctx.restore(); return;
    }
    backdrop(P.t0); hits = [];
    var w = 300, h = P.kind === 'settings' ? 352 : 300, oy = L.panel.cy - h / 2;
    ctx.save(); panelFrame(w, h, P.t0);
    text(P.kind === 'pause' ? '暂停' : '设置', w / 2, 44, 24, INK, 'center', 800);
    ctx.fillStyle = 'rgba(120,110,80,0.16)'; ctx.fillRect(28, 74, w - 56, 1.5);
    ctx.restore();
    var pa = panelAnim(P.t0), cx = L.panel.cx, y = oy + 96;
    ctx.save(); ctx.globalAlpha = pa.a;
    if (P.kind === 'pause') {
      primaryBtn('m_resume', '继续游戏', cx, y, 210, function () { G.panel = null; });
      secondaryBtn('m_restart', '重新开始本关', cx, y + 66, 210, function () { restartLevel(PLAY.mode === 'playtest'); });
      if (PLAY.mode === 'playtest') linkBtn('m_editor', '返回编辑器', cx, y + 126, function () { ptExit(); });
      else if (PLAY.source === 'challenge') linkBtn('m_menu', '返回挑战列表', cx, y + 126, function () { G.panel = null; openSelect('chal'); });
      else if (isFormalChapter()) linkBtn('m_menu', '返回选关', cx, y + 126, function () { G.panel = null; openSelect('levels'); });
      else if (PLAY.source === 'catalog' && G.level > 0) linkBtn('m_home', '返回本章第 1 关', cx, y + 126, function () { startLevel(0); });
    } else {
      secondaryBtn('m_sound', '音效：' + (Sound.muted ? '关' : '开'), cx, y, 210, function () { Sound.muted = !Sound.muted; saveSettings(); if (!Sound.muted) { Sound.unlock(); Sound.boing('jelly_fugu'); } });
      secondaryBtn('m_reduce', '减少动态：' + (G.reduced ? '开' : '关'), cx, y + 56, 210, function () { G.reduced = !G.reduced; saveSettings(); });
      secondaryBtn('m_haptic', '震动：' + (Haptic.on ? '开' : '关'), cx, y + 112, 210, function () { Haptic.on = !Haptic.on; saveSettings(); Haptic.buzz(20); });
      primaryBtn('m_done', '完成', cx, y + 176, 170, function () { G.panel = null; });
    }
    ctx.restore();
  }

  // ---------------------------------------------------------------- juice drawing (top 2D layer)
  function strokeText(str, x, y, size, fill, stroke, lw, outer) {
    ctx.font = '900 ' + size + 'px ' + FONT; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.lineJoin = 'round';
    if (outer) { ctx.lineWidth = (lw || size * 0.24) + size * 0.14; ctx.strokeStyle = outer; ctx.strokeText(str, x, y); ctx.shadowColor = 'transparent'; }
    ctx.lineWidth = lw || size * 0.24; ctx.strokeStyle = stroke || '#fffaf0'; ctx.strokeText(str, x, y);
    ctx.fillStyle = fill; ctx.fillText(str, x, y);
  }
  function gradFill(y, size, a, b) { var g = ctx.createLinearGradient(0, y - size / 2, 0, y + size / 2); g.addColorStop(0, a); g.addColorStop(1, b); return g; }
  function dark(c, k) { return [Math.round(c[0] * k), Math.round(c[1] * k), Math.round(c[2] * k)]; }
  // v2.2: drops / sparks are pre-rendered sprites (one drawImage each, matrix set directly — no save/restore, no paths)
  var SPRC = {}, SPR_D = 32, SPR_DR = 30, SPR_S = 14;
  function sprCanvas(n) { var c = document.createElement('canvas'); c.width = c.height = n; return c; }
  function dropSprite(col) {
    var key = 'd' + col[0] + ',' + col[1] + ',' + col[2]; if (SPRC[key]) return SPRC[key];
    var c = sprCanvas(2 * SPR_D), x = c.getContext('2d'), r = SPR_DR; x.translate(SPR_D, SPR_D);
    x.fillStyle = rgba(col, 0.95); x.beginPath(); x.arc(0, 0, r, 0, 7); x.fill();
    x.fillStyle = 'rgba(255,255,255,0.7)'; x.beginPath(); x.arc(-r * 0.25, -r * 0.35, r * 0.35, 0, 7); x.fill();
    return (SPRC[key] = c);
  }
  function sparkSprite(col) {
    var key = 's' + col[0] + ',' + col[1] + ',' + col[2]; if (SPRC[key]) return SPRC[key];
    var c = sprCanvas(2 * SPR_D), x = c.getContext('2d'), r = SPR_S; x.translate(SPR_D, SPR_D);
    x.globalCompositeOperation = 'lighter'; x.fillStyle = rgba(col, 0.9);
    x.beginPath(); x.moveTo(0, -r * 2); x.lineTo(r * 0.5, 0); x.lineTo(0, r * 2); x.lineTo(-r * 0.5, 0); x.closePath(); x.fill();
    x.beginPath(); x.moveTo(-r * 2, 0); x.lineTo(0, r * 0.5); x.lineTo(r * 2, 0); x.lineTo(0, -r * 0.5); x.closePath(); x.fill();
    return (SPRC[key] = c);
  }
  function drawParts(conf) {
    var t = now(), P = G.parts, n = P.length; if (!n) return;
    var m0 = ctx.getTransform(), A = m0.a, E0 = m0.e, F0 = m0.f, lit = false;
    for (var i = 0; i < n; i++) {
      var q = P[i];
      if ((q.k === 'conf') !== !!conf) continue;
      var age = t - q.t0, a = clamp((q.life - age) / (q.life * 0.35), 0, 1);
      if (a <= 0) continue;
      ctx.globalAlpha = a;
      if (q.k === 'drop') {
        var sp = Math.sqrt(q.vx * q.vx + q.vy * q.vy), st = 1 + Math.min(1.2, sp * 0.0022), kk = 1 / Math.sqrt(st);
        var c = sp > 1e-6 ? q.vx / sp : 1, s = sp > 1e-6 ? q.vy / sp : 0, rr = q.r * SPR_D / SPR_DR;
        if (lit) { ctx.globalCompositeOperation = 'source-over'; lit = false; }
        ctx.setTransform(A * c * st, A * s * st, -A * s * kk, A * c * kk, A * q.x + E0, A * q.y + F0);
        ctx.drawImage(q.spr || (q.spr = dropSprite(q.col)), -rr, -rr, 2 * rr, 2 * rr);
      } else if (q.k === 'spark') {
        if (!lit) { ctx.globalCompositeOperation = 'lighter'; lit = true; }
        var r = q.r * (0.6 + 0.4 * Math.sin(age * 0.05)), rs = r * SPR_D / SPR_S;
        ctx.setTransform(A, 0, 0, A, E0, F0);
        ctx.drawImage(q.spr || (q.spr = sparkSprite(q.col)), q.x - rs, q.y - rs, 2 * rs, 2 * rs);
      } else {
        var cr = Math.cos(q.rot), sr = Math.sin(q.rot), ky = Math.abs(Math.sin(q.rot * 1.7)) + 0.2;
        if (lit) { ctx.globalCompositeOperation = 'source-over'; lit = false; }
        ctx.setTransform(A * cr, A * sr, -A * sr * ky, A * cr * ky, A * q.x + E0, A * q.y + F0);
        ctx.fillStyle = q.cs || (q.cs = rgba(q.col, 1)); ctx.fillRect(-q.r, -q.r * 0.6, q.r * 2, q.r * 1.2);
      }
    }
    if (lit) ctx.globalCompositeOperation = 'source-over';
    ctx.setTransform(m0); ctx.globalAlpha = 1;
  }
  // v2.2: each goo decal is baked once (at its starting opacity) into a small sprite; per frame = one drawImage
  var DPOOL = [];
  function decalSprite(blobs, col) {
    var ext = 0;
    for (var i = 0; i < blobs.length; i++) { var b = blobs[i]; ext = Math.max(ext, Math.abs(b[0]) + b[2], Math.abs(b[1]) + b[2]); }
    ext += 1;
    var px = Math.max(8, Math.ceil(2 * ext * PX)), c = null;
    for (var j = 0; j < DPOOL.length; j++) if (DPOOL[j].width >= px && DPOOL[j].width <= px * 1.25) { c = DPOOL.splice(j, 1)[0]; break; }
    if (!c) c = sprCanvas(px);
    var x = c.getContext('2d'), f = c.width / (2 * ext);
    x.setTransform(1, 0, 0, 1, 0, 0); x.clearRect(0, 0, c.width, c.height); x.setTransform(f, 0, 0, f, ext * f, ext * f);
    x.fillStyle = rgba(col, 0.5);
    for (i = 0; i < blobs.length; i++) { b = blobs[i]; x.beginPath(); x.arc(b[0], b[1], b[2], 0, 7); x.fill(); }
    var b0 = blobs[0]; x.fillStyle = 'rgba(255,255,255,0.3)'; x.beginPath(); x.arc(-b0[2] * 0.3, -b0[2] * 0.35, b0[2] * 0.22, 0, 7); x.fill();
    return { c: c, ext: ext };
  }
  function drawDecals() {
    var t = now(), op = L.op, D = G.decals; if (!D.length) return;
    ctx.save(); ctx.beginPath(); ctx.rect(op.x, op.y, op.w, op.h); ctx.clip();
    for (var i = 0; i < D.length; i++) {
      var d = D[i], age = t - d.t0, k = clamp(age / d.dur, 0, 1), sc = 0.5 + 0.5 * E.outBack(clamp(age / 140, 0, 1));
      var e = d.spr.ext * sc * (1 - 0.075 * k);
      ctx.globalAlpha = Math.pow(1 - k, 1.3);
      ctx.drawImage(d.spr.c, d.x - e, d.y - e, 2 * e, 2 * e);
    }
    ctx.globalAlpha = 1;
    ctx.restore();
  }
  function drawRings() {
    var t = now();
    G.rings.forEach(function (g) {
      var k = clamp((t - g.t0) / g.dur, 0, 1), r = lerp(g.r0, g.r1, E.soft(k)) * L.pitch, a = 1 - k;
      ctx.lineWidth = Math.max(0.5, g.w * (1 - k));
      if (!g.col) { for (var i = 0; i < 12; i++) { ctx.strokeStyle = rgba(hsvCol(i / 12 + t / 2000), a); ctx.beginPath(); ctx.arc(g.x, g.y, r, i / 12 * 6.283, (i + 1) / 12 * 6.283 + 0.02); ctx.stroke(); } }
      else { ctx.strokeStyle = rgba(g.col, a * 0.85); ctx.beginPath(); ctx.arc(g.x, g.y, r, 0, 7); ctx.stroke(); ctx.strokeStyle = 'rgba(255,255,255,' + a * 0.6 + ')'; ctx.lineWidth *= 0.4; ctx.stroke(); }
    });
  }
  function drawBeams() {
    var t = now(), op = L.op;
    ctx.save(); ctx.beginPath(); ctx.rect(op.x - 6, op.y - 6, op.w + 12, op.h + 12); ctx.clip();
    ctx.globalCompositeOperation = 'lighter';
    G.beams.forEach(function (b) {
      var age = t - b.t0, e = E.smooth(clamp(age / 190, 0, 1)), fade = 1 - clamp((age - 180) / 340, 0, 1);
      var half = 7.4 * L.pitch * e, th = L.cell * (0.25 + 0.5 * fade), h = b.dir === 'h';
      var g = h ? ctx.createLinearGradient(0, b.y - th / 2, 0, b.y + th / 2) : ctx.createLinearGradient(b.x - th / 2, 0, b.x + th / 2, 0);
      g.addColorStop(0, rgba(b.col, 0)); g.addColorStop(0.3, rgba(b.col, 0.55 * fade)); g.addColorStop(0.5, 'rgba(255,255,240,' + 0.95 * fade + ')');
      g.addColorStop(0.7, rgba(b.col, 0.55 * fade)); g.addColorStop(1, rgba(b.col, 0));
      ctx.fillStyle = g;
      if (h) ctx.fillRect(b.x - half, b.y - th / 2, half * 2, th); else ctx.fillRect(b.x - th / 2, b.y - half, th, half * 2);
      for (var s = -1; s <= 1; s += 2) {   // bright heads
        var hx = h ? b.x + s * half : b.x, hy = h ? b.y : b.y + s * half, rg = ctx.createRadialGradient(hx, hy, 0, hx, hy, L.cell * 0.6);
        rg.addColorStop(0, 'rgba(255,255,240,' + fade + ')'); rg.addColorStop(1, 'rgba(255,255,240,0)');
        ctx.fillStyle = rg; ctx.fillRect(hx - L.cell, hy - L.cell, L.cell * 2, L.cell * 2);
      }
    });
    ctx.restore();
  }
  function drawBlasts() {
    var t = now();
    G.blasts.forEach(function (b) {
      var age = t - b.t0, k = clamp(age / 620, 0, 1), R = (b.rad + 0.7) * L.pitch * E.soft(clamp(age / 420, 0, 1)), a = 1 - k;
      ctx.globalCompositeOperation = 'lighter';
      var fa = Math.max(0, 1 - age / 260), rg = ctx.createRadialGradient(b.x, b.y, 0, b.x, b.y, R + 1);
      rg.addColorStop(0, 'rgba(255,250,230,' + 0.9 * fa + ')'); rg.addColorStop(0.5, rgba(b.col, 0.6 * fa)); rg.addColorStop(1, rgba(b.col, 0));
      ctx.fillStyle = rg; ctx.beginPath(); ctx.arc(b.x, b.y, R + 1, 0, 7); ctx.fill();
      ctx.strokeStyle = 'rgba(255,236,190,' + a + ')'; ctx.lineWidth = 9 * a; ctx.beginPath(); ctx.arc(b.x, b.y, R, 0, 7); ctx.stroke();
      ctx.lineWidth = 3 * a; ctx.beginPath();
      for (var i = 0; i < 14; i++) { var an = i / 14 * 6.283 + b.t0; ctx.moveTo(b.x + Math.cos(an) * R * 0.75, b.y + Math.sin(an) * R * 0.75); ctx.lineTo(b.x + Math.cos(an) * R * 1.15, b.y + Math.sin(an) * R * 1.15); }
      ctx.stroke();
      ctx.globalCompositeOperation = 'source-over';
    });
  }
  function drawZaps() {
    var t = now();
    ctx.globalCompositeOperation = 'lighter'; ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    G.zaps.forEach(function (z) {
      var age = t - z.t0, a = 1 - age / 260, fr = Math.floor(age / 40), pts = [], n = 7;
      var dx = z.x1 - z.x0, dy = z.y1 - z.y0, len = Math.sqrt(dx * dx + dy * dy) || 1, nx = -dy / len, ny = dx / len;
      for (var i = 0; i <= n; i++) {
        var k = i / n, j = (i === 0 || i === n) ? 0 : (Math.sin((z.seed * 999 + i * 13.7 + fr * 7.3)) * 0.5) * Math.min(18, len * 0.12);
        pts.push([z.x0 + dx * k + nx * j, z.y0 + dy * k + ny * j]);
      }
      var c = hsvCol(z.h + t / 1500);
      [[7, rgba(c, 0.45 * a)], [2.4, 'rgba(255,255,255,' + a + ')']].forEach(function (s) {
        ctx.lineWidth = s[0]; ctx.strokeStyle = s[1]; ctx.beginPath(); pts.forEach(function (p, i) { if (i) ctx.lineTo(p[0], p[1]); else ctx.moveTo(p[0], p[1]); }); ctx.stroke();
      });
      var rg = ctx.createRadialGradient(z.x1, z.y1, 0, z.x1, z.y1, L.cell * 0.5);
      rg.addColorStop(0, 'rgba(255,255,255,' + a + ')'); rg.addColorStop(1, rgba(c, 0)); ctx.fillStyle = rg;
      ctx.beginPath(); ctx.arc(z.x1, z.y1, L.cell * 0.5, 0, 7); ctx.fill();
    });
    ctx.globalCompositeOperation = 'source-over';
  }
  function drawPopups() {
    var t = now();
    G.popups.forEach(function (p) {
      var age = t - p.t0, life = p.dur || 480; if (age < 0) return;
      var k = age / life, sc = 0.82 + 0.18 * E.outBack(clamp(age / 120, 0, 1)), a = clamp(age / 60, 0, 1) * clamp((life - age) / 140, 0, 1);
      ctx.save(); ctx.globalAlpha = a; ctx.translate(p.x, p.y - L.cell * 0.4 * E.soft(k)); ctx.scale(sc, sc);
      strokeText(p.text, 0, 0, p.size, rgba(dark(p.col, 0.78), 1), '#fffaf0', p.size * 0.2, 'rgba(90,60,30,0.55)');
      ctx.restore();
    });
  }
  // v2.2: banner / praise lettering (stroked gradient text + soft drop shadow) is rendered once into a cached sprite
  // (1.25x oversampled for the elastic pop) instead of re-rasterising text + blurred shadow every frame
  var TSPR = {}, TSPR_N = 0;
  function textSpr(key, str, size, lw, blur, offY, shCol, draw) {
    var k = key + '|' + PX.toFixed(3); if (TSPR[k]) return TSPR[k];
    if (++TSPR_N > 64) { TSPR = {}; TSPR_N = 1; }
    var f = PX * 1.25, save = ctx, c = document.createElement('canvas'), x = c.getContext('2d');
    x.font = '900 ' + size + 'px ' + FONT;
    var pad = lw + size * 0.14 + blur * 1.5 + offY + 4, w = x.measureText(str).width + 2 * pad, h = size * 1.3 + 2 * pad;
    c.width = Math.ceil(w * f); c.height = Math.ceil(h * f);
    x.setTransform(f, 0, 0, f, c.width / 2, c.height / 2);
    x.shadowColor = shCol; x.shadowBlur = blur * f; x.shadowOffsetY = offY * f;
    ctx = x; try { draw(str); } finally { ctx = save; }
    return (TSPR[k] = { c: c, w: c.width / f, h: c.height / f });
  }
  function tagPill(str, x, y, align, col, a, pop) {
    ctx.font = '800 14px ' + FONT; var w = ctx.measureText(str).width + 26, h = 26, x0 = align === 'left' ? x : x - w;
    ctx.save(); ctx.globalAlpha = a; ctx.translate(x0 + w / 2, y); ctx.scale(pop, pop);
    drawBar('button_secondary', -w / 2, -h / 2, w, h); text(str, 0, -0.5, 14, col, 'center', 800);
    ctx.restore();
  }
  function drawBanner() {
    var t = now(), B = L.B, ty = B.y - 4;
    var wt = G.waveTag;   // fixed place: "N连消 · 得分×k" (cascade count and the real multiplier are different numbers)
    if (wt) {
      var age = t - wt.t0, life = 1700; if (age > life && G.phase !== 'busy') G.waveTag = null;
      else { var a = clamp((life - age) / 260, 0, 1); if (G.phase === 'busy') a = 1;
        tagPill(wt.n + '连消 · 得分×' + (wt.pct / 100), B.x + 6, ty, 'left', '#c0602a', a, G.reduced ? 1 : 1 + 0.08 * Math.exp(-age / 90)); }
    }
    var sk = G.skillTag;   // secondary: "技巧N连 · +X" at action settlement, short
    if (sk) {
      var age3 = t - sk.t0; if (age3 > 1500) G.skillTag = null;
      else tagPill('技巧' + sk.n + '连' + (sk.bonus ? ' · +' + sk.bonus : ''), B.x + B.w - 6, ty, 'right', '#5d7a2e', clamp(age3 / 80, 0, 1) * clamp((1500 - age3) / 240, 0, 1), G.reduced ? 1 : 1 + 0.1 * Math.exp(-age3 / 90));
    }
    var p = G.center;   // centre: one message, 80 in + 220 hold + 100 out, width ≤ 40 % of the board
    if (p) {
      var age2 = t - p.t0, life2 = CT_IN + CT_HOLD + CT_OUT; if (age2 > life2) { G.center = null; return; }
      var a2 = age2 < CT_IN ? age2 / CT_IN : age2 > CT_IN + CT_HOLD ? 1 - (age2 - CT_IN - CT_HOLD) / CT_OUT : 1;
      var s2 = G.reduced ? 1 : age2 < CT_IN ? 0.86 + 0.14 * E.outBack(age2 / CT_IN) : 1;
      var size2 = 30, sp = textSpr('c|' + p.text + '|' + (p.col || ''), p.text, size2, 5, 8, 2, 'rgba(80,60,20,0.3)', function (str) { strokeText(str, 0, 0, size2, gradFill(0, size2, '#fff6b0', p.col || '#ffa02e'), '#fffaf0', 5, '#7a3f1c'); });
      var maxW = B.w * 0.4, k = Math.min(1, maxW / sp.w, L.cell * 1.1 / sp.h * 1.35);
      ctx.save(); ctx.globalAlpha = clamp(a2, 0, 1); ctx.translate(L.W / 2, B.y + B.h * 0.3); ctx.scale(s2 * k, s2 * k);
      ctx.drawImage(sp.c, -sp.w / 2, -sp.h / 2, sp.w, sp.h); ctx.restore();
    }
  }
  function hslStr(h) { return 'hsl(' + h + ',90%,58%)'; }
  function drawHammerFx() {
    var f = G.hammerFx; if (!f) return;
    var t = now() - f.t0; if (t > 380) { G.hammerFx = null; return; }
    var x = L.gx + f.c * L.pitch + L.cell * 0.8, y = L.gy + f.r * L.pitch + L.cell * 0.2;
    var ang = t < T.hammerWind ? lerp(-5, -55, E.smooth(t / T.hammerWind)) : lerp(-55, 26, E.smooth(clamp((t - T.hammerWind) / 55, 0, 1)));
    var a = t > 280 ? 1 - (t - 280) / 100 : 1, s = L.cell * 0.82;
    ctx.save(); ctx.globalAlpha = a; ctx.translate(x, y); ctx.rotate(ang * DEG);
    drawImg('tool_hammer', -s * 0.2, -s * 0.85, s, s * 369 / 362); ctx.restore();
  }

  // ---------------------------------------------------------------- frame rendering: A (2D under) → GL jellies → B (2D over)
  var SPK = { h: 1, v: 2, bomb: 3, rainbow: 4 };
  // v2.2: the 2D base layer is only redrawn where something changed. Each region has a cheap signature; changed regions are
  // unioned into one clip and the full v2.1 draw sequence runs inside it (identical pixels, a fraction of the raster work).
  var dirtyAll = true, bState = 1, SIG = {}, hitsA = [], DIRTY = [], AST = { full: 0, part: 0, skip: 0, px: 0 }, BST = { draw: 0, skip: 0, px: 0 };
  function pressedId() { return G.pressedBtn ? G.pressedBtn.btn.id : ''; }
  function regionSig(id, t) {
    var tm = G.toolMode, i;
    if (id === 'top') return pressedId() + '|' + G.epoch + '|' + (G.lastEv ? G.lastEv.t0 : 0);
    if (id === 'hud') {
      var hz = Q.cur.hudHz, ov = opView(t), s = (hz ? Math.floor(t * hz / 1000) : t) + '|' + G.dispScore + '|' + G.moves + '|' + (G.result ? 1 : 0) + '|' + G.epoch +
        '|' + (ov ? ov.gain + ':' + ov.a.toFixed(2) : '') + '|' + (t - SD.pulseT < 260 ? t : '');
      for (i = 0; i < G.goals.length; i++) { var g = G.goals[i], gp = G.goalPop[g.type]; s += '|' + g.left + (gp && t - gp < T.goalPop * 1.6 + 50 ? '@' + t : ''); }
      for (i = 0; i < 3; i++) if (G.starPop[i] && t - G.starPop[i] < 470) s += '*' + t;
      return s;
    }
    if (id === 'board') {
      var sel = G.sel && !G.sel.dead ? G.sel : null;
      return (G.shX || 0).toFixed(2) + ',' + (G.shY || 0).toFixed(2) + '|' + (G.glow > 0.02 ? t : 0) + '|' + (G.decals.length ? t : 0) + '|' +
        (sel ? sel.id + ':' + sel.r + ',' + sel.c + ':' + (t - G.selT < T.selIn + 20 ? t : 1) : '') + '|' + (tm ? tm.kind + ':' + (tm.first || '') : '') + '|' +
        (tm && G.hover ? G.hover.r + ',' + G.hover.c : '') + '|' + (G.hammerFx ? t : '');
    }
    var tst = G.toast && t - G.toast.t0 < G.toast.dur + 20;
    return G.tools.hammer + ',' + G.tools.swap + ',' + G.tools.shuffle + '|' + (tm ? tm.kind + (tm.first ? 1 : 0) + (tm.busy ? 1 : 0) + '@' + t : '') + '|' +
      ((G.phase === 'ready' || G.phase === 'tool') ? 1 : 0) + '|' + pressedId() + '|' + (tst ? t : '') + '|' + (G.panel ? 1 : 0);
  }
  function renderA() {
    var t = now(), regs = L.reg, i, full = dirtyAll; DIRTY.length = 0;
    for (i = 0; i < regs.length; i++) {
      var rg = regs[i], sg = (rg.id === 'hud' && !Q.cur.hudHz) ? null : regionSig(rg.id, t);
      if (sg === null || sg !== SIG[rg.id]) { DIRTY.push(rg); SIG[rg.id] = sg; }
    }
    if (!full && !DIRTY.length) { AST.skip++; return false; }
    ctx = ctxA; hits = [];
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    if (!full) {   // one bounding rectangle (a multi-rect clip becomes a complex clip, which measured ~2x slower)
      var bx0 = 1e9, by0 = 1e9, bx1 = -1e9, by1 = -1e9;
      for (i = 0; i < DIRTY.length; i++) { var dd = DIRTY[i]; bx0 = Math.min(bx0, dd.x); by0 = Math.min(by0, dd.y); bx1 = Math.max(bx1, dd.x + dd.w); by1 = Math.max(by1, dd.y + dd.h); }
      var x0 = Math.max(0, Math.floor(bx0 * PX)), y0 = Math.max(0, Math.floor(by0 * PX)), x1 = Math.min(cA.width, Math.ceil(bx1 * PX)), y1 = Math.min(cA.height, Math.ceil(by1 * PX));
      ctx.save(); ctx.beginPath(); ctx.rect(x0, y0, x1 - x0, y1 - y0); ctx.clip(); AST.part++; AST.px += (x1 - x0) * (y1 - y0);
    } else { AST.full++; AST.px += cA.width * cA.height; }
    ctx.drawImage(bgLayer, 0, 0);
    ctx.setTransform(PX, 0, 0, PX, 0, 0); ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
    drawTop(); drawHUD();
    drawTools(); drawInstruction();
    if (!full) ctx.restore();
    dirtyAll = false; hitsA = hits.slice();
    return true;
  }
  // v2.2: the board (frame + tray + cells + selection overlays) lives on its own canvas cBoard, redrawn only when an
  // overlay changes; screen shake moves it with a CSS transform. The chain glow is a separate low-res canvas cGlow
  // (re-rendered only when hue / blur level change) whose pulse is CSS opacity. Goo decals are drawn by WebGL.
  var cBoard = document.getElementById('cBoard'), cGlow = document.getElementById('cGlow'), ctxBoard = cBoard.getContext('2d'), ctxGlow = cGlow.getContext('2d');
  var BOARDSIG = null, BST2 = { board: 0, glowR: 0 }, LAYX = { bt: '', go: '', gt: '', gk: '' };
  function placeLayers() {
    var bl = boardLayer;
    cBoard.width = bl.c.width; cBoard.height = bl.c.height;
    cBoard.style.left = (bl.x * K) + 'px'; cBoard.style.top = (bl.y * K) + 'px'; cBoard.style.width = (bl.w * K) + 'px'; cBoard.style.height = (bl.h * K) + 'px';
    BOARDSIG = null; LAYX.bt = LAYX.go = LAYX.gt = LAYX.gk = ''; cGlow.style.opacity = '0';
  }
  function obstacleSig(t) {   // v3: obstacles live on the board layer; redraw on change, every frame only while a hit animates
    var anim = G.frostFx.length > 0, id, k;
    for (id in G.crates) if (t - G.crates[id].hitT < 300) { anim = true; break; }
    if (!anim) for (k = 0; k < G.frost.length; k++) if (G.frost[k] && t - G.frost[k].hitT < 280) { anim = true; break; }
    return G.obsRev + (anim ? '@' + t : '');
  }
  function drawObstacles(t) {
    var k, f, id, q, cell = L.cell;
    for (k = 0; k < G.frost.length; k++) {
      f = G.frost[k]; if (!f) continue;
      var r = Math.floor(k / COLS), c = k % COLS, a = t - f.hitT, kk = a < 280 ? Math.sin(Math.PI * a / 280) : 0;
      ART.frosting(ctx, L.gx + c * L.pitch, L.gy + r * L.pitch, cell, f.layers, kk, 1);
    }
    for (var i = 0; i < G.frostFx.length; i++) {   // last layer peels off: lifts, grows a little, fades
      var fx = G.frostFx[i], e = clamp((t - fx.t0) / 360, 0, 1), gr = cell * 0.12 * e;
      ART.frosting(ctx, L.gx + fx.c * L.pitch - gr / 2, L.gy + fx.r * L.pitch - gr / 2 - cell * 0.1 * e, cell + gr, 1, 0, 1 - E.smooth(e));
    }
    for (id in G.crates) {
      q = G.crates[id]; var b = t - q.hitT, sq = b < 300 ? Math.sin(Math.PI * b / 300) * (1 - b / 600) : 0;
      ART.crate(ctx, L.gx + q.c * L.pitch, L.gy + q.r * L.pitch, cell, q.hp, sq, 1);
    }
  }
  function cellOverlaysSig(t) {
    var tm = G.toolMode, sel = G.sel && !G.sel.dead ? G.sel : null;
    return obstacleSig(t) + '|' + (sel ? sel.id + ':' + sel.r + ',' + sel.c + ':' + (t - G.selT < T.selIn + 20 ? t : 1) : '') + '|' + (tm ? tm.kind + ':' + (tm.first || '') : '') + '|' +
      (tm && G.hover ? G.hover.r + ',' + G.hover.c : '') + '|' + (G.hammerFx ? t : '') + '|' + (!R.gl && G.decals.length ? t : '');
  }
  // v3.1 overlay canvas (above the WebGL jellies, below effects): gummy ties over their hosts + delivery baskets.
  // Redrawn only when its signature changes (static ties cost nothing per frame; only moving baskets / release fx redraw).
  var cOver = document.getElementById('cOver'), ctxOver = cOver ? cOver.getContext('2d') : null, OVERSIG = null, LAYO = { t: '' };
  function overSig(t) {
    var s = '', k, id;
    for (k in G.ties) { var hp = G.board[G.ties[k].r][G.ties[k].c]; s += k + (hp ? ':' + hp.y.toFixed(3) + ',' + hp.x.toFixed(3) + ',' + hp.sqH.toFixed(2) : '') + ';'; }
    for (id in G.baskets) { var b = G.baskets[id]; s += 'b' + id + ':' + b.y.toFixed(3) + ',' + b.sqH.toFixed(2) + ';'; }
    if (G.tieFx.length || G.dlvFx.length) s += '@' + t;
    return s;
  }
  function renderOver() {
    if (!ctxOver) return;
    var bl = boardLayer, t = now();
    if (cOver.width !== bl.c.width || cOver.height !== bl.c.height) { cOver.width = bl.c.width; cOver.height = bl.c.height; OVERSIG = null; }
    var st = cOver.style, L2 = (bl.x * K) + 'px|' + (bl.y * K) + 'px|' + (bl.w * K) + 'px|' + (bl.h * K) + 'px';
    if (LAYO.p !== L2) { LAYO.p = L2; st.left = (bl.x * K) + 'px'; st.top = (bl.y * K) + 'px'; st.width = (bl.w * K) + 'px'; st.height = (bl.h * K) + 'px'; OVERSIG = null; }
    var sg = overSig(t);
    if (sg !== OVERSIG) {
      OVERSIG = sg; BST2.over = (BST2.over || 0) + 1;
      var x = ctxOver, f = cOver.width / bl.w, cell = L.cell;
      x.setTransform(1, 0, 0, 1, 0, 0); x.clearRect(0, 0, cOver.width, cOver.height);
      x.setTransform(f, 0, 0, f, -bl.x * f, -bl.y * f); x.imageSmoothingEnabled = true;
      var id, k, i;
      for (id in G.baskets) { var b = G.baskets[id]; ART.basket(x, L.gx + b.x * L.pitch, L.gy + b.y * L.pitch, cell, Math.max(0, 1 - b.sqH) * 4, b.alpha); }
      for (i = G.dlvFx.length - 1; i >= 0; i--) {   // slide down into the exit + fade
        var d = G.dlvFx[i], e = clamp((t - d.t0) / 420, 0, 1);
        if (e >= 1) { G.dlvFx.splice(i, 1); continue; }
        x.save(); x.beginPath(); x.rect(L.gx + d.b.c * L.pitch - 4, L.gy + d.b.r * L.pitch - cell, cell + 8, cell * 2 + cell * 0.15); x.clip();   // swallowed by the exit edge
        ART.basket(x, L.gx + d.b.c * L.pitch, L.gy + (d.b.r + 0.9 * E.smooth(e)) * L.pitch, cell, 0, 1 - e * e); x.restore();
      }
      for (k in G.ties) {
        var q = G.ties[k], hp = G.board[q.r][q.c], oy = hp ? (hp.y - q.r) : 0, ox = hp ? (hp.x - q.c) : 0, sq = hp ? hp.sqH : 1;
        ART.tie(x, L.gx + (q.c + ox) * L.pitch, L.gy + (q.r + oy) * L.pitch + cell * (1 - sq) * 0.5, cell, 0, 1);
      }
      for (i = G.tieFx.length - 1; i >= 0; i--) {
        var tf = G.tieFx[i], e2 = clamp((t - tf.t0) / 340, 0, 1);
        if (e2 >= 1) { G.tieFx.splice(i, 1); continue; }
        ART.tie(x, L.gx + tf.c * L.pitch, L.gy + tf.r * L.pitch, cell, E.smooth(e2), 1);
      }
    }
    var tr = 'translate(' + ((G.shX || 0) * K).toFixed(2) + 'px,' + ((G.shY || 0) * K).toFixed(2) + 'px)';
    if (tr !== LAYO.t) { LAYO.t = tr; st.transform = tr; }
  }
  function renderBoard() {
    var t = now(), sg = cellOverlaysSig(t), bl = boardLayer;
    if (sg !== BOARDSIG) {
      BOARDSIG = sg; BST2.board++;
      var save = ctx; ctx = ctxBoard;
      ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, cBoard.width, cBoard.height); ctx.drawImage(bl.c, 0, 0);
      var f = cBoard.width / bl.w; ctx.setTransform(f, 0, 0, f, -bl.x * f, -bl.y * f); ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
      drawObstacles(t);
      if (!R.gl) drawDecals();   // Canvas2D fallback keeps the canvas decals
      if (G.sel && !G.sel.dead) drawCellOverlay(G.sel.r, G.sel.c, clamp((now() - G.selT) / T.selIn, 0, 1));
      var tm = G.toolMode, first = tm && tm.kind === 'swap' && tm.first ? G.pieces[tm.first] : null;
      if (first) drawCellOverlay(first.r, first.c, 1);
      if (tm && G.hover && tm.kind !== 'shuffle') { var hp = G.board[G.hover.r][G.hover.c]; if (!(first && hp === first)) drawCellOverlay(G.hover.r, G.hover.c, tm.kind === 'hammer' ? 1 : 0.55); }
      if (G.hammerFx) drawCellOverlay(G.hammerFx.r, G.hammerFx.c, 1);
      ctx.globalAlpha = 1; ctx = save;
    }
    // shake = CSS translate of the board + glow layers (same logical offset the GL / effects layers use)
    var tr = 'translate(' + ((G.shX || 0) * K).toFixed(2) + 'px,' + ((G.shY || 0) * K).toFixed(2) + 'px)';
    if (tr !== LAYX.bt) { LAYX.bt = tr; cBoard.style.transform = tr; }
    renderGlow(t, tr);
  }
  function renderGlow(t, tr) {
    var on = G.glow > 0.02;
    if (!on) { if (LAYX.go !== '0') { LAYX.go = '0'; cGlow.style.opacity = '0'; } return; }
    var fr = L.frameRect, hue = Math.max(10, 48 - G.chain * 7), pul = 0.75 + 0.25 * Math.sin(t / 70);
    var gb = Math.round(18 + 30 * G.glow), key = hue + '|' + gb;   // blur radius quantised to 1 logical px
    var gpad = 48 * 1.6 + 4, gw = fr.w - 28 + 2 * gpad, gh = fr.h - 28 + 2 * gpad, gq = PX / 4;
    if (key !== LAYX.gk) {
      LAYX.gk = key; BST2.glowR++;
      var cw = Math.ceil(gw * gq), ch = Math.ceil(gh * gq);
      if (cGlow.width !== cw || cGlow.height !== ch) {
        cGlow.width = cw; cGlow.height = ch;
        var gx0 = fr.x + 14 - gpad, gy0 = fr.y + 14 - gpad;
        cGlow.style.left = (gx0 * K) + 'px'; cGlow.style.top = (gy0 * K) + 'px'; cGlow.style.width = (cw / gq * K) + 'px'; cGlow.style.height = (ch / gq * K) + 'px';
      }
      var x = ctxGlow; x.setTransform(1, 0, 0, 1, 0, 0); x.clearRect(0, 0, cw, ch);
      // shadow-only trick: shape far off-canvas, its blurred shadow offset back into view (halo at 1/4 res; it is a wide blur)
      x.setTransform(gq, 0, 0, gq, -8000, 0); x.shadowOffsetX = 8000; x.shadowColor = 'hsl(' + hue + ',100%,62%)'; x.shadowBlur = gb * gq; x.fillStyle = '#000';
      rr(x, gpad, gpad, fr.w - 28, fr.h - 28, 40); x.fill();
      x.shadowColor = 'transparent'; x.shadowOffsetX = 0;
    }
    var op = (Math.min(0.9, G.glow * pul) * Math.min(0.8, G.glow)).toFixed(3);
    if (op !== LAYX.go) { LAYX.go = op; cGlow.style.opacity = op; }
    if (tr !== LAYX.gt) { LAYX.gt = tr; cGlow.style.transform = tr; }
  }
  var SHC = [0.27, 0.23, 0.12, 1];
  function glowCol(p, t) {
    if (p.sp === 'rainbow') { var c = hsvCol((t / 1800 + p.seed) % 1); return [c[0] / 255, c[1] / 255, c[2] / 255, 1]; }
    if (p.sp === 'bomb') return [1, 0.55, 0.25, 1];
    return [1, 0.93, 0.62, 1];
  }
  function pushPiece(p, sx, sy, shadow) {
    var t = now();
    if (shadow) {
      var S = p.S, lift = p.lift + Math.max(0, p.out) * 0.6, a = 0.42 * p.shA * (1 - clamp(lift / 0.4, 0, 0.7)) * p.alpha;
      if (a > 0.01) R.quad(cellX(p.x + p.ox) + sx, cellY(p.y + p.oy) + ANCHOR_K * S - 2 + sy, S * 0.78 * p.sqW * (1 + lift * 0.8), S * 0.24 * (1 + lift), 10, SHC, a);
    }
  }
  function pushGlow(p, sx, sy) {
    if (!p.sp) return;
    var t = now(), S = p.S, cx = p.body.px[14] * 0.5 + p.body.px[21] * 0.5, cy = p.body.py[14] * 0.5 + p.body.py[21] * 0.5;
    R.quad(cx + sx, cy + sy, S * 1.5, S * 1.5, 11, glowCol(p, t), (p.sp === 'bomb' ? 0.42 : 0.26) * (1 + 0.45 * Math.sin(t / (p.sp === 'bomb' ? 110 : 170) + p.phase)) * p.alpha);
  }
  function drawPiece(p, sx, sy) {
    if (p.vol) R.litMesh(p.vol, p.alpha, Math.min(1, p.flash), sx, sy);
    else R.mesh(p.body, p.alpha, SPK[p.sp] || 0, Math.min(1, p.flash), p.seed, null, sx, sy);
  }
  // B contact shadow (section 六): anchored to the sim's bottom contact row, never rotates with the body; two layers
  // (tight core + soft wide); separation from scripted lift/eject/fall + the body's own bottom gap → fades, widens, softens
  var SHB = { core: 0.5, wide: 0.24, coreW: 0.86, wideW: 1.3, liftCells: 0.9, padV: 10 / 512 };   // 待测初值
  function pushShadowB(p, sx, sy) {
    var b = p.body, N = JM.Body.N, S = p.S, k0 = (N - 1) * N, mn = 1e9, mx = -1e9, cxs = 0, by = 0, i;
    for (i = 0; i < N; i++) { var k = k0 + i; mn = Math.min(mn, b.px[k]); mx = Math.max(mx, b.px[k]); cxs += b.px[k]; by += b.py[k]; }
    cxs /= N; by = by / N - SHB.padV * S;                       // visible bottom (sim bottom row sits a pad below it)
    var restY = cellY(p.y + p.oy) + ANCHOR_K * S;               // contact line under the body
    var falling = !p.fly && p.y < p.r - 0.01 ? (p.r - p.y) : 0;
    var gap = Math.max(0, restY - by) / L.pitch;                // body bottom above its contact line (bounce, lift)
    var hc = p.lift + Math.max(0, p.out) * 0.6 + falling + Math.max(0, gap - p.lift);
    var hn = clamp(hc / SHB.liftCells, 0, 1), w = (mx - mn) * (1 - 2 * 0.06);
    var a = p.shA * p.alpha; if (a < 0.01) return;
    R.quad(cxs + sx, restY - 2 + sy, w * SHB.coreW * (1 + 0.35 * hn), w * SHB.coreW * 0.2 * (1 + 0.3 * hn), 13, SHC, SHB.core * a * Math.pow(1 - hn, 2), 0.45 + 0.5 * hn);
    if (Q.cur.shadow2) R.quad(cxs + sx, restY - 1 + sy, w * SHB.wideW * (1 + 0.8 * hn), w * SHB.wideW * 0.3 * (1 + 0.6 * hn), 13, SHC, SHB.wide * a * (1 - 0.65 * hn), 1);
  }
  var GLL = [], GLT = [], GLS = { x: 0, y: 0, w: 0, h: 0 };
  function pushDecals(sx, sy, t) {   // v2.2: goo decals as tinted atlas quads in the first (tray-scissored) GL batch
    if (!R.gl) return;
    var D = G.decals, span = JM.Renderer.DECAL_SPAN * L.cell;
    for (var i = 0; i < D.length; i++) {
      var d = D[i], age = t - d.t0, k = clamp(age / d.dur, 0, 1), sc = 0.5 + 0.5 * E.outBack(clamp(age / 140, 0, 1));
      R.decal(d.x + sx, d.y + sy, span * sc * (1 - 0.075 * k), d.rot, d.shape, d.gc, Math.pow(1 - k, 1.3));
    }
  }
  function zOrder(a, b) { return (a.z - b.z) || (a.y - b.y); }
  function renderGL() {
    var sx = G.shX || 0, sy = G.shY || 0, op = L.op, t = now();
    R.begin(PXG, t);
    GLS.x = op.x - 3 + sx; GLS.y = op.y - 7 + sy; GLS.w = op.w + 6; GLS.h = op.h + 12;
    R.batch(GLS);
    var list = GLL, top = GLT, i, p; list.length = 0; top.length = 0;
    for (var id in G.pieces) list.push(G.pieces[id]);
    for (i = 0; i < G.retiring.length; i++) { var q = G.retiring[i]; if (q.fly || !q.held && q.alpha < 1) top.push(q); else list.push(q); }
    list.sort(zOrder);
    pushDecals(sx, sy, t);
    for (i = 0; i < list.length; i++) { if (list[i].vol) pushShadowB(list[i], sx, sy); else pushPiece(list[i], sx, sy, true); }
    for (i = 0; i < list.length; i++) pushGlow(list[i], sx, sy);
    for (i = 0; i < list.length; i++) drawPiece(list[i], sx, sy);
    R.batch(null);
    for (i = 0; i < top.length; i++) { p = top[i]; pushGlow(p, sx, sy); drawPiece(p, sx, sy); }
    R.end();
  }
  function bBusy() {   // v2.2: anything to draw on the top 2D layer this frame?
    return !!(G.crateFx.length || G.beams.length || G.blasts.length || G.zaps.length || G.rings.length || G.parts.length || G.popups.length || G.toolMode || G.hammerFx ||
      (G.focus && !G.panel) || G.waveTag || G.skillTag || G.center || G.panel || G.result);
  }
  function renderB() {
    if (!bBusy()) {   // empty: clear what was drawn last time, then leave the layer alone
      if (bState) { clearB(BPREV); bState = 0; BPREV = null; }
      BST.skip++; return;
    }
    // v2.2: board-local effects only touch a bounding box (board + effect extents); clear prev ∪ current box, clip to current
    var rb = bRegion(); clearB(bState ? unionR(BPREV, rb) : rb); bState = 1; BPREV = rb; BST.draw++;
    if (rb) BST.px += (rb.x1 - rb.x0) * (rb.y1 - rb.y0); else BST.px += cB.width * cB.height;
    ctx = ctxB;
    ctx.save();
    if (rb) { ctx.beginPath(); ctx.rect(rb.x0, rb.y0, rb.x1 - rb.x0, rb.y1 - rb.y0); ctx.clip(); }
    ctx.setTransform(PX, 0, 0, PX, 0, 0);
    ctx.save(); ctx.translate(G.shX || 0, G.shY || 0);
    drawBeams(); drawBlasts(); drawZaps(); drawRings(); drawParts();
    for (var ci = 0; ci < G.crateFx.length; ci++) { var cf = G.crateFx[ci], age = now() - cf.t0; ctx.save(); ctx.translate(cf.x, cf.y); ctx.rotate(cf.rot); ctx.globalAlpha = clamp((L.instr.y - L.cell * 0.15 - cf.y) / (L.cell * 0.9), 0, 1); ART.crate(ctx, -L.cell / 2, -L.cell / 2, L.cell, 1, 0, clamp(1.6 - age / 900, 0, 1)); ctx.restore(); }
    if (G.focus && !G.panel) drawFocus(G.focus.r, G.focus.c);
    var tm = G.toolMode, first = tm && tm.kind === 'swap' && tm.first ? G.pieces[tm.first] : null;
    if (tm && tm.kind === 'hammer' && G.hover && !G.hammerFx) { var hs2 = L.cell * 0.52; drawImg('tool_hammer', L.gx + G.hover.c * L.pitch + L.cell * 0.6, L.gy + G.hover.r * L.pitch - L.cell * 0.16, hs2, hs2 * 369 / 362); }
    if (first) { var s3 = L.cell * 0.42; drawImg('tool_swap', L.gx + first.c * L.pitch + L.cell * 0.66, L.gy + first.r * L.pitch - L.cell * 0.12, s3, s3 * 355 / 335); }
    drawHammerFx();
    drawPopups();
    ctx.restore();
    drawBanner();
    drawShufflePreview(); drawMenu(); drawResult();
    drawParts(true);   // confetti above the result card
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.restore();
  }
  var BPREV = null;
  function clearB(r) { ctxB.setTransform(1, 0, 0, 1, 0, 0); if (r) ctxB.clearRect(r.x0, r.y0, r.x1 - r.x0, r.y1 - r.y0); else ctxB.clearRect(0, 0, cB.width, cB.height); }
  function unionR(a, b) { return a && b ? { x0: Math.min(a.x0, b.x0), y0: Math.min(a.y0, b.y0), x1: Math.max(a.x1, b.x1), y1: Math.max(a.y1, b.y1) } : null; }
  function bRegion() {   // device-px box of everything renderB will draw this frame; null = whole layer (panels, confetti)
    if (G.panel || G.result || G.crateFx.length) return null;
    var fr = L.frameRect, m = 44, x0 = fr.x - m, y0 = fr.y - m, x1 = fr.x + fr.w + m, y1 = fr.y + fr.h + m, i, e;
    function inc(x, y, r) { if (x - r < x0) x0 = x - r; if (y - r < y0) y0 = y - r; if (x + r > x1) x1 = x + r; if (y + r > y1) y1 = y + r; }
    for (i = 0; i < G.parts.length; i++) { var q = G.parts[i]; if (q.k === 'conf') return null; inc(q.x, q.y, q.r * 3 + 4); }
    for (i = 0; i < G.blasts.length; i++) { var bl = G.blasts[i]; inc(bl.x, bl.y, (bl.rad + 0.7) * L.pitch * 1.15 + 12); }
    for (i = 0; i < G.rings.length; i++) { var rg = G.rings[i]; inc(rg.x, rg.y, rg.r1 * L.pitch + rg.w + 4); }
    for (i = 0; i < G.popups.length; i++) { var pp = G.popups[i]; inc(pp.x, pp.y - 20, pp.size * 3 + 40); }
    if (G.center) inc(L.W / 2, L.B.y + L.B.h * 0.3, L.B.w * 0.26 + 20);
    e = 12;   // shake + antialiasing margin
    return { x0: Math.max(0, Math.floor((x0 - e) * PX)), y0: Math.max(0, Math.floor((y0 - e) * PX)), x1: Math.min(cB.width, Math.ceil((x1 + e) * PX)), y1: Math.min(cB.height, Math.ceil((y1 + e) * PX)) };
  }

  // ---------------------------------------------------------------- main loop
  var lastRaw = 0, timeScale = 1, frames = 0, fpsT = 0, fps = 60, frameMs = 0, manual = false;
  var PERF = { on: false, rec: [] , simMs: 0, drawMs: 0 };
  function frame(raw) {
    if (manual || PLAY.menu) { lastRaw = 0; requestAnimationFrame(frame); return; }   // C: level select covers the canvas → no game work
    var dt = lastRaw ? Math.min(100, Math.max(0, raw - lastRaw)) : 16; lastRaw = raw;   // v2.1: 100 ms cap (was 50) = SIMCLK max lag
    tick(dt, raw);
    requestAnimationFrame(frame);
  }
  function tick(dt, raw) {
    var cdt = dt * timeScale;
    if (G.hitStop > 0) { G.hitStop -= dt; cdt = 0; }       // hit-stop: freeze the world for a beat on big clears
    frames++; if (raw - fpsT > 1000) { fps = frames * 1000 / (raw - fpsT); frames = 0; fpsT = raw; }
    var t0 = performance.now();
    try {
      Clock.now += cdt; Clock.step();
      G.dispScore = Math.floor(sdValue(now()));
      if (SDTR.on) {   // C0 test trace: display vs target, popup count, centre text, fly-off pieces inside the tool zone
        var lowA = 0; for (var ri = 0; ri < G.retiring.length; ri++) { var rq = G.retiring[ri]; if (rq.fly && cellY(rq.y) - L.cell * 0.35 > L.instr.y && rq.alpha > lowA) lowA = rq.alpha; }
        var cfA = 0; for (var ci2 = 0; ci2 < G.crateFx.length; ci2++) if (G.crateFx[ci2].y - L.cell * 0.4 > L.instr.y) cfA = 1;
        SDTR.rec.push([Math.round(now()), G.dispScore, G.score, G.popups.length, G.center ? 1 : 0, Math.round(lowA * 100) / 100, cfA, SD.t0 | 0]);
      }
      idleTick(); hintTick();
      var id, ts = performance.now();
      SIMCLK.advance(cdt / 1000);
      for (id in G.pieces) { var p = G.pieces[id]; updatePiece(p, cdt, true); }
      for (var i = 0; i < G.retiring.length; i++) { var q = G.retiring[i]; updatePiece(q, cdt, true); }
      var td = performance.now();
      updateFx(cdt);
      var t1 = performance.now();
      if (!renderA()) hits = hitsA.slice();   // 2D base unchanged this frame → keep its hit regions
      var t2 = performance.now();
      renderBoard(); renderGL(); renderOver();
      var t3 = performance.now();
      renderB();
      var te = performance.now();
      PERF.simMs = td - ts; PERF.drawMs = te - td;
      if (PERF.on) PERF.rec.push([raw, dt, PERF.simMs, PERF.drawMs, te - t0, SIMCLK.steps]);
      // profiling hook (tests only): same record layout as the v2.1 instrumented baseline
      if (window.__PR) window.__PR.push([raw, dt, td - ts, t1 - td, t2 - t1, t3 - t2, te - t3, te - t0, SIMCLK.steps, performance.memory ? performance.memory.usedJSHeapSize : 0]);
      tierTick(dt, te - t0, raw);
      if (devPanel) devPanel.tick();
    } catch (err) { if (window.console) console.error(err); }
    frameMs += (performance.now() - t0 - frameMs) * 0.05;
    ivMs += (Math.min(dt, 250) - ivMs) * 0.05;
  }

  // ---------------------------------------------------------------- v2.2 adaptive quality (frame-interval driven, with hysteresis)
  // down: two consecutive 2 s windows averaging > 20 ms/frame (< 50 fps) → one tier lower.
  // up: steady ≤ 18 ms with ≤ 8 ms of JS per frame for upWait (5 s, doubling after each upgrade, max 60 s), and ≥ 8 s after a downgrade.
  var ivMs = 16.7, TC = { winStart: 0, n: 0, sum: 0, work: 0, bad: 0, good: 0, lastDown: -1e9, lastChange: 0, upWait: 5000 };
  function tierTick(dt, work, raw) {
    if (Q.forced || manual) return;
    if (!(dt > 0) || dt > 250) return;                                  // stalls / tab resume are not evidence
    if (raw - TC.lastChange < 1500) { TC.winStart = raw; TC.n = TC.sum = TC.work = 0; return; }   // settle after a change
    TC.n++; TC.sum += dt; TC.work += work;
    if (raw - TC.winStart < 2000) return;
    var avg = TC.sum / TC.n, wk = TC.work / TC.n, i = TIER_ORDER.indexOf(Q.cur.id);
    TC.winStart = raw; TC.n = TC.sum = TC.work = 0; Q.lastAvg = avg; Q.lastWork = wk;
    if (avg > 20) {
      TC.good = 0;
      if (++TC.bad >= 2 && i > 0) { TC.bad = 0; TC.lastDown = raw; setTier(TIER_ORDER[i - 1], 'auto down, avg ' + avg.toFixed(1) + ' ms'); }
    } else {
      TC.bad = 0;
      if (avg <= 18 && wk <= 8 && i < 2) {
        TC.good += 2000;
        if (TC.good >= TC.upWait && raw - TC.lastDown > 8000) { TC.good = 0; TC.upWait = Math.min(60000, TC.upWait * 2); setTier(TIER_ORDER[i + 1], 'auto up, avg ' + avg.toFixed(1) + ' ms'); }
      } else TC.good = 0;
    }
  }
  function setTier(id, why) {
    var nt = TIERS[id]; if (!nt || nt === Q.cur) return false;
    var old = Q.cur; Q.cur = nt; Q.log.push({ t: Math.round(performance.now()), from: old.id, to: id, why: why || '' });
    if (R) R.litBack = !nt.frontOnly;
    SIMCLK.maxLag = nt.maxLag;
    var nh = nt.simH || JM.SIM_H; if (SIMCLK.H !== nh) { SIMCLK.H = nh; SIMCLK.reset(); }   // low: 1/60 s steps (same period/settle, see docs/PERF_v2.2.md)
    if (bgLayer && (old.glDpr !== nt.glDpr || old.dpr2d !== nt.dpr2d)) { resizeSurfaces(); cache = {}; SPRC = {}; buildStatic(); }   // logical layout unchanged → bodies keep their state
    for (var pid in G.pieces) syncVol(G.pieces[pid]);
    G.retiring.forEach(syncVol);
    TC.lastChange = performance.now(); TC.bad = 0; TC.good = 0; dirtyAll = true; bState = 1;
    if (devPanel) devPanel.sync();
    return true;
  }

  // ---------------------------------------------------------------- v2.1 dev panel (only with ?dev=1 or Shift+D; normal UI unchanged)
  var devPanel = null;
  function setOctoMode(m) { OCTO.mode = m === 'B' ? 'B' : 'A'; for (var id in G.pieces) syncVol(G.pieces[id]); G.retiring.forEach(syncVol); if (devPanel) devPanel.sync(); }
  function sleepStats() { var n = 0, s = 0; for (var id in G.pieces) { n++; if (G.pieces[id].body.sleeping) s++; } return { pieces: n, sleeping: s }; }
  function makeDevPanel() {
    var el = document.createElement('div');
    el.style.cssText = 'position:fixed;left:6px;bottom:6px;z-index:50;background:rgba(30,24,20,.82);color:#fff;font:11px/1.45 monospace;padding:6px 8px;border-radius:8px;pointer-events:auto;min-width:170px';
    el.innerHTML = '<b>dev · v3.0 stageA</b><br>octopus: <button data-m="A">A 当前</button> <button data-m="B">B 体积壳(候选)</button>' +
      '<br>tier: <button data-q="auto">auto</button> <button data-q="high">high</button> <button data-q="medium">med</button> <button data-q="low">low</button>' +
      '<br>关卡: <select class="lv"></select> <button data-x="same">同seed重开</button><br>载入关卡 JSON: <input type="file" class="lf" accept=".json,application/json" style="width:150px"><br><span class="ev" style="color:#ffd27a"></span><br><span class="st"></span>';
    document.body.appendChild(el);
    var st = el.querySelector('.st'), evEl = el.querySelector('.ev'), last = 0, sel = el.querySelector('.lv');
    LVDATA.catalog.chapters.forEach(function (ch) { ch.levels.forEach(function (id) { var o = document.createElement('option'); o.value = id; o.textContent = (ch.chapterId || ch.id) + ' / ' + id; sel.appendChild(o); }); });
    sel.addEventListener('change', function () { startLevelId(sel.value, null); });
    el.querySelector('.lf').addEventListener('change', function (e) {
      var f = e.target.files && e.target.files[0]; if (!f) return;
      var rd = new FileReader(); rd.onload = function () { var r = loadLevelText(String(rd.result)); evEl.textContent = r.ok ? '已载入 ' + r.levelId + ' · ' + r.contentHash : '载入失败：' + r.errors.join('; '); }; rd.readAsText(f);
    });
    el.addEventListener('click', function (e) {
      var m = e.target.getAttribute && e.target.getAttribute('data-m'); if (m) setOctoMode(m);
      var q = e.target.getAttribute && e.target.getAttribute('data-q');
      if (e.target.getAttribute && e.target.getAttribute('data-x') === 'same') restartLevel(true);
      if (q) { if (q === 'auto') { Q.forced = null; TC.lastChange = performance.now(); } else { Q.forced = q; setTier(q, 'dev panel'); } api.sync(); }
    });
    var api = {
      el: el,
      sync: function () { [].forEach.call(el.querySelectorAll('button'), function (b) { var on = b.getAttribute('data-m') ? b.getAttribute('data-m') === OCTO.mode : (b.getAttribute('data-q') === (Q.forced || 'auto')); b.style.fontWeight = on ? '900' : '400'; b.style.background = on ? '#ffd27a' : '#eee'; }); },
      tick: function () {
        var t = performance.now(); if (t - last < 250) return; last = t;
        var ss = sleepStats(), lit = R && R.stats ? R.stats.litDraws : 0;
        st.textContent = '';
        st.innerHTML = '<b>tier ' + Q.cur.id + '</b>' + (Q.forced ? ' (forced)' : ' (auto)') + ' · fps ' + Math.round(fps) + '<br>frame ' + ivMs.toFixed(1) + 'ms · js ' + frameMs.toFixed(1) + 'ms' +
          '<br>gl dpr ' + DPRG.toFixed(2) + ' · 2d dpr ' + DPR.toFixed(2) + '<br>mode ' + OCTO.mode + (R && R.hasLit && R.hasLit() ? '' : ' (no lit → A)') + ' · NG ' + Q.cur.ng +
          '<br>sim ' + PERF.simMs.toFixed(2) + 'ms · draw ' + PERF.drawMs.toFixed(2) + 'ms<br>steps/frame ' + SIMCLK.steps + ' · sleeping ' + ss.sleeping + '/' + ss.pieces +
          '<br>lit draws ' + lit + ' · parts ' + G.parts.length + '<br>level ' + PLAY.levelId + ' · seed ' + PLAY.seed + ' · ' + PLAY.source + '<br>core ' + (CS ? CS.phase + ' · ' + Core.stateHash(CS) : '-');
        if (G.lastEv) evEl.textContent = '事件：' + G.lastEv.text;
        if (sel.value !== PLAY.levelId) sel.value = PLAY.levelId;
      }
    };
    api.sync(); return api;
  }
  window.addEventListener('keydown', function (e) {
    if (e.shiftKey && (e.key === 'D' || e.key === 'd')) { if (!devPanel) devPanel = makeDevPanel(); else { devPanel.el.style.display = devPanel.el.style.display === 'none' ? '' : 'none'; } }
  });

  // ---------------------------------------------------------------- boot
  function boot() {
    var names = Object.keys(IMG_LIST), left = names.length, failed = [];
    names.forEach(function (n) {
      var im = new Image();
      im.onload = function () { if (--left === 0) ready(); };
      im.onerror = function () { failed.push(n); if (--left === 0) ready(); };
      im.src = IMG_LIST[n]; IMG[n] = im;
    });
    function ready() {
      var bootEl = document.getElementById('boot');
      if (failed.length) { bootEl.textContent = '素材加载失败：' + failed.join(', '); return; }
      var sprites = {}; TYPES.forEach(function (t) { sprites[t] = IMG[t]; });
      if (IMG.__octoBase && IMG.__octoMat) { sprites.__octoBase = IMG.__octoBase; sprites.__octoMat = IMG.__octoMat; JM.MAT.jelly_octopus.baseImg = IMG.__octoBase; JM.MAT.jelly_octopus.matImg = IMG.__octoMat; }
      R = new JM.Renderer(cG, sprites);
      R.litBack = !Q.cur.frontOnly; SIMCLK.maxLag = Q.cur.maxLag; SIMCLK.H = Q.cur.simH || JM.SIM_H; TC.lastChange = performance.now();
      if (/[?&]dev=1/.test(QS)) devPanel = makeDevPanel();
      makeObstacleIcons();
      layout(); bootLevel();
      bootEl.className = 'hide'; setTimeout(function () { bootEl.style.display = 'none'; }, 400);
      requestAnimationFrame(frame);
    }
  }
  function makeObstacleIcons() {   // placeholder obstacle art (procedural) → canvases usable by HUD / result / preview
    function mk(fn) { var c = document.createElement('canvas'); c.width = c.height = 256; var x = c.getContext('2d'); x.scale(256 / 100, 256 / 100); fn(x); return c; }
    IMG.__frost = mk(function (x) { ART.frosting(x, 4, 4, 92, 2, 0, 1); });
    IMG.__crate = mk(function (x) { ART.crate(x, 4, 4, 92, 3, 0, 1); });
    for (var h = 1; h <= 3; h++) (function (h) { IMG['__crate' + h] = mk(function (x) { ART.crate(x, 0, 0, 100, h, 0, 1); }); })(h);
    IMG.__tie = mk(function (x) { x.fillStyle = '#c9e9da'; x.beginPath(); x.arc(50, 50, 34, 0, 6.3); x.fill(); ART.tie(x, 4, 4, 92, 0, 1); });
    IMG.__tieOver = mk(function (x) { ART.tie(x, 0, 0, 100, 0, 1); });
    IMG.__basket = mk(function (x) { ART.basket(x, 4, 4, 92, 0, 1); });
  }
  // ---------------------------------------------------------------- C1/C2: level select / chapter flow / challenges (js/menu.js renders the DOM)
  function formalChapters() { return LVDATA.catalog.chapters.filter(function (c) { return c.formal; }); }
  function formalIds() { return formalChapters().reduce(function (a, c) { return a.concat(c.levels); }, []); }
  function isFormalChapter() { var ch = LVDATA.catalog.chapters[PLAY.chapter]; return !!(PLAY.source === 'catalog' && PLAY.mode === 'normal' && ch && ch.formal && ch.levels[PLAY.idx] === PLAY.levelId); }
  function lvView(id) { var d = LVDATA.levels[id]; return PG.levelView(progress().state, id, Core.SCORE_VERSION, d.contentRevision); }
  function nextOpenLevel() { var ids = formalIds(), u = PG.unlocked(progress().state, ids); for (var i = 0; i < ids.length; i++) if (u[ids[i]] && !lvView(ids[i]).cleared) return ids[i]; return null; }
  var ICONURL = {};
  function iconURL(key) {
    if (ICONURL[key]) return ICONURL[key];
    var im = IMG[key]; if (!im) return '';
    try { ICONURL[key] = im.toDataURL ? im.toDataURL('image/png') : im.src; } catch (e) { ICONURL[key] = im.src || ''; }
    return ICONURL[key];
  }
  var MENU_API = {
    scoreVersion: function () { return Core.SCORE_VERSION; },
    progressStatus: function () { var p = progress(); return { source: p.source, writable: p.writable, reason: p.reason || null }; },
    chapters: function () {
      var st = progress().state, u = PG.unlocked(st, formalIds());
      return formalChapters().map(function (c) { return { chapterId: c.chapterId, name: c.name, levels: c.levels.map(function (id) {
        var d = LVDATA.levels[id], v = lvView(id); return { levelId: id, name: d.displayName, unlocked: !!u[id], cleared: !!v.cleared, stars: v.best ? v.best.stars : 0,
          legacyOnly: !!(v.cleared && !v.best && (v.legacy || (v.otherVersions && v.otherVersions.length))), role: d.editorNotes && d.editorNotes.chapterRole }; }) }; });
    },
    nextOpenLevel: nextOpenLevel,
    levelPreview: function (id) {
      var d = LVDATA.levels[id]; if (!d) return null;
      var g0 = Core.createGame(d, { seed: 1 }), v = lvView(id);
      return { name: d.displayName, moves: d.moveLimit, stars: lv0(d).stars, best: v.best, noTool: v.noTool, tip: d.editorNotes && d.editorNotes.playerTip,
        goals: g0.goals.map(function (g) { var gv = goalView(g); return { icon: iconURL(gv.type), label: '×' + gv.total }; }) };
    },
    challenges: function () {
      var st = progress().state;
      return (LVDATA.catalog.challenges || []).map(function (c) { var v = PG.challengeView(st, c.challengeId, c.configKey);
        return { challengeId: c.challengeId, name: c.name, focusText: c.focusText, seed: c.seed, moves: c.moves, versions: c.scoreVersion + ' · r' + c.contentRevision,
          ranked: v.ranked, attempts: v.attempts, bestUnfinished: v.bestUnfinished }; });
    },
    startFormal: function (id) { closeMenu(); startLevelId(id, null); },
    startChallenge: function (cid) { var c = (LVDATA.catalog.challenges || []).filter(function (x) { return x.challengeId === cid; })[0]; if (!c) return; closeMenu(); startChallenge(c); }
  };
  function lv0(d) { var sc = d.scoring || {}; return { stars: sc.stars || [0, 0, 0] }; }
  function startChallenge(c) { PLAY.challenge = c; PLAY.chapter = -1; PLAY.idx = 0; startDef(LVDATA.levels[c.levelId], c.seed, 'challenge'); }
  function openSelect(tab) { PLAY.menu = true; G.panel = null; if (window.JellyMenu) window.JellyMenu.select(tab || 'levels'); }
  function closeMenu() { PLAY.menu = false; lastRaw = 0; if (window.JellyMenu) window.JellyMenu.hide(); }
  function chapterComplete() {
    var chs = LVDATA.catalog.chapters, ch = chs[PLAY.chapter], st = progress().state, cl = 0, stars = 0;
    ch.levels.forEach(function (id) { var v = lvView(id); if (v.cleared) cl++; if (v.best) stars += v.best.stars; });
    var fc = formalChapters(), i = fc.indexOf(ch), nxt = fc[i + 1];
    PLAY.menu = true; G.panel = null;
    window.JellyMenu.chapterDone({ chapterId: ch.chapterId, name: ch.name, cleared: cl, total: ch.levels.length, stars: stars, nextChapterFirst: nxt && PG.unlocked(st, formalIds())[nxt.levels[0]] ? nxt.levels[0] : null });
  }
  if (window.JellyMenu) window.JellyMenu.init(MENU_API);
  function qsParam(n) { var m = new RegExp('[?&]' + n + '=([^&#]*)').exec(QS); return m ? decodeURIComponent(m[1]) : null; }
  function bootLevel() {
    if (PLAY.mode === 'playtest') {   // wait for the editor to hand over the draft; never touches player progress
      if (PT_PENDING) { startDef(PT_PENDING.def, PT_PENDING.seed, 'playtest'); PT_PENDING = null; }
      else if (window.parent !== window) window.parent.postMessage({ type: 'jelly_playtest_ready' }, '*');
      if (!DEF) { var d0 = LVDATA.levels[chapterLevels()[0]]; startDef(d0, 1, 'playtest'); }
      return;
    }
    var id = qsParam('level'), sd = qsParam('seed'), seed = sd != null && /^\d+$/.test(sd) ? +sd : null;
    if (id && LVDATA.levels[id]) { if (startLevelId(id, seed)) return; }
    if (seed != null) { PLAY.idx = 0; startDef(LVDATA.levels[chapterLevels()[0]], seed, 'catalog'); return; }
    if (/[?&]dev=1/.test(QS)) { var dv = LVDATA.catalog.chapters.filter(function (c) { return !c.formal; })[0]; if (dv) { startLevelId(dv.levels[0], null); return; } }   // dev entry keeps the old default (first dev chapter)
    var nx = nextOpenLevel() || (formalIds()[0]);
    if (nx && window.JellyMenu) { startLevelId(nx, null); openSelect(/[?&]menu=chal/.test(QS) ? 'chal' : 'levels'); return; }   // C: default entry = level select
    startLevel(0);
  }
  function startLevelId(id, seed) {
    var chs = LVDATA.catalog.chapters;
    for (var i = 0; i < chs.length; i++) { var j = chs[i].levels.indexOf(id); if (j >= 0) { PLAY.chapter = i; PLAY.idx = j; startDef(LVDATA.levels[id], seed, 'catalog'); return true; } }
    if (LVDATA.levels[id]) { startDef(LVDATA.levels[id], seed, 'catalog'); return true; }
    return false;
  }
  function loadLevelText(txt, seed) {   // game loads an exported level JSON (dev panel / test hook); validated by the same schema module
    var r = LS.parse(txt); if (!r.ok) return { ok: false, errors: r.errors };
    var v = LS.validate(r.def, { seeds: 3 });
    if (!v.structuralOk) return { ok: false, errors: v.issues.filter(function (i) { return i.sev === 'error'; }).map(function (i) { return i.code + ': ' + i.msg; }) };
    startDef(r.def, seed != null ? seed : null, 'file');
    return { ok: true, levelId: r.def.levelId, contentHash: LS.contentHash(r.def), seed: PLAY.seed };
  }
  var rsT = 0;
  window.addEventListener('resize', function () { clearTimeout(rsT); rsT = setTimeout(function () { if (bgLayer) layout(); }, 60); });
  document.addEventListener('visibilitychange', function () {
    lastRaw = 0; SIMCLK.reset(); TC.lastChange = performance.now();   // resume: no catch-up burst, no tier decision from the gap
    try { if (Sound.ac) { if (document.hidden) Sound.ac.suspend(); else if (!Sound.muted) Sound.ac.resume(); } } catch (e) { }   // v2.2: audio off while hidden
  });

  // ---------------------------------------------------------------- test hooks (automated QA only)
  var CODE = { s: 'jelly_squid', f: 'jelly_fugu', j: 'jelly_jellyfish', o: 'jelly_octopus', b: 'jelly_bear', g: 'jelly_fig', R: 'rainbow' };
  var SPC = { '-': 'h', '|': 'v', '*': 'bomb' };
  window.JellyDebug = {
    state: function () {
      var specials = [];
      if (G.board) for (var r = 0; r < ROWS; r++) for (var c = 0; c < COLS; c++) { var p = G.board[r][c]; if (p && p.sp) specials.push([r, c, p.sp, p.type]); }
      return { phase: G.phase, moves: G.moves, score: G.score, goals: G.goals.map(function (g) { return [g.type, g.left]; }), tools: JSON.parse(JSON.stringify(G.tools)),
        retiring: G.retiring.length, revision: G.revision, level: G.level, levelId: PLAY.levelId, seed: PLAY.seed, source: PLAY.source, mode: PLAY.mode, corePhase: CS && CS.phase, result: G.result && { win: G.result.win, stars: G.result.stars },
        toolMode: G.toolMode && G.toolMode.kind, panel: G.panel && G.panel.kind, types: G.board ? typesGrid() : null, muted: Sound.muted, reduced: G.reduced,
        renderer: R && R.mode, specials: specials, chain: G.chain, maxChain: G.maxChain, combos: G.combos, banner: !!G.center, praise: G.center && G.center.text, waveTag: G.waveTag && { n: G.waveTag.n, pct: G.waveTag.pct }, skillTag: G.skillTag && { n: G.skillTag.n, bonus: G.skillTag.bonus },
        parts: G.parts.length, fx: { beams: G.beams.length, blasts: G.blasts.length, zaps: G.zaps.length }, banner2: G.waveTag && G.waveTag.n, praiseOn: !!G.center, dispScore: G.dispScore, opGain: G.op ? G.op.gain : null, fps: Math.round(fps), frameMs: Math.round(frameMs * 10) / 10 };
    },
    // rows: 7 strings of 7 space-separated tokens, e.g. "f f g s b o j"; suffix - | * marks h/v stripe or bomb; R = rainbow
    seedBoard: function (rows) {   // v3: goes through the core (jellies only; obstacles stay), then visuals are rebuilt from the core
      if (G.phase !== 'ready') return false;
      var grid = [];
      for (var r = 0; r < ROWS; r++) {
        var tk = rows[r].trim().split(/\s+/); grid.push([]);
        for (var c = 0; c < COLS; c++) { var s = tk[c]; grid[r].push({ type: CODE[s[0]], sp: s[0] === 'R' ? 'rainbow' : (SPC[s[1]] || null) }); }
      }
      if (!Core.debugSetJellies(CS, grid)) return false;
      PLAY.tainted = true;
      buildVisuals(false); G.revision++; G.sel = null; G.hint = null; return true;
    },
    swap: function (r1, c1, r2, c2) { trySwap(G.board[r1][c1], G.board[r2][c2]); },
    cellCenter: function (r, c) { return { x: cellX(c) * K, y: cellY(r) * K }; },
    toolCenter: function (id) { var t = L.tools.filter(function (x) { return x.id === id; })[0]; return { x: (t.x + t.w / 2) * K, y: (t.y + t.h / 2) * K }; },
    moves: function () { return Core.listMoves(CS); },
    greedyMove: function () {   // test helper (read-only): 1-step lookahead on a clone of the core (peeks at real refills; never mutates CS)
      var best = null, bv = -1e18;
      Core.listMoves(CS).forEach(function (m) { var c = Core.clone(CS), r = Core.apply(c, { type: 'swap', r1: m[0], c1: m[1], r2: m[2], c2: m[3] }); if (!r.ok) return;
        var v = (c.phase === 'won' ? 1e9 : 0) + c.goals.reduce(function (s, g) { return s + Math.min(g.progress, g.target) / g.target; }, 0) * 1e6 + c.score;
        if (v > bv) { bv = v; best = [[m[0], m[1]], [m[2], m[3]]]; } });
      return best;
    },
    findMove: function () { var m = Core.listMoves(CS, 1)[0]; return m ? [[m[0], m[1]], [m[2], m[3]]] : null; },
    hits: function () { return hits.map(function (h) { return { id: h.id, x: (h.x + h.w / 2) * K, y: (h.y + h.h / 2) * K }; }); },
    setMoves: function (n) { PLAY.tainted = true; CS.moves = n; G.moves = n; },
    setTimeScale: function (k) { timeScale = k; },
    setGoalsLeft: function (a, b) {   // test shortcut: edits the core goal progress, the HUD follows
      PLAY.tainted = true;
      [a, b].forEach(function (v, i) { var g = CS.goals[i]; if (g && v != null) { g.progress = Math.max(0, g.target - v); G.goals[i] = goalView(g); } });
    },
    setReduced: function (v) { G.reduced = !!v; },
    // ---- v2.1
    setOctoMode: setOctoMode, octoMode: function () { return OCTO.mode; }, hasLit: function () { return !!(R && R.hasLit && R.hasLit()); },
    // manual clock: freeze rAF-driven time; advance(ms, fps) runs exact frames (deterministic A/B captures)
    setManual: function (v) { manual = !!v; lastRaw = 0; },
    advance: function (ms, fpsv) { var step = 1000 / (fpsv || 60), n = Math.round(ms / step); for (var i = 0; i < n; i++) tick(step, performance.now()); },
    sleepStats: sleepStats,
    simClock: function () { return { steps: SIMCLK.steps, total: SIMCLK.total, clamped: SIMCLK.clamped, alpha: SIMCLK.alpha }; },
    perfStart: function () { PERF.rec = []; PERF.on = true; }, perfStop: function () { PERF.on = false; return PERF.rec; },
    renderStats: function () { return R && R.stats; },
    piece: function (r, c) { var p = G.board[r][c]; if (!p) return null; var v = p.vol; return { id: p.id, type: p.type, S: p.S, sleeping: !!p.body.sleeping, vol: v ? { minZ: v.minZ, maxZ: v.maxZ, yaw: v.yaw } : null, lift: p.lift }; },
    setLift: function (r, c, v) { var p = G.board[r][c]; if (p) p.lift = v; },
    // ---- v2.2
    tier: function () { return Q.cur.id; }, tierInfo: function () { return { tier: Q.cur.id, forced: Q.forced, start: Q.start, log: Q.log.slice(), lastAvg: Q.lastAvg, lastWork: Q.lastWork, dpr2d: DPR, dprGL: DPRG }; },
    setTier: function (id) { Q.forced = id || null; if (id) setTier(id, 'debug'); return Q.cur.id; },
    // ---- v3 stage A
    core: function () { return { phase: CS.phase, moves: CS.moves, score: CS.score, tools: JSON.parse(JSON.stringify(CS.tools)), goals: CS.goals.map(function (g) { return { type: g.type, typeId: g.typeId, progress: g.progress, target: g.target }; }), hash: Core.stateHash(CS), seed: CS.seed, levelId: DEF.levelId, log: CS.log.length, view: Core.view(CS) }; },
    actions: function () { return CS.log.map(function (l) { return l.action || l; }); },
    epoch: function () { return G.epoch; },
    // ---- stage C0: score presentation state (display vs logic) and result controls
    scoreView: function () { var Rs = G.result; return { logic: CS.score, target: G.score, disp: G.dispScore, sdTo: SD.to, sdDur: SD.dur, sdSets: SD.sets, op: G.op && { gain: G.op.gain, ended: G.op.endT != null },
      ledgerTotal: CS.scoring.total, final: CS.scoring.final, entries: CS.scoring.entries.length, waveTag: G.waveTag && { n: G.waveTag.n, pct: G.waveTag.pct }, skillTag: G.skillTag && { n: G.skillTag.n, bonus: G.skillTag.bonus },
      center: G.center && G.center.text, popups: G.popups.map(function (p) { return { text: p.text, x: p.x * K, y: p.y * K }; }),
      result: Rs && { win: Rs.win, finalScore: Rs.finalScore, skipped: Rs.skipped, s1: !!Rs.s1, s2: !!Rs.s2, open: Rs.open, rec: Rs.rec, breakdown: Rs.breakdown } }; },
    traceStart: function () { SDTR.rec = []; SDTR.on = true; }, traceStop: function () { SDTR.on = false; return SDTR.rec; },
    zones: function () { return { instrY: L.instr.y * K, toolsY: L.tools[0].y * K, boardTop: L.B.y * K, boardBottom: (L.B.y + L.B.h) * K, boardW: L.B.w * K, K: K }; },
    skipResult: function () { if (G.result && G.result.win) skipReveal(G.result); },
    toggleDetails: function () { if (G.result) G.result.open = !G.result.open; },
    progress: function () { return JSON.parse(JSON.stringify(progress())); },
    formal: function () { return isFormal(); },
    menu: function () { return Object.assign({ open: PLAY.menu, tainted: PLAY.tainted, source: PLAY.source, challenge: PLAY.challenge && PLAY.challenge.challengeId, initOk: PLAY.initOk, chapter: PLAY.chapter, idx: PLAY.idx }, window.JellyMenu ? window.JellyMenu.state() : {}); },
    openMenu: function (tab) { openSelect(tab); }, menuApi: function () { return MENU_API; },
    visualCheck: function () {   // presentation must mirror the core once idle
      var bad = [];
      for (var r = 0; r < ROWS; r++) for (var c = 0; c < COLS; c++) {
        var k = r * COLS + c, o = CS.occ[k], p = G.board[r][c], u = CS.under[k], f = G.frost[k];
        if (o && o.kind === 'crate') { var q = G.crates[o.id]; if (!q || q.hp !== o.hp || q.r !== r || q.c !== c || p) bad.push('crate@' + r + ',' + c); }
        else if (o && o.kind === 'basket') { var bq = G.baskets[o.id]; if (!bq || bq.r !== r || bq.c !== c || Math.abs(bq.y - r) > 0.01 || p) bad.push('basket@' + r + ',' + c); }
        else if (o) { if (!p || p.type !== o.type || (p.sp || null) !== (o.sp || null) || p.id !== o.id) bad.push('piece@' + r + ',' + c); }
        else if (p) bad.push('ghost@' + r + ',' + c);
        if ((u ? u.layers : 0) !== (f ? f.layers : 0)) bad.push('frost@' + r + ',' + c);
        var tv = CS.over[k], tg = G.ties[k]; if (!!tv !== !!tg || (tv && tv.id !== tg.id)) bad.push('tie@' + r + ',' + c);
      }
      for (var bid in G.baskets) { var bb = G.baskets[bid], bo = CS.occ[bb.r * COLS + bb.c]; if (!bo || bo.id !== +bid) bad.push('ghostBasket#' + bid); }
      if (G.moves !== CS.moves) bad.push('moves');
      G.goals.forEach(function (g, i) { if (g.left !== Math.max(0, CS.goals[i].target - CS.goals[i].progress)) bad.push('goal' + i); });
      return bad;
    },
    startLevelId: function (id, seed) { return startLevelId(id, seed); },
    restart: function (same) { restartLevel(!!same); return PLAY.seed; },
    loadLevelJSON: function (txt, seed) { return loadLevelText(txt, seed); },
    lastEvents: function () { return G.evLog.slice(); },
    crates: function () { return Object.keys(G.crates).map(function (id) { var q = G.crates[id]; return [q.r, q.c, q.hp]; }); },
    ties: function () { return Object.keys(G.ties).map(function (k) { var q = G.ties[k]; return [q.r, q.c, q.id]; }); },
    baskets: function () { return Object.keys(G.baskets).map(function (id) { var q = G.baskets[id]; return [q.r, q.c, +id]; }); },
    delivered: function () { return CS.delivered; },
    hammer: function (r, c) { if (G.phase !== 'ready') return false; enterTool('hammer'); if (G.phase !== 'tool') return false; hammerStrike({ r: r, c: c }); if (G.phase === 'tool') { exitTool(); return false; } return true; },
    layerStats: function () { return { a: JSON.parse(JSON.stringify(AST)), b: JSON.parse(JSON.stringify(BST)), board: BST2.board, over: BST2.over || 0, canvas: [cA.width, cA.height, cG.width, cG.height] }; }
  };

  boot();
})();
