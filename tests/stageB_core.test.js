// Stage B headless rule tests — run: node tests/stageB_core.test.js   (no deps; exits 1 on any failure)
// Same js/rules_core.js + js/level_schema.js that the game, the editor playtest and tools/make_levels.js load.
'use strict';
const fs = require('fs'), path = require('path'), assert = require('assert');
const ROOT = path.join(__dirname, '..');
const Core = require(path.join(ROOT, 'js/rules_core.js')), LS = require(path.join(ROOT, 'js/level_schema.js'));
const SRC = path.join(ROOT, 'levels/src');
const LV = {}; fs.readdirSync(SRC).filter(f => f.endsWith('.json')).forEach(f => { const r = LS.parse(fs.readFileSync(path.join(SRC, f), 'utf8')); LV[r.def.levelId] = r.def; });

let pass = 0, fail = 0; const results = [];
function test(name, fn) {
  try { const info = fn(); pass++; results.push({ name, ok: true, info: info || '' }); console.log('PASS', name, info ? '— ' + info : ''); }
  catch (e) { fail++; results.push({ name, ok: false, info: e.message }); console.log('FAIL', name, '—', e.message, e.stack.split('\n')[1]); }
}
// ---------------------------------------------------------------- fixture builder (stage A tokens + stage B)
// cell token: [~1|~2 prefix = frosting] then  s f j o b g (+ '-' h, '|' v, '*' bomb) | R rainbow | X1..X3 crate | K basket | . seeded | # void
//             suffix '^' = gummy tie, '!' = exit
const CODE = { s: 'jelly_squid', f: 'jelly_fugu', j: 'jelly_jellyfish', o: 'jelly_octopus', b: 'jelly_bear', g: 'jelly_fig' };
const SPC = { '-': 'h', '|': 'v', '*': 'bomb' };
function fixture(rows, o = {}) {
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
  def.board.playableMask = mask; def.board.spawners = LS.autoSpawners(def); def.board.exits = exits;
  def.initial.placements = place; def.moveLimit = o.moves || 20;
  def.spawnPool = (o.pool || ['jelly_squid', 'jelly_fugu', 'jelly_jellyfish', 'jelly_bear', 'jelly_fig']).map(t => ({ typeId: t, weight: 1 }));
  def.goals = o.goals || [{ type: 'collect_piece', typeId: 'jelly_octopus', count: 99 }];
  if (o.tools) def.tools = o.tools;
  return LS.canonical(def);
}
const P5 = ['s', 'f', 'j', 'b', 'g'];
function base() {   // fixed, match-free pattern + guaranteed octopus move (0,2)↔(1,2)
  const rows = []; for (let r = 0; r < 7; r++) { const t = []; for (let c = 0; c < 7; c++) t.push(P5[(r + 2 * c) % 5]); rows.push(t); }
  rows[0][0] = 'o'; rows[0][1] = 'o'; rows[1][2] = 'o'; return rows;
}
const J = rows => rows.map(r => r.join(' '));
const at = (st, r, c) => st.occ[r * st.C + c], tieAt = (st, r, c) => st.over[r * st.C + c];
const waves = evs => evs.filter(e => e.t === 'wave');
const sw = (r1, c1, r2, c2) => ({ type: 'swap', r1, c1, r2, c2 });
const game = (rows, o, seed) => Core.createGame(fixture(rows, o), { seed: seed || 1 });
const noCost = (st, a, why) => { const h = Core.stateHash(st), r = Core.apply(st, a); assert(!r.ok, 'accepted ' + JSON.stringify(a)); assert.strictEqual(r.reason, why, JSON.stringify(a) + ' reason ' + r.reason); assert.strictEqual(Core.stateHash(st), h, why + ' changed state'); return r; };

