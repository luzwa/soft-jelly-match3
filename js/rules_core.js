/* 果冻三消 · 规则核心 (Stage A + Stage B: gummy ties, delivery baskets + exits; Stage C0: ScoreService ledger) — pure & deterministic.
 * No DOM, no timers, no animation callbacks, no Math.random. Used by the game, the editor playtest and the headless rule tests.
 * The game feeds accepted player actions in and replays the returned event log; goals / durability / win-lose are decided here.
 * UMD: window.JellyCore in the browser, module.exports in Node.
 */
(function (root) {
  'use strict';
  var RULESET = 'jelly_rules_v1', SCHEMA = 1, RNG_ALGO = 'mulberry32_v1', CORE_VERSION = '3.2.0-C0';
  // C0: scores come only from the versioned ScoreService, fed with results this core has already committed
  var Score = (typeof module !== 'undefined' && module.exports) ? require('./score_service.js') : root.JellyScore;
  var TYPES = ['jelly_squid', 'jelly_fugu', 'jelly_jellyfish', 'jelly_octopus', 'jelly_bear', 'jelly_fig'];
  var MAX_INIT_ATTEMPTS = 100, MAX_SHUFFLE_ATTEMPTS = 200, MAX_WAVES = 60;

  // ------------------------------------------------------------------ registry (single source for runtime, editor palette, validation)
  var REGISTRY = {
    rulesetVersion: RULESET,
    jellies: TYPES.slice(),
    specials: { h: { name: '横向划线' }, v: { name: '纵向划线' }, bomb: { name: '炸弹' }, rainbow: { name: '彩虹' } },
    obstacles: {
      frosting_pad: { layer: 'underlay', name: '糖霜地垫', min: 1, max: 2, field: 'layers', hitBy: ['match_on_cell', 'direct_attack'], goal: 'clear_underlay',
        blocksSwap: false, blocksGravity: false, stage: 'A', enabled: true, art: 'placeholder' },
      cookie_crate: { layer: 'occupant', name: '饼干箱', min: 1, max: 3, field: 'hp', hitBy: ['adjacent_ordinary_match', 'direct_attack'], goal: 'clear_obstacle',
        blocksSwap: true, blocksGravity: true, blocksLineAttack: false, fixed: true, stage: 'A', enabled: true, art: 'placeholder' },
      gummy_tie: { layer: 'overlay', name: '软糖绑带', min: 1, max: 1, field: 'layers', hitBy: ['host_matched', 'direct_attack'], goal: 'clear_obstacle',
        blocksSwap: true, blocksGravity: true, hostOnly: ['jelly', 'special'], stage: 'B', enabled: true, art: 'placeholder' }
    },
    delivery: {
      delivery_basket: { layer: 'occupant', name: '送达果篮', matchable: false, swappable: false, falls: true, immuneToAttack: true, goal: 'deliver',
        stage: 'B', enabled: true, art: 'placeholder' }
    },
    goals: {
      collect_piece: { name: '收集果冻', stage: 'A', enabled: true },
      clear_underlay: { name: '清除糖霜', stage: 'A', enabled: true },
      clear_obstacle: { name: '清除障碍（箱子 / 绑带）', stage: 'A', enabled: true, typeIds: ['cookie_crate', 'gummy_tie'] },
      deliver: { name: '送达出口', stage: 'B', enabled: true, typeIds: ['delivery_basket'] }
    },
    facilities: { spawner: { stage: 'A', enabled: true }, exit: { stage: 'B', enabled: true, at: 'segment_bottom', art: 'placeholder' } },
    layers: ['terrain', 'underlay', 'occupant', 'overlay'],
    limits: { moves: [1, 99], weight: [0, 100], goals: [1, 3], tools: [0, 9] }
  };

  // ------------------------------------------------------------------ RNG (separate gameplay streams; visuals never touch these)
  function hashStr(s) { var h = 0x811c9dc5; for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; } return h >>> 0; }
  function rng(seed) { return { s: seed >>> 0 }; }
  function rnext(r) { r.s = (r.s + 0x6D2B79F5) >>> 0; var t = r.s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }
  function rint(r, n) { return Math.floor(rnext(r) * n); }
  function stream(seed, name) { return rng(hashStr(String(seed) + '|' + name)); }
  function weighted(r, pool) { var tot = 0, i; for (i = 0; i < pool.length; i++) tot += pool[i].weight; var x = rnext(r) * tot; for (i = 0; i < pool.length; i++) { x -= pool[i].weight; if (x < 0) return pool[i].typeId; } return pool[pool.length - 1].typeId; }

  // ------------------------------------------------------------------ board geometry
  function maskOf(def) {
    var R = def.board.rows, C = def.board.cols, m = [];
    for (var r = 0; r < R; r++) for (var c = 0; c < C; c++) m.push(!!(def.board.playableMask[r] && def.board.playableMask[r][c] === '1'));
    return m;
  }
  // static vertical segments: contiguous playable runs per column (top → bottom)
  function segmentsOf(mask, R, C) {
    var segs = [];
    for (var c = 0; c < C; c++) {
      var r = 0;
      while (r < R) {
        if (!mask[r * C + c]) { r++; continue; }
        var r0 = r; while (r < R && mask[r * C + c]) r++;
        segs.push({ c: c, r0: r0, r1: r - 1 });
      }
    }
    return segs;
  }

  // ------------------------------------------------------------------ state
  function createGame(def, opts) {
    opts = opts || {};
    var seed = opts.seed != null ? (opts.seed >>> 0) : 1;
    var R = def.board.rows, C = def.board.cols, N = R * C, mask = maskOf(def), k, i;
    var st = {
      coreVersion: CORE_VERSION, rulesetVersion: RULESET, rngAlgo: RNG_ALGO,
      levelId: def.levelId, contentRevision: def.contentRevision, seed: seed,
      R: R, C: C, mask: mask, segs: segmentsOf(mask, R, C), spawn: {}, exits: {}, occ: [], under: [], over: [], delivered: 0, nextId: 1,
      pool: (def.spawnPool || []).filter(function (p) { return p.weight > 0; }).map(function (p) { return { typeId: p.typeId, weight: p.weight }; }),
      moves: def.moveLimit, tools: { hammer: 0, swap: 0, shuffle: 0 }, goals: [], score: 0, phase: 'ready', revision: 0, turn: 0, waveSeq: 0,
      rng: { fill: stream(seed, 'fill'), refill: stream(seed, 'refill'), shuffle: stream(seed, 'shuffle') },
      stars: (def.scoring && def.scoring.stars) || [600, 1400, 2400], log: [], diag: null, initAttempts: 0,
      scoreVersion: Score.SCORE_VERSION, scoring: Score.newLedger(Score.CONFIG, { runId: def.levelId + '#' + seed })
    };
    var tl = def.tools || { hammer: 3, swap: 3, shuffle: 3 };
    st.tools = { hammer: tl.hammer | 0, swap: tl.swap | 0, shuffle: tl.shuffle | 0 };
    (def.board.spawners || []).forEach(function (s) { st.spawn[s.row * C + s.col] = 1; });
    (def.board.exits || []).forEach(function (x) { st.exits[x.row * C + x.col] = 1; });
    for (k = 0; k < N; k++) { st.occ.push(null); st.under.push(null); st.over.push(null); }
    // fixed placements
    var fixed = [];
    (def.initial && def.initial.placements || []).forEach(function (p) {
      var kk = p.row * C + p.col;
      if (p.layer === 'underlay' && p.typeId === 'frosting_pad') st.under[kk] = { kind: 'frosting', layers: p.layers };
      else if (p.layer === 'overlay' && p.typeId === 'gummy_tie') st.over[kk] = { kind: 'tie' };
      else if (p.layer === 'occupant' && p.typeId === 'cookie_crate') st.occ[kk] = { kind: 'crate', type: 'cookie_crate', hp: p.hp, sp: null };
      else if (p.layer === 'occupant' && p.typeId === 'delivery_basket') st.occ[kk] = { kind: 'basket', type: 'delivery_basket', sp: null };
      else if (p.layer === 'occupant') st.occ[kk] = { kind: 'jelly', type: p.special === 'rainbow' ? 'rainbow' : p.typeId, sp: p.special || null };
      if (p.layer === 'occupant') fixed[kk] = 1;
    });
    // seeded fill of the unassigned playable cells (bounded attempts; fixed content never rearranged)
    var allowM = !!(def.initial && def.initial.allowInitialMatches), ok = false, base = st.occ.slice();
    for (var at = 0; at < MAX_INIT_ATTEMPTS && !ok; at++) {
      st.initAttempts = at + 1;
      var occ = base.slice();
      for (k = 0; k < N; k++) {
        if (!mask[k] || occ[k]) continue;
        var r = Math.floor(k / C), c = k % C, opts2 = st.pool;
        if (!allowM) opts2 = st.pool.filter(function (p) { return !wouldMatch(occ, R, C, r, c, p.typeId); });
        if (!opts2.length) opts2 = st.pool;
        occ[k] = { kind: 'jelly', type: weighted(st.rng.fill, opts2), sp: null };
      }
      st.occ = occ;
      if (!allowM && findRuns(st).length) continue;
      if (!listMoves(st, 1).length) continue;
      ok = true;
    }
    if (!ok) { st.phase = 'stuck'; st.diag = { reason: 'init_failed', seed: seed, attempts: st.initAttempts }; }
    // stable instance ids: underlay row-major, then occupants row-major, then overlays (ties) row-major
    for (k = 0; k < N; k++) if (st.under[k]) st.under[k].id = st.nextId++;
    for (k = 0; k < N; k++) if (st.occ[k]) { st.occ[k] = { id: st.nextId++, kind: st.occ[k].kind, type: st.occ[k].type, sp: st.occ[k].sp, hp: st.occ[k].hp || 0 }; if (st.occ[k].kind === 'jelly') st.occ[k].tok = st.occ[k].id; }   // scoreTokenId
    for (k = 0; k < N; k++) { if (st.over[k] && !st.occ[k]) st.over[k] = null; if (st.over[k]) st.over[k].id = st.nextId++; }
    // goals: "all" scopes are frozen to the initial instance set here
    (def.goals || []).forEach(function (g) {
      var G = { type: g.type, typeId: g.typeId || null, target: 0, progress: 0, ids: null };
      if (g.type === 'collect_piece') G.target = g.count;
      else if (g.type === 'clear_underlay' || g.type === 'clear_obstacle' || g.type === 'deliver') {
        var tie = g.type === 'clear_obstacle' && g.typeId === 'gummy_tie', want = g.type === 'clear_underlay' ? 'frosting' : g.type === 'deliver' ? 'basket' : tie ? 'tie' : 'crate';
        var ids = {}, n = 0, arr = g.type === 'clear_underlay' ? st.under : tie ? st.over : st.occ;
        for (k = 0; k < N; k++) { var o = arr[k]; if (o && o.kind === want) { ids[o.id] = 1; n++; } }
        G.ids = ids; G.target = g.scope === 'count' ? Math.min(g.count, n) : n;
      }
      st.goals.push(G);
    });
    return st;
  }
  function wouldMatch(occ, R, C, r, c, t) {
    function T(rr, cc) { if (rr < 0 || cc < 0 || rr >= R || cc >= C) return null; var o = occ[rr * C + cc]; return o && o.kind === 'jelly' && !o.sp ? o.type : (o && o.kind === 'jelly' && o.sp !== 'rainbow' ? o.type : null); }
    var n = 1, i; for (i = c - 1; T(r, i) === t; i--) n++; for (i = c + 1; T(r, i) === t; i++) n++; if (n >= 3) return true;
    n = 1; for (i = r - 1; T(i, c) === t; i--) n++; for (i = r + 1; T(i, c) === t; i++) n++; return n >= 3;
  }
  function clone(st) {
    var o = JSON.parse(JSON.stringify(st));
    return o;
  }

  // ------------------------------------------------------------------ matching
  function mtype(st, k) { var o = st.occ[k]; return o && o.kind === 'jelly' && o.type !== 'rainbow' ? o.type : null; }
  function findRuns(st) {
    var R = st.R, C = st.C, runs = [], r, c, run, i;
    for (r = 0; r < R; r++) { run = 1; for (c = 1; c <= C; c++) { var a = c < C ? mtype(st, r * C + c) : null; if (a && a === mtype(st, r * C + c - 1)) run++; else { if (run >= 3) { var cl = []; for (i = c - run; i < c; i++) cl.push(r * C + i); runs.push({ cells: cl, dir: 'h', type: mtype(st, r * C + c - 1) }); } run = 1; } } }
    for (c = 0; c < C; c++) { run = 1; for (r = 1; r <= R; r++) { var b = r < R ? mtype(st, r * C + c) : null; if (b && b === mtype(st, (r - 1) * C + c)) run++; else { if (run >= 3) { var cl2 = []; for (i = r - run; i < r; i++) cl2.push(i * C + c); runs.push({ cells: cl2, dir: 'v', type: mtype(st, (r - 1) * C + c) }); } run = 1; } } }
    return runs;
  }
  // group runs sharing cells → special creation (straight 5 → rainbow, L/T → bomb, straight 4 → stripe ⟂ to the run: the v2 convention, kept)
  function analyze(st, prefer) {
    var runs = findRuns(st), groups = [], C = st.C;
    runs.forEach(function (rn) {
      var hit = groups.filter(function (gr) { return rn.cells.some(function (k) { return gr.set[k]; }); });
      var ng = { set: {}, runs: [rn], type: rn.type };
      rn.cells.forEach(function (k) { ng.set[k] = 1; });
      hit.forEach(function (gr) { ng.runs = gr.runs.concat(ng.runs); for (var k in gr.set) ng.set[k] = 1; groups.splice(groups.indexOf(gr), 1); });
      groups.push(ng);
    });
    groups.forEach(function (gr) {
      gr.cells = Object.keys(gr.set).map(Number).sort(function (a, b) { return a - b; });
      var maxLen = 0, hasH = false, hasV = false, longest = null;
      gr.runs.forEach(function (rn) { if (rn.cells.length > maxLen) { maxLen = rn.cells.length; longest = rn; } if (rn.dir === 'h') hasH = true; else hasV = true; });
      gr.make = maxLen >= 5 ? 'rainbow' : (hasH && hasV) ? 'bomb' : maxLen === 4 ? (longest.dir === 'h' ? 'v' : 'h') : null;
      if (!gr.make) return;
      var free = gr.cells.filter(function (k) { return !st.occ[k].sp; });
      if (!free.length) { gr.make = null; return; }
      var at = null;
      (prefer || []).forEach(function (k) { if (at == null && gr.set[k] && free.indexOf(k) >= 0) at = k; });
      if (at == null && gr.make === 'bomb') gr.runs.forEach(function (a) { gr.runs.forEach(function (b) { if (a.dir !== b.dir) a.cells.forEach(function (k) { if (at == null && b.cells.indexOf(k) >= 0 && free.indexOf(k) >= 0) at = k; }); }); });
      if (at == null) { var mid = longest.cells[Math.floor(longest.cells.length / 2)]; at = free.indexOf(mid) >= 0 ? mid : free[0]; }
      gr.at = at;
    });
    return groups;
  }
  function movable(st, k) { var o = st.occ[k]; return !!(o && o.kind === 'jelly' && !(st.over && st.over[k])); }   // tie hosts + baskets + crates never swap
  function swapForms(st, k1, k2) {
    var a = st.occ[k1], b = st.occ[k2];
    if ((a.sp === 'rainbow') !== (b.sp === 'rainbow') && a.sp && b.sp) {   // rainbow + line/bomb: needs ≥1 ordinary of the other's colour (sources excluded)
      var oth = a.sp === 'rainbow' ? b : a, any = false;
      for (var q = 0; q < st.occ.length && !any; q++) { var oq = st.occ[q]; if (q !== k1 && q !== k2 && oq && oq.kind === 'jelly' && !oq.sp && oq.type === oth.type) any = true; }
      return any ? 'combo' : null;
    }
    if (a.sp && b.sp) return 'combo';
    if (a.sp === 'rainbow' || b.sp === 'rainbow') return 'combo';
    if (a.type === b.type) return null;
    st.occ[k1] = b; st.occ[k2] = a;
    var C = st.C, ok = matchAtK(st, k1) || matchAtK(st, k2);
    st.occ[k1] = a; st.occ[k2] = b;
    return ok ? 'match' : null;
  }
  function matchAtK(st, k) {
    var C = st.C, R = st.R, r = Math.floor(k / C), c = k % C, t = mtype(st, k); if (!t) return false;
    var n = 1, i; for (i = c - 1; i >= 0 && mtype(st, r * C + i) === t; i--) n++; for (i = c + 1; i < C && mtype(st, r * C + i) === t; i++) n++; if (n >= 3) return true;
    n = 1; for (i = r - 1; i >= 0 && mtype(st, i * C + c) === t; i--) n++; for (i = r + 1; i < R && mtype(st, i * C + c) === t; i++) n++; return n >= 3;
  }
  // legal board moves (ordinary swaps that match + special combos), fixed scan order
  function listMoves(st, limit) {
    var out = [], R = st.R, C = st.C;
    for (var r = 0; r < R; r++) for (var c = 0; c < C; c++) {
      var k = r * C + c; if (!movable(st, k)) continue;
      var nb = [[r, c + 1], [r + 1, c]];
      for (var j = 0; j < 2; j++) {
        var r2 = nb[j][0], c2 = nb[j][1]; if (r2 >= R || c2 >= C) continue;
        var k2 = r2 * C + c2; if (!movable(st, k2)) continue;
        if (swapForms(st, k, k2)) { out.push([r, c, r2, c2]); if (limit && out.length >= limit) return out; }
      }
    }
    return out;
  }

  // ------------------------------------------------------------------ one resolution wave (snapshot → closure → single commit)
  function newWave(st, chain, kind) {
    return { st: st, chain: chain, kind: kind, rm: {}, rmOrder: [], matchCells: {}, atk: {}, act: {}, queue: [], fx: [], specials: 0, combo: null,
      creations: [], convert: {}, rainbowType: null, compress: [], crateHits: {}, frostHits: {}, atkN: {} };
  }
  function rmAdd(W, k, delay, by) {
    var o = W.st.occ[k]; if (!o || o.kind !== 'jelly') return;
    var e = W.rm[o.id];
    if (e) { if (delay < e.d) e.d = delay; return; }
    W.rm[o.id] = { id: o.id, k: k, d: delay, by: by, type: o.type, sp: o.sp, tok: o.tok }; W.rmOrder.push(o.id);
    if (o.sp && !W.act[o.id]) W.queue.push(o.id);
  }
  function inBoard(st, r, c) { return r >= 0 && c >= 0 && r < st.R && c < st.C && st.mask[r * st.C + c]; }
  function attack(W, r, c, delay) {   // a direct attack covering one cell (void skipped, crates never stop the line)
    var st = W.st; if (!inBoard(st, r, c)) return;
    var k = r * st.C + c;
    if (W.atk[k] == null || delay < W.atk[k]) W.atk[k] = delay;
    W.atkN[k] = (W.atkN[k] || 0) + 1;
    var o = st.occ[k]; if (!o) return;
    if (o.kind === 'jelly') rmAdd(W, k, delay, 'attack');
  }
  function lineSweep(W, r, c, dir, d, colType) {
    var st = W.st; W.fx.push({ kind: 'beam', dir: dir, r: r, c: c, t: d, type: colType }); W.specials++;
    var n = dir === 'h' ? st.C : st.R;
    for (var i = 0; i < n; i++) attack(W, dir === 'h' ? r : i, dir === 'h' ? i : c, d + 30 + Math.abs(i - (dir === 'h' ? c : r)) * 24);
  }
  function blastAt(W, r, c, rad, d, colType) {
    W.fx.push({ kind: 'blast', r: r, c: c, rad: rad, t: d, type: colType }); W.specials++;
    for (var dr = -rad; dr <= rad; dr++) for (var dc = -rad; dc <= rad; dc++) attack(W, r + dr, c + dc, d + 50 + Math.max(Math.abs(dr), Math.abs(dc)) * 45);
  }
  // most common clearable ordinary type on the frozen wave view; ties → fixed TYPES order (never iteration order)
  function mostCommon(W) {
    var st = W.st, n = {}, best = null;
    for (var k = 0; k < st.occ.length; k++) { var o = st.occ[k]; if (o && o.kind === 'jelly' && !o.sp && !W.convert[o.id]) n[o.type] = (n[o.type] || 0) + 1; }
    TYPES.forEach(function (t) { if (n[t] && (!best || n[t] > n[best])) best = t; });
    return best;
  }
  function zapType(W, r0, c0, type, d, convertTo) {
    var st = W.st, list = [];
    for (var k = 0; k < st.occ.length; k++) { var o = st.occ[k]; if (o && o.kind === 'jelly' && o.type === type && !W.rm[o.id]) list.push(k); }
    var C = st.C;
    list.sort(function (a, b) { var da = Math.abs(Math.floor(a / C) - r0) + Math.abs(a % C - c0), db = Math.abs(Math.floor(b / C) - r0) + Math.abs(b % C - c0); return (da - db) || (st.occ[a].id - st.occ[b].id); });
    W.fx.push({ kind: 'rainbow', r: r0, c: c0, t: d }); W.specials++;
    list.forEach(function (k, i) {
      var t = d + 80 + i * (convertTo ? 45 : 30), r = Math.floor(k / C), c = k % C, o = st.occ[k];
      W.fx.push({ kind: 'zap', fr: r0, fc: c0, tr: r, tc: c, t: t - 50, i: i, type: type });
      if (convertTo && !o.sp) {   // combo conversion product: original ordinary consumed once, product fires once in this wave
        W.convert[o.id] = convertTo;
        W.rm[o.id] = { id: o.id, k: k, d: t + 260, by: 'convert', type: o.type, sp: null, conv: convertTo, tok: o.tok }; W.rmOrder.push(o.id); W.act[o.id] = 1;
        if (W.atk[k] == null || t + 260 < W.atk[k]) W.atk[k] = t + 260;
        activateAs(W, convertTo, r, c, t + 260, o.type);
      } else attack(W, r, c, t + (convertTo ? 260 : 0));
    });
  }
  function activateAs(W, sp, r, c, d, colType) {
    if (sp === 'h' || sp === 'v') lineSweep(W, r, c, sp, d, colType);
    else if (sp === 'bomb') blastAt(W, r, c, 1, d, colType);
    else if (sp === 'rainbow') { var t = W.rainbowType || mostCommon(W); if (t) zapType(W, r, c, t, d, null); else { W.fx.push({ kind: 'rainbow', r: r, c: c, t: d }); W.specials++; } }
  }
  function runQueue(W) {
    var st = W.st, C = st.C;
    while (W.queue.length) {
      W.queue.sort(function (a, b) { return (W.rm[a].d - W.rm[b].d) || (a - b); });
      var id = W.queue.shift(); if (W.act[id]) continue; W.act[id] = 1;
      var e = W.rm[id], r = Math.floor(e.k / C), c = e.k % C;
      if (W.atk[e.k] == null || e.d < W.atk[e.k]) W.atk[e.k] = e.d;   // the source cell itself is a direct hit this wave
      activateAs(W, e.sp, r, c, e.d, e.type);
    }
  }
  function comboWave(W, ka, kb) {   // a = moved piece (now at kb's old cell = swap end)
    var st = W.st, C = st.C, a = st.occ[ka], b = st.occ[kb], r = Math.floor(ka / C), c = ka % C;
    var ra = a.sp === 'rainbow', rb = b.sp === 'rainbow', line = function (p) { return p.sp === 'h' || p.sp === 'v'; };
    W.act[a.id] = W.act[b.id] = 1;   // both sources are consumed by the combo, never fire their own skill again
    rmAdd(W, ka, 0, 'combo'); rmAdd(W, kb, 0, 'combo');
    W.atk[ka] = 0; W.atk[kb] = 0; W.compress = [a.id, b.id];
    if (ra && rb) {
      W.combo = '彩虹风暴!'; W.fx.push({ kind: 'rainbow', r: r, c: c, t: 0, big: true }); W.specials += 2;
      for (var r2 = 0; r2 < st.R; r2++) for (var c2 = 0; c2 < st.C; c2++) attack(W, r2, c2, 80 + (Math.abs(r2 - r) + Math.abs(c2 - c)) * 38);
    } else if (ra || rb) {
      var rain = ra ? a : b, other = ra ? b : a, kr = ra ? ka : kb;
      if (!other.sp) { W.rainbowType = other.type; zapType(W, Math.floor(kr / C), kr % C, other.type, 0, null); }
      else { W.combo = '超级组合!'; zapType(W, Math.floor(kr / C), kr % C, other.type, 0, other.sp === 'bomb' ? 'bomb' : other.sp); }
    } else if (line(a) && line(b)) {
      W.combo = '十字消除!'; lineSweep(W, r, c, 'h', 0, a.type); lineSweep(W, r, c, 'v', 0, b.type);
    } else if ((line(a) && b.sp === 'bomb') || (a.sp === 'bomb' && line(b))) {
      W.combo = '超级十字!';
      for (var q = -1; q <= 1; q++) { lineSweep(W, r + q, c, 'h', Math.abs(q) * 40, a.type); lineSweep(W, r, c + q, 'v', Math.abs(q) * 40, b.type); }
    } else if (a.sp === 'bomb' && b.sp === 'bomb') {
      W.combo = '超级爆炸!'; blastAt(W, r, c, 2, 0, a.type);
    }
  }
  function matchWave(W, prefer) {
    var st = W.st, groups = analyze(st, prefer);
    if (!groups.length) return false;
    var comp = {};
    groups.forEach(function (gr) {
      gr.cells.forEach(function (k) { W.matchCells[k] = 1; comp[st.occ[k].id] = 1; rmAdd(W, k, 0, 'match'); });
      if (gr.make) {
        var ao = st.occ[gr.at];
        W.rm[ao.id].anchor = true;
        W.creations.push({ from: ao.id, tok: ao.tok, k: gr.at, sp: gr.make, type: gr.make === 'rainbow' ? 'rainbow' : gr.type, members: gr.cells.map(function (k) { return st.occ[k].id; }) });
      }
    });
    // a fresh special is not on the board yet, so its own wave cannot trigger it (v2 'keep' rule, now structural)
    W.compress = Object.keys(comp).map(Number).sort(function (a, b) { return a - b; });
    return true;
  }
  // obstacle hits: unified, per wave at most 1 damage per instance; adjacency only from ordinary-match cells
  function collectObstacleHits(W) {
    var st = W.st, C = st.C, k;
    // ties: released when the host itself is in an ordinary match or its own cell is directly attacked (never by an adjacent match).
    // The tie absorbs nothing: the host is consumed / triggered in this same wave.
    W.tieHits = {};
    for (k = 0; k < st.over.length; k++) {
      var tv = st.over[k]; if (!tv) continue;
      var byM = !!W.matchCells[k], byA = W.atk[k] != null;
      if (byM || byA) W.tieHits[tv.id] = { id: tv.id, k: k, d: byM ? 0 : W.atk[k], src: byM ? 'host_matched' : 'direct_attack', dupes: Math.max(0, (byM ? 1 : 0) + (byA ? (W.atkN[k] || 1) : 0) - 1) };
    }
    function crateHit(kk, src, d, n) {
      var o = st.occ[kk]; if (!o || o.kind !== 'crate') return;
      var h = W.crateHits[o.id];
      if (!h) { W.crateHits[o.id] = { id: o.id, k: kk, src: [src], d: d, dmg: 1, dupes: (n || 1) - 1 }; return; }
      if (h.src.indexOf(src) < 0) h.src.push(src); h.dupes += n || 1; if (d < h.d) h.d = d;
    }
    var mk = Object.keys(W.matchCells).map(Number).sort(function (a, b) { return a - b; });
    mk.forEach(function (kk) {
      var r = Math.floor(kk / C), c = kk % C;
      [[r - 1, c], [r + 1, c], [r, c - 1], [r, c + 1]].forEach(function (q) { if (inBoard(st, q[0], q[1])) crateHit(q[0] * C + q[1], 'adjacent_match', 0); });
    });
    var ak = Object.keys(W.atk).map(Number).sort(function (a, b) { return a - b; });
    ak.forEach(function (kk) { crateHit(kk, 'direct_attack', W.atk[kk], W.atkN[kk] || 1); });
    var cells = {}; mk.forEach(function (kk) { cells[kk] = 0; }); ak.forEach(function (kk) { if (cells[kk] == null || W.atk[kk] < cells[kk]) cells[kk] = W.atk[kk]; });
    Object.keys(cells).map(Number).sort(function (a, b) { return a - b; }).forEach(function (kk) {
      var u = st.under[kk]; if (!u) return;
      W.frostHits[u.id] = { id: u.id, k: kk, d: cells[kk], src: W.matchCells[kk] ? 'match_on_cell' : 'direct_attack', dmg: 1, dupes: (W.matchCells[kk] ? 1 : 0) + (W.atkN[kk] || 0) - 1 };
    });
  }
  function commitWave(W) {
    var st = W.st, C = st.C, ev = { t: 'wave', wave: ++st.waveSeq, chain: W.chain, kind: W.kind, compress: W.compress, removed: [], creations: [], crates: [], frost: [], ties: [],
      goals: [], fx: W.fx, specials: W.specials, combo: W.combo, collected: [] };
    var gEv = {};
    function goalAdd(kind, typeId, id, n) {
      st.goals.forEach(function (g, i) {
        if (g.type !== kind) return;
        if ((kind === 'collect_piece' || kind === 'clear_obstacle') && g.typeId !== typeId) return;
        if (g.ids && !g.ids[id]) return;
        g.progress += n; gEv[i] = 1;
      });
    }
    var ids = W.rmOrder.slice().sort(function (a, b) { return a - b; }), maxD = 0;
    Object.keys(W.tieHits || {}).map(Number).sort(function (a, b) { return a - b; }).forEach(function (id) {   // ties first: the anchor cell is untied before creation
      var h = W.tieHits[id], tv = st.over[h.k]; if (!tv || tv.id !== id) return;
      st.over[h.k] = null; goalAdd('clear_obstacle', 'gummy_tie', id, 1);
      ev.ties.push({ id: id, r: Math.floor(h.k / C), c: h.k % C, d: h.d, src: h.src, dedup: h.dupes });
    });
    ids.forEach(function (id) {
      var e = W.rm[id], o = st.occ[e.k]; if (!o || o.id !== id) return;
      st.occ[e.k] = null;
      var base = !e.sp;   // ordinary jelly (incl. special anchors and conversion originals) → one basePieceConsumed
      if (base) { goalAdd('collect_piece', e.type, id, 1); ev.collected.push(id); }
      ev.removed.push({ id: id, r: Math.floor(e.k / C), c: e.k % C, d: e.d, by: e.by, type: e.type, sp: e.sp, anchor: !!e.anchor, conv: e.conv || null });
      if (e.d > maxD) maxD = e.d;
    });
    var made = {}, natural = [];
    W.creations.forEach(function (cr) {
      if (st.occ[cr.k]) return;
      var o = { id: st.nextId++, kind: 'jelly', type: cr.type, sp: cr.sp, hp: 0, tok: cr.tok };   // upgrade = transform: the anchor's score identity carries over
      made[cr.from] = 1; natural.push({ sp: cr.sp, id: o.id });
      st.occ[cr.k] = o;
      ev.creations.push({ from: cr.from, id: o.id, sp: cr.sp, type: cr.type, r: Math.floor(cr.k / C), c: cr.k % C, members: cr.members });
    });
    Object.keys(W.crateHits).map(Number).sort(function (a, b) { return a - b; }).forEach(function (id) {
      var h = W.crateHits[id], o = st.occ[h.k]; if (!o || o.id !== id) return;
      var hp0 = o.hp; o.hp = Math.max(0, o.hp - h.dmg);
      if (o.hp <= 0) { st.occ[h.k] = null; goalAdd('clear_obstacle', 'cookie_crate', id, 1); }
      ev.crates.push({ id: id, r: Math.floor(h.k / C), c: h.k % C, hp0: hp0, hp1: o.hp, d: h.d, src: h.src, dedup: h.dupes });
      if (h.d > maxD) maxD = h.d;
    });
    Object.keys(W.frostHits).map(Number).sort(function (a, b) { return a - b; }).forEach(function (id) {
      var h = W.frostHits[id], u = st.under[h.k]; if (!u || u.id !== id) return;
      var l0 = u.layers; u.layers = Math.max(0, u.layers - 1);
      if (u.layers <= 0) { st.under[h.k] = null; goalAdd('clear_underlay', 'frosting_pad', id, 1); }
      ev.frost.push({ id: id, r: Math.floor(h.k / C), c: h.k % C, l0: l0, l1: u.layers, d: h.d, src: h.src, dedup: h.dupes });
    });
    for (var kx = 0; kx < st.over.length; kx++) if (st.over[kx] && !st.occ[kx]) st.over[kx] = null;   // safety net: never a tie without a host
    // C0 scoring: only the committed changes of this wave (true removals, real HP / layer deltas, released ties, natural creations)
    var toks = [], frostN = 0, hpN = 0, killN = 0;
    ids.forEach(function (id) { var e = W.rm[id]; if (e.anchor && made[id]) return; if (ev.removed.some(function (x) { return x.id === id; })) toks.push(e.tok); });
    ev.crates.forEach(function (h) { hpN += h.hp0 - h.hp1; if (h.hp1 <= 0 && h.hp0 > 0) killN++; });
    ev.frost.forEach(function (h) { frostN += h.l0 - h.l1; });
    var sc = Score.scoreWave(st.scoring, { waveId: ev.wave, wave: W.chain, removedTokens: toks, frostLayers: frostN, crateHp: hpN, crateDestroyed: killN, ties: ev.ties.length,
      creations: natural, comboKey: W.chain === 1 ? W.comboKey || null : null });
    st.score = st.scoring.total; ev.points = sc.total; ev.score = st.score; ev.maxD = maxD; ev.sc = sc;
    Object.keys(gEv).forEach(function (i) { var g = st.goals[i]; ev.goals.push({ i: +i, progress: g.progress, target: g.target }); });
    st.revision++;
    return ev;
  }

  // ------------------------------------------------------------------ gravity + refill (straight down; void and crates block; spawners only at static segment tops)
  function fall(st) {
    var C = st.C, ev = { t: 'fall', moves: [], spawns: [] };
    st.segs.forEach(function (sg) {
      var c = sg.c, r = sg.r1;
      // sub-regions between fixed crates, bottom → top
      var regions = [], b = sg.r1;
      for (r = sg.r1; r >= sg.r0 - 1; r--) {
        var isCrate = r >= sg.r0 && ((st.occ[r * C + c] && st.occ[r * C + c].kind === 'crate') || !!st.over[r * C + c]);   // crates + tie hosts are fixed
        if (r < sg.r0 || isCrate) { if (b >= r + 1) regions.push({ a: r + 1, b: b }); b = r - 1; }
      }
      regions.forEach(function (rg) {
        var write = rg.b;
        for (var rr = rg.b; rr >= rg.a; rr--) {
          var k = rr * C + c, o = st.occ[k]; if (!o) continue;
          if (rr !== write) { st.occ[write * C + c] = o; st.occ[k] = null; ev.moves.push({ id: o.id, c: c, r0: rr, r1: write }); }
          write--;
        }
        if (rg.a === sg.r0 && st.spawn[sg.r0 * C + c] && write >= rg.a) {
          var cnt = write - rg.a + 1, i = 0;
          for (var r2 = write; r2 >= rg.a; r2--) {
            var o2 = { id: st.nextId++, kind: 'jelly', type: weighted(st.rng.refill, st.pool), sp: null, hp: 0 }; o2.tok = o2.id;   // new refill = new score identity
            st.occ[r2 * C + c] = o2; ev.spawns.push({ id: o2.id, type: o2.type, r: r2, c: c, seg0: sg.r0, n: cnt, i: i++ });
          }
        }
      });
    });
    if (ev.moves.length || ev.spawns.length) st.revision++;
    return ev;
  }
  // delivery: every basket standing on an exit cell after gravity is delivered (unique event per instance, fixed cell order)
  function deliver(st) {
    var C = st.C, ev = { t: 'deliver', items: [], goals: [] }, gEv = {};
    Object.keys(st.exits).map(Number).sort(function (a, b) { return a - b; }).forEach(function (k) {
      var o = st.occ[k]; if (!o || o.kind !== 'basket') return;
      st.occ[k] = null; st.delivered++;
      st.goals.forEach(function (g, i) { if (g.type === 'deliver' && (!g.ids || g.ids[o.id])) { g.progress++; gEv[i] = 1; } });
      ev.items.push({ id: o.id, r: Math.floor(k / C), c: k % C });
    });
    if (!ev.items.length) return null;
    ev.sc = Score.scoreDelivery(st.scoring, ev.items.map(function (it) { return it.id; })); st.score = st.scoring.total;   // fixed per deliveryCommitted, no multiplier
    Object.keys(gEv).forEach(function (i) { var g = st.goals[i]; ev.goals.push({ i: +i, progress: g.progress, target: g.target }); });
    ev.score = st.score; st.revision++;
    return ev;
  }
  // gravity → delivery → gravity … until stable (bounded), before the next match scan
  function settle(st, events) {
    events.push(fall(st));
    for (var g = 0; g < 64; g++) { var dv = deliver(st); if (!dv) return; events.push(dv); events.push(fall(st)); }
  }

  // ------------------------------------------------------------------ shuffle (ordinary jellies only; specials, crates, frosting, goals untouched)
  function shuffleCandidate(st, r) {
    var C = st.C, R = st.R, cells = [], ids = [], k, i;
    for (k = 0; k < st.occ.length; k++) { var o = st.occ[k]; if (o && o.kind === 'jelly' && !o.sp && !(st.over && st.over[k])) { cells.push(k); ids.push(o.id); } }   // tie hosts stay
    if (cells.length < 3) return null;
    var byId = {}; cells.forEach(function (kk) { byId[st.occ[kk].id] = st.occ[kk]; });
    for (var at = 0; at < MAX_SHUFFLE_ATTEMPTS; at++) {
      var pool = ids.slice();
      for (i = pool.length - 1; i > 0; i--) { var j = rint(r, i + 1); var tt = pool[i]; pool[i] = pool[j]; pool[j] = tt; }
      var occ = st.occ.slice(), okk = true;
      cells.forEach(function (kk) { occ[kk] = null; });
      for (i = 0; i < cells.length && okk; i++) {
        var kk = cells[i], rr = Math.floor(kk / C), cc = kk % C, pick = -1;
        for (var q = 0; q < pool.length; q++) { if (!wouldMatch(occ, R, C, rr, cc, byId[pool[q]].type)) { pick = q; break; } }
        if (pick < 0) { okk = false; break; }
        occ[kk] = byId[pool.splice(pick, 1)[0]];
      }
      if (!okk) continue;
      var view = { R: R, C: C, occ: occ, mask: st.mask, over: st.over };
      if (findRuns(view).length || !listMoves(view, 1).length) continue;
      var map = cells.map(function (kk) { return { id: occ[kk].id, r: Math.floor(kk / C), c: kk % C }; });
      return { occ: occ, map: map, attempts: at + 1, hash: hashStr(JSON.stringify(map)) };
    }
    return { fail: true, attempts: MAX_SHUFFLE_ATTEMPTS };
  }
  function previewShuffle(st) {   // tool preview: same algorithm on a copy of the shuffle stream, so confirm reproduces it exactly
    var r = { s: st.rng.shuffle.s }, cand = shuffleCandidate(st, r);
    if (!cand || cand.fail) return null;
    var C = st.C, types = [], specs = [];
    for (var rr = 0; rr < st.R; rr++) { types.push([]); specs.push([]); for (var cc = 0; cc < C; cc++) { var o = cand.occ[rr * C + cc]; types[rr].push(o ? (o.kind === 'crate' || o.kind === 'basket' ? o.type : o.type) : (st.mask[rr * C + cc] ? null : 'void')); specs[rr].push(o && o.sp || null); } }
    return { hash: cand.hash, map: cand.map, types: types, specs: specs, rev: st.revision };
  }

  // ------------------------------------------------------------------ turn driver
  function goalsDone(st) { return st.goals.length > 0 && st.goals.every(function (g) { return g.progress >= g.target; }); }
  function resolve(st, events, first) {
    var chain = 1, W, prefer = first.prefer || null;
    while (true) {
      W = newWave(st, chain, chain === 1 ? first.kind : 'cascade');
      var any;
      if (chain === 1 && first.kind === 'combo') { comboWave(W, first.ka, first.kb); W.comboKey = first.comboKey || null; any = true; }
      else if (chain === 1 && first.kind === 'hammer') {
        var o = st.occ[first.k]; W.atk[first.k] = 0;
        if (o && o.kind === 'jelly') { rmAdd(W, first.k, 0, 'attack'); W.compress = []; }
        any = true;
      } else any = matchWave(W, chain === 1 ? prefer : null);
      if (!any) break;
      runQueue(W); collectObstacleHits(W);
      events.push(commitWave(W));
      settle(st, events);
      chain++;
      if (chain > MAX_WAVES) { events.push({ t: 'guard', reason: 'max_waves' }); st.diag = { reason: 'max_waves', seed: st.seed }; break; }
    }
  }
  function endTurn(st, events, act) {
    var fin = null;
    if (goalsDone(st)) {                         // last move: cascades + deliveries are already complete here → win first
      st.phase = 'won'; fin = Score.finalize(st.scoring, { won: true, movesLeft: st.moves });   // decided once: actions + 2000 + moves × 500
      st.bonus = fin.winBonus + fin.movesBonus; st.score = st.scoring.total;
      st.starsEarned = Math.max(1, st.stars.filter(function (t) { return st.score >= t; }).length);
    }
    else if (st.moves <= 0) { st.phase = 'lost'; fin = Score.finalize(st.scoring, { won: false, movesLeft: 0 }); st.score = st.scoring.total; }   // then out-of-moves (no end bonus)
    else if (!listMoves(st, 1).length) {
      var cand = shuffleCandidate(st, st.rng.shuffle);
      if (cand && !cand.fail) { applyMap(st, cand); events.push({ t: 'shuffle', auto: true, map: cand.map, attempts: cand.attempts }); }
      else { st.phase = 'stuck'; st.diag = { reason: 'auto_shuffle_failed', seed: st.seed, attempts: cand ? cand.attempts : 0 }; }
    }
    events.push({ t: 'end', phase: st.phase, moves: st.moves, score: st.score, goals: st.goals.map(function (g) { return { progress: g.progress, target: g.target }; }),
      sc: { action: act || null, final: fin, streak: st.scoring.streak } });
  }
  function applyMap(st, cand) { st.occ = cand.occ; st.revision++; }
  function cellK(st, r, c) { return (r >= 0 && c >= 0 && r < st.R && c < st.C && st.mask[r * st.C + c]) ? r * st.C + c : -1; }
  function reject(reason) { return { ok: false, reason: reason, events: [] }; }

  // apply one player action. Invalid → {ok:false} and the state is untouched (no move / tool cost).
  function apply(st, a) {
    if (st.phase !== 'ready') return reject('not_ready');
    var events = [], k1, k2, C = st.C;
    if (a.type === 'swap') {
      k1 = cellK(st, a.r1, a.c1); k2 = cellK(st, a.r2, a.c2);
      if (k1 < 0 || k2 < 0) return reject('off_board');
      if (Math.abs(a.r1 - a.r2) + Math.abs(a.c1 - a.c2) !== 1) return reject('not_adjacent');
      if (!movable(st, k1) || !movable(st, k2)) return reject('not_movable');
      if (st.moves <= 0) return reject('no_moves');
      var form = swapForms(st, k1, k2);
      if (!form) return reject(st.occ[k1].sp && st.occ[k2].sp ? 'no_target' : 'no_match');
      st.moves--; st.turn++;
      var p1 = st.occ[k1], p2 = st.occ[k2]; st.occ[k1] = p2; st.occ[k2] = p1; st.revision++;
      events.push({ t: 'swap', a: p1.id, b: p2.id, r1: a.r1, c1: a.c1, r2: a.r2, c2: a.c2 });
      Score.beginAction(st.scoring, { actionId: st.turn, kind: 'swap', comboKey: form === 'combo' ? Score.comboKey(p1.sp, p2.sp) : null });
      if (form === 'combo') resolve(st, events, { kind: 'combo', ka: k2, kb: k1, comboKey: Score.comboKey(p1.sp, p2.sp) });
      else resolve(st, events, { kind: 'swap', prefer: [k2, k1] });
    } else if (a.type === 'hammer') {
      k1 = cellK(st, a.r, a.c);
      if (k1 < 0) return reject('off_board');
      if (st.tools.hammer <= 0) return reject('no_tool');
      if (!st.occ[k1] && !st.under[k1]) return reject('nothing_to_hit');
      if (st.occ[k1] && st.occ[k1].kind === 'basket' && !st.under[k1]) return reject('immune');   // only an immune basket, nothing else to hit
      st.tools.hammer--; st.turn++;
      events.push({ t: 'hammer', r: a.r, c: a.c, target: st.occ[k1] ? st.occ[k1].id : null });
      Score.beginAction(st.scoring, { actionId: st.turn, kind: 'hammer' });   // assisted: scored from wave 1 of its own, resets the skill chain
      resolve(st, events, { kind: 'hammer', k: k1 });
    } else if (a.type === 'toolSwap') {
      k1 = cellK(st, a.r1, a.c1); k2 = cellK(st, a.r2, a.c2);
      if (k1 < 0 || k2 < 0 || k1 === k2) return reject('off_board');
      if (!movable(st, k1) || !movable(st, k2)) return reject('not_movable');
      if (st.tools.swap <= 0) return reject('no_tool');
      var q1 = st.occ[k1], q2 = st.occ[k2];
      if (q1.type === q2.type && q1.sp === q2.sp) return reject('same_piece');
      st.tools.swap--; st.turn++;
      st.occ[k1] = q2; st.occ[k2] = q1; st.revision++;
      events.push({ t: 'toolSwap', a: q1.id, b: q2.id, r1: a.r1, c1: a.c1, r2: a.r2, c2: a.c2 });
      Score.beginAction(st.scoring, { actionId: st.turn, kind: 'toolSwap' });
      resolve(st, events, { kind: 'swap', prefer: [k2, k1] });
    } else if (a.type === 'shuffle') {
      if (st.tools.shuffle <= 0) return reject('no_tool');
      var r = { s: st.rng.shuffle.s }, cand = shuffleCandidate(st, r);
      if (!cand || cand.fail) return reject('no_candidate');
      if (a.expect != null && a.expect !== cand.hash) return reject('stale_preview');
      st.rng.shuffle.s = r.s; st.tools.shuffle--; st.turn++;
      applyMap(st, cand); events.push({ t: 'shuffle', auto: false, map: cand.map, attempts: cand.attempts });
      Score.beginAction(st.scoring, { actionId: st.turn, kind: 'shuffle' });
      resolve(st, events, { kind: 'swap', prefer: null });
    } else return reject('unknown_action');
    var act = Score.endAction(st.scoring);   // skill streak settles on the accepted action (never on time)
    st.score = st.scoring.total;
    endTurn(st, events, act);
    st.log.push(JSON.parse(JSON.stringify(a)));
    return { ok: true, events: events };
  }

  // ------------------------------------------------------------------ views / hashing / replay
  function view(st) {   // compact logical snapshot (for tests, renderer sync checks and hashes)
    var C = st.C, rows = [];
    for (var r = 0; r < st.R; r++) {
      var row = [];
      for (var c = 0; c < C; c++) {
        var k = r * C + c, o = st.occ[k], u = st.under[k];
        if (!st.mask[k]) { row.push('#'); continue; }
        var s = o ? (o.kind === 'crate' ? 'X' + o.hp : o.kind === 'basket' ? 'BSK' : o.type.replace('jelly_', '').slice(0, 3) + (o.sp ? ':' + o.sp : '')) + '@' + o.id : '.';
        if (u) s += '~' + u.layers;
        if (st.over[k]) s += '^' + st.over[k].id;
        if (st.exits[k]) s += '!';
        row.push(s);
      }
      rows.push(row.join(' '));
    }
    return rows;
  }
  function stateHash(st) {
    return hashStr(JSON.stringify({ v: view(st), m: st.moves, t: st.tools, g: st.goals.map(function (g) { return [g.progress, g.target]; }), s: st.score, k: st.scoring ? st.scoring.streak : 0, p: st.phase,
      r: [st.rng.fill.s, st.rng.refill.s, st.rng.shuffle.s], n: st.nextId })).toString(16);
  }
  function eventsHash(evs) { return hashStr(JSON.stringify(evs)).toString(16); }
  function replay(def, seed, actions) {
    var st = createGame(def, { seed: seed }), all = [];
    actions.forEach(function (a) { var res = apply(st, a); all.push({ ok: res.ok, reason: res.reason || null, events: res.events }); });
    return { state: st, results: all, hash: stateHash(st), eventsHash: eventsHash(all) };
  }
  function goalLeft(st, i) { var g = st.goals[i]; return g ? Math.max(0, g.target - g.progress) : 0; }

  // ------------------------------------------------------------------ debug / QA hooks (never used by normal play)
  function debugSetJellies(st, grid) {   // grid[r][c] = {type, sp} | null; crates / frosting stay
    for (var r = 0; r < st.R; r++) for (var c = 0; c < st.C; c++) {
      var k = r * st.C + c; if (!st.mask[k] || (st.occ[k] && st.occ[k].kind !== 'jelly') || st.over[k]) continue;   // crates, baskets, tie hosts stay
      var g = grid[r][c]; st.occ[k] = g ? { id: st.nextId++, kind: 'jelly', type: g.type, sp: g.sp || null, hp: 0 } : null; if (st.occ[k]) st.occ[k].tok = st.occ[k].id;
    }
    st.revision++; st.debugTainted = true;   // test hook only: the board no longer follows from (seed, log)
    return true;
  }

  var API = {
    RULESET: RULESET, SCHEMA: SCHEMA, RNG_ALGO: RNG_ALGO, CORE_VERSION: CORE_VERSION, TYPES: TYPES, REGISTRY: REGISTRY,
    LIMITS: { MAX_INIT_ATTEMPTS: MAX_INIT_ATTEMPTS, MAX_SHUFFLE_ATTEMPTS: MAX_SHUFFLE_ATTEMPTS, MAX_WAVES: MAX_WAVES },
    createGame: createGame, apply: apply, clone: clone, listMoves: listMoves, previewShuffle: previewShuffle, findRuns: findRuns,
    segmentsOf: segmentsOf, maskOf: maskOf, view: view, stateHash: stateHash, eventsHash: eventsHash, replay: replay, hashStr: hashStr,
    goalLeft: goalLeft, goalsDone: goalsDone, movable: movable, debugSetJellies: debugSetJellies, wouldMatch: wouldMatch, stream: stream, rnext: rnext,
    Score: Score, SCORE_VERSION: Score.SCORE_VERSION
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = API; else root.JellyCore = API;
})(typeof window !== 'undefined' ? window : this);
