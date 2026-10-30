// Diagnostic bots (V1 §13.1): random-legal and simple goal-first strategies over fixed seed sets, headless, through the
// real rules core (no tools used — off-board tools are never touched, so results are "no-tool" runs).
// Bot win rates are NOT player pass rates, and a bot failing a level does not prove it unsolvable.
//   node tools/bots.js [--levels a,b|--chapters ch1,ch2|--formal] [--seeds N] [--strategies random_legal,goal_greedy] [--out file] [--jobs 8]
'use strict';
const fs = require('fs'), path = require('path'), { fork } = require('child_process');
const Core = require('../js/rules_core.js');
const STRATS = {
  random_legal: { version: 1, desc: 'uniform random choice among Core.listMoves (bot RNG = mulberry32(hash(strategy|seed)), independent of game streams)' },
  goal_greedy: { version: 1, desc: '1-step lookahead on a cloned state: maximise 1000×goal progress (capped by what is left) + 300×won + 0.05×points; ties by bot RNG. NOTE: the clone includes the refill stream, so the lookahead sees the real refills of that step (a peeking advantage a player does not have)' }
};
function botRng(name, seed) { const r = { s: Core.hashStr(name + '|' + seed) }; return () => Core.rnext(r); }
function goalSum(st) { let s = 0; st.goals.forEach((g, i) => { s += Math.min(g.progress, g.target); }); return s; }
function pick(st, strat, rnd) {
  const mv = Core.listMoves(st); if (!mv.length) return null;
  if (strat === 'random_legal') return mv[Math.floor(rnd() * mv.length)];
  let best = -1e18, bestM = [], g0 = goalSum(st), s0 = st.score;
  for (const m of mv) {
    const c = Core.clone(st), res = Core.apply(c, { type: 'swap', r1: m[0], c1: m[1], r2: m[2], c2: m[3] });
    if (!res.ok) continue;
    const v = 1000 * (goalSum(c) - g0) + (c.phase === 'won' ? 300000 : 0) + 0.05 * (c.score - s0);
    if (v > best + 1e-9) { best = v; bestM = [m]; } else if (Math.abs(v - best) <= 1e-9) bestM.push(m);
  }
  return bestM.length ? bestM[Math.floor(rnd() * bestM.length)] : mv[0];
}
function runOne(def, seed, strat) {
  const st = Core.createGame(def, { seed }), rnd = botRng(strat, seed), acts = [];
  let shuffles = 0, guard = 0;
  while (st.phase === 'ready' && guard++ < 400) {
    const m = pick(st, strat, rnd); if (!m) break;
    const res = Core.apply(st, { type: 'swap', r1: m[0], c1: m[1], r2: m[2], c2: m[3] });
    if (!res.ok) break;
    acts.push(m.join(''));
    res.events.forEach(e => { if (e.t === 'shuffle' && e.auto) shuffles++; });
  }
  const fin = st.scoring.final || null;
  return { seed, won: st.phase === 'won', phase: st.phase, movesUsed: def.moveLimit - st.moves, movesLeft: st.moves, score: st.score,
    actionTotal: fin ? fin.actionTotal : st.score, maxCascade: st.scoring.maxCascade, maxStreak: st.scoring.maxStreak, shuffles,
    goalsLeft: st.goals.reduce((a, g, i) => a + Core.goalLeft(st, i), 0), actHash: Core.hashStr(acts.join(',')).toString(16) };
}
function q(a, p) { if (!a.length) return null; const s = a.slice().sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(p * (s.length - 1) + 0.5))]; }
function summarize(runs) {
  const w = runs.filter(r => r.won), n = runs.length;
  const mean = a => a.length ? Math.round(a.reduce((x, y) => x + y, 0) / a.length * 10) / 10 : null;
  return { n, wins: w.length, winRate: Math.round(w.length / n * 1000) / 1000, stuck: runs.filter(r => r.phase === 'stuck').length,
    movesUsedWinMean: mean(w.map(r => r.movesUsed)), movesUsedWinP50: q(w.map(r => r.movesUsed), 0.5), movesLeftWinP50: q(w.map(r => r.movesLeft), 0.5),
    scoreWin: { p10: q(w.map(r => r.score), 0.1), p25: q(w.map(r => r.score), 0.25), p50: q(w.map(r => r.score), 0.5), p75: q(w.map(r => r.score), 0.75), p85: q(w.map(r => r.score), 0.85), p90: q(w.map(r => r.score), 0.9) },
    scoreAllP50: q(runs.map(r => r.score), 0.5), goalsLeftLossMean: mean(runs.filter(r => !r.won).map(r => r.goalsLeft)),
    maxCascadeMean: mean(runs.map(r => r.maxCascade)), maxCascadeMax: Math.max.apply(null, runs.map(r => r.maxCascade)), maxStreakMean: mean(runs.map(r => r.maxStreak)), autoShuffles: runs.reduce((a, r) => a + r.shuffles, 0) };
}
// provisional stars (method 'bot_greedy_quantiles_v1'): clear always gives ≥1★ (core rule); bar marks at greedy-win quantiles
// ★1 = p10, ★2 = p35, ★3 = p80 of goal_greedy WINNING final scores, rounded to 100. Needs ≥ 10 greedy wins, else falls back
// to all bots' wins, else 'insufficient_sample' (keeps a formula estimate and is flagged).
function deriveStars(def, sumBy, runsBy) {
  const r100 = v => Math.max(100, Math.round(v / 100) * 100);
  let wins = (runsBy.goal_greedy || []).filter(r => r.won).map(r => r.score), basis = 'goal_greedy wins';
  if (wins.length < 10) { wins = Object.values(runsBy).flat().filter(r => r.won).map(r => r.score); basis = 'all bot wins'; }
  if (wins.length < 10) { const est = 2000 + 500 * Math.round(def.moveLimit * 0.2) + 300 * def.moveLimit; return { stars: [r100(est * 0.6), r100(est), r100(est * 1.4)], method: 'bot_greedy_quantiles_v1', basis: 'insufficient_sample (formula estimate)', sample: wins.length }; }
  let s = [r100(q(wins, 0.1)), r100(q(wins, 0.35)), r100(q(wins, 0.8))];
  if (s[1] <= s[0]) s[1] = s[0] + 100; if (s[2] <= s[1]) s[2] = s[1] + 100;
  return { stars: s, method: 'bot_greedy_quantiles_v1', basis, sample: wins.length };
}
module.exports = { STRATS, runOne, summarize, deriveStars, pick };