// ================================================================ ties (spec 4, 17.6, 17.7)
test('17.6 tie host: cannot swap / tool-swap / fall / be shuffled; refused actions cost nothing', () => {
  const b = base(); b[3][3] = b[3][3] + '^';   // tie on a fixed jelly in the middle
  const st = game(J(b), { tools: { hammer: 3, swap: 3, shuffle: 3 } }); assert(tieAt(st, 3, 3), 'tie placed');
  noCost(st, sw(3, 3, 3, 4), 'not_movable'); noCost(st, sw(2, 3, 3, 3), 'not_movable');
  noCost(st, { type: 'toolSwap', r1: 3, c1: 3, r2: 3, c2: 4 }, 'not_movable');
  assert(!Core.listMoves(st).some(m => (m[0] === 3 && m[1] === 3) || (m[2] === 3 && m[3] === 3)), 'listMoves offers the tied host');
  // shuffle: host keeps its id + cell; tie untouched
  const id = at(st, 3, 3).id, r = Core.apply(st, { type: 'shuffle' }); assert(r.ok, r.reason);
  assert.strictEqual(at(st, 3, 3) && at(st, 3, 3).id, id, 'tied host moved by shuffle'); assert(tieAt(st, 3, 3));
  assert(!r.events.find(e => e.t === 'shuffle').map.some(m => m.id === id), 'tied host in the shuffle map');
  // gravity: clear the cell below the host with the hammer → host stays, hole below it is NOT refilled (cut off, temporary)
  const st2 = game(J(b), {}); const hid = at(st2, 3, 3).id;
  const r2 = Core.apply(st2, { type: 'hammer', r: 4, c: 3 }); assert(r2.ok);
  assert.strictEqual(at(st2, 3, 3).id, hid, 'tied host fell'); assert.strictEqual(at(st2, 4, 3), null, 'cell under a tie host was refilled through it');
  return 'host id ' + id + ' stayed; (4,3) left empty under the tie';
});
test('17.6 host matches in place → tie released; an adjacent match does not release a tie', () => {
  const st = Core.createGame(LV.vb_01_ties, { seed: 3 });
  const r = Core.apply(st, sw(2, 2, 3, 2)); assert(r.ok, r.reason);
  const w = waves(r.events)[0];
  assert.deepStrictEqual(w.ties.map(t => [t.r, t.c, t.src]), [[3, 1, 'host_matched']]);
  assert(w.removed.some(x => x.r === 3 && x.c === 1), 'host consumed in the same wave (tie absorbs nothing)');
  assert(tieAt(st, 4, 1) && tieAt(st, 4, 2), 'adjacent ties (4,1)(4,2) must stay');
  assert.strictEqual(st.goals[0].progress, 1);
  return 'goal ' + st.goals[0].progress + '/' + st.goals[0].target;
});
test('17.7 frosting + jelly + tie on one cell: three layers settle separately, counted once each', () => {
  const st = Core.createGame(LV.vb_05_layers, { seed: 2 });
  const r = Core.apply(st, sw(1, 0, 2, 0)); assert(r.ok, r.reason); const w = waves(r.events)[0];
  assert.deepStrictEqual(w.ties.map(t => [t.r, t.c]), [[2, 2]]);
  assert.deepStrictEqual(w.frost.filter(f => f.r === 2 && f.c === 2).map(f => [f.l0, f.l1]), [[2, 1]], 'frost 2→1 exactly once');
  assert.strictEqual(w.removed.filter(x => x.r === 2 && x.c === 2).length, 1, 'jelly removed once');
  assert.deepStrictEqual(w.crates.map(c => [c.r, c.c, c.hp1]), [[2, 3, 0]], 'adjacent crate −1');
  assert.strictEqual(st.goals[0].progress, 0, 'frost goal not counted yet (1 layer left)'); assert.strictEqual(st.goals[1].progress, 1, 'tie goal +1');
  // second hit on the same cell (now untied) clears the last frosting layer → frost goal +1
  const r2 = Core.apply(st, { type: 'hammer', r: 2, c: 2 }); assert(r2.ok); assert.strictEqual(st.goals[0].progress, 1);
});
test('hammer on a tie host: tie released + host consumed (no extra hit needed); tied special hit by an attack fires once', () => {
  const b = base(); b[3][3] = 'b-^'; b[5][5] = b[5][5] + '^';
  const st = game(J(b), {}); const r = Core.apply(st, { type: 'hammer', r: 3, c: 3 }); assert(r.ok);
  const w = waves(r.events)[0];
  assert.deepStrictEqual(w.ties.map(t => [t.r, t.c, t.src]), [[3, 3, 'direct_attack']]);
  assert.strictEqual(w.fx.filter(f => f.kind === 'beam').length, 1, 'tied stripe fired once');
  assert(w.removed.filter(x => x.r === 3).length === 7, 'row 3 cleared by the stripe');
  assert(tieAt(st, 5, 5), 'unrelated tie untouched');
});
test('tie as clear_obstacle goal: frozen at start, count/all both work; ties never left without a host (fuzz)', () => {
  let checked = 0;
  for (const id of ['vb_01_ties', 'b_tie_intro', 'vb_05_layers', 'vb_03_rainbow_ties']) for (let s = 1; s <= 10; s++) {
    const st = Core.createGame(LV[id], { seed: s }); const tg = st.goals.find(g => g.typeId === 'gummy_tie'); const total = tg.target;
    for (let t = 0; t < 25 && st.phase === 'ready'; t++) {
      const mv = Core.listMoves(st); if (!mv.length) break; const m = mv[(t * 7 + s) % mv.length];
      const hosts = {}; st.over.forEach((o, k) => { if (o) hosts[k] = st.occ[k].id; });
      const r = Core.apply(st, sw(m[0], m[1], m[2], m[3])); assert(r.ok, r.reason);
      st.over.forEach((o, k) => { if (o) { assert(st.occ[k], 'tie without host at ' + k); assert.strictEqual(st.occ[k].id, hosts[k], 'tie host changed/moved at ' + k); } });
      const alive = st.over.filter(o => o && tg.ids[o.id]).length; assert.strictEqual(tg.progress, total - alive, 'tie goal drift'); assert.strictEqual(tg.target, total, 'target not frozen');
      checked++;
    }
  }
  return checked + ' turns checked';
});

