// Stage C: progress store v2 (save / load / migration / personal bests / challenge records)
'use strict';
const P = require('../js/progress_store.js');
const results = []; function test(n, f) { try { const info = f(); results.push({ n, ok: true }); console.log('PASS ' + n + (info ? ' — ' + info : '')); } catch (e) { results.push({ n, ok: false, e: e.message }); console.log('FAIL ' + n + ' — ' + e.message); } }
function eq(a, b, m) { if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error((m || '') + ' ' + JSON.stringify(a) + ' !== ' + JSON.stringify(b)); }
function mem(init) { const s = Object.assign({}, init || {}); return { getItem: k => (k in s ? s[k] : null), setItem: (k, v) => { s[k] = String(v); }, removeItem: k => { delete s[k]; }, _s: s }; }
const run = (o) => Object.assign({ levelId: 'c1_01', contentRevision: 1, scoreVersion: 'jelly_score_v1', won: true, score: 10000, movesLeft: 5, stars: 2, maxCascade: 3, maxStreak: 2, assisted: false, seed: 1 }, o);
const V1 = JSON.stringify({ v: 1, cleared: { legacy_01: { cleared: true, best: { contentRevision: 1, movesLeft: 7, stars: 2 } }, legacy_02: { cleared: false } } });

test('fresh store when nothing saved', () => { const l = P.load(mem()); eq(l.source, 'fresh'); eq(l.writable, true); eq(l.state.v, 2); });
test('migration from jelly_m3_progress_v1: cleared kept, old stars/moves kept only as legacy, v1 never modified', () => {
  const m = mem({ jelly_m3_progress_v1: V1 }), l = P.load(m);
  eq(l.source, 'migrated_v1'); eq(l.state.levels.legacy_01.cleared, true); eq(l.state.levels.legacy_02, undefined);
  eq(l.state.levels.legacy_01.legacy.scoring, 'pre_C0'); eq(Object.keys(l.state.levels.legacy_01.records).length, 0);
  P.save(m, l); eq(m._s.jelly_m3_progress_v1, V1, 'v1 untouched');
  const l2 = P.load(m); eq(l2.source, 'v2'); eq(l2.state.levels.legacy_01.cleared, true);
  // the first new-version clear is a "first record", not a fake improvement over the old scale
  const o = P.recordLevel(l2.state, run({ levelId: 'legacy_01', score: 5 })); eq(o.isNewBest, true); eq(o.prevBest, null); eq(o.delta, null);
});
test('corrupt or newer v2 data is never overwritten (read-only session)', () => {
  const m = mem({ jelly_m3_progress_v2: '{oops' }), l = P.load(m); eq(l.writable, false); eq(l.reason, 'corrupt'); P.recordLevel(l.state, run()); eq(P.save(m, l), false); eq(m._s.jelly_m3_progress_v2, '{oops');
  const m2 = mem({ jelly_m3_progress_v2: JSON.stringify({ v: 3, levels: {}, challenges: {} }) }), l2 = P.load(m2); eq(l2.reason, 'newer_version'); eq(P.save(m2, l2), false);
});
test('save → load round trip', () => { const m = mem(), l = P.load(m); P.recordLevel(l.state, run()); P.save(m, l); const l2 = P.load(m); eq(l2.state, l.state); });
test('personal best: only clears count; higher score wins, equal score → more moves left; delta reported', () => {
  const st = P.fresh();
  let o = P.recordLevel(st, run({ won: false, score: 99999 })); eq([o.cleared, o.isNewBest], [false, false]);
  o = P.recordLevel(st, run({ score: 10000 })); eq([o.firstClear, o.isNewBest, o.delta], [true, true, null]);
  o = P.recordLevel(st, run({ score: 9000 })); eq([o.isNewBest, o.prevBest.score], [false, 10000]);
  o = P.recordLevel(st, run({ score: 10000, movesLeft: 6 })); eq([o.isNewBest, o.delta], [true, 0]);
  o = P.recordLevel(st, run({ score: 12500 })); eq([o.isNewBest, o.delta], [true, 2500]);
  const v = P.levelView(st, 'c1_01', 'jelly_score_v1', 1); eq(v.best.score, 12500); eq(st.levels.c1_01.records['jelly_score_v1|r1'].plays, 5);
});
test('assisted vs no-tool bests are kept separately', () => {
  const st = P.fresh();
  P.recordLevel(st, run({ score: 20000, assisted: true }));
  let o = P.recordLevel(st, run({ score: 15000, assisted: false })); eq([o.isNewBest, o.isNewNoTool], [false, true]);
  o = P.recordLevel(st, run({ score: 30000, assisted: true })); eq([o.isNewBest, o.isNewNoTool], [true, false]);
  const v = P.levelView(st, 'c1_01', 'jelly_score_v1', 1); eq([v.best.score, v.best.assisted, v.noTool.score], [30000, true, 15000]);
});
test('bests are separated by scoreVersion and contentRevision', () => {
  const st = P.fresh(); P.recordLevel(st, run({ score: 50000 }));
  let o = P.recordLevel(st, run({ score: 100, contentRevision: 2 })); eq([o.isNewBest, o.prevBest], [true, null]);
  o = P.recordLevel(st, run({ score: 100, scoreVersion: 'jelly_score_v2' })); eq([o.isNewBest, o.prevBest], [true, null]);
  eq(P.levelView(st, 'c1_01', 'jelly_score_v1', 2).best.score, 100); eq(P.levelView(st, 'c1_01', 'jelly_score_v1', 1).otherVersions.length, 2);
});
test('chapter flow unlock: first open, next opens after the previous is cleared, replays allowed', () => {
  const st = P.fresh(), ids = ['a', 'b', 'c'];
  eq(P.unlocked(st, ids), { a: true, b: false, c: false });
  P.recordLevel(st, run({ levelId: 'a', won: false })); eq(P.unlocked(st, ids).b, false);
  P.recordLevel(st, run({ levelId: 'a' })); eq(P.unlocked(st, ids), { a: true, b: true, c: false });
});
const CFG = { challengeId: 'ch_special', configKey: 'ch_special|r1|jelly_rules_v1|jelly_score_v1|mulberry32|seed=4242' };
test('challenge ranking: valid clears only; score desc → moves left desc → tie; unfinished never outranks a clear', () => {
  const st = P.fresh(), R = (s, m, extra) => P.recordChallenge(st, CFG, Object.assign({ won: true, valid: true, score: s, movesLeft: m, seed: 4242 }, extra || {}));
  let o = R(50000, 3); eq([o.valid, o.rank, o.isNewBest], [true, 1, true]);
  o = P.recordChallenge(st, CFG, { won: false, valid: true, score: 999999, movesLeft: 0 }); eq([o.valid, o.reason], [false, 'not_cleared']);
  o = P.recordChallenge(st, CFG, { won: true, valid: false, score: 999999, movesLeft: 9 }); eq([o.valid, o.reason], [false, 'invalid']);
  o = R(50000, 5); eq([o.rank, o.isNewBest], [1, true]);
  o = R(50000, 5); eq([o.rank, o.isNewBest], [1, false], 'exact tie shares rank 1');
  o = R(60000, 0); eq([o.rank, o.isNewBest], [1, true]);
  const v = P.challengeView(st, CFG.challengeId, CFG.configKey);
  eq(v.ranked.map(x => [x.rank, x.rec.score, x.rec.movesLeft, x.tie]), [[1, 60000, 0, false], [2, 50000, 5, true], [2, 50000, 5, true], [4, 50000, 3, false]]);
  eq(v.attempts, 6); eq(v.bestUnfinished.score, 999999);
});
test('challenge records keep the top ' + P.KEEP + ' and are separated by the fixed config key', () => {
  const st = P.fresh(); for (let i = 0; i < 15; i++) P.recordChallenge(st, CFG, { won: true, valid: true, score: 1000 * i, movesLeft: 1 });
  const v = P.challengeView(st, CFG.challengeId, CFG.configKey); eq(v.ranked.length, P.KEEP); eq(v.ranked[0].rec.score, 14000);
  const o = P.recordChallenge(st, { challengeId: CFG.challengeId, configKey: CFG.configKey.replace('r1', 'r2') }, { won: true, valid: true, score: 1, movesLeft: 0 });
  eq([o.rank, o.isNewBest, o.prevBest], [1, true, null]); eq(P.challengeView(st, CFG.challengeId, CFG.configKey).otherConfigs, 1);
});
test('store purity: no DOM / timers / Math.random / Date.now in progress_store.js', () => {
  const src = require('fs').readFileSync(require.resolve('../js/progress_store.js'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
  ['document.', 'window.', 'setTimeout', 'Math.random', 'Date.now', 'new Date'].forEach(k => { if (src.includes(k)) throw new Error(k); });
});
const f = results.filter(r => !r.ok).length; console.log('\n' + (results.length - f) + ' passed, ' + f + ' failed'); process.exit(f ? 1 : 0);
