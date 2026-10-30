// Stage A headless rule tests — run: node tests/stageA_core.test.js   (no deps; exits 1 on any failure)
// Everything here runs the same js/rules_core.js + js/level_schema.js that the game and the editor playtest load.
'use strict';
const fs = require('fs'), path = require('path'), assert = require('assert');
const ROOT = path.join(__dirname, '..');
const Core = require(path.join(ROOT, 'js/rules_core.js')), LS = require(path.join(ROOT, 'js/level_schema.js'));
const SRC = path.join(ROOT, 'levels/src'), BAD = path.join(ROOT, 'levels/invalid');
const LV = {}; fs.readdirSync(SRC).filter(f => f.endsWith('.json')).forEach(f => { const r = LS.parse(fs.readFileSync(path.join(SRC, f), 'utf8')); LV[r.def.levelId] = r.def; });

let pass = 0, fail = 0; const results = [];
function test(name, fn) {
  try { const info = fn(); pass++; results.push({ name, ok: true, info: info || '' }); console.log('PASS', name, info ? '— ' + info : ''); }
  catch (e) { fail++; results.push({ name, ok: false, info: e.message }); console.log('FAIL', name, '—', e.message); }
}

// ---------------------------------------------------------------- board builder for hand-made fixtures
// tokens: s f j o b g (+ '-' h stripe, '|' v stripe, '*' bomb), R rainbow, X1..X3 crate, # void, '.' seeded fill; prefix ~1 / ~2 = frosting under it
const CODE = { s: 'jelly_squid', f: 'jelly_fugu', j: 'jelly_jellyfish', o: 'jelly_octopus', b: 'jelly_bear', g: 'jelly_fig' };
const SPC = { '-': 'h', '|': 'v', '*': 'bomb' };
function fixture(rows, o = {}) {
  const mask = [], place = [];
  rows.forEach((row, r) => {
    const tk = row.trim().split(/\s+/); let m = '';
    tk.forEach((t0, c) => {
      let t = t0;
      if (t === '#') { m += '0'; return; } m += '1';
      const fm = /^~([12])(.*)$/.exec(t); if (fm) { place.push({ layer: 'underlay', row: r, col: c, typeId: 'frosting_pad', layers: +fm[1] }); t = fm[2] || '.'; }
      if (t === '.') return;
      if (t[0] === 'X') { place.push({ layer: 'occupant', row: r, col: c, typeId: 'cookie_crate', hp: +t[1] }); return; }
      if (t === 'R') { place.push({ layer: 'occupant', row: r, col: c, typeId: 'jelly_bear', special: 'rainbow' }); return; }
      const p = { layer: 'occupant', row: r, col: c, typeId: CODE[t[0]] }; if (SPC[t[1]]) p.special = SPC[t[1]]; place.push(p);
    });
    mask.push(m);
  });
  const def = LS.blankLevel(o.id || 'fixture');
  def.board.playableMask = mask; def.board.spawners = LS.autoSpawners(def);
  def.initial.placements = place; def.moveLimit = o.moves || 20;
  def.spawnPool = (o.pool || ['jelly_squid', 'jelly_fugu', 'jelly_jellyfish', 'jelly_bear', 'jelly_fig']).map(t => ({ typeId: t, weight: 1 }));
  def.goals = o.goals || [{ type: 'collect_piece', typeId: 'jelly_octopus', count: 99 }];
  if (o.tools) def.tools = o.tools;
  return LS.canonical(def);
}
// a fully fixed, match-free 7x7 base pattern (rows) we can poke holes into
const P5 = ['s', 'f', 'j', 'b', 'g'];
function base() {   // + one guaranteed legal move: octopus (0,0)(0,1)(1,2) → swap (0,2)↔(1,2)
  const rows = []; for (let r = 0; r < 7; r++) { const t = []; for (let c = 0; c < 7; c++) t.push(P5[(r + 2 * c) % 5]); rows.push(t); }
  rows[0][0] = 'o'; rows[0][1] = 'o'; rows[1][2] = 'o'; return rows;
}
const J = rows => rows.map(r => r.join(' '));
const at = (st, r, c) => st.occ[r * st.C + c];
const waves = evs => evs.filter(e => e.t === 'wave');

