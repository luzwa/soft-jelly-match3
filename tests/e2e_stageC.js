// Stage C1/C2 end-to-end (real browser, 390×844, real mouse drags on the board and real clicks on the DOM level select):
// 默认入口=选关 → v1 进度迁移（旧键原样保留）→ 只开第 1 关 → 关前目标预览（目标/步数/提示）→ 真实拖动通关 → 首通写入 v2、
// 顶部总分 == 结算总分 → “下一关” → 选关页星级/最佳 → 调试介入的局不写进度 → 章节最后一关 → 章节完成页 → 下一章 →
// 固定条件挑战：无道具、固定 seed、开局哈希一致 → 有效成绩入本地榜 → 同 seed 同输入再挑战 = 同分并列 → 调试局不入榜 →
// ?level= 直达 → 读不懂的存档只读不覆盖。  usage: node tests/e2e_stageC.js [baseUrl] [outDir] [--video]
'use strict';
const path = require('path'), fs = require('fs'), { execSync } = require('child_process');
const { chromium } = require(process.env.PW || '/workspace/jelly/test/node_modules/playwright-core');
const ROOT = path.join(__dirname, '..');
const BASE = (process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : ('file://' + ROOT)).replace(/\/$/, '');
const OUT = process.argv[3] && !process.argv[3].startsWith('--') ? process.argv[3] : '/workspace/jelly/shots_v3c/stageC';
const VIDEO = process.argv.includes('--video');
fs.mkdirSync(OUT, { recursive: true });
const VID = path.join(OUT, 'video_tmp'); if (VIDEO) { fs.rmSync(VID, { recursive: true, force: true }); fs.mkdirSync(VID, { recursive: true }); }
const results = []; let shotN = 0;
function ok(name, cond, info) { results.push({ name, ok: !!cond, info: info === undefined ? '' : info }); console.log((cond ? 'PASS ' : 'FAIL ') + name + (info !== undefined ? ' ' + (typeof info === 'string' ? info : JSON.stringify(info)) : '')); }
const V1 = JSON.stringify({ v: 1, cleared: { legacy_01: { cleared: true, best: { contentRevision: 1, movesLeft: 3, stars: 2 } } } });

