// Rule-continuity reference: replays a fixed scenario set and hashes only RULE results (board, HP, layers, ties, baskets,
// goals, moves, tools, phase, RNG positions, ids, event logic) — every score field is stripped. Used to prove the
// stage C ScoreService did not change any gameplay rule. usage: node tests/rules_ref.js <gameDir> [out.json]
'use strict';
const fs = require('fs'), path = require('path');
function run(dir) {
  const Core = require(path.join(dir, 'js/rules_core.js')), LS = require(path.join(dir, 'js/level_schema.js'));
  const SRC = path.join(dir, 'levels/src'), LV = {};
  fs.readdirSync(SRC).filter(f => f.endsWith('.json')).forEach(f => { const r = LS.parse(fs.readFileSync(path.join(SRC, f), 'utf8')); LV[r.def.levelId] = r.def; });
  const DROP = { points: 1, score: 1, sc: 1, scoring: 1, bonus: 1, final: 1, action: 1, skill: 1 };
  const strip = o => JSON.parse(JSON.stringify(o, (k, v) => DROP[k] ? undefined : v));
  const rh = st => Core.hashStr(JSON.stringify({ v: Core.view(st), m: st.moves, t: st.tools, g: st.goals.map(g => [g.progress, g.target]), p: st.phase,
    r: [st.rng.fill.s, st.rng.refill.s, st.rng.shuffle.s], n: st.nextId, d: st.delivered })).toString(16);
  const ids = ['verify_01_baseline', 'verify_02_double_frosting', 'verify_03_crate_adjacent', 'verify_04_overlap_dedupe', 'verify_05_last_move', 'verify_06_segments',
    'legacy_01', 'legacy_02', 'legacy_03', 'vb_01_ties', 'vb_02_delivery', 'vb_03_rainbow_ties', 'vb_04_anchor', 'vb_05_layers', 'vb_06_board_attack', 'b_tie_intro', 'b_deliver_intro'];
  const out = {};
  for (const id of ids) {
    if (!LV[id]) continue;
    const per = [];
    for (let s = 1; s <= 6; s++) {
      const st = Core.createGame(LV[id], { seed: s }), evs = [];
      for (let t = 0; t < 30 && st.phase === 'ready'; t++) {
        let a;
        if (t % 7 === 6 && st.tools.hammer > 0) { const k = (t * 13 + s * 5) % 49; a = { type: 'hammer', r: Math.floor(k / 7), c: k % 7 }; }
        else { const mv = Core.listMoves(st); if (!mv.length) break; const m = mv[(t * 5 + s * 3) % mv.length]; a = { type: 'swap', r1: m[0], c1: m[1], r2: m[2], c2: m[3] }; }
        const r = Core.apply(st, a); evs.push([r.ok, r.reason || null, strip(r.events)]);
      }
      per.push(rh(st) + ':' + Core.hashStr(JSON.stringify(evs)).toString(16));
    }
    out[id] = per;
  }
  return out;
}
module.exports = run;
if (require.main === module) {
  const res = run(path.resolve(process.argv[2] || path.join(__dirname, '..')));
  if (process.argv[3]) fs.writeFileSync(process.argv[3], JSON.stringify({ source: process.argv[2], when: new Date().toISOString(), hashes: res }, null, 1));
  else console.log(JSON.stringify(res, null, 1));
}