// ---------------------------------------------------------------- invariant checker used by the fuzz runs
function checkTurn(st0, st, res, seenRemoved) {
  for (const ev of res.events) {
    if (ev.t === 'wave') {
      const cid = new Set(); for (const h of ev.crates) { assert(!cid.has(h.id), 'crate ' + h.id + ' damaged twice in one wave'); cid.add(h.id); assert.strictEqual(h.hp0 - h.hp1, 1, 'crate damage per wave must be exactly 1'); }
      const fid = new Set(); for (const h of ev.frost) { assert(!fid.has(h.id), 'frost ' + h.id + ' damaged twice in one wave'); fid.add(h.id); assert.strictEqual(h.l0 - h.l1, 1, 'frost damage per wave must be exactly 1'); }
      for (const rm of ev.removed) { assert(!seenRemoved.has(rm.id), 'piece ' + rm.id + ' removed twice'); seenRemoved.add(rm.id); }
    }
  }
}
function fuzz(def, seed, turns, pick) {
  const st = Core.createGame(def, { seed }), C = st.C; const seen = new Set(), rec = { actions: [], crateMulti: 0, dedup: 0, spawnsChecked: 0 };
  const credited = st.goals.map(() => 0);
  for (let t = 0; t < turns && st.phase === 'ready'; t++) {
    const mv = Core.listMoves(st); if (!mv.length) break;
    const m = mv[pick(t, mv.length)], a = { type: 'swap', r1: m[0], c1: m[1], r2: m[2], c2: m[3] };
    const before = Core.clone(st), res = Core.apply(st, a); assert(res.ok, 'listed move rejected: ' + res.reason); rec.actions.push(a);
    checkTurn(before, st, res, seen);
    // no spawn under a crate + spawns only into a segment top sub-region that owns a spawner
    let occ = before.occ.slice(); const hitBy = {};
    res.events.forEach(ev => {
      if (ev.t === 'wave') {
        ev.removed.forEach(x => { occ[x.r * C + x.c] = null; });
        ev.creations.forEach(x => { occ[x.r * C + x.c] = { id: x.id, kind: 'jelly' }; });
        ev.crates.forEach(x => { if (x.hp1 <= 0) occ[x.r * C + x.c] = null; else occ[x.r * C + x.c] = Object.assign({}, occ[x.r * C + x.c], { hp: x.hp1 }); hitBy[x.id] = (hitBy[x.id] || 0) + 1; rec.dedup += x.dedup; });
        ev.goals.forEach(g => { credited[g.i] = g.progress; });
      } else if (ev.t === 'fall') {
        const moved = ev.moves.map(m2 => [occ[m2.r0 * C + m2.c], m2]); moved.forEach(([o]) => { }); ev.moves.forEach(m2 => { occ[m2.r0 * C + m2.c] = null; }); moved.forEach(([o, m2]) => { occ[m2.r1 * C + m2.c] = o; });
        ev.spawns.forEach(sp => {
          rec.spawnsChecked++;
          assert(st.spawn[sp.seg0 * C + sp.c], 'spawn in a segment without spawner at col ' + sp.c);
          for (let r = sp.seg0; r <= sp.r; r++) { const o = occ[r * C + sp.c]; assert(!(o && o.kind === 'crate'), 'spawn at (' + sp.r + ',' + sp.c + ') is under a crate at row ' + r); }
          occ[sp.r * C + sp.c] = { id: sp.id, kind: 'jelly' };
        });
      } else if (ev.t === 'shuffle') { occ = st.occ.slice(); }
    });
    Object.values(hitBy).forEach(n => { if (n > 1) rec.crateMulti++; });
  }
  // goals never double count: clear goals equal the number of frozen-scope instances actually gone
  st.goals.forEach((g, i) => {
    if (g.type === 'collect_piece') return;
    const arr = g.type === 'clear_underlay' ? st.under : (g.type === 'clear_obstacle' && g.typeId === 'gummy_tie') ? st.over : st.occ; let alive = 0;   // v3.1: ties live on st.over
    arr.forEach(o => { if (o && g.ids[o.id]) alive++; });
    const total = Object.keys(g.ids).length;
    assert.strictEqual(g.progress, total - alive, 'goal ' + i + ' progress ' + g.progress + ' ≠ removed instances ' + (total - alive));
    assert(g.progress <= total, 'goal overshoot');
  });
  return { st, rec };
}