(async () => {
  const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--allow-file-access-from-files'] });
  const ctx = await browser.newContext(Object.assign({ viewport: { width: 390, height: 844 }, deviceScaleFactor: VIDEO ? 1 : 2 }, VIDEO ? { recordVideo: { dir: VID, size: { width: 390, height: 844 } } } : {}));
  const pg = await ctx.newPage();
  const errs = []; pg.on('pageerror', e => errs.push(e.message)); pg.on('console', m => { if (m.type() === 'error' && !/favicon|404/.test(m.text())) errs.push(m.text()); });
  const W = ms => pg.waitForTimeout(ms);
  const shot = async n => { shotN++; await pg.screenshot({ path: path.join(OUT, 'C1_' + String(shotN).padStart(2, '0') + '_' + n + '.png') }); };
  const st = () => pg.evaluate(() => JellyDebug.state());
  const menu = () => pg.evaluate(() => JellyDebug.menu());
  const prog = () => pg.evaluate(() => JSON.parse(localStorage.getItem('jelly_m3_progress_v2') || 'null'));
  const waitPhase = (re, ms = 30000) => pg.waitForFunction(r => new RegExp(r).test(JellyDebug.state().phase), re.source, { timeout: ms, polling: 100 });
  async function drag(m) {
    const a = await pg.evaluate(([r, c]) => JellyDebug.cellCenter(r, c), m[0]), b = await pg.evaluate(([r, c]) => JellyDebug.cellCenter(r, c), m[1]);
    await pg.mouse.move(a.x, a.y); await pg.mouse.down(); await pg.mouse.move(b.x, b.y, { steps: 5 }); await pg.mouse.up();
  }
  async function play(maxMoves = 40, record) {   // real drags; the move is picked by a 1-step lookahead helper (read-only)
    const moves = [];
    for (let i = 0; i < maxMoves; i++) {
      await waitPhase(/^(ready|result)$/, 40000);
      if ((await st()).phase === 'result') break;
      const m = record ? record[i] : await pg.evaluate(() => JellyDebug.greedyMove());
      if (!m) break; moves.push(m); await drag(m); await W(250);
    }
    await waitPhase(/^result$/, 40000); await W(1600);
    return moves;
  }
  async function clickHit(id) { const h = (await pg.evaluate(() => JellyDebug.hits())).find(x => x.id === id); if (!h) return false; await pg.mouse.click(h.x, h.y); return true; }

  // ---- A. default entry = level select; v1 progress migrated (old key untouched)
  await pg.goto(BASE + '/index.html'); await pg.evaluate(v1 => { localStorage.clear(); localStorage.setItem('jelly_m3_progress_v1', v1); }, V1);
  await pg.goto(BASE + '/index.html'); await pg.waitForFunction(() => window.JellyDebug && JellyDebug.menu().visible, null, { timeout: 30000 }); await W(400);
  let m0 = await menu(), p0 = await pg.evaluate(() => JellyDebug.progress());
  const lv = await pg.$$eval('#jm button[data-lv]', bs => bs.map(b => ({ id: b.dataset.lv, en: !b.disabled })));
  ok('entry: level select shown by default, 5 formal chapters × 6', m0.visible && m0.screen === 'select' && lv.length === 30, { n: lv.length });
  ok('chapter flow: only 1-1 is open at first', lv.filter(x => x.en).map(x => x.id).join() === 'c1_01', lv.filter(x => x.en).map(x => x.id));
  ok('progress: v1 migrated into v2 namespace (legacy level kept, not formal)', p0.source === 'migrated_v1' && p0.state.levels.legacy_01 && p0.state.levels.legacy_01.legacy, p0.source);
  ok('progress: migration note shown', /已从旧版进度迁移/.test(await pg.textContent('#jm')));
  await shot('select_fresh');
  // ---- B. pre-level goal preview
  await pg.click('#jm button[data-lv="c1_01"]'); await W(350);
  const pv = await pg.evaluate(() => ({ t: document.querySelector('#jm .card').innerText, imgs: [...document.querySelectorAll('#jm .goal img')].map(i => i.naturalWidth) }));
  ok('preview: goal icon + count, moves, provisional stars, tip', pv.imgs.length === 1 && pv.imgs[0] > 0 && /×8/.test(pv.t) && /步数\s*12/.test(pv.t) && /暂定/.test(pv.t) && /河豚/.test(pv.t), pv.t.replace(/\n/g, ' | '));
  await shot('preview_1_1');
  await pg.click('#jm button[data-act="play"]'); await waitPhase(/^ready$/);
  let s = await st(), mm = await menu();
  ok('start: 1-1 running, formal, menu hidden', s.levelId === 'c1_01' && !mm.visible && !mm.open && (await pg.evaluate(() => JellyDebug.formal())), s.levelId);
  // ---- C. real play to the end
  await play(12);
  let sv = await pg.evaluate(() => JellyDebug.scoreView()); s = await st();
  ok('1-1 won by real drags', sv.result && sv.result.win, sv.result && sv.result.finalScore);
  ok('result: first clear written to v2, top total == result total', sv.result.rec.written && sv.result.rec.firstClear && sv.result.rec.isNewBest && sv.disp === sv.result.finalScore && s.score === sv.result.finalScore, { rec: sv.result.rec, disp: sv.disp });
  let p1 = await prog();
  ok('progress v2: best per scoreVersion|contentRevision', p1.levels.c1_01.cleared && p1.levels.c1_01.records['jelly_score_v1|r1'].best.score === sv.result.finalScore);
  await shot('result_1_1');
  // ---- D. next level
  ok('result: "下一关" goes to 1-2', await clickHit('res_primary')); await waitPhase(/^ready$/); s = await st();
  ok('next: 1-2 running', s.levelId === 'c1_02', s.levelId);
  // pause → 返回选关
  await clickHit('back'); await W(450); ok('pause: 返回选关 link', await clickHit('m_menu')); await W(400);
  m0 = await menu();
  const lv2 = await pg.$$eval('#jm button[data-lv]', bs => bs.filter(b => !b.disabled).map(b => ({ id: b.dataset.lv, stars: b.querySelector('.st').childNodes.length ? [...b.querySelector('.st').childNodes].filter(n => n.nodeType === 3).map(n => n.textContent).join('').length : 0 })));
  ok('select: 1-1 cleared with stars, 1-2 open, 1-3 locked', m0.visible && lv2.map(x => x.id).join() === 'c1_01,c1_02' && lv2[0].stars >= 1 && lv2[1].stars === 0, lv2);
  await pg.click('#jm button[data-lv="c1_01"]'); await W(300);
  const pv2 = await pg.textContent('#jm .card');
  ok('preview: shows the current-version best', pv2.includes(String(sv.result.finalScore)), pv2.replace(/\s+/g, ' ').slice(0, 120));
  await shot('select_after_1_1');
  await pg.click('#jm button[data-act="back"]'); await W(200);
  // ---- E. a debug-tainted run never writes
  await pg.click('#jm button[data-lv="c1_02"]'); await W(250); await pg.click('#jm button[data-act="play"]'); await waitPhase(/^ready$/);
  const before = JSON.stringify(await prog());
  await pg.evaluate(() => JellyDebug.setMoves(1)); await play(2);
  sv = await pg.evaluate(() => JellyDebug.scoreView());
  ok('debug-tainted run: nothing written', sv.result.rec.written === false && sv.result.rec.why === 'debug' && JSON.stringify(await prog()) === before, sv.result.rec);
  // ---- F. chapter end → chapter complete → next chapter
  await pg.evaluate(() => { const p = JSON.parse(localStorage.getItem('jelly_m3_progress_v2')); ['c1_02', 'c1_03', 'c1_04', 'c1_05'].forEach(id => { p.levels[id] = { cleared: true, records: {}, legacy: null }; }); localStorage.setItem('jelly_m3_progress_v2', JSON.stringify(p)); });
  await pg.goto(BASE + '/index.html'); await pg.waitForFunction(() => window.JellyDebug && JellyDebug.menu().visible, null, { timeout: 30000 }); await W(300);
  const nextCls = await pg.$eval('#jm button[data-lv="c1_06"]', b => b.className);
  ok('select: last level of chapter 1 is the next one', /next/.test(nextCls), nextCls);
  await pg.click('#jm button[data-lv="c1_06"]'); await W(250); await pg.click('#jm button[data-act="play"]'); await waitPhase(/^ready$/);
  await play(22);
  sv = await pg.evaluate(() => JellyDebug.scoreView());
  ok('1-6 won', sv.result.win, sv.result.finalScore);
  await clickHit('res_primary'); await W(400); m0 = await menu();
  const cd = await pg.textContent('#jm');
  ok('chapter complete screen (no out-of-range next level)', m0.screen === 'chapter' && /完成/.test(cd) && /6\/6/.test(cd), cd.replace(/\s+/g, ' ').slice(0, 80));
  await shot('chapter_complete');
  await pg.click('#jm button[data-act="play"]'); await waitPhase(/^ready$/); s = await st();
  ok('chapter complete → 下一章 starts 2-1', s.levelId === 'c2_01', s.levelId);
  // ---- G. fixed-condition challenge
  await pg.evaluate(() => JellyDebug.openMenu('chal')); await W(300); await shot('challenges_empty');
  await pg.click('#jm button[data-chal="chal_special"]'); await waitPhase(/^ready$/);
  const c0 = await pg.evaluate(() => ({ m: JellyDebug.menu(), c: JellyDebug.core(), cfg: JellyDebug.menuApi() && window.JELLY_LEVELS.catalog.challenges[0] }));
  ok('challenge: fixed seed, no tools, frozen start hash', c0.m.source === 'challenge' && c0.c.seed === c0.cfg.seed && c0.m.initOk && Object.values(c0.c.tools).every(n => n === 0), { seed: c0.c.seed, tools: c0.c.tools, hash: c0.c.hash });
  const startHash = c0.c.hash;
  const rec = await play(20);
  sv = await pg.evaluate(() => JellyDebug.scoreView());
  ok('challenge 1: cleared → valid, local rank 1', sv.result.win && sv.result.rec.challenge && sv.result.rec.valid && sv.result.rec.rank === 1, sv.result.rec);
  const score1 = sv.result.finalScore; await shot('challenge_result');
  await clickHit('res_primary'); await waitPhase(/^ready$/);
  const c1 = await pg.evaluate(() => JellyDebug.core());
  ok('再次挑战: same seed → same start', c1.seed === c0.c.seed && c1.hash === startHash);
  await play(20, rec);
  sv = await pg.evaluate(() => JellyDebug.scoreView());
  ok('challenge 2: same inputs → same score → tie at rank 1', sv.result.rec.valid && sv.result.finalScore === score1 && sv.result.rec.rank === 1 && !sv.result.rec.isNewBest, { s: sv.result.finalScore, rec: sv.result.rec });
  await clickHit('res_second'); await W(400);
  const tbl = await pg.$eval('#jm .chal', c => [...c.querySelectorAll('tr')].map(r => r.innerText.replace(/\s+/g, ' ')));
  ok('challenge list: 2 local entries shown as a tie (并列), no global board', tbl.length === 2 && tbl.every(t => /第 1（并列）/.test(t)) && /没有全球排行榜/.test(await pg.textContent('#jm')), tbl);
  await shot('challenges_ranked');
  // tainted challenge run is never ranked
  await pg.click('#jm button[data-chal="chal_obstacle"]'); await waitPhase(/^ready$/);
  const pc = JSON.stringify((await prog()).challenges);
  await pg.evaluate(() => JellyDebug.setMoves(1)); await play(2);
  sv = await pg.evaluate(() => JellyDebug.scoreView());
  ok('challenge + debug hook: not recorded', sv.result.rec.why === 'debug' && JSON.stringify((await prog()).challenges) === pc, sv.result.rec);
  // ---- H. ?level= bypasses the menu; v1 key never touched
  await pg.goto(BASE + '/index.html?level=c3_02&seed=5'); await pg.waitForFunction(() => window.JellyDebug && JellyDebug.state().phase === 'ready', null, { timeout: 30000 });
  m0 = await menu(); s = await st();
  ok('?level= goes straight into the level (dev / QA entry)', !m0.visible && s.levelId === 'c3_02' && s.seed === 5);
  ok('v1 key untouched', (await pg.evaluate(() => localStorage.getItem('jelly_m3_progress_v1'))) === V1);
  // ---- I. unreadable / newer save → read-only, never overwritten
  await pg.evaluate(() => localStorage.setItem('jelly_m3_progress_v2', JSON.stringify({ v: 99, levels: {}, challenges: {} })));
  await pg.goto(BASE + '/index.html'); await pg.waitForFunction(() => window.JellyDebug && JellyDebug.menu().visible, null, { timeout: 30000 }); await W(300);
  ok('newer save: read-only notice shown', /只读/.test(await pg.textContent('#jm')));
  await shot('readonly_notice');
  await pg.click('#jm button[data-lv="c1_01"]'); await W(250); await pg.click('#jm button[data-act="play"]'); await waitPhase(/^ready$/);
  await play(12);
  ok('newer save: playing does not overwrite it', JSON.parse(await pg.evaluate(() => localStorage.getItem('jelly_m3_progress_v2'))).v === 99);
  ok('no page errors', errs.length === 0, errs.slice(0, 5));
  await pg.close(); await ctx.close(); await browser.close();
  if (VIDEO) {
    const f = fs.readdirSync(VID).filter(x => x.endsWith('.webm'))[0];
    if (f) { execSync(`ffmpeg -y -loglevel error -i "${path.join(VID, f)}" -c:v libx264 -pix_fmt yuv420p -crf 23 -r 30 "${path.join(OUT, 'C1_C2_walkthrough.mp4')}"`); fs.rmSync(VID, { recursive: true, force: true }); }
  }
  const pass = results.filter(r => r.ok).length;
  fs.writeFileSync(path.join(OUT, 'e2e_stageC_results.json'), JSON.stringify({ base: BASE, at: new Date().toISOString(), pass, fail: results.length - pass, results }, null, 1));
  console.log(`\n${pass} passed, ${results.length - pass} failed`); process.exit(pass === results.length ? 0 : 1);
})().catch(e => { console.error(e); process.exit(2); });
