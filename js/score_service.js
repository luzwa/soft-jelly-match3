/* 果冻三消 · ScoreService (stage C0) — versioned, pure, deterministic.
 * Consumes ONLY results the rules core has already committed (wave commits, delivery commits, action end, game end).
 * Never reads animations, object destruction, goal-bar updates or the board. One ledger per game, stored in the core state,
 * so replays / tiers / presentation speed / skipping the result screen can never change or repeat a grant.
 * Spec: specs/Jelly_Match3_Scoring_LightCompetitive_Addendum_V2.md §4–11 (one multiplier on wave base score, everything else fixed).
 * UMD: window.JellyScore in the browser, module.exports in Node.
 */
(function (root) {
  'use strict';
  var CONFIG = {
    scoreVersion: 'jelly_score_v1',
    status: 'design_defaults_unvalidated',
    base: { pieceRemoved: 100, frostLayerRemoved: 100, crateHpRemoved: 150, crateDestroyed: 150, tieRemoved: 200 },
    cascadePercent: [100, 150, 200, 250, 300],
    naturalCreation: { line: 300, area: 500, rainbow: 800 },
    activeCombo: { line_line: 1000, line_area: 1600, area_area: 2200, rainbow_line: 3200, rainbow_area: 4000, rainbow_rainbow: 5000 },
    skillStreakBonus: [0, 300, 700, 1200, 1800],
    deliveryFixed: 1000,
    winFixed: 2000,
    remainingMoveFixed: 500,
    rounding: 'floor_each_wave_after_aggregate',
    scoringTokenPolicy: 'carry_through_transform_score_once_on_removal'
  };
  function freeze(o) { if (o && typeof o === 'object') { Object.keys(o).forEach(function (k) { freeze(o[k]); }); if (Object.freeze) Object.freeze(o); } return o; }
  freeze(CONFIG);
  var SP_CLASS = { h: 'line', v: 'line', bomb: 'area', rainbow: 'rainbow' };
  function spClass(sp) { return SP_CLASS[sp] || null; }
  // active special + special combo key (null for rainbow + ordinary, which is not an active combo)
  function comboKey(spA, spB) {
    var a = spClass(spA), b = spClass(spB); if (!a || !b) return null;
    var order = { line: 0, area: 1, rainbow: 2 }; if (order[a] > order[b]) { var t = a; a = b; b = t; }
    if (b === 'rainbow') return a === 'rainbow' ? 'rainbow_rainbow' : 'rainbow_' + a;
    return a + '_' + b;
  }
  function cascadePercent(cfg, wave) { var p = cfg.cascadePercent; return p[Math.min(Math.max(1, wave), p.length) - 1]; }
  function streakBonus(cfg, n) { var t = cfg.skillStreakBonus; return n <= 0 ? 0 : t[Math.min(n, t.length) - 1]; }

  function newLedger(cfg, meta) {
    cfg = cfg || CONFIG; meta = meta || {};
    return { scoreVersion: cfg.scoreVersion, cfgStatus: cfg.status, runId: meta.runId || null, total: 0, actionTotal: 0, entries: [], eventSeq: 0, scoredTok: {},
      streak: 0, maxStreak: 0, maxCascade: 0, natural: 0, activeCombos: 0, delivered: 0, assist: { hammer: 0, swap: 0, shuffle: 0 }, actions: 0, cur: null, final: null };
  }
  function entry(L, kind, o) {
    var e = { eventId: ++L.eventSeq, actionId: L.cur ? L.cur.actionId : null, waveId: o.waveId != null ? o.waveId : null, kind: kind, qty: o.qty || 0, unit: o.unit || 0,
      base: o.base || 0, pct: o.pct || 100, points: o.points || 0, reason: o.reason || '', ids: o.ids || null };
    L.entries.push(e); return e;
  }
  // kind: 'swap' (player swap, consumes a move) | 'hammer' | 'toolSwap' | 'shuffle' (inventory tools, assisted)
  function beginAction(L, a) {
    L.cur = { actionId: a.actionId, kind: a.kind, comboKey: a.comboKey || null, waves: 0, sum: 0, firstWaveCreations: 0, natural: 0, combo: 0, delivered: 0, maxWave: 0 };
    if (a.kind !== 'swap') L.assist[a.kind === 'toolSwap' ? 'swap' : a.kind] = (L.assist[a.kind === 'toolSwap' ? 'swap' : a.kind] || 0) + 1;
    return L.cur;
  }
  /* one committed wave. f = { waveId, wave (1-based cascade index inside this action),
   *   removedTokens: [scoreTokenId] of pieces truly removed (transform anchors excluded by the caller),
   *   frostLayers: total layers actually removed, crateHp: total HP actually removed, crateDestroyed: crates reaching 0,
   *   ties: ties actually released, creations: [{sp}] natural creations committed in this wave, comboKey (first wave only) } */
  function scoreWave(L, f, cfg) {
    cfg = cfg || CONFIG; var B = cfg.base, cur = L.cur;
    var toks = [], dup = 0;
    (f.removedTokens || []).forEach(function (t) { if (L.scoredTok[t]) { dup++; return; } L.scoredTok[t] = 1; toks.push(t); });
    var parts = { pieces: toks.length * B.pieceRemoved, frost: (f.frostLayers || 0) * B.frostLayerRemoved, crateHp: (f.crateHp || 0) * B.crateHpRemoved,
      crateKill: (f.crateDestroyed || 0) * B.crateDestroyed, ties: (f.ties || 0) * B.tieRemoved };
    var base = parts.pieces + parts.frost + parts.crateHp + parts.crateKill + parts.ties, pct = cascadePercent(cfg, f.wave);
    var pts = Math.floor(base * pct / 100);   // aggregate first, then one integer-percent floor per wave
    var r = { waveId: f.waveId, wave: f.wave, base: base, pct: pct, points: pts, parts: parts, dupTokens: dup, creation: 0, creations: [], combo: 0, comboKey: null, total: 0 };
    if (base) entry(L, 'wave_base', { waveId: f.waveId, base: base, pct: pct, points: pts, qty: toks.length, unit: B.pieceRemoved, ids: toks,
      reason: 'pieces ' + toks.length + ' · frost ' + (f.frostLayers || 0) + ' · crateHp ' + (f.crateHp || 0) + ' · crateKill ' + (f.crateDestroyed || 0) + ' · ties ' + (f.ties || 0) });
    (f.creations || []).forEach(function (c) {
      var cl = spClass(c.sp), v = cfg.naturalCreation[cl] || 0; if (!v) return;
      r.creation += v; r.creations.push({ cls: cl, points: v }); L.natural++; if (cur) cur.natural++;
      entry(L, 'natural_special', { waveId: f.waveId, base: v, points: v, qty: 1, unit: v, reason: 'natural ' + cl, ids: c.id != null ? [c.id] : null });
    });
    if (f.comboKey && cfg.activeCombo[f.comboKey]) {
      r.combo = cfg.activeCombo[f.comboKey]; r.comboKey = f.comboKey; L.activeCombos++; if (cur) cur.combo++;
      entry(L, 'active_combo', { waveId: f.waveId, base: r.combo, points: r.combo, qty: 1, unit: r.combo, reason: f.comboKey });
    }
    r.total = pts + r.creation + r.combo;
    if (cur) { cur.sum += r.total; cur.waves = Math.max(cur.waves, f.wave); if (f.wave === 1) cur.firstWaveCreations += (f.creations || []).length; }
    L.total += r.total; L.actionTotal += r.total; L.maxCascade = Math.max(L.maxCascade, f.wave);
    return r;
  }
  function scoreDelivery(L, ids, cfg) {
    cfg = cfg || CONFIG; var n = ids.length, pts = n * cfg.deliveryFixed;
    if (!n) return { points: 0, n: 0 };
    entry(L, 'delivery', { base: pts, points: pts, qty: n, unit: cfg.deliveryFixed, ids: ids.slice(), reason: 'deliveryCommitted ×' + n });
    L.total += pts; L.actionTotal += pts; L.delivered += n; if (L.cur) { L.cur.sum += pts; L.cur.delivered += n; }
    return { points: pts, n: n };
  }
  // end of one accepted action: skill streak (no timer; only valid accepted actions reach here)
  function endAction(L, cfg) {
    cfg = cfg || CONFIG; var cur = L.cur; if (!cur) return null;
    var sk = { before: L.streak, n: 0, bonus: 0, qualified: false, broke: false };
    if (cur.kind === 'swap') {
      var q = !!cur.comboKey || cur.firstWaveCreations > 0;   // active special+special combo, or the player's first wave created ≥1 special
      sk.qualified = q;
      if (q) { L.streak++; sk.bonus = streakBonus(cfg, L.streak); L.maxStreak = Math.max(L.maxStreak, L.streak); }
      else { sk.broke = L.streak > 0; L.streak = 0; }
    } else { sk.broke = L.streak > 0; L.streak = 0; }   // a successful inventory tool resets the chain (assisted)
    sk.n = L.streak;
    if (sk.bonus) { entry(L, 'skill_streak', { base: sk.bonus, points: sk.bonus, qty: 1, unit: sk.bonus, reason: 'skill ' + L.streak }); L.total += sk.bonus; L.actionTotal += sk.bonus; cur.sum += sk.bonus; }
    var res = { actionId: cur.actionId, kind: cur.kind, actionScore: cur.sum, waves: cur.waves, natural: cur.natural, combo: cur.combo, delivered: cur.delivered, comboKey: cur.comboKey, skill: sk };
    L.actions++; L.cur = null;
    return res;
  }
  // game end: decided exactly once (idempotent — a second call returns the same object and grants nothing)
  function finalize(L, o, cfg) {
    cfg = cfg || CONFIG; if (L.final) return L.final;
    var won = !!o.won, mv = Math.max(0, o.movesLeft | 0);
    var winB = won ? cfg.winFixed : 0, mvB = won ? mv * cfg.remainingMoveFixed : 0;
    if (winB) entry(L, 'win_bonus', { base: winB, points: winB, qty: 1, unit: winB, reason: 'clear' });
    if (mvB) entry(L, 'moves_bonus', { base: mvB, points: mvB, qty: mv, unit: cfg.remainingMoveFixed, reason: 'remaining moves ×' + mv });
    L.total += winB + mvB;
    L.final = { won: won, actionTotal: L.actionTotal, winBonus: winB, movesLeft: mv, movesBonus: mvB, finalScore: L.total, scoreVersion: L.scoreVersion,
      maxCascade: L.maxCascade, maxStreak: L.maxStreak, naturalSpecialCount: L.natural, activeComboCount: L.activeCombos, delivered: L.delivered,
      assist: { hammer: L.assist.hammer, swap: L.assist.swap, shuffle: L.assist.shuffle }, assisted: !!(L.assist.hammer || L.assist.swap || L.assist.shuffle) };
    return L.final;
  }
  // breakdown of the ledger by kind (result panel details)
  function breakdown(L) {
    var b = { wave_base: 0, natural_special: 0, active_combo: 0, skill_streak: 0, delivery: 0, win_bonus: 0, moves_bonus: 0 };
    L.entries.forEach(function (e) { b[e.kind] = (b[e.kind] || 0) + e.points; });
    return b;
  }
  function ledgerHash(L, hashStr) { return hashStr(JSON.stringify(L.entries.map(function (e) { return [e.eventId, e.actionId, e.waveId, e.kind, e.qty, e.base, e.pct, e.points]; }))).toString(16); }

  var API = { CONFIG: CONFIG, SCORE_VERSION: CONFIG.scoreVersion, comboKey: comboKey, spClass: spClass, cascadePercent: cascadePercent, streakBonus: streakBonus,
    newLedger: newLedger, beginAction: beginAction, scoreWave: scoreWave, scoreDelivery: scoreDelivery, endAction: endAction, finalize: finalize, breakdown: breakdown, ledgerHash: ledgerHash };
  if (typeof module !== 'undefined' && module.exports) module.exports = API; else root.JellyScore = API;
})(typeof window !== 'undefined' ? window : this);
