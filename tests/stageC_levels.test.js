// Stage C content checks: catalog v2 (5 formal chapters × 6), every formal level / challenge validates (0 A / 0 B),
// carries its design intent + chapter role, provisional bot-derived stars, and the 3 challenges have a frozen, reproducible config.
'use strict';
const fs = require('fs'), path = require('path');
global.window = {}; require('../levels/levels_data.js');
const D = window.JELLY_LEVELS, S = require('../js/level_schema.js'), Core = require('../js/rules_core.js');
const results = []; function ok(n, c, i) { results.push({ name: n, ok: !!c, info: i }); console.log((c ? 'PASS ' : 'FAIL ') + n + (i !== undefined ? ' ' + JSON.stringify(i) : '')); }
const F = D.catalog.chapters.filter(c => c.formal), ids = F.flatMap(c => c.levels);
ok('catalog v2: 5 formal chapters × 6 levels, in order', D.catalog.catalogVersion === 2 && F.map(c => c.chapterId).join() === 'ch1,ch2,ch3,ch4,ch5' && F.every(c => c.levels.length === 6) && D.catalog.chapters.indexOf(F[0]) === 0);
ok('dev/verification chapters are not formal', D.catalog.chapters.filter(c => !c.formal).every(c => !c.levels.some(id => /^c\d_/.test(id))) && D.catalog.chapters.filter(c => !c.formal).length === 4);
const bad = [];
ids.concat(D.catalog.challenges.map(c => c.levelId)).forEach(id => { const v = S.validate(D.levels[id], { seeds: 20 }); if (v.counts.error || v.counts.block || v.sim.initOk !== 20) bad.push([id, v.counts, v.sim.initOk]); });
ok('all 33 validate: 0 A / 0 B, init 20/20', bad.length === 0, bad);
ok('every formal level: intent + chapterRole; teaching levels have a player tip', ids.every(id => { const n = D.levels[id].editorNotes; return n.designIntent && n.intendedDifficulty && n.chapterRole && (n.chapterRole !== 'teach' || n.playerTip); }));
const roles = F.map(c => c.levels.map(id => D.levels[id].editorNotes.chapterRole));
ok('each chapter has teaching, a chapter challenge and a relax level', roles.every(r => r.includes('teach') && r.includes('challenge') && r.includes('relax')), roles);
ok('stars: provisional, bot-derived, method + basis recorded, increasing', ids.concat(D.catalog.challenges.map(c => c.levelId)).every(id => { const s = D.levels[id].scoring; return s.starsStatus === 'provisional_bot_derived' && s.starsMethod && s.starsBasis && s.scoreVersion === Core.SCORE_VERSION && s.stars[0] < s.stars[1] && s.stars[1] < s.stars[2]; }));
const C = D.catalog.challenges;
ok('3 challenges: special / obstacle / delivery', C.map(c => c.focus).join() === 'special,obstacle,delivery');
ok('challenges: no tools, no extra moves, not in any chapter', C.every(c => Object.values(D.levels[c.levelId].tools).every(n => n === 0) && c.tools === 0 && c.extraMoves === 0 && !D.catalog.chapters.some(ch => ch.levels.includes(c.levelId))));
ok('configKey carries mode/challengeId/levelId/revision/content/ruleset/score/rng/seed/moves/initial hash', C.every(c => { const k = c.configKey.split('|'); return k[0] === 'challenge' && k[1] === c.challengeId && k[2] === c.levelId && k.includes('r' + c.contentRevision) && k.includes('c' + c.playHash) && k.includes(Core.RULESET) && k.includes(Core.SCORE_VERSION) && k.includes(Core.RNG_ALGO) && k.includes('seed' + c.seed) && k.includes('init' + c.initHash); }));
ok('challenge start is reproducible: same seed → same initial hash (twice)', C.every(c => { const a = Core.createGame(D.levels[c.levelId], { seed: c.seed }), b = Core.createGame(D.levels[c.levelId], { seed: c.seed }); return Core.stateHash(a) === c.initHash && Core.stateHash(b) === c.initHash; }));
ok('different seeds give a different start (seed is meaningful)', C.every(c => Core.stateHash(Core.createGame(D.levels[c.levelId], { seed: c.seed + 1 })) !== c.initHash));
const B = require('../levels/bot_report.json');
ok('bot report: strategy names + versions, seeds, sample size per level', B.strategies.random_legal.version && B.strategies.goal_greedy.version && B.seeds.n === 100 && ids.every(id => B.levels[id] && B.levels[id].summary.goal_greedy.n === 100 && B.levels[id].summary.random_legal.n === 100));
const pass = results.filter(r => r.ok).length;
fs.mkdirSync(path.join(__dirname, 'out'), { recursive: true }); fs.writeFileSync(path.join(__dirname, 'out', 'stageC_levels_results.json'), JSON.stringify({ pass, fail: results.length - pass, results }, null, 1));
console.log(`\n${pass} passed, ${results.length - pass} failed`); process.exit(pass === results.length ? 0 : 1);