// ================================================================ delivery (spec 6.1, 17.10, 17.13, 17.25)
test('17.25 several baskets in one action: gravity → deliver → gravity … stable before the next match scan; each counted once', () => {
  const st = Core.createGame(LV.vb_02_delivery, { seed: 4 });
  const r = Core.apply(st, sw(6, 2, 6, 3)); assert(r.ok, r.reason);
  const seq = r.events.map(e => e.t).join(',');
  assert(/^swap,wave,fall,deliver,fall,deliver,fall/.test(seq), 'order ' + seq);
  const dv = r.events.filter(e => e.t === 'deliver'); assert.deepStrictEqual(dv.map(d => d.items.length), [1, 1]);
  assert.strictEqual(new Set(dv.flatMap(d => d.items.map(i => i.id))).size, 2, 'unique ids');
  assert.strictEqual(st.goals[0].progress, 2); assert.strictEqual(st.delivered, 2);
  // a wave after the deliveries (if any) only follows a fall: deliveries are never interleaved with a wave
  for (let i = 1; i < r.events.length; i++) if (r.events[i].t === 'wave' && r.events[i - 1].t !== 'swap') assert.strictEqual(r.events[i - 1].t, 'fall');
  return seq;
});
test('17.10 baskets are immune: hammer on a basket-only cell is refused (no tool spent); full-board attack cannot deliver', () => {
  const st = Core.createGame(LV.vb_05_layers, { seed: 1 }); noCost(st, { type: 'hammer', r: 0, c: 5 }, 'immune'); assert.strictEqual(st.tools.hammer, 3);
  // basket on frosting: the hammer is valid (hits the frosting), basket survives, nothing delivered
  const st2 = Core.createGame(LV.vb_02_delivery, { seed: 1 }); const bid = at(st2, 3, 5).id;
  const r = Core.apply(st2, { type: 'hammer', r: 3, c: 5 }); assert(r.ok, r.reason); assert.strictEqual(st2.tools.hammer, 2);
  const w = waves(r.events)[0]; assert.deepStrictEqual(w.frost.map(f => [f.r, f.c, f.l1]), [[3, 5, 0]]); assert.strictEqual(w.removed.length, 0);
  assert.strictEqual(at(st2, 3, 5).id, bid); assert.strictEqual(st2.goals[0].progress, 0);
  // rainbow + rainbow: basket stays (blocked by a crate), never counted
  const st3 = Core.createGame(LV.vb_06_board_attack, { seed: 1 }); const r3 = Core.apply(st3, sw(3, 2, 3, 3)); assert(r3.ok);
  assert(at(st3, 4, 6) && at(st3, 4, 6).kind === 'basket'); assert(!r3.events.some(e => e.t === 'deliver')); assert.strictEqual(st3.delivered, 0);
});
test('basket falls with gravity and passes frosting without clearing it; not matchable, not swappable', () => {
  const b = base(); b[1][4] = 'K'; b[3][4] = '~1' + b[3][4]; b[6][4] = b[6][4] + '!';
  const st = game(J(b), { goals: [{ type: 'deliver', typeId: 'delivery_basket', scope: 'all' }] }); const kid = at(st, 1, 4).id;
  noCost(st, sw(1, 4, 1, 5), 'not_movable'); noCost(st, { type: 'toolSwap', r1: 1, c1: 4, r2: 1, c2: 5 }, 'not_movable');
  let fr = 0;
  for (const r of [2, 3, 4]) { const res = Core.apply(st, { type: 'hammer', r, c: 4 }); assert(res.ok, res.reason); if (r === 3) fr = waves(res.events)[0].frost.length; st.tools.hammer = 3; }
  // basket fell through (3,4) frosting area; the frost there was hit by the hammer only (1 layer → 0 by that one hit, not by the basket)
  assert.strictEqual(fr, 1);
  const st2 = game(J(b), { goals: [{ type: 'deliver', typeId: 'delivery_basket', scope: 'all' }] });
  Core.apply(st2, { type: 'hammer', r: 2, c: 4 });   // basket falls one cell: (1,4) → (2,4)
  assert.strictEqual(at(st2, 2, 4).id, kid); assert.strictEqual(st2.under[3 * 7 + 4].layers, 1, 'frosting untouched');
  Core.apply(st2, { type: 'hammer', r: 3, c: 4 });   // hammer kills the frost + jelly under → basket now ON the frost cell? (frost gone) → falls further
  assert(st2.goals[0].progress === 0);
});
test('17.13 last move: deliveries + cascades finish, then win is checked before lose', () => {
  const def = fixture(['s f j b g s f', 'j b g s f j b', 'b g s f j b g', 'g s f j K g s', 'f j b s g f j', 's f j b g j b', 'j b g g s! b s'],
    { moves: 1, goals: [{ type: 'deliver', typeId: 'delivery_basket', scope: 'all' }] });
  const v = LS.validate(def, { seeds: 3 }); assert.strictEqual(v.counts.error + v.counts.block, 0, JSON.stringify(v.issues));
  let won = 0;
  for (let s = 1; s <= 10; s++) {
    const st = Core.createGame(def, { seed: s });
    const r = Core.apply(st, sw(6, 3, 6, 4)); assert(r.ok, r.reason);   // column 4 rows 4–6 fig → basket (3,4) falls onto the exit (6,4)
    assert.strictEqual(st.moves, 0); assert(r.events.some(e => e.t === 'deliver'));
    if (st.phase === 'won') won++; else assert.fail('seed ' + s + ' phase ' + st.phase + ' ' + r.events.map(e => e.t).join(','));
  }
  return won + '/10 won on the last move (0 moves left)';
});
test('deliver goal scope=count; exits only at segment bottoms; basket segment without exit → B', () => {
  const b = base(); b[1][2] = 'K'; b[1][5] = 'K'; b[6][2] += '!'; b[6][5] += '!';
  const d = fixture(J(b), { goals: [{ type: 'deliver', typeId: 'delivery_basket', scope: 'count', count: 1 }] });
  const st = Core.createGame(d, { seed: 1 }); assert.strictEqual(st.goals[0].target, 1);
  const d2 = LS.deep(d); d2.goals[0].count = 3; assert(LS.validate(d2, { seeds: 1 }).issues.some(i => i.code === 'deliver_short' && i.cat === 'B'));
  const d3 = LS.deep(d); d3.board.exits = [{ row: 4, col: 2 }]; const v3 = LS.validate(d3, { seeds: 1 });
  assert(v3.issues.some(i => i.code === 'exit_not_bottom' && i.cat === 'A')); assert(v3.issues.some(i => i.code === 'basket_no_exit' && i.cat === 'B'));
  const d4 = LS.deep(d); d4.initial.placements.push({ layer: 'overlay', row: 1, col: 2, typeId: 'gummy_tie', layers: 1 }); assert(LS.validate(d4, { seeds: 1 }).issues.some(i => i.code === 'tie_host'));
});

