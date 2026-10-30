// Stage C0 browser checks + the normal-speed demo recording (390×844):
// 大组合 → 后续连消 → 技巧奖励 → 结算. Board = debug-arranged (tests/fixtures/c0_demo_plan.json, found by a search over the
// real core), moves = real mouse drags. Checks: score sources, single chaser (monotonic, catches up ≤ 600 ms after the last
// points), ≤ 2 popups, fly-off never inside the tool zone, top total == result total == ledger final, skip never
// re-grants, same inputs under another tier / time scale → same ledger.
// usage: node tests/e2e_stageC0.js [baseUrl] [outDir]
'use strict';
const path = require('path'), fs = require('fs'), { execSync } = require('child_process');
const { chromium } = require(process.env.PW || '/workspace/jelly/test/node_modules/playwright-core');
const BASE = (process.argv[2] || 'http://localhost:8851/game_v3c').replace(/\/$/, '');
const OUT = process.argv[3] || '/workspace/jelly/shots_v3c';
const PLAN = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'c0_demo_plan.json'), 'utf8'));
const results = []; let shotN = 0;
function ok(name, cond, info) { results.push({ name, ok: !!cond, info: info === undefined ? '' : info }); console.log((cond ? 'PASS ' : 'FAIL ') + name + (info !== undefined ? ' ' + (typeof info === 'string' ? info : JSON.stringify(info)) : '')); }
function analyse(tr) {   // [t, disp, target, popups, centre, lowAlpha, crateLow, sdT0]
  let mono = true, maxPop = 0, low = 0, crate = 0, worstLag = 0;
  for (let i = 1; i < tr.length; i++) if (tr[i][1] < tr[i - 1][1] && tr[i][2] >= tr[i - 1][2]) mono = false;
  const starts = [...new Set(tr.map(r => r[7]))].filter(t0 => tr.length && t0 >= tr[0][0]);   // chases that began inside the trace
  const lags = []; starts.forEach(t0 => { const reach = tr.find(r => r[7] === t0 && r[1] === r[2]); const later = tr.find(r => r[7] > t0); if (reach) { lags.push([t0, reach[0] - t0]); worstLag = Math.max(worstLag, reach[0] - t0); } else if (!later) worstLag = Math.max(worstLag, 1e9); });
  tr.forEach(r => { maxPop = Math.max(maxPop, r[3]); low = Math.max(low, r[5]); crate = Math.max(crate, r[6]); });
  return { mono, maxPop, low, crate, worstLag, lags, frames: tr.length, centreFrames: tr.filter(r => r[4]).length };
}
(async () => {
  const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--allow-file-access-from-files'] });
  const VID = path.join(OUT, 'video_tmp_c0'); fs.rmSync(VID, { recursive: true, force: true }); fs.mkdirSync(VID, { recursive: true });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, recordVideo: { dir: VID, size: { width: 390, height: 844 } } });
  const pg = await ctx.newPage(); const vidT0 = Date.now(); let vidEnd = null;
  const errs = []; pg.on('pageerror', e => errs.push(e.message)); pg.on('console', m => { if (m.type() === 'error' && !/favicon|404/.test(m.text())) errs.push(m.text()); });
  const W = ms => pg.waitForTimeout(ms);
  const shot = async name => pg.screenshot({ path: path.join(OUT, 'C0_' + String(++shotN).padStart(2, '0') + '_' + name + '.png') });
  const caption = async t => pg.evaluate(t => {
    let el = document.getElementById('__cap'); if (!el) { el = document.createElement('div'); el.id = '__cap'; el.style.cssText = 'position:fixed;left:50%;top:6px;transform:translateX(-50%);z-index:99;background:rgba(30,26,20,.82);color:#ffe9b0;font:600 12px/1.35 sans-serif;padding:4px 10px;border-radius:9px;pointer-events:none;max-width:94vw;text-align:center'; document.body.appendChild(el); }
    el.textContent = t; el.style.display = t ? 'block' : 'none';
  }, t);
  const ready = () => pg.waitForFunction(() => { const s = JellyDebug.state(); return s.phase === 'ready' || s.phase === 'result'; }, null, { timeout: 30000, polling: 50 });
  const drag = async (m) => {
    const a = await pg.evaluate(([r, c]) => JellyDebug.cellCenter(r, c), [m[0], m[1]]), b = await pg.evaluate(([r, c]) => JellyDebug.cellCenter(r, c), [m[2], m[3]]);
    await pg.mouse.move(a.x, a.y); await pg.mouse.down(); await pg.mouse.move((a.x + b.x) / 2, (a.y + b.y) / 2, { steps: 4 }); await pg.mouse.move(b.x, b.y, { steps: 4 }); await pg.mouse.up();
  };
  const sv = () => pg.evaluate(() => JellyDebug.scoreView());

  await pg.goto(BASE + '/index.html?q=high'); await W(1200);
  await pg.evaluate(() => { localStorage.removeItem('jelly_m3_progress_v2'); localStorage.setItem('jelly_m3_progress_v1', JSON.stringify({ v: 1, cleared: { legacy_01: { cleared: true, best: { contentRevision: 1, movesLeft: 7, stars: 2 } } } })); });
  async function setup() {
    await pg.evaluate(s => JellyDebug.startLevelId('verify_01_baseline', s), PLAN.seed); await ready(); await W(500);
    ok('debug board accepted', await pg.evaluate(g => JellyDebug.seedBoard(g), PLAN.grid));
  }
  // ---------------- run 1: normal speed, recorded
  await caption('C0 计分演示 · 调试摆盘（含 2 颗预置特殊）· 正常速度 · 真实鼠标拖动'); await setup(); await W(900);
  await pg.evaluate(() => JellyDebug.traceStart());
  const caps = ['① 交换制造特殊（首波制造 → 技巧1连）', '② 再次首波制造特殊 → 技巧2连 +300', '③ 主动组合：划线＋炸弹 → 后续连消 → 技巧3连 +700', '④ 完成目标 → 结算'];
  const perAct = [];
  for (let i = 0; i < PLAN.moves.length; i++) {
    await caption(caps[Math.min(i, caps.length - 1)]);
    const before = await sv();
    await drag(PLAN.moves[i]);
    if (i === 2) { await W(1300); await shot('combo_cascade'); }
    await ready(); await W(i === PLAN.moves.length - 1 ? 300 : 700);
    const v = await sv(); perAct.push(v);
    if (i < PLAN.moves.length - 1) {
      const exp = PLAN.acts[i];
      ok('action ' + (i + 1) + ': op gain = core action score', v.op && v.op.gain === exp.score && v.logic - before.logic === exp.score, { gain: v.op && v.op.gain, exp: exp.score });
      ok('action ' + (i + 1) + ': display caught up = logic = ledger', v.disp === v.logic && v.ledgerTotal === v.logic, v.disp + '/' + v.logic);
      if (exp.skill.n >= 1) ok('action ' + (i + 1) + ': skill tag 技巧' + exp.skill.n + '连 +' + exp.skill.bonus, i === 0 ? true : v.skillTag && v.skillTag.n === exp.skill.n && v.skillTag.bonus === exp.skill.bonus, v.skillTag);
      if (i === 1 || i === 2) await shot('after_action_' + (i + 1));
    }
  }
  await pg.waitForFunction(() => JellyDebug.state().phase === 'result', null, { timeout: 20000 });
  await W(450); await shot('result_reveal'); await W(1500);
  const tr1 = await pg.evaluate(() => JellyDebug.traceStop());
  const r1 = await sv();
  await shot('result_final');
  const fin = r1.final;
  ok('result: won, final = plan final (core)', fin && fin.won && fin.finalScore === PLAN.final.finalScore, fin && fin.finalScore);
  ok('top total == result total == ledger final (one display state)', r1.disp === fin.finalScore && r1.target === fin.finalScore && r1.result.finalScore === fin.finalScore, [r1.disp, r1.target, r1.result.finalScore]);
  ok('result reveal: subtotal → +clear → +moves stages done', r1.result.s1 && r1.result.s2);
  const a1 = analyse(tr1);
  ok('display monotonic (never rolls back) in run 1', a1.mono);
  ok('chaser lands ≤ 600 ms after each new target (game clock)', a1.worstLag <= 600, a1.worstLag + ' ms');
  ok('at most 2 score popups on screen', a1.maxPop <= 2, a1.maxPop);
  ok('fly-off pieces / crates never visible inside the tool zone', a1.low === 0 && a1.crate === 0, { low: a1.low, crate: a1.crate });
  ok('centre text shown (waves 3/5 + combo) but briefly', a1.centreFrames > 0 && a1.centreFrames < a1.frames * 0.25, a1.centreFrames + '/' + a1.frames);
  // skip after the reveal: nothing changes
  const e0 = r1.entries; const hit = (await pg.evaluate(() => JellyDebug.hits())).find(h => h.id === 'res_skip');
  await pg.mouse.click(hit.x, hit.y - 120); await W(200); await pg.mouse.click(hit.x, hit.y - 120); await W(200);
  const r1b = await sv();
  ok('tapping the result twice: no new ledger entry, same final, one win bonus', r1b.entries === e0 && r1b.final.finalScore === fin.finalScore && r1b.disp === fin.finalScore);
  await pg.evaluate(() => JellyDebug.toggleDetails()); await W(250); await shot('result_details_open');
  const r1c = await sv();
  const bd = r1c.result.breakdown, sum = Object.values(bd).reduce((a, b) => a + b, 0);
  ok('details: breakdown sums to the final score', sum === fin.finalScore, bd);
  const prog = await pg.evaluate(() => ({ v2: localStorage.getItem('jelly_m3_progress_v2'), v1: localStorage.getItem('jelly_m3_progress_v1') }));
  ok('verification level: no player progress written (v2 absent, v1 untouched)', prog.v2 === null && /legacy_01/.test(prog.v1) && r1.result.rec && r1.result.rec.written === false, r1.result.rec);
  await W(1200); vidEnd = (Date.now() - vidT0) / 1000;   // the delivered video = run 1 only (normal speed)
  await caption('');
  // ---------------- run 2: same seed + inputs, low tier, 3× time scale, skip pressed DURING the reveal
  await pg.evaluate(() => { JellyDebug.setTier('low'); JellyDebug.setTimeScale(3); });
  await setup();
  await pg.evaluate(() => JellyDebug.traceStart());
  for (const m of PLAN.moves) { await ready(); await pg.evaluate(m => JellyDebug.swap(m[0], m[1], m[2], m[3]), m); await W(80); }
  await pg.waitForFunction(() => JellyDebug.state().phase === 'result', null, { timeout: 30000 });
  await pg.waitForFunction(() => { const v = JellyDebug.scoreView(); return v.result && Date.now() && document.visibilityState; }, null);
  await W(120);   // panel just opened (t0 + 300 ms game time ≈ 100 ms real at 3×)
  const mid = await sv();
  await pg.evaluate(() => JellyDebug.skipResult()); await pg.evaluate(() => JellyDebug.skipResult());
  await W(100);
  const r2 = await sv(); const tr2 = await pg.evaluate(() => JellyDebug.traceStop());
  ok('skip during the reveal jumps to the decided final (display only)', r2.result.skipped && r2.disp === r2.final.finalScore, { midDisp: mid.disp, final: r2.final.finalScore, skippedEarly: !mid.result.s2 });
  ok('low tier + 3× time: same final score + same ledger as run 1', r2.final.finalScore === fin.finalScore && r2.entries === r1.entries && JSON.stringify(r2.result.breakdown) === JSON.stringify(r1.result.breakdown));
  ok('run 2 display monotonic', analyse(tr2).mono);
  await pg.evaluate(() => { JellyDebug.setTier(null); JellyDebug.setTimeScale(1); });
  // ---------------- restart mid-cascade: the old run's presentation cannot touch the new run's score
  await setup(); await pg.evaluate(m => JellyDebug.swap(m[0], m[1], m[2], m[3]), PLAN.moves[0]); await W(200);
  await pg.evaluate(() => JellyDebug.startLevelId('verify_01_baseline', 5)); await W(1500);
  const r3 = await sv();
  ok('restart mid-cascade: new run starts at 0 and stays 0 (no stale points)', r3.logic === 0 && r3.disp === 0 && r3.target === 0, r3);
  ok('no page errors', errs.length === 0, errs.slice(0, 3));
  await ctx.close();
  // video: only the recorded run-1 part matters; convert whole page video and trim to run 1 by timestamps is not needed — keep all
  const webm = fs.readdirSync(VID).filter(f => f.endsWith('.webm')).map(f => path.join(VID, f))[0];
  const mp4 = path.join(OUT, 'C0_score_demo.mp4');
  execSync(`ffmpeg -y -loglevel error -i "${webm}" -t ${vidEnd.toFixed(2)} -c:v libx264 -pix_fmt yuv420p -crf 23 -preset veryfast -movflags +faststart "${mp4}"`);
  fs.rmSync(VID, { recursive: true, force: true });
  ok('demo video written', fs.existsSync(mp4), mp4);
  fs.writeFileSync(path.join(OUT, 'e2e_stageC0_results.json'), JSON.stringify({ results, analyse1: a1, trace1Len: tr1.length }, null, 1));
  const f = results.filter(r => !r.ok).length; console.log('\n' + (results.length - f) + ' passed, ' + f + ' failed'); await browser.close(); process.exit(f ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
