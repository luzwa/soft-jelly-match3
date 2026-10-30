// Stage C0 scoring tests — run: node tests/stageC0_score.test.js  (no deps; exits 1 on any failure)
// Spec: specs/Jelly_Match3_Scoring_LightCompetitive_Addendum_V2.md §4–11 (worked examples §10 A–G), §17 acceptance 1–10.
'use strict';
const fs = require('fs'), path = require('path'), assert = require('assert');
const ROOT = path.join(__dirname, '..');
const Core = require(path.join(ROOT, 'js/rules_core.js')), LS = require(path.join(ROOT, 'js/level_schema.js')), S = require(path.join(ROOT, 'js/score_service.js'));
const SRC = path.join(ROOT, 'levels/src');
const LV = {}; fs.readdirSync(SRC).filter(f => f.endsWith('.json')).forEach(f => { const r = LS.parse(fs.readFileSync(path.join(SRC, f), 'utf8')); LV[r.def.levelId] = r.def; });
let pass = 0, fail = 0; const results = [];
function test(name, fn) {
  try { const info = fn(); pass++; results.push({ name, ok: true, info: info || '' }); console.log('PASS', name, info ? '— ' + info : ''); }
  catch (e) { fail++; results.push({ name, ok: false, info: e.message }); console.log('FAIL', name, '—', e.message, (e.stack || '').split('\n')[1]); }
}
const CODE = { s: 'jelly_squid', f: 'jelly_fugu', j: 'jelly_jellyfish', o: 'jelly_octopus', b: 'jelly_bear', g: 'jelly_fig' };
const SPC = { '-': 'h', '|': 'v', '*': 'bomb' };
function fixture(rows, o = {}) {   // same token grammar as stageB_core.test.js
  const mask = [], place = [], exits = [];
  rows.forEach((row, r) => {
    let m = '';
    row.trim().split(/\s+/).forEach((t0, c) => {
      let t = t0;
      if (t === '#') { m += '0'; return; } m += '1';
      if (t.endsWith('!')) { exits.push({ row: r, col: c }); t = t.slice(0, -1); }
      if (t.endsWith('^')) { place.push({ layer: 'overlay', row: r, col: c, typeId: 'gummy_tie', layers: 1 }); t = t.slice(0, -1); }
      const fm = /^~([12])(.*)$/.exec(t); if (fm) { place.push({ layer: 'underlay', row: r, col: c, typeId: 'frosting_pad', layers: +fm[1] }); t = fm[2] || '.'; }
      if (t === '.') return;
      if (t[0] === 'X') { place.push({ layer: 'occupant', row: r, col: c, typeId: 'cookie_crate', hp: +t[1] }); return; }
      if (t === 'K') { place.push({ layer: 'occupant', row: r, col: c, typeId: 'delivery_basket' }); return; }
      if (t === 'R') { place.push({ layer: 'occupant', row: r, col: c, typeId: 'rainbow', special: 'rainbow' }); return; }
      const p = { layer: 'occupant', row: r, col: c, typeId: CODE[t[0]] }; if (SPC[t[1]]) p.special = SPC[t[1]]; place.push(p);
    });
    mask.push(m);
  });
  const def = LS.blankLevel(o.id || 'fixture');
  def.board.playableMask = mask; def.board.spawners = o.noSpawn ? [] : LS.autoSpawners(def); def.board.exits = exits;
  def.initial.placements = place; def.moveLimit = o.moves || 20;
  def.spawnPool = (o.pool || ['jelly_squid', 'jelly_fugu', 'jelly_jellyfish', 'jelly_bear', 'jelly_fig']).map(t => ({ typeId: t, weight: 1 }));
  def.goals = o.goals || [{ type: 'collect_piece', typeId: 'jelly_octopus', count: 99 }];
  if (o.tools) def.tools = o.tools;
  return LS.canonical(def);
}
const P5 = ['s', 'f', 'j', 'b', 'g'];
function base() { const rows = []; for (let r = 0; r < 7; r++) { const t = []; for (let c = 0; c < 7; c++) t.push(P5[(r + 2 * c) % 5]); rows.push(t); } return rows; }
const J = rows => rows.map(r => r.join(' '));
const sw = (r1, c1, r2, c2) => ({ type: 'swap', r1, c1, r2, c2 });
const waves = evs => evs.filter(e => e.t === 'wave');
const endEv = evs => evs.find(e => e.t === 'end');
const game = (rows, o, seed) => { const st = Core.createGame(fixture(rows, o), { seed: seed || 1 }); assert.strictEqual(st.phase, 'ready', 'fixture not ready ' + JSON.stringify(st.diag)); return st; };
const ledgerSum = st => st.scoring.entries.reduce((a, e) => a + e.points, 0);
const NOSPAWN = { noSpawn: true };