// ================================================================ same-colour, anchors, combos (spec 7, 17.8, 17.9, 17.23, 17.24)
test('rainbow picks the swapped colour; tied ordinaries of that colour are valid targets (ties released); goal sets frozen', () => {
  const st = Core.createGame(LV.vb_03_rainbow_ties, { seed: 1 }); const fugus = st.occ.filter(o => o && o.type === 'jelly_fugu' && !o.sp).length;
  const tieTotal = st.goals[0].target; assert.strictEqual(tieTotal, 4);
  const r = Core.apply(st, sw(3, 3, 3, 4)); assert(r.ok, r.reason); const w = waves(r.events)[0];
  assert.strictEqual(w.ties.length, 4, 'all four tied fugus released'); assert(w.ties.every(t => t.src === 'direct_attack'));
  const zaps = w.fx.filter(f => f.kind === 'zap'); assert(zaps.every(z => z.type === 'jelly_fugu'));
  assert.strictEqual(zaps.length, fugus, 'every ordinary fugu + the tied fugu stripe targeted (' + zaps.length + ' vs ' + fugus + ')' );
  assert.strictEqual(w.fx.filter(f => f.kind === 'beam').length, 1, 'tied stripe fired exactly once');
  assert.strictEqual(st.goals[0].target, tieTotal);
  return zaps.length + ' targets, ties ' + st.goals[0].progress + '/' + tieTotal;
});
test('17.8 natural-cascade anchor on a tied + frosted cell next to a crate: tie released, one collect, frost −1, crate −1, special on the untied cell', () => {
  const st = Core.createGame(LV.vb_04_anchor, { seed: 1 });
  const r = Core.apply(st, sw(6, 0, 6, 1)); assert(r.ok); const w2 = waves(r.events)[1];
  assert.deepStrictEqual(w2.creations.map(c => [c.r, c.c, c.sp]), [[4, 2, 'v']]);
  assert.deepStrictEqual(w2.ties.map(t => [t.r, t.c]), [[4, 2]]);
  const anc = w2.removed.filter(x => x.anchor); assert.strictEqual(anc.length, 1); assert.deepStrictEqual([anc[0].r, anc[0].c], [4, 2]);
  assert.deepStrictEqual(w2.frost.map(f => [f.r, f.c, f.l1]), [[4, 2, 0]]); assert.deepStrictEqual(w2.crates.map(c => [c.r, c.c, c.hp1]), [[3, 2, 1]]);
  assert(!tieAt(st, 4, 2) && at(st, 4, 2).sp === 'v');
  assert.strictEqual(w2.collected.length, 4, 'four ordinaries (incl. anchor) collected once');
});
test('specials audit: 4-straight → stripe ⟂, L/T → bomb, 5-straight → rainbow (existing v2 rules reused)', () => {
  const B = r3 => ['s f j b g s f', 'j b b f j b g', 'b s g f b s j', r3, 'f j b j s g s', 's b j f g j b', 'j f s b f s g'];
  const one = (rows, want) => { const st = game(rows, {}); assert.strictEqual(st.phase, 'ready', JSON.stringify(st.diag)); const r = Core.apply(st, sw(2, 2, 3, 2)); assert(r.ok, r.reason); assert.deepStrictEqual(waves(r.events)[0].creations.map(c => [c.r, c.c, c.sp]), [want]); };
  one(B('g g s g j f b'), [3, 2, 'v']);          // 4 horizontal → vertical stripe (⟂ to the run, v2 convention)
  one(B('g g s g g f b'), [3, 2, 'rainbow']);    // 5 straight → rainbow
  one(['s f j b g s f', 'j b b f j b g', 'b s g f b s j', 'g g s j f f b', 'f j g j s g s', 's b g f g j b', 'j f s b f s g'], [3, 2, 'bomb']);   // L → bomb at the corner (swap end)
  return 'stripe / rainbow / bomb created at the swap end';
});
const COMBOS = [
  ['line+line', 'f-', 'b|', '十字消除!'], ['line+bomb', 'f-', 'b*', '超级十字!'], ['bomb+bomb', 'f*', 'b*', '超级爆炸!'],
  ['rainbow+line', 'R', 'b-', '超级组合!'], ['rainbow+bomb', 'R', 'b*', '超级组合!'], ['rainbow+rainbow', 'R', 'R', '彩虹风暴!']];