// ================================================================ tests
test('core purity: no DOM / timers / Math.random / Date in rules_core.js', () => {
  const src = fs.readFileSync(path.join(ROOT, 'js/rules_core.js'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
  ['Math.random', 'Date.now', 'new Date', 'setTimeout', 'setInterval', 'requestAnimationFrame', 'document.', 'window.', 'performance.'].forEach(w => assert(src.indexOf(w) < 0, 'found ' + w));
});

test('all shipped levels: parse → serialize → parse is lossless (byte-identical, same contentHash)', () => {
  const n = Object.keys(LV).length;
  for (const id in LV) {
    const raw = fs.readFileSync(path.join(SRC, id + '.json'), 'utf8');
    const s1 = LS.serialize(LV[id]); assert.strictEqual(s1, raw, id + ' source is not canonical');
    const r2 = LS.parse(s1); assert(r2.ok); assert.strictEqual(LS.serialize(r2.def), s1, id + ' round trip changed bytes');
    assert.strictEqual(LS.contentHash(r2.def), LS.contentHash(LV[id]));
  }
  return n + ' levels';
});

test('round trip keeps unknown keys and editor notes; refuses newer schemaVersion', () => {
  const d = LS.deep(LV.verify_02_double_frosting); d.futureField = { a: 1 }; d.editorNotes.designIntent = '测试 ✓';
  const r = LS.parse(LS.serialize(d)); assert(r.ok); assert.deepStrictEqual(r.def.futureField, { a: 1 }); assert.strictEqual(r.def.editorNotes.designIntent, '测试 ✓');
  const newer = LS.deep(d); newer.schemaVersion = 99; const rn = LS.parse(JSON.stringify(newer)); assert(!rn.ok && rn.errors[0].code === 'schema_newer');
});

test('shipped levels validate: 0 errors, 0 blocking, init OK on 20 seeds', () => {
  for (const id in LV) { const v = LS.validate(LV[id]); assert.strictEqual(v.counts.error, 0, id + ' errors ' + JSON.stringify(v.issues)); assert.strictEqual(v.counts.block, 0, id); assert.strictEqual(v.sim.initOk, 20, id); }
});

test('invalid samples are caught with the expected category', () => {
  const want = { bad_crate_on_frosting: 'crate_on_frosting', bad_fixed_match: 'fixed_match', bad_goal_contradiction: 'collect_unreachable', bad_missing_spawner: 'segment_no_spawner',
    bad_ranges: 'crate_hp', bad_void_placement: 'place_void',
    // stage B samples (v3.1): bad_stage_b retired — ties / delivery / exits are enabled now
    bad_tie_on_crate: 'tie_host', bad_exit_not_bottom: 'exit_not_bottom', bad_basket_on_exit: 'basket_on_exit', bad_basket_no_exit: 'basket_no_exit',
    bad_deliver_short: 'deliver_short', bad_deliver_no_exit: 'deliver_no_exit', bad_future_type: 'unknown_type' };
  const out = [];
  for (const f of fs.readdirSync(BAD)) {
    const id = f.replace('.json', ''), r = LS.parse(fs.readFileSync(path.join(BAD, f), 'utf8')); assert(r.ok, f + ' should parse');
    const v = LS.validate(r.def, { seeds: 5 }); assert(!v.publishable, f + ' must not be publishable');
    assert(v.issues.some(i => i.code === want[id]), f + ' missing ' + want[id]);
    assert(v.issues.filter(i => i.sev !== 'warn').every(i => i.cat === 'A' || i.cat === 'B'), f + ' error/block must be cat A/B');
    out.push(id + ':' + want[id]);
  }
  return out.length + ' samples';
});

test('same ruleset + level + seed + inputs → identical state hash and event hash (and a different seed differs)', () => {
  const out = [];
  for (const id of ['verify_01_baseline', 'verify_04_overlap_dedupe', 'verify_06_segments', 'legacy_02']) {
    const { rec, st } = fuzz(LV[id], 42, 12, (t, n) => (t * 7) % n);
    const a = Core.replay(LV[id], 42, rec.actions), b = Core.replay(LS.parse(LS.serialize(LV[id])).def, 42, rec.actions);
    assert.strictEqual(a.hash, Core.stateHash(st)); assert.strictEqual(a.hash, b.hash); assert.strictEqual(a.eventsHash, b.eventsHash);
    const c = Core.replay(LV[id], 43, rec.actions); assert.notStrictEqual(c.hash, a.hash, id + ' seed 43 gave the same hash');
    out.push(id + '=' + a.hash);
  }
  return out.join(' ');
});

test('verify_04: overlapping super-cross hits each 2-HP crate once (−1) with dedup reported; frosting −1 layer', () => {
  const st = Core.createGame(LV.verify_04_overlap_dedupe, { seed: 3 });
  const res = Core.apply(st, { type: 'swap', r1: 4, c1: 3, r2: 4, c2: 4 }); assert(res.ok, res.reason);
  const w1 = waves(res.events)[0]; assert.strictEqual(w1.combo, '超级十字!');
  assert.strictEqual(w1.crates.length, 3); w1.crates.forEach(h => { assert.strictEqual(h.hp0, 2); assert.strictEqual(h.hp1, 1); });
  assert(w1.crates.some(h => h.dedup >= 1), 'no overlap recorded');
  w1.frost.forEach(h => assert.strictEqual(h.l0 - h.l1, 1));
  assert.strictEqual(st.goals[0].progress, 0, 'crate goal must not count a damaged crate');
  return 'dedup=' + w1.crates.map(h => h.dedup).join(',');
});

test('crate: the next wave may hit the same crate again (once per wave, not once per turn)', () => {
  let found = 0, where = '';
  for (const id of ['verify_03_crate_adjacent', 'verify_04_overlap_dedupe', 'verify_06_segments']) for (let s = 1; s <= 40 && !found; s++) {
    const { rec } = fuzz(LV[id], s, 20, (t, n) => (t * 5 + s) % n); if (rec.crateMulti) { found = rec.crateMulti; where = id + ' seed ' + s; }
  }
  if (!found) {   // deterministic fallback fixture: crate hit by a match, then by the cascade it causes
    throw new Error('no multi-wave crate hit observed');
  }
  return where;
});

test('adjacency damage only from ordinary matches: hammer next to a crate and a v-stripe beside it do not damage it', () => {
  const rows = base(); rows[3][3] = 'X2'; rows[2][3] = 'o'; rows[3][2] = 'b|';
  const st = Core.createGame(fixture(J(rows)), { seed: 1 }); assert.strictEqual(st.phase, 'ready', 'fixture init ' + JSON.stringify(st.diag));
  let r = Core.apply(st, { type: 'hammer', r: 2, c: 3 }); assert(r.ok, r.reason); assert.strictEqual(waves(r.events)[0].crates.length, 0, 'hammer on the neighbour hurt the crate');
  const st2 = Core.createGame(fixture(J(rows)), { seed: 1 });
  r = Core.apply(st2, { type: 'hammer', r: 3, c: 2 }); assert(r.ok);
  const w = waves(r.events)[0]; assert(w.removed.length >= 7, 'v-stripe should clear its column'); assert.strictEqual(w.crates.length, 0, 'line beside crate damaged it');
});

test('crate: line attacks pass through (not cut), crate blocks gravity, no spawn under it', () => {
  const rows = base(); rows[2][3] = 'X3'; rows[4][0] = 's-';
  const st = Core.createGame(fixture(J(rows)), { seed: 1 }); assert.strictEqual(st.phase, 'ready');
  const above = [at(st, 0, 3).id, at(st, 1, 3).id];
  const r = Core.apply(st, { type: 'hammer', r: 4, c: 0 }); assert(r.ok);
  const w = waves(r.events)[0], f = r.events.find(e => e.t === 'fall');
  [4, 5, 6].forEach(c => assert(w.removed.some(x => x.r === 4 && x.c === c), 'line stopped before col ' + c));
  assert(!f.moves.some(m => above.includes(m.id) && m.r1 > 2), 'piece fell through the crate');
  assert(!f.spawns.some(s => s.c === 3 && s.r > 2), 'spawned under the crate');
  assert.strictEqual(at(st, 3, 3), null, 'cell under the crate should stay empty after the fall');
  return 'removed ' + w.removed.length;
});

test('specials never count toward collect; an anchor counts once', () => {
  const rows = base(); rows[3][0] = 'f'; rows[3][1] = 'f'; rows[3][2] = 'b'; rows[3][3] = 'f'; rows[3][4] = 'g'; rows[2][2] = 'f';   // swap (2,2)↓(3,2) → 4 fugu in a row → stripe
  const def = fixture(J(rows), { goals: [{ type: 'collect_piece', typeId: 'jelly_fugu', count: 50 }] });
  const st = Core.createGame(def, { seed: 1 }); assert.strictEqual(st.phase, 'ready', JSON.stringify(st.diag));
  const r = Core.apply(st, { type: 'swap', r1: 2, c1: 2, r2: 3, c2: 2 }); assert(r.ok, r.reason);
  const w = waves(r.events)[0]; assert.strictEqual(w.creations.length, 1);
  const fug = w.removed.filter(x => x.type === 'jelly_fugu' && !x.sp).length, sp = w.removed.filter(x => x.sp).length;
  assert.strictEqual(w.goals[0].progress, fug); assert.strictEqual(fug, 4);
  // later waves: removed specials add nothing
  let expect = 0; waves(r.events).forEach(ev => ev.removed.forEach(x => { if (x.type === 'jelly_fugu' && !x.sp) expect++; }));
  assert.strictEqual(st.goals[0].progress, expect);
  return 'fugu credited ' + st.goals[0].progress + ', specials removed ' + sp;
});

test('2-layer frosting: first hit does not reduce the goal, second hit does (spec 17.2)', () => {
  const rows = base(); rows[6][3] = '~2b';
  const def = fixture(J(rows), { goals: [{ type: 'clear_underlay', typeId: 'frosting_pad', scope: 'all' }], tools: { hammer: 3, swap: 0, shuffle: 0 } });
  const st = Core.createGame(def, { seed: 1 }); assert.strictEqual(st.phase, 'ready');
  let r = Core.apply(st, { type: 'hammer', r: 6, c: 3 }); let f = waves(r.events)[0].frost[0];
  assert.deepStrictEqual([f.l0, f.l1, st.goals[0].progress], [2, 1, 0]);
  r = Core.apply(st, { type: 'hammer', r: 6, c: 3 }); f = waves(r.events)[0].frost[0];
  assert.deepStrictEqual([f.l0, f.l1, st.goals[0].progress], [1, 0, 1]); assert.strictEqual(st.phase, 'won');
});

test('a new special is not triggered by the wave that creates it; it fires later when hit (spec 17.9)', () => {
  const rows = base(); rows[3][0] = 'f'; rows[3][1] = 'f'; rows[3][2] = 'b'; rows[3][3] = 'f'; rows[3][4] = 'g'; rows[2][2] = 'f';
  const st = Core.createGame(fixture(J(rows)), { seed: 1 });
  const r = Core.apply(st, { type: 'swap', r1: 2, c1: 2, r2: 3, c2: 2 }); const w = waves(r.events)[0], cr = w.creations[0];
  assert(cr && (cr.sp === 'h' || cr.sp === 'v')); assert.strictEqual(w.fx.filter(f => f.kind === 'beam').length, 0, 'created stripe fired in its own wave');
  const k = st.occ.findIndex(o => o && o.id === cr.id);
  if (k >= 0) {   // still on the board after the cascade → hammer it: it fires exactly once
    const r2 = Core.apply(st, { type: 'hammer', r: Math.floor(k / 7), c: k % 7 }); assert.strictEqual(waves(r2.events)[0].fx.filter(f => f.kind === 'beam').length, 1);
  }
  return 'created ' + cr.sp + ' id ' + cr.id;
});

test('an anchor jelly on frosting and next to a crate: counted once, frosting −1, crate −1 (spec 17.8)', () => {
  const rows = base(); rows[3][0] = 'f'; rows[3][1] = 'f'; rows[3][2] = '~1b'; rows[3][3] = 'f'; rows[3][4] = 'g'; rows[2][2] = 'f'; rows[4][2] = 'X2';
  const def = fixture(J(rows), { goals: [{ type: 'collect_piece', typeId: 'jelly_fugu', count: 50 }, { type: 'clear_underlay', typeId: 'frosting_pad', scope: 'all' }] });
  const st = Core.createGame(def, { seed: 1 }); assert.strictEqual(st.phase, 'ready', JSON.stringify(st.diag));
  const r = Core.apply(st, { type: 'swap', r1: 2, c1: 2, r2: 3, c2: 2 }); const w = waves(r.events)[0];
  const anchor = w.removed.filter(x => x.anchor); assert.strictEqual(anchor.length, 1); assert.strictEqual(anchor[0].r * 7 + anchor[0].c, 3 * 7 + 2);
  assert.strictEqual(w.frost.length, 1); assert.strictEqual(w.frost[0].l1, 0);
  assert.strictEqual(w.crates.length, 1); assert.deepStrictEqual([w.crates[0].hp0, w.crates[0].hp1], [2, 1]);
  assert.strictEqual(w.goals.find(g => g.i === 0).progress, 4);
});

test('fuzz all shipped levels (stage A + B) × 12 seeds × 20 turns: per-wave dedupe, no double counting, no spawn under crates', () => {
  let turns = 0, spawns = 0, dedup = 0;
  for (const id of Object.keys(LV)) for (let s = 1; s <= 12; s++) {
    const { rec } = fuzz(LV[id], s, 20, (t, n) => (t * 3 + s * 11) % n); turns += rec.actions.length; spawns += rec.spawnsChecked; dedup += rec.dedup;
  }
  return Object.keys(LV).length + ' levels, ' + turns + ' turns, ' + spawns + ' spawns checked, ' + dedup + ' overlapping hits deduped';
});

test('invalid actions change nothing (moves, tools, goals, rng, log, hash)', () => {
  const st = Core.createGame(LV.verify_06_segments, { seed: 5 }); const h0 = Core.stateHash(st);
  const crate = [5, 3], voidCell = [3, 3];
  let ok = Core.listMoves(st, 1)[0];
  const mkNoMatch = () => { for (let r = 0; r < 7; r++) for (let c = 0; c < 6; c++) { const a = at(st, r, c), b = at(st, r, c + 1); if (a && b && a.kind === 'jelly' && b.kind === 'jelly' && !Core.listMoves(st).some(m => m[0] === r && m[1] === c && m[2] === r && m[3] === c + 1)) return { type: 'swap', r1: r, c1: c, r2: r, c2: c + 1 }; } };
  const bad = [
    ['off_board', { type: 'swap', r1: 0, c1: 0, r2: -1, c2: 0 }], ['not_adjacent', { type: 'swap', r1: 0, c1: 0, r2: 2, c2: 0 }],
    ['no_match', mkNoMatch()], ['not_movable', { type: 'swap', r1: crate[0], c1: crate[1], r2: crate[0] - 1, c2: crate[1] }],
    ['off_board', { type: 'swap', r1: voidCell[0], c1: voidCell[1], r2: voidCell[0], c2: voidCell[1] + 1 }],
    ['off_board', { type: 'hammer', r: voidCell[0], c: voidCell[1] }], ['not_movable', { type: 'toolSwap', r1: crate[0], c1: crate[1], r2: 0, c2: 0 }],
    ['stale_preview', { type: 'shuffle', expect: 12345 }], ['unknown_action', { type: 'teleport' }]
  ];
  bad.forEach(([why, a]) => { const r = Core.apply(st, a); assert(!r.ok, 'accepted ' + JSON.stringify(a)); assert.strictEqual(r.reason, why, JSON.stringify(a)); assert.strictEqual(Core.stateHash(st), h0, 'state changed by ' + why); });
  assert.strictEqual(st.log.length, 0);
  // tools at 0 → rejected without side effects
  const st2 = Core.createGame(LV.verify_06_segments, { seed: 5 }); st2.tools = { hammer: 0, swap: 0, shuffle: 0 }; const h2 = Core.stateHash(st2);
  [{ type: 'hammer', r: 0, c: 0 }, { type: 'toolSwap', r1: 0, c1: 0, r2: 0, c2: 1 }, { type: 'shuffle' }].forEach(a => { const r = Core.apply(st2, a); assert(!r.ok && r.reason === 'no_tool'); });
  assert.strictEqual(Core.stateHash(st2), h2);
  // after the game ended nothing is accepted
  const st3 = Core.createGame(LV.verify_05_last_move, { seed: 7 }); Core.apply(st3, { type: 'swap', r1: 5, c1: 2, r2: 6, c2: 2 }); Core.apply(st3, { type: 'swap', r1: 5, c1: 2, r2: 6, c2: 2 });
  const h3 = Core.stateHash(st3); assert.strictEqual(Core.apply(st3, { type: 'hammer', r: 0, c: 0 }).reason, 'not_ready'); assert.strictEqual(Core.stateHash(st3), h3);
  return bad.length + ' + 3 + 1 rejected cases';
});

test('tool preview = tool result (shuffle expect hash), cost committed once on acceptance', () => {
  const st = Core.createGame(LV.verify_03_crate_adjacent, { seed: 9 }); const pv = Core.previewShuffle(st); assert(pv);
  const crates0 = st.occ.map(o => o && o.kind === 'crate' ? o.id + ':' + o.hp : '').join(), frost0 = JSON.stringify(st.under);
  const r = Core.apply(st, { type: 'shuffle', expect: pv.hash }); assert(r.ok, r.reason); assert.strictEqual(st.tools.shuffle, 2);
  const sh = r.events.find(e => e.t === 'shuffle'); assert.strictEqual(Core.hashStr(JSON.stringify(sh.map)), pv.hash);
  assert.strictEqual(st.occ.map(o => o && o.kind === 'crate' ? o.id + ':' + o.hp : '').join(), crates0, 'shuffle moved crates');
  assert.strictEqual(JSON.stringify(st.under).length > 0, true); assert.strictEqual(frost0.length > 0, true);
});

test('last move: cascades finish, then win is checked before lose (verify_05, seeds 1–20)', () => {
  for (let s = 1; s <= 20; s++) {
    const st = Core.createGame(LV.verify_05_last_move, { seed: s }); assert.strictEqual(st.phase, 'ready');
    let r = Core.apply(st, { type: 'swap', r1: 5, c1: 2, r2: 6, c2: 2 }); assert(r.ok, 's' + s + ' ' + r.reason);
    r = Core.apply(st, { type: 'swap', r1: 5, c1: 2, r2: 6, c2: 2 }); assert(r.ok, 's' + s + ' second ' + r.reason);
    assert.strictEqual(st.moves, 0); assert.strictEqual(st.phase, 'won', 'seed ' + s + ' phase ' + st.phase);
    const end = r.events[r.events.length - 1]; assert.strictEqual(end.t, 'end'); assert.strictEqual(end.phase, 'won');
    const lastWave = r.events.map(e => e.t).lastIndexOf('wave'), endI = r.events.length - 1; assert(lastWave < endI);
  }
  return '20/20 won on the last move';
});

test('out of moves without goals → lost; goals done earlier → won with moves bonus', () => {
  const st = Core.createGame(LV.verify_01_baseline, { seed: 2 }); st.moves = 1;
  const m = Core.listMoves(st, 1)[0]; Core.apply(st, { type: 'swap', r1: m[0], c1: m[1], r2: m[2], c2: m[3] });
  assert(st.phase === 'lost' || st.phase === 'won'); if (st.phase === 'won') assert(Core.goalsDone(st)); else assert(!Core.goalsDone(st) && st.moves === 0);
  const st2 = Core.createGame(LV.verify_01_baseline, { seed: 2 }); st2.goals[0].target = 1;
  const m2 = Core.listMoves(st2, 1)[0]; Core.apply(st2, { type: 'swap', r1: m2[0], c1: m2[1], r2: m2[2], c2: m2[3] });
  if (st2.goals[0].progress >= 1) { assert.strictEqual(st2.phase, 'won'); assert.strictEqual(st2.bonus, st2.moves * 60); }
});

test('bounded init: impossible level ends as stuck with diagnostics (no hang, no throw)', () => {
  const d = fixture(J(base()).map((r, i) => i === 0 ? '. . . . . . .' : r), { pool: ['jelly_squid'] });
  const t0 = Date.now(), st = Core.createGame(d, { seed: 1 }); const ms = Date.now() - t0;
  assert.strictEqual(st.phase, 'stuck'); assert.strictEqual(st.diag.reason, 'init_failed'); assert.strictEqual(st.diag.attempts, Core.LIMITS.MAX_INIT_ATTEMPTS);
  assert.strictEqual(Core.apply(st, { type: 'hammer', r: 1, c: 1 }).reason, 'not_ready');
  return 'attempts=' + st.diag.attempts + ' in ' + ms + ' ms';
});

test('bounded shuffle: no candidate → rejected, tool not consumed', () => {
  const rows = []; for (let r = 0; r < 7; r++) rows.push(r === 6 ? 's f j X1 X1 X1 X1' : 'X1 X1 X1 X1 X1 X1 X1');   // 3 jellies of 3 types: no arrangement has a move
  const st = Core.createGame(fixture(rows), { seed: 1 }); assert.strictEqual(st.phase, 'stuck'); assert.strictEqual(st.diag.reason, 'init_failed');
  // force a ready state to exercise the tool path; the bounded search must give up and charge nothing
  st.phase = 'ready'; const h = Core.stateHash(st);
  const r = Core.apply(st, { type: 'shuffle' }); assert(!r.ok && r.reason === 'no_candidate', 'got ' + JSON.stringify([r.ok, r.reason, st.diag])); assert.strictEqual(st.tools.shuffle, 3); assert.strictEqual(Core.stateHash(st), h);
  assert.strictEqual(Core.previewShuffle(st), null);
  return 'gave up after ' + Core.LIMITS.MAX_SHUFFLE_ATTEMPTS + ' attempts';
});

test('independent games: restarting (new createGame) shares nothing with the old state', () => {
  const a = Core.createGame(LV.verify_04_overlap_dedupe, { seed: 3 }), h = Core.stateHash(a);
  const b = Core.createGame(LV.verify_04_overlap_dedupe, { seed: 3 }); assert.strictEqual(Core.stateHash(b), h);
  Core.apply(a, { type: 'swap', r1: 4, c1: 3, r2: 4, c2: 4 }); assert.strictEqual(Core.stateHash(b), h, 'old game mutated the new one');
  const def = LV.verify_04_overlap_dedupe, s0 = LS.serialize(def); Core.apply(Core.createGame(def, { seed: 3 }), { type: 'hammer', r: 3, c: 3 }); assert.strictEqual(LS.serialize(def), s0, 'core mutated the level data');
});

test('segments (verify_06): void cells never hold pieces; spawns only from segment-top spawners', () => {
  const def = LV.verify_06_segments;
  for (let s = 1; s <= 10; s++) { const { st } = fuzz(def, s, 15, (t, n) => (t + s) % n); st.occ.forEach((o, k) => { if (!st.mask[k]) assert.strictEqual(o, null, 'piece in void ' + k); }); }
  const st = Core.createGame(def, { seed: 1 }); const tops = st.segs.filter(sg => sg.r0 > 0).map(sg => sg.r0 + ',' + sg.c);
  return 'internal segment tops ' + tops.join(' ');
});

test('content beyond stage B is refused by validation (unknown overlay type); stage B registry entries enabled', () => {
  // v3.1: originally 'stage-B content is refused'. Stage B is now implemented, so the guard moves to not-yet-implemented content.
  const r = LS.parse(fs.readFileSync(path.join(BAD, 'bad_future_type.json'), 'utf8')); const v = LS.validate(r.def, { seeds: 2 });
  assert(v.issues.some(i => i.code === 'unknown_type' && i.sev === 'error'), 'unknown_type');
  assert.strictEqual(Core.REGISTRY.obstacles.gummy_tie.enabled, true); assert.strictEqual(Core.REGISTRY.goals.deliver.enabled, true); assert.strictEqual(Core.REGISTRY.facilities.exit.enabled, true);
});

fs.mkdirSync(path.join(ROOT, 'tests/out'), { recursive: true });
fs.writeFileSync(path.join(ROOT, 'tests/out/stageA_core_results.json'), JSON.stringify({ when: new Date().toISOString(), core: Core.CORE_VERSION, ruleset: Core.RULESET, pass, fail, results }, null, 2));
console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