if (require.main === module && process.argv[2] === '--child') {
  process.on('message', job => {
    const runs = []; for (let s = 1; s <= job.seeds; s++) runs.push(runOne(job.def, s, job.strat));
    process.send({ id: job.id, strat: job.strat, runs }, () => process.exit(0));
  });
} else if (require.main === module) {
  const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
  let D; if (arg('--src')) { D = { catalog: { chapters: [] }, levels: {} }; fs.readdirSync(arg('--src')).filter(f => f.endsWith('.json')).forEach(f => { const d = JSON.parse(fs.readFileSync(path.join(arg('--src'), f), 'utf8')); D.levels[d.levelId] = d; }); if (!arg('--levels')) process.argv.push('--levels', Object.keys(D.levels).sort().join(',')); }
  else { global.window = {}; require('../levels/levels_data.js'); D = global.window.JELLY_LEVELS; }
  let ids;
  if (arg('--levels')) ids = arg('--levels').split(',');
  else if (arg('--chapters')) ids = D.catalog.chapters.filter(c => arg('--chapters').split(',').includes(c.chapterId)).flatMap(c => c.levels);
  else ids = D.catalog.chapters.filter(c => c.formal).flatMap(c => c.levels);
  const seeds = +arg('--seeds', 100), strats = arg('--strategies', 'random_legal,goal_greedy').split(','), jobsN = +arg('--jobs', 8);
  const out = arg('--out', path.join(__dirname, '..', 'levels', 'bot_report.json'));
  const jobs = []; ids.forEach(id => strats.forEach(st => jobs.push({ id, strat: st, def: D.levels[id], seeds })));
  const res = {}; let running = 0, next = 0, t0 = Date.now();
  function launch() {
    while (running < jobsN && next < jobs.length) {
      const j = jobs[next++], ch = fork(__filename, ['--child']); running++;
      ch.on('message', m => { (res[m.id] = res[m.id] || {})[m.strat] = m.runs; });
      ch.on('exit', () => { running--; if (next < jobs.length) launch(); else if (!running) done(); });
      ch.send(j);
    }
  }
  function done() {
    const rep = { tool: 'tools/bots.js', generatedNote: 'headless bot diagnostics — not player pass rates', coreVersion: Core.CORE_VERSION, rulesetVersion: Core.RULESET, scoreVersion: Core.SCORE_VERSION, rngAlgo: Core.RNG_ALGO,
      strategies: Object.fromEntries(strats.map(s => [s, STRATS[s]])), seeds: { from: 1, to: seeds, n: seeds }, toolsUsed: false, elapsedMs: Date.now() - t0, levels: {} };
    ids.forEach(id => {
      const def = D.levels[id], by = res[id] || {}, sum = {};
      strats.forEach(s => { sum[s] = summarize(by[s] || []); });
      rep.levels[id] = { contentRevision: def.contentRevision, moveLimit: def.moveLimit, summary: sum, provisionalStars: deriveStars(def, sum, by),
        runs: Object.fromEntries(strats.map(s => [s, (by[s] || []).map(r => [r.seed, r.won ? 1 : 0, r.movesUsed, r.score, r.maxCascade, r.actHash])])) };
      console.log(id.padEnd(28), strats.map(s => s + ' ' + (sum[s].winRate * 100).toFixed(0) + '% mv' + sum[s].movesUsedWinP50 + ' sc' + sum[s].scoreWin.p50).join(' | '), '★', rep.levels[id].provisionalStars.stars.join('/'));
    });
    fs.writeFileSync(out, JSON.stringify(rep, null, 1)); console.log('wrote', out, (rep.elapsedMs / 1000).toFixed(1) + 's');
  }
  launch();
}