test('six pairwise combos (existing v2 rules reused): both sources consumed once, each product fires once, ties + crates + frost settle once', () => {
  const out = [];
  COMBOS.forEach(([name, a, bb, label]) => {
    const b = base(); b[3][3] = a; b[3][4] = bb; b[1][1] += '^'; b[5][5] = '~2' + b[5][5] + '^'; b[0][6] = 'X2';
    const st = game(J(b), {}); const nJ = st.occ.filter(o => o && o.kind === 'jelly').length; const r = Core.apply(st, sw(3, 3, 3, 4)); assert(r.ok, name + ' ' + r.reason);
    const w = waves(r.events)[0]; assert.strictEqual(w.combo, label, name);
    const ids = w.removed.map(x => x.id); assert.strictEqual(new Set(ids).size, ids.length, name + ' double removal');
    assert(w.crates.every(c => c.hp0 - c.hp1 === 1)); assert(w.frost.every(f => f.l0 - f.l1 === 1));
    assert(new Set(w.ties.map(t => t.id)).size === w.ties.length);
    const conv = w.removed.filter(x => x.conv); const beams = w.fx.filter(f => f.kind === 'beam').length, blasts = w.fx.filter(f => f.kind === 'blast').length;
    if (name === 'rainbow+line') assert.strictEqual(beams, conv.length, 'each converted product fires once (got ' + beams + ' beams for ' + conv.length + ')');
    if (name === 'rainbow+bomb') assert.strictEqual(blasts, conv.length, 'each converted bomb fires once');
    if (name === 'rainbow+rainbow') assert.strictEqual(w.removed.length, nJ, 'full-board attack removes every jelly');
    out.push(name + ':' + w.removed.length + 'rm/' + w.ties.length + 'tie/' + conv.length + 'conv');
  });
  return out.join(' ');
});
test('rainbow + special with no ordinary target of that colour → refused (no_target), nothing spent', () => {
  const rows = ['s j s j s j s', 'j s j s j s j', 's j s j s j s', 'j s R g- j s j', 's j s j s j s', 'j s j s j s j', 's j o o j s o'];
  rows[6] = 's j s j s o o'; rows[5] = 'j s j s j s j'; rows[4] = 's j s j s j o';   // octopus move (4,6)… keeps a legal move: (4,6)o (5,6)j (6,5)o (6,6)o
  const def = fixture(['s j s j s j s', 'j s j s j s j', 's j s j s j s', 'j s R g- j s j', 's j s j s j s', 'j s j s j s o', 's j s j o o j'], { pool: ['jelly_squid', 'jelly_jellyfish', 'jelly_octopus'] });
  const st = Core.createGame(def, { seed: 1 }); assert.strictEqual(st.phase, 'ready', 'fixture init ' + JSON.stringify(st.diag));
  noCost(st, sw(3, 2, 3, 3), 'no_target');
  assert(!Core.listMoves(st).some(m => m[0] === 3 && m[1] === 2 && m[2] === 3 && m[3] === 3), 'invalid combo listed as a legal move');
  return 'refused, moves ' + st.moves;
});
test('17.23 conversion overlapping other attacks: originals collected once, products fire once; passive rainbow colour by fixed order', () => {
  // rainbow + v stripe; a passive rainbow sits in a converted column, so it is triggered by a converted product's beam
  const b = base(); b[3][3] = 'R'; b[3][4] = 'f|'; b[6][0] = 'R'; b[2][0] = '~2s';
  const st = game(J(b), {}); const r = Core.apply(st, sw(3, 3, 3, 4)); assert(r.ok, r.reason); const w = waves(r.events)[0];
  const conv = w.removed.filter(x => x.conv), beams = w.fx.filter(f => f.kind === 'beam');
  assert(conv.length > 0); assert.strictEqual(beams.length, conv.length, 'beams ' + beams.length + ' ≠ products ' + conv.length);
  assert.strictEqual(new Set(w.collected).size, w.collected.length);
  const ords = w.removed.filter(x => !x.sp); assert.strictEqual(w.collected.length, ords.length, 'collected = ordinary removals');
  // same ruleset + seed + action twice → identical events (selection independent of iteration order)
  const st2 = game(J(b), {}); const r2 = Core.apply(st2, sw(3, 3, 3, 4)); assert.strictEqual(Core.eventsHash(r2.events), Core.eventsHash(r.events));
  return conv.length + ' products, ' + w.fx.filter(f => f.kind === 'rainbow').length + ' rainbow bursts';
});
test('17.24 same-colour use: source cell frosting is hit; overlapping source + range damage once', () => {
  const b = base(); b[3][3] = '~2R'; b[3][4] = '~2f'; b[3][5] = '~1' + b[3][5];
  const st = game(J(b), {}); const r = Core.apply(st, sw(3, 3, 3, 4)); assert(r.ok); const w = waves(r.events)[0];
  const f33 = w.frost.filter(f => f.r === 3 && f.c === 3), f34 = w.frost.filter(f => f.r === 3 && f.c === 4);
  assert.strictEqual(f33.length, 1); assert.strictEqual(f33[0].l1, 1); assert.strictEqual(f34.length, 1); assert.strictEqual(f34[0].l1, 1);
});
test('full-board attack (rainbow + rainbow): every valid cell hit once — ordinaries gone, 2HP → 1, 2 layers → 1, ties released, basket kept', () => {
  const st = Core.createGame(LV.vb_06_board_attack, { seed: 2 }); const r = Core.apply(st, sw(3, 2, 3, 3)); const w = waves(r.events)[0];
  assert.strictEqual(w.combo, '彩虹风暴!');
  assert.deepStrictEqual(w.crates.map(c => c.hp1), [1, 1, 1]); assert.deepStrictEqual(w.frost.map(f => f.l1).sort(), [1, 1]);
  assert.strictEqual(w.ties.length, 2); assert.strictEqual(st.goals[0].progress, 0); assert.strictEqual(st.goals[1].progress, 0);
  const jel = 49 - 3 - 1; assert.strictEqual(w.removed.length, jel, 'all ' + jel + ' jellies removed');
});
test('17.9 new special from an ordinary match is not fired by its own wave (stage B levels too)', () => {
  const st = Core.createGame(LV.vb_04_anchor, { seed: 1 }); const r = Core.apply(st, sw(6, 0, 6, 1)); const w = waves(r.events)[1];
  assert.strictEqual(w.fx.filter(f => f.kind === 'beam').length, 0, 'the new stripe fired in its creation wave');
});