// ================================================================ §10 worked examples — formula level (synthetic committed facts, as the addendum states)
function synth() { const L = S.newLedger(); return L; }
function act(L, kind, combo, wavesF, deliveries, streakBefore) {
  if (streakBefore != null) L.streak = streakBefore;
  S.beginAction(L, { actionId: L.actions + 1, kind, comboKey: combo || null });
  const ws = wavesF.map((f, i) => S.scoreWave(L, Object.assign({ waveId: i + 1, wave: i + 1 }, f)));
  if (deliveries) S.scoreDelivery(L, deliveries);
  return { ws, a: S.endAction(L) };
}
const T = n => Array.from({ length: n }, (_, i) => 't' + Math.random().toString(36).slice(2) + i);
test('§10 A–G worked examples reproduce exactly from the formula (ScoreService on synthetic committed facts)', () => {
  const out = [];
  // A: plain triple
  let L = synth(), r = act(L, 'swap', null, [{ removedTokens: T(3) }]); assert.strictEqual(r.a.actionScore, 300); out.push('A=300');
  // B: active 4 → 3 removed + anchor upgraded (not removed) + line bonus; as 2nd consecutive skill op +300
  L = synth(); r = act(L, 'swap', null, [{ removedTokens: T(3), creations: [{ sp: 'v' }] }]); assert.strictEqual(r.a.actionScore, 600);
  L = synth(); r = act(L, 'swap', null, [{ removedTokens: T(3), creations: [{ sp: 'h' }] }], null, 1); assert.strictEqual(r.a.skill.n, 2); assert.strictEqual(r.a.actionScore, 900); out.push('B=600/900');
  // C: active 5 → 4 removed + rainbow; never also the 4-line bonus
  L = synth(); r = act(L, 'swap', null, [{ removedTokens: T(4), creations: [{ sp: 'rainbow' }] }]); assert.strictEqual(r.a.actionScore, 1200); out.push('C=1200');
  // D: line+area, wave 1 12 removed, wave 2 6 removed (×1.5), combo 1600, 3rd consecutive skill op 700
  L = synth(); r = act(L, 'swap', 'line_area', [{ removedTokens: T(12), comboKey: 'line_area' }, { removedTokens: T(6) }], null, 2);
  assert.deepStrictEqual(r.ws.map(w => w.points), [1200, 900]); assert.strictEqual(r.ws[0].combo, 1600); assert.strictEqual(r.a.skill.bonus, 700); assert.strictEqual(r.a.actionScore, 4400); out.push('D=4400');
  // E: obstacles + delivery
  L = synth(); r = act(L, 'swap', 'line_area', [
    { removedTokens: T(12), frostLayers: 2, crateHp: 2, crateDestroyed: 1, ties: 1, comboKey: 'line_area' },
    { removedTokens: T(6), frostLayers: 1 }, { removedTokens: T(3) }], ['basket1'], 2);
  assert.deepStrictEqual(r.ws.map(w => w.points), [2050, 1050, 600]); assert.strictEqual(r.a.actionScore, 7000); out.push('E=7000 (2050+1050+600+1600+1000+700)');
  // F: rainbow + line converts 20 ordinaries + 2 sources = 22 unique tokens, one combo bonus, no creation bonuses
  L = synth(); r = act(L, 'swap', 'rainbow_line', [{ removedTokens: T(22), comboKey: 'rainbow_line' }]); assert.strictEqual(r.a.actionScore, 5400); assert.strictEqual(L.natural, 0); assert.strictEqual(L.activeCombos, 1); out.push('F=5400');
  // G: clear with 23600 from actions and 7 moves left
  L = synth(); L.total = L.actionTotal = 23600; const fin = S.finalize(L, { won: true, movesLeft: 7 }); assert.strictEqual(fin.finalScore, 29100);
  const fin2 = S.finalize(L, { won: true, movesLeft: 7 }); assert.strictEqual(fin2, fin); assert.strictEqual(L.total, 29100, 'second finalize granted again'); out.push('G=29100');
  return out.join(' ');
});
test('§10 internal consistency audit: every stated sub-total equals the §4 formula (no conflicting example)', () => {
  const chk = [['E wave1', 12 * 100 + 2 * 100 + 2 * 150 + 150 + 200, 2050], ['E wave2', Math.floor((6 * 100 + 100) * 150 / 100), 1050], ['E wave3', 300 * 2, 600],
    ['E total', 2050 + 1050 + 600 + 1600 + 1000 + 700, 7000], ['D total', 1200 + 900 + 1600 + 700, 4400], ['F', 22 * 100 + 3200, 5400], ['G', 23600 + 2000 + 7 * 500, 29100]];
  chk.forEach(([n, got, want]) => assert.strictEqual(got, want, n));
  return chk.length + ' sub-totals consistent';
});