// ================================================================ determinism, fuzz invariants, validation
test('17.15 determinism: stage B levels replay to identical state + event hashes; different seed differs', () => {
  const out = [];
  for (const id of ['vb_01_ties', 'vb_02_delivery', 'vb_05_layers', 'b_tie_intro', 'b_deliver_intro']) {
    const st = Core.createGame(LV[id], { seed: 42 }), acts = [];
    for (let t = 0; t < 15 && st.phase === 'ready'; t++) { const mv = Core.listMoves(st); const m = mv[(t * 5) % mv.length]; const a = sw(m[0], m[1], m[2], m[3]); Core.apply(st, a); acts.push(a); }
    if (st.tools.hammer > 0 && st.phase === 'ready') { const a = { type: 'hammer', r: 6, c: 0 }; if (Core.apply(st, a).ok) acts.push(a); }
    const a1 = Core.replay(LV[id], 42, acts), a2 = Core.replay(LV[id], 42, acts);
    assert.strictEqual(a1.hash, Core.stateHash(st)); assert.strictEqual(a1.hash, a2.hash); assert.strictEqual(a1.eventsHash, a2.eventsHash);
    assert.notStrictEqual(Core.replay(LV[id], 43, acts).hash, a1.hash);
    out.push(id + '=' + a1.hash);
  }
  return out.join(' ');
});
test('fuzz stage B levels × 12 seeds × 25 turns (+ hammers): tie hosts never move, baskets only leave via exits, goals = instances gone', () => {
  let turns = 0, deliveries = 0, ties = 0;
  const ids = Object.keys(LV).filter(id => /^(vb_|b_)/.test(id));
  for (const id of ids) for (let s = 1; s <= 12; s++) {
    const st = Core.createGame(LV[id], { seed: s }), C = st.C;
    const baskets0 = st.occ.filter(o => o && o.kind === 'basket').length;
    for (let t = 0; t < 25 && st.phase === 'ready'; t++) {
      const hosts = {}; st.over.forEach((o, k) => { if (o) hosts[k] = st.occ[k].id; });
      let a; if (t % 6 === 5 && st.tools.hammer > 0) { const k = (t * 13 + s * 7) % 49; a = { type: 'hammer', r: Math.floor(k / 7), c: k % 7 }; }
      else { const mv = Core.listMoves(st); if (!mv.length) break; const m = mv[(t * 3 + s * 11) % mv.length]; a = sw(m[0], m[1], m[2], m[3]); }
      const r = Core.apply(st, a); if (!r.ok) { assert(a.type === 'hammer', 'listed move refused ' + r.reason); continue; }
      turns++;
      for (const e of r.events) {
        if (e.t === 'wave') { ties += e.ties.length; e.ties.forEach(t => assert(t.dedup >= 0, 'negative dedup')); assert(!e.removed.some(x => x.type === 'delivery_basket'), 'basket removed by a wave'); }
        if (e.t === 'deliver') { deliveries += e.items.length; e.items.forEach(i => assert(st.exits[i.r * C + i.c], 'delivered off-exit')); }
        if (e.t === 'fall') e.moves.forEach(m => { const k = m.r0 * C + m.c; assert(!(k in hosts) || hosts[k] !== m.id, 'tie host fell'); });
      }
      st.over.forEach((o, k) => { if (o) assert(st.occ[k], 'orphan tie'); });
      const bNow = st.occ.filter(o => o && o.kind === 'basket').length; assert.strictEqual(baskets0 - bNow, st.delivered, 'basket count drift');
      st.goals.forEach(g => {
        if (g.type === 'deliver') assert.strictEqual(g.progress, Object.keys(g.ids).filter(i => !st.occ.some(o => o && o.id === +i)).length);
        if (g.typeId === 'gummy_tie') assert.strictEqual(g.progress, Object.keys(g.ids).filter(i => !st.over.some(o => o && o.id === +i)).length);
      });
    }
  }
  return ids.length + ' levels, ' + turns + ' turns, ' + deliveries + ' deliveries, ' + ties + ' ties released';
});
test('stage B verification + sample levels validate (0 A / 0 B); invalid stage B samples caught as A/B', () => {
  const ids = Object.keys(LV).filter(id => /^(vb_|b_)/.test(id));
  ids.forEach(id => { const v = LS.validate(LV[id]); assert.strictEqual(v.counts.error + v.counts.block, 0, id + ' ' + JSON.stringify(v.issues.filter(i => i.sev !== 'warn'))); assert.strictEqual(v.sim.initOk, 20, id); });
  const fx = ids.filter(id => LV[id].editorNotes && LV[id].editorNotes.ruleTestFixture); assert.deepStrictEqual(fx.sort(), ['vb_03_rainbow_ties', 'vb_06_board_attack']);
  return ids.length + ' levels; rule-test fixtures: ' + fx.join(', ');
});
test('stage A + B rule results unchanged (stage C: full state hashes now include the jelly_score_v1 ledger, so rules are compared with score stripped)', () => {
  // v3.0.0-stageA / v3.1.0-stageB full hashes (d1172126 …) contained the old ad-hoc score; C0 replaced the score, not the rules.
  const ref = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures/rules_ref_v3.1.0-stageB.json'), 'utf8')).hashes, now = require('./rules_ref.js')(ROOT);
  let n = 0; Object.keys(ref).forEach(id => ref[id].forEach((h, i) => { assert.strictEqual(now[id][i], h, id + ' #' + i); n++; }));
  return n + ' stage A/B scenarios: rule hashes identical to v3.1.0-stageB';
});

fs.mkdirSync(path.join(ROOT, 'tests/out'), { recursive: true });
fs.writeFileSync(path.join(ROOT, 'tests/out/stageB_core_results.json'), JSON.stringify({ when: new Date().toISOString(), core: Core.CORE_VERSION, ruleset: Core.RULESET, pass, fail, results }, null, 2));
console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