// ================================================================ the same examples on real boards (core → ScoreService)
test('A/B/C on real boards (no refill, so the action total is exact): 300, 600 → 900 as 2nd skill op, 1200', () => {
  const out = [];
  let b = base(); b[0][0] = 'o'; b[0][1] = 'o'; b[1][2] = 'o';
  let st = game(J(b), NOSPAWN), r = Core.apply(st, sw(0, 2, 1, 2)); assert(r.ok, r.reason);
  assert.strictEqual(endEv(r.events).sc.action.actionScore, 300); assert.strictEqual(st.score, 300); out.push('A ' + st.score);
  b = base(); b[0][0] = 'o'; b[0][1] = 'o'; b[0][3] = 'o'; b[1][2] = 'o'; b[0][6] = 'o'; b[1][6] = 'o'; b[3][6] = 'o'; b[2][5] = 'o';
  st = game(J(b), NOSPAWN); r = Core.apply(st, sw(0, 2, 1, 2)); assert(r.ok, r.reason);
  let w = waves(r.events); assert.strictEqual(w.length, 1, 'unexpected cascade'); assert.deepStrictEqual(w[0].creations.map(c => c.sp), ['v']);
  assert.strictEqual(endEv(r.events).sc.action.actionScore, 600); assert.strictEqual(st.goals[0].progress, 4, 'anchor still counts as a collect (goal rule kept)');
  r = Core.apply(st, sw(2, 5, 2, 6)); assert(r.ok, r.reason); const e2 = endEv(r.events).sc.action;
  assert.strictEqual(e2.skill.n, 2); assert.strictEqual(e2.skill.bonus, 300); assert.strictEqual(e2.actionScore, 900); out.push('B 600 then ' + e2.actionScore);
  b = base(); b[0][0] = 'o'; b[0][1] = 'o'; b[0][3] = 'o'; b[0][4] = 'o'; b[1][2] = 'o';
  st = game(J(b), NOSPAWN); r = Core.apply(st, sw(0, 2, 1, 2)); assert(r.ok, r.reason);
  w = waves(r.events); assert.deepStrictEqual(w[0].creations.map(c => c.sp), ['rainbow']); assert.strictEqual(endEv(r.events).sc.action.actionScore, 1200); out.push('C ' + st.score);
  return out.join(' · ');
});
test('anchor upgrade: goal counted, no base score yet; the special scores 100 exactly once when it is truly removed', () => {
  const b = base(); b[0][0] = 'o'; b[0][1] = 'o'; b[0][3] = 'o'; b[1][2] = 'o';
  const st = game(J(b), NOSPAWN); let r = Core.apply(st, sw(0, 2, 1, 2));
  const cr = waves(r.events)[0].creations[0]; const sp = st.occ[cr.r * 7 + cr.c]; const tok = sp.tok;
  assert(st.scoring.scoredTok[tok] == null, 'anchor token already paid at upgrade');
  const anchorRm = waves(r.events)[0].removed.find(x => x.anchor); assert(anchorRm && st.scoring.entries[0].ids.indexOf(tok) < 0);
  st.tools.hammer = 1; const s0 = st.score; r = Core.apply(st, { type: 'hammer', r: cr.r, c: cr.c }); assert(r.ok, r.reason);
  assert.strictEqual(st.scoring.scoredTok[tok], 1, 'special removal not paid');
  const w1 = waves(r.events)[0]; const n = w1.removed.length; assert.strictEqual(w1.sc.base, n * 100 + w1.sc.parts.frost + w1.sc.parts.crateHp + w1.sc.parts.crateKill + w1.sc.parts.ties);
  const allIds = [].concat(...st.scoring.entries.filter(e => e.kind === 'wave_base').map(e => e.ids)); assert.strictEqual(new Set(allIds).size, allIds.length, 'a token paid twice');
  return 'stripe tok ' + tok + ' paid once on its own removal (+' + (st.score - s0) + ' for that action incl. its line clear)';
});
test('D/E/F structure on real boards: line+bomb combo bonus once, wave 2 ×1.5 only after gravity; rainbow+line pays no creation/combo per product', () => {
  // line + bomb with an obstacle mix; refill on so a follow-up wave can happen (checked against the formula, not hard-coded)
  const b = base(); b[3][3] = 'f-'; b[3][4] = 'b*'; b[3][1] = '~2' + b[3][1]; b[4][3] = 'X1'; b[2][6] = 'X2'; b[1][3] += '^';
  let st = game(J(b), {}, 3), r = Core.apply(st, sw(3, 3, 3, 4)); assert(r.ok, r.reason);
  const ws = waves(r.events); assert.strictEqual(ws[0].sc.combo, 1600); assert.strictEqual(ws[0].sc.pct, 100);
  ws.forEach((w, i) => { assert.strictEqual(w.sc.pct, [100, 150, 200, 250, 300][Math.min(i, 4)]); assert.strictEqual(w.sc.points, Math.floor(w.sc.base * w.sc.pct / 100)); if (i) assert.strictEqual(w.sc.combo, 0, 'combo bonus repeated'); });
  assert.strictEqual(ws[0].sc.parts.crateKill, 150); assert.strictEqual(ws[0].sc.parts.ties, 200);
  const a = endEv(r.events).sc.action; assert.strictEqual(a.skill.n, 1); assert.strictEqual(a.skill.bonus, 0);
  // rainbow + line: every converted ordinary is one removal (100), 0 creation bonuses, 1 combo bonus
  const b2 = base(); b2[3][3] = 'R'; b2[3][4] = 'b-';
  st = game(J(b2), {}, 2); r = Core.apply(st, sw(3, 3, 3, 4)); assert(r.ok, r.reason);
  const w0 = waves(r.events)[0], conv = w0.removed.filter(x => x.conv).length;
  assert(conv >= 5, 'too few conversions ' + conv); assert.strictEqual(w0.sc.creation, 0); assert.strictEqual(w0.sc.combo, 3200);
  assert.strictEqual(w0.sc.parts.pieces, w0.removed.length * 100, 'each removed identity paid once'); assert.strictEqual(st.scoring.natural, waves(r.events).reduce((n, w) => n + w.creations.length, 0));
  return 'line+bomb waves ' + ws.map(w => w.sc.points + '@' + w.sc.pct + '%').join(',') + ' · rainbow+line ' + conv + ' conversions, combo 3200 once';
});
test('visual relay (stripe hitting another special) stays in the same wave (×1.0); only a new match after gravity raises it', () => {
  const b = base(); b[0][0] = 'o'; b[0][1] = 'o'; b[1][2] = 'o'; b[0][4] = 'f|'; b[0][5] = 'b*';
  b[0][3] = 'g-';   // octopus triple at row 0 does not touch them; use a stripe in the triple instead
  b[0][1] = 'o-';
  const st = game(J(b), {}, 5), r = Core.apply(st, sw(0, 2, 1, 2)); assert(r.ok, r.reason);
  const ws = waves(r.events); assert(ws[0].specials >= 3, 'relay did not happen: ' + ws[0].specials);
  assert.strictEqual(ws[0].sc.pct, 100); assert.strictEqual(ws[0].chain, 1);
  ws.forEach((w, i) => assert.strictEqual(w.chain, i + 1));
  return ws[0].specials + ' special activations in wave 1 at ×1.0; later waves ' + ws.slice(1).map(w => w.chain + ':' + w.sc.pct + '%').join(' ');
});
test('basket delivery = fixed 1000 (no multiplier even in a later wave); hammer on 2-layer frost under a basket: 2→1, +100, hammer spent, no delivery', () => {
  const b = base(); b[3][2] = 'K'; b[4][2] = 'o'; b[5][2] = 'o'; b[6][1] = 'o'; b[6][2] = b[6][2] + '!';
  b[0][5] = '~2K'; b[6][5] = b[6][5] + '!';   // a basket on 2 layers of frost (its exit is far below, blocked by jellies)
  const def = fixture(J(b), { tools: { hammer: 3, swap: 0, shuffle: 0 } });
  let st = Core.createGame(def, { seed: 4 }); assert.strictEqual(st.phase, 'ready', JSON.stringify(st.diag));
  let deliv = 0; const r0 = Core.apply(st, sw(6, 1, 6, 2)); assert(r0.ok, r0.reason);
  r0.events.filter(e => e.t === 'deliver').forEach(e => { assert.strictEqual(e.sc.points, 1000 * e.items.length); deliv += e.items.length; });
  const w0 = waves(r0.events)[0]; assert.strictEqual(w0.sc.base, w0.removed.length * 100 + w0.sc.parts.frost, 'basket counted in a wave');
  assert(deliv >= 1, 'no delivery happened');
  const dl = st.scoring.entries.filter(e => e.kind === 'delivery'); assert(dl.every(e => e.pct === 100 && e.points === e.qty * 1000));
  st = Core.createGame(def, { seed: 4 }); const s0 = st.score, h0 = st.tools.hammer, k0 = st.scoring.streak;
  let r = Core.apply(st, { type: 'hammer', r: 0, c: 5 }); assert(r.ok, r.reason);
  const w = waves(r.events)[0]; assert.deepStrictEqual(w.frost.map(f => [f.l0, f.l1]), [[2, 1]]); assert.strictEqual(st.score - s0, 100); assert.strictEqual(st.tools.hammer, h0 - 1);
  assert.strictEqual(st.delivered, 0); assert(st.occ[5].kind === 'basket');
  r = Core.apply(st, { type: 'hammer', r: 0, c: 5 }); assert(r.ok); assert.strictEqual(st.under[5], null);
  const h1 = st.tools.hammer, sc1 = st.score, hash = Core.stateHash(st); r = Core.apply(st, { type: 'hammer', r: 0, c: 5 });
  assert(!r.ok && r.reason === 'immune'); assert.strictEqual(st.tools.hammer, h1); assert.strictEqual(st.score, sc1); assert.strictEqual(Core.stateHash(st), hash);
  return deliv + ' delivered at 1000 each; frost 2→1 +100 then 1→0 +100; bare basket → refused, no tool, no score';
});
test('invalid / cancelled / refused actions: no score, no tool, skill chain unchanged; free auto-shuffle: no score, no move, chain kept', () => {
  const b = base(); b[0][0] = 'o'; b[0][1] = 'o'; b[0][3] = 'o'; b[1][2] = 'o';
  const st = game(J(b), { tools: { hammer: 0, swap: 1, shuffle: 1 } }); Core.apply(st, sw(0, 2, 1, 2)); assert.strictEqual(st.scoring.streak, 1);
  const h = Core.stateHash(st), sc = st.score;
  [sw(0, 0, 3, 3), sw(5, 5, 5, 6), { type: 'hammer', r: 1, c: 1 }, { type: 'shuffle', expect: 123 }, { type: 'warp' }].forEach(a => { const r = Core.apply(st, a); assert(!r.ok, JSON.stringify(a)); });
  assert.strictEqual(Core.stateHash(st), h); assert.strictEqual(st.score, sc); assert.strictEqual(st.scoring.streak, 1);
  // auto shuffle: force a dead board then end a turn via a valid move — use the core's own endTurn path on a stuck-free board
  const lv = LV.verify_01_baseline; let found = null;
  for (let s = 1; s <= 400 && !found; s++) {
    const g = Core.createGame(lv, { seed: s });
    for (let t = 0; t < 25 && g.phase === 'ready'; t++) {
      const mv = Core.listMoves(g); const before = { score: g.score, streak: g.scoring.streak, moves: g.moves };
      const r = Core.apply(g, sw(...mv[(t * 7 + s) % mv.length])); const sh = r.events.find(e => e.t === 'shuffle' && e.auto);
      if (sh) { const end = endEv(r.events); found = { s, t, streakAfter: end.sc.streak, act: end.sc.action }; const ix = r.events.indexOf(sh);
        assert(!r.events.slice(ix).some(e => e.t === 'wave' || e.t === 'deliver'), 'score after the auto shuffle'); assert.strictEqual(end.sc.streak, g.scoring.streak); break; }
    }
  }
  return 'refusals free; ' + (found ? 'auto-shuffle seen (seed ' + found.s + ' turn ' + found.t + '): no score after it, chain ' + found.streakAfter + ' kept' : 'no auto-shuffle reached in 400 seeds (structural: shuffle path has no scoring hook)');
});
test('skill chain: first-wave active creation or special+special combo increments by ≤1; ordinary valid move resets; rainbow+ordinary resets; tools reset; cap at 5 (+1800)', () => {
  const L = S.newLedger(); const seq = []; const one = (kind, combo, fw) => { S.beginAction(L, { actionId: L.actions + 1, kind, comboKey: combo }); S.scoreWave(L, { waveId: 1, wave: 1, removedTokens: ['x' + L.actions + 'a'], creations: fw ? [{ sp: 'h' }, { sp: 'bomb' }] : [] });
    S.scoreWave(L, { waveId: 2, wave: 2, removedTokens: ['x' + L.actions + 'b'], creations: [{ sp: 'v' }] }); const a = S.endAction(L); seq.push(a.skill.n + '/' + a.skill.bonus); return a; };
  one('swap', null, true); one('swap', 'line_line', false); one('swap', null, true); one('swap', 'rainbow_area', false); one('swap', null, true); one('swap', null, true);
  assert.deepStrictEqual(seq, ['1/0', '2/300', '3/700', '4/1200', '5/1800', '6/1800']);
  one('swap', null, false); assert.strictEqual(L.streak, 0, 'ordinary move (cascade creation only) did not reset');
  one('swap', null, true); one('hammer', null, true); assert.strictEqual(L.streak, 0, 'tool did not reset');
  one('swap', null, true); one('swap', null, false); assert.strictEqual(L.streak, 0);
  // rainbow + ordinary is a valid move but not an active special combo
  assert.strictEqual(S.comboKey('rainbow', null), null); assert.strictEqual(S.comboKey('h', 'bomb'), 'line_area'); assert.strictEqual(S.comboKey('bomb', 'rainbow'), 'rainbow_area');
  assert.strictEqual(L.maxStreak, 6);
  return seq.join(' ') + ' · reset by ordinary / tool';
});
test('rainbow + special with no ordinary of that colour: refused, no move, sources kept, not listed as a legal move; no single-tap action exists', () => {
  const b = base(); for (let r = 0; r < 7; r++) for (let c = 0; c < 7; c++) if (b[r][c] === 'b') b[r][c] = 'f';
  b[3][3] = 'R'; b[3][4] = 'b-';   // bear stripe, no ordinary bears
  const st = Core.createGame(fixture(J(b), {}), { seed: 1 }); const h = Core.stateHash(st);
  const r = Core.apply(st, sw(3, 3, 3, 4)); assert(!r.ok && r.reason === 'no_target'); assert.strictEqual(Core.stateHash(st), h);
  assert(!Core.listMoves(st).some(m => (m[0] === 3 && m[1] === 3 && m[2] === 3 && m[3] === 4)), 'listed');
  ['tap', 'activate', 'detonate'].forEach(t => assert.strictEqual(Core.apply(st, { type: t, r: 3, c: 3 }).reason, 'unknown_action'));
  // every listed move is an adjacent swap the core accepts
  for (const id of ['verify_01_baseline', 'vb_03_rainbow_ties', 'b_tie_intro', 'vb_06_board_attack']) for (let s = 1; s <= 5; s++) {
    const g = Core.createGame(LV[id], { seed: s }); Core.listMoves(g).forEach(m => { const c = Core.clone(g); c.scoring = JSON.parse(JSON.stringify(g.scoring)); assert(Core.apply(c, sw(...m)).ok, id + ' listed but refused ' + m); });
  }
  return 'no_target refused + unlisted; legal-move list = accepted swaps only';
});
test('end bonus decided once: win = actions + 2000 + 500 × moves; loss = no end bonus; leftover specials on the board pay nothing', () => {
  const b = base(); b[0][0] = 'o'; b[0][1] = 'o'; b[1][2] = 'o'; b[5][5] = 'f-'; b[6][6] = 'b*';
  const st = game(J(b), Object.assign({ goals: [{ type: 'collect_piece', typeId: 'jelly_octopus', count: 3 }], moves: 9 }, NOSPAWN));
  const r = Core.apply(st, sw(0, 2, 1, 2)); assert.strictEqual(st.phase, 'won');
  const fin = endEv(r.events).sc.final; assert.strictEqual(fin.finalScore, 300 + 2000 + 8 * 500); assert.strictEqual(st.score, fin.finalScore);
  assert.strictEqual(S.finalize(st.scoring, { won: true, movesLeft: 99 }), fin); assert.strictEqual(st.score, st.scoring.total); assert.strictEqual(ledgerSum(st), st.score);
  assert.strictEqual(Core.apply(st, sw(5, 5, 5, 6)).reason, 'not_ready', 'played after the win');
  const b2 = base(); b2[0][0] = 'o'; b2[0][1] = 'o'; b2[1][2] = 'o';
  const lo = game(J(b2), Object.assign({ goals: [{ type: 'collect_piece', typeId: 'jelly_octopus', count: 9 }], moves: 1 }, NOSPAWN)); const r2 = Core.apply(lo, sw(0, 2, 1, 2));
  assert.strictEqual(lo.phase, 'lost'); const f2 = endEv(r2.events).sc.final; assert.strictEqual(f2.winBonus + f2.movesBonus, 0); assert.strictEqual(lo.score, 300);
  return 'win ' + fin.finalScore + ' (300 + 2000 + 8×500), 2 specials left unpaid; loss ' + lo.score;
});
// ================================================================ independent oracle over real play: ledger == formula recomputed from the events
function oracle(prevSp, evs, k) {
  let sum = 0, combo = null; const sw0 = evs.find(e => e.t === 'swap');
  if (sw0 && prevSp[sw0.a] && prevSp[sw0.b]) combo = S.comboKey(prevSp[sw0.a], prevSp[sw0.b]);
  let first = 0, waveN = 0;
  evs.forEach(e => {
    if (e.t === 'wave') {
      waveN++; const made = new Set(e.creations.map(c => c.from));
      const pieces = e.removed.filter(x => !(x.anchor && made.has(x.id))).length;
      let base = pieces * 100 + e.ties.length * 200; e.frost.forEach(f => base += (f.l0 - f.l1) * 100); e.crates.forEach(c => { base += (c.hp0 - c.hp1) * 150 + (c.hp1 === 0 ? 150 : 0); });
      const pct = [100, 150, 200, 250, 300][Math.min(e.chain, 5) - 1]; sum += Math.floor(base * pct / 100);
      e.creations.forEach(c => sum += c.sp === 'rainbow' ? 800 : c.sp === 'bomb' ? 500 : 300);
      if (e.chain === 1 && combo) sum += S.CONFIG.activeCombo[combo];
      if (e.chain === 1) first = e.creations.length;
    }
    if (e.t === 'deliver') sum += 1000 * e.items.length;
  });
  let streak = k.streak; const isSwap = !!sw0;
  if (isSwap && (combo || first > 0)) { streak++; sum += [0, 300, 700, 1200, 1800][Math.min(streak, 5) - 1]; } else streak = 0;
  k.streak = streak; return { sum, waves: waveN };
}
test('oracle: over real play on every shipped level, the ledger equals the §4 formula recomputed independently from the committed events', () => {
  let actions = 0, waveN = 0, maxW = 0, totals = 0;
  for (const id of Object.keys(LV)) for (let s = 1; s <= 6; s++) {
    const st = Core.createGame(LV[id], { seed: s }); if (st.phase !== 'ready') continue; const k = { streak: 0 };
    for (let t = 0; t < 30 && st.phase === 'ready'; t++) {
      const prevSp = {}; st.occ.forEach(o => { if (o && o.sp) prevSp[o.id] = o.sp; });
      let a; if (t % 9 === 8 && st.tools.hammer > 0) { const kk = (t * 11 + s) % 49; a = { type: 'hammer', r: Math.floor(kk / 7), c: kk % 7 }; } else { const mv = Core.listMoves(st); a = sw(...mv[(t * 5 + s * 3) % mv.length]); }
      const s0 = st.score, r = Core.apply(st, a); if (!r.ok) continue; actions++;
      const o = oracle(prevSp, r.events, k), fin = endEv(r.events).sc.final;
      waveN += o.waves; maxW = Math.max(maxW, o.waves);
      assert.strictEqual(endEv(r.events).sc.action.actionScore, o.sum, id + ' s' + s + ' t' + t + ' action ' + JSON.stringify(a));
      assert.strictEqual(st.score - s0, o.sum + (fin ? fin.winBonus + fin.movesBonus : 0), id + ' total');
      assert.strictEqual(st.scoring.streak, k.streak, id + ' streak');
    }
    assert.strictEqual(ledgerSum(st), st.score); totals++;
    const ids = [].concat(...st.scoring.entries.filter(e => e.kind === 'wave_base').map(e => e.ids)); assert.strictEqual(new Set(ids).size, ids.length, id + ' token paid twice');
  }
  return totals + ' games, ' + actions + ' actions, ' + waveN + ' waves (max ' + maxW + ' in one action) — ledger == oracle, no token paid twice';
});
test('ledger determinism: same content + rules + score version + seed + inputs → identical ledger hash; replay twice; different seed differs', () => {
  const out = [];
  for (const id of ['verify_04_overlap_dedupe', 'vb_02_delivery', 'b_tie_intro', 'legacy_03']) {
    const st = Core.createGame(LV[id], { seed: 77 }), acts = [];
    for (let t = 0; t < 14 && st.phase === 'ready'; t++) { const mv = Core.listMoves(st); const a = sw(...mv[(t * 3) % mv.length]); Core.apply(st, a); acts.push(a); }
    const a1 = Core.replay(LV[id], 77, acts), a2 = Core.replay(LV[id], 77, acts);
    const h1 = S.ledgerHash(a1.state.scoring, Core.hashStr), h2 = S.ledgerHash(a2.state.scoring, Core.hashStr);
    assert.strictEqual(h1, h2); assert.strictEqual(h1, S.ledgerHash(st.scoring, Core.hashStr)); assert.strictEqual(a1.state.score, st.score);
    assert.notStrictEqual(S.ledgerHash(Core.replay(LV[id], 78, acts).state.scoring, Core.hashStr), h1);
    out.push(id + '=' + h1 + '/' + st.score);
  }
  return out.join(' ');
});
test('rule continuity: with scoring stripped, every rule result is identical to v3.1.0-stageB (102 scenario hashes)', () => {
  const ref = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures/rules_ref_v3.1.0-stageB.json'), 'utf8')).hashes;
  const now = require('./rules_ref.js')(ROOT); let n = 0;
  Object.keys(ref).forEach(id => ref[id].forEach((h, i) => { assert.strictEqual(now[id][i], h, id + ' scenario ' + i + ' changed'); n++; }));
  return n + ' scenarios identical';
});
test('score config is versioned + frozen; ruleset unchanged', () => {
  assert.strictEqual(S.CONFIG.scoreVersion, 'jelly_score_v1'); assert(Object.isFrozen(S.CONFIG) && Object.isFrozen(S.CONFIG.base));
  assert.deepStrictEqual(S.CONFIG.cascadePercent, [100, 150, 200, 250, 300]); assert.strictEqual(Core.RULESET, 'jelly_rules_v1');
  const st = Core.createGame(LV.verify_01_baseline, { seed: 1 }); assert.strictEqual(st.scoreVersion, 'jelly_score_v1'); assert.strictEqual(st.scoring.scoreVersion, 'jelly_score_v1');
  return S.CONFIG.scoreVersion + ' (' + S.CONFIG.status + ')';
});
test('score service purity: no DOM / timers / Math.random / Date', () => {
  const src = fs.readFileSync(path.join(ROOT, 'js/score_service.js'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
  ['document', 'setTimeout', 'Math.random', 'Date', 'requestAnimationFrame', 'performance'].forEach(w => assert(src.indexOf(w) < 0, w));
  return 'pure';
});

fs.mkdirSync(path.join(ROOT, 'tests/out'), { recursive: true });
fs.writeFileSync(path.join(ROOT, 'tests/out/stageC0_score_results.json'), JSON.stringify({ when: new Date().toISOString(), core: Core.CORE_VERSION, ruleset: Core.RULESET, scoreVersion: S.SCORE_VERSION, pass, fail, results }, null, 2));
console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
